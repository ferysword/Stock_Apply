# Buvette - gestion de stock

Application web de gestion de stock et de caisse pour la buvette du club.

- **Bénévoles** : scannent le QR code affiché à la buvette, saisissent prénom + nom (la date de la journée est ajoutée automatiquement), puis enregistrent les ventes : logo du produit, quantité, carte ou espèces.
- **Admin** : ventes en temps réel, clôtures journalières, produits (logos, prix, stock), réappro, QR code d'accès.

Une **journée** va de **4h à 4h** le lendemain (une vente à 1h du matin compte pour la veille). L'accès bénévole expire à 4h : il faut rescanner le QR code à chaque nouvelle journée.

Hébergement : **GitHub Pages** (site statique) + **Firebase** (authentification et base Firestore, offre gratuite).

## 0. Essayer en local sans compte (démo)

Nécessite Java 11+. Les émulateurs Firebase tournent sur ta machine, aucune donnée n'est envoyée.

```bash
npm install
npm run emulators      # terminal 1 : lance les émulateurs (laisser ouvert)
npm run seed           # terminal 2 : crée un admin, des produits et un QR code de démo
npm run dev:local      # terminal 2 : lance l'appli sur http://localhost:5173
```

- Admin : <http://localhost:5173/#/admin/login> avec `admin@buvette.test` / `buvette123`
- Bénévole : <http://localhost:5173/#/b/demo-qr-key>

Les données de démo sont effacées à l'arrêt des émulateurs.

## 1. Créer le projet Firebase

1. Aller sur <https://console.firebase.google.com> et créer un projet (Google Analytics inutile).
2. **Build > Authentication > Commencer**, onglet *Méthodes de connexion*, activer :
   - **Adresse e-mail/Mot de passe** (admins)
   - **Anonyme** (bénévoles via QR code)
3. **Build > Firestore Database > Créer une base de données** : mode production, région `europe-west9 (Paris)` ou `eur3`.
4. **Firestore > Règles** : coller le contenu de [`firestore.rules`](firestore.rules) puis **Publier**.
5. **Paramètres du projet > Général > Vos applications > Web (</>)** : créer une app et noter `apiKey`, `authDomain`, `projectId`, `appId`.

### Créer le compte admin

1. **Authentication > Utilisateurs > Ajouter un utilisateur** (e-mail + mot de passe). Copier son **UID**.
2. **Firestore > Données > Commencer une collection** :
   - ID de la collection : `admins`
   - ID du document : *l'UID copié*
   - un champ `email` (string) avec l'adresse

Répéter pour chaque admin supplémentaire.

## 2. Lancer en local

La config Firebase du projet est dans [`.env`](.env) (pour un autre projet, remplacer les 4 valeurs, voir `.env.example`).

```bash
npm install
npm run dev
```

## 3. Mettre en ligne sur GitHub Pages

1. Créer le repo GitHub et pousser le code sur la branche `main`.
2. **Settings > Pages > Source : GitHub Actions**.
3. Dans Firebase : **Authentication > Paramètres > Domaines autorisés**, ajouter `<ton-compte>.github.io`.

Chaque push sur `main` redéploie le site (workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).
La config Firebase n'est pas un secret (elle est visible dans le site de toute façon) : la sécurité repose sur les règles Firestore.
Les règles se publient avec `npx firebase-tools@13 deploy --only firestore:rules`.

## 4. Utilisation

1. L'admin se connecte : `https://<compte>.github.io/<repo>/#/admin/login`.
2. **Produits** : ajouter les produits avec leur logo, prix, stock initial et seuil d'alerte.
3. **Accès bénévoles** : générer le QR code et l'imprimer pour l'afficher à la buvette.
4. Les bénévoles scannent, s'identifient et vendent. Le stock est mis à jour en temps réel sur tous les écrans.
5. **Réappro groupé** (page Produits) : ajouter les quantités livrées ou saisir le stock compté (inventaire).
6. **Clôtures** : chaque journée terminée (après 4h) est clôturée automatiquement à l'ouverture de la page. On y retrouve les bénévoles présents (heure d'arrivée), ce que chacun a vendu, et les totaux carte/espèces. Bouton *Clôturer maintenant* pour une clôture provisoire en cours de journée, *Recalculer* après une annulation de vente.

**Régénérer le QR code** coupe immédiatement l'accès de tous les bénévoles (en cas de fuite du QR code).

## Fonctionnement technique

| Collection | Contenu |
| --- | --- |
| `admins/{uid}` | comptes administrateurs |
| `private/access` | clé secrète du QR code (lisible par les admins uniquement) |
| `devices/{uid}` | téléphone bénévole de la journée (nom, clé, expiration à 4h) |
| `shifts/{id}` | présences : un document par scan |
| `products/{id}` | produits (prix en centimes, stock, logo en base64) |
| `sales/{id}` | ventes |
| `closures/{jour}` | clôtures journalières |

- Les règles Firestore imposent qu'une vente soit toujours enregistrée avec la baisse de stock correspondante, au bon prix. Un bénévole ne peut rien modifier d'autre.
- Hors connexion, les ventes sont mises en file d'attente sur le téléphone et envoyées au retour du réseau.
- Les logos sont redimensionnés dans le navigateur (256 px) et stockés directement dans Firestore (Firebase Storage n'est plus gratuit).

### Tester les règles de sécurité

Nécessite Java 11+.

```bash
npm run test:rules
```
