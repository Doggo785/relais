# Pas de serveur : tout tourne sur le téléphone

Le flux GBFS de Bordeaux Métropole accepte les requêtes venant d'un navigateur (CORS ouvert), et la
matrice des durées vélo entre les 232 bornes ne pèse que ~150 Ko compressée. Le calcul d'itinéraire,
la lecture des disponibilités et la recherche d'adresse se font donc sur le téléphone ; la matrice
est un fichier statique. Pas de serveur à héberger ni à maintenir, et aucune donnée ne quitte le
téléphone sauf vers les services publics (GBFS, géocodage IGN, tuiles OSM, OSRM pour les tracés).

## Considered Options

- **Backend FastAPI (premier prototype)** : cache GBFS + matrice côté serveur. Abandonné : un serveur
  à faire tourner pour une appli perso, alors que rien ne l'exige.

## Consequences

- Une borne ajoutée par TBM n'est connue qu'après régénération de la matrice (voir ADR 0003).
