import { MODULE_ID } from "../constants.js";

export function getActorNotes() {
  try { return game.settings.get(MODULE_ID, "actor-notes") ?? {}; }
  catch { return {}; }
}

export async function addActorNote(actorId, text) {
  const all = getActorNotes();
  const entries = all[actorId] ?? [];
  entries.push({
    text: text.trim(),
    author: game.user.name,
    date: new Date().toLocaleDateString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    })
  });
  all[actorId] = entries;
  await game.settings.set(MODULE_ID, "actor-notes", all);
}

export async function deleteActorNote(actorId, index) {
  const all = getActorNotes();
  const entries = all[actorId] ?? [];
  entries.splice(index, 1);
  all[actorId] = entries;
  await game.settings.set(MODULE_ID, "actor-notes", all);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function registerNoteModal(app) {
  const modal = app.element.querySelector(".hp4-note-modal");
  if (!modal) return;

  let currentActorId = null;

  // Ouvrir la modale
  app.element.querySelectorAll(".hp4-note-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentActorId = btn.dataset.id;
      const actor = game.actors.get(currentActorId);
      const all = getActorNotes();
      const entries = all[currentActorId] ?? [];

      modal.querySelector(".hp4-note-actor-name").textContent = actor?.name ?? "?";

      // Afficher le journal
      const journal = modal.querySelector(".hp4-note-journal");
      journal.innerHTML = entries.length === 0
        ? `<p class="hp4-empty">Aucune note pour l'instant.</p>`
        : entries.map((e, i) => `
            <div class="hp4-journal-entry">
              <div class="hp4-journal-meta">
                <span class="hp4-journal-author">${escapeHtml(e.author)}</span>
                <span class="hp4-journal-date">${escapeHtml(e.date)}</span>
                ${game.user.isGM ? `<button type="button" class="hp4-journal-delete" data-index="${i}" title="Supprimer"><i class="fas fa-trash"></i></button>` : ""}
              </div>
              <div class="hp4-journal-text">${escapeHtml(e.text)}</div>
            </div>
          `).join("");

      // Boutons supprimer (GM)
      journal.querySelectorAll(".hp4-journal-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = parseInt(btn.dataset.index);
          await deleteActorNote(currentActorId, idx);
          btn.closest(".hp4-journal-entry").remove();
          // Mettre à jour le compteur
          const remaining = getActorNotes()[currentActorId]?.length ?? 0;
          updateNoteCount(app, currentActorId, remaining);
        });
      });

      modal.querySelector(".hp4-note-textarea").value = "";
      modal.style.display = "flex";
    });
  });

  // Fermer
  modal.querySelector(".hp4-note-cancel").addEventListener("click", () => {
    modal.style.display = "none";
    app.render();
  });

  // Ajouter une entrée
  modal.querySelector(".hp4-note-save").addEventListener("click", async () => {
    const text = modal.querySelector(".hp4-note-textarea").value.trim();
    if (!text) return;
    await addActorNote(currentActorId, text);
    modal.style.display = "none";
    app.render();
  });
}

function updateNoteCount(app, actorId, count) {
  const btn = app.element.querySelector(`.hp4-note-btn[data-id="${actorId}"]`);
  if (!btn) return;
  const badge = btn.querySelector(".hp4-note-count");
  if (count > 0) {
    if (badge) badge.textContent = count;
    else btn.insertAdjacentHTML("beforeend", `<span class="hp4-note-count">${count}</span>`);
  } else {
    badge?.remove();
  }
}