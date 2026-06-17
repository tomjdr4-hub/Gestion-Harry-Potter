import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const HOUSES = [
  { key: "gryffondor",  label: "Gryffondor",  color: "#c0392b", bg: "#2a0a0a" },
  { key: "serdaigle",   label: "Serdaigle",    color: "#2980b9", bg: "#0a1a2a" },
  { key: "poufsouffle", label: "Poufsouffle",  color: "#f39c12", bg: "#2a1a00" },
  { key: "serpentard",  label: "Serpentard",   color: "#27ae60", bg: "#0a2a14" },
];

export class HouseCupApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-house-cup-app",
    classes: ["hp4-house-cup"],
    window: { title: "Coupe des 4 Maisons", resizable: true },
    position: { width: 650, height: 500 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/houseCup.hbs" },
  };

  static getPoints() {
    try { return game.settings.get(MODULE_ID, "house-cup-data") ?? {}; }
    catch { return {}; }
  }

  static async savePoints(data) {
    await game.settings.set(MODULE_ID, "house-cup-data", data);
  }

  async _prepareContext() {
    const points = HouseCupApp.getPoints();
    const total = Math.max(Object.values(points).reduce((s, v) => s + Math.max(v ?? 0, 0), 0), 1);
    const maxPoints = Math.max(...HOUSES.map(h => points[h.key] ?? 0));

    const houses = HOUSES.map(h => ({
      ...h,
      points: points[h.key] ?? 0,
      percent: Math.round((Math.max(points[h.key] ?? 0, 0) / total) * 100),
      negative: (points[h.key] ?? 0) < 0,
      isLeading: maxPoints > 0 && (points[h.key] ?? 0) === maxPoints,
    }));

    return { houses, isGM: game.user.isGM };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    if (!game.user.isGM) return;

    this.element.querySelectorAll(".hp4-cup-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const { house, action } = e.currentTarget.dataset;
        const input = this.element.querySelector(`.hp4-points-input[data-house="${house}"]`);
        const amount = parseInt(input?.value) || 10;

        const points = HouseCupApp.getPoints();
        const current = points[house] ?? 0;
        points[house] = action === "add" ? current + amount : current - amount;

        await HouseCupApp.savePoints(points);
        this.render();
      });
    });
  }
}