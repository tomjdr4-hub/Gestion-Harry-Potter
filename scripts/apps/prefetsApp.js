import { MODULE_ID } from "../constants.js";
import { FicheApp } from "./ficheApp.js";

const HOUSES = [
  { key: "gryffondor",  label: "Gryffondor",  icon: "fas fa-fire"    },
  { key: "serdaigle",   label: "Serdaigle",    icon: "fas fa-feather" },
  { key: "poufsouffle", label: "Poufsouffle",  icon: "fas fa-leaf"    },
  { key: "serpentard",  label: "Serpentard",   icon: "fas fa-moon"    },
];

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PrefetsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-prefets-app",
    classes: ["hp4-prefets"],
    window: { title: "Préfets", resizable: true },
    position: { width: 700, height: 550 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/prefets.hbs" },
  };

  #viewingYear = null;
  #viewingYearLoaded = false;

  // ── Store ──────────────────────────────────────────────────────────────────

  static getStore() {
    try {
      const raw = game.settings.get(MODULE_ID, "prefets-data") ?? {};
      if ("years" in raw) return raw;
      return { currentYear: "", years: {} };
    } catch { return { currentYear: "", years: {} }; }
  }

  static async saveStore(store) {
    await game.settings.set(MODULE_ID, "prefets-data", store);
  }

  static nextSchoolYear(current) {
    const match = current.match(/^(\d{4})-(\d{4})$/);
    if (!match) return null;
    return `${parseInt(match[1]) + 1}-${parseInt(match[2]) + 1}`;
  }

  // ── Contexte ───────────────────────────────────────────────────────────────

  async _prepareContext() {
    const store = PrefetsApp.getStore();
    const currentYear = store.currentYear ?? "";

    if (!this.#viewingYearLoaded) {
      this.#viewingYearLoaded = true;
      try {
        const saved = game.settings.get(MODULE_ID, "prefets-viewing-year");
        if (saved && saved !== currentYear && (store.years ?? {})[saved]) {
          this.#viewingYear = saved;
        }
      } catch {}
    }

    const viewingYear = this.#viewingYear ?? currentYear;
    const yearData = (store.years ?? {})[viewingYear] ?? {};
    const isGM = game.user.isGM;
    const canEdit = isGM && viewingYear === currentYear;

    const allYears = Object.keys(store.years ?? {});
    const yearsList = [currentYear, ...allYears.filter(y => y !== currentYear).reverse()].filter(Boolean);

    const houses = HOUSES.map(h => ({
      ...h,
      actors: (yearData[h.key] ?? [])
        .map(id => game.actors.get(id))
        .filter(Boolean)
        .map(a => ({ id: a.id, name: a.name, img: a.img })),
    }));

    return { houses, isGM, canEdit, currentYear, viewingYear, yearsList,
             isCurrentYear: viewingYear === currentYear };
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);

    // Portrait / bouton fiche → FicheApp
    this.element.querySelectorAll(".hp4-actor-card img, .hp4-fiche-btn").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", e => {
        e.stopPropagation();
        const actorId = e.currentTarget.closest(".hp4-actor-card").dataset.id;
        if (actorId) FicheApp.open(actorId);
      });
    });

    // Dropdown des années — avec persistance
    this.element.querySelector(".hp4-year-select")?.addEventListener("change", async e => {
      const store = PrefetsApp.getStore();
      const selected = e.target.value;
      this.#viewingYear = selected === store.currentYear ? null : selected;
      try { await game.settings.set(MODULE_ID, "prefets-viewing-year", selected); } catch {}
      this.render();
    });

    if (!context.isGM) return;

    // Initialiser la première année
    this.element.querySelector(".hp4-init-year-btn")?.addEventListener("click", async () => {
      const name = await this.#promptYear("");
      if (!name) return;
      const store = PrefetsApp.getStore();
      store.years[name] = store.years[""] ?? {};
      delete store.years[""];
      store.currentYear = name;
      await PrefetsApp.saveStore(store);
      this.render();
    });

    // Renommer l'année courante
    this.element.querySelector(".hp4-edit-year-btn")?.addEventListener("click", async () => {
      const store = PrefetsApp.getStore();
      const name = await this.#promptYear(store.currentYear);
      if (!name || name === store.currentYear) return;
      store.years[name] = store.years[store.currentYear] ?? {};
      delete store.years[store.currentYear];
      store.currentYear = name;
      await PrefetsApp.saveStore(store);
      this.render();
    });

    // Nouvelle année scolaire (liste vide pour les préfets)
    this.element.querySelector(".hp4-advance-year-btn")?.addEventListener("click", async () => {
      const store = PrefetsApp.getStore();
      const current = store.currentYear;
      const next = PrefetsApp.nextSchoolYear(current);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Nouvelle année scolaire" },
        content: `<p>Archiver <strong>${current}</strong> et créer une nouvelle liste de préfets vide ?
          ${next ? `<br>Nouvelle année : <strong>${next}</strong>` : ""}</p>`,
      });
      if (!confirmed) return;
      let nextYear = next;
      if (!nextYear || store.years[nextYear]) {
        nextYear = await this.#promptYear(next ?? "");
        if (!nextYear) return;
      }
      store.years[nextYear] = {};
      store.currentYear = nextYear;
      await PrefetsApp.saveStore(store);
      this.#viewingYear = null;
      this.render();
    });

    if (!context.canEdit) return;

    // Drop zones par maison
    this.element.querySelectorAll(".hp4-house-drop").forEach(zone => {
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
        const houseKey = zone.dataset.house;
        const store = PrefetsApp.getStore();
        const yearData = store.years[store.currentYear] ?? {};
        const list = yearData[houseKey] ?? [];
        if (!list.includes(actorId)) {
          list.push(actorId);
          yearData[houseKey] = list;
          store.years[store.currentYear] = yearData;
          await PrefetsApp.saveStore(store);
          this.render();
        }
      });
    });

    // Boutons retirer un préfet
    this.element.querySelectorAll(".hp4-remove-actor").forEach(btn => {
      btn.addEventListener("click", async e => {
        const card = e.currentTarget.closest(".hp4-actor-card");
        const { id: actorId, house: houseKey } = card.dataset;
        const actor = game.actors.get(actorId);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Retirer le préfet" },
          content: `<p>Retirer <strong>${actor?.name ?? "ce préfet"}</strong> ?</p>`,
        });
        if (!confirmed) return;
        const store = PrefetsApp.getStore();
        const yearData = store.years[store.currentYear] ?? {};
        yearData[houseKey] = (yearData[houseKey] ?? []).filter(id => id !== actorId);
        store.years[store.currentYear] = yearData;
        await PrefetsApp.saveStore(store);
        this.render();
      });
    });
  }

  async #promptYear(current) {
    return foundry.applications.api.DialogV2.wait({
      window: { title: "Année scolaire" },
      content: `<label style="font-size:0.85rem">Nom de l'année
        <input type="text" id="hp4-year-input" value="${current.replace(/"/g, "&quot;")}"
          placeholder="ex: 1992-1993" style="width:100%;margin-top:0.4rem">
      </label>`,
      buttons: [
        { action: "ok", label: "Valider", default: true, callback: () => document.getElementById("hp4-year-input")?.value.trim() || null },
        { action: "cancel", label: "Annuler", callback: () => null }
      ],
      rejectClose: false
    });
  }
}
