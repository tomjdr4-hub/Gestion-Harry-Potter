import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function formatHour(decimal) {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

function toTimeStr(decimal) {
  const h = Math.floor(decimal);
  const m = Math.round((decimal - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export class TimetableApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-timetable-app",
    classes: ["hp4-timetable"],
    window: { title: "Emploi du temps", resizable: true },
    position: { width: 960, height: 680 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/timetable.hbs" },
  };

  static getData() {
    try { return game.settings.get(MODULE_ID, "timetable-data") ?? {}; }
    catch { return {}; }
  }

  static async saveData(data) {
    await game.settings.set(MODULE_ID, "timetable-data", data);
  }

  async _prepareContext() {
    const data = TimetableApp.getData();
    const isGM = game.user.isGM;

    const hours = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      hours.push(`${h}h`);
    }

    const days = DAYS.map((label, dayIndex) => {
      const events = Object.entries(data)
        .filter(([, e]) => e.day === dayIndex)
        .map(([id, e]) => {
          const top = ((e.startHour - START_HOUR) / TOTAL_HOURS) * 100;
          const height = ((e.endHour - e.startHour) / TOTAL_HOURS) * 100;
          return {
            id, ...e, top, height,
            startLabel: formatHour(e.startHour),
            endLabel: formatHour(e.endHour),
          };
        });
      return { label, dayIndex, events };
    });

    return { days, hours, isGM, startHour: START_HOUR, totalHours: TOTAL_HOURS };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (context.isGM) {
      // Clic sur un événement existant → éditer
      this.element.querySelectorAll(".hp4-event").forEach(evt => {
        evt.style.cursor = "pointer";
        evt.addEventListener("click", (e) => {
          if (e.target.closest(".hp4-event-delete")) return;
          e.stopPropagation();
          const id = evt.dataset.id;
          const data = TimetableApp.getData();
          if (data[id]) this.#openModal(id, data[id]);
        });
      });

      // Clic sur la grille vide → créer
      this.element.querySelectorAll(".hp4-day-col").forEach(col => {
        col.addEventListener("click", (e) => {
          if (e.target.closest(".hp4-event")) return;
          const dayIndex = parseInt(col.dataset.day);
          const rect = col.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const hour = START_HOUR + Math.floor(ratio * TOTAL_HOURS);
          this.#openModal(null, { title: "", day: dayIndex, startHour: hour, endHour: Math.min(hour + 1, END_HOUR), color: "#c0392b" });
        });
      });

      // Supprimer un événement
      this.element.querySelectorAll(".hp4-event-delete").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const id = e.currentTarget.dataset.id;
          const data = TimetableApp.getData();
          const eventTitle = data[id]?.title ?? "ce cours";
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Supprimer le cours" },
            content: `<p>Supprimer <strong>${eventTitle}</strong> ?</p>`,
          });
          if (!confirmed) return;
          delete data[id];
          await TimetableApp.saveData(data);
          this.render();
        });
      });
    }

    this.#setupModal();
  }

  #openModal(id, evt) {
    const modal = this.element.querySelector(".hp4-tt-modal");
    if (!modal) return;

    modal.dataset.editId = id ?? "";
    modal.querySelector(".hp4-tt-modal-title").textContent = id ? "Modifier le cours" : "Nouvel événement";
    modal.querySelector(".hp4-tt-save").textContent = id ? "Modifier" : "Ajouter";

    modal.querySelector("#hp4-tt-day").value = evt.day;
    modal.querySelector("#hp4-tt-title").value = evt.title ?? "";
    modal.querySelector("#hp4-tt-start").value = toTimeStr(evt.startHour);
    modal.querySelector("#hp4-tt-end").value = toTimeStr(Math.min(evt.endHour, END_HOUR));
    modal.querySelector("#hp4-tt-color").value = evt.color ?? "#c0392b";
    modal.style.display = "flex";
    modal.querySelector("#hp4-tt-title").focus();
  }

  #setupModal() {
    const modal = this.element.querySelector(".hp4-tt-modal");
    if (!modal) return;

    modal.querySelector(".hp4-tt-cancel").addEventListener("click", () => {
      modal.style.display = "none";
    });

    modal.querySelector(".hp4-tt-save").addEventListener("click", async () => {
      const title = modal.querySelector("#hp4-tt-title").value.trim();
      if (!title) return;

      const day = parseInt(modal.querySelector("#hp4-tt-day").value);
      const startVal = modal.querySelector("#hp4-tt-start").value;
      const endVal = modal.querySelector("#hp4-tt-end").value;
      const color = modal.querySelector("#hp4-tt-color").value;

      const startHour = parseInt(startVal.split(":")[0]) + parseInt(startVal.split(":")[1]) / 60;
      const endHour = parseInt(endVal.split(":")[0]) + parseInt(endVal.split(":")[1]) / 60;

      if (endHour <= startHour) {
        ui.notifications.warn("L'heure de fin doit être après l'heure de début.");
        return;
      }

      const data = TimetableApp.getData();
      const id = modal.dataset.editId || `evt-${Date.now()}`;
      data[id] = { title, day, startHour, endHour, color };
      await TimetableApp.saveData(data);

      modal.style.display = "none";
      this.render();
    });
  }
}
