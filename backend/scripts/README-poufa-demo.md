# POUFA demo database (`poufa_demo`)

`seed-poufa-demo.mjs` fills an **empty** POUFA database through the HTTP API of
a running backend, so every business rule applies (no SQL). It refuses to run
when the registry already holds farms: recreate the database instead.

## Content

- Registry: the 150 farms of `test/fixtures/fermes-poufa.csv` (dry run, then
  real import), 15 sheets enriched over 7 provinces (localité, cohort,
  exploitant, AMI ref, GPS, infrastructures, capacity, statuses: 13
  OPERATIONNELLE, 1 EN_PREPARATION, 1 SUSPENDUE with a reason), one GPS point
  outside its province (warning), one probable duplicate created with
  `confirmDuplicate` (151 farms in all). An **approximate demo outline** of G1
  (Estuaire) is uploaded so the GPS check has a boundary: not the official one.
- 8 exploitant accounts (one owns 2 farms through `linkExistingUser`).
- 6 bands on 5 farms: one closed (sold, auto-closure, snapshot), one J+21,
  daily entries (mortality, feed, water, weekly weighings), feed lots, sorties
  (sale, cull, gift), health events, vaccination calendars, tasks; alerts come
  from the advisory engine.
- Market: 3 verified farms, 6 listings (NOW/PRE, paused, draft), 2 buyers
  (PARTICULIER, RESTAURANT), requests in every state (delivered, deposit paid,
  accepted, waiting, rejected, withdrawn).
- Institutions: one membership per system profile, a custom PROVINCES profile
  on G1 (`AGENT_PROVINCIAL`), one suspended membership.

## Rebuild

From `backend/`, with `.env` holding the demo values (never `koukou_ferme`):

```
DB_DATABASE=poufa_demo
PROGRAM_CODE=POUFA
INSTITUTION_OTP=off            # institutions sign in with their code only
PLATFORM_ADMIN_EMAIL=admin@poufa-demo.local
PLATFORM_ADMIN_PHONE=+24177000001
PLATFORM_ADMIN_PASSWORD=<8-digit code>   # the admin's login code
JWT_SECRET=<fixed secret>      # or every restart logs everybody out
```

1. Create (or drop and recreate) the empty database `poufa_demo`.
2. `npm run build`, then boot it for the seed (migrations, then the boot seed
   creates the programme, lists, profiles and the platform admin):
   `PORT=3100 THROTTLE_DISABLED=true node dist/main.js`
   (`THROTTLE_DISABLED` only for the seed run: it signs in ~20 accounts.)
3. `node --env-file=.env scripts/seed-poufa-demo.mjs --out <path outside the repo>/credentials.md`
   (~350 calls, under a minute). It prints and writes every login code: keep
   that file out of the repository.
4. Stop the server.

## Use it

The web dev proxy and the mobile client target port 3000: boot the backend on
it, without `THROTTLE_DISABLED`:
`PORT=3000 node dist/main.js` (from `backend/`, same `.env`), then
`npm run dev -- --port 5400` in `web/`.

Dates are relative to the seed day: re-seed for a fresh demo (entries older
than yesterday are flagged « rattrapage », they were sent on that day).
