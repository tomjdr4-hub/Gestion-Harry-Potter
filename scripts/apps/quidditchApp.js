import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const POSTES = [
  { key: "gardien",     label: "Gardien" },
  { key: "poursuiveur", label: "Poursuiveur" },
  { key: "batteur",     label: "Batteur" },
  { key: "attrapeur",   label: "Attrapeur" },
];
const POSTE_LABEL = Object.fromEntries(POSTES.map(p => [p.key, p.label]));

const BEATS = { gardien: "poursuiveur", poursuiveur: "batteur", batteur: "attrapeur", attrapeur: "gardien" };

// 1 = A gagne, -1 = B gagne, 0 = neutre/égal
function cmp(a, b) {
  if (!a || !b || a === b) return 0;
  if (BEATS[a] === b) return 1;
  if (BEATS[b] === a) return -1;
  return 0;
}

// Effets de jauge
const EFFECTS = {
  gardien:     [{ target: "opp",  gauge: "quaffle", dir: -1, label: "Souaffle" }],
  poursuiveur: [{ target: "self", gauge: "quaffle", dir: +1, label: "Souaffle" }],
  batteur:     [{ target: "opp",  gauge: "vifDor",  dir: -1, label: "Vif d'or" }],
  attrapeur:   [{ target: "self", gauge: "vifDor",  dir: +1, label: "Vif d'or" }],
};

// ─── Condition de fin de match ────────────────────────────────────────────────
function checkEnd(teamA, teamB) {
  const vA = teamA.vifDor, vB = teamB.vifDor;
  if (vA < 200 && vB < 200 && Math.abs(vA - vB) < 100) return null;

  // Qui capture le vif d'or ?
  const capture = (vA >= 200 && vB < 200) ? "A"
                : (vB >= 200 && vA < 200) ? "B"
                : (vA >= vB)              ? "A" : "B";

  const finalA = teamA.quaffle + (capture === "A" ? 150 : 0);
  const finalB = teamB.quaffle + (capture === "B" ? 150 : 0);
  const winner = finalA > finalB ? "A" : finalB > finalA ? "B" : "tie";
  return { capture, finalA, finalB, winner };
}

export class QuidditchApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-quidditch-app",
    classes: ["hp4-quidditch"],
    window: { title: "Quidditch", resizable: true },
    position: { width: 680, height: 600 },
  };
  static PARTS = { main: { template: "modules/gestion-harry-potter/templates/quidditch.hbs" } };

  // ─── Store ────────────────────────────────────────────────────────────────
  static getStore() {
    try { return game.settings.get(MODULE_ID, "quidditch-data") ?? {}; }
    catch { return {}; }
  }
  static async saveStore(store) {
    await game.settings.set(MODULE_ID, "quidditch-data", store);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  static #actorOf(actorId) { return actorId ? game.actors.get(actorId) : null; }
  static #canControl(actorId) {
    if (game.user.isGM) return true;
    const a = QuidditchApp.#actorOf(actorId);
    return a ? a.testUserPermission(game.user, "OWNER") : false;
  }

  // ─── Contexte ─────────────────────────────────────────────────────────────
  async _prepareContext() {
    const store = QuidditchApp.getStore();
    const isGM  = game.user.isGM;
    const phase = store.phase ?? "setup";

    // ── Setup ──
    if (phase === "setup") {
      const actA = QuidditchApp.#actorOf(store.teamA?.actorId);
      const actB = QuidditchApp.#actorOf(store.teamB?.actorId);
      return {
        phase: "setup", isGM,
        teamA: { name: store.teamA?.name ?? "", actorImg: actA?.img, actorName: actA?.name },
        teamB: { name: store.teamB?.name ?? "", actorImg: actB?.img, actorName: actB?.name },
        readyToStart: !!(store.teamA?.actorId && store.teamB?.actorId),
      };
    }

    const teamA = store.teamA;
    const teamB = store.teamB;
    const round = store.round ?? 1;
    const isTeamA = QuidditchApp.#canControl(teamA.actorId);
    const isTeamB = QuidditchApp.#canControl(teamB.actorId);
    const gauges  = { aQ: teamA.quaffle, aV: teamA.vifDor, bQ: teamB.quaffle, bV: teamB.vifDor };

    // ── Ended ──
    if (phase === "ended") {
      const capture = store.capture;
      return {
        phase: "ended", isGM, round,
        teamA, teamB, gauges,
        capture, captureTeamName: capture === "A" ? teamA.name : teamB.name,
        finalA: store.finalA, finalB: store.finalB,
        winnerName: store.winner === "tie" ? null
          : store.winner === "A" ? teamA.name : teamB.name,
        isTie: store.winner === "tie",
      };
    }

    const cur    = store.current ?? {};
    const cA     = cur.choiceA ?? { p1: "", p2: "", locked: false };
    const cB     = cur.choiceB ?? { p1: "", p2: "", locked: false };

    // ── Choose ──
    if (phase === "choose") {
      return {
        phase: "choose", isGM, round,
        teamA, teamB, gauges, postes: POSTES,
        isTeamA, isTeamB,
        cA, cB,
        aLocked: !!cA.locked,
        bLocked: !!cB.locked,
        allLocked: cA.locked && cB.locked,
      };
    }

    // ── Reveal ──
    const v1 = cmp(cA.p1, cB.p1);
    const v2 = cmp(cA.p2, cB.p2);
    const bonusA = (v1 > 0 ? 1 : 0) + (v2 > 0 ? 1 : 0);
    const bonusB = (v1 < 0 ? 1 : 0) + (v2 < 0 ? 1 : 0);

    const rollA = cur.rollA ?? null;
    const rollB = cur.rollB ?? null;
    const totA  = rollA !== null ? rollA + bonusA : null;
    const totB  = rollB !== null ? rollB + bonusB : null;

    let duel = null;
    if (rollA !== null && rollB !== null) {
      const ecart = Math.abs(totA - totB);
      const winKey = totA > totB ? "A" : totB > totA ? "B" : null;

      const effects = [];
      const push = (pos, selfTeam, oppTeam, selfKey) => {
        const eff = EFFECTS[pos] ?? [];
        for (const e of eff) {
          const targetKey  = e.target === "self" ? selfKey : (selfKey === "A" ? "B" : "A");
          const targetName = e.target === "self" ? selfTeam.name : oppTeam.name;
          const delta      = e.dir * ecart;
          effects.push({ desc: `${POSTE_LABEL[pos]} (${selfTeam.name}) → ${e.label} ${targetName} ${delta >= 0 ? "+" : ""}${delta}`, gaugeKey: e.gauge, teamKey: targetKey, delta });
        }
      };
      push(cA.p1, teamA, teamB, "A");
      push(cA.p2, teamA, teamB, "A");
      push(cB.p1, teamB, teamA, "B");
      push(cB.p2, teamB, teamA, "B");

      // Jauges projetées
      const pA = { quaffle: teamA.quaffle, vifDor: teamA.vifDor };
      const pB = { quaffle: teamB.quaffle, vifDor: teamB.vifDor };
      for (const e of effects) {
        const p = e.teamKey === "A" ? pA : pB;
        const cap = e.gaugeKey === "vifDor" ? 200 : 100;
        p[e.gaugeKey] = Math.max(0, Math.min(cap, p[e.gaugeKey] + e.delta));
      }

      const endCheck = checkEnd({ ...teamA, quaffle: pA.quaffle, vifDor: pA.vifDor },
                                 { ...teamB, quaffle: pB.quaffle, vifDor: pB.vifDor });

      duel = { ecart, winKey, winName: winKey === "A" ? teamA.name : winKey === "B" ? teamB.name : null, tie: !winKey, totA, totB, effects, projA: pA, projB: pB, endCheck };
    }

    const vLabel = v => v > 0 ? `${teamA.name} +1` : v < 0 ? `${teamB.name} +1` : "Neutre";
    const vCls   = v => v > 0 ? "qw-a" : v < 0 ? "qw-b" : "qw-n";

    return {
      phase: "reveal", isGM, round,
      teamA, teamB, gauges, isTeamA, isTeamB,
      cA: { ...cA, p1L: POSTE_LABEL[cA.p1] ?? "—", p2L: POSTE_LABEL[cA.p2] ?? "—" },
      cB: { ...cB, p1L: POSTE_LABEL[cB.p1] ?? "—", p2L: POSTE_LABEL[cB.p2] ?? "—" },
      bonusA, bonusB,
      v1L: vLabel(v1), v1C: vCls(v1),
      v2L: vLabel(v2), v2C: vCls(v2),
      rollA, rollB, totA, totB,
      duelReady: rollA !== null && rollB !== null,
      duel,
    };
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────
  _onRender(context, options) {
    super._onRender(context, options);
    if      (context.phase === "setup")  this.#renderSetup(context);
    else if (context.phase === "choose") this.#renderChoose(context);
    else if (context.phase === "reveal") this.#renderReveal(context);
    else if (context.phase === "ended")  this.#renderEnded(context);
  }

  // ─── Setup ────────────────────────────────────────────────────────────────
  #renderSetup(context) {
    if (!context.isGM) return;

    // Drag acteur équipe A
    this.#setupActorDrop(".quid-drop-a", async actorId => {
      const store = QuidditchApp.getStore();
      store.teamA ??= {};
      store.teamA.actorId = actorId;
      const actor = game.actors.get(actorId);
      if (actor && !store.teamA.name) store.teamA.name = actor.name;
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // Drag acteur équipe B
    this.#setupActorDrop(".quid-drop-b", async actorId => {
      const store = QuidditchApp.getStore();
      store.teamB ??= {};
      store.teamB.actorId = actorId;
      const actor = game.actors.get(actorId);
      if (actor && !store.teamB.name) store.teamB.name = actor.name;
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // Retirer acteur A
    this.element.querySelector(".quid-remove-a")?.addEventListener("click", async () => {
      const store = QuidditchApp.getStore();
      store.teamA = { name: store.teamA?.name ?? "", actorId: null, quaffle: 0, vifDor: 50 };
      await QuidditchApp.saveStore(store);
      this.render();
    });
    this.element.querySelector(".quid-remove-b")?.addEventListener("click", async () => {
      const store = QuidditchApp.getStore();
      store.teamB = { name: store.teamB?.name ?? "", actorId: null, quaffle: 0, vifDor: 50 };
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // Champ nom équipe A
    this.element.querySelector("#quid-name-a")?.addEventListener("change", async e => {
      const store = QuidditchApp.getStore();
      store.teamA ??= {};
      store.teamA.name = e.target.value.trim() || "Équipe A";
      await QuidditchApp.saveStore(store);
    });
    this.element.querySelector("#quid-name-b")?.addEventListener("change", async e => {
      const store = QuidditchApp.getStore();
      store.teamB ??= {};
      store.teamB.name = e.target.value.trim() || "Équipe B";
      await QuidditchApp.saveStore(store);
    });

    // Commencer
    this.element.querySelector(".quid-start")?.addEventListener("click", async () => {
      const store = QuidditchApp.getStore();
      if (!store.teamA?.actorId || !store.teamB?.actorId) {
        ui.notifications.warn("Assignez un joueur à chaque équipe.");
        return;
      }
      store.teamA.quaffle ??= 0;  store.teamA.vifDor ??= 50;
      store.teamB.quaffle ??= 0;  store.teamB.vifDor ??= 50;
      store.phase   = "choose";
      store.round   = 1;
      store.current = { choiceA: { p1: "", p2: "", locked: false }, choiceB: { p1: "", p2: "", locked: false }, rollA: null, rollB: null };
      await QuidditchApp.saveStore(store);
      this.render();
    });
  }

  // ─── Choose ───────────────────────────────────────────────────────────────
  #renderChoose(context) {
    const { isTeamA, isTeamB, aLocked, bLocked } = context;

    if (isTeamA && !aLocked) {
      this.element.querySelector(".quid-lock-a")?.addEventListener("click", async () => {
        const p1 = this.element.querySelector("#quid-p1a")?.value;
        const p2 = this.element.querySelector("#quid-p2a")?.value;
        if (!p1 || !p2) { ui.notifications.warn("Choisissez 2 postes."); return; }
        const store = QuidditchApp.getStore();
        store.current.choiceA = { p1, p2, locked: true };
        if (store.current.choiceB?.locked) store.phase = "reveal";
        await QuidditchApp.saveStore(store);
        this.render();
      });
    }

    if (isTeamB && !bLocked) {
      this.element.querySelector(".quid-lock-b")?.addEventListener("click", async () => {
        const p1 = this.element.querySelector("#quid-p1b")?.value;
        const p2 = this.element.querySelector("#quid-p2b")?.value;
        if (!p1 || !p2) { ui.notifications.warn("Choisissez 2 postes."); return; }
        const store = QuidditchApp.getStore();
        store.current.choiceB = { p1, p2, locked: true };
        if (store.current.choiceA?.locked) store.phase = "reveal";
        await QuidditchApp.saveStore(store);
        this.render();
      });
    }

    // GM : forcer le passage en révélation
    this.element.querySelector(".quid-force-reveal")?.addEventListener("click", async () => {
      const store = QuidditchApp.getStore();
      store.current.choiceA ??= { p1: "", p2: "" };
      store.current.choiceB ??= { p1: "", p2: "" };
      store.phase = "reveal";
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // GM : réinitialiser
    this.element.querySelector(".quid-reset-btn")?.addEventListener("click", async () => {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Réinitialiser" },
        content: "<p>Réinitialiser la partie de Quidditch ?</p>",
      });
      if (!ok) return;
      await QuidditchApp.saveStore({});
      this.render();
    });
  }

  // ─── Reveal ───────────────────────────────────────────────────────────────
  #renderReveal(context) {
    const { isTeamA, isTeamB, isGM } = context;

    // Lancer dé équipe A (le joueur A ou le MJ)
    if (isTeamA && context.rollA === null) {
      this.element.querySelector(".quid-roll-a")?.addEventListener("click", async () => {
        const r = await new Roll("1d6").evaluate();
        const store = QuidditchApp.getStore();
        store.current.rollA = r.total;
        await QuidditchApp.saveStore(store);
        this.render();
      });
      this.element.querySelector(".quid-set-a")?.addEventListener("click", async () => {
        const v = parseInt(this.element.querySelector("#quid-input-a")?.value);
        if (v >= 1 && v <= 6) { const s = QuidditchApp.getStore(); s.current.rollA = v; await QuidditchApp.saveStore(s); this.render(); }
      });
    }

    // Lancer dé équipe B (le joueur B ou le MJ)
    if (isTeamB && context.rollB === null) {
      this.element.querySelector(".quid-roll-b")?.addEventListener("click", async () => {
        const r = await new Roll("1d6").evaluate();
        const store = QuidditchApp.getStore();
        store.current.rollB = r.total;
        await QuidditchApp.saveStore(store);
        this.render();
      });
      this.element.querySelector(".quid-set-b")?.addEventListener("click", async () => {
        const v = parseInt(this.element.querySelector("#quid-input-b")?.value);
        if (v >= 1 && v <= 6) { const s = QuidditchApp.getStore(); s.current.rollB = v; await QuidditchApp.saveStore(s); this.render(); }
      });
    }

    // Retour aux choix (GM)
    this.element.querySelector(".quid-back-btn")?.addEventListener("click", async () => {
      const store = QuidditchApp.getStore();
      store.phase = "choose";
      store.current.choiceA = { p1: "", p2: "", locked: false };
      store.current.choiceB = { p1: "", p2: "", locked: false };
      store.current.rollA   = null;
      store.current.rollB   = null;
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // Appliquer les effets (GM)
    if (isGM) {
      this.element.querySelector(".quid-apply-btn")?.addEventListener("click", async () => {
        if (!context.duel) return;
        const store = QuidditchApp.getStore();
        for (const eff of context.duel.effects) {
          const team = eff.teamKey === "A" ? store.teamA : store.teamB;
          const cap  = eff.gaugeKey === "vifDor" ? 200 : 100;
          team[eff.gaugeKey] = Math.max(0, Math.min(cap, (team[eff.gaugeKey] ?? 0) + eff.delta));
        }

        const end = checkEnd(store.teamA, store.teamB);
        if (end) {
          // Appliquer le bonus Vif d'or au score final (affiché seulement, pas stocké dans quaffle)
          store.phase   = "ended";
          store.capture = end.capture;
          store.finalA  = end.finalA;
          store.finalB  = end.finalB;
          store.winner  = end.winner;
        } else {
          store.round   = (store.round ?? 1) + 1;
          store.phase   = "choose";
          store.current = { choiceA: { p1: "", p2: "", locked: false }, choiceB: { p1: "", p2: "", locked: false }, rollA: null, rollB: null };
        }
        await QuidditchApp.saveStore(store);
        this.render();
      });
    }
  }

  // ─── Ended ────────────────────────────────────────────────────────────────
  #renderEnded(context) {
    if (!context.isGM) return;
    this.element.querySelector(".quid-reset-btn")?.addEventListener("click", async () => {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Nouvelle partie" },
        content: "<p>Démarrer une nouvelle partie de Quidditch ?</p>",
      });
      if (!ok) return;
      await QuidditchApp.saveStore({});
      this.render();
    });
  }

  // ─── Utilitaire drop acteur ────────────────────────────────────────────────
  #setupActorDrop(selector, callback) {
    const zone = this.element.querySelector(selector);
    if (!zone) return;
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over"); });
    zone.addEventListener("drop", async e => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      let data;
      try {
        const text = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/json");
        data = JSON.parse(text);
      } catch { return; }
      if (data.type !== "Actor" && data.documentName !== "Actor") return;
      const actorId = data.uuid?.split(".").pop() ?? data.id;
      if (actorId) await callback(actorId);
    });
  }
}
