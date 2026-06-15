import { MODULE_ID } from "../constants.js";
import { getActorNotes, registerNoteModal } from "../utils/notes.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-npcs-app",
    classes: ["hp4-npcs"],
    window: { title: "PNJ Rencontrés", resizable: true },
    position: { width: 700, height: 550 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/npcs.hbs" },
  };

  static getNpcData() {
    try { return game.settings.get(MODULE_ID, "npcs-data") ?? []; }
    catch { return []; }
  }

  static async saveNpcData(data) {
    await game.settings.set(MODULE_ID, "npcs-data", data);
  }

 async _prepareContext() {
  const ids = NpcsApp.getNpcData();
  const all = getActorNotes();
  const npcs = ids
    .map(id => game.actors.get(id))
    .filter(Boolean)
    .map(a => ({
      id: a.id,
      name: a.name,
      img: a.img,
      entries: all[a.id] ?? []
    }));

  return { npcs, isGM: game.user.isGM };
}

  _onRender(context, options) {
    super._onRender(context, options);
    // Notes
registerNoteModal(this);
    // Clic portrait → ImagePopout
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

    if (!game.user.isGM) return;

    // Zone de drop
    const dropZone = this.element.querySelector(".hp4-npc-drop");

    dropZone.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");

      let data;
      try { data = JSON.parse(e.dataTransfer.getData("text/plain")); }
      catch { return; }

      if (data.type !== "Actor") return;

      const actorId = data.uuid?.split(".").pop() ?? data.id;
      const list = NpcsApp.getNpcData();

      if (!list.includes(actorId)) {
        list.push(actorId);
        await NpcsApp.saveNpcData(list);
        this.render();
      }
    });

    // Boutons supprimer
    this.element.querySelectorAll(".hp4-remove-actor").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const actorId = e.currentTarget.closest(".hp4-actor-card").dataset.id;
        const actor = game.actors.get(actorId);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Retirer le PNJ" },
          content: `<p>Retirer <strong>${actor?.name ?? "ce PNJ"}</strong> de la liste ?</p>`,
        });
        if (!confirmed) return;
        const list = NpcsApp.getNpcData().filter(id => id !== actorId);
        await NpcsApp.saveNpcData(list);
        this.render();
      });
    });
  }
}