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

  static getSchoolYear() {
    try { return game.settings.get(MODULE_ID, "school-year") ?? ""; }
    catch { return ""; }
  }

  static async saveSchoolYear(year) {
    await game.settings.set(MODULE_ID, "school-year", year);
  }

  static nextSchoolYear(current) {
    const match = current.match(/^(\d{4})-(\d{4})$/);
    if (!match) return current;
    return `${parseInt(match[1]) + 1}-${parseInt(match[2]) + 1}`;
  }

  static shiftYearData(classData) {
    const houseKeys = HOUSES.map(h => h.key);
    const shifted = { ...classData };
    for (let y = 7; y >= 2; y--) {
      for (const house of houseKeys) {
        shifted[`year-${y}-${house}`] = classData[`year-${y - 1}-${house}`] ?? [];
      }
    }
    for (const house of houseKeys) {
      shifted[`year-1-${house}`] = [];
    }
    return shifted;
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

    return { years, houses: HOUSES, isGM, actorNotes, schoolYear: ClassesApp.getSchoolYear() };
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

    // Modifier l'année scolaire
    this.element.querySelector(".hp4-edit-year-btn")?.addEventListener("click", async () => {
      const current = ClassesApp.getSchoolYear();
      const newYear = await foundry.applications.api.DialogV2.wait({
        window: { title: "Année scolaire" },
        content: `<label style="font-size:0.85rem">Année scolaire
          <input type="text" id="hp4-year-input" value="${current.replace(/"/g, "&quot;")}"
            placeholder="ex: 1992-1993" style="width:100%;margin-top:0.4rem">
        </label>`,
        buttons: [
          { action: "ok", label: "Valider", default: true, callback: () => document.getElementById("hp4-year-input")?.value.trim() ?? "" },
          { action: "cancel", label: "Annuler", callback: () => null }
        ],
        rejectClose: false
      });
      if (newYear === null) return;
      await ClassesApp.saveSchoolYear(newYear);
      this.render();
    });

    // Passer à la nouvelle année scolaire
    this.element.querySelector(".hp4-advance-year-btn")?.addEventListener("click", async () => {
      const current = ClassesApp.getSchoolYear();
      const next = ClassesApp.nextSchoolYear(current);
      const yearLine = next ? `<p>Nouvelle année scolaire : <strong>${next}</strong></p>` : "";
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Nouvelle année scolaire" },
        content: `
          <p>Cette action va :</p>
          <ul style="margin:0.4rem 0 0.4rem 1.2rem">
            <li>Faire passer tous les élèves en classe supérieure</li>
            <li>Retirer les élèves de 7ème année (diplômés)</li>
            <li>Vider les classes de 1ère année</li>
          </ul>
          ${yearLine}
          <p><strong>Cette action est irréversible.</strong></p>`,
      });
      if (!confirmed) return;
      const shifted = ClassesApp.shiftYearData(ClassesApp.getClassData());
      await ClassesApp.saveClassData(shifted);
      if (next) await ClassesApp.saveSchoolYear(next);
      this.#activeYearIndex = 0;
      this.render();
    });

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