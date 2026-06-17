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
    position: { width: 340, height: 500 },
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
    const currentRel = profile.relation ?? "neutre";

    const relations = RELATIONS.map(r => ({ ...r, active: r.key === currentRel }));

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

    // Relation — clic sur un niveau
    this.element.querySelectorAll(".hp4-rel-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const profiles = FicheApp.getProfiles();
        profiles[actorId] ??= { relation: "neutre", notes: "" };
        profiles[actorId].relation = btn.dataset.rel;
        await FicheApp.saveProfiles(profiles);
        this.render();
      });
    });

    // Notes — auto-sauvegarde avec debounce 1 s
    const textarea = this.element.querySelector(".hp4-fiche-notes");
    if (textarea) {
      textarea.addEventListener("input", () => {
        clearTimeout(this.#saveTimeout);
        this.#saveTimeout = setTimeout(async () => {
          const profiles = FicheApp.getProfiles();
          profiles[actorId] ??= { relation: "neutre", notes: "" };
          profiles[actorId].notes = textarea.value;
          await FicheApp.saveProfiles(profiles);
        }, 1000);
      });
    }
  }
}
