import { MODULE_ID } from "../constants.js";
import { ClassesApp } from "./classeApp.js";
import { NpcsApp } from "./npcsApp.js";
import { HouseCupApp } from "./houseCupApp.js";
import { ClubsApp } from "./clubsApp.js";
import { TimetableApp } from "./timetableApp.js";
import { PrefetsApp } from "./prefetsApp.js";
import { EnseignantsApp } from "./enseignantsApp.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Instances singleton — une seule fenêtre ouverte par app
let _classes, _timetable, _npcs, _houseCup, _clubs, _prefets, _enseignants;

function openSingleton(ref, Cls) {
  if (!ref || !ref.rendered) ref = new Cls();
  ref.render(true);
  return ref;
}

export class GestionHarryPotterApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gestion-harry-potter-app",
    classes: ["hp4-main"],
    window: { title: "Gestion Harry Potter", resizable: true },
    position: { width: 700, height: "auto" },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/main.hbs" },
  };

  async _prepareContext() {
    return { moduleId: MODULE_ID };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.querySelector("[data-action='open-classes']")
      ?.addEventListener("click", () => { _classes  = openSingleton(_classes,  ClassesApp);  });
    this.element.querySelector("[data-action='open-timetable']")
      ?.addEventListener("click", () => { _timetable = openSingleton(_timetable, TimetableApp); });
    this.element.querySelector("[data-action='open-npcs']")
      ?.addEventListener("click", () => { _npcs     = openSingleton(_npcs,     NpcsApp);     });
    this.element.querySelector("[data-action='open-house-cup']")
      ?.addEventListener("click", () => { _houseCup = openSingleton(_houseCup, HouseCupApp); });
    this.element.querySelector("[data-action='open-clubs']")
      ?.addEventListener("click", () => { _clubs    = openSingleton(_clubs,    ClubsApp);    });
    this.element.querySelector("[data-action='open-prefets']")
      ?.addEventListener("click", () => { _prefets      = openSingleton(_prefets,      PrefetsApp);      });
    this.element.querySelector("[data-action='open-enseignants']")
      ?.addEventListener("click", () => { _enseignants  = openSingleton(_enseignants,  EnseignantsApp);  });
  }
}
