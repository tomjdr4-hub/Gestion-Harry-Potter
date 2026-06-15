import { MODULE_ID } from "../constants.js";
import { getActorNotes, registerNoteModal } from "../utils/notes.js";

const YEARS = [
  "1ère année", "2ème année", "3ème année", "4ème année",
  "5ème année", "6ème année", "7ème année"
];

const HOUSES = [
  { key: "gryffondor",  label: "Gryffondor",  icon: "fas fa-fire" },
  { key: "serdaigle",   label: "Serdaigle",    icon: "fas fa-feather" },
  { key: "poufsouffle", label: "Poufsouffle",  icon: "fas fa-leaf" },
  { key: "serpentard",  label: "Serpentard",   icon: "fas fa-moon" },
];

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ClassesApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-classes-app",
    classes: ["hp4-classes"],
    window: { title: "Classes de Poudlard", resizable: true },
    position: { width: 900, height: 650 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/classes.hbs" },
  };

  #activeYearIndex = 0;

  static getClassData() {
    try { return game.settings.get(MODULE_ID, "classes-data") ?? {}; }
    catch { return {}; }
  }

  static async saveClassData(data) {
    await game.settings.set(MODULE_ID, "classes-data", data);
  }

  async _prepareContext() {
    const classData = ClassesApp.getClassData();
    const isGM = game.user.isGM;
    const actorNotes = getActorNotes();

    const years = YEARS.map((label, index) => {
      const yearKey = `year-${index + 1}`;
      const actors = {};
      for (const house of HOUSES) {
        const storageKey = `${yearKey}-${house.key}`;
        const ids = classData[storageKey] ?? [];
        actors[house.key] = ids
          .map(id => game.actors.get(id))
          .filter(Boolean)
          .map(a => ({ id: a.id, name: a.name, img: a.img }));
      }
      return { label, yearKey, actors };
    });

    return { years, houses: HOUSES, isGM, actorNotes };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    // Onglets par année
    const tabs = this.element.querySelectorAll(".hp4-year-tab");
    const panels = this.element.querySelectorAll(".hp4-year-panel");

    tabs[this.#activeYearIndex]?.classList.add("active");
    panels[this.#activeYearIndex]?.classList.add("active");

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        panels[i]?.classList.add("active");
        this.#activeYearIndex = i;
      });
    });

    // Clic portrait → ImagePopout (pour tous)
    this.element.querySelectorAll(".hp4-actor-card img").forEach(img => {
      img.style.cursor = "pointer";
      img.addEventListener("click", (e) => {
        const actorId = e.currentTarget.closest(".hp4-actor-card").dataset.id;
        const actor = game.actors.get(actorId);
        if (!actor) return;
        new ImagePopout(actor.img, {
          title: actor.name,
          shareable: true,
          uuid: actor.uuid
        }).render(true);
      });
    });

    // Notes (pour tous)
    registerNoteModal(this);

    if (!game.user.isGM) return;

    // Rendre les cartes existantes draggables
    this.element.querySelectorAll(".hp4-actor-card[draggable='true']").forEach(card => {
  card.addEventListener("dragstart", (e) => {
    // Ignorer si on drag depuis un bouton
    if (e.target.closest("button")) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({
      type: "hp4-actor-move",
      actorId: card.dataset.id,
      sourceYear: card.dataset.sourceYear,
      sourceHouse: card.dataset.sourceHouse,
    }));
    setTimeout(() => card.classList.add("dragging"), 0);
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));
});
    // Drop sur chaque zone de maison
    this.element.querySelectorAll(".hp4-house-drop").forEach(zone => {
      zone.addEventListener("dragover", e => {
        e.preventDefault();
        zone.classList.add("drag-over");
      });

      zone.addEventListener("dragleave", () => {
        zone.classList.remove("drag-over");
      });

      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");

        const targetYear = zone.dataset.year;
        const targetHouse = zone.dataset.house;

        let raw;
        try { raw = JSON.parse(e.dataTransfer.getData("text/plain")); }
        catch { return; }

        const classData = ClassesApp.getClassData();

        // Cas 1 : déplacement d'une carte existante entre maisons
        if (raw.type === "hp4-actor-move") {
          const { actorId, sourceYear, sourceHouse } = raw;
          const sourceKey = `${sourceYear}-${sourceHouse}`;
          const targetKey = `${targetYear}-${targetHouse}`;

          if (sourceKey === targetKey) return;

          classData[sourceKey] = (classData[sourceKey] ?? []).filter(id => id !== actorId);

          const targetList = classData[targetKey] ?? [];
          if (!targetList.includes(actorId)) {
            targetList.push(actorId);
            classData[targetKey] = targetList;
          }

          await ClassesApp.saveClassData(classData);
          this.render();
          return;
        }

        // Cas 2 : nouvel acteur depuis le répertoire Foundry
        if (raw.type !== "Actor") return;
        const actorId = raw.uuid?.split(".").pop() ?? raw.id;
        const targetKey = `${targetYear}-${targetHouse}`;
        const list = classData[targetKey] ?? [];
        if (!list.includes(actorId)) {
          list.push(actorId);
          classData[targetKey] = list;
          await ClassesApp.saveClassData(classData);
          this.render();
        }
      });
    });

    // Boutons supprimer
    this.element.querySelectorAll(".hp4-remove-actor").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const { id: actorId, year: yearKey, house: houseKey } = e.currentTarget.dataset;
        const actor = game.actors.get(actorId);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Retirer l'élève" },
          content: `<p>Retirer <strong>${actor?.name ?? "cet élève"}</strong> de cette maison ?</p>`,
        });
        if (!confirmed) return;
        const storageKey = `${yearKey}-${houseKey}`;
        const classData = ClassesApp.getClassData();
        classData[storageKey] = (classData[storageKey] ?? []).filter(id => id !== actorId);
        await ClassesApp.saveClassData(classData);
        this.render();
      });
    });
  }
}