import { MODULE_ID } from "../constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const POSTES = [
  { key: "gardien",     label: "Gardien" },
  { key: "poursuiveur", label: "Poursuiveur" },
  { key: "batteur",     label: "Batteur" },
  { key: "attrapeur",   label: "Attrapeur" },
];

const POSTE_LABEL = Object.fromEntries(POSTES.map(p => [p.key, p.label]));

// Qui bat qui
const BEATS = {
  gardien:     "poursuiveur",
  poursuiveur: "batteur",
  batteur:     "attrapeur",
  attrapeur:   "gardien",
};

// 1 = A gagne, -1 = B gagne, 0 = neutre/égal
function cmp(a, b) {
  if (!a || !b || a === b) return 0;
  if (BEATS[a] === b) return 1;
  if (BEATS[b] === a) return -1;
  return 0;
}

// Effet d'un poste sur les jauges (du point de vue de l'équipe qui joue ce poste)
const EFFECTS = {
  gardien:     { target: "opp",  gauge: "quaffle", dir: -1, gaugeLabel: "Souaffle" },
  poursuiveur: { target: "self", gauge: "quaffle", dir: +1, gaugeLabel: "Souaffle" },
  batteur:     { target: "opp",  gauge: "vifDor",  dir: -1, gaugeLabel: "Vif d'or" },
  attrapeur:   { target: "self", gauge: "vifDor",  dir: +1, gaugeLabel: "Vif d'or" },
};

export class QuidditchApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "hp4-quidditch-app",
    classes: ["hp4-quidditch"],
    window: { title: "Quidditch", resizable: true },
    position: { width: 660, height: 580 },
  };

  static PARTS = {
    main: { template: "modules/gestion-harry-potter/templates/quidditch.hbs" },
  };

  // ── Store ──────────────────────────────────────────────────────────────────

  static getStore() {
    try { return game.settings.get(MODULE_ID, "quidditch-data") ?? {}; }
    catch { return {}; }
  }

  static async saveStore(store) {
    await game.settings.set(MODULE_ID, "quidditch-data", store);
  }

  // ── Contexte ───────────────────────────────────────────────────────────────

  async _prepareContext() {
    const store = QuidditchApp.getStore();
    const isGM = game.user.isGM;
    const phase = store.phase ?? "setup";

    if (phase === "setup") return { phase: "setup", isGM };

    const teamA = store.teamA ?? { name: "Équipe A", quaffle: 0, vifDor: 0 };
    const teamB = store.teamB ?? { name: "Équipe B", quaffle: 0, vifDor: 0 };
    const round = store.round ?? 1;
    const cur   = store.current ?? {};
    const cA    = cur.choiceA ?? {};
    const cB    = cur.choiceB ?? {};

    const gauges = this.#buildGauges(teamA, teamB);

    if (phase === "choose") {
      return { phase: "choose", isGM, round, teamA, teamB, gauges, postes: POSTES, cA, cB };
    }

    // ── phase "reveal" ──
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
      const ecart  = Math.abs(totA - totB);
      const winKey = totA > totB ? "A" : totB > totA ? "B" : null;
      const winName = winKey === "A" ? teamA.name : winKey === "B" ? teamB.name : null;

      const effects = [];
      const push = (pos, selfTeam, oppTeam, selfKey) => {
        const e = EFFECTS[pos];
        if (!e || !pos) return;
        const targetKey  = e.target === "self" ? selfKey : (selfKey === "A" ? "B" : "A");
        const targetName = e.target === "self" ? selfTeam.name : oppTeam.name;
        const delta      = e.dir * ecart;
        const sign       = delta >= 0 ? `+${delta}` : `${delta}`;
        effects.push({
          desc:      `${POSTE_LABEL[pos]} (${selfTeam.name}) → ${e.gaugeLabel} de ${targetName} ${sign}`,
          gaugeKey:  e.gauge,
          teamKey:   targetKey,
          delta,
        });
      };
      push(cA.p1, teamA, teamB, "A");
      push(cA.p2, teamA, teamB, "A");
      push(cB.p1, teamB, teamA, "B");
      push(cB.p2, teamB, teamA, "B");

      // Jauges projetées
      const pA = { quaffle: teamA.quaffle, vifDor: teamA.vifDor };
      const pB = { quaffle: teamB.quaffle, vifDor: teamB.vifDor };
      for (const eff of effects) {
        const proj = eff.teamKey === "A" ? pA : pB;
        proj[eff.gaugeKey] = Math.max(0, Math.min(100, proj[eff.gaugeKey] + eff.delta));
      }

      duel = { ecart, winKey, winName, tie: !winKey, effects, totA, totB, projA: pA, projB: pB };
    }

    const vLabel = v => v > 0 ? `${teamA.name} +1` : v < 0 ? `${teamB.name} +1` : "Neutre";
    const vCls   = v => v > 0 ? "qw-a" : v < 0 ? "qw-b" : "qw-n";

    return {
      phase: "reveal", isGM, round, teamA, teamB, gauges,
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

  #buildGauges(teamA, teamB) {
    return {
      aQuaffle: teamA.quaffle,  aVifDor: teamA.vifDor,
      bQuaffle: teamB.quaffle,  bVifDor: teamB.vifDor,
    };
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);
    if      (context.phase === "setup")  this.#renderSetup();
    else if (context.phase === "choose") this.#renderChoose(context);
    else                                 this.#renderReveal(context);
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  #renderSetup() {
    this.element.querySelector(".quid-start")?.addEventListener("click", async () => {
      const nameA = this.element.querySelector("#quid-name-a")?.value.trim() || "Équipe A";
      const nameB = this.element.querySelector("#quid-name-b")?.value.trim() || "Équipe B";
      await QuidditchApp.saveStore({
        phase: "choose", round: 1,
        teamA: { name: nameA, quaffle: 0, vifDor: 0 },
        teamB: { name: nameB, quaffle: 0, vifDor: 0 },
        current: { choiceA: {}, choiceB: {}, rollA: null, rollB: null },
      });
      this.render();
    });
  }

  // ── Choose ─────────────────────────────────────────────────────────────────

  #renderChoose(context) {
    if (!context.isGM) return;

    this.element.querySelector(".quid-reveal-btn")?.addEventListener("click", async () => {
      const p1A = this.element.querySelector("#quid-p1a")?.value;
      const p2A = this.element.querySelector("#quid-p2a")?.value;
      const p1B = this.element.querySelector("#quid-p1b")?.value;
      const p2B = this.element.querySelector("#quid-p2b")?.value;
      if (!p1A || !p2A || !p1B || !p2B) {
        ui.notifications.warn("Chaque équipe doit choisir 2 postes.");
        return;
      }
      const store = QuidditchApp.getStore();
      store.current = { choiceA: { p1: p1A, p2: p2A }, choiceB: { p1: p1B, p2: p2B }, rollA: null, rollB: null };
      store.phase = "reveal";
      await QuidditchApp.saveStore(store);
      this.render();
    });

    this.element.querySelector(".quid-reset-btn")?.addEventListener("click", async () => {
      const ok = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Réinitialiser" },
        content: "<p>Réinitialiser la partie de Quidditch ? Toutes les jauges seront perdues.</p>",
      });
      if (!ok) return;
      await QuidditchApp.saveStore({});
      this.render();
    });
  }

  // ── Reveal ─────────────────────────────────────────────────────────────────

  #renderReveal(context) {
    if (!context.isGM) return;

    // Lancers automatiques
    this.element.querySelector(".quid-roll-a")?.addEventListener("click", async () => {
      const r = await new Roll("1d6").evaluate();
      const store = QuidditchApp.getStore();
      store.current.rollA = r.total;
      await QuidditchApp.saveStore(store);
      this.render();
    });
    this.element.querySelector(".quid-roll-b")?.addEventListener("click", async () => {
      const r = await new Roll("1d6").evaluate();
      const store = QuidditchApp.getStore();
      store.current.rollB = r.total;
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // Validation manuelle
    this.element.querySelector(".quid-set-a")?.addEventListener("click", async () => {
      const v = parseInt(this.element.querySelector("#quid-input-a")?.value);
      if (v >= 1 && v <= 6) {
        const store = QuidditchApp.getStore();
        store.current.rollA = v;
        await QuidditchApp.saveStore(store);
        this.render();
      }
    });
    this.element.querySelector(".quid-set-b")?.addEventListener("click", async () => {
      const v = parseInt(this.element.querySelector("#quid-input-b")?.value);
      if (v >= 1 && v <= 6) {
        const store = QuidditchApp.getStore();
        store.current.rollB = v;
        await QuidditchApp.saveStore(store);
        this.render();
      }
    });

    // Retour aux choix
    this.element.querySelector(".quid-back-btn")?.addEventListener("click", async () => {
      const store = QuidditchApp.getStore();
      store.phase = "choose";
      await QuidditchApp.saveStore(store);
      this.render();
    });

    // Appliquer les effets → tour suivant
    this.element.querySelector(".quid-apply-btn")?.addEventListener("click", async () => {
      if (!context.duel) return;
      const store = QuidditchApp.getStore();
      for (const eff of context.duel.effects) {
        const team = eff.teamKey === "A" ? store.teamA : store.teamB;
        team[eff.gaugeKey] = Math.max(0, Math.min(100, (team[eff.gaugeKey] ?? 0) + eff.delta));
      }
      store.round = (store.round ?? 1) + 1;
      store.phase = "choose";
      store.current = { choiceA: {}, choiceB: {}, rollA: null, rollB: null };
      await QuidditchApp.saveStore(store);
      this.render();
    });
  }
}
