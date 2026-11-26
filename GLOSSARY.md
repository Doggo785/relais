# Relais

Relais découpe un trajet en vélo libre-service Le Vélo par TBM (Bordeaux) en étapes assez courtes
pour que chaque location reste dans les 30 minutes gratuites.

## Réseau

**Borne**:
Point de location Le Vélo où l'on retire et dépose les vélos ; elle a des vélos disponibles et des places libres.
_Avoid_: station (sauf pour parler du flux GBFS), point vélo

**Vélo classique**:
Vélo sans assistance électrique, le seul gratuit 30 min.
_Avoid_: vélo mécanique, V³, VCub

**Vélo électrique**:
Vélo à assistance électrique, toujours payant.
_Avoid_: VAE

**Location**:
Période entre le retrait d'un vélo et son dépôt ; c'est elle qui est gratuite 30 min.
_Avoid_: emprunt, session

**Abonné**:
Utilisateur avec un abonnement Le Vélo (inclus dans l'abonnement annuel TBM) : ses locations ne coûtent rien sous 30 min.

**Occasionnel**:
Utilisateur sans abonnement, qui paie 1 € chaque retrait de vélo classique, donc chaque relais.
_Avoid_: ticket, pass courte durée

## Lieux

**Lieu**:
Point de départ ou d'arrivée choisi par l'utilisateur : position actuelle, adresse, lieu nommé, borne ou point de la carte.
_Avoid_: adresse (trop étroit), POI, destination

**Favori**:
Lieu enregistré sous un nom par l'utilisateur, comme « Maison » ou « Travail ».

**Récent**:
Un des 10 derniers lieux choisis.
_Avoid_: historique

## Itinéraire

**Itinéraire**:
Trajet complet du départ à l'arrivée : marche, étapes à vélo, relais, marche.
_Avoid_: trajet (ambigu), route

**Itinéraire alternatif**:
Itinéraire proposé en plus du meilleur, au plus 10 minutes plus long : soit sans aucune borne de relais commune avec lui (« Autres bornes »), soit avec moins de relais (« Moins de relais »).
_Avoid_: variante, option

**Étape**:
Portion d'un itinéraire faite avec une seule location, de 25 minutes au plus.
_Avoid_: tronçon, leg, segment

**Relais**:
Arrêt à une borne pour déposer le vélo puis le reprendre aussitôt, afin de commencer une nouvelle location.
_Avoid_: correspondance, changement

**Matrice des durées**:
Durée à vélo de chaque borne vers chaque autre, calculée à l'avance.
_Avoid_: table, graphe

## Fiabilité

**Borne sûre**:
Borne qui annonce au moins 2 vélos classiques pour le premier retrait, ou au moins 2 places libres pour un dépôt ou un relais.

**Borne risquée**:
Borne utilisable qui n'annonce qu'un vélo classique (retrait) ou qu'une place libre (dépôt), donc peut décevoir.

**Borne de secours**:
Borne à moins de 400 m d'une borne de l'itinéraire, utilisable si celle-ci fait défaut.
_Avoid_: borne de repli, alternative

**Borne signalée**:
Borne que l'utilisateur a marquée comme défaillante ; elle est évitée pendant 2 heures.
_Avoid_: liste noire, borne bannie

**Borne muette**:
Borne dont le flux n'a rien envoyé depuis plus de 30 minutes ; elle est ignorée.
_Avoid_: borne hors ligne, borne périmée
