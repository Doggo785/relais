# Règles Le Vélo par TBM utiles à Relais

Relevé le 2026-11-26. Source principale : CGV TBM, partie F « Conditions particulières Le Vélo par
TBM », version du 17/10/2025
(https://www.infotbm.com/sites/default/files/medias/fichiers/cgv_rpu/CGV_app_TBM.pdf), cohérente avec
le RPU (https://www.infotbm.com/sites/default/files/medias/fichiers/cgv_rpu/RPU_TBM.pdf).
À revérifier avant chaque version publique.

## Gratuité et tarifs

- Les 30 premières minutes de **chaque location** sont gratuites, pour tous (art. 6.3). Facturation dès
  la 31e minute.
- Abonnement vélo classique : inclus dans l'abonnement annuel TBM, sinon 30 €/an. Électrique : 75 €/an,
  45 €/an pour les abonnés TBM. Dépôt de garantie 140 €
  (https://www.infotbm.com/en/v3-comment-ca-marche.html).
- **Occasionnel** (adhésion 24 h) : 1 € par retrait en classique, 2 € en électrique, puis 10 cts/min
  au-delà de 30 min (https://www.infotbm.com/fr/decrocher-un-velo-occasionnellement.html). Chaque relais
  coûte donc 1 € à un occasionnel.
- Un abonné classique peut prendre un vélo électrique, mais l'assistance reste bloquée (art. 6.4).

## Enchaîner les locations

- Aucun délai minimum entre deux locations, aucune interdiction de reprendre le même vélo ou
  d'enchaîner (CGV et RPU lus en entier).
- « Tout emprunt de moins de 2 minutes sur une même station n'est pas facturé » (art. 4.3).
- Résiliation possible pour non-respect des conditions ou fraude (art. 8.2), sans viser l'enchaînement.
- Location limitée à 24 h, au-delà le vélo est considéré comme volé (art. 6.4).

## Retrait

- À la borne (carte TBM/Modalis + code, ou code client + code) ou via l'appli TBM. Les stations SMART
  ne fonctionnent que via l'appli (art. 4.1, 4.3).
- L'appli « Le Vélo » est fermée ; tout passe par l'appli TBM, package `com.infotbm.tbm`
  (https://www.infotbm.com/fr/le-velo-par-tbm.html). Aucun lien profond documenté : on lance l'appli
  par son package.
- Aucune API publique de location ; seules les disponibilités (GBFS) sont ouvertes
  (https://transport.data.gouv.fr/resources/81818).
