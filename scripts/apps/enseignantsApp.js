import { MODULE_ID } from "../constants.js";
import { FicheApp } from "./ficheApp.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class EnseignantsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-enseignants-app",
    classes: ["hp4-enseignants"],
    window: { title: "Enseignants", resizable: true },
    position: { width: 680, height: 560 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/enseignants.hbs" },
  };

  #view = "list";
  #selectedId = null;

  // ── Store ──────────────────────────────────────────────────────────────────

  static getStore() {
    try {
      const raw = game.settings.get(MODULE_ID, "enseignants-data") ?? {};
      return { matieres: {}, ...raw };
    } catch { return { matieres: {} }; }
  }

  static async saveStore(store) {
    await game.settings.set(MODULE_ID, "enseignants-data", store);
  }

  // ── Contexte ───────────────────────────────────────────────────────────────

  async _prepareContext() {
    const store = EnseignantsApp.getStore();
    const isGM = game.user.isGM;

    if (this.#view === "list") {
      const matieres = Object.entries(store.matieres ?? {}).map(([id, m]) => {
        const prof = m.professorId ? game.actors.get(m.professorId) : null;
        return {
          id,
          name: m.name,
          professorName: prof?.name ?? null,
          professorImg: prof?.img ?? null,
          itemCount: (m.items ?? []).length,
        };
      });
      return { view: "list", matieres, isGM };
    }

    // Vue détail
    const matiere = (store.matieres ?? {})[this.#selectedId];
    if (!matiere) { this.#view = "list"; return this._prepareContext(); }

    const prof = matiere.professorId ? game.actors.get(matiere.professorId) : null;
    const items = (
      await Promise.all((matiere.items ?? []).map(uuid => fromUuid(uuid).catch(() => null)))
    ).filter(Boolean).map(i => ({ uuid: i.uuid, name: i.name, img: i.img }));

    return {
      view: "detail",
      id: this.#selectedId,
      name: matiere.name,
      professor: prof ? { id: prof.id, name: prof.name, img: prof.img } : null,
      items,
      isGM,
    };
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);
    if (context.view === "list") this.#renderList(context);
    else this.#renderDetail(context);
  }

  #renderList(context) {
    this.element.querySelectorAll(".hp4-matiere-card").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".hp4-matiere-delete")) return;
        this.#selectedId = card.dataset.id;
        this.#view = "detail";
        this.render();
      });
    });

    if (!context.isGM) return;

    this.element.querySelector(".hp4-matiere-create")?.addEventListener("click", async () => {
      const name = await this.#promptName("", "Nouvelle matière");
      if (!name) return;
      const store = EnseignantsApp.getStore();
      const id = foundry.utils.randomID();
      store.matieres[id] = { name, professorId: null, items: [] };
      await EnseignantsApp.saveStore(store);
      this.render();
    });

    this.element.querySelectorAll(".hp4-matiere-delete").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const store = EnseignantsApp.getStore();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Supprimer la matière" },
          content: `<p>Supprimer <strong>${store.matieres[id]?.name ?? "cette matière"}</strong> ?</p>`,
        });
        if (!confirmed) return;
        delete store.matieres[id];
        await EnseignantsApp.saveStore(store);
        this.render();
      });
    });
  }

  #renderDetail(context) {
    this.element.querySelector(".hp4-back-btn")?.addEventListener("click", () => {
      this.#view = "list";
      this.render();
    });

    // Portrait prof → FicheApp
    this.element.querySelector(".hp4-prof-portrait")?.addEventListener("click", () => {
      if (context.professor) FicheApp.open(context.professor.id);
    });

    if (!context.isGM) return;

    // Renommer la matière
    this.element.querySelector(".hp4-matiere-rename")?.addEventListener("click", async () => {
      const store = EnseignantsApp.getStore();
      const current = store.matieres[this.#selectedId]?.name ?? "";
      const name = await this.#promptName(current, "Renommer la matière");
      if (!name || name === current) return;
      store.matieres[this.#selectedId].name = name;
      await EnseignantsApp.saveStore(store);
      this.render();
    });

    // Drop zone professeur (acteur)
    this.#setupActorDrop(".hp4-prof-drop", async actorId => {
      const store = EnseignantsApp.getStore();
      store.matieres[this.#selectedId].professorId = actorId;
      await EnseignantsApp.saveStore(store);
      this.render();
    });

    this.element.querySelector(".hp4-remove-prof")?.addEventListener("click", async () => {
      const store = EnseignantsApp.getStore();
      store.matieres[this.#selectedId].professorId = null;
      await EnseignantsApp.saveStore(store);
      this.render();
    });

    // Drop zone cours (équipements = items)
    const itemsDrop = this.element.querySelector(".hp4-items-drop");
    if (itemsDrop) {
      itemsDrop.addEventListener("dragover", e => { e.preventDefault(); itemsDrop.classList.add("drag-over"); });
      itemsDrop.addEventListener("dragleave", e => { if (!itemsDrop.contains(e.relatedTarget)) itemsDrop.classList.remove("drag-over"); });
      itemsDrop.addEventListener("drop", async e => {
        e.preventDefault();
        itemsDrop.classList.remove("drag-over");
        let data;
        try {
          const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/json");
          data = JSON.parse(text);
        } catch { return; }
        if (data.type !== "Item" && data.documentName !== "Item") return;
        const uuid = data.uuid;
        if (!uuid) return;
        const item = await fromUuid(uuid).catch(() => null);
        if (!item) return;
        const store = EnseignantsApp.getStore();
        const m = store.matieres[this.#selectedId];
        if (!m) return;
        if (!(m.items ?? []).includes(uuid)) {
          m.items = [...(m.items ?? []), uuid];
          await EnseignantsApp.saveStore(store);
          this.render();
        }
      });
    }

    // Retirer un cours
    this.element.querySelectorAll(".hp4-remove-item").forEach(btn => {
      btn.addEventListener("click", async () => {
        const uuid = btn.dataset.uuid;
        const store = EnseignantsApp.getStore();
        const m = store.matieres[this.#selectedId];
        if (!m) return;
        m.items = (m.items ?? []).filter(u => u !== uuid);
        await EnseignantsApp.saveStore(store);
        this.render();
      });
    });
  }

  #setupActorDrop(selector, callback) {
    const zone = this.element.querySelector(selector);
    if (!zone) return;
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over"); });
    zone.addEventListener("drop", async e => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      let data;
      try {
        const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/json");
        data = JSON.parse(text);
      } catch { return; }
      if (data.type !== "Actor" && data.documentName !== "Actor") return;
      const actorId = data.uuid?.split(".").pop() ?? data.id;
      if (actorId) await callback(actorId);
    });
  }

  async #promptName(current, title) {
    return foundry.applications.api.DialogV2.wait({
      window: { title },
      content: `<label style="font-size:0.85rem">Nom
        <input type="text" id="hp4-ens-input" value="${current.replace(/"/g, "&quot;")}"
          placeholder="ex: Défense contre les forces du Mal"
          style="width:100%;margin-top:0.4rem">
      </label>`,
      buttons: [
        { action: "ok", label: "Valider", default: true, callback: () => document.getElementById("hp4-ens-input")?.value.trim() || null },
        { action: "cancel", label: "Annuler", callback: () => null },
      ],
      rejectClose: false,
    });
  }
}
