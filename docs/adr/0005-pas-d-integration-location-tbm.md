# Pas d'intégration directe avec la location TBM

TBM ne publie aucune API pour louer ou débloquer un vélo ; seul le flux de disponibilités (GBFS) est
ouvert. Relais se contente d'un bouton qui ouvre l'appli officielle TBM au moment du retrait.

## Considered Options

- **Utiliser l'API privée de l'appli TBM** : rejeté. Contraire à leurs conditions, risque de blocage
  du compte de l'utilisateur, casse à chaque mise à jour de l'appli TBM, et inacceptable pour un
  projet open source.

## Consequences

- Le bouton lance l'appli TBM par son package `com.infotbm.tbm` : aucun lien profond n'existe
  (voir `docs/regles-tbm.md`).
