import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Baseline: the whole schema as `synchronize` left it before migrations
 * existed (generated against an empty database).
 *
 * A database that already has the schema (built by `synchronize`) is
 * *adopted*: the migration is recorded as applied without running. Run
 * `npm run migration:check` on such a database to confirm it has no drift.
 */
export class Baseline1793909600725 implements MigrationInterface {
    name = 'Baseline1793909600725'

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (await queryRunner.hasTable('farms')) {
            console.log('[migrations] Existing schema adopted as Baseline.');
            return;
        }
        await queryRunner.query(`
            CREATE TYPE "public"."users_role_enum" AS ENUM(
                'PLATFORM_ADMIN',
                'PROPRIETAIRE',
                'ELEVEUR',
                'ACHETEUR'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "phone" character varying NOT NULL,
                "email" character varying,
                "passwordHash" character varying NOT NULL,
                "fullName" character varying NOT NULL,
                "role" "public"."users_role_enum" NOT NULL DEFAULT 'PROPRIETAIRE',
                "active" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone"),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "farms" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "administrativeCity" character varying NOT NULL,
                "owner_id" uuid NOT NULL,
                "buildingCount" integer,
                "capacityPerBuilding" integer,
                "building_area_m2" double precision,
                "default_sac_kg" double precision NOT NULL DEFAULT '50',
                "logo_url" character varying,
                "longitude" double precision,
                "latitude" double precision,
                "is_verified" boolean NOT NULL DEFAULT false,
                "active" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_39aff9c35006b14025bba5a43d9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c6cdc7f7b287695ad281b9c644" ON "farms" ("administrativeCity")
        `);
        await queryRunner.query(`
            CREATE TABLE "weather_observations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "forecast_date" date NOT NULL,
                "temp_c" double precision NOT NULL,
                "humidity_pct" double precision NOT NULL,
                "thi" double precision NOT NULL,
                "zone" character varying NOT NULL,
                "level" character varying,
                "source" character varying NOT NULL DEFAULT 'PREVISION',
                "generated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_7e2b773daac08878f53827fad2a" UNIQUE ("farm_id", "forecast_date"),
                CONSTRAINT "PK_b782091d02212644487558b7b8c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a966fcba8c36910c5cef59e787" ON "weather_observations" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."buyer_profiles_type_enum" AS ENUM(
                'PARTICULIER',
                'RESTAURANT',
                'HOTEL',
                'EVENEMENT',
                'TRAITEUR',
                'COMMERCE',
                'REVENDEUR',
                'GROSSISTE',
                'BOULANGERIE',
                'COLLECTIVITE',
                'ENTREPRISE',
                'ELEVEUR',
                'ONG',
                'TRANSFORMATEUR'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "buyer_profiles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "type" "public"."buyer_profiles_type_enum" NOT NULL DEFAULT 'PARTICULIER',
                "organization_name" character varying,
                "city" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8ef06dd95facdc3db875b449baf" UNIQUE ("user_id"),
                CONSTRAINT "REL_8ef06dd95facdc3db875b449ba" UNIQUE ("user_id"),
                CONSTRAINT "PK_6e8158bfa9ea36f4a16df9c1f41" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."breeds_type_enum" AS ENUM('CHAIR', 'PONDEUSE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."breeds_species_enum" AS ENUM(
                'POULET',
                'DINDE',
                'PINTADE',
                'CAILLE',
                'CANARD',
                'OIE',
                'FAISAN',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "breeds" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "farm_id" uuid,
                "ref_code" character varying(32),
                "type" "public"."breeds_type_enum" NOT NULL,
                "species" "public"."breeds_species_enum" NOT NULL DEFAULT 'POULET',
                "is_custom" boolean NOT NULL DEFAULT false,
                "active" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e89f6e1fbb29d28623b4feb2b3e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e09693b7a38a025e319cc97390" ON "breeds" ("type")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_breeds_farm_name" ON "breeds" ("farm_id", "name")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_breeds_shared_name" ON "breeds" ("name")
            WHERE "farm_id" IS NULL
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."production_batches_type_enum" AS ENUM('CHAIR', 'PONDEUSE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."production_batches_species_enum" AS ENUM(
                'POULET',
                'DINDE',
                'PINTADE',
                'CAILLE',
                'CANARD',
                'OIE',
                'FAISAN',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."production_batches_status_enum" AS ENUM('ACTIF', 'EN_VENTE', 'FINI', 'CLOTURE')
        `);
        await queryRunner.query(`
            CREATE TABLE "production_batches" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "building_id" uuid,
                "breed_id" uuid,
                "batch_name" character varying,
                "integration_date" date NOT NULL,
                "quantity_at_start" integer NOT NULL,
                "quantity_alive" integer NOT NULL,
                "chick_unit_price_fcfa" integer,
                "type" "public"."production_batches_type_enum" NOT NULL DEFAULT 'CHAIR',
                "species" "public"."production_batches_species_enum" NOT NULL DEFAULT 'POULET',
                "custom_species" character varying,
                "custom_breed" character varying,
                "status" "public"."production_batches_status_enum" NOT NULL DEFAULT 'ACTIF',
                "closed_at" TIMESTAMP WITH TIME ZONE,
                "building_area_m2" double precision,
                "feed_unit_sac_kg" double precision,
                "last_computed_fcr" double precision NOT NULL DEFAULT '0',
                "couvoir_supplier" character varying,
                "chick_lot_number" character varying,
                "hatch_date" date,
                "sale_readiness_checked" boolean NOT NULL DEFAULT false,
                "ready_for_sale_at" date,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_35b080bec847bdb82ec04e95c9c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bd9f5756def1f6dc3ee1db5364" ON "production_batches" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e0b8acd66ce964763b3fbc2929" ON "production_batches" ("building_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_65af1d642a663ccf19ce001eaa" ON "production_batches" ("type")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."slaughter_orders_slaughtertype_enum" AS ENUM('VIVANT', 'ABATTU')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."slaughter_orders_destination_enum" AS ENUM('INTERNE', 'EXTERNE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."slaughter_orders_status_enum" AS ENUM('DRAFT', 'SENT', 'PROCESSED', 'CANCELLED')
        `);
        await queryRunner.query(`
            CREATE TABLE "slaughter_orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "reference_number" character varying NOT NULL,
                "slaughterType" "public"."slaughter_orders_slaughtertype_enum" NOT NULL,
                "destination" "public"."slaughter_orders_destination_enum" NOT NULL,
                "planned_date" date NOT NULL,
                "bird_count" integer NOT NULL,
                "carcasses_available" integer NOT NULL DEFAULT '0',
                "total_weight_kg" double precision,
                "carcass_weight_kg" double precision,
                "rendement_percent" double precision,
                "internal_batch_code" character varying,
                "abattoir_lot_code" character varying,
                "status" "public"."slaughter_orders_status_enum" NOT NULL DEFAULT 'DRAFT',
                "processed_at" TIMESTAMP WITH TIME ZONE,
                "abattoir_notes" text,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_221a0d2afa21536abeef8d46806" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_8db3c300392353d6f85449391e" ON "slaughter_orders" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e9bd9c7c332dcec7eb879fc104" ON "slaughter_orders" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_tasks_status_enum" AS ENUM('A_FAIRE', 'EN_COURS', 'FAIT', 'ANNULEE')
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_tasks" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "assignee_id" uuid,
                "batch_id" uuid,
                "title" character varying NOT NULL,
                "notes" text,
                "due_date" date NOT NULL,
                "status" "public"."farm_tasks_status_enum" NOT NULL DEFAULT 'A_FAIRE',
                "completed_at" TIMESTAMP WITH TIME ZONE,
                "overdue_notified_at" TIMESTAMP WITH TIME ZONE,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_05ab3cf1fade5ebf3fdbd922284" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2c0c8a2172dec8c9d594e06437" ON "farm_tasks" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_8a736d91ed5eb1031410f487ec" ON "farm_tasks" ("assignee_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4e44842aab2c81c288404a7176" ON "farm_tasks" ("due_date")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."treatment_records_care_type_enum" AS ENUM(
                'VACCIN',
                'MEDICAMENT',
                'VITAMINE',
                'ANTIBIOTIQUE',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "treatment_records" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "care_type" "public"."treatment_records_care_type_enum" NOT NULL,
                "product_name" character varying NOT NULL,
                "dosage" character varying,
                "route" character varying,
                "administered_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "withdrawal_days" integer NOT NULL DEFAULT '0',
                "withdrawal_end_date" date,
                "performed_by_id" uuid,
                "medication_lot_id" uuid,
                "notes" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_bc7f59330479eebd441ae521c89" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_032fb67100f3ea24768a90c7ff" ON "treatment_records" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_cdb8ef37ba9e67c624df2a2514" ON "treatment_records" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sanitary_protocols_species_enum" AS ENUM(
                'POULET',
                'DINDE',
                'PINTADE',
                'CAILLE',
                'CANARD',
                'OIE',
                'FAISAN',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sanitary_protocols_type_enum" AS ENUM('CHAIR', 'PONDEUSE')
        `);
        await queryRunner.query(`
            CREATE TABLE "sanitary_protocols" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying NOT NULL,
                "farm_id" uuid,
                "species" "public"."sanitary_protocols_species_enum" NOT NULL,
                "type" "public"."sanitary_protocols_type_enum" NOT NULL,
                "name" character varying NOT NULL,
                "is_default" boolean NOT NULL DEFAULT false,
                "is_editable" boolean NOT NULL DEFAULT true,
                "admin_shared" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f4f66ccf90ed8db0df3e4ca6001" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6edecec46a0348e4180e2e2fa1" ON "sanitary_protocols" ("species")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9763cc29ec5de4bbb6c86284f4" ON "sanitary_protocols" ("type")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_sanitary_protocols_farm_code" ON "sanitary_protocols" ("farm_id", "code")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_sanitary_protocols_shared_code" ON "sanitary_protocols" ("code")
            WHERE "farm_id" IS NULL
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."protocol_steps_care_type_enum" AS ENUM(
                'VACCIN',
                'MEDICAMENT',
                'VITAMINE',
                'ANTIBIOTIQUE',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "protocol_steps" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "protocol_id" uuid NOT NULL,
                "step_order" integer NOT NULL,
                "day_from" integer NOT NULL,
                "day_to" integer NOT NULL,
                "care_type" "public"."protocol_steps_care_type_enum" NOT NULL,
                "name" character varying NOT NULL,
                "dosage" character varying,
                "route" character varying,
                "withdrawal_days" integer NOT NULL DEFAULT '0',
                "active" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_c0fbd9ac8498b073819c60529ef" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_45e08ef7f8c93f9b81a6c2d8d4" ON "protocol_steps" ("protocol_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."prophylaxis_events_care_type_enum" AS ENUM(
                'VACCIN',
                'MEDICAMENT',
                'VITAMINE',
                'ANTIBIOTIQUE',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."prophylaxis_events_source_enum" AS ENUM('PROGRAM', 'MANUEL')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."prophylaxis_events_status_enum" AS ENUM('PLANIFIE', 'FAIT', 'EN_RETARD', 'ANNULE')
        `);
        await queryRunner.query(`
            CREATE TABLE "prophylaxis_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "building_id" uuid,
                "protocol_step_id" uuid,
                "care_type" "public"."prophylaxis_events_care_type_enum" NOT NULL,
                "source" "public"."prophylaxis_events_source_enum" NOT NULL DEFAULT 'MANUEL',
                "notes" text,
                "name" character varying NOT NULL,
                "dosage" character varying,
                "route" character varying,
                "withdrawal_days" integer NOT NULL DEFAULT '0',
                "scheduled_date" date NOT NULL,
                "status" "public"."prophylaxis_events_status_enum" NOT NULL DEFAULT 'PLANIFIE',
                "completed_at" TIMESTAMP WITH TIME ZONE,
                "performed_by_id" uuid,
                "performed_notes" text,
                "medication_lot_id" uuid,
                "cancelled_reason" character varying,
                "decrement_stock" boolean NOT NULL DEFAULT false,
                "medication_qty" double precision,
                "medication_unit" character varying,
                "stock_consumed_at" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aeb0d3dec7346731f28ac3f401e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fb11d1a8b29cdb28647ca6451f" ON "prophylaxis_events" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a06493f94ef6f2dbc8cbbb2880" ON "prophylaxis_events" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."health_events_kind_enum" AS ENUM(
                'MALADIE',
                'MORTALITE',
                'REFORME',
                'SYMPTOME',
                'VISITE_VETO',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."health_events_severity_enum" AS ENUM('VERT', 'JAUNE', 'ROUGE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."health_events_status_enum" AS ENUM('OUVERT', 'RESOLU')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."health_events_disease_severity_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
        `);
        await queryRunner.query(`
            CREATE TABLE "health_events" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid NOT NULL,
                "kind" "public"."health_events_kind_enum" NOT NULL,
                "occurred_at" date NOT NULL,
                "severity" "public"."health_events_severity_enum" NOT NULL,
                "status" "public"."health_events_status_enum" NOT NULL,
                "quantity" integer NOT NULL DEFAULT '0',
                "title" character varying(160) NOT NULL,
                "description" text,
                "symptoms" text,
                "disease" character varying(120),
                "disease_severity" "public"."health_events_disease_severity_enum",
                "treatment_given" text,
                "vet_consulted" boolean NOT NULL DEFAULT false,
                "vet_name" character varying(120),
                "notes" text,
                "resolved_at" date,
                "created_by_id" uuid,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f374289cf02fed7cd2b2419f773" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_0979356ec255212dfac5078b52" ON "health_events" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_660626d4021640047090abd077" ON "health_events" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9eaed5673545d557d7b5be6fc1" ON "health_events" ("occurred_at")
        `);
        await queryRunner.query(`
            CREATE TABLE "reference_constants" (
                "key" character varying NOT NULL,
                "value" double precision NOT NULL,
                "description" character varying,
                "is_editable" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_cd1ed8bd5c4f911c7e790ba501d" PRIMARY KEY ("key")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "push_devices" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" uuid NOT NULL,
                "token" character varying NOT NULL,
                "platform" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_f847e055cb2f1c758694dd9b480" UNIQUE ("token"),
                CONSTRAINT "PK_46b68decfd1164e1a796f48dc4a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_80fd9275e4f18bf43e5b7008a1" ON "push_devices" ("user_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."points_of_sale_kind_enum" AS ENUM('FERME', 'BOUTIQUE')
        `);
        await queryRunner.query(`
            CREATE TABLE "points_of_sale" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "idempotency_key" character varying,
                "farm_id" uuid NOT NULL,
                "kind" "public"."points_of_sale_kind_enum" NOT NULL,
                "name" character varying NOT NULL,
                "address" character varying,
                "city" character varying,
                "province" character varying,
                "latitude" double precision,
                "longitude" double precision,
                "is_active" boolean NOT NULL DEFAULT true,
                "is_default" boolean NOT NULL DEFAULT false,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_4635613a15bd74725e9b6547273" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_8272a1f2d5c0bcfed1746159c5" ON "points_of_sale" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_points_of_sale_farm_idem" ON "points_of_sale" ("farm_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."feed_products_entry_type_enum" AS ENUM(
                'BULKER',
                'BAG',
                'MEDICAMENT',
                'MATIERE_PREMIERE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."feed_products_food_type_enum" AS ENUM('DEMARRAGE', 'CROISSANCE', 'FINITION', 'PONTE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."feed_products_feed_phase_enum" AS ENUM(
                'POUSSIN',
                'DEMARRAGE',
                'CROISSANCE',
                'PRE_PONTE',
                'PONTE_PHASE_1',
                'PONTE_PHASE_2',
                'PONTE_PHASE_3',
                'FINITION',
                'PERSONNALISE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "feed_products" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "name" character varying NOT NULL,
                "entry_type" "public"."feed_products_entry_type_enum" NOT NULL DEFAULT 'BAG',
                "food_type" "public"."feed_products_food_type_enum",
                "feed_phase" "public"."feed_products_feed_phase_enum",
                "custom_feed_phase_name" text,
                "default_sac_kg" double precision,
                "default_bag_size_kg" double precision,
                "default_unit_price_fcfa" integer,
                "default_cost_per_mt_fcfa" integer,
                "default_cost_per_bag_fcfa" integer,
                "supplier" text,
                "active" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_c5eeb8355ad19d25d1a1920be0f" UNIQUE ("farm_id", "name"),
                CONSTRAINT "PK_0951e4b487703c7a341459bf0bc" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9d6a28600b0f4d72e70926f501" ON "feed_products" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_lots_kind_enum" AS ENUM(
                'ALIMENT',
                'MEDICAMENT',
                'VITAMINE',
                'POUSSINS',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_lots_food_type_enum" AS ENUM('DEMARRAGE', 'CROISSANCE', 'FINITION', 'PONTE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_lots_unit_enum" AS ENUM('SAC', 'KG')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_lots_entry_type_enum" AS ENUM(
                'BULKER',
                'BAG',
                'MEDICAMENT',
                'MATIERE_PREMIERE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."input_lots_feed_phase_enum" AS ENUM(
                'POUSSIN',
                'DEMARRAGE',
                'CROISSANCE',
                'PRE_PONTE',
                'PONTE_PHASE_1',
                'PONTE_PHASE_2',
                'PONTE_PHASE_3',
                'FINITION',
                'PERSONNALISE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "input_lots" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "idempotency_key" character varying,
                "farm_id" uuid NOT NULL,
                "batch_id" uuid,
                "kind" "public"."input_lots_kind_enum" NOT NULL,
                "food_type" "public"."input_lots_food_type_enum",
                "product_id" uuid,
                "productName" character varying NOT NULL,
                "supplier" character varying NOT NULL,
                "supplier_lot_number" character varying NOT NULL,
                "expiration_date" date,
                "received_date" date NOT NULL,
                "unit_price_fcfa" integer,
                "quantity" double precision NOT NULL DEFAULT '0',
                "unit" "public"."input_lots_unit_enum",
                "entry_type" "public"."input_lots_entry_type_enum" NOT NULL DEFAULT 'BAG',
                "feed_phase" "public"."input_lots_feed_phase_enum",
                "custom_feed_phase_name" text,
                "bag_size_kg" double precision,
                "number_of_bags" integer,
                "tonnage_mt" double precision,
                "cost_per_mt_fcfa" integer,
                "total_cost_fcfa" integer,
                "dose_quantity" double precision,
                "dose_unit" text,
                "additive_name" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_256d56fec2b8a8c87afe9f906e6" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6bd357331913a755ca9f6022ca" ON "input_lots" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_0eac41453053a83357bd52f118" ON "input_lots" ("product_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_eecea7b12f976d3d3aaef94934" ON "input_lots" ("supplier_lot_number")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_input_lots_farm_idem" ON "input_lots" ("farm_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."stock_transfers_producttype_enum" AS ENUM('ABATTU', 'OEUFS', 'PROVENDE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."stock_transfers_status_enum" AS ENUM('TRANSFERRED', 'CANCELLED')
        `);
        await queryRunner.query(`
            CREATE TABLE "stock_transfers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "idempotency_key" character varying,
                "farm_id" uuid NOT NULL,
                "productType" "public"."stock_transfers_producttype_enum" NOT NULL,
                "source_pos_id" uuid NOT NULL,
                "point_of_sale_id" uuid NOT NULL,
                "slaughter_order_id" uuid,
                "batch_id" uuid,
                "input_lot_id" uuid,
                "unit" character varying,
                "quantity" integer NOT NULL,
                "quantity_sold" integer NOT NULL DEFAULT '0',
                "status" "public"."stock_transfers_status_enum" NOT NULL DEFAULT 'TRANSFERRED',
                "cancelled_at" TIMESTAMP WITH TIME ZONE,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_ef738a3a4a578c7f1802c1bb50a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_10d89da5978272b8cf97aed220" ON "stock_transfers" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_45cb0778a63e4f96327bf12877" ON "stock_transfers" ("source_pos_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_110e20d518b6e6c9bcdf46746a" ON "stock_transfers" ("point_of_sale_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_5da04fb155bd3a3710a1a68e93" ON "stock_transfers" ("slaughter_order_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_cd9f1ba0e78a9836d6b8e166a2" ON "stock_transfers" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_60cc7a82098df1d997e4e03662" ON "stock_transfers" ("input_lot_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_stock_transfers_farm_idem" ON "stock_transfers" ("farm_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TABLE "customers" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "code" character varying,
                "full_name" character varying NOT NULL,
                "buyer_user_id" uuid,
                "type" character varying NOT NULL DEFAULT 'PARTICULIER',
                "phone" character varying,
                "email" character varying,
                "city" character varying,
                "notes" text,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a184bd70b540104803b5cf2289" ON "customers" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_customers_farm_code" ON "customers" ("farm_id", "code")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_customers_farm_buyer" ON "customers" ("farm_id", "buyer_user_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_customers_farm_phone" ON "customers" ("farm_id", "phone")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."promotions_type_enum" AS ENUM('PCT', 'FCFA')
        `);
        await queryRunner.query(`
            CREATE TABLE "promotions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "code" character varying NOT NULL,
                "label" character varying NOT NULL,
                "type" "public"."promotions_type_enum" NOT NULL,
                "value" integer NOT NULL,
                "active" boolean NOT NULL DEFAULT true,
                "start_date" date,
                "end_date" date,
                "min_subtotal_fcfa" integer,
                "customer_id" uuid,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_promotions_farm_code" UNIQUE ("farm_id", "code"),
                CONSTRAINT "PK_380cecbbe3ac11f0e5a7c452c34" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6615d465f76dde30630890b50a" ON "promotions" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_8ab10e580f70c3d2e2e4b31ebf" ON "promotions" ("code")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4e111f705b85855893de0a4204" ON "promotions" ("customer_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."cultures_category_enum" AS ENUM(
                'TUBERCULE',
                'MARAICHAGE',
                'FRUIT',
                'CEREALE',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "cultures" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "farm_id" uuid,
                "category" "public"."cultures_category_enum" NOT NULL,
                "default_cycle_days" integer,
                "water_needs_l_plant_day" double precision,
                "is_custom" boolean NOT NULL DEFAULT false,
                "active" boolean NOT NULL DEFAULT true,
                "notes" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_1d1e898d879d22c4a3c25e4d9e5" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4f2fa4c484287a597d440a45ae" ON "cultures" ("category")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_cultures_farm_name" ON "cultures" ("farm_id", "name")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_cultures_shared_name" ON "cultures" ("name")
            WHERE "farm_id" IS NULL
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."parcelles_status_enum" AS ENUM('PREPARATION', 'ACTIVE', 'JACHERE', 'CLOTURE')
        `);
        await queryRunner.query(`
            CREATE TABLE "parcelles" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "name" character varying NOT NULL,
                "culture_id" uuid NOT NULL,
                "area_ha" double precision NOT NULL,
                "boundary_geojson" jsonb,
                "planted_at" date,
                "status" "public"."parcelles_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "notes" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_37bb14058d6d27239fed047a0d3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a8fa227f5d119e8b120ddc58d7" ON "parcelles" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sale_items_product_type_enum" AS ENUM(
                'POULET_PIECE',
                'POULET_KG',
                'ABATTU_PIECE',
                'ABATTU_KG',
                'OEUFS',
                'PROVENDE',
                'RECOLTE',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sale_items_unit_enum" AS ENUM('PIECE', 'KG', 'ALVEOLES', 'UNITE', 'SAC')
        `);
        await queryRunner.query(`
            CREATE TABLE "sale_items" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sale_id" uuid NOT NULL,
                "product_type" "public"."sale_items_product_type_enum" NOT NULL,
                "label" character varying,
                "quantity" double precision NOT NULL,
                "unit" "public"."sale_items_unit_enum" NOT NULL DEFAULT 'UNITE',
                "piece_count" integer,
                "unit_price_fcfa" integer NOT NULL,
                "amount_fcfa" integer NOT NULL,
                "batch_id" uuid,
                "input_lot_id" uuid,
                "source_slaughter_order_id" uuid,
                "stock_transfer_id" uuid,
                "parcelle_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5a7dc5b4562a9e590528b3e08ab" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c210a330b80232c29c2ad68462" ON "sale_items" ("sale_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6510bee02a86eca458a8572af6" ON "sale_items" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_22c01aa15a74b115e742ccc48c" ON "sale_items" ("source_slaughter_order_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_20f8dcd381fa89678168d2ae85" ON "sale_items" ("stock_transfer_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2e79ff2495722bdb679799b7fa" ON "sale_items" ("parcelle_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."payments_method_enum" AS ENUM('CASH', 'MOBILE_MONEY', 'QR_CODE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."payments_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'REFUNDED')
        `);
        await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "sale_id" uuid NOT NULL,
                "amount_fcfa" integer NOT NULL,
                "method" "public"."payments_method_enum" NOT NULL DEFAULT 'CASH',
                "status" "public"."payments_status_enum" NOT NULL DEFAULT 'PENDING',
                "payment_date" date NOT NULL,
                "idempotency_key" character varying,
                "cash_session_id" uuid,
                "extra" jsonb,
                "operator_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9c269ca3cf57cba520041e8612" ON "payments" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_a9272c4415ef64294b104e378a" ON "payments" ("sale_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_payments_farm_sale_idem" ON "payments" ("farm_id", "sale_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."sales_status_enum" AS ENUM('SETTLED', 'OUTSTANDING', 'CANCELLED')
        `);
        await queryRunner.query(`
            CREATE TABLE "sales" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "reference_number" character varying NOT NULL,
                "idempotency_key" character varying,
                "sale_date" date NOT NULL,
                "total_amount_fcfa" integer NOT NULL,
                "discount_amount_fcfa" integer NOT NULL DEFAULT '0',
                "promotion_id" uuid,
                "status" "public"."sales_status_enum" NOT NULL DEFAULT 'SETTLED',
                "customer_id" uuid,
                "batch_id" uuid,
                "point_of_sale_id" uuid,
                "cancelled_at" TIMESTAMP WITH TIME ZONE,
                "cancelled_reason" text,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_7eda0726704e0f1258eeb58ab4a" UNIQUE ("reference_number"),
                CONSTRAINT "PK_4f0bc990ae81dba46da680895ea" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_32e560bdf05f6de4d8146a9624" ON "sales" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7eda0726704e0f1258eeb58ab4" ON "sales" ("reference_number")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b16cd8517fd153bca2951f710e" ON "sales" ("promotion_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c51005b2b06cec7aa17462c54f" ON "sales" ("customer_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_b19d0c682a84a07894d1a7412a" ON "sales" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_88c607cfe37ac226c29c2c432a" ON "sales" ("point_of_sale_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_sales_farm_idempotency" ON "sales" ("farm_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."orders_canal_enum" AS ENUM('FERME', 'LIVRAISON', 'PRECOMMANDE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."orders_source_enum" AS ENUM('MARKET')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'LIVRE', 'CANCELLED')
        `);
        await queryRunner.query(`
            CREATE TABLE "orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "reference_number" character varying NOT NULL,
                "canal" "public"."orders_canal_enum" NOT NULL,
                "sale_id" uuid NOT NULL,
                "source" "public"."orders_source_enum",
                "idempotency_key" character varying,
                "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING',
                "customer_id" uuid,
                "expected_date" date,
                "address" character varying,
                "delivery_province" character varying,
                "latitude" double precision,
                "longitude" double precision,
                "batch_id" uuid,
                "point_of_sale_id" uuid,
                "total_amount_fcfa" integer NOT NULL,
                "deposit_fcfa" integer NOT NULL DEFAULT '0',
                "items" jsonb NOT NULL,
                "passport" jsonb,
                "livred_at" TIMESTAMP WITH TIME ZONE,
                "cancelled_at" TIMESTAMP WITH TIME ZONE,
                "cancelled_reason" text,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_1cb70666c53d18cd3509f8b9354" UNIQUE ("reference_number"),
                CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3181f67751e5bf35b36bfe6287" ON "orders" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1cb70666c53d18cd3509f8b935" ON "orders" ("reference_number")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_aa4fb3bf737b3feebee43b871c" ON "orders" ("sale_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_772d0ce0473ac2ccfa26060dbe" ON "orders" ("customer_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_efc75effc6f0444b5bf6f16e41" ON "orders" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9e5d8491f476ec442d35db083a" ON "orders" ("point_of_sale_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_orders_farm_idem" ON "orders" ("farm_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."market_listings_kind_enum" AS ENUM('NOW', 'PRE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."market_listings_product_enum" AS ENUM('BIRDS', 'EGGS', 'CARCASS')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."market_listings_status_enum" AS ENUM('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED')
        `);
        await queryRunner.query(`
            CREATE TABLE "market_listings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "kind" "public"."market_listings_kind_enum" NOT NULL,
                "product" "public"."market_listings_product_enum" NOT NULL,
                "batch_id" uuid NOT NULL,
                "slaughter_order_id" uuid,
                "description" text,
                "unit_price_fcfa" integer NOT NULL,
                "quantity_published" integer NOT NULL,
                "min_order_qty" integer NOT NULL DEFAULT '1',
                "ready_date" date,
                "previous_ready_date" date,
                "ready_date_moved_at" TIMESTAMP WITH TIME ZONE,
                "deposit_pct" integer,
                "pickup_available" boolean NOT NULL DEFAULT true,
                "delivery_available" boolean NOT NULL DEFAULT false,
                "delivery_fee_fcfa" integer NOT NULL DEFAULT '0',
                "status" "public"."market_listings_status_enum" NOT NULL DEFAULT 'DRAFT',
                "published_at" TIMESTAMP WITH TIME ZONE,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e60db15c3b56cc6fe625b8dd1d9" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_f1a5c86a6772728139d3d104d7" ON "market_listings" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_market_listings_status_published" ON "market_listings" ("status", "published_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_market_listings_farm_status" ON "market_listings" ("farm_id", "status")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."market_orders_fulfilment_enum" AS ENUM('PICKUP', 'DELIVERY')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."market_orders_state_enum" AS ENUM(
                'REQUESTED',
                'REJECTED',
                'WITHDRAWN',
                'EXPIRED',
                'ACCEPTED'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "market_orders" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "listing_id" uuid NOT NULL,
                "farm_id" uuid NOT NULL,
                "buyer_user_id" uuid NOT NULL,
                "quantity" integer NOT NULL,
                "unit_price_fcfa" integer NOT NULL,
                "delivery_fee_fcfa" integer NOT NULL DEFAULT '0',
                "deposit_required_fcfa" integer NOT NULL DEFAULT '0',
                "fulfilment" "public"."market_orders_fulfilment_enum" NOT NULL,
                "address" character varying,
                "contact_phone" character varying NOT NULL,
                "note" text,
                "desired_date" date,
                "state" "public"."market_orders_state_enum" NOT NULL DEFAULT 'REQUESTED',
                "request_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "closed_at" TIMESTAMP WITH TIME ZONE,
                "reject_reason" text,
                "order_id" uuid,
                "accepted_at" TIMESTAMP WITH TIME ZONE,
                "deposit_due_at" TIMESTAMP WITH TIME ZONE,
                "deposit_extended_at" TIMESTAMP WITH TIME ZONE,
                "deposit_expired_at" TIMESTAMP WITH TIME ZONE,
                "cancel_requested_at" TIMESTAMP WITH TIME ZONE,
                "idempotency_key" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e1fe67e5c646e19e8c5257896ca" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_30a10c65ef5ffce3009182d19e" ON "market_orders" ("listing_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_market_orders_buyer_state" ON "market_orders" ("buyer_user_id", "state")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_market_orders_farm_state" ON "market_orders" ("farm_id", "state")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_market_orders_buyer_idem" ON "market_orders" ("buyer_user_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."payment_methods_code_enum" AS ENUM('CASH', 'MOBILE_MONEY', 'QR_CODE')
        `);
        await queryRunner.query(`
            CREATE TABLE "payment_methods" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" "public"."payment_methods_code_enum" NOT NULL,
                "label" character varying NOT NULL,
                "enabled" boolean NOT NULL DEFAULT true,
                "display_hint" character varying,
                "sortOrder" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_f8aad3eab194dfdae604ca11125" UNIQUE ("code"),
                CONSTRAINT "PK_34f9b8c6dfb4ac3559f7e2820d1" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."cash_sessions_status_enum" AS ENUM('OPEN', 'CLOSED')
        `);
        await queryRunner.query(`
            CREATE TABLE "cash_sessions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "status" "public"."cash_sessions_status_enum" NOT NULL DEFAULT 'OPEN',
                "opened_at" date NOT NULL,
                "opening_balance_fcfa" integer NOT NULL DEFAULT '0',
                "closing_balance_fcfa" integer,
                "closing_expected_fcfa" integer,
                "closing_difference_fcfa" integer,
                "closed_at" TIMESTAMP WITH TIME ZONE,
                "opened_by" uuid,
                "closed_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_946ea5ce864b10fb70162708448" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_cash_sessions_open_farm" ON "cash_sessions" ("farm_id")
            WHERE "status" = 'OPEN'
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4c5afd7a99e8000902b9f06de9" ON "cash_sessions" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."cash_movements_type_enum" AS ENUM('IN', 'OUT')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."cash_movements_source_enum" AS ENUM('SALE_PAYMENT', 'REFUND', 'EXPENSE', 'MANUAL')
        `);
        await queryRunner.query(`
            CREATE TABLE "cash_movements" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "cash_session_id" uuid,
                "type" "public"."cash_movements_type_enum" NOT NULL,
                "source" "public"."cash_movements_source_enum" NOT NULL DEFAULT 'MANUAL',
                "amount_fcfa" integer NOT NULL,
                "reason" character varying,
                "sale_id" uuid,
                "movement_date" date NOT NULL,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_25faead19e1ff74153a01604d37" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3c5d56f38b8f10a04e60b463a3" ON "cash_movements" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_fa6a0c146567090acf8a03e01c" ON "cash_movements" ("cash_session_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."expenses_category_enum" AS ENUM(
                'ACHAT_POUSSINS',
                'ALIMENTS',
                'VETERINAIRE',
                'TRANSPORT',
                'EAU',
                'ENERGIE_GAZ',
                'LOYER',
                'MAINTENANCE',
                'ASSURANCE',
                'MAIN_D_OEUVRE',
                'COTISATIONS',
                'FRAIS_BANCAIRES',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "expenses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "expense_date" date NOT NULL,
                "category" "public"."expenses_category_enum" NOT NULL,
                "amount_fcfa" integer NOT NULL,
                "label" character varying,
                "supplier" character varying,
                "notes" text,
                "paid_by_caisse" boolean NOT NULL DEFAULT false,
                "batch_id" uuid,
                "input_lot_id" uuid,
                "cash_movement_id" uuid,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_3308a47e48216d99a80c551f53" ON "expenses" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_35d73bce00337a7dd646facee9" ON "expenses" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "feed_stock_sales" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "input_lot_id" uuid,
                "batch_id" uuid,
                "sale_item_id" uuid,
                "quantity_kg" double precision NOT NULL,
                "sold_at" date NOT NULL,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_dc02941cfda3a0fbbf570441256" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_570f685e38c759a19781ea4016" ON "feed_stock_sales" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_92dfe863f50d23edb58acae7a9" ON "feed_stock_sales" ("input_lot_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_0b5a9580aa29410bb54d1db9ef" ON "feed_stock_sales" ("sale_item_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."feed_stock_losses_reason_enum" AS ENUM('HUMIDITE', 'RONGEURS', 'AUTRE')
        `);
        await queryRunner.query(`
            CREATE TABLE "feed_stock_losses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "idempotency_key" character varying,
                "farm_id" uuid NOT NULL,
                "input_lot_id" uuid,
                "batch_id" uuid,
                "quantity_kg" double precision NOT NULL,
                "reason" "public"."feed_stock_losses_reason_enum" NOT NULL,
                "occurred_at" date NOT NULL,
                "notes" text,
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_e62cbf9239ee704b04a9d19eba3" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_cf59c8e89afd81464618bf7e0e" ON "feed_stock_losses" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_375ce92cf66846e316c95a77fe" ON "feed_stock_losses" ("input_lot_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_feed_stock_losses_farm_idem" ON "feed_stock_losses" ("farm_id", "idempotency_key")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_employees_role_enum" AS ENUM('ADMIN', 'ELEVEUR')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."farm_employees_contract_type_enum" AS ENUM(
                'CDI',
                'CDD',
                'JOURNALIER',
                'STAGE',
                'APPRENTISSAGE',
                'AUTRE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "farm_employees" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "role" "public"."farm_employees_role_enum" NOT NULL DEFAULT 'ELEVEUR',
                "job_title" character varying,
                "permissions" jsonb NOT NULL DEFAULT '[]',
                "active" boolean NOT NULL DEFAULT true,
                "building_assignment" character varying,
                "department" character varying,
                "contract_type" "public"."farm_employees_contract_type_enum",
                "hire_date" date,
                "end_date" date,
                "salary_fcfa" integer,
                "notes" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_ac5ebca268fc886c23806e8df9b" UNIQUE ("farm_id", "user_id"),
                CONSTRAINT "PK_2a1039e073128b7ad192f9a20a4" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."daily_entries_feed_unit_enum" AS ENUM('SAC', 'KG')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."daily_entries_feed_type_enum" AS ENUM('DEMARRAGE', 'CROISSANCE', 'FINITION', 'PONTE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."daily_entries_feed_phase_enum" AS ENUM(
                'POUSSIN',
                'DEMARRAGE',
                'CROISSANCE',
                'PRE_PONTE',
                'PONTE_PHASE_1',
                'PONTE_PHASE_2',
                'PONTE_PHASE_3',
                'FINITION',
                'PERSONNALISE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."daily_entries_source_enum" AS ENUM('MANUELLE', 'SYNC')
        `);
        await queryRunner.query(`
            CREATE TABLE "daily_entries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "batch_id" uuid NOT NULL,
                "entry_date" date NOT NULL,
                "deaths" integer NOT NULL DEFAULT '0',
                "feed_quantity" double precision NOT NULL DEFAULT '0',
                "feed_unit" "public"."daily_entries_feed_unit_enum",
                "bag_size_kg" double precision,
                "feed_type" "public"."daily_entries_feed_type_enum",
                "feed_phase" "public"."daily_entries_feed_phase_enum",
                "custom_feed_phase_name" text,
                "input_lot_id" uuid,
                "skip_stock_deduction" boolean NOT NULL DEFAULT false,
                "water_l" double precision NOT NULL DEFAULT '0',
                "avg_weight_kg" double precision,
                "eggs_collected" integer NOT NULL DEFAULT '0',
                "eggs_sellable" integer NOT NULL DEFAULT '0',
                "eggs_cracked" integer NOT NULL DEFAULT '0',
                "eggs_small" integer NOT NULL DEFAULT '0',
                "eggs_double_yolk" integer NOT NULL DEFAULT '0',
                "eggs_dirty" integer NOT NULL DEFAULT '0',
                "created_by" uuid,
                "source" "public"."daily_entries_source_enum" NOT NULL DEFAULT 'MANUELLE',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_2cc37b7dc5d3f3d3afa11cadb66" UNIQUE ("batch_id", "entry_date"),
                CONSTRAINT "PK_028b8ddda254a474018429f3c81" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1c12beeb569fb2d2202591e8e0" ON "daily_entries" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_1139d3a5a0a160eca2877bb8d5" ON "daily_entries" ("entry_date")
        `);
        await queryRunner.query(`
            CREATE TABLE "buildings" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "name" character varying NOT NULL,
                "building_area_m2" double precision,
                "capacity" integer,
                "last_vide_sanitaire_at" date,
                "longitude" double precision,
                "latitude" double precision,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_bc65c1acce268c383e41a69003a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7cefbfc06950776aa68ca7557b" ON "buildings" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "breed_standards" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "breed_id" uuid NOT NULL,
                "week" integer NOT NULL,
                "target_avg_weight_kg" double precision,
                "target_fcr" double precision,
                "target_lay_rate_percent" double precision,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_84aa0535513f61858039372ced4" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bda997e141f53df6c5a6f537b3" ON "breed_standards" ("breed_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_809658f03a6f2e43197878acea" ON "breed_standards" ("week")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."type_history_entries_fromtype_enum" AS ENUM('CHAIR', 'PONDEUSE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."type_history_entries_totype_enum" AS ENUM('CHAIR', 'PONDEUSE')
        `);
        await queryRunner.query(`
            CREATE TABLE "type_history_entries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "batch_id" uuid NOT NULL,
                "fromType" "public"."type_history_entries_fromtype_enum" NOT NULL,
                "toType" "public"."type_history_entries_totype_enum" NOT NULL,
                "changedOn" date NOT NULL,
                "reason" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_32434c194e6fa1f05e584c179dd" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."rule_registry_kind_enum" AS ENUM(
                'EAU',
                'ALIMENT',
                'MORTALITE',
                'SURDENSITE',
                'DENSITE',
                'DENSITE_BATIMENT',
                'COHABITATION',
                'VIDE_SANITAIRE',
                'IPE',
                'GMQ',
                'PEREMPTION',
                'TRACABILITE',
                'VENTE',
                'DELAI_ATTENTE',
                'PROPHYLAXIE',
                'RENTABILITE',
                'TACHE',
                'SAISIE_MANQUEE',
                'STOCK_OEUF',
                'HEAT',
                'MALADIE'
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "rule_registry" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "code" character varying NOT NULL,
                "kind" "public"."rule_registry_kind_enum" NOT NULL,
                "category" character varying NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "short_label" character varying NOT NULL,
                "description" text NOT NULL,
                "params" jsonb,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_730e2a468701982475497f7c163" UNIQUE ("code"),
                CONSTRAINT "PK_dbccf1458d56e52604f3c5ef340" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."alerts_kind_enum" AS ENUM(
                'EAU',
                'ALIMENT',
                'MORTALITE',
                'SURDENSITE',
                'DENSITE',
                'DENSITE_BATIMENT',
                'COHABITATION',
                'VIDE_SANITAIRE',
                'IPE',
                'GMQ',
                'PEREMPTION',
                'TRACABILITE',
                'VENTE',
                'DELAI_ATTENTE',
                'PROPHYLAXIE',
                'RENTABILITE',
                'TACHE',
                'SAISIE_MANQUEE',
                'STOCK_OEUF',
                'HEAT',
                'MALADIE'
            )
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."alerts_level_enum" AS ENUM('VERT', 'JAUNE', 'ROUGE')
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."alerts_status_enum" AS ENUM('ACTIVE', 'ACQUITTEE', 'RESOLUE')
        `);
        await queryRunner.query(`
            CREATE TABLE "alerts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "batch_id" uuid,
                "building_id" uuid,
                "rule_id" uuid,
                "kind" "public"."alerts_kind_enum" NOT NULL,
                "level" "public"."alerts_level_enum" NOT NULL,
                "status" "public"."alerts_status_enum" NOT NULL DEFAULT 'ACTIVE',
                "message" character varying NOT NULL,
                "recommendation" text,
                "context" jsonb,
                "resolved_at" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_60f895662df096bfcdfab7f4b96" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_15950e7f91abf5dce081f1a3ac" ON "alerts" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_9bbfb58ca0db5e9d5fdf5dbfae" ON "alerts" ("batch_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_4a2ffab9e8418e05279d4021b2" ON "alerts" ("building_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."recoltes_unit_enum" AS ENUM('KG', 'PIECE', 'SAC')
        `);
        await queryRunner.query(`
            CREATE TABLE "recoltes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "parcelle_id" uuid NOT NULL,
                "harvestDate" date NOT NULL,
                "quantity" double precision NOT NULL,
                "unit" "public"."recoltes_unit_enum" NOT NULL,
                "notes" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_6343e1b79d617a65d8496492743" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7c3167c487d8df3cc120296df4" ON "recoltes" ("parcelle_id")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."accounting_exercices_status_enum" AS ENUM('OPEN', 'CLOSED')
        `);
        await queryRunner.query(`
            CREATE TABLE "accounting_exercices" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "label" character varying(120) NOT NULL,
                "start_date" date NOT NULL,
                "end_date" date NOT NULL,
                "status" "public"."accounting_exercices_status_enum" NOT NULL DEFAULT 'OPEN',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_5e8e1bd717d6acb8db61f10e860" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ea1fcc117fe5ad978e36bc21ad" ON "accounting_exercices" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "accounting_journal_entry_lines" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "entry_id" uuid NOT NULL,
                "account_code" character varying(8) NOT NULL,
                "label" character varying(120),
                "debit_fcfa" integer NOT NULL DEFAULT '0',
                "credit_fcfa" integer NOT NULL DEFAULT '0',
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_45d061060ece7776453ee2ff483" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_889cad683d870c8f9743d06d62" ON "accounting_journal_entry_lines" ("entry_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7dd7d64c7fb319239ea48ddbb9" ON "accounting_journal_entry_lines" ("account_code")
        `);
        await queryRunner.query(`
            CREATE TYPE "public"."accounting_journal_entries_status_enum" AS ENUM('POSTED', 'CANCELLED')
        `);
        await queryRunner.query(`
            CREATE TABLE "accounting_journal_entries" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "exercice_id" uuid,
                "reference" character varying NOT NULL,
                "entry_date" date NOT NULL,
                "label" character varying(200) NOT NULL,
                "source" character varying(16) NOT NULL,
                "source_id" character varying(64) NOT NULL,
                "status" "public"."accounting_journal_entries_status_enum" NOT NULL DEFAULT 'POSTED',
                "created_by" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_896cd005a455581c98bf6e28961" UNIQUE ("reference"),
                CONSTRAINT "PK_8f862ba6d60388b1a3a4685183a" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_52dea482944874b72220c370a7" ON "accounting_journal_entries" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_accounting_entries_source" ON "accounting_journal_entries" ("farm_id", "source", "source_id")
        `);
        await queryRunner.query(`
            CREATE TABLE "accounting_accounts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "farm_id" uuid NOT NULL,
                "code" character varying(8) NOT NULL,
                "label" character varying(120) NOT NULL,
                "classe" integer NOT NULL,
                "nature" character varying(12) NOT NULL,
                "is_custom" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_867ef8eb1dd27cb42c62e7d0bdb" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_95dfc920d120735a1ed40bd873" ON "accounting_accounts" ("farm_id")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "UQ_accounts_farm_code" ON "accounting_accounts" ("farm_id", "code")
        `);
        await queryRunner.query(`
            ALTER TABLE "farms"
            ADD CONSTRAINT "FK_204aed99900ed35c8db32c60db7" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "weather_observations"
            ADD CONSTRAINT "FK_a966fcba8c36910c5cef59e787e" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "buyer_profiles"
            ADD CONSTRAINT "FK_8ef06dd95facdc3db875b449baf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "breeds"
            ADD CONSTRAINT "FK_3714b52c96c47fe70e6c4c61343" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD CONSTRAINT "FK_bd9f5756def1f6dc3ee1db5364a" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches"
            ADD CONSTRAINT "FK_3cab5595847ce58e954b7c80600" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "slaughter_orders"
            ADD CONSTRAINT "FK_8db3c300392353d6f85449391e8" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "slaughter_orders"
            ADD CONSTRAINT "FK_e9bd9c7c332dcec7eb879fc1048" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "slaughter_orders"
            ADD CONSTRAINT "FK_63c4033260d7a6586d77cdb3641" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks"
            ADD CONSTRAINT "FK_2c0c8a2172dec8c9d594e06437a" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks"
            ADD CONSTRAINT "FK_8a736d91ed5eb1031410f487ec2" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks"
            ADD CONSTRAINT "FK_945cec65b447b9e9c270fa6274a" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks"
            ADD CONSTRAINT "FK_31ebff7bbf7d3c3f6fea015999d" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_protocols"
            ADD CONSTRAINT "FK_ecf56725f0e36f0b624de740464" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "push_devices"
            ADD CONSTRAINT "FK_80fd9275e4f18bf43e5b7008a19" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "points_of_sale"
            ADD CONSTRAINT "FK_8272a1f2d5c0bcfed1746159c53" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_products"
            ADD CONSTRAINT "FK_9d6a28600b0f4d72e70926f5010" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "input_lots"
            ADD CONSTRAINT "FK_6bd357331913a755ca9f6022caf" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "input_lots"
            ADD CONSTRAINT "FK_3601e72b0a8d864283e1046106f" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "input_lots"
            ADD CONSTRAINT "FK_0eac41453053a83357bd52f1183" FOREIGN KEY ("product_id") REFERENCES "feed_products"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_10d89da5978272b8cf97aed2200" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_45cb0778a63e4f96327bf128774" FOREIGN KEY ("source_pos_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_110e20d518b6e6c9bcdf46746a7" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_5da04fb155bd3a3710a1a68e939" FOREIGN KEY ("slaughter_order_id") REFERENCES "slaughter_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_cd9f1ba0e78a9836d6b8e166a23" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_60cc7a82098df1d997e4e036625" FOREIGN KEY ("input_lot_id") REFERENCES "input_lots"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers"
            ADD CONSTRAINT "FK_f7b8ce0d2d24cebaeb903d6cf5f" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "customers"
            ADD CONSTRAINT "FK_a184bd70b540104803b5cf22895" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "customers"
            ADD CONSTRAINT "FK_8f138f284609b045dc64c91757a" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "promotions"
            ADD CONSTRAINT "FK_6615d465f76dde30630890b50a7" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "promotions"
            ADD CONSTRAINT "FK_4e111f705b85855893de0a4204f" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "promotions"
            ADD CONSTRAINT "FK_8d66c43e5b79535f6320cee7e44" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cultures"
            ADD CONSTRAINT "FK_d88f803a1654762f37e3b360993" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "parcelles"
            ADD CONSTRAINT "FK_a8fa227f5d119e8b120ddc58d72" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "parcelles"
            ADD CONSTRAINT "FK_5857560245b8865e576285a20df" FOREIGN KEY ("culture_id") REFERENCES "cultures"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ADD CONSTRAINT "FK_c210a330b80232c29c2ad68462a" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ADD CONSTRAINT "FK_6510bee02a86eca458a8572af6e" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ADD CONSTRAINT "FK_e1e8d3ebf00c5a97ebf4ada2d0a" FOREIGN KEY ("input_lot_id") REFERENCES "input_lots"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ADD CONSTRAINT "FK_22c01aa15a74b115e742ccc48cb" FOREIGN KEY ("source_slaughter_order_id") REFERENCES "slaughter_orders"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items"
            ADD CONSTRAINT "FK_2e79ff2495722bdb679799b7fa4" FOREIGN KEY ("parcelle_id") REFERENCES "parcelles"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD CONSTRAINT "FK_9c269ca3cf57cba520041e86128" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD CONSTRAINT "FK_a9272c4415ef64294b104e378ac" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "payments"
            ADD CONSTRAINT "FK_8fa7cbb16758920c625424e294b" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sales"
            ADD CONSTRAINT "FK_32e560bdf05f6de4d8146a9624d" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sales"
            ADD CONSTRAINT "FK_b16cd8517fd153bca2951f710e9" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sales"
            ADD CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sales"
            ADD CONSTRAINT "FK_b19d0c682a84a07894d1a7412ac" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sales"
            ADD CONSTRAINT "FK_88c607cfe37ac226c29c2c432a8" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_3181f67751e5bf35b36bfe6287c" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_aa4fb3bf737b3feebee43b871c8" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_efc75effc6f0444b5bf6f16e413" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "FK_9e5d8491f476ec442d35db083a8" FOREIGN KEY ("point_of_sale_id") REFERENCES "points_of_sale"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_listings"
            ADD CONSTRAINT "FK_2bc261f9fe7b3e9ec4476ecfcbb" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_listings"
            ADD CONSTRAINT "FK_f1a5c86a6772728139d3d104d7f" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_listings"
            ADD CONSTRAINT "FK_0f47f6cb4b4742afde7638de829" FOREIGN KEY ("slaughter_order_id") REFERENCES "slaughter_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders"
            ADD CONSTRAINT "FK_30a10c65ef5ffce3009182d19ea" FOREIGN KEY ("listing_id") REFERENCES "market_listings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders"
            ADD CONSTRAINT "FK_4c75ee90a94c092b7a5e9133dc3" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders"
            ADD CONSTRAINT "FK_960248f82f646e5b43c6e63d556" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders"
            ADD CONSTRAINT "FK_e4831dba9def4894e8388a78863" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_sessions"
            ADD CONSTRAINT "FK_4c5afd7a99e8000902b9f06de9b" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_sessions"
            ADD CONSTRAINT "FK_a977e824fcfcc4ec193fe5b5c7d" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_sessions"
            ADD CONSTRAINT "FK_00cdb55a242ce30bf5bb9538714" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements"
            ADD CONSTRAINT "FK_3c5d56f38b8f10a04e60b463a30" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements"
            ADD CONSTRAINT "FK_fa6a0c146567090acf8a03e01c2" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements"
            ADD CONSTRAINT "FK_e386f840aaa2362ae5924601741" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements"
            ADD CONSTRAINT "FK_3e189155db57fc4ec067ef68aa5" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_3308a47e48216d99a80c551f533" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_35d73bce00337a7dd646facee94" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_6c7d7958dc53d545724584cfdca" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses"
            ADD CONSTRAINT "FK_7c0c012c2f8e6578277c239ee61" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales"
            ADD CONSTRAINT "FK_570f685e38c759a19781ea40160" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales"
            ADD CONSTRAINT "FK_92dfe863f50d23edb58acae7a9d" FOREIGN KEY ("input_lot_id") REFERENCES "input_lots"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales"
            ADD CONSTRAINT "FK_61b5df36023e9738d3d1196b13b" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales"
            ADD CONSTRAINT "FK_af8c04e338df07637de63f6ac72" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses"
            ADD CONSTRAINT "FK_cf59c8e89afd81464618bf7e0e5" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses"
            ADD CONSTRAINT "FK_375ce92cf66846e316c95a77fe2" FOREIGN KEY ("input_lot_id") REFERENCES "input_lots"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses"
            ADD CONSTRAINT "FK_cd9a2e06ea0e28c96e51b36af55" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses"
            ADD CONSTRAINT "FK_60af593bbbe30bfceb1fe4cd85c" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_employees"
            ADD CONSTRAINT "FK_0abbeb0ad0df2ceca5a4bb42457" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_employees"
            ADD CONSTRAINT "FK_476adf2ffebd4e0d392016d2de8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD CONSTRAINT "FK_1c12beeb569fb2d2202591e8e07" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD CONSTRAINT "FK_78718cf369865e29ca004e88df9" FOREIGN KEY ("input_lot_id") REFERENCES "input_lots"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries"
            ADD CONSTRAINT "FK_67d830787adf06979bdbcbb3a2e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "buildings"
            ADD CONSTRAINT "FK_7cefbfc06950776aa68ca7557b8" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "breed_standards"
            ADD CONSTRAINT "FK_bda997e141f53df6c5a6f537b37" FOREIGN KEY ("breed_id") REFERENCES "breeds"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "type_history_entries"
            ADD CONSTRAINT "FK_04a6cd18214006ab5ae48784f9a" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "recoltes"
            ADD CONSTRAINT "FK_c399ddef03480e0da74a39fd948" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "recoltes"
            ADD CONSTRAINT "FK_7c3167c487d8df3cc120296df4d" FOREIGN KEY ("parcelle_id") REFERENCES "parcelles"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_exercices"
            ADD CONSTRAINT "FK_ea1fcc117fe5ad978e36bc21ad4" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_journal_entry_lines"
            ADD CONSTRAINT "FK_889cad683d870c8f9743d06d624" FOREIGN KEY ("entry_id") REFERENCES "accounting_journal_entries"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_journal_entries"
            ADD CONSTRAINT "FK_52dea482944874b72220c370a75" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_journal_entries"
            ADD CONSTRAINT "FK_7fc1aac29160ac0426273024b67" FOREIGN KEY ("exercice_id") REFERENCES "accounting_exercices"("id") ON DELETE
            SET NULL ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_accounts"
            ADD CONSTRAINT "FK_95dfc920d120735a1ed40bd8737" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "accounting_accounts" DROP CONSTRAINT "FK_95dfc920d120735a1ed40bd8737"
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_journal_entries" DROP CONSTRAINT "FK_7fc1aac29160ac0426273024b67"
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_journal_entries" DROP CONSTRAINT "FK_52dea482944874b72220c370a75"
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_journal_entry_lines" DROP CONSTRAINT "FK_889cad683d870c8f9743d06d624"
        `);
        await queryRunner.query(`
            ALTER TABLE "accounting_exercices" DROP CONSTRAINT "FK_ea1fcc117fe5ad978e36bc21ad4"
        `);
        await queryRunner.query(`
            ALTER TABLE "recoltes" DROP CONSTRAINT "FK_7c3167c487d8df3cc120296df4d"
        `);
        await queryRunner.query(`
            ALTER TABLE "recoltes" DROP CONSTRAINT "FK_c399ddef03480e0da74a39fd948"
        `);
        await queryRunner.query(`
            ALTER TABLE "type_history_entries" DROP CONSTRAINT "FK_04a6cd18214006ab5ae48784f9a"
        `);
        await queryRunner.query(`
            ALTER TABLE "breed_standards" DROP CONSTRAINT "FK_bda997e141f53df6c5a6f537b37"
        `);
        await queryRunner.query(`
            ALTER TABLE "buildings" DROP CONSTRAINT "FK_7cefbfc06950776aa68ca7557b8"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP CONSTRAINT "FK_67d830787adf06979bdbcbb3a2e"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP CONSTRAINT "FK_78718cf369865e29ca004e88df9"
        `);
        await queryRunner.query(`
            ALTER TABLE "daily_entries" DROP CONSTRAINT "FK_1c12beeb569fb2d2202591e8e07"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_employees" DROP CONSTRAINT "FK_476adf2ffebd4e0d392016d2de8"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_employees" DROP CONSTRAINT "FK_0abbeb0ad0df2ceca5a4bb42457"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses" DROP CONSTRAINT "FK_60af593bbbe30bfceb1fe4cd85c"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses" DROP CONSTRAINT "FK_cd9a2e06ea0e28c96e51b36af55"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses" DROP CONSTRAINT "FK_375ce92cf66846e316c95a77fe2"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_losses" DROP CONSTRAINT "FK_cf59c8e89afd81464618bf7e0e5"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales" DROP CONSTRAINT "FK_af8c04e338df07637de63f6ac72"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales" DROP CONSTRAINT "FK_61b5df36023e9738d3d1196b13b"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales" DROP CONSTRAINT "FK_92dfe863f50d23edb58acae7a9d"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_stock_sales" DROP CONSTRAINT "FK_570f685e38c759a19781ea40160"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_7c0c012c2f8e6578277c239ee61"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_6c7d7958dc53d545724584cfdca"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_35d73bce00337a7dd646facee94"
        `);
        await queryRunner.query(`
            ALTER TABLE "expenses" DROP CONSTRAINT "FK_3308a47e48216d99a80c551f533"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements" DROP CONSTRAINT "FK_3e189155db57fc4ec067ef68aa5"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements" DROP CONSTRAINT "FK_e386f840aaa2362ae5924601741"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements" DROP CONSTRAINT "FK_fa6a0c146567090acf8a03e01c2"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_movements" DROP CONSTRAINT "FK_3c5d56f38b8f10a04e60b463a30"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_sessions" DROP CONSTRAINT "FK_00cdb55a242ce30bf5bb9538714"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_sessions" DROP CONSTRAINT "FK_a977e824fcfcc4ec193fe5b5c7d"
        `);
        await queryRunner.query(`
            ALTER TABLE "cash_sessions" DROP CONSTRAINT "FK_4c5afd7a99e8000902b9f06de9b"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders" DROP CONSTRAINT "FK_e4831dba9def4894e8388a78863"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders" DROP CONSTRAINT "FK_960248f82f646e5b43c6e63d556"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders" DROP CONSTRAINT "FK_4c75ee90a94c092b7a5e9133dc3"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_orders" DROP CONSTRAINT "FK_30a10c65ef5ffce3009182d19ea"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_listings" DROP CONSTRAINT "FK_0f47f6cb4b4742afde7638de829"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_listings" DROP CONSTRAINT "FK_f1a5c86a6772728139d3d104d7f"
        `);
        await queryRunner.query(`
            ALTER TABLE "market_listings" DROP CONSTRAINT "FK_2bc261f9fe7b3e9ec4476ecfcbb"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_9e5d8491f476ec442d35db083a8"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_efc75effc6f0444b5bf6f16e413"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_aa4fb3bf737b3feebee43b871c8"
        `);
        await queryRunner.query(`
            ALTER TABLE "orders" DROP CONSTRAINT "FK_3181f67751e5bf35b36bfe6287c"
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" DROP CONSTRAINT "FK_88c607cfe37ac226c29c2c432a8"
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" DROP CONSTRAINT "FK_b19d0c682a84a07894d1a7412ac"
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" DROP CONSTRAINT "FK_c51005b2b06cec7aa17462c54f5"
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" DROP CONSTRAINT "FK_b16cd8517fd153bca2951f710e9"
        `);
        await queryRunner.query(`
            ALTER TABLE "sales" DROP CONSTRAINT "FK_32e560bdf05f6de4d8146a9624d"
        `);
        await queryRunner.query(`
            ALTER TABLE "payments" DROP CONSTRAINT "FK_8fa7cbb16758920c625424e294b"
        `);
        await queryRunner.query(`
            ALTER TABLE "payments" DROP CONSTRAINT "FK_a9272c4415ef64294b104e378ac"
        `);
        await queryRunner.query(`
            ALTER TABLE "payments" DROP CONSTRAINT "FK_9c269ca3cf57cba520041e86128"
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" DROP CONSTRAINT "FK_2e79ff2495722bdb679799b7fa4"
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" DROP CONSTRAINT "FK_22c01aa15a74b115e742ccc48cb"
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" DROP CONSTRAINT "FK_e1e8d3ebf00c5a97ebf4ada2d0a"
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" DROP CONSTRAINT "FK_6510bee02a86eca458a8572af6e"
        `);
        await queryRunner.query(`
            ALTER TABLE "sale_items" DROP CONSTRAINT "FK_c210a330b80232c29c2ad68462a"
        `);
        await queryRunner.query(`
            ALTER TABLE "parcelles" DROP CONSTRAINT "FK_5857560245b8865e576285a20df"
        `);
        await queryRunner.query(`
            ALTER TABLE "parcelles" DROP CONSTRAINT "FK_a8fa227f5d119e8b120ddc58d72"
        `);
        await queryRunner.query(`
            ALTER TABLE "cultures" DROP CONSTRAINT "FK_d88f803a1654762f37e3b360993"
        `);
        await queryRunner.query(`
            ALTER TABLE "promotions" DROP CONSTRAINT "FK_8d66c43e5b79535f6320cee7e44"
        `);
        await queryRunner.query(`
            ALTER TABLE "promotions" DROP CONSTRAINT "FK_4e111f705b85855893de0a4204f"
        `);
        await queryRunner.query(`
            ALTER TABLE "promotions" DROP CONSTRAINT "FK_6615d465f76dde30630890b50a7"
        `);
        await queryRunner.query(`
            ALTER TABLE "customers" DROP CONSTRAINT "FK_8f138f284609b045dc64c91757a"
        `);
        await queryRunner.query(`
            ALTER TABLE "customers" DROP CONSTRAINT "FK_a184bd70b540104803b5cf22895"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_f7b8ce0d2d24cebaeb903d6cf5f"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_60cc7a82098df1d997e4e036625"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_cd9f1ba0e78a9836d6b8e166a23"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_5da04fb155bd3a3710a1a68e939"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_110e20d518b6e6c9bcdf46746a7"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_45cb0778a63e4f96327bf128774"
        `);
        await queryRunner.query(`
            ALTER TABLE "stock_transfers" DROP CONSTRAINT "FK_10d89da5978272b8cf97aed2200"
        `);
        await queryRunner.query(`
            ALTER TABLE "input_lots" DROP CONSTRAINT "FK_0eac41453053a83357bd52f1183"
        `);
        await queryRunner.query(`
            ALTER TABLE "input_lots" DROP CONSTRAINT "FK_3601e72b0a8d864283e1046106f"
        `);
        await queryRunner.query(`
            ALTER TABLE "input_lots" DROP CONSTRAINT "FK_6bd357331913a755ca9f6022caf"
        `);
        await queryRunner.query(`
            ALTER TABLE "feed_products" DROP CONSTRAINT "FK_9d6a28600b0f4d72e70926f5010"
        `);
        await queryRunner.query(`
            ALTER TABLE "points_of_sale" DROP CONSTRAINT "FK_8272a1f2d5c0bcfed1746159c53"
        `);
        await queryRunner.query(`
            ALTER TABLE "push_devices" DROP CONSTRAINT "FK_80fd9275e4f18bf43e5b7008a19"
        `);
        await queryRunner.query(`
            ALTER TABLE "sanitary_protocols" DROP CONSTRAINT "FK_ecf56725f0e36f0b624de740464"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks" DROP CONSTRAINT "FK_31ebff7bbf7d3c3f6fea015999d"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks" DROP CONSTRAINT "FK_945cec65b447b9e9c270fa6274a"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks" DROP CONSTRAINT "FK_8a736d91ed5eb1031410f487ec2"
        `);
        await queryRunner.query(`
            ALTER TABLE "farm_tasks" DROP CONSTRAINT "FK_2c0c8a2172dec8c9d594e06437a"
        `);
        await queryRunner.query(`
            ALTER TABLE "slaughter_orders" DROP CONSTRAINT "FK_63c4033260d7a6586d77cdb3641"
        `);
        await queryRunner.query(`
            ALTER TABLE "slaughter_orders" DROP CONSTRAINT "FK_e9bd9c7c332dcec7eb879fc1048"
        `);
        await queryRunner.query(`
            ALTER TABLE "slaughter_orders" DROP CONSTRAINT "FK_8db3c300392353d6f85449391e8"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP CONSTRAINT "FK_3cab5595847ce58e954b7c80600"
        `);
        await queryRunner.query(`
            ALTER TABLE "production_batches" DROP CONSTRAINT "FK_bd9f5756def1f6dc3ee1db5364a"
        `);
        await queryRunner.query(`
            ALTER TABLE "breeds" DROP CONSTRAINT "FK_3714b52c96c47fe70e6c4c61343"
        `);
        await queryRunner.query(`
            ALTER TABLE "buyer_profiles" DROP CONSTRAINT "FK_8ef06dd95facdc3db875b449baf"
        `);
        await queryRunner.query(`
            ALTER TABLE "weather_observations" DROP CONSTRAINT "FK_a966fcba8c36910c5cef59e787e"
        `);
        await queryRunner.query(`
            ALTER TABLE "farms" DROP CONSTRAINT "FK_204aed99900ed35c8db32c60db7"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_accounts_farm_code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_95dfc920d120735a1ed40bd873"
        `);
        await queryRunner.query(`
            DROP TABLE "accounting_accounts"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_accounting_entries_source"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_52dea482944874b72220c370a7"
        `);
        await queryRunner.query(`
            DROP TABLE "accounting_journal_entries"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."accounting_journal_entries_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7dd7d64c7fb319239ea48ddbb9"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_889cad683d870c8f9743d06d62"
        `);
        await queryRunner.query(`
            DROP TABLE "accounting_journal_entry_lines"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ea1fcc117fe5ad978e36bc21ad"
        `);
        await queryRunner.query(`
            DROP TABLE "accounting_exercices"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."accounting_exercices_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7c3167c487d8df3cc120296df4"
        `);
        await queryRunner.query(`
            DROP TABLE "recoltes"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."recoltes_unit_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4a2ffab9e8418e05279d4021b2"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9bbfb58ca0db5e9d5fdf5dbfae"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_15950e7f91abf5dce081f1a3ac"
        `);
        await queryRunner.query(`
            DROP TABLE "alerts"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."alerts_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."alerts_level_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."alerts_kind_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "rule_registry"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."rule_registry_kind_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "type_history_entries"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."type_history_entries_totype_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."type_history_entries_fromtype_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_809658f03a6f2e43197878acea"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bda997e141f53df6c5a6f537b3"
        `);
        await queryRunner.query(`
            DROP TABLE "breed_standards"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7cefbfc06950776aa68ca7557b"
        `);
        await queryRunner.query(`
            DROP TABLE "buildings"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1139d3a5a0a160eca2877bb8d5"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1c12beeb569fb2d2202591e8e0"
        `);
        await queryRunner.query(`
            DROP TABLE "daily_entries"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."daily_entries_source_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."daily_entries_feed_phase_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."daily_entries_feed_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."daily_entries_feed_unit_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_employees"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_employees_contract_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_employees_role_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_feed_stock_losses_farm_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_375ce92cf66846e316c95a77fe"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_cf59c8e89afd81464618bf7e0e"
        `);
        await queryRunner.query(`
            DROP TABLE "feed_stock_losses"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."feed_stock_losses_reason_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_0b5a9580aa29410bb54d1db9ef"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_92dfe863f50d23edb58acae7a9"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_570f685e38c759a19781ea4016"
        `);
        await queryRunner.query(`
            DROP TABLE "feed_stock_sales"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_35d73bce00337a7dd646facee9"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3308a47e48216d99a80c551f53"
        `);
        await queryRunner.query(`
            DROP TABLE "expenses"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."expenses_category_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fa6a0c146567090acf8a03e01c"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3c5d56f38b8f10a04e60b463a3"
        `);
        await queryRunner.query(`
            DROP TABLE "cash_movements"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."cash_movements_source_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."cash_movements_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4c5afd7a99e8000902b9f06de9"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_cash_sessions_open_farm"
        `);
        await queryRunner.query(`
            DROP TABLE "cash_sessions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."cash_sessions_status_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "payment_methods"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."payment_methods_code_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_market_orders_buyer_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_market_orders_farm_state"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_market_orders_buyer_state"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_30a10c65ef5ffce3009182d19e"
        `);
        await queryRunner.query(`
            DROP TABLE "market_orders"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."market_orders_state_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."market_orders_fulfilment_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_market_listings_farm_status"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_market_listings_status_published"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_f1a5c86a6772728139d3d104d7"
        `);
        await queryRunner.query(`
            DROP TABLE "market_listings"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."market_listings_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."market_listings_product_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."market_listings_kind_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_orders_farm_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9e5d8491f476ec442d35db083a"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_efc75effc6f0444b5bf6f16e41"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_772d0ce0473ac2ccfa26060dbe"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_aa4fb3bf737b3feebee43b871c"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1cb70666c53d18cd3509f8b935"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3181f67751e5bf35b36bfe6287"
        `);
        await queryRunner.query(`
            DROP TABLE "orders"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."orders_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."orders_source_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."orders_canal_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_sales_farm_idempotency"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_88c607cfe37ac226c29c2c432a"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b19d0c682a84a07894d1a7412a"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c51005b2b06cec7aa17462c54f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_b16cd8517fd153bca2951f710e"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7eda0726704e0f1258eeb58ab4"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_32e560bdf05f6de4d8146a9624"
        `);
        await queryRunner.query(`
            DROP TABLE "sales"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sales_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_payments_farm_sale_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a9272c4415ef64294b104e378a"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9c269ca3cf57cba520041e8612"
        `);
        await queryRunner.query(`
            DROP TABLE "payments"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."payments_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."payments_method_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2e79ff2495722bdb679799b7fa"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_20f8dcd381fa89678168d2ae85"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_22c01aa15a74b115e742ccc48c"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6510bee02a86eca458a8572af6"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c210a330b80232c29c2ad68462"
        `);
        await queryRunner.query(`
            DROP TABLE "sale_items"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sale_items_unit_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sale_items_product_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a8fa227f5d119e8b120ddc58d7"
        `);
        await queryRunner.query(`
            DROP TABLE "parcelles"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."parcelles_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_cultures_shared_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_cultures_farm_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4f2fa4c484287a597d440a45ae"
        `);
        await queryRunner.query(`
            DROP TABLE "cultures"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."cultures_category_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4e111f705b85855893de0a4204"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_8ab10e580f70c3d2e2e4b31ebf"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6615d465f76dde30630890b50a"
        `);
        await queryRunner.query(`
            DROP TABLE "promotions"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."promotions_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_customers_farm_phone"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_customers_farm_buyer"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_customers_farm_code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a184bd70b540104803b5cf2289"
        `);
        await queryRunner.query(`
            DROP TABLE "customers"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_stock_transfers_farm_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_60cc7a82098df1d997e4e03662"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_cd9f1ba0e78a9836d6b8e166a2"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_5da04fb155bd3a3710a1a68e93"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_110e20d518b6e6c9bcdf46746a"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_45cb0778a63e4f96327bf12877"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_10d89da5978272b8cf97aed220"
        `);
        await queryRunner.query(`
            DROP TABLE "stock_transfers"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."stock_transfers_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."stock_transfers_producttype_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_input_lots_farm_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_eecea7b12f976d3d3aaef94934"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_0eac41453053a83357bd52f118"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6bd357331913a755ca9f6022ca"
        `);
        await queryRunner.query(`
            DROP TABLE "input_lots"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_lots_feed_phase_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_lots_entry_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_lots_unit_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_lots_food_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."input_lots_kind_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9d6a28600b0f4d72e70926f501"
        `);
        await queryRunner.query(`
            DROP TABLE "feed_products"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."feed_products_feed_phase_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."feed_products_food_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."feed_products_entry_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_points_of_sale_farm_idem"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_8272a1f2d5c0bcfed1746159c5"
        `);
        await queryRunner.query(`
            DROP TABLE "points_of_sale"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."points_of_sale_kind_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_80fd9275e4f18bf43e5b7008a1"
        `);
        await queryRunner.query(`
            DROP TABLE "push_devices"
        `);
        await queryRunner.query(`
            DROP TABLE "reference_constants"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9eaed5673545d557d7b5be6fc1"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_660626d4021640047090abd077"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_0979356ec255212dfac5078b52"
        `);
        await queryRunner.query(`
            DROP TABLE "health_events"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."health_events_disease_severity_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."health_events_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."health_events_severity_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."health_events_kind_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a06493f94ef6f2dbc8cbbb2880"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_fb11d1a8b29cdb28647ca6451f"
        `);
        await queryRunner.query(`
            DROP TABLE "prophylaxis_events"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."prophylaxis_events_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."prophylaxis_events_source_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."prophylaxis_events_care_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_45e08ef7f8c93f9b81a6c2d8d4"
        `);
        await queryRunner.query(`
            DROP TABLE "protocol_steps"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."protocol_steps_care_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_sanitary_protocols_shared_code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_sanitary_protocols_farm_code"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9763cc29ec5de4bbb6c86284f4"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6edecec46a0348e4180e2e2fa1"
        `);
        await queryRunner.query(`
            DROP TABLE "sanitary_protocols"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sanitary_protocols_type_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."sanitary_protocols_species_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_cdb8ef37ba9e67c624df2a2514"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_032fb67100f3ea24768a90c7ff"
        `);
        await queryRunner.query(`
            DROP TABLE "treatment_records"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."treatment_records_care_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_4e44842aab2c81c288404a7176"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_8a736d91ed5eb1031410f487ec"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2c0c8a2172dec8c9d594e06437"
        `);
        await queryRunner.query(`
            DROP TABLE "farm_tasks"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."farm_tasks_status_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e9bd9c7c332dcec7eb879fc104"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_8db3c300392353d6f85449391e"
        `);
        await queryRunner.query(`
            DROP TABLE "slaughter_orders"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."slaughter_orders_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."slaughter_orders_destination_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."slaughter_orders_slaughtertype_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_65af1d642a663ccf19ce001eaa"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e0b8acd66ce964763b3fbc2929"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bd9f5756def1f6dc3ee1db5364"
        `);
        await queryRunner.query(`
            DROP TABLE "production_batches"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."production_batches_status_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."production_batches_species_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."production_batches_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_breeds_shared_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."UQ_breeds_farm_name"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e09693b7a38a025e319cc97390"
        `);
        await queryRunner.query(`
            DROP TABLE "breeds"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."breeds_species_enum"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."breeds_type_enum"
        `);
        await queryRunner.query(`
            DROP TABLE "buyer_profiles"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."buyer_profiles_type_enum"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a966fcba8c36910c5cef59e787"
        `);
        await queryRunner.query(`
            DROP TABLE "weather_observations"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c6cdc7f7b287695ad281b9c644"
        `);
        await queryRunner.query(`
            DROP TABLE "farms"
        `);
        await queryRunner.query(`
            DROP TABLE "users"
        `);
        await queryRunner.query(`
            DROP TYPE "public"."users_role_enum"
        `);
    }

}
