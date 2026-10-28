# Fermia (formerly KouKou Ferme) — AGENTS

Offline-first farm SaaS (poultry first, multi-species, crops) for Gabon. Brand renamed KouKou → **Fermia**: user-visible text only — storage keys (`koukou.*`), DB name `koukou_ferme` and Expo slug `koukou-mobile` are intentionally unchanged (renaming storage keys would drop unsynced offline cash ops and log users out). Repo: https://github.com/MOCTAR10/koukou

## Repo shape

`backend/` (NestJS), `web/` (admin console), `mobile/` (Expo), `docs/`.

**No root `package.json`, no workspaces, no root lockfile.** Three independent npm projects — every command runs from its own directory. There is **no root README**: `backend/README.md` and `mobile/README.md` are upstream boilerplate (Nest / create-expo-app) — ignore them, this file is the real map.

CI (`.github/workflows/ci.yml`): push to `main`/`feat/**` and PRs to `main`. backend = build+lint+test, web = build+lint, mobile = typecheck+lint+test+`expo export` Android bundle (catches missing assets/Metro errors tsc cannot see). **E2E** (`.github/workflows/e2e.yml`): PRs to `main`, pushes to `main`, nightly 02:00 UTC and manual; PostGIS service container with the default `postgres/postgres` credentials. `concurrency` cancels superseded runs. Node pinned to 22 (Expo quirk) — change all four places together (the three `ci.yml` jobs + `e2e.yml`).

## Commands

| | backend | web | mobile |
|---|---|---|---|
| dev | `npm run start:dev` | `npm run dev` (proxies `/api`→`:3000`) | `npm run start` |
| typecheck | `npm run build` (`nest build` compiles) | `npm run build` (`tsc --noEmit` + vite build) | `npm run typecheck` (`tsc --noEmit`; no build script) |
| lint | `npm run lint` (oxlint) | `npm run lint` (oxlint) | `npm run lint` (`eslint .`) |
| test | `npm run test` | **none — web has no test script** | `npm run test` |

- Single test: `npm run test -- <filter>` in `backend/` or `mobile/` (vitest). Backend e2e: `npm run test:e2e -- <filter>`.
- Prettier: `npm run format` exists in **backend and web only** — mobile has no `format` script (and no `.prettierrc` anywhere except `backend/`). Format is separate from lint.
- `web`: `npm run types` regenerates `src/api/schema.d.ts` from a **running** backend. Output is **not imported** — `src/api/types.ts` is hand-maintained and authoritative. Never edit `schema.d.ts` to fix a type error.
- `mobile`: use `npm run lint`, **not** `npx expo lint` (Node 22 issue).
- Green baseline (verified): backend unit 5 files/29 tests, backend e2e 33 files/339 tests, mobile 24 files/376 tests.
- **Full backend e2e is expensive**: 33 specs, forced sequential (`fileParallelism:false`, `maxWorkers:1`), each boots the whole AppModule *and* runs `synchronize` against the same DB. ~4 min locally, ~2 min on CI. Filter by name while iterating.
- **`vite-tsconfig-paths` is deliberately not installed.** It was a no-op (backend tsconfigs declare no `compilerOptions.paths`, no source file uses alias imports) while pulling in the deprecated `tsconfck`, whose optional peer `typescript@^5.0.0` conflicts with TypeScript 6 — newer npm resolves that peer to 5.x and aborts `npm ci` with `Missing: typescript@5.9.3 from lock file`, which **only reproduces on CI**, never on npm 10.x. Do not re-add it. (`mobile` defines its own `@`→`src` alias inside `vitest.config.mts`.)

## Windows / encoding (this repo is edited on Windows)

- **Never `Get-Content`/`Set-Content`/`Out-File` French UTF-8 files in PS 5.1.** `Get-Content` reads as ANSI and renders `é`→`Ǹ`; `Set-Content` adds a BOM *and* corrupts. Use the `read`/`write`/`edit` tools, or `[System.IO.File]::WriteAllText($p,$s,(New-Object System.Text.UTF8Encoding($false)))`. Tracked files are clean UTF-8 — any `Ǹ`/`â€¦` in console output is a *display* artifact, not damage. Verify before "fixing".
- `.gitattributes` pins `*.ts` and `*.md` to `eol=lf`. Working tree is CRLF on Windows and git warns on every write. Keep LF in the file.

## Backend gotchas

- **Relative imports MUST end in `.js`** (tsconfig `module`/`moduleResolution: nodenext`, `type: module`). All ~1385 relative imports in `src/` + `test/` comply — including tests. A missing `.js` is a runtime `ERR_MODULE_NOT_FOUND`, not a type error.
- **Property-level `@Index('name', ['a','b'])` silently corrupts.** Verified in `node_modules/typeorm/decorator/Index.js`: `columns: propertyName ? [propertyName] : fields` — the field list is **discarded**, while the composite `name` and `unique: true` survive. Result: a single-column unique index under a misleading name. Multi-column `@Index` must be **class-level** (above `@Entity`); single-column may be property-level.
- **Entity circular imports + `emitDecoratorMetadata`** can cause TDZ crashes. Break cycles with `import type` and relation-by-**name** (`@ManyToOne('JournalEntry')`) — never mutual value imports.
- **No migrations.** `synchronize` comes from `DB_SYNCHRONIZE` (default `'true'`) in `app.module.ts`; schema is rebuilt at boot, so **column changes need no migration file** but also can't be rolled back. Seeding is idempotent from `onApplicationBootstrap` in `src/database/database-seed.service.ts` (~2780 lines). Enums live in `src/common/enums/` (38 files) — don't inline string unions.
- **`.env` is gitignored; `backend/.env.example` is the tracked template** (every variable below, plus `TASK_SWEEP_DISABLED`, `PUSH_DISABLED`, `EXPO_ACCESS_TOKEN`) — keep it in sync when adding a variable. Every `DB_*`, `PORT`, `SWAGGER_PATH`, `JWT_EXPIRES_IN` has an inline default, so the app boots without `.env`. The one that matters: **`JWT_SECRET`** — `auth/auth.secret.ts` falls back to a random 48-byte secret per boot (and treats `''` / `koukou_ferme_change_me_in_production` as placeholders), which **silently invalidates all sessions on every restart**. Optional `PLATFORM_ADMIN_EMAIL/PHONE/PASSWORD` (+`PLATFORM_ADMIN_NAME`, default "Administrateur Plateforme") seed the platform admin; absent → warning, no admin created. `UPLOADS_DIR` overrides the farm-logo upload dir (default `backend/uploads`, gitignored).
- **Rate limiting is off in e2e only**: `test/e2e-setup.ts` sets `THROTTLE_DISABLED=true`, read by `ThrottlerModule.skipIf` in `app.module.ts` (auth allows 5 logins/min per IP, the suite does hundreds). Never set it in a deployed environment.
- **e2e needs a live local PostgreSQL** on `DB_HOST:DB_PORT` reading the same `.env`. Each spec boots the full app with synchronize on. Use unique IDs/timestamps and `*.e2e.ga` emails. `globalThis.fetch` is mocked in `test/e2e-setup.ts` (weather returns THI<75 comfort forecast to keep every other spec deterministic and offline); only `weather.e2e-spec.ts` overrides and restores it. Unmatched URLs resolve to a 404 stub.
- **Auth**: `@Public()` exists on exactly two routes — `auth.controller.ts` (`/auth/register`, `/auth/login`). Everything else is JwtAuthGuard → RolesGuard → PermissionsGuard. Phone + code secret, 7d token. Swagger at `/api-docs` (3000).
- **DB naming**: snake_case columns, camelCase TS. **Error messages and all user-facing text are French.**
- **PDFs** (pdfmake 0.3.11): register fonts via `virtualfs.writeFileSync` + `addFonts(...)`; `createPdf(dd).getBuffer()` returns a **Promise**. Set `setUrlAccessPolicy`/`setLocalAccessPolicy(() => false)` to silence warnings. VFS types at `src/common/types/pdfmake-vfs.d.ts`. Use the shared `PdfService` (`src/common/services/pdf.service.ts`, exported by `CommonModule`) — never build a second pdfmake instance per feature.

## Language, roles & permissions

- **UI text, labels, errors: FRENCH. Code identifiers and comments: English.** French comments exist but new code should be English — don't "normalize" the codebase either way.
- `UserRole`: `PLATFORM_ADMIN` (inherits PROPRIETAIRE), `PROPRIETAIRE` (full), `ELEVEUR` (member).
- `FarmStaffRole` is **per farm link**, distinct from `UserRole`: `ADMIN` (flexible, per-link permission list) vs `ELEVEUR` (fixed).
- Effective permissions resolve in `farms.service.ts` (`assertAccessible`/`profileOf`): owner and PLATFORM_ADMIN get `ALL`/`['*']`; `ADMIN` gets **exactly the stored `link.permissions` filtered by `isPermissionCode` — there is no default set, so an empty list means no permissions**; `ELEVEUR` always gets `ELEVEUR_DEFAULT_PERMISSIONS`. A `permissions` payload is refused for ELEVEUR.
- Suspended farm → sales blocked (400). Suspended user → login 401.
- `sanitaire:signaler` (default for ELEVEUR and new ADMIN): create a health event or a single vaccine schedule; generate/edit/delete stay `sanitaire:gerer`.
- **Authz is two layers**: broad `@Roles(...)` plus fine-grained `@Permissions('code', ...)`; owner/PLATFORM_ADMIN bypass both. The catalog is the single source of truth: `src/common/permissions/permission-catalog.ts` (`PERMISSION_GROUPS`). **Never invent a permission code** — gate new routes with existing ones or add to the catalog. Mobile gates with `useFarmProfile().hasPermission()`; per-code constants are mirrored in `mobile/src/constants/permissions.ts`.

## Module map (`backend/src/modules/`)

`auth` · `batches` (M1: `advisory.engine.ts`, `metrics.service.ts`, `dashboard.*`, `pondage.service.ts`, `flock-reconciliation.service.ts`) · `daily-entries` · `inputs` (HACCP `InputLot`) · `alerts` · `sanitary` (M2: health, protocols, vaccine schedules) · `feed-stock` (M3, FEFO; + `feed-products`) · `finance` (M4: sales, caisse, customers, payments, promotions, expenses, `rentabilite.*` P&L, `finance-events.service.ts`) · `slaughter` (M5) · `orders` (Order wraps Sale, JSONB `items` snapshot, acomptes, PDF) · `points-of-sale` (POS + ferme→boutique `stock-transfers`) · `tasks` · `farms` (équipe + permissions) · `accounting` (M11 SYSCOHADA: `posting-map.ts`, `account-plan.data.ts`) · `advisory` (mobile aggregation) · `platform` (`/admin/*`, PLATFORM_ADMIN) · `weather` (THI alerts) · `push` (Expo server push) · `agriculture` (cultures, parcelles, récoltes) · `spatial` (parcel areas: PostGIS when available, JS fallback) · `breeds`/`buildings`/`users`/`reference-constants` (support).

## Key invariants

### Feed stock / finance
- **FEFO auto-assignment**, stock never negative. Quantity by `entryType`: `BULKER`/`MATIERE_PREMIERE` = `tonnageMt×1000` kg; `BAG` = `nBags×bagSizeKg`; `MEDICAMENT` excluded from kg autonomy.
- Feed autonomy thresholds are **seeded reference constants**, not hardcoded: `FEED_STOCK_CRITICAL_DAYS`=3 (RED), `FEED_STOCK_WARN_DAYS`=5 (YELLOW), `FEED_ORDER_TARGET_DAYS`=7. Read them via `constants.get(...)`. Change the seed, not `feed-stock.service.ts`.
- **Cash only** (no Mobile Money). **Integer FCFA.** Caisse never negative. Lot creation (`chickUnitPriceFcfa`) and input receptions **auto-create expenses** (6010/6011 ↔ 401); `Expense.inputLotId` links reception expenses to their lot. The batch P&L counts those costs **once**: it adds `enrichment.chickCostFcfa`/`feedLotsCostFcfa` only when no matching expense exists (legacy data). Do **not** re-enter them as manual expenses. `inputValueFcfa` = unit price × (`numberOfBags` ?? `quantity`). Sale cancellation needs pessimistic locks + an open caisse + sufficient balance. Customers are find-or-create by phone (non-blocking). Promotion codes are uppercased and unique per farm (409 on duplicate).
- Sale types: `POULET_PIECE` requires integer qty; `PROVENDE` requires `inputLotId` (HACCP); `POULET_KG` requires `pieceCount` and decrements `quantityAlive`.

### Points of sale / stock-transfers
- POS `FERME` (default: live birds + slaughter) vs `BOUTIQUE` (external, sells **only** farm-transferred reserves). A FERME POS is never reclassifiable to BOUTIQUE; `stockTransferId` is rejected on non-BOUTIQUE POS.
- `POST /stock-transfers` **decrements the source at creation**: `ABATTU` → `carcassesAvailable` of a PROCESSED order; `PROVENDE` → `InputLot.quantity` (SAC/KG via `farm.defaultSacKg`, default 50); `OEUFS` → derived reservation only (nothing decremented; `EGGS_PER_ALVEOL = 30`, transfers store alvéoles).
- `TRANSFERRED → CANCELLED`; cancel re-integrates `quantity − quantitySold` to the source. Each BOUTIQUE sale decrements `quantitySold` under a pessimistic lock; cancelling it restores via `restoreStockTransfer`.

### Orders
- An `Order` wraps a `Sale`; creation does **not** decrement stock, `fulfil` does. State: `PENDING→CONFIRMED→LIVRE|CANCELLED`; a deposit (→ CONFIRMED) is **optional** — `fulfil` accepts PENDING or CONFIRMED (paid on delivery via `dto.payment`, or on credit: the sale stays OUTSTANDING). Open orders of both states reserve their birds. Cancel passes `skipStockRestore:true`.
- **Never cancel an order's wrapped sale directly** — only via `orders/:id/cancel`, which is idempotent. Egg fulfil must exclude the order's own sale (`excludeSaleId`).
- **Lock ordering matters**: `sales.create` pre-locks *all* lots (sorted, deterministic) before POS items. Otherwise ABATTU→POULET inverts the graph relative to `slaughter.process` (lot→order) and deadlocks.

### Slaughter / sanitary
- `DRAFT→SENT→PROCESSED|CANCELLED` (terminal states immutable). `birdCount ≤ quantityAlive` checked at send **and** at process. Active RED `DELAI_ATTENTE`/`PROPHYLAXIE` blocks shipment. Carcass weight ≤ live weight.
- **All date comparisons in UTC.** REFORME/MORTALITE health events decrement `quantityAlive` immediately and re-run the batch advisory. MORTALITE events are deaths **not** typed in the daily entries: every mortality figure (metrics, dashboard, curve, health trends, viability) adds `FlockReconciliationService.deathEvents()` to the entry deaths — but live-count reconciliation already subtracts them via `netSanitaryRemovedBirds`, so never subtract them twice.
- Pre-loaded `vacc-*` programs are **species- and type-specific**; the server rejects mismatches (400). Never ship a POULET program onto a non-POULET lot.

### Advisory & alerts
- **Advisory only, never blocking** — including HACCP and sanitary. Emit a red alert + recommendation + trace; the farmer decides. Water is the #1 indicator (drop in water + rising mortality → combined `MALADIE` RED/YELLOW). One daily entry per batch per date (upsert on `(batch, entryDate)`).
- Alert lifecycle: `ACTIVE → RESOLUE` when risk clears; manual `ACKNOWLEDGE` → `ACQUITTEE`, re-raised if the risk persists. Periodic re-evaluations pass `raise(..., { keepAcknowledgedIfUnchanged: true })` so an acknowledged alert only comes back when its `context` changes (keep that context single-key: jsonb reorders keys).
- **Overdue tasks** (`TACHE`): `TasksService.sweepOverdue()` runs at boot and hourly (plain `setInterval`, no `@nestjs/schedule`), plus on task mutations and on `GET /tasks`. `TASK_SWEEP_DISABLED=true` turns the timer off (set in `test/e2e-setup.ts`; tests call `sweepOverdue()` directly).
- **Server push** (`modules/push`, Expo Push API, no SDK dependency): phones register `POST /push/devices` (`DELETE /push/devices/:token` on sign-out / toggle-off; a token belongs to one user, re-registering moves it). Triggers go through `koukouBus`, never direct calls: `ALERT_RAISED` (a **new** red alert or an escalation to ROUGE — re-evaluations of an existing red alert stay silent) → owner + active `ADMIN` staff; `TASK_ASSIGNED` (not self-assignment) → assignee; `TASKS_OVERDUE` → assignee (managers for unassigned), once per task via `FarmTask.overdueNotifiedAt` (atomic claim, cleared when the due date moves; >7 days late = marked silently). Sends are fire-and-forget (`PushService.track`); `DeviceNotRegistered` tickets delete the token. `PUSH_DISABLED=true` in e2e; `push.e2e-spec.ts` swaps `PushService.deliver` and awaits `flush()`.
- **Batch indicators** (`batches/flock-performance.ts`, pure + unit-tested) are shared by `MetricsService`, the water alerts in `AdvisoryEngine` and the batch curve. Population on a day = start − daily-entry deaths − removals (`FlockReconciliationService.removalsByDate`: sales, slaughter, REFORME/MORTALITE events). FCR/GMQ/IPE are computed **at the last weighing** (feed and age up to that day); FCR divides by the biomass of every bird fed (present + sold/slaughtered/culled/dead at their interpolated weight). `waterLPerBird` = average L/oiseau/j over the last 7 days. Breed weight/FCR targets are taken at the weighing week. The IPE alert compares `ipe` with `ipeTarget` (breed curve at the weighing age, lot's own viability) — CHAIR lots with a standard only; never an absolute threshold.
- **Closed lots** (`CLOTURE`): `close()` stamps `ProductionBatch.closedAt`; `AdvisoryEngine.runForBatch` then only resolves the lot's batch-scoped alerts (`AlertsService.resolveClosedBatch`, keeping `CLOSED_BATCH_KEPT_KINDS` = TRACABILITE/RENTABILITE/VENTE) and re-evaluates traceability + its building. **Vide sanitaire** = days between the previous lot's end (`closedAt`, legacy fallback `updatedAt`) and the next lot's `integrationDate` in the same building, judged at placement (lot placed before the previous one ended = 0 days): < `VIDE_SANITAIRE_MIN_DAYS` ROUGE, < `VIDE_SANITAIRE_MAX_DAYS` JAUNE, else nothing. An emptied building raises nothing. Building-scoped alerts store `batchId` null (the lot is in `context.batchId`). `DatabaseSeedService.repairClosedBatchAlerts()` (boot, idempotent) pins `closed_at` and resolves alerts left by the old rule. Building `stats.lastLotEndedAt` feeds the mobile lot-creation hint (`mobile/src/utils/videSanitaire.ts`, same 14/21 defaults); `Building.lastVideSanitaireAt` is a manual field no rule reads.
- **Readiness is computed on read** in `MetricsService.compute()` (`readyForSale`/`readyReason`) and cached onto `ProductionBatch.readyForSaleAt` by `batches.service.afterChange`. `BatchStatus.EN_VENTE` is only a manual escape hatch.

### SYSCOHADA accounting
- Integer FCFA; entries **always balance**; posted **in the same transaction** as the business mutation. Idempotent via unique `(farmId, source, sourceId)` (tolerate PG `23505`). No TVA.
- Order revenue is recognized **at delivery**, not creation (the order-wrapper sale is written with a direct `saleRepo.save`). Cancelling before delivery posts only `cancel-deposits:`.
- Feed stock (Classe 3) → `311` (asset) ↔ `603`, valued per lot by available vs received kg.
- Accounts auto-seed via `ensureAccounts`; `Account.code` is unique per farm (class-level composite index).
- **Bilan = snapshot at `to`** (default today; `from` ignored): cumulative balances, classes 2–3 always actif, classes 1 (debts)/4/5 classified by balance sign, class 8 excluded. Capitaux = apports + **computed report à nouveau** (classes 6/7 before the exercice start + net `12`/`129`/`13`) + résultat of the exercice containing `to`. Balances by construction (`ecartFcfa` = 0). Until the exercice is closed, the feed stock on hand at `to` (`valeurStockProvende(asOf)`, same rule as the closing) is added to actif `311` and to the result as `variationStockFcfa`; the closing itself values the stock at the exercice end date. Manual régularisations dated in a CLOSED exercice → 400; automatic postings are still accepted (never blocking).
- Mobile write paths — `comptabilite.tsx`, `depenses.tsx`, `components/pos/CaisseTab.tsx` — are gated by `compta:rapports`/`compta:ecritures`/`compta:depense`. Non-manual cash movements (`SALE_PAYMENT`/`REFUND`/`EXPENSE`) are immutable.

## Web console (`web/`)

- Vite + React 18 + TS strict + Tailwind v4 + react-router v6 + TanStack Query v5. `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` on — unused vars are build failures, not warnings. **PLATFORM_ADMIN only** — any other role gets `MobileOnlyScreen` from `src/auth/guards.tsx`.
- `src/api/client.ts`: fetch wrapper, localStorage keys `koukou.token` / `koukou.user`, and `.download(path, filename)` for PDFs. A 401 triggers logout, so use `.download()` rather than raw `fetch` for file endpoints.
- Routes live in `src/App.tsx`: `/login`, then under `/app` → `dashboard|batches|alerts|finance|stock|sanitary|slaughter|team|settings` (the four finance pages are *flat* siblings: `finance/ventes|caisse|clients|promotions`, `finance` itself defaults to `ventes`), plus `/app/platform` behind `RequiresPlatformAdmin`.
- Every query key carries `farmId` as the 2nd element. After a sale, invalidate exactly `['sales'|'batches'|'dashboard'|'caisse-current'|'feed-stock'|'customers', farmId]` (`SalesPage.tsx`).
- Feed option label is `` `${supplierLotNumber} - ${productName}` `` (**not** `lotNumber`).
- Farm context lives in `src/app/FarmContext.tsx`; there is no `src/app/router`.

## Mobile (`mobile/`)

- **Expo SDK 54**, RN 0.81, React 19, expo-router ~6. Routes are in **`src/app/`** (not `app/`). StyleSheet + theme tokens from `src/constants/theme.ts` — **no NativeWind**. Read `mobile/AGENTS.md` (and `mobile/CLAUDE.md` → `@AGENTS.md`) before writing Expo code; the SDK pin exists because store Expo Go cannot run SDK 55+.
- `app.json` sets `experiments.reactCompiler: true` and `typedRoutes: true`, but there is **no `babel.config.js` or `metro.config.js`** — Metro runs on defaults, so don't assume the compiler is transforming anything.
- `react-native-worklets` is pinned to **exactly** `0.5.1` (Reanimated 4 requirement). Don't loosen to `~` or bump it independently.
- `expo-haptics`/`expo-sharing` must **not** be listed in `plugins` in `app.json` (no `app.plugin.js`; TS entry resolution crashes with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
- Import the API from **`@/api`** (facade over `live.ts`) — never `@/api/live` directly; no file does. The mock backend is gone: `isLive()` is hardcoded `return true` (`src/api/index.ts`).
- Tests are colocated `src/**/*.test.ts` (24 files, 376 tests), `environment: 'node'`, `@`→`src` alias in `vitest.config.mts`. No `.tsx` tests exist — pure logic only, no component rendering.
- **Session storage** (`src/api/token.ts`): web keeps the whole session in `localStorage`. iOS/Android keep the JWT in `expo-secure-store` (`secure-token.native.ts`, sync API) and only non-secret data in the session file (`persistent-kv.native.ts`); a legacy file with a plain-text token is migrated on first load. Never write the token to the file store. `remove()` blanks the value instead of `deleteItemAsync` (an async delete could wipe a fresh re-login token).
- Auth is enforced by `<Stack.Protected guard={signedIn}>` in `src/app/_layout.tsx`. Do not reintroduce a SessionGate or `router.replace` at mount.
- Keep render pure: `Math.random`/`Date.now` belong in module-scope helpers (see the explicit helper block in `src/app/(tabs)/lots.tsx`). This is a **convention, not a lint rule** — eslint only enables `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`; `react-hooks/purity` is *not* active.
- **Reminders are LOCAL notifications**, server push aside (`expo-notifications`, `src/notifications/`): `plan.ts` (pure, tested) builds the plan — daily « saisie du jour » at the chosen hour when the farm has active lots, 7 h on the due day for open tasks and planned care (`SOIN` actions of `/advisory`), capped at 50 (iOS limit 64) — and `scheduler.ts` replaces the scheduled set when the plan signature changes. `<LocalReminders />` (in `_layout.tsx`) keeps it in sync and routes every notification tap (`data.route`, cold start included); the per-device toggles/hour live in Réglages › Notifications (`koukou.reminders`). **Server push** (`push.ts`, `<PushRegistration />`): Android channel `alertes` (same id as the backend), token from `getExpoPushTokenAsync({ projectId })`, unregistered in `signOut()` before the session is cleared. `push-availability.ts` (pure, tested) disables it in Expo Go Android (removed since SDK 53) and when `app.json` has no `extra.eas.projectId` — **not configured yet**: needs `eas init`, an `android.package`, a Firebase `google-services.json` (+ FCM V1 key uploaded to EAS) and a dev/production build. `expo-notifications` is deliberately not in `app.json` `plugins` (only needed for custom icon/sounds in a native build).
- Offline submit buttons must bind `disabled={... || busy}` to prevent double-enqueue.
- `CustomTabBar` has intentionally loose types — do **not** re-import `BottomTabBarProps`.

### Motion
- **Reanimated 4.x** (mobile) / **`motion` v13** (web). **No Moti, no GSAP** — never add a native animation dependency. Tokens: `src/constants/motion.ts` (mobile) and `src/lib/motion.ts` (web). Primitives: `src/components/ui/motion/{AnimatedNumber,TapScale}.tsx` and `web/src/components/AnimatedNumber.tsx`. Always honour reduced motion (`timed()`/`springed()` default to `System`). Repo skill **`motion-design`** is the best-practices source.
- Reanimated 4's `withSpring` config is a discriminated union — pass a concrete config, never spread a `Partial`.

### Offline sync (`mobile/src/offline/`)
- Custom FIFO engine, zero dependencies (`engine.ts`/`storage.ts`/`store.ts`). Network failure (`TypeError` or `ApiError ≥ 500`) → enqueue; 4xx propagates and drops. Every queued **creation** (sale, order, payments, feed input, feed loss, point of sale, stock transfer) sends `idempotencyKey = op.id` on the live attempt *and* on replay; the server returns the existing row via `createOnce()` (`backend/src/common/utils/idempotency.ts`, unique `(farmId, idempotencyKey)`). Daily entries are an upsert on `(batch, entryDate)`; state transitions (deliver/cancel/delete) answer a replay with 4xx, which drops the op harmlessly.
- `flushQueue()` returns `{synced, dropped, remaining}` and is guarded by a **mutex** promise so concurrent callers share one pass (no double-POST). `runFlush()` **re-loops up to 20 rounds** (`engine.ts`) while new ops arrive — never snapshot the queue.
- **Cash ops (`sale`, `order-payment`, `customer-payment`) must never be dropped.** `ensureCashOpenOrRetry()` deliberately rethrows a plain `Error` (not `ApiError`) so a 4xx from the caisse step maps to *retry*, not *drop*.
- `OfflineAutoSync` (mounted in `_layout.tsx`) flushes on reconnect/pending-op, ref-guarded. Invalidate via `invalidateFarmQueries()`.

### Reference data per farm
- `Breed`, `Culture` and `SanitaryProtocol` carry a nullable `farmId`: **null = shared, seeded reference data**; custom rows belong to the farm that created them. A farm sees and uses shared rows + its own (`common/utils/farm-scope.ts` `sharedOrFarm()`); names/codes are unique among shared rows and within a farm (partial + composite unique indexes, class-level). `GET /breeds|/cultures|/sanitary/protocols[/:id]` take `?farmId=` (without it: shared only); `POST` needs `farmId` in the body (`FarmsService.resourceScope`; only PLATFORM_ADMIN may create a shared row). Batch creation (`breedId`), parcelles (`cultureId`) and program generation (`protocolId`) refuse another farm's row. Seed lookups filter `farmId IS NULL`. `DatabaseSeedService.assignLegacyCustomResources()` (boot, idempotent) gives each legacy custom row used by exactly one farm to that farm.

## Seeded data & tunable constants

8 species (`Species` enum) with seeded breeds + zootechnic curves, `standard_module` = 3000, densities 15/18, vaccination programs `GABON_VACC_PROTOCOLS`.

`ReferenceKey` (~33 keys, enum in `src/common/enums/reference-key.enum.ts`, seeded in `database-seed.service.ts`) holds **data, not code**: alert thresholds, calendar lead days, density/sac defaults, profitability margins. GET is `@Roles(PROPRIETAIRE, ELEVEUR)`, PATCH is `@Roles(PLATFORM_ADMIN)` and rejects values ≤ 0. Always confirm you are editing the seed and not a hardcoded literal.

## Domain reference

`docs/rag-knowledge/` is the poultry knowledge base (eau, alimentation, oeufs, poids, mortalite, sante, especes, donnees-ferme, cultures, parcelles) — start at its `README.md`. **Read the relevant file before changing any threshold or advisory rule**; never quote a number without its context (which reference constant, which calculation window, batch vs building scope). Alerts are computed server-side by `AdvisoryEngine` (`modules/batches/advisory.engine.ts`); the corpus is reference material only. `docs/abattage-tracabilite-plan.md` is a design plan, not a spec.

## Not built

PostGIS is **optional**, not required: `app.module.ts` tries `CREATE EXTENSION postgis` at boot and `SpatialService` falls back to a JS area computation without it (e2e runs on a PostGIS image).

FinTech/Mobile Money (escrow) · Fermia Market marketplace (the backend `orders` module is delivered, but there is no public client channel).

## OpenCode (native subagents)

Config: `opencode.json` (root). Subagents run in child sessions and inherit parent context — keep prompts tight.

- **Flow**: prefer Plan for analysis, switch to Build only when ready to edit.
- **Available subagents here are `@explore` and `@general` only** (no `scout`, despite the stale `"scout": "allow"` entry in `opencode.json`). `@explore` is read-only and cheapest — use it for grep/glob/file discovery. `@general` has full tools including edits. For small or single-area tasks just work inline: `build` already has full tools, and spawning costs a fresh context.
- **Parallel fan-out**: only independent, file-isolated work. **Never run backend e2e in parallel** (single PostgreSQL + synchronize:true, fileParallelism:false, maxWorkers:1). Mobile/web unit tests can run in parallel if tasks don't share state. Two `@general` agents on one file will conflict — the permission system cannot prevent it.
- **Caps**: `agent.build.steps=25`, `agent.plan.steps=12`, `subagentDepth=1` (subagents cannot spawn subagents). Task permissions deny `*` by default (build allows explore/general, plan allows explore only). `steps` is the current field; `maxSteps` is deprecated. Hidden agents (title/summary/compaction) use `smallModel`.
- **Context hygiene**: spawn from a clean turn; don't fan out from a very long session.
- **CI is the proof-of-work gate.** Run the three commands above locally first — it catches failures in seconds instead of minutes.