/* globals Hooks, game */

import { MODULE_ID } from "./constants.js";
import { registerSidebar } from "./sidebar/sidebar.js";
import { GestionHarryPotterApp } from "./apps/mainApp.js";

Hooks.once("init", function () {
  // Helper Handlebars
  Handlebars.registerHelper("eq", (a, b) => a === b);

  game.settings.register(MODULE_ID, "debug", {
    name: "Debug",
    hint: "Active le mode debug du module.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "auto-open", {
    name: "Auto-ouvrir",
    hint: "Ouvre le panneau de gestion au chargement (GM uniquement).",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "classes-data", {
    scope: "world", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, "npcs-data", {
    scope: "world", config: false, type: Array, default: []
  });

  game.settings.register(MODULE_ID, "house-cup-data", {
    scope: "world", config: false, type: Object, default: {}
  });

  game.settings.register(MODULE_ID, "actor-notes", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "timetable-data", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "clubs-data", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "school-year", {
    scope: "world", config: false, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "character-profiles", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "classes-viewing-year", {
    scope: "world", config: false, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "prefets-data", {
    scope: "world", config: false, type: Object, default: {}
  });
  game.settings.register(MODULE_ID, "prefets-viewing-year", {
    scope: "world", config: false, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "enseignants-data", {
    scope: "world", config: false, type: Object, default: {}
  });
});

Hooks.once("ready", function () {
  console.debug(`[${MODULE_ID}] Module loaded`);
  registerSidebar();

  if (game.user?.isGM) {
    const autoOpen = game.settings.get(MODULE_ID, "auto-open") ?? false;
    if (autoOpen) new GestionHarryPotterApp().render(true);
  }
});