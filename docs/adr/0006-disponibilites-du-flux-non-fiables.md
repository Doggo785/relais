# Les disponibilités du flux ne sont pas fiables

En pratique, un vélo annoncé disponible ne se débloque pas toujours. Le calcul garde donc des marges
plutôt que de croire le flux sur parole : une borne est sûre si elle annonce au moins 2 vélos
classiques (premier retrait) ou 2 places libres (dépôt ou relais, voir ADR 0008). Avec 1 seul, elle est risquée : pas exclue, mais le
calcul lui ajoute 3 min de pénalité (on ne la choisit que si elle fait vraiment gagner du temps) et
l'appli l'affiche avec un badge « ⚠ risqué » et ses bornes de secours en avant.
Chaque retrait propose des bornes de secours, un bouton « Aucun vélo ne se débloque » recalcule à pied
depuis la position actuelle, une borne signalée par l'utilisateur est évitée 2 h, et une borne
muette (aucune mise à jour depuis 30 min) est ignorée.

## Consequences

- Le vélo électrique en dernier recours (payant) viendra plus tard, une fois les tarifs connus.
