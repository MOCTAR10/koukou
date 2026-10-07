# KouKou Ferme — AGENTS

Offline-first poultry SaaS (multi-species) for Gabon. Repo: https://github.com/MoctarSidibe/koukou

## Repo shape

`backend/` (NestJS), `web/` (admin console), `mobile/` (Expo), `docs/`.

**No root `package.json`, no workspaces, no root lockfile.** Three independent npm projects — every command runs from its own directory. There is **no root README**: `backend/README.md` and `mobile/README.md` are upstream boilerplate (Nest / create-expo-app) — ignore them, this file is the real map.

CI exists (`.github/workflows/ci.yml`): push to `main`/`feat/**` and PRs to `main`. backend = build+lint+test, web = build+lint, mobile = typecheck+lint+test. **No e2e.** `concurrency` cancels superseded runs. Node pinned to 22 (Expo quirk) — change all three jobs together.

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
- Green baseline (verified): backend unit 2 files/10 tests, mobile 16 files/305 tests.
- **Full backend e2e is expensive**: 28 specs, forced sequential (`fileParallelism:false`, `maxWorkers:1`), each boots the whole AppModule *and* runs `synchronize` against the same DB. ~10 min. Filter by name while iterating.
- **`vite-tsconfig-paths` is deliberately not installed.** It was a no-op (backend tsconfigs declare no `compilerOptions.paths`, no source file uses alias imports) while pulling in the deprecated `tsconfck`, whose optional peer `typescript@^5.0.0` conflicts with TypeScript 6 — newer npm resolves that peer to 5.x and aborts `npm ci` with `Missing: typescript@5.9.3 from lock file`, which **only reproduces on CI**, never on npm 10.x. Do not re-add it. (`mobile` defines its own `@`→`src` alias inside `vitest.config.mts`.)

## Windows / encoding (this repo is edited on Windows)

- **Never `Get-Content`/`Set-Content`/`Out-File` French UTF-8 files in PS 5.1.** `Get-Content` reads as ANSI and renders `é`→`Ǹ`; `Set-Content` adds a BOM *and* corrupts. Use the `read`/`write`/`edit` tools, or `[System.IO.File]::WriteAllText($p,$s,(New-Object System.Text.UTF8Encoding($false)))`. Tracked files are clean UTF-8 — any `Ǹ`/`â€¦` in console output is a *display* artifact, not damage. Verify before "fixing".
- `.gitattributes` pins `*.ts` and `*.md` to `eol=lf`. Working tree is CRLF on Windows and git warns on every write. Keep LF in the file.

## Backend gotchas

- **Relative imports MUST end in `.js`** (tsconfig `module`/`moduleResolution: nodenext`, `type: module`). All ~1225 relative imports in `src/` + `test/` comply — including tests. A missing `.js` is a runtime `ERR_MODULE_NOT_FOUND`, not a type error.
- **Property-level `@Index('name', ['a','b'])` silently corrupts.** Verified in `node_modules/typeorm/decorator/Index.js`: `columns: propertyName ? [propertyName] : fields` — the field list is **discarded**, while the composite `name` and `unique: true` survive. Result: a single-column unique index under a misleading name. Multi-column `@Index` must be **class-level** (above `@Entity`); single-column may be property-level. Live violations to fix, not copy: `finance/entities/sale.entity.ts:39`, `orders/entities/order.entity.ts:135`.
- **Entity circular imports + `emitDecoratorMetadata`** can cause TDZ crashes. Break cycles with `import type` and relation-by-**name** (`@ManyToOne('JournalEntry')`) — never mutual value imports.
- **No migrations.** `synchronize` comes from `DB_SYNCHRONIZE` (default `'true'`) in `app.module.ts`; schema is rebuilt at boot, so **column changes need no migration file** but also can't be rolled back. Seeding is idempotent from `onApplicationBootstrap` in `src/database/database-seed.service.ts` (~2560 lines). Enums live in `src/common/enums/` (34 files) — don't inline string unions.
- **`.env` is gitignored and there is no `.env.example`** (`.gitignore` has `!.env.example`, so one *would* be tracked — it just doesn't exist). Every `DB_*`, `PORT`, `SWAGGER_PATH`, `JWT_EXPIRES_IN` has an inline default, so the app boots without `.env`. The one that matters: **`JWT_SECRET`** — `auth/auth.secret.ts` falls back to a random 48-byte secret per boot (and treats `''` / `koukou_ferme_change_me_in_production` as placeholders), which **silently invalidates all sessions on every restart**. Optional `PLATFORM_ADMIN_EMAIL/PHONE/PASSWORD` (+`PLATFORM_ADMIN_NAME`, default "Administrateur Plateforme") seed the platform admin; absent → warning, no admin created. `UPLOADS_DIR` overrides the farm-logo upload dir (default `backend/uploads`, gitignored).
- **e2e needs a live local PostgreSQL** on `DB_HOST:DB_PORT` reading the same `.env`. Each spec boots the full app with synchronize on. Use unique IDs/timestamps and `*.e2e.ga` emails. `globalThis.fetch` is mocked in `test/e2e-setup.ts` (weather returns THI<75 comfort forecast to keep every other spec deterministic and offline); only `weather.e2e-spec.ts` overrides and restores it. Unmatched URLs resolve to a 404 stub.
- **Auth**: `@Public()` exists on exactly two routes — `auth.controller.ts:13` and `:20` (`/auth/register`, `/auth/login`). Everything else is JwtAuthGuard → RolesGuard → PermissionsGuard. Phone + code secret, 7d token. Swagger at `/api-docs` (3000).
- **DB naming**: snake_case columns, camelCase TS. **Error messages and all user-facing text are French.**
- **PDFs** (pdfmake 0.3.11): register fonts via `virtualfs.writeFileSync` + `addFonts(...)`; `createPdf(dd).getBuffer()` returns a **Promise**. Set `setUrlAccessPolicy`/`setLocalAccessPolicy(() => false)` to silence warnings. VFS types at `src/common/types/pdfmake-vfs.d.ts`. Use the shared `PdfService` (`src/common/services/pdf.service.ts`, exported by `CommonModule`) — never build a second pdfmake instance per feature.

## Language, roles & permissions

- **UI text, labels, errors: FRENCH. Code identifiers and comments: English.** French comments exist but new code should be English — don't "normalize" the codebase either way.
- `UserRole`: `PLATFORM_ADMIN` (inherits PROPRIETAIRE), `PROPRIETAIRE` (full), `ELEVEUR` (member).
- `FarmStaffRole` is **per farm link**, distinct from `UserRole`: `ADMIN` (flexible, per-link permission list) vs `ELEVEUR` (fixed).
- Effective permissions resolve in `farms.service.ts` (`assertAccessible`/`profileOf`): owner and PLATFORM_ADMIN get `ALL`/`['*']`; `ADMIN` gets **exactly the stored `link.permissions` filtered by `isPermissionCode` — there is no default set, so an empty list means no permissions**; `ELEVEUR` always gets `ELEVEUR_DEFAULT_PERMISSIONS`. A `permissions` payload is refused for ELEVEUR.
- Suspended farm → sales blocked (400). Suspended user → login 401.
- **Authz is two layers**: broad `@Roles(...)` plus fine-grained `@Permissions('code', ...)`; owner/PLATFORM_ADMIN bypass both. The catalog is the single source of truth: `src/common/permissions/permission-catalog.ts` (`PERMISSION_GROUPS`). **Never invent a permission code** — gate new routes with existing ones or add to the catalog. Mobile gates with `useFarmProfile().hasPermission()`; per-code constants are mirrored in `mobile/src/constants/permissions.ts`.

## Module map (`backend/src/modules/`)

`auth` · `batches` (M1: `advisory.engine.ts`, `metrics.service.ts`, `dashboard.*`, `pondage.service.ts`, `flock-reconciliation.service.ts`) · `daily-entries` · `inputs` (HACCP `InputLot`) · `alerts` · `sanitary` (M2: health, protocols, vaccine schedules) · `feed-stock` (M3, FEFO; + `feed-products`) · `finance` (M4: sales, caisse, customers, payments, promotions, expenses, `rentabilite.*` P&L, `finance-events.service.ts`) · `slaughter` (M5) · `orders` (Order wraps Sale, JSONB `items` snapshot, acomptes, PDF) · `points-of-sale` (POS + ferme→boutique `stock-transfers`) · `tasks` · `farms` (équipe + permissions) · `accounting` (M11 SYSCOHADA: `posting-map.ts`, `account-plan.data.ts`) · `advisory` (mobile aggregation) · `platform` (`/admin/*`, PLATFORM_ADMIN) · `weather` (THI alerts) · `breeds`/`buildings`/`users`/`reference-constants` (support).

## Key invariants

### Feed stock / finance
- **FEFO auto-assignment**, stock never negative. Quantity by `entryType`: `BULKER`/`MATIERE_PREMIERE` = `tonnageMt×1000` kg; `BAG` = `nBags×bagSizeKg`; `MEDICAMENT` excluded from kg autonomy.
- Feed autonomy thresholds are **seeded reference constants**, not hardcoded: `FEED_STOCK_CRITICAL_DAYS`=3 (RED), `FEED_STOCK_WARN_DAYS`=5 (YELLOW), `FEED_ORDER_TARGET_DAYS`=7. Read them via `constants.get(...)`. Change the seed, not `feed-stock.service.ts`.
- **Cash only** (no Mobile Money). **Integer FCFA.** Caisse never negative. P&L auto-deducts chick + feed costs — do **not** re-enter them as manual expenses. Sale cancellation needs pessimistic locks + an open caisse + sufficient balance. Customers are find-or-create by phone (non-blocking). Promotion codes are uppercased and unique per farm (409 on duplicate).
- Sale types: `POULET_PIECE` requires integer qty; `PROVENDE` requires `inputLotId` (HACCP); `POULET_KG` requires `pieceCount` and decrements `quantityAlive`.

### Points of sale / stock-transfers
- POS `FERME` (default: live birds + slaughter) vs `BOUTIQUE` (external, sells **only** farm-transferred reserves). A FERME POS is never reclassifiable to BOUTIQUE; `stockTransferId` is rejected on non-BOUTIQUE POS.
- `POST /stock-transfers` **decrements the source at creation**: `ABATTU` → `carcassesAvailable` of a PROCESSED order; `PROVENDE` → `InputLot.quantity` (SAC/KG via `farm.defaultSacKg`, default 50); `OEUFS` → derived reservation only (nothing decremented; `EGGS_PER_ALVEOL = 30`, transfers store alvéoles).
- `TRANSFERRED → CANCELLED`; cancel re-integrates `quantity − quantitySold` to the source. Each BOUTIQUE sale decrements `quantitySold` under a pessimistic lock; cancelling it restores via `restoreStockTransfer`.

### Orders
- An `Order` wraps a `Sale`; creation does **not** decrement stock, `fulfil` does. State: `PENDING→CONFIRMED→LIVRE|CANCELLED`. Cancel passes `skipStockRestore:true`.
- **Never cancel an order's wrapped sale directly** — only via `orders/:id/cancel`, which is idempotent. Egg fulfil must exclude the order's own sale (`excludeSaleId`).
- **Lock ordering matters**: `sales.create` pre-locks *all* lots (sorted, deterministic) before POS items. Otherwise ABATTU→POULET inverts the graph relative to `slaughter.process` (lot→order) and deadlocks.

### Slaughter / sanitary
- `DRAFT→SENT→PROCESSED|CANCELLED` (terminal states immutable). `birdCount ≤ quantityAlive` checked at send **and** at process. Active RED `DELAI_ATTENTE`/`PROPHYLAXIE` blocks shipment. Carcass weight ≤ live weight.
- **All date comparisons in UTC.** REFORME/MORTALITE health events decrement `quantityAlive` immediately.
- Pre-loaded `vacc-*` programs are **species- and type-specific**; the server rejects mismatches (400). Never ship a POULET program onto a non-POULET lot.

### Advisory & alerts
- **Advisory only, never blocking** — including HACCP and sanitary. Emit a red alert + recommendation + trace; the farmer decides. Water is the #1 indicator (drop in water + rising mortality → combined `MALADIE` RED/YELLOW). One daily entry per batch per date (upsert on `(batch, entryDate)`).
- Alert lifecycle: `ACTIVE → RESOLU` when risk clears; manual `ACKNOWLEDGE` → `ACQUITTEE`, re-raised if the risk persists.
- **Readiness is computed on read** in `MetricsService.compute()` (`readyForSale`/`readyReason`) and cached onto `ProductionBatch.readyForSaleAt` by `batches.service.afterChange`. `BatchStatus.EN_VENTE` is only a manual escape hatch.

### SYSCOHADA accounting
- Integer FCFA; entries **always balance**; posted **in the same transaction** as the business mutation. Idempotent via unique `(farmId, source, sourceId)` (tolerate PG `23505`). No TVA.
- Order revenue is recognized **at delivery**, not creation (the order-wrapper sale is written with a direct `saleRepo.save`). Cancelling before delivery posts only `cancel-deposits:`.
- Feed stock (Classe 3) → `311` (asset) ↔ `603`, valued per lot by available vs received kg.
- Accounts auto-seed via `ensureAccounts`; `Account.code` is unique per farm (class-level composite index). The bilan balances by construction; codes `12`/`129`/`13` (RAN) are excluded from the capital base to avoid double-counting.
- Mobile write paths — `comptabilite.tsx`, `depenses.tsx`, `components/pos/CaisseTab.tsx` — are gated by `compta:rapports`/`compta:ecritures`/`compta:depense`. Non-manual cash movements (`SALE_PAYMENT`/`REFUND`/`EXPENSE`) are immutable.

## Web console (`web/`)

- Vite + React 18 + TS strict + Tailwind v4 + react-router v6 + TanStack Query v5. `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` on — unused vars are build failures, not warnings. **PLATFORM_ADMIN only** — any other role gets `MobileOnlyScreen` from `src/auth/guards.tsx`.
- `src/api/client.ts`: fetch wrapper, localStorage keys `koukou.token` / `koukou.user`, and `.download(path, filename)` for PDFs. A 401 triggers logout, so use `.download()` rather than raw `fetch` for file endpoints.
- Routes live in `src/App.tsx`: `/login`, then under `/app` → `dashboard|batches|alerts|finance|stock|sanitary|slaughter|team|settings` (the four finance pages are *flat* siblings: `finance/ventes|caisse|clients|promotions`, `finance` itself defaults to `ventes`), plus `/app/platform` behind `RequiresPlatformAdmin`.
- Every query key carries `farmId` as the 2nd element. After a sale, invalidate exactly `['sales'|'batches'|'dashboard'|'caisse-current'|'feed-stock'|'customers', farmId]` (`SalesPage.tsx:50`).
- Feed option label is `` `${supplierLotNumber} - ${productName}` `` (**not** `lotNumber`).
- Farm context lives in `src/app/FarmContext.tsx`; there is no `src/app/router`.

## Mobile (`mobile/`)

- **Expo SDK 54**, RN 0.81, React 19, expo-router ~6. Routes are in **`src/app/`** (not `app/`). StyleSheet + theme tokens from `src/constants/theme.ts` — **no NativeWind**. Read `mobile/AGENTS.md` (and `mobile/CLAUDE.md` → `@AGENTS.md`) before writing Expo code; the SDK pin exists because store Expo Go cannot run SDK 55+.
- `app.json` sets `experiments.reactCompiler: true` and `typedRoutes: true`, but there is **no `babel.config.js` or `metro.config.js`** — Metro runs on defaults, so don't assume the compiler is transforming anything.
- `react-native-worklets` is pinned to **exactly** `0.5.1` (Reanimated 4 requirement). Don't loosen to `~` or bump it independently.
- `expo-haptics`/`expo-sharing` must **not** be listed in `plugins` in `app.json` (no `app.plugin.js`; TS entry resolution crashes with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`).
- Import the API from **`@/api`** (facade over `live.ts`) — never `@/api/live` directly; no file does. The mock backend is gone: `isLive()` is hardcoded `return true` (`src/api/index.ts:64`).
- Tests are colocated `src/**/*.test.ts` (16 files, 305 tests), `environment: 'node'`, `@`→`src` alias in `vitest.config.mts`. No `.tsx` tests exist — pure logic only, no component rendering.
- Auth is enforced by `<Stack.Protected guard={signedIn}>` in `src/app/_layout.tsx`. Do not reintroduce a SessionGate or `router.replace` at mount.
- Keep render pure: `Math.random`/`Date.now` belong in module-scope helpers (see the explicit helper block in `src/app/(tabs)/lots.tsx`). This is a **convention, not a lint rule** — eslint only enables `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps`; `react-hooks/purity` is *not* active.
- Offline submit buttons must bind `disabled={... || busy}` to prevent double-enqueue.
- `CustomTabBar` has intentionally loose types — do **not** re-import `BottomTabBarProps`.

### Motion
- **Reanimated 4.x** (mobile) / **`motion` v13** (web). **No Moti, no GSAP** — never add a native animation dependency. Tokens: `src/constants/motion.ts` (mobile) and `src/lib/motion.ts` (web). Primitives: `src/components/ui/motion/{AnimatedNumber,TapScale}.tsx` and `web/src/components/AnimatedNumber.tsx`. Always honour reduced motion (`timed()`/`springed()` default to `System`). Repo skill **`motion-design`** is the best-practices source.
- Reanimated 4's `withSpring` config is a discriminated union — pass a concrete config, never spread a `Partial`.

### Offline sync (`mobile/src/offline/`)
- Custom FIFO engine, zero dependencies (`engine.ts`/`storage.ts`/`store.ts`). Network failure (`TypeError` or `ApiError ≥ 500`) → enqueue; 4xx propagates and drops. Sales send `idempotencyKey = op.id`.
- `flushQueue()` returns `{synced, dropped, remaining}` and is guarded by a **mutex** promise so concurrent callers share one pass (no double-POST). `runFlush()` **re-loops up to 20 rounds** (`engine.ts:515`) while new ops arrive — never snapshot the queue.
- **Cash ops (`sale`, `order-payment`, `customer-payment`) must never be dropped.** `ensureCashOpenOrRetry()` deliberately rethrows a plain `Error` (not `ApiError`) so a 4xx from the caisse step maps to *retry*, not *drop*.
- `OfflineAutoSync` (mounted in `_layout.tsx`) flushes on reconnect/pending-op, ref-guarded. Invalidate via `invalidateFarmQueries()`.

## Seeded data & tunable constants

8 species (`Species` enum) with seeded breeds + zootechnic curves, `standard_module` = 3000, densities 15/18, vaccination programs `GABON_VACC_PROTOCOLS`.

`ReferenceKey` (~34 keys, enum in `src/common/enums/reference-key.enum.ts`, seeded in `database-seed.service.ts`) holds **data, not code**: alert thresholds, calendar lead days, density/sac defaults, profitability margins. GET is `@Roles(PROPRIETAIRE, ELEVEUR)`, PATCH is `@Roles(PLATFORM_ADMIN)` and rejects values ≤ 0. Always confirm you are editing the seed and not a hardcoded literal.

## Domain reference

`docs/rag-knowledge/` is the poultry knowledge base (eau, alimentation, oeufs, poids, mortalite, sante, especes, donnees-ferme) — start at its `README.md`. **Read the relevant file before changing any threshold or advisory rule**; never quote a number without its context (which reference constant, which calculation window, batch vs building scope). Alerts are computed server-side by `AdvisoryEngine` (`modules/batches/advisory.engine.ts`); the corpus is reference material only. `docs/abattage-tracabilite-plan.md` is a design plan, not a spec.

## Not built

PostGIS · FinTech/Mobile Money (escrow) · KouKou Market marketplace (the backend `orders` module is delivered, but there is no public client channel).

## OpenCode (native subagents)

Config: `opencode.json` (root). Subagents run in child sessions and inherit parent context — keep prompts tight.

- **Flow**: prefer Plan for analysis, switch to Build only when ready to edit.
- **Available subagents here are `@explore` and `@general` only** (no `scout`, despite the stale `"scout": "allow"` entry in `opencode.json`). `@explore` is read-only and cheapest — use it for grep/glob/file discovery. `@general` has full tools including edits. For small or single-area tasks just work inline: `build` already has full tools, and spawning costs a fresh context.
- **Parallel fan-out**: only independent, file-isolated work. **Never run backend e2e in parallel** (single PostgreSQL + synchronize:true, fileParallelism:false, maxWorkers:1). Mobile/web unit tests can run in parallel if tasks don't share state. Two `@general` agents on one file will conflict — the permission system cannot prevent it.
- **Caps**: `agent.build.steps=25`, `agent.plan.steps=12`, `subagentDepth=1` (subagents cannot spawn subagents). Task permissions deny `*` by default (build allows explore/general, plan allows explore only). `steps` is the current field; `maxSteps` is deprecated. Hidden agents (title/summary/compaction) use `smallModel`.
- **Context hygiene**: spawn from a clean turn; don't fan out from a very long session.
- **CI is the proof-of-work gate.** Run the three commands above locally first — it catches failures in seconds instead of minutes.