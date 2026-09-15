# Buvette MVB

Appli de caisse et de stock pour la buvette du club de volley MVB (Montaigu-Vendée Boufféré Volley-Ball).
React 19 + Vite + react-router (HashRouter), Firebase Auth + Firestore, hébergée sur GitHub Pages.
Le README décrit l'installation pas à pas pour un humain ; ce fichier résume ce qu'il faut savoir pour travailler dessus.

## Commandes

```bash
npm run dev          # appli sur la vraie base (config dans .env, versionné : non secret)
npm run emulators    # émulateurs Auth + Firestore (laisser tourner)
npm run seed         # données de démo : admin@buvette.test / buvette123, QR #/b/demo-qr-key
npm run dev:local    # appli branchée sur les émulateurs
npm run build
npm run test:rules   # tests des règles Firestore (lance son propre émulateur)
```

Pièges sous Windows :
- Java 17 installé : rester sur `firebase-tools@13` (v14+ exige Java 21).
- Dans PowerShell, `npx` est bloqué par l'execution policy : utiliser `npx.cmd`.
- L'avertissement `EBADENGINE` (Node 24) est sans conséquence.
- Arrêter une tâche en arrière-plan ne tue pas toujours Vite / l'émulateur Java : vérifier les ports 5173, 8080, 9099, 4400.
- Ouvrir l'appli locale seulement une fois les émulateurs prêts, sinon Firebase reste hors ligne (Ctrl+F5).

## Déploiement

- Chaque push sur `main` reconstruit et publie le site (`.github/workflows/deploy.yml`) : https://ferysword.github.io/Stock_Apply/
- Les règles Firestore ne partent pas avec le site. Après toute modification de `firestore.rules` :
  `npx.cmd -y firebase-tools@13 deploy --only firestore:rules --project gestion-stock-5023e`
  (déploiement en production : c'est l'utilisateur qui le lance, via `! commande` dans le prompt).
- Pousser le front avant les règles est possible si l'ancien comportement reste valide en attendant.

## Rôles

| Rôle | Comment on l'obtient | Droits |
| --- | --- | --- |
| Admin | document `admins/{uid}` créé à la main dans la console | tout |
| Gestionnaire | lien d'invitation (onglet Équipe) → `managers/{uid}` | produits (lecture, ajout, modification, pas de suppression) et vente |
| Bénévole | compte anonyme + scan du QR code → `devices/{uid}` | lire les produits, vendre |

`useSession()` (`src/lib/session.jsx`) expose `isAdmin`, `isManager`, `isStaff`, `staffName` et `refresh()`.
Dans `App.jsx`, `StaffGuard` protège `/admin` et `AdminOnly` renvoie un gestionnaire vers `/admin/produits`.

## Données (Firestore)

- `admins/{uid}`, `managers/{uid}` `{ name, email, invite, createdAt }`
- `invites/{jeton}` `{ role, createdBy, createdAt, expiresAt, usedBy?, usedAt? }` : valable 48 h, usage unique ; le jeton secret est l'ID du document
- `private/access` `{ key }` : clé du QR code bénévoles (la régénérer coupe tous les accès)
- `devices/{uid}` `{ key, firstName, lastName, day, createdAt, expiresAt, leftAt? }` : « Quitter » écrit `leftAt` et `expiresAt` = maintenant (statut « Déconnecté » côté admin)
- `shifts/{id}` : présences, source des bénévoles présents dans les clôtures
- `products/{id}` : prix en centimes, stock, logo en base64 (256 px)
- `sales/{id}` : créée dans le même batch que la baisse de stock (imposé par les règles)
- `closures/{jour}` : calculées côté admin (`src/lib/closures.js`)

## Règles métier

- Une journée va de 4 h à 4 h le lendemain : toujours passer par `src/lib/day.js` (`businessDay`, `dayEnd`, `formatDay`).
- Montants stockés en centimes, affichés avec `formatEuros` (« 2,50 € »).
- Vente bénévole : quantité → Carte ou Espèces → écran de confirmation → « Valider la vente ». Rien n'est écrit avant la validation.
- Toute modification de `firestore.rules` s'accompagne d'un test dans `tests/rules.test.mjs`, puis de `npm run test:rules`.

## Design

- Charte du club, reprise de la maquette Claude Design (zip non versionné à la racine) : jaune `#F2CA07`, noir `#1D1D1D`.
- Variables `--mvb-*`, composants et mises en page dans `src/styles.css` ; pas de styles en ligne.
- Titres en Barlow Condensed 700 majuscules, texte en Inter (Google Fonts dans `index.html`).
- Jamais de texte blanc sur le jaune. Aucun emoji. Paiement : Carte en noir, Espèces en jaune.
- Composants communs : `Crest` (blason), `Modal` + `DialogHead`, `StockBadge`, `ProductImage`, `Spinner`.
- Mobile d'abord pour les bénévoles (zones tactiles ≥ 44 px), admin utilisable aussi sur téléphone.

## Conventions

- Tout est en français : interface, commentaires, messages de commit.
- Commits au nom de l'utilisateur uniquement, sans ligne `Co-Authored-By`.
- Non versionnés volontairement : modif locale de `vite.config.js`, zip de maquette, `coca.png`, `logo-mvb-blason.png`, `docs/`.
