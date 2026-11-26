# Relais

Itinéraires Le Vélo par TBM (Bordeaux) découpés en étapes de 25 min maximum, pour que chaque
location reste dans les 30 minutes gratuites.

Appli Android (Capacitor), sans serveur. Décisions : [`docs/adr/`](docs/adr/). Vocabulaire :
[`GLOSSARY.md`](GLOSSARY.md). Règles TBM sourcées : [`docs/regles-tbm.md`](docs/regles-tbm.md).

## Développer

- `npm install`, puis `npm test` (calcul d'itinéraire, `node:test`).
- Interface dans un navigateur : `npm run vendor`, puis servir `www/` (ex. `python3 -m http.server -d www`).
  Hors appli, pas de notifications : seulement une vibration quand la page est à l'écran.
- `npm run matrix` : recalcule `www/matrix.json` (OSRM vélo, ~5 min, variable `OSRM_URL` possible).
- `npm run android` : APK de debug dans `android/app/build/outputs/apk/debug/` (JDK 21 et SDK Android requis,
  `JAVA_HOME` et `ANDROID_HOME` renseignés).

## Périmètre

**v1**
- Carte, recherche d'adresse, position GPS, itinéraire découpé en étapes avec relais.
- Bornes sûres, bornes risquées (badge ⚠), préférence pour les bornes les mieux fournies, bornes de secours au retrait et au dépôt,
  bornes muettes ignorées.
- Boutons « Borne pleine », « Aucun vélo ne se débloque », signalement d'une borne (évitée 2 h),
  « Débloquer » (ouvre l'appli TBM), « Naviguer » (ouvre Google Maps en mode vélo).
- Chrono par étape, alertes programmées à 20 et 25 min, trajet en cours enregistré sur le téléphone.
- Réglage abonné / occasionnel pour le coût affiché.
- Recherche de lieu en plein écran : « Ma position » par défaut au départ, favoris, récents, résultats
  avec type et distance, choix sur la carte (appui long), partage d'un lieu depuis Google Maps.
- Carte plein écran avec panneau glissant, thème clair/sombre, itinéraire en ligne verticale avec heure
  d'arrivée et itinéraires alternatifs.

**v2**
- Partage d'un lien d'itinéraire.
- Vélo électrique en dernier recours, avec son prix.

**Écarté pour l'instant :** mode nuit (le flux dit déjà en temps réel si une borne loue ou accepte les
dépôts) ; iOS.

## Publication

- Messages de commit en anglais, au format Conventional Commits : release-please en déduit la version
  et le changelog, puis ouvre une pull request « chore(main): release x.y.z ».
- Fusionner cette pull request publie la GitHub Release ; le workflow `release` y attache l'APK signé
  `relais-vX.Y.Z.apk` (installable directement ou via Obtainium). Version Android = celle de
  `package.json` (1.4.2 → versionCode 10402).
- Clé de signature : `scripts/setup-signing-key.sh`, une seule fois, depuis le dossier du dépôt. Il crée
  la clé hors du dépôt, remplit les secrets GitHub et fait sauvegarder la clé. **La perdre empêche toute
  mise à jour** de l'appli installée.
- Matrice des durées : le workflow `matrix` la recalcule le 1er de chaque mois et la publie sur GitHub
  Pages (Settings → Pages → Source : GitHub Actions) ; lançable à la main (`gh workflow run matrix`).
  GitHub suspend les tâches planifiées après 60 jours sans activité sur le dépôt.
- Licence MIT.
