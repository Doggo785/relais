# Identité visuelle propre, sans la marque TBM

Relais n'est pas une appli officielle : elle n'utilise ni le logo, ni les couleurs, ni le nom
commercial de TBM ou de Le Vélo dans son icône et son interface (seulement pour désigner le service).
On évite qu'un utilisateur la confonde avec l'appli TBM, et les ennuis avec l'exploitant. Le thème
suit le réglage clair/sombre d'Android ; le fond de carte est OpenStreetMap standard, dont les
couleurs sont inversées en CSS en thème sombre. L'appli s'identifie dans son User-Agent, comme le
demande la politique d'usage des tuiles OSM.

## Considered Options

- **CARTO (Voyager / Dark Matter)** : choisi d'abord, abandonné : ses fonds exigent désormais une clé API.
- **Plan IGN** : plus épuré, sans clé, mais tuiles 2,5× plus lourdes et serveur plus lent ; trop lent
  sur une connexion mobile faible. À reconsidérer si les serveurs OSM refusent l'appli (forte diffusion).
