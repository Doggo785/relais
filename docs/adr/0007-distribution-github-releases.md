# Distribution par GitHub Releases, versions gérées par release-please, licence MIT

Projet personnel et open source. L'APK signé est construit par GitHub Actions et attaché aux GitHub
Releases (mises à jour via Obtainium). release-please tient le numéro de version et le changelog à
partir des Conventional Commits. Licence MIT ; données citées : OpenStreetMap (ODbL) et open data de
Bordeaux Métropole.

## Consequences

- Conventional Commits obligatoires (`feat:`, `fix:`…). Le `versionCode` Android est déduit de la
  version : 1.4.2 → 10402.
- La clé de signature est générée en local, stockée dans les secrets GitHub et **sauvegardée hors de
  GitHub** : la perdre empêche de mettre à jour l'appli installée (il faut la désinstaller).

## Considered Options

- **Play Store** : 25 $, démarches de publication, peu utile pour un usage perso.
- **F-Droid** : possible plus tard, règles de build strictes.
