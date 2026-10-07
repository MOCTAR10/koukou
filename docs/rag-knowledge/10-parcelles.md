# Parcelles — terres & cultures de la ferme

## Périmètre

Phase 1 du domaine Agriculture : chaque parcelle relie une **parcelle géographique**
(optionnellement un contour GeoJSON) à une **culture** du référentiel, avec un statut,
une surface et une date de plantation. La carte interactive (mobile uniquement) est
**lecture seule** — aucun dessin de polygone en phase 1.

## Statuts de parcelle (`ParcelleStatus`)

| Code | Libellé FR | Devise |
|---|---|---|
| `PREPARATION` | En préparation | tuile amber |
| `ACTIVE` | Active | tuile green |
| `JACHERE` | Jachère | tuile amber |
| `CLOTURE` | Clôturée | tuile neutral |

- « Parcelles actives » sur l'accueil = toute parcelle dont le statut n'est **pas**
  `CLOTURE` (ACTIVE + PREPARATION + JACHERE).
- Couleurs carte : remplissage translucide + contour selon statut
  (`STATUS_FILL` / `STATUS_STROKE` dans `ParcelleMap.tsx`), légende dans la vue Carte.

## Entité `parcelles`

- `farmId` — périmètre de la ferme (jamais global ; scoping `where: { farmId }`).
- `name` — nom libre (ex. « Plantain Est », « Jardin A »).
- `cultureId` — culture du référentiel (clé étrangère).
- `areaHa` — surface en hectares, **nombre décimal** (ex. 1,5 ha).
- `areaM2` — **calculé à la lecture** : `Math.round(areaHa × 10_000)` (m²), pas stocké.
- `boundaryGeoJson` — contour `GeoJSON` : `{ type: 'Polygon'|'MultiPolygon', coordinates }`,
  stocké en **`jsonb`** (pas de colonne PostGIS).
- `plantedAt` — date de plantation `YYYY-MM-DD` (UTC), nullable.
- `status` — `ParcelleStatus`, défaut `ACTIVE`.
- `notes` — texte libre (null si vide → stocké null).
- `createdAt`, `updatedAt`.

## Calcul de la surface (PostGIS optionnel)

`SpatialService.areaHa(geometry)` :
1. Si PostGIS est détecté (`postgis_version()`), `ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326), 3857))` → ha.
2. Sinon (installation sans PostGIS), repli **JavaScript** (`geoJsonAreaHaFallback`) :
   surface sphérique analytique ; précision tolérable à l'échelle d'une parcelle.
3. Découverte de l'extension faite **une fois au démarrage** (cache), dégradation gracieuse.

À l'**écriture** (create/update) : si un contour est fourni et que le calcul donne une
surface > 0, **le calcul écrase la valeur saisie** ; sinon la valeur saisie est gardée.
Donc : contour fourni ⇒ `areaHa` recalculé automatiquement.

## Routes (`POST/PATCH/DELETE` protégés par `agri:gerer` ; GET par rôle)

- `POST /farms/:farmId/parcelles` — création. Requis : `name`, `cultureId`, `areaHa`
  **ou** `boundaryGeoJson` ; optionnels : `status` (défaut ACTIVE), `plantedAt`, `notes`.
- `GET /farms/:farmId/parcelles` — liste triée par `createdAt` ASC + `areaM2`.
- `GET /farms/:farmId/parcelles/:parcelleId` — détail (404 si hors ferme).
- `PATCH /farms/:farmId/parcelles/:parcelleId` — mise à jour partielle.
- `DELETE /farms/:farmId/parcelles/:parcelleId` — suppression.

## Permissions

- **Lecture** (GET) : `PROPRIETAIRE`, `ELEVEUR` — aucun membre bloqué.
- **Écriture** (POST/PATCH/DELETE) : `@Permissions('agri:gerer')` —
  permission ajoutée au catalogue (`permission-catalog.ts`, groupe « Agriculture ») et
  reflétée mobile dans `src/constants/permissions.ts`. `ELEVEUR` (rôle fixe) ne l'a pas
  par défaut ; un `ADMIN` ne peut écrit que si `agri:gerer` est dans `link.permissions`.
- `POST /cultures` reste PROPRIETAIRE uniquement (référentiel global).

## Écrans mobile

- **Accueil Agriculture** (`AgricultureHome`) : tuiles « Parcelles actives / Superficie
  totale ha (+m²) / Cultures en cours (cultureId distincts parmi les ACTIVE plantées) »,
  liste des 4 dernières parcelles, bouton « Nouvelle parcelle » (gate `agri:gerer`).
- **Parcelles** (`(tabs)/parcelles.tsx`) : bascule Liste / Carte ; liste triée par nom FR ;
  carte `ParcelleMap` (react-native-maps + tuiles **OpenStreetMap**, aucune clé API,
  repli web "disponible sur mobile") ; FAB « + » et `?new=1` ouvrent la création.
- **ParcelleSheet** : formulaire créer/éditer/supprimer (nom, culture groupée par
  catégorie, surface ha, statut, date plantation, notes).
- **Récoltes** (`(tabs)/recoltes.tsx`) : **coquille phase 1** — la journalisation des
  récoltes est prévue en phase 2.

## Devises d'implémentation

- `createdAt` (UTC ISO) trie et sert au « recent » de l'accueil.
- `farmId` nullable jamais : une parcelle est toujours rattachée à une ferme.
- Coordonnées GeoJSON : **[longitude, latitude]** (ordre RFC 7946) — le helper mobile
  `geoCoordToLatLng` inverse vers `{ latitude, longitude }` pour react-native-maps ;
  `geoJsonOuterRing` extrait l'anneau extérieur (Polygone `coordinates[0]`,
  MultiPolygone `coordinates[0][0]`) et **évite le double-comptage du vertex de
  fermeture** dans `centerOfRing`.
- Pas de récoltes, ni de coûts intrants, ni de stockage PostGIS persistant en phase 1.