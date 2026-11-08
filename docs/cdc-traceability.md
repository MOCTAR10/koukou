# Traçabilité CDC Agri Track 241 → code → tests

Légende : ✅ implémenté et testé · 🟠 partiel ou non testable en e2e API · ❌ absent.
Les tests nommés `cdc-conformity` sont dans `backend/test/cdc-conformity.e2e-spec.ts` ; les autres dans `backend/test/`.

## 5.1 Suivi technique (MVP)

| n° | Exigence | Statut | Endpoints | Test |
|---|---|---|---|---|
| 1 | Fiche ferme, identifiant unique non modifiable, doublons, import AMI | ✅ | `POST /programme/farms`, `POST /programme/farms/import`, `PATCH /programme/farms/:id` | programme-farms::« modifie la fiche sans jamais toucher au code », « bloque un doublon probable », « import réel : 150 fermes » |
| 2 | Géolocalisation + cohérence province (ANINF partiel : corrigé, confirmation motivée) | ✅ | `PUT /programme/farms/:id/gps`, `GET …/gps-history`, `POST /programme/geo/check` | programme-farms::« refuse un point hors province sans confirmation motivée » |
| 3 | Capacités, infrastructures, taux d'occupation | ✅ | `PUT …/infrastructures`, `GET /programme/farms/:id` | programme-farms (création) ; cdc-conformity::« taux d'occupation » |
| 4 | Statut de la ferme + historique | ✅ | `POST …/status`, `GET …/status-history` | programme-farms::« change le statut avec historique » |
| 6 | Ouverture de bande (J+x, numérotation) | ✅ | `POST /farms/:id/batches` | poufa-bandes::« numérote la bande », « âge J+x partout » |
| 7 | Fiche d'élevage, contrôles de cohérence | ✅ | `POST …/daily-entries` | cdc-conformity::« morts supérieurs à l'effectif ou négatifs refusés » ; poufa-bandes::« marque les saisies de rattrapage » |
| 8 | Pesées (échantillon, rappel de retard) | ✅ | `POST …/daily-entries`, rappel | poufa-bande-entries::« le rappel de pesée en retard… » ; poufa-bandes::« détecte une pesée en retard » |
| 9 | Sorties (ANINF partiel : opérateur proposé, sous-lot) | ✅ | `POST /farms/:id/bandes/:b/sorties` | poufa-bande-entries::« le destinataire est obligatoire » ; trace::« une sortie vers un opérateur crée un sous-lot et sa CESSION » |
| 10 | Clôture, bilan figé, lecture seule | ✅ | `POST …/cloture`, `GET …/snapshots`, `POST …/corrections` | poufa-bandes::« clôture automatiquement à effectif nul » |
| 11 | Historique des bandes | ✅ | `GET /farms/:id/bandes` | poufa-lot-a-indic::« donne chaque bande avec son résumé officiel » |
| 12-15 | Mortalité, viabilité, GMQ, IC (formules paramétrables) | ✅ | `GET …/bandes/:b/indicators` | cdc-conformity::« mortalité et viabilité recalculées (62/1500 = 4,13 %) » ; poufa-bandes::« calcule les indicateurs officiels » |
| 16 | Volumes produits | ✅ | `GET /pilotage/dashboard` | pilotage::« agrège les fermes du périmètre » |
| 17 | Réception des intrants (ANINF non vérifié) | ✅ | `/programme/input-deliveries`, `…/confirm` | poufa-intrants::« records a State delivery… », « creates the farm's lots… » |
| 18 | Utilisation et stock, alerte stock négatif (ANINF A18, corrigé) | ✅ | `daily-entries`, `GET /farms/:id/declarative-stock`, `/alerts` | cdc-conformity::« aliment consommé sans stock » (stock déclaratif négatif) ; poufa-intrants::« lets the declarative stock go negative » |

## 5.2 Sanitaire (MVP)

| n° | Exigence | Statut | Endpoints | Test |
|---|---|---|---|---|
| 21 | Déclaration sanitaire (ANINF A22 : maladie non imposée) | ✅ | `POST …/health-events` | cdc-conformity::« déclaration de suspicion sans maladie imposée » ; surveillance::« enregistre signes cliniques et suspicion » |
| 22 | Vaccinations | ✅ | `…/prophylaxis/generate`, `…/complete` | cdc-conformity::« vaccination réalisée sur 97 animaux, 200 refusés » |
| 23 | Traitements (ANINF non vérifié) | ✅ | `POST/GET …/treatments` | sanitary-conformity::« enregistre dates de début et fin, motif et animaux » ; cdc-conformity::« traitement et vaccin dans l'historique » |
| 25 | Alerte précoce (seuil vétérinaire) | ✅ | `daily-entries` → `/surveillance/alerts` | surveillance::« ouvre une alerte quand la mortalité du jour dépasse le seuil » |
| 26 | Qualification et publication | ✅ | `POST /surveillance/alerts/:id/transitions`, `…/publish` | surveillance::« circuit de qualification, puis publication » |

## 5.4 Pilotage et transversal (MVP)

| n° | Exigence | Statut | Endpoints | Test |
|---|---|---|---|---|
| 36 | Tableau de bord éleveur (ANINF partiel : UX) | 🟠 | `GET /farms/:id/dashboard` | cdc-conformity::« tableau de bord de l'éleveur ». Écran jugé trop dense (web, hors backend) |
| 37 | Tableaux de bord province/national | ✅ | `GET /pilotage/dashboard` | pilotage::« filtre par cohorte et par statut » |
| 38 | Cartographie (ANINF partiel : fermes sans GPS) | 🟠 | `GET /pilotage/map` | pilotage::« donne les points GPS colorés » ; dépend de la reprise des GPS |
| 40 | Rapports périodiques PDF | ✅ | `/pilotage/reports/*` | pilotage::« produit le rapport de fin de bande » |
| 43 | Utilisateurs, profils, droits, cloisonnement | ✅ | `/programme/access/*` | cdc-conformity::« profil lecture seule… refus tracé », « un éleveur ne lit pas la ferme d'un autre » ; programme-access |
| 44 | Collecte mobile hors ligne (ANINF non vérifié) | 🟠 | sync LWW, clés d'idempotence | `it.todo` (APK sur appareil) ; poufa-bandes::« conflits hors ligne », offline-idempotency |
| 45 | Visites techniques | ✅ | `/programme/visits` | poufa-visites |
| 46 | Journal non modifiable, exports tracés | ✅ | `/audit/*` | audit-journal |
| 47 | Qualité et complétude | ✅ | `GET …/bandes/:b` | cdc-conformity::« complétude de la fiche » |
| 48 | Reprise des données (ANINF partiel : reprise réelle non faite) | 🟠 | `/programme/imports/*` | data-import (outil testé ; la reprise réelle est opérationnelle, pas logicielle) |

## 6 Traçabilité (MVP)

| n° | Exigence | Statut | Endpoints | Test |
|---|---|---|---|---|
| T1 | Identifiant de lot | ✅ | à l'ouverture de bande | trace::« crée le lot racine avec la bande » |
| T2 | Historique d'élevage (ANINF partiel) | ✅ | `GET /farms/:id/trace/lots/:lot` | poufa-bande-entries::« historique du lot (T2) » ; cdc-conformity::« traitement et vaccin dans l'historique » |
| T3 | Sortie de ferme et cession (ANINF partiel) | ✅ | `sorties` | trace::« cession » |
| T4 | Registre des opérateurs (ANINF non vérifié) | ✅ | `/trace/operators` | trace::« registre des opérateurs » |
| T5 | QR code, page publique, QR clos « Lot terminé » (A3) | ✅ | `GET /public/lots/:code` | trace::« page publique » |

## 8 Sécurité

| Exigence | Statut | Test |
|---|---|---|
| Aucune suppression de bande | ✅ | cdc-conformity::« aucune bande ni ferme ne peut être supprimée » |
| Déclarations sanitaires aux seuls vétérinaires | ✅ | cdc-conformity::« déclarations sanitaires… vétérinaires » |

## Hors MVP

| Exigence | Statut | Remarque |
|---|---|---|
| Financement BCEG et consentement (5.1 n° 5) | ❌ | `it.todo` : phase ultérieure |
| Échange EMA-i Plus (5.2) | ❌ | `it.todo` : protocole à formaliser |
