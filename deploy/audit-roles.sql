-- CDC 8.7 : deux rôles SQL pour l'immuabilité du journal d'audit. Idempotent.
-- Voir docs/audit-deploiement.md, section 2. NE PAS lancer sans lire la doc :
-- le passage de l'application sur fermia_app change DB_USERNAME (et les droits
-- de migration, qui passent à fermia_owner).
--
-- Usage (superutilisateur `fermia` du conteneur, base `fermia`) :
--   docker exec -i fermia_postgres psql -U fermia -d fermia \
--     -v ON_ERROR_STOP=1 -v owner_pw="'...'" -v app_pw="'...'" < deploy/audit-roles.sql
-- Mots de passe : jamais dans le dépôt. Sans -v, les rôles sont créés sans
-- mot de passe (NOLOGIN effectif tant qu'on n'en fixe pas un avec ALTER ROLE).

\if :{?owner_pw} \else \set owner_pw NULL \endif
\if :{?app_pw} \else \set app_pw NULL \endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fermia_owner') THEN
    CREATE ROLE fermia_owner LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fermia_app') THEN
    CREATE ROLE fermia_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

ALTER ROLE fermia_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE fermia_owner PASSWORD :owner_pw;
ALTER ROLE fermia_app PASSWORD :app_pw;

SELECT format('ALTER DATABASE %I OWNER TO fermia_owner', current_database()) \gexec

-- Le propriétaire des objets passe à fermia_owner (tables, séquences, types,
-- fonctions) : sinon l'ancien propriétaire pourrait encore retirer les déclencheurs.
-- Objets des extensions (PostGIS : spatial_ref_sys, fonctions, types) exclus.
SELECT format('ALTER TABLE public.%I OWNER TO fermia_owner', c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e') \gexec
SELECT format('ALTER SEQUENCE public.%I OWNER TO fermia_owner', c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'S'
   -- A sequence owned by a column (serial / identity) follows its table.
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('e', 'a', 'i')) \gexec
-- Types énumérés et domaines : les migrations font ALTER TYPE … ADD VALUE.
SELECT format('ALTER TYPE public.%I OWNER TO fermia_owner', t.typname)
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
 WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e') \gexec
-- Fonctions (dont audit_row_change, déclencheurs du journal).
SELECT format('ALTER FUNCTION %s OWNER TO fermia_owner', p.oid::regprocedure)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') \gexec
ALTER SCHEMA public OWNER TO fermia_owner;

GRANT USAGE ON SCHEMA public TO fermia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fermia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fermia_app;

-- Journal : ajout et lecture seulement (aucun UPDATE / DELETE / TRUNCATE).
REVOKE ALL ON audit_events, audit_row_changes, audit_seals FROM fermia_app;
GRANT SELECT, INSERT ON audit_events, audit_row_changes, audit_seals TO fermia_app;
SELECT format('GRANT USAGE ON SEQUENCE public.%I TO fermia_app', c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'S'
   AND c.relname IN ('audit_events_id_seq', 'audit_row_changes_id_seq') \gexec

-- Tables créées par les prochaines migrations (passées par fermia_owner).
ALTER DEFAULT PRIVILEGES FOR ROLE fermia_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fermia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fermia_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fermia_app;

-- Contrôle : toutes les lignes doivent valoir f pour UPDATE / DELETE / TRUNCATE.
SELECT t AS table_journal,
       has_table_privilege('fermia_app', t, 'UPDATE')   AS update_,
       has_table_privilege('fermia_app', t, 'DELETE')   AS delete_,
       has_table_privilege('fermia_app', t, 'TRUNCATE') AS truncate_
  FROM unnest(ARRAY['audit_events','audit_row_changes','audit_seals']) AS t;
