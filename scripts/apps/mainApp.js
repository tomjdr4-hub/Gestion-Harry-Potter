import { MODULE_ID } from "../constants.js";
import { ClassesApp } from "./classeApp.js";
import { NpcsApp } from "./npcsApp.js";
import { HouseCupApp } from "./houseCupApp.js";
import { ClubsApp } from "./clubsApp.js";
import { TimetableApp } from "./timetableApp.js";
import { PrefetsApp } from "./prefetsApp.js";


const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GestionHarryPotterApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gestion-harry-potter-app",
    classes: ["hp4-main"],
    window: {
      title: "Gestion Harry Potter",
      resizable: true,
    },
    position: {
      width: 700,
      height: "auto",
    },
  };

  static PARTS = {
    main: {
      template: "modules/gestion-harry-potter/templates/main.hbs",
    },
  };

  async _prepareContext() {
    return {
      moduleId: MODULE_ID,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='open-classes']")
      ?.addEventListener("click", () => new ClassesApp().render(true));
    this.element.querySelector("[data-action='open-timetable']")
      ?.addEventListener("click", () => new TimetableApp().render(true));
    this.element.querySelector("[data-action='open-npcs']")
      ?.addEventListener("click", () => new NpcsApp().render(true));
    this.element.querySelector("[data-action='open-house-cup']")
      ?.addEventListener("click", () => new HouseCupApp().render(true));
    this.element.querySelector("[data-action='open-clubs']")
      ?.addEventListener("click", () => new ClubsApp().render(true));
    this.element.querySelector("[data-action='open-prefets']")
      ?.addEventListener("click", () => new PrefetsApp().render(true));
  }
}