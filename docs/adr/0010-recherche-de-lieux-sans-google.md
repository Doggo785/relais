# Recherche de lieux sans Google Places

La recherche combine trois sources gratuites et sans clé : la Géoplateforme IGN pour les adresses
(base adresse nationale), Photon (OpenStreetMap, limité à la métropole) pour les lieux nommés, et les
bornes TBM cherchées sur le téléphone. Pour profiter quand même des lieux Google, Relais reçoit le
partage Android depuis Google Maps : il lit l'adresse du texte partagé (IGN), et le lien en secours.

## Considered Options

- **Google Places API** : rejeté. Une clé API dans un APK open source est lisible par tous et facturée
  au propriétaire en cas d'abus ; service payant au-delà du quota ; ses conditions imposent une carte
  Google pour afficher les résultats.
- **Nominatim** : sa politique d'usage interdit l'autocomplétion.
