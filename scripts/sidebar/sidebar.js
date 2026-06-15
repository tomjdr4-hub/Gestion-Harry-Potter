import { MODULE_ID } from "../constants.js";
import { GestionHarryPotterApp } from "../apps/mainApp.js";

export function registerSidebar() {
  Hooks.on("renderSidebar", () => {
    if (document.querySelector(".hp4-sidebar-tab")) return;

    const menu = document.querySelector("#sidebar .tabs menu");
    if (!menu) return;

    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ui-control plain icon fa-solid fa-chalkboard hp4-sidebar-tab";
    btn.setAttribute("aria-label", "Gestion Harry Potter");
    btn.setAttribute("data-tooltip", "Gestion Harry Potter");

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      new GestionHarryPotterApp().render(true);
    });

    li.appendChild(btn);
    menu.appendChild(li);
  });
}