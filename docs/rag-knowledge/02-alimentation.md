# Alimentation — provende, FEFO, autonomie, achat externe

## Phases d'aliment selon l'âge

**Pondeuse** (`type = PONDEUSE`) :
- ≤ J10 : `POUSSIN`
- J11–J24 : `DEMARRAGE`
- J25–J112 : `CROISSANCE`
- J113–J126 : `PRE_PONTE`
- > J126 : `PONTE_PHASE_1` (puis phase 2/3 en fin de cycle)

**Chair / autre** :
- ≤ J10 : `POUSSIN`
- J11–J24 : `DEMARRAGE`
- J25–J35 : `CROISSANCE`
- > J35 : `FINITION`

L'écran propose uniquement les phases pertinentes pour le type de lot (les
pondeuses n'ont pas `FINITION`, les lots chair n'ont pas `PRE_PONTE`/`PONTE_*`),
plus `PERSONNALISE`. La phase recommandée est proposée automatiquement selon
l'âge du lot, mais l'éleveur peut toujours en choisir une autre.

## FEFO — First Expire, First Out

Sans indication de lot, la consommation d'aliment est **auto-affectée au
premier lot interne éligible non périmé** disposant du stock, pour la phase
concernée (le lot dont l'expiration est la plus proche est consommé en premier).
Objectifs : éviter les péremptions et maintenir une rotation du stock.
Le stock **ne peut jamais être négatif** : une consommation qui dépasserait le
stock disponible est refusée.

## Autonomie du stock

- `byType[phase].autonomyDays` = nombre de jours de stock restant pour une
  phase, sachant la consommation des dernières saisies.
- **Rouge** : autonomie < **3 jours** (`ALIMENT` ROUGE).
- **Jaune** : autonomie < **5 jours** (ALIMENT JAUNE).
- La recommandation inclut une **quantité de réapprovisionnement suggérée**.

Dans l'écran, un badge « X j stock » affiche l'autonomie de la phase choisie
(orange < 5 j, rouge < 3 j).

## Lot de provende : interne vs achat externe

- **Stock interne** (`skipStockDeduction = false`) : la consommation est
  affectée à un lot interne (choix manuel ou FEFO automatique) et
  **décrémente** le stock. Précédé d'une prévisualisation « restant après cette
  saisie ».
- **Achat externe** (`skipStockDeduction = true`) : la consommation est
  **enregistrée mais ne décrémente aucun lot interne** (ni auto-affectation
  FEFO, ni alerte de rupture). Utilisé pour un achat ponctuel hors stock.
  → Attention : tant que l'entrée n'est pas saisie dans « Provende & stock »,
  elle n'apparaîtra pas dans l'autonomie.
- **Mutuellement exclusifs** : envoyer `skipStockDeduction=true` ET
  `inputLotId` ensemble → erreur 400.

## Quantités

- Deux unités : **kg** ou **sacs** (1 sac = **50 kg** par défaut).
- Entrées de stock côté « Provende & stock » : `BULKER`/`MATIERE_PREMIERE`
  en tonnage (tonnage × 1000 = kg), `BAG` en nombre de sacs × taille du sac,
  `MEDICAMENT` non compté dans l'autonomie (c'est une dose).

## Analyse affichée à la saisie

- **g / oiseau / jour** = `feedKgEquivalent × 1000 / effectif vivant`.
- Écart % vs moyenne des 7 derniers jours enregistrés (avant la date
  sélectionnée). À l'age de pointe, une pondeuse consomme ~110–120 g/j ;
  adapter selon stade et température (à la chaleur, l'ingéré chute → risque
  sur le poids et la ponte).

## Indices de performance dérivés

- **IPE** (Indice de Performance Européen) = poids (kg) × viabilité (%) ×
  100 / (âge (j) × IC), calculé à la dernière pesée. Pas d'échelle absolue
  (≈ 250–400 pour un poulet de chair, variable selon l'espèce et l'âge) : il
  est comparé à l'IPE de la courbe de la souche à l'âge de la pesée
  (poids et IC cibles, viabilité du lot). Lots CHAIR avec référentiel
  uniquement, pesée à J14 ou plus ; retrait > 10 %
  (`IPE_DEVIATION_WARN_PCT`) = JAUNE. Un IPE en retrait signale une ration,
  une densité ou une ambiance à revoir (la mortalité a ses propres alertes).
- **GMQ** (Gain Moyen Quotidien) : baisse >= 10 %
  (`GMQ_DEVIATION_WARN_PCT`) vs la pesée précédente = croissance ralentie.
  Le lot sert de référence à lui-même (pas de comparaison inter-lots).