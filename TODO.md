# TODO - Module Foundry "Gestion Harry Potter"

## Étape 1 — Initialisation du projet
- [ ] Créer la structure de base d’un module Foundry (manifest.json, styles, scripts, templates si besoin).

## Étape 2 — Squelette fonctionnel
- [ ] Ajouter un hook `ready` pour enregistrer les menus/config.
- [ ] Créer une UI de module (Application) pour :
  - [ ] Classes (création + liste)
  - [ ] Emploi du temps (création de créneaux + affichage)
  - [ ] PNJ rencontrés (liste + fiche avec photo)
  - [ ] Coupe des 4 maisons (gestion des points)

## Étape 3 — Données persistantes
- [ ] Choisir un modèle de persistance (ex: `game.settings` pour préférences + `data` via documents/compendiums ou fichiers internes).
- [ ] Implémenter stockage PNJ/classes/cours/points pour qu’ils survivent aux rechargements.

## Étape 4 — Templates UI
- [ ] Créer les templates HTML Handlebars pour chaque écran.

## Étape 5 — Intégration photo / acteur
- [ ] Permettre sélection d’une image via FilePicker.
- [ ] Optionnel : lier l’image à un Actor PBTA si disponible (par l’ID de Actor).

## Étape 6 — Packaging
- [ ] Ajouter README + éventuelle icône.
- [ ] Vérifier que le module se charge dans Foundry v14.

## Étape 7 — Test
- [ ] Lancer Foundry, activer le module, tester toutes les fonctionnalités.

