# Visites techniques et contrôles de biosécurité

Module `backend/src/modules/visits` (CDC n° 45 « visites techniques », n° 27 « contrôles de biosécurité », §3.2 « l'agent technique vérifie les déclarations », T2 « historique d'élevage », §7.2 hors ligne, §7.3f « grilles de biosécurité et classement »). Les valeurs marquées « Proposé » sont des propositions de Fermia, à valider par la DGE et les services vétérinaires.

## Ce qu'est une visite

`farm_visits` : une visite d'un agent à une ferme du programme, éventuellement à propos d'une bande.

| Champ | Rôle |
|---|---|
| `visitDate`, `type` | jour de la visite (pas dans le futur au-delà de demain) ; `TECHNIQUE`, `BIOSECURITE` ou `SANITAIRE` |
| `batchId` | bande concernée (de la même ferme), facultative |
| `observations`, `recommendations` | texte libre |
| `latitude`, `longitude` | position de la visite, facultative (les deux ou aucune) |
| `nextVisitDate` | prochaine visite, jamais avant la visite |
| `visaFrom`, `visaTo` | visa de l'agent (voir plus bas) |
| `scorePct`, `classification`, `thresholds` | calculés à l'enregistrement (grille) |
| `capturedAt`, `idempotencyKey` | saisie hors ligne : une visite rejouée ne crée pas de doublon (unique par ferme) |

Une visite n'est ni modifiée ni supprimée : une correction est une nouvelle visite. Tables journalisées (`audit_attach`). Les photos ne sont pas encore gérées (voir « Reste à faire »).

## Grille de biosécurité (paramétrable)

- Les critères sont les éléments de la liste **`CRITERE_BIOSECURITE`** (liste du programme, famille sanitaire : tenue par les services vétérinaires via `POST/PATCH /surveillance/lists/CRITERE_BIOSECURITE`, droits SANITAIRE:CREER / MODIFIER). `meta.weight` = poids entier de 1 à 10 (refusé hors bornes), `meta.category` = rubrique d'affichage. Un critère se désactive, ne se supprime pas.
- Grille par défaut (Proposé, 15 critères en 6 rubriques : accès, hygiène, eau et aliment, nuisibles, déchets, conduite), semée au démarrage sans jamais écraser un critère existant.
- Une réponse vaut `CONFORME`, `NON_CONFORME` ou `NA` (non applicable, exclu du score). Le libellé, la rubrique et le poids du critère sont **copiés** dans la réponse à l'enregistrement : modifier la grille plus tard ne change aucun ancien score. Un critère désactivé depuis est encore accepté (visite faite hors ligne avec l'ancienne grille) ; un code inconnu est refusé.
- **Score** = poids des critères conformes ÷ poids des critères évalués × 100 (une décimale). Aucun critère évalué : pas de score. Une visite `BIOSECURITE` doit évaluer au moins un critère.
- **Classe** : `A` si score ≥ `BIOSECURITE_SEUIL_A_PCT` (Proposé 80), `B` si ≥ `BIOSECURITE_SEUIL_B_PCT` (Proposé 60), sinon `C`. Les deux seuils sont des paramètres versionnés du catalogue (propriétaire : services vétérinaires), lus à la date de la visite ; les seuils appliqués sont conservés avec la visite.

## Visa de l'agent technique (CDC §3.2)

Choix le plus petit et cohérent : une visite peut porter un **visa d'une période de saisies d'une bande** (`visaFrom` → `visaTo`, bande obligatoire, période comprise entre l'ouverture de la bande et sa clôture éventuelle, pas postérieure à la visite). Cela veut dire « sur place, j'ai vérifié les saisies quotidiennes de cette bande sur ces jours ». Le visa est daté, signé par l'agent (journal), visible dans l'historique de la bande. Il ne bloque rien et ne modifie aucune saisie. Le visa des déclarations sanitaires reste du ressort du vétérinaire (`POST /surveillance/declarations/:id/review`, SANITAIRE:VALIDER) : les deux visas ne sont pas mélangés.

## Routes et droits

Domaine `TECHNIQUE`, droits de la matrice (rien n'est codé en dur sur un rôle).

| Route | Droit |
|---|---|
| `POST /farms/:farmId/visits` | **TECHNIQUE:VALIDER** dans le périmètre (profil agent technique par défaut, administrateur plateforme). `VALIDER` plutôt que `CREER` parce que `CREER` donnerait aussi le code ferme `saisie:creer` (saisies quotidiennes). |
| `GET /farms/:farmId/visits[/:id]`, `GET …/visits/grid` | propriétaire et membres de la ferme ; institution avec TECHNIQUE:CONSULTER (DGE) ou SANITAIRE:CONSULTER (vétérinaires) |
| `GET /programme/visits?province&classification&type&farmId&from&to&page&pageSize` | même droit de lecture, filtré en SQL par le périmètre ; pas de vue programme pour l'éleveur |

Lectures par un tiers (institution, administrateur) : `@AuditThirdPartyRead` ; les écritures sont dans le journal d'actions (niveau 1) et les lignes dans `audit_row_changes` (niveau 2). Un administrateur du programme peut accorder TECHNIQUE:VALIDER (écriture) ou SANITAIRE/TECHNIQUE:CONSULTER (lecture) à n'importe quel profil depuis la matrice.

## Historique T2

L'historique de bande (`GET /farms/:farmId/trace/lots/:lotId`, `rearing`) ajoute des événements `VISITE` : les visites de la bande, plus celles de la ferme sans bande faites pendant sa vie (comme les livraisons sans bande). Texte : « Contrôle de biosécurité : score 72,5 %, classe B ; saisies du … au … visées ». Pas de nom d'agent. Une institution sans TECHNIQUE ni SANITAIRE en consultation ne les voit pas.

## Applications

- Web : page « Visites » (`/app/visites`) : visites de la ferme active, détail avec grille, formulaire de création (droit TECHNIQUE:VALIDER) ; vue « Programme » filtrable par province, classe et type pour les institutions. L'onglet Historique du lot affiche les visites.
- Mobile : l'agent crée une visite avec la grille hors ligne (file `farm-visit`, `idempotencyKey = op.id`, grille et seuils mis en cache à la dernière ouverture) ; liste des visites de la ferme ; historique du lot.

## Rappel de la prochaine visite

- **Qui** : l'agent qui a enregistré la visite planifiant la suivante (audience de règle `VISIT_AGENT`). C'est la règle la plus petite et cohérente ; pour prévenir aussi les agents de la zone ou la DGE, l'administration ajoute une règle `PROFILE` sur les événements `VISIT_REMINDER` / `VISIT_OVERDUE` (règles de notification, rien de codé en dur).
- **Quand** : seule la **dernière visite de chaque ferme** compte (une visite plus récente clôt le rappel). Balayage au démarrage puis toutes les heures (`VisitRemindersService`, `VISIT_REMINDER_SWEEP_DISABLED=true` le coupe) : `VISITE_RAPPEL_J` jours avant (paramètre du catalogue, propriétaire DGE, Proposé 2 ; 0 = pas de rappel anticipé), le jour même, puis « en retard » une fois la date dépassée.
- **Sans doublon** : le balayage n'a pas d'état ; la table des notifications est unique par utilisateur, canal et clé `VISIT:<visite>:<AVANT|JOUR|RETARD>`. Un balayage répété ne recrée rien, un événement perdu revient au balayage suivant.
- **Règles par défaut** (modifiables) : `AGENT_VISITE_RAPPEL` et `AGENT_VISITE_RETARD`, dans l'application + push. Pas de SMS (non actif).
- **Retards pour la DGE** : `GET /programme/visits?retard=true` (même droit et périmètre que la liste) ; filtre « Prochaine visite en retard » dans l'onglet Programme de la page Visites.
- **Mobile** : rappels locaux de l'agent pour sa propre prochaine visite (veille et jour, à l'heure du matin des réglages).

## Décisions à valider (DGE / vétérinaires)

1. Grille par défaut, poids et seuils A 80 % / B 60 % (propositions).
2. Qui possède la grille : les services vétérinaires (liste sanitaire) ; la DGE ne la modifie pas.
3. Écriture des visites = TECHNIQUE:VALIDER (agent technique) ; les vétérinaires lisent, ne créent pas de visite.
4. Le visa porte sur une période de saisies d'une bande ; pas de blocage de la bande ni de verrouillage des saisies visées.
5. Visibilité à l'éleveur : il lit les visites de sa ferme, grille et recommandations comprises.

## Reste à faire

- Photos de visite (le mécanisme de photos existe seulement pour les déclarations sanitaires : un fichier par visite demanderait une route et un stockage dédiés).
- Création d'une visite hors ligne depuis le web (mobile seulement) ; planification et rappel de la « prochaine visite » (la date est stockée, aucune notification).
- Classement de biosécurité dans les tableaux de pilotage et les rapports PDF (la liste programme filtrable par classe est l'amorce).
- Critères bloquants (un critère critique non conforme qui dégrade la classe) : non prévu au CDC, non fait.

## Photos de visite

- `POST /farms/:farmId/visits/:id/photos` (multipart `file`, TECHNIQUE:VALIDER) : PNG/JPEG/WEBP vérifiés sur les octets, 5 Mo, 8 photos par visite, réservé à l'agent qui a enregistré la visite. Le même fichier renvoyé (rejeu hors ligne) ne crée pas de doublon (hash). La visite reste immuable ; la photo lui est rattachée après coup, comme pour les déclarations sanitaires.
- `GET /farms/:farmId/visits/:id/photos/:photoId` : mêmes droits que la visite, lecture tierce journalisée. Fichiers sous `UPLOADS_DIR/visits/<farmId>/`, hors route statique. Le détail de la visite liste les photos (`photos`).
- Mobile : les photos suivent la visite dans la file hors ligne et partent juste après. Web : la visite et sa grille passent par la file hors ligne (clé d'idempotence, grille en cache) ; les photos exigent une connexion (fichiers non mis en file sur le web) et s'ajoutent au détail de la visite.
