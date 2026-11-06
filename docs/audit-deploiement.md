# Journal d'audit — déploiement et vérification

Exigence POUFA (contrôle ANINF) : « Un journal non modifiable trace qui a saisi ou modifié quoi, et quand. Les consultations sensibles et les exports sont aussi tracés. Le journal est consultable et exportable par les auditeurs. »

Ce document s'adresse à l'exploitant de la base de production et aux auditeurs. Le code se trouve dans `backend/src/modules/audit/` ; les fonctions et déclencheurs SQL dans la migration `AuditJournal1793911381642`.

## 1. Ce qui est enregistré

| Table | Contenu | Écrite par |
|---|---|---|
| `audit_events` | Une ligne par action : chaque écriture (`POST`, `PUT`, `PATCH`, `DELETE`), réussie ou refusée, avec son code de statut ; chaque consultation sensible (`READ_SENSITIVE`) ; chaque export de fichier (`EXPORT`) ; chaque connexion (`LOGIN`, `LOGIN_FAILED`, téléphone masqué, jamais le code) ; les opérations du serveur (`SYSTEM`, par exemple le scellement). | l'application |
| `audit_row_changes` | La ligne avant et après chaque modification des tables clés (fermes, membres, utilisateurs sans le hash du mot de passe, bandes, saisies journalières, intrants, événements sanitaires, traitements, prophylaxie, alertes, paramètres, ventes, abattages, commandes). | des déclencheurs PostgreSQL |
| `audit_seals` | Un sceau par jour UTC écoulé : empreinte SHA-256 enchaînée au sceau de la veille. | l'application (tâche horaire) |

Chaque requête porte un identifiant (`X-Request-Id`, renvoyé dans la réponse). Il relie l'action (`audit_events.request_id`) aux lignes modifiées par sa transaction (`audit_row_changes.request_id`).

Le résumé d'une écriture est le corps de la requête sans les secrets (toute clé contenant `pass`, `code`, `secret`, `token`, `hash` ou `otp` est retirée), avec les textes coupés à 500 caractères et le tout limité à environ 8 Ko.

**Limite connue.** Une écriture faite hors transaction (`repository.update`, requêtes `UPDATE` directes) produit une ligne `audit_row_changes` dont `request_id` et `actor_user_id` sont vides. L'action reste tracée au niveau 1 (`audit_events`), avec l'acteur et l'heure.

## 2. Droits SQL en production

Le journal refuse `UPDATE`, `DELETE` et `TRUNCATE` par déclencheur, quel que soit le compte. Ce verrou ne tient que si le compte de l'application ne peut pas retirer le déclencheur. Il faut donc **deux rôles** :

- `fermia_owner` : propriétaire du schéma. Il sert uniquement à passer les migrations, au déploiement.
- `fermia_app` : le compte de l'application. Il n'est ni propriétaire des tables ni superutilisateur. Un propriétaire peut faire `ALTER TABLE … DISABLE TRIGGER` ; un superutilisateur peut faire `SET session_replication_role = replica`, qui désactive aussi les déclencheurs.

```sql
-- Rôles (mots de passe hors dépôt)
CREATE ROLE fermia_owner LOGIN PASSWORD '…';
CREATE ROLE fermia_app LOGIN PASSWORD '…' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE fermia OWNER TO fermia_owner;
ALTER SCHEMA public OWNER TO fermia_owner;

-- Après les migrations (lancées avec fermia_owner) :
GRANT USAGE ON SCHEMA public TO fermia_app;

-- Tables métier : lecture et écriture.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fermia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fermia_app;

-- Journal : ajout et lecture seulement.
REVOKE ALL ON audit_events, audit_row_changes, audit_seals FROM fermia_app;
GRANT SELECT, INSERT ON audit_events, audit_row_changes, audit_seals TO fermia_app;
GRANT USAGE ON SEQUENCE audit_events_id_seq, audit_row_changes_id_seq TO fermia_app;

-- Tables créées par les prochaines migrations :
ALTER DEFAULT PRIVILEGES FOR ROLE fermia_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fermia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fermia_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fermia_app;
-- Une nouvelle table de journal doit ensuite recevoir le même REVOKE / GRANT
-- que ci-dessus.
```

Les déclencheurs de `audit_row_change()` s'exécutent avec les droits de l'utilisateur qui modifie la ligne : `fermia_app` a donc besoin de `INSERT` sur `audit_row_changes` (accordé ci-dessus), et de rien de plus.

Avec deux rôles, l'application ne doit plus passer les migrations au démarrage :

```env
# .env de production de l'application (compte fermia_app)
DB_USERNAME=fermia_app
DB_MIGRATIONS_RUN=false
DB_SYNCHRONIZE=false
```

Au déploiement, passer les migrations avec le propriétaire : `npm run build`, puis `DB_USERNAME=fermia_owner DB_PASSWORD=… npm run migration:run`, puis relancer les `GRANT` ci-dessus si une table a été ajoutée.

Ne jamais définir `AUDIT_SEAL_DISABLED=true` en production : cette variable arrête le scellement (elle sert aux tests e2e).

Vérifier les droits :

```sql
SELECT has_table_privilege('fermia_app', 'audit_events', 'UPDATE'),   -- false
       has_table_privilege('fermia_app', 'audit_events', 'DELETE'),   -- false
       has_table_privilege('fermia_app', 'audit_events', 'TRUNCATE'), -- false
       has_table_privilege('fermia_app', 'audit_events', 'INSERT');   -- true
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid IN ('audit_events'::regclass, 'audit_row_changes'::regclass, 'audit_seals'::regclass)
  AND NOT tgisinternal;                                               -- tgenabled = 'O'
```

## 3. Sauvegardes

- Sauvegarde chiffrée quotidienne de toute la base (`pg_dump -Fc`), conservée hors du serveur, avec une durée de rétention fixée avec l'ANINF. Le journal est sauvegardé avec les données : une restauration ne doit jamais remplacer le journal par une version plus ancienne sans le consigner.
- Test de restauration au moins une fois par trimestre, suivi de `POST /audit/seals/verify` sur la base restaurée.
- **Remettre les sceaux hors de la base.** Un superutilisateur peut tout réécrire, sceaux compris. Le chaînage ne prouve l'intégrité que si un sceau récent est conservé ailleurs. Transmettre régulièrement (par exemple chaque semaine) la liste `GET /audit/seals` à l'ANINF, ou au moins le dernier `hash` et sa date. Toute réécriture antérieure à ce sceau devient alors détectable.

## 4. Scellement quotidien

Chaque jour UTC écoulé reçoit un sceau 15 minutes après minuit UTC (le délai laisse finir une transaction commencée juste avant minuit). La tâche tourne au démarrage puis toutes les heures, et rattrape les jours manquants dans l'ordre. Un jour sans activité reçoit aussi un sceau : la chaîne n'a pas de trou.

Calcul, pour un jour `J` (`AAAA-MM-JJ`) :

```
empreinte(J) = SHA-256 en hexadécimal minuscule, sur le texte UTF-8 :
    empreinte(J-1)  (texte vide pour le premier sceau)  + "\n"
  + J + "\n"
  + pour chaque ligne de audit_events du jour J, par id croissant :     "E " + canonique(ligne) + "\n"
  + pour chaque ligne de audit_row_changes du jour J, par id croissant : "R " + canonique(ligne) + "\n"
```

- Une ligne appartient au jour `J` si `occurred_at` (`audit_events`) ou `at` (`audit_row_changes`) est dans `[J 00:00 UTC, J+1 00:00 UTC[`.
- `canonique(ligne)` est le JSON de la ligne, clés triées (ordre des points de code), sans espaces, où **chaque valeur est le texte rendu par PostgreSQL** (`null` reste `null`) et les dates sont au format `AAAA-MM-JJTHH:MI:SS.microsecondesZ` en UTC. Les colonnes sont lues ainsi :

```sql
-- audit_events
SELECT id::text AS id,
       to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
       request_id::text AS request_id, action::text AS action,
       actor_user_id::text AS actor_user_id, actor_role, farm_id::text AS farm_id,
       method, route, params::text AS params, status_code::text AS status_code,
       ip, user_agent, offline_op_id, summary::text AS summary, error_message
FROM audit_events
WHERE occurred_at >= '2026-11-04T00:00:00Z' AND occurred_at < '2026-11-05T00:00:00Z'
ORDER BY id;

-- audit_row_changes
SELECT id::text AS id,
       to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
       request_id::text AS request_id, actor_user_id::text AS actor_user_id,
       txid::text AS txid, table_name, row_id, op::text AS op,
       before::text AS before, after::text AS after
FROM audit_row_changes
WHERE at >= '2026-11-04T00:00:00Z' AND at < '2026-11-05T00:00:00Z'
ORDER BY id;
```

Le code de référence est `backend/src/modules/audit/audit-canonical.ts` (`canonicalJson`, `SealHasher`) ; ses tests unitaires donnent des exemples de valeurs attendues.

## 5. Vérification par l'ANINF

**Par l'API** (profil administrateur plateforme pour l'instant ; un profil auditeur ANINF dédié est prévu au lot L2) :

- `POST /audit/seals/verify` avec `{}` (tous les jours) ou `{ "from": "2026-11-01", "to": "2026-11-30" }`. La réponse donne `ok`, le nombre de jours vérifiés et, en cas d'écart, la **première** incohérence :
  - `COUNT` : le nombre de lignes du jour ne correspond plus (ligne ajoutée après coup, par exemple antidatée, ou ligne retirée) ;
  - `HASH` : même nombre de lignes, mais un contenu modifié ;
  - `CHAIN` : le sceau ne référence pas celui de la veille ;
  - `GAP` : un jour manque dans la chaîne ;
  - `UNSEALED_BEFORE_FIRST_SEAL` (vérification complète) : des lignes sont plus anciennes que le premier sceau.
- `GET /audit/seals`, `GET /audit/events` (filtres `from`, `to`, `actorUserId`, `farmId`, `action`, `route`), `GET /audit/events/export` (CSV), `GET /audit/row-changes` (filtres `from`, `to`, `table`, `rowId`, `requestId`). Ces consultations sont elles-mêmes tracées dans le journal.

**Indépendamment de l'application** : depuis une copie de la base (sauvegarde restaurée), extraire les lignes de chaque jour avec les requêtes de la section 4, recalculer l'empreinte avec n'importe quel outil SHA-256, et la comparer à `audit_seals.hash`, puis au sceau remis hors de la base (section 3). Le premier jour qui diffère est celui qui a été altéré.
