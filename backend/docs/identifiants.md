# Règle de construction des identifiants du programme

CDC §7.5 / 9.4 : identifiants automatiques, uniques, jamais modifiés ni réutilisés. Les codes du programme ci-dessous viennent de `IdCounter` (`src/modules/programme/id-counter.service.ts`) : un upsert atomique `ON CONFLICT … next + 1 RETURNING`, dans la transaction de l'appelant. Un compteur ne recule jamais : une bande abandonnée ne rend pas son numéro. Chaque numéro s'élargit au-delà de son remplissage (`G1-10000`, `B100`, `L100`).

| Objet | Format | Exemple | Compteur (`id_counters.scope`) | Générateur |
|---|---|---|---|---|
| Ferme | code province + `-` + n° sur 4 chiffres | `G1-0012` | `FARM:<province>` | `farmCode` dans `src/modules/programme/codes.ts` |
| Localité | code province + `-` + n° sur 2 chiffres | `G1-06` | `LOCALITE:<provinceId>` | `localiteCode` (même fichier) |
| Bande | code ferme + `-B` + rang sur 2 chiffres | `G1-0012-B07` | `BANDE:<code ferme>` | `bandeCode`, utilisé par `src/modules/batches/poufa/bande-opening.service.ts` |
| Livraison d'intrants | code ferme + `-L` + rang sur 2 chiffres | `G1-0012-L03` | `LIVRAISON:<code ferme>` | `deliveryCode` dans `src/modules/supply/supply-rules.ts` |
| Lot de traçabilité (racine) | code bande + `-L` + rang sur 2 chiffres | `G1-0012-B07-L01` | `LOT:<code bande>` | `lotCode` dans `src/modules/trace/trace-codes.ts`, appelé par `trace-lots.service.ts` |
| Sous-lot (un par cession) | code du lot racine + `-` + rang sur 2 chiffres | `G1-0012-B07-L01-03` | `SOUS_LOT:<code lot>` | `subLotCode` (même fichier) |
| Opérateur de la filière | `OP-` + n° sur 4 chiffres | `OP-0001` | `OPERATEUR:<code programme>` | `operatorCode`, `src/modules/trace/operators.service.ts` |
| Alerte sanitaire officielle | `AS-` + année + `-` + n° sur 4 chiffres | `AS-2026-0001` | `ALERTE_SANITAIRE:<année>` | `sanitaryAlertCode` dans `src/modules/surveillance/sanitary-alert-rules.ts` |

Le code province (`G1`…`G9`) est celui des 9 provinces semées (`src/modules/programme/data/gabon-provinces.ts`). Le code d'une ferme et son programme ne changent jamais (déclencheur SQL `farms_programme_code_immutable`).

## Adresse du QR code d'un lot

`<TRACE_PUBLIC_BASE_URL>/l/<code du lot>?s=<signature>` (`lotQrUrl`, `src/modules/trace/qr-signature.ts`).

- `signature` : HMAC-SHA256 du texte `fermia:trace-lot:v1:<code>` avec la clé `TRACE_QR_SECRET`, encodé base64url et tronqué à 16 caractères (96 bits). Elle est calculée une fois à la création du lot et stockée sur le lot (`qrToken`) : changer la clé n'invalide pas les étiquettes déjà imprimées.
- `TRACE_QR_SECRET` et `TRACE_PUBLIC_BASE_URL` sont obligatoires en production (`src/modules/trace/trace-config.ts`).
- Page publique : `GET /public/lots/:code`. La forme du code est vérifiée avant toute requête (`LOT_CODE_PATTERN` = `^[A-Z0-9][A-Z0-9-]{2,59}$`) ; sinon « inconnu » sans accès à la base.

## Identifiants non métier

Les clés techniques (utilisateurs, événements, saisies, ventes…) sont des UUID générés par PostgreSQL (`PrimaryGeneratedColumn('uuid')`). Ils ne sont jamais affichés comme identifiant de programme ; seuls les codes ci-dessus le sont.

## Références des pièces de gestion

Ces références ne viennent pas d'`IdCounter`. Elles portent le jour de Libreville (`todayLocal()`) suivi d'un tirage aléatoire à 6 chiffres. L'unicité est contrôlée avant l'insertion (5 essais), et une collision entre deux transactions concurrentes (erreur 23505) relance l'opération avec un nouveau tirage (`src/common/utils/idempotency.ts`). Elles ne se suivent donc pas : ce ne sont pas des numéros continus.

| Objet | Format | Exemple | Générateur |
|---|---|---|---|
| Vente (point de vente, livraison de commande) | `VTE-` + AAAAMMJJ + `-` + 6 chiffres | `VTE-20261109-482913` | `makeReferenceNumber` dans `src/modules/finance/sales.service.ts` ; `makeReference('VTE')` dans `src/modules/orders/orders.service.ts` |
| Commande | `CMD-` + AAAAMMJJ + `-` + 6 chiffres | `CMD-20261109-105377` | `makeReference('CMD')`, `src/modules/orders/orders.service.ts` |
| Ordre d'abattage | `ABT-` + AAAAMMJJ + `-` + 6 chiffres | `ABT-20261109-730461` | `makeReference`, `src/modules/slaughter/slaughter.service.ts` |
| Code interne de lot abattu (si l'opérateur n'en saisit pas) | référence d'abattage + `-I` | `ABT-20261109-219084-I` | `makeInternalCode` (même fichier), tiré sous verrou consultatif : deux envois simultanés ne tirent pas le même code |
| Écriture comptable | `EC-` + AAAAMMJJ (jour de l'écriture) + `-` + 6 chiffres | `EC-20261109-640218` | `nextReference`, `src/modules/accounting/accounting.service.ts` (`ENTRY_PREFIX`) |
| Client d'une ferme | `CL-` + n° sur 4 chiffres, par ferme | `CL-0007` | `nextCode`, `src/modules/finance/customers.service.ts` (plus grand numéro existant + 1) |

Le préfixe `EC-` désigne les écritures comptables ; les ventes portent `VTE-`. Une numérotation continue des écritures par exercice n'existe pas encore (point à valider, voir la documentation technique).
