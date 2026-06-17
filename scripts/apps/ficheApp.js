import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const RELATIONS = [
  { key: "ami",          label: "Ami",          color: "#2ecc71" },
  { key: "camarade",     label: "Camarade",      color: "#5dade2" },
  { key: "neutre",       label: "Neutre",        color: "#7f8c8d" },
  { key: "antipathique", label: "Antipathique",  color: "#e67e22" },
  { key: "hostile",      label: "Hostile",       color: "#e74c3c" },
];

export class FicheApp extends HandlebarsApplicationMixin(ApplicationV2) {
  #actorId;
  #saveTimeout = null;
  static #instances = new Map();

  constructor(actorId) {
    super({ id: `hp4-fiche-${actorId}` });
    this.#actorId = actorId;
  }

  static DEFAULT_OPTIONS = {
    classes: ["hp4-fiche"],
    window: { title: "Fiche d'identité", resizable: true },
    position: { width: 440, height: 640 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/fiche.hbs" },
  };

  get title() {
    return game.actors?.get(this.#actorId)?.name ?? "Fiche d'identité";
  }

  // ── Store ──────────────────────────────────────────────────────────────────

  static getProfiles() {
    try { return game.settings.get(MODULE_ID, "character-profiles") ?? {}; }
    catch { return {}; }
  }

  static async saveProfiles(data) {
    await game.settings.set(MODULE_ID, "character-profiles", data);
  }

  // ── Ouverture (singleton par acteur) ──────────────────────────────────────

  static open(actorId) {
    let app = FicheApp.#instances.get(actorId);
    if (!app) {
      app = new FicheApp(actorId);
      FicheApp.#instances.set(actorId, app);
    }
    app.render(true);
    return app;
  }

  // ── Contexte ───────────────────────────────────────────────────────────────

  async _prepareContext() {
    const actor = game.actors.get(this.#actorId);
    const profiles = FicheApp.getProfiles();
    const profile = profiles[this.#actorId] ?? {};

    const relations = RELATIONS.map(r => {
      const ids = profile[r.key] ?? [];
      const actors = ids
        .map(id => game.actors.get(id))
        .filter(Boolean)
        .map(a => ({ id: a.id, name: a.name, img: a.img }));
      return { ...r, actors };
    });

    return {
      actor: actor ? { id: actor.id, name: actor.name, img: actor.img } : null,
      relations,
      notes: profile.notes ?? "",
    };
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);
    const actorId = this.#actorId;

    // Portrait → ImagePopout
    this.element.querySelector(".hp4-fiche-portrait")?.addEventListener("click", () => {
      const actor = game.actors.get(actorId);
      if (!actor) return;
      new ImagePopout(actor.img, { title: actor.name, shareable: true, uuid: actor.uuid }).render(true);
    });

    // Zones de dépôt des niveaux de relation
    this.element.querySelectorAll(".hp4-rel-drop").forEach(zone => {
      zone.addEventListener("dragover", e => {
        e.preventDefault();
        zone.classList.add("drag-over");
      });
      zone.addEventListener("dragleave", e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
      });
      zone.addEventListener("drop", async e => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        let data;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
        if (data.type !== "Actor") return;
        const droppedId = data.uuid?.split(".").pop() ?? data.id;
        if (!droppedId || droppedId === actorId) return;
        const rel = zone.dataset.rel;
        const profiles = FicheApp.getProfiles();
        profiles[actorId] ??= {};
        // Retirer de tous les niveaux (un acteur ne peut être que dans un seul)
        for (const r of RELATIONS) {
          profiles[actorId][r.key] = (profiles[actorId][r.key] ?? []).filter(id => id !== droppedId);
        }
        profiles[actorId][rel] = [...(profiles[actorId][rel] ?? []), droppedId];
        await FicheApp.saveProfiles(profiles);
        this.render();
      });
    });

    // Boutons retirer un acteur d'un niveau
    this.element.querySelectorAll(".hp4-rel-remove").forEach(btn => {
      btn.addEventListener("click", async () => {
        const { actorId: targetId, rel } = btn.dataset;
        const profiles = FicheApp.getProfiles();
        profiles[actorId] ??= {};
        profiles[actorId][rel] = (profiles[actorId][rel] ?? []).filter(id => id !== targetId);
        await FicheApp.saveProfiles(profiles);
        this.render();
      });
    });

    // Notes — auto-sauvegarde debounce 1 s
    const textarea = this.element.querySelector(".hp4-fiche-notes");
    if (textarea) {
      textarea.addEventListener("input", () => {
        clearTimeout(this.#saveTimeout);
        this.#saveTimeout = setTimeout(async () => {
          const profiles = FicheApp.getProfiles();
          profiles[actorId] ??= {};
          profiles[actorId].notes = textarea.value;
          await FicheApp.saveProfiles(profiles);
        }, 1000);
      });
    }
  }
}
