import { MODULE_ID } from "../constants.js";
import { FicheApp } from "./ficheApp.js";

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
  #viewingYear = null;       // null = année courante
  #viewingYearLoaded = false;

  // ── Store ──────────────────────────────────────────────────────────────────

  static getStore() {
    try {
      const raw = game.settings.get(MODULE_ID, "classes-data") ?? {};
      if ("years" in raw) return raw;
      // Migration depuis l'ancien format plat
      const schoolYear = (() => {
        try { return game.settings.get(MODULE_ID, "school-year") ?? ""; } catch { return ""; }
      })();
      const hasData = Object.keys(raw).some(k => k.startsWith("year-"));
      return { currentYear: schoolYear, years: hasData ? { [schoolYear]: raw } : {} };
    } catch { return { currentYear: "", years: {} }; }
  }

  static async saveStore(store) {
    await game.settings.set(MODULE_ID, "classes-data", store);
  }

  static getClassData() {
    const store = ClassesApp.getStore();
    return store.years[store.currentYear] ?? {};
  }

  static async saveClassData(data) {
    const store = ClassesApp.getStore();
    if (!store.years) store.years = {};
    store.years[store.currentYear] = data;
    await ClassesApp.saveStore(store);
  }

  static nextSchoolYear(current) {
    const match = current.match(/^(\d{4})-(\d{4})$/);
    if (!match) return null;
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
    for (const house of houseKeys) shifted[`year-1-${house}`] = [];
    return shifted;
  }

  // ── Contexte ───────────────────────────────────────────────────────────────

  async _prepareContext() {
    const store = ClassesApp.getStore();
    const currentYear = store.currentYear ?? "";

    // Restaurer l'année affichée depuis le setting persisté (1 seule fois par instance)
    if (!this.#viewingYearLoaded) {
      this.#viewingYearLoaded = true;
      try {
        const saved = game.settings.get(MODULE_ID, "classes-viewing-year");
        if (saved && saved !== currentYear && (store.years ?? {})[saved]) {
          this.#viewingYear = saved;
        }
      } catch {}
    }

    const viewingYear = this.#viewingYear ?? currentYear;
    const classData = (store.years ?? {})[viewingYear] ?? {};
    const isGM = game.user.isGM;
    const canEdit = isGM && viewingYear === currentYear;

    const allYears = Object.keys(store.years ?? {});
    const yearsList = [currentYear, ...allYears.filter(y => y !== currentYear).reverse()].filter(Boolean);

    const years = YEARS.map((label, index) => {
      const yearKey = `year-${index + 1}`;
      const actors = {};
      for (const house of HOUSES) {
        const ids = classData[`${yearKey}-${house.key}`] ?? [];
        actors[house.key] = ids
          .map(id => game.actors.get(id))
          .filter(Boolean)
          .map(a => ({ id: a.id, name: a.name, img: a.img }));
      }
      return { label, yearKey, actors };
    });

    return {
      years, houses: HOUSES, isGM, canEdit,
      currentYear, viewingYear, yearsList,
      isCurrentYear: viewingYear === currentYear,
    };
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);

    // Onglets
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

    // Liste déroulante des années — avec persistance du choix
    this.element.querySelector(".hp4-year-select")?.addEventListener("change", async (e) => {
      const store = ClassesApp.getStore();
      const selected = e.target.value;
      this.#viewingYear = selected === store.currentYear ? null : selected;
      this.#activeYearIndex = 0;
      try { await game.settings.set(MODULE_ID, "classes-viewing-year", selected); } catch {}
      this.render();
    });

    // Fiche d'identité — clic portrait ou bouton fiche
    this.element.querySelectorAll(".hp4-actor-card img, .hp4-fiche-btn").forEach(el => {
      el.style.cursor = "pointer";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const actorId = e.currentTarget.closest(".hp4-actor-card").dataset.id;
        if (actorId) FicheApp.open(actorId);
      });
    });

    if (!context.isGM) return;

    // Initialiser la première année
    this.element.querySelector(".hp4-init-year-btn")?.addEventListener("click", async () => {
      const name = await this.#promptYear("");
      if (!name) return;
      const store = ClassesApp.getStore();
      const existing = store.years[""] ?? {};
      delete store.years[""];
      store.years[name] = existing;
      store.currentYear = name;
      await ClassesApp.saveStore(store);
      this.render();
    });

    // Renommer l'année courante
    this.element.querySelector(".hp4-edit-year-btn")?.addEventListener("click", async () => {
      const store = ClassesApp.getStore();
      const name = await this.#promptYear(store.currentYear);
      if (!name || name === store.currentYear) return;
      store.years[name] = store.years[store.currentYear] ?? {};
      delete store.years[store.currentYear];
      store.currentYear = name;
      await ClassesApp.saveStore(store);
      this.render();
    });

    // Nouvelle année scolaire
    this.element.querySelector(".hp4-advance-year-btn")?.addEventListener("click", async () => {
      const store = ClassesApp.getStore();
      const current = store.currentYear;
      const next = ClassesApp.nextSchoolYear(current);
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Nouvelle année scolaire" },
        content: `
          <p>Cette action va :</p>
          <ul style="margin:0.4rem 0 0.4rem 1.2rem">
            <li>Archiver <strong>${current}</strong> en lecture seule</li>
            <li>Faire passer tous les élèves en classe supérieure</li>
            <li>Retirer les élèves de 7ème année (diplômés)</li>
            <li>Vider les classes de 1ère année</li>
          </ul>
          ${next ? `<p>Nouvelle année : <strong>${next}</strong></p>` : ""}`,
      });
      if (!confirmed) return;
      let nextYear = next;
      if (!nextYear || store.years[nextYear]) {
        nextYear = await this.#promptYear(next ?? "");
        if (!nextYear) return;
      }
      store.years[nextYear] = ClassesApp.shiftYearData(store.years[current] ?? {});
      store.currentYear = nextYear;
      await ClassesApp.saveStore(store);
      this.#viewingYear = null;
      this.#activeYearIndex = 0;
      this.render();
    });

    if (!context.canEdit) return;

    // Drag des cartes
    this.element.querySelectorAll(".hp4-actor-card[draggable='true']").forEach(card => {
      card.addEventListener("dragstart", (e) => {
        if (e.target.closest("button")) { e.preventDefault(); return; }
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

    // Drop zones
    this.element.querySelectorAll(".hp4-house-drop").forEach(zone => {
      zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", async (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const targetYear = zone.dataset.year;
        const targetHouse = zone.dataset.house;
        let raw;
        try { raw = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
        const classData = ClassesApp.getClassData();

        if (raw.type === "hp4-actor-move") {
          const { actorId, sourceYear, sourceHouse } = raw;
          const sourceKey = `${sourceYear}-${sourceHouse}`;
          const targetKey = `${targetYear}-${targetHouse}`;
          if (sourceKey === targetKey) return;
          classData[sourceKey] = (classData[sourceKey] ?? []).filter(id => id !== actorId);
          const list = classData[targetKey] ?? [];
          if (!list.includes(actorId)) { list.push(actorId); classData[targetKey] = list; }
          await ClassesApp.saveClassData(classData);
          this.render();
          return;
        }

        if (raw.type !== "Actor") return;
        const actorId = raw.uuid?.split(".").pop() ?? raw.id;
        const targetKey = `${targetYear}-${targetHouse}`;
        const list = classData[targetKey] ?? [];
        if (!list.includes(actorId)) {
          list.push(actorId); classData[targetKey] = list;
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
        const classData = ClassesApp.getClassData();
        classData[`${yearKey}-${houseKey}`] = (classData[`${yearKey}-${houseKey}`] ?? []).filter(id => id !== actorId);
        await ClassesApp.saveClassData(classData);
        this.render();
      });
    });
  }

  async #promptYear(current) {
    const { DialogV2 } = foundry.applications.api;
    return DialogV2.wait({
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
