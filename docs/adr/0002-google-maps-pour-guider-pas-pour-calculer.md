# Google Maps pour le guidage, OSRM pour le calcul

Chaque étape propose un bouton qui ouvre Google Maps en guidage vélo vers la borne visée (simple lien,
gratuit, sans clé). Le découpage en étapes, lui, repose sur une matrice de durées calculée avec OSRM
(profil vélo, données OpenStreetMap).

## Considered Options

- **API Google (Routes / Distance Matrix) comme moteur** : rejeté. ~54 000 éléments par matrice
  (~270 $ à chaque recalcul), clé API à protéger, et les conditions Google interdisent de garder les
  résultats plus de 30 jours et de les afficher sur une carte non Google.

## Consequences

- Pendant le trajet, Relais est en arrière-plan derrière Google Maps : ses alertes doivent marcher
  sans être à l'écran (voir ADR 0004).
