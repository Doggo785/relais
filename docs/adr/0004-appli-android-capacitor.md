# Appli Android avec Capacitor, en JavaScript

Les alertes de 20 et 25 min doivent sonner alors que Google Maps est au premier plan : seule une appli
installée peut programmer des notifications fiables (une PWA en arrière-plan est mise en pause par
Android). Capacitor emballe l'interface web existante dans une appli Android et lui donne les
notifications programmées. Tout le projet passe en JavaScript (calcul d'itinéraire, script de
matrice, tests `node:test`) ; le prototype Python est supprimé. Android uniquement.

## Considered Options

- **PWA seule** : rejetée, alertes non fiables en arrière-plan.
- **Kotlin natif** : rejeté, tout réécrire pour un gain faible. La consommation d'énergie dépend
  surtout du GPS, de l'écran et du réseau, pas du framework (voir Sobriété).
- **iOS** : écarté pour l'instant (Mac et compte développeur à 99 €/an nécessaires).

## Sobriété

- GPS seulement à la demande (boutons 📍, « Borne pleine », « Aucun vélo »), jamais de suivi continu.
- Disponibilités relues à l'ouverture et à chaque relais, jamais en boucle.
- Alertes programmées une fois au début de chaque étape : elles sonnent même si Android a fermé Relais.
- Aucun service en arrière-plan.

## Consequences

- Le trajet en cours est enregistré sur le téléphone : Android peut fermer Relais à tout moment.
- Android 12+ : la permission « Alarmes et rappels » est demandée une fois pour des alertes précises.
