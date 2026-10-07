# Cultures — référentiel agricole

## Périmètre

Domaine **Agriculture** de Koukou Ferme, phase 1 : référentiel des cultures
(global, partagé par toutes les fermes) et CRUD des parcelles. Le domaine
Aviculture (Élevage) et le domaine Agriculture sont deux modes de la même
application : l'utilisateur bascule via « Élevage / Agriculture » sur l'accueil
et dans les écrans du domaine.

## Catégories de cultures (`CropCategory`)

Cinq catégories, ordre d'affichage mobile (`CROP_CATEGORY_ORDER`) :

| Code | Libellé FR (mobile) | Émoji mobile |
|---|---|---|
| `TUBERCULE` | Tubercule | 🥔 |
| `MARAICHAGE` | Maraîchage | 🥬 |
| `FRUIT` | Fruit | 🍉 |
| `CEREALE` | Céréale | 🌾 |
| `AUTRE` | Autre | 🌱 |

## Culture (entité `cultures`)

- `name` — unique (global) ; doublon → `409`.
- `category` — `CropCategory`.
- `defaultCycleDays` — durée de cycle indicativement en jours (conseil phase 2).
- `waterNeedsLPlantDay` — besoin d'eau de la culture, L/plant/jour (conseil phase 2).
- `isCustom` — `true` si créée par un PROPRIETAIRE (sinon seed).
- `active` — référentiel actif ; `GET /cultures` ne renvoie que les actives.
- `notes`, `createdAt`, `updatedAt`.

### Référentiel seedé (idempotent par nom, 39 cultures)

- **Tubercules** (7) : Plantain (330 j, 4 L), Manioc (365 j, 3 L), Macabo (270 j, 3 L),
  Igname (300 j, 4 L), Taro (270 j, 3,5 L), Patate douce (120 j, 2 L), Pomme de terre (110 j, 2,5 L).
- **Maraîchage** (18) : Tomate (90 j, 1,5 L), Oignon (120 j, 1 L), Aubergine (100 j, 1,5 L),
  Piment (90 j, 1 L), Gombo (75 j, 1 L), Carotte (120 j, 1 L), Betterave (100 j, 1,5 L),
  Courgette (60 j, 1,5 L), Concombre (70 j, 1,5 L), Laitue (65 j, 1 L), Chou (110 j, 1,5 L),
  Haricot vert (65 j, 1,2 L), Épinard (55 j, 0,9 L), Amarante / folon (45 j, 0,8 L),
  Oseille de Guinée (55 j, 0,8 L), Poivron (120 j, 1,5 L), Échalote (100 j, 0,9 L),
  Poireau (130 j, 1 L).
- **Fruits** (11) : Mangue (1500 j, 20 L), Papaye (365 j, 15 L), Avocat (1500 j, 25 L),
  Agrumes (1000 j, 18 L), Banane douce (400 j, 12 L), Ananas (600 j, 6 L),
  Safou / prune d'Afrique (1400 j, 15 L), Goyave (300 j, 10 L), Corossol (365 j, 12 L),
  Noix de coco (2100 j, 20 L), Fruit de la passion (300 j, 8 L).
- **Céréales** (5) : Maïs (100 j, 1,5 L), Riz (paddy) (140 j, 8 L), Sorgho (105 j, 1 L),
  Mil (120 j, 1,2 L), Fonio (90 j, 1 L).

## Routes

- `GET /cultures` — référentiel actif, trié catégorie puis nom. Lecture : PROPRIETAIRE + ELEVEUR (aucune permission fine).
- `POST /cultures` — culture personnalisée (`name`, `category`, optionnels `defaultCycleDays`,
  `waterNeedsLPlantDay`, `notes`). PROPRIETAIRE uniquement. Nom en doublon → `409`.

## Règles métier

- **Le référentiel est global** : toutes les fermes partagent la même liste de cultures.
  Une culture « custom » est visible par toutes les fermes.
- Une culture seedée n'est ni modifiable ni supprimable par la phase 1 (pas de route
  PATCH/DELETE) — uniquement création custom.
- Les valeurs de cycle/eau sont **indicatives** (champ conseil), pas encore exploitées
  par un moteur d'alerte comme l'`AdvisoryEngine` avicole.