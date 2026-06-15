import { MODULE_ID } from "../constants.js";
import { getActorNotes, addActorNote, deleteActorNote } from "../utils/notes.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ClubsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-clubs-app",
    classes: ["hp4-clubs"],
    window: { title: "Clubs de Poudlard", resizable: true },
    position: { width: 750, height: 600 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/clubs.hbs" },
  };

  // null = liste des clubs, string = id du club affiché
  #currentClub = null;

  static getClubsData() {
    try { return game.settings.get(MODULE_ID, "clubs-data") ?? {}; }
    catch { return {}; }
  }

  static async saveClubsData(data) {
    await game.settings.set(MODULE_ID, "clubs-data", data);
  }

  async _prepareContext() {
    const clubs = ClubsApp.getClubsData();
    const isGM = game.user.isGM;

    if (this.#currentClub) {
      const club = clubs[this.#currentClub];
      if (!club) { this.#currentClub = null; return this._prepareContext(); }

      const president = club.presidentId ? game.actors.get(club.presidentId) : null;
      const members = (club.memberIds ?? [])
        .map(id => game.actors.get(id))
        .filter(Boolean)
        .map(a => ({ id: a.id, name: a.name, img: a.img }));

      const allNotes = getActorNotes();
      const noteKey = `club-${this.#currentClub}`;
      const entries = allNotes[noteKey] ?? [];

      return {
        view: "detail",
        clubId: this.#currentClub,
        club: {
          ...club,
          presidentName: president?.name ?? "—",
          presidentImg: president?.img ?? "icons/svg/mystery-man.svg",
          presidentId: club.presidentId ?? null,
          members,
          entries,
        },
        isGM,
      };
    }

    const clubList = Object.entries(clubs).map(([id, c]) => ({
      id,
      name: c.name,
      schedule: c.schedule ?? "",
      memberCount: (c.memberIds ?? []).length,
    }));

    return { view: "list", clubs: clubList, isGM };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    if (context.view === "list") this.#renderList();
    else this.#renderDetail(context);
  }

  #renderList() {
    const isGM = game.user.isGM;

    // Clic sur un club → détail
    this.element.querySelectorAll(".hp4-club-card").forEach(card => {
      card.addEventListener("click", () => {
        this.#currentClub = card.dataset.id;
        this.render();
      });
    });

    if (!isGM) return;

    // Créer un club
    this.element.querySelector(".hp4-club-create")?.addEventListener("click", async () => {
      const name = await this.#promptText("Nom du club", "Nom du nouveau club");
      if (!name) return;
      const clubs = ClubsApp.getClubsData();
      const id = `club-${Date.now()}`;
      clubs[id] = { name, schedule: "", presidentId: null, memberIds: [] };
      await ClubsApp.saveClubsData(clubs);
      this.render();
    });

    // Supprimer un club
    this.element.querySelectorAll(".hp4-club-delete").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const clubs = ClubsApp.getClubsData();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Supprimer le club" },
          content: `<p>Supprimer le club <strong>${clubs[id]?.name ?? ""}</strong> ?</p>`,
        });
        if (!confirmed) return;
        delete clubs[id];
        await ClubsApp.saveClubsData(clubs);
        this.render();
      });
    });
  }

  #renderDetail(context) {
    const { clubId, isGM } = context;

    // Retour à la liste
    this.element.querySelector(".hp4-back-btn")?.addEventListener("click", () => {
      this.#currentClub = null;
      this.render();
    });

    if (isGM) {
      // Modifier le nom
      this.element.querySelector(".hp4-club-rename")?.addEventListener("click", async () => {
        const clubs = ClubsApp.getClubsData();
        const name = await this.#promptText("Renommer le club", clubs[clubId].name);
        if (!name) return;
        clubs[clubId].name = name;
        await ClubsApp.saveClubsData(clubs);
        this.render();
      });

      // Modifier le schedule
      this.element.querySelector(".hp4-schedule-edit")?.addEventListener("click", async () => {
        const clubs = ClubsApp.getClubsData();
        const schedule = await this.#promptText("Date des séances", clubs[clubId].schedule ?? "");
        if (schedule === null) return;
        clubs[clubId].schedule = schedule;
        await ClubsApp.saveClubsData(clubs);
        this.render();
      });

      // Drop président
      const presZone = this.element.querySelector(".hp4-president-drop");
      this.#setupDrop(presZone, async (actorId) => {
        const clubs = ClubsApp.getClubsData();
        clubs[clubId].presidentId = actorId;
        await ClubsApp.saveClubsData(clubs);
        this.render();
      });

      // Retirer président
      this.element.querySelector(".hp4-remove-president")?.addEventListener("click", async () => {
        const clubs = ClubsApp.getClubsData();
        clubs[clubId].presidentId = null;
        await ClubsApp.saveClubsData(clubs);
        this.render();
      });

      // Drop membres
      const memberZone = this.element.querySelector(".hp4-members-drop");
      this.#setupDrop(memberZone, async (actorId) => {
        const clubs = ClubsApp.getClubsData();
        const list = clubs[clubId].memberIds ?? [];
        if (!list.includes(actorId)) {
          list.push(actorId);
          clubs[clubId].memberIds = list;
          await ClubsApp.saveClubsData(clubs);
          this.render();
        }
      });

      // Retirer un membre
      this.element.querySelectorAll(".hp4-remove-member").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          const actorId = e.currentTarget.dataset.id;
          const actor = game.actors.get(actorId);
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Retirer le membre" },
            content: `<p>Retirer <strong>${actor?.name ?? "ce membre"}</strong> du club ?</p>`,
          });
          if (!confirmed) return;
          const clubs = ClubsApp.getClubsData();
          clubs[clubId].memberIds = (clubs[clubId].memberIds ?? []).filter(id => id !== actorId);
          await ClubsApp.saveClubsData(clubs);
          this.render();
        });
      });
    }

    // Portrait → ImagePopout (pour tous)
    this.element.querySelectorAll(".hp4-actor-card img, .hp4-president-card img").forEach(img => {
      img.style.cursor = "pointer";
      img.addEventListener("click", (e) => {
        const actorId = e.currentTarget.closest("[data-id]")?.dataset.id;
        const actor = actorId ? game.actors.get(actorId) : null;
        if (!actor) return;
        new ImagePopout(actor.img, { title: actor.name, shareable: true, uuid: actor.uuid }).render(true);
      });
    });

    // Journal de notes
    this.#registerClubJournal(clubId);
  }

  #registerClubJournal(clubId) {
    const noteKey = `club-${clubId}`;
    const journal = this.element.querySelector(".hp4-club-journal");
    const textarea = this.element.querySelector(".hp4-journal-textarea");
    const saveBtn = this.element.querySelector(".hp4-journal-save");

    saveBtn?.addEventListener("click", async () => {
      const text = textarea.value.trim();
      if (!text) return;
      await addActorNote(noteKey, text);
      textarea.value = "";
      this.render();
    });

    // Supprimer une entrée (GM)
    journal?.querySelectorAll(".hp4-journal-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = parseInt(btn.dataset.index);
        await deleteActorNote(noteKey, idx);
        this.render();
      });
    });
  }

  #setupDrop(zone, callback) {
    if (!zone) return;
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      let data;
      try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
      if (data.type !== "Actor") return;
      const actorId = data.uuid?.split(".").pop() ?? data.id;
      await callback(actorId);
    });
  }

  async #promptText(title, current = "") {
    const { DialogV2 } = foundry.applications.api;
    return DialogV2.wait({
      window: { title },
      content: `<input type="text" value="${current.replace(/"/g, "&quot;")}" id="hp4-prompt-input" style="width:100%;margin-top:0.5rem">`,
      buttons: [
        {
          action: "ok",
          label: "Valider",
          default: true,
          callback: () => document.getElementById("hp4-prompt-input")?.value.trim() || null
        },
        {
          action: "cancel",
          label: "Annuler",
          callback: () => null
        }
      ],
      rejectClose: false
    });
  }
}