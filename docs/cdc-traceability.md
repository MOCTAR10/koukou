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
| 21 | Déclaration sanitaire (ANINF A22 : maladie non imposée ; maladie choisie dans le catalogue, notes vocales) | ✅ | `POST …/health-events` (`diseaseCode` optionnel), `POST …/health-events/:eventId/audio` | cdc-conformity::« déclaration de suspicion sans maladie imposée » ; surveillance::« enregistre signes cliniques et suspicion » ; disease-catalogue::« refuse un code de maladie inconnu » ; declaration-audio::« stores a voice note, once even when sent again ». Voir « Demandes du jury » |
| 22 | Vaccinations (calendrier Gabon de référence, vaccin du catalogue) | ✅ | `…/prophylaxis/generate`, `…/complete`, `/surveillance/vaccination-calendars` | cdc-conformity::« vaccination réalisée sur 97 animaux, 200 refusés » ; vaccine-catalogue::« planifie une bande de chair ouverte depuis le calendrier Gabon de référence » ; vaccine-schedules::« programmes Gabon pré-chargés disponibles (chair + pondeuse) ». Valeurs proposées, à valider par les services vétérinaires |
| 23 | Traitements (ANINF non vérifié) | ✅ | `POST/GET …/treatments` | sanitary-conformity::« enregistre dates de début et fin, motif et animaux » ; cdc-conformity::« traitement et vaccin dans l'historique » |
| 25 | Alerte précoce (seuil vétérinaire ; maladie à déclaration obligatoire = alerte officielle ; chute d'aliment) | ✅ | `daily-entries` → `/surveillance/alerts` | surveillance::« ouvre une alerte quand la mortalité du jour dépasse le seuil » ; disease-catalogue::« ouvre une alerte officielle pour une maladie à déclaration obligatoire » ; feed-intake-alerts::« trois jours normaux : aucune alerte ; −30 % d’aliment : alerte ROUGE ; jour normal : résolue ». Seuils d'aliment proposés, à valider |
| 26 | Qualification et publication | ✅ | `POST /surveillance/alerts/:id/transitions`, `…/publish` | surveillance::« circuit de qualification, puis publication » |

## 5.4 Pilotage et transversal (MVP)

| n° | Exigence | Statut | Endpoints | Test |
|---|---|---|---|---|
| 36 | Tableau de bord éleveur (ANINF partiel : UX) | 🟠 | `GET /farms/:id/dashboard`, `GET …/batches/:id/curve` (aliment par oiseau) | cdc-conformity::« tableau de bord de l'éleveur » ; feed-tracking::« rend l’aliment par oiseau, le standard de la souche et le ratio eau/aliment ». Écran jugé trop dense (web) : le mode Simple par compte y répond (voir « Demandes du jury »), non éprouvé sur appareil |
| 37 | Tableaux de bord province/national | ✅ | `GET /pilotage/dashboard` | pilotage::« filtre par cohorte et par statut » |
| 38 | Cartographie (ANINF partiel : fermes sans GPS) | 🟠 | `GET /pilotage/map` | pilotage::« donne les points GPS colorés » ; dépend de la reprise des GPS |
| 40 | Rapports périodiques PDF | ✅ | `/pilotage/reports/*` | pilotage::« produit le rapport de fin de bande » |
| 43 | Utilisateurs, profils, droits, cloisonnement (saisie déléguée de l'agent technique via la matrice) | ✅ | `/programme/access/*`, `PATCH /auth/me/ui-mode`, `PATCH /farms/:farmId/members/:userId/ui-mode` | cdc-conformity::« profil lecture seule… refus tracé », « un éleveur ne lit pas la ferme d'un autre » ; programme-access ; delegated-entry::« refuses a farm out of scope, deleting, sorties and opening a band » |
| 44 | Collecte mobile hors ligne (ANINF non vérifié) | 🟠 | sync LWW, clés d'idempotence ; notes vocales rejouées sans doublon (hash) | `it.todo` (APK sur appareil) ; poufa-bandes::« conflits hors ligne », offline-idempotency ; declaration-audio::« stores a voice note, once even when sent again ». Mode Simple, notes vocales et saisie déléguée mobiles : jamais testés sur appareil réel |
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

## Demandes du jury (après le challenge)

Les valeurs numériques (seuils, itinéraire, standards, calendriers) sont des **propositions Fermia à valider par la DGE et les services vétérinaires**. Aucun essai sur appareil réel du mode Simple, des notes vocales ni de la saisie déléguée mobiles. Base réglementaire : `docs/reglementation-gabon.md`.

| Demande | Statut | Où dans le code | Test | Base réglementaire / remarque |
|---|---|---|---|---|
| Température dans les fermes | 🟠 | `backend/src/modules/weather/weather.service.ts` (prévision par ferme, indice THI) ; seuils THI en constantes | aucun e2e dédié | Température **météo** aujourd'hui (Open-Meteo, coordonnées de la ferme) ; capteurs en bâtiment prévus, pas encore branchés |
| Itinéraire technique | 🟠 | `backend/src/modules/itinerary/` (`GET /programme/itinerary`, `POST/PATCH` PARAMETRES:MODIFIER, `feed-phase-at.ts`, `data/default-itinerary.ts`) | technical-itinerary::« sert à l’exploitant l’itinéraire du poulet de chair avec ses phases », « refuse à un exploitant d’écrire l’itinéraire » ; `feed-phase-at.spec.ts` | Décret 0190/PR/MAA 2022 (art. 8). Pas d'écran web d'édition (API seule) ; les tâches de la ferme ne sont pas générées depuis l'itinéraire ; mobile garde la correspondance âge → phase en dur |
| Données sur les aliments | ✅ | `backend/src/modules/feed-stock/` (`feed_products` : fabricant, protéines, énergie, référence d'autorisation) ; `backend/src/modules/breeds/derive-daily-feed.ts` | feed-products ; technical-itinerary::« expose l’aliment journalier cible du référentiel d’une souche de chair » | Décret 0190/PR/MAA 2022 (art. 19). Standard journalier indicatif dérivé du poids et de l'IC ; pas d'écran web d'édition des standards de souche (`PUT /breeds/:id/standards`, API seule) |
| Alimentation des poulets de chair | ✅ | `GET /farms/:id/batches/:id/curve` (`backend/src/modules/batches/daily-feed.ts` : aliment par oiseau, standard, ratio eau/aliment) | feed-tracking::« rend l’aliment par oiseau, le standard de la souche et le ratio eau/aliment », « sert la plage eau/aliment avec les seuils du tableau de bord » | Standard de souche pour la chair seulement |
| Vaccins associés aux programmes | ✅ | liste `VACCIN` (catalogue) ; `protocol_steps.vaccine_code` ; `backend/src/modules/sanitary/vaccination-calendars.service.ts` ; calendrier Gabon de référence par espèce/type | vaccine-catalogue::« sert le catalogue des vaccins, rattaché au catalogue des maladies », « refuse un vaccin inconnu sur une étape et le rend sur les lectures », « planifie une bande de chair ouverte depuis le calendrier Gabon de référence » ; vaccine-schedules | Décret 0190/PR/MAA 2022 (art. 8 et 17), loi 001/2021 (texte intégral non consulté). Catalogue générique, sans marque, à valider par les vétérinaires |
| Maladies à surveillance obligatoire | ✅ | listes `MALADIE` et `TEXTE_REFERENCE` ; `diseaseCode` sur la déclaration ; alerte officielle automatique (`backend/src/modules/sanitary/health.service.ts`) | disease-catalogue::« sert le catalogue des maladies avec leur base légale », « n'ouvre pas d'alerte pour une maladie hors déclaration obligatoire », « ouvre une alerte officielle pour une maladie à déclaration obligatoire » | Loi n° 2/65 du 5 juin 1965 (art. 1er et 2) : 7 maladies aviaires listées. Le formulaire mobile envoie encore du texte libre |
| Signaux d'alerte | 🟠 | `backend/src/modules/batches/feed-intake.ts` + `advisory.engine.ts` (`evaluateFeedIntake`, type `CONSOMMATION_ALIMENT`) ; seuils `FEED_DROP_*` et `FEED_STANDARD_DEVIATION_WARN_PCT` dans les constantes de référence ; registre `rule_registry.isActive` respecté | feed-intake-alerts::« expose les nouveaux seuils proposés dans les constantes de référence », « trois jours normaux : aucune alerte ; −30 % d’aliment : alerte ROUGE ; jour normal : résolue » | Seuils configurables, valeurs proposées. Aucun écran admin pour activer/désactiver une règle du registre |
| Renseignement des maladies par audio et photos | 🟠 | `backend/src/modules/sanitary/health.controller.ts` (`POST/GET …/health-events/:eventId/audio`, 3 Mio, 2 notes) ; mobile `mobile/src/components/voice/` ; web `web/src/components/surveillance/DeclarationAudio.tsx` (lecture seule) | declaration-audio (7 tests, dont « refuses a file that is not audio, whatever its declared type », « caps the notes at two per declaration ») ; mobile `src/poufa/voice-note.test.ts` | Loi n° 2/65 (déclaration immédiate). Photos déjà en place. Enregistrement sur mobile seulement, jamais essayé sur appareil réel ; nouvel APK nécessaire |
| Simplification pour les éleveurs | 🟠 | `users.ui_mode` (SIMPLE/COMPLET par compte) ; `PATCH /auth/me/ui-mode`, `PATCH /farms/:farmId/members/:userId/ui-mode` ; mobile `mobile/src/components/simple/`, `mobile/src/hooks/useUiMode.ts` | ui-mode::« a freshly activated exploitant is SIMPLE and may switch himself », « an ELEVEUR employee is SIMPLE, cannot switch himself, the owner does » ; mobile `simple-logic.test.ts`, `ui-mode.test.ts` | Pictogrammes et lecture vocale. API testée ; interface mobile jamais essayée sur appareil réel |
| Maturité des éleveurs / saisie par un tiers | 🟠 | profil AGENT_TECHNIQUE : TECHNIQUE:CREER et SANITAIRE:CREER par défaut, retirables dans la matrice ; `backend/src/modules/access/delegated-author.ts` ; notification `DELEGATED_ENTRY` à l'exploitant ; mobile `mobile/src/app/saisie-deleguee.tsx` | delegated-entry::« the agent creates the day’s entry of an in-scope farm: flagged, with author name and profile », « the owner is told once of the agent’s entry; the agent is not; a replay adds nothing », « after the admin removes TECHNIQUE:CREER the agent is refused; restoring it reopens the entry » ; mobile `src/poufa/delegated-entry.test.ts` | Saisie marquée « pour le compte de », tracée dans le journal, exploitant prévenu. Écran mobile jamais essayé sur appareil réel |

## Hors MVP

| Exigence | Statut | Remarque |
|---|---|---|
| Financement BCEG et consentement (5.1 n° 5) | ✅ | Espace financeur `modules/financing` (domaine FINANCEMENT) : dossiers par étapes, pièces, tranches, échéancier, remboursements, classes de créance, consentement des exploitants (modèle versionné, en ligne ou papier, retrait immédiat), portefeuille et export Excel, ferme à 360°, états financiers SYSCOHADA, pièces fournies par l’exploitation (configurables, péremption, dépôt par l’exploitant ou l’agent). Périmètre de lecture : paramètre `FINANCEMENT_PERIMETRE` ; tests `financing.e2e-spec.ts` |
| Échange EMA-i Plus (5.2) | ❌ | `it.todo` : protocole à formaliser |
