#!/usr/bin/env node
/**
 * Accounting demo data for the FINANCED farms (those with a financing file
 * that has a released tranche): 12 to 24 months of coherent SYSCOHADA books so
 * that the financer's « États financiers » block (income statement, balance
 * sheet, cash, ratios, before / after the first release) is not empty.
 *
 * Usage (from backend/):
 *
 *   node --env-file=.env scripts/seed-accounting-demo.mjs [--dry-run]
 *
 * Same conventions as seed-financing-demo.mjs: DB_HOST, DB_PORT, DB_USERNAME,
 * DB_PASSWORD, DB_DATABASE (target database), PROGRAM_CODE (default POUFA).
 * Run it AFTER seed-poufa-demo and seed-financing-demo, and only on a demo
 * database.
 *
 * What it writes (INSERTs only, in one transaction):
 *   - accounting_accounts: the farm's chart, the very rows `ensureAccounts`
 *     writes (read from src/modules/accounting/account-plan.data.ts);
 *   - accounting_exercices: « Exercice YYYY » (1 January - 31 December, OPEN)
 *     for each year of the books, as `ensureExercice` does;
 *   - accounting_journal_entries / _lines: balanced, POSTED entries
 *     (source REGULARISATION, source_id `demo-fin:…`, reference `DEMO-AAAAMMJJ-n`:
 *     the prefix tells them from the app's `EC-` entries and is how the script
 *     recognises its own work).
 * It never touches a farm, a user or any other table (SELECTs of the farms and
 * the financing tables only). The server's own `initialize` is not called: the
 * rows above are its SQL equivalent (plan + exercice), without replaying
 * history (the farm has none).
 *
 * Safety: refuses to run when any `DEMO-` entry exists (not idempotent on
 * purpose) and SKIPS every farm that already has an accounting entry, so demo
 * entries never mix with a farm's real books; the skipped farms are printed.
 *
 * The books follow the farm's financing file: opening balance (capital,
 * buildings, equipment, treasury), the loan received at each release date, the
 * repayments exactly as recorded (interest then principal, oldest instalment
 * first, as the server allocates them), equipment bought with the tranches and
 * depreciated monthly, then monthly sales (a share on credit), feed, chicks,
 * veterinary, energy, staff and transport charges. Health follows the file:
 * up to date = comfortable cover and leverage, late = thin, over 90 days =
 * negative or near zero, with fewer days entered. Deterministic per farm.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const DRY = process.argv.includes('--dry-run');
const PROGRAM_CODE = process.env.PROGRAM_CODE ?? 'POUFA';
const DB = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'koukou_ferme',
};

// ---------------------------------------------------------------- helpers
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashOf = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Libreville day (UTC+1). */
const TODAY = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const ms = (iso) => Date.parse(`${iso}T00:00:00Z`);
const addDays = (iso, n) => new Date(ms(iso) + n * 86_400_000).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}
const monthIndex = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthKey = (idx) => `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
const daysInMonth = (idx) => new Date(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 0)).getUTCDate();
const dateOf = (idx, d) => `${monthKey(idx)}-${pad(d)}`;

// ---------------------------------------------------------------- profiles
// c = CAF / annual debt service, m = operating margin before depreciation and
// interest, L = debt / equity, active = share of days with something entered.
const PROFILES = {
  SAIN: { c: [1.5, 2.6], m: 0.32, L: [0.6, 1.4], active: [0.78, 0.92], credit: 0.08, lag: 1, uplift: [0.15, 0.3] },
  RETARD: { c: [0.85, 1.15], m: 0.18, L: [1.6, 2.1], active: [0.6, 0.72], credit: 0.15, lag: 2, uplift: [0.0, 0.06] },
  RETARD90: { c: [0.3, 0.6], m: 0.1, L: [2.4, 3.2], active: [0.38, 0.5], credit: 0.22, lag: 2, uplift: [-0.12, 0.0] },
};
const SEASON = [0.92, 0.9, 0.95, 1.0, 1.0, 0.98, 1.0, 1.02, 1.0, 1.04, 1.1, 1.19];
// Operating charges, as shares of the operating charges (they add up to 1).
const COSTS = [
  ['6011', 'Achats d’aliments', 0.5, 'supplier'],
  ['6010', 'Achat de poussins', 0.17, 'supplier'],
  ['6012', 'Produits vétérinaires', 0.05, 'supplier'],
  ['604', 'Transport', 0.03, 'event'],
  ['615', 'Entretien et réparations', 0.025, 'event'],
  ['6061', 'Électricité et combustible', 0.04, 'monthly-start'],
  ['6052', 'Eau', 0.015, 'monthly-start'],
  ['641', 'Salaires', 0.14, 'monthly-end'],
  ['645', 'Charges sociales', 0.03, 'monthly-end'],
];
const COST_TOTAL = COSTS.reduce((s, c) => s + c[2], 0);

// ---------------------------------------------------------------- plan
/** Pure: the entries of one farm's books. */
function planBooks({ farm, files, profileKey }) {
  const rnd = prng(hashOf(farm.id));
  const rin = (lo, hi) => lo + rnd() * (hi - lo);
  const P = PROFILES[profileKey];
  const entries = [];
  let counter = 0;
  const post = (date, label, lines) => {
    const clean = lines.filter((l) => (l[1] ?? 0) > 0 || (l[2] ?? 0) > 0).map((l) => [l[0], Math.round(l[1] ?? 0), Math.round(l[2] ?? 0)]);
    if (clean.length === 0) return;
    const debit = clean.reduce((s, l) => s + l[1], 0);
    const credit = clean.reduce((s, l) => s + l[2], 0);
    if (debit !== credit) throw new Error(`Écriture non équilibrée (${label}, ${date}) : ${debit} / ${credit}`);
    counter += 1;
    entries.push({ date, label: label.slice(0, 200), lines: clean, n: counter });
  };

  const tranches = files.flatMap((f) => f.tranches).sort((a, b) => a.releasedOn.localeCompare(b.releasedOn));
  const repayments = files.flatMap((f) => f.allocations).sort((a, b) => a.paidOn.localeCompare(b.paidOn));
  const firstRelease = tranches[0].releasedOn;
  // At least 12 months of books, and 6 months before the first release so that « avant / après » has a « avant ».
  const books = addMonths(TODAY, -12) < addMonths(firstRelease, -6) ? addMonths(TODAY, -12) : addMonths(firstRelease, -6);
  const debtTotal = tranches.reduce((s, t) => s + t.amount, 0);
  const annualService = files.reduce((s, f) => s + f.annualService, 0);
  const rateYear = files.reduce((s, f) => s + (f.ratePct ?? 10) * f.granted, 0) / Math.max(1, files.reduce((s, f) => s + f.granted, 0)) / 100;

  const cover = rin(...P.c);
  const leverage = rin(...P.L);
  const uplift = rin(...P.uplift);
  const interestYear = debtTotal * rateYear * 0.8;
  const ebitdaYear = cover * annualService + interestYear;
  const revenueYear = ebitdaYear / P.m;
  const capital = Math.round(debtTotal / leverage / 10_000) * 10_000;
  const pActive = rin(...P.active);

  // Opening balance: capital against buildings, equipment, petty cash and bank.
  const building = Math.round(capital * 0.45);
  const equipment = Math.round(capital * 0.17);
  const petty = 150_000;
  post(books, 'Bilan d’ouverture', [
    ['231', building, 0],
    ['241', equipment, 0],
    ['571', petty, 0],
    ['52', capital - building - equipment - petty, 0],
    ['101', 0, capital],
  ]);
  const assets = { '231': building, '241': equipment };
  const assetEvents = []; // [date, account, amount] bought during the books

  // Loan received at each release, equipment bought with a part of it.
  for (const t of tranches) {
    post(t.releasedOn, `Déblocage du prêt ${t.reference}, tranche ${t.number}`, [['52', t.amount, 0], ['164', 0, t.amount]]);
    if (!/^fonds de roulement/i.test(t.purpose)) {
      const spend = Math.round((t.amount * 0.7) / 1000) * 1000;
      const when = addDays(t.releasedOn, 6) <= TODAY ? addDays(t.releasedOn, 6) : t.releasedOn;
      const account = /b[âa]timent|poulailler|toiture|forage|extension|ch[âa]teau|chambre/i.test(t.purpose) ? '231' : '241';
      post(when, `Investissement financé : ${t.purpose}`.slice(0, 120), [[account, spend, 0], ['52', 0, spend]]);
      assetEvents.push([when, account, spend]);
    }
  }
  // Repayments as recorded: interest to 661, principal to 164.
  for (const r of repayments) {
    post(r.paidOn, `Remboursement du prêt ${r.reference}`, [['164', r.principal, 0], ['661', r.interest, 0], ['52', 0, r.principal + r.interest]]);
  }

  // Operations, month by month.
  const firstIdx = monthIndex(books);
  const lastIdx = monthIndex(TODAY);
  const credit = new Map(); // month -> credit sales
  const payable = new Map(); // month -> purchases on credit
  const rowsOfMonth = [];
  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    const from = idx === firstIdx ? Number(books.slice(8)) : 1;
    const to = idx === lastIdx ? Number(TODAY.slice(8)) : daysInMonth(idx);
    const span = to - from + 1;
    if (span <= 0) continue;
    const share = span / daysInMonth(idx);
    const monthDate = dateOf(idx, 1);
    const afterPivot = ms(monthDate) >= ms(firstRelease.slice(0, 7) + '-01');
    const ramp = afterPivot ? Math.min(1, (idx - monthIndex(firstRelease) + 1) / 3) : 0;
    const level = (1 + uplift * ramp) / (1 + uplift);
    const revenue = (revenueYear / 12) * SEASON[idx % 12] * (0.94 + rnd() * 0.12) * level * share;
    const opex = revenue * (1 - P.m);

    const days = [];
    for (let d = from; d <= to; d++) if (rnd() < pActive) days.push(d);
    while (days.length < 3 && span >= 3) {
      const d = from + Math.floor(rnd() * span);
      if (!days.includes(d)) days.push(d);
    }
    days.sort((a, b) => a - b);
    const lastDay = to;
    const pickDays = (n) => Array.from({ length: n }, () => days[Math.floor(rnd() * days.length)] ?? lastDay);

    // Sales: spread over the active days; a share on credit.
    const weights = days.map(() => 0.5 + rnd());
    const wSum = weights.reduce((s, w) => s + w, 0);
    let left = Math.round(revenue);
    days.forEach((d, i) => {
      const amount = i === days.length - 1 ? left : Math.round((revenue * weights[i]) / wSum);
      left -= amount;
      if (amount <= 0) return;
      const onCredit = Math.round(amount * P.credit);
      credit.set(idx, (credit.get(idx) ?? 0) + onCredit);
      post(dateOf(idx, d), 'Ventes de volailles', [['52', amount - onCredit, 0], ['411', onCredit, 0], ['7011', 0, amount]]);
    });
    // Collections of the credit sales, `lag` months later.
    const back = credit.get(idx - P.lag);
    if (back && Number(dateOf(idx, Math.min(20, to)).slice(8)) >= from) post(dateOf(idx, Math.min(20, to)), 'Encaissement de clients', [['52', back, 0], ['411', 0, back]]);

    // Charges.
    for (const [account, label, weight, kind] of COSTS) {
      const total = Math.round((opex * weight) / COST_TOTAL);
      if (total <= 0) continue;
      let when;
      if (kind === 'monthly-start') when = [Math.min(to, Math.max(from, 5))];
      else if (kind === 'monthly-end') when = [Math.max(from, Math.min(to, 28))];
      else when = pickDays(kind === 'supplier' ? (account === '6011' ? 4 : 2) : 2);
      const each = Math.round(total / when.length);
      when.forEach((d, i) => {
        const amount = i === when.length - 1 ? total - each * (when.length - 1) : each;
        if (amount <= 0) return;
        const onCredit = kind === 'supplier' ? Math.round(amount * 0.25) : 0;
        payable.set(idx, (payable.get(idx) ?? 0) + onCredit);
        post(dateOf(idx, d), label, [[account, amount, 0], ['52', 0, amount - onCredit], ['401', 0, onCredit]]);
      });
    }
    const owed = payable.get(idx - 1);
    if (owed && dateOf(idx, Math.min(15, to)) >= books) post(dateOf(idx, Math.min(15, to)), 'Règlement de fournisseurs', [['401', owed, 0], ['52', 0, owed]]);

    // Depreciation at the end of the month (buildings 5 % a year, equipment 12,5 %).
    const monthEnd = dateOf(idx, to);
    const cost = { ...assets };
    for (const [when, account, amount] of assetEvents) if (when <= monthEnd) cost[account] = (cost[account] ?? 0) + amount;
    const d231 = Math.round(((cost['231'] ?? 0) * 0.05) / 12 * share);
    const d241 = Math.round(((cost['241'] ?? 0) * 0.125) / 12 * share);
    post(monthEnd, 'Dotation aux amortissements', [['681', d231 + d241, 0], ['281', 0, d231], ['282', 0, d241]]);
    rowsOfMonth.push({ idx, to, floor: opex });
  }

  // Treasury: the owner tops the bank up when it would stay too low (healthy
  // farms) or deeply overdrawn (weak ones).
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
  let balance = 0;
  const topUps = [];
  let cursor = 0;
  for (const m of rowsOfMonth) {
    const end = dateOf(m.idx, m.to);
    while (cursor < entries.length && entries[cursor].date <= end) {
      for (const [code, d, c] of entries[cursor].lines) if (code === '52') balance += d - c;
      cursor += 1;
    }
    const floor = profileKey === 'SAIN' ? m.floor * 0.5 : -m.floor * 2;
    if (balance < floor) {
      const amount = Math.ceil((floor - balance) / 10_000) * 10_000;
      topUps.push([end, amount]);
      balance += amount;
    }
  }
  for (const [date, amount] of topUps) post(date, 'Apport de l’exploitant en trésorerie', [['52', amount, 0], ['104', 0, amount]]);
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);

  const activeDays = new Set(entries.map((e) => e.date)).size;
  const spanDays = (ms(TODAY) - ms(books)) / 86_400_000 + 1;
  return { entries, books, capital, debtTotal, annualService, cover, leverage, coveragePct: Math.round((activeDays / spanDays) * 1000) / 10 };
}

// ---------------------------------------------------------------- allocation
/** Interest then principal, oldest instalment first (the server's rule), per repayment. */
function allocate(file, instalments, repayments) {
  const left = instalments.map((i) => ({ interest: i.interest_fcfa, principal: i.principal_fcfa, dueDate: i.due_date }));
  const rows = [];
  for (const r of repayments) {
    let money = r.amount_fcfa;
    let principal = 0;
    let interest = 0;
    for (const i of left) {
      if (money <= 0) break;
      const pi = Math.min(money, i.interest);
      i.interest -= pi;
      money -= pi;
      interest += pi;
      const pp = Math.min(money, i.principal);
      i.principal -= pp;
      money -= pp;
      principal += pp;
    }
    // Anything above the schedule (never happens in the demo data) goes to principal.
    principal += money;
    rows.push({ paidOn: r.paid_on, principal, interest, reference: file.reference });
  }
  const unpaid = left.find((i) => i.dueDate <= TODAY && i.interest + i.principal > 0);
  const daysLate = unpaid ? Math.round((ms(TODAY) - ms(unpaid.dueDate)) / 86_400_000) : 0;
  return { rows, daysLate };
}

// ---------------------------------------------------------------- run
// Dates stay `YYYY-MM-DD` strings (no JS Date, no time-zone shift).
pg.types.setTypeParser(1082, (v) => v);
const client = new pg.Client(DB);
await client.connect();
const q = (sql, params = []) => client.query(sql, params);

const readPlan = () => {
  const text = readFileSync(resolve(process.cwd(), 'src/modules/accounting/account-plan.data.ts'), 'utf8');
  const out = [];
  for (const m of text.matchAll(/\{ code: '([^']+)', label: '([^']+)', classe: (\d), nature: '([A-Z]+)' \}/g)) {
    out.push({ code: m[1], label: m[2], classe: Number(m[3]), nature: m[4] });
  }
  if (out.length < 80) throw new Error('Plan comptable illisible : lancez le script depuis backend/.');
  return out;
};

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

try {
  const [program] = (await q(`SELECT id FROM programs WHERE code = $1`, [PROGRAM_CODE])).rows;
  if (!program) throw new Error(`Programme ${PROGRAM_CODE} introuvable dans ${DB.database}.`);
  const [{ n: demo }] = (await q(`SELECT COUNT(*)::int AS n FROM accounting_journal_entries WHERE reference LIKE 'DEMO-%'`)).rows;
  if (demo > 0) throw new Error(`Refus : ${demo} écriture(s) de démonstration (DEMO-) existent déjà. Ce script ne se relance pas.`);

  const financed = (
    await q(
      `SELECT DISTINCT f.id, f.code, f.name FROM farms f
         JOIN financing_files ff ON ff.farm_id = f.id
         JOIN financing_disbursements d ON d.file_id = ff.id AND d.status = 'DEBLOQUEE'
        WHERE f.program_id = $1 ORDER BY f.code NULLS LAST, f.name`,
      [program.id],
    )
  ).rows;
  if (financed.length === 0) throw new Error('Aucune ferme financée : lancez d’abord seed-financing-demo.');

  const skipped = [];
  const plans = [];
  for (const farm of financed) {
    const [{ n }] = (await q(`SELECT COUNT(*)::int AS n FROM accounting_journal_entries WHERE farm_id = $1`, [farm.id])).rows;
    if (n > 0) {
      skipped.push(`${farm.code ?? farm.id} ${farm.name} (${n} écriture(s))`);
      continue;
    }
    const files = [];
    for (const ff of (await q(`SELECT id, reference, purpose, granted_fcfa, rate_pct, duration_months, periodicity FROM financing_files WHERE farm_id = $1 ORDER BY reference`, [farm.id])).rows) {
      const tranches = (
        await q(`SELECT number, amount_fcfa, released_on FROM financing_disbursements WHERE file_id = $1 AND status = 'DEBLOQUEE' ORDER BY number`, [ff.id])
      ).rows.map((t) => ({ number: t.number, amount: t.amount_fcfa, releasedOn: iso(t.released_on), reference: ff.reference, purpose: ff.purpose }));
      if (tranches.length === 0) continue;
      const instalments = (await q(`SELECT number, due_date, principal_fcfa, interest_fcfa FROM financing_instalments WHERE file_id = $1 ORDER BY number`, [ff.id])).rows.map((i) => ({ ...i, due_date: iso(i.due_date) }));
      const repayments = (
        await q(`SELECT paid_on, amount_fcfa FROM financing_repayments WHERE file_id = $1 AND cancelled_at IS NULL ORDER BY paid_on, created_at`, [ff.id])
      ).rows.map((r) => ({ paid_on: iso(r.paid_on), amount_fcfa: r.amount_fcfa }));
      const { rows: allocations, daysLate } = allocate(ff, instalments, repayments);
      const step = ff.periodicity === 'TRIMESTRIELLE' ? 3 : ff.periodicity === 'SEMESTRIELLE' ? 6 : 1;
      const firstYear = instalments.slice(0, Math.max(1, Math.round(12 / step)));
      files.push({
        reference: ff.reference,
        purpose: ff.purpose,
        granted: ff.granted_fcfa ?? tranches.reduce((s, t) => s + t.amount, 0),
        ratePct: ff.rate_pct == null ? null : Number(ff.rate_pct),
        tranches,
        allocations: allocations.filter((a) => a.paidOn <= TODAY),
        daysLate,
        annualService: firstYear.reduce((s, i) => s + i.principal_fcfa + i.interest_fcfa, 0),
      });
    }
    if (files.length === 0) continue;
    const late = Math.max(...files.map((f) => f.daysLate));
    const profileKey = late > 90 ? 'RETARD90' : late > 0 ? 'RETARD' : 'SAIN';
    plans.push({ farm, profileKey, late, ...planBooks({ farm, files, profileKey }) });
  }

  const count = (key) => plans.filter((p) => p.profileKey === key).length;
  console.log(
    JSON.stringify(
      {
        programme: PROGRAM_CODE,
        base: DB.database,
        fermesFinancees: financed.length,
        fermesAvecComptabilite: plans.length,
        fermesIgnorees: skipped.length,
        parProfil: { SAIN: count('SAIN'), RETARD: count('RETARD'), RETARD90: count('RETARD90') },
        ecritures: plans.reduce((s, p) => s + p.entries.length, 0),
      },
      null,
      2,
    ),
  );
  if (skipped.length > 0) {
    console.log('\nFermes ignorées (elles ont déjà des écritures comptables) :');
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log('\nFerme                      profil    retard  écritures  jours saisis  début       capital      couverture  endettement');
  for (const p of plans.slice(0, DRY ? plans.length : 12)) {
    console.log(
      `${String(p.farm.code ?? '—').padEnd(26)} ${p.profileKey.padEnd(9)} ${String(p.late).padStart(5)}  ${String(p.entries.length).padStart(9)}  ${String(p.coveragePct).padStart(11)} %  ${p.books}  ${String(p.capital).padStart(11)}  ${p.cover.toFixed(2).padStart(9)}  ${p.leverage.toFixed(2).padStart(10)}`,
    );
  }
  if (DRY) {
    console.log('\n--dry-run : rien n’est écrit.');
  } else if (plans.length > 0) {
    const chart = readPlan();
    await q('BEGIN');
    let reference = 0;
    for (const p of plans) {
      const farmId = p.farm.id;
      // Plan comptable (as ensureAccounts: only the missing codes).
      await q(
        `INSERT INTO accounting_accounts (farm_id, code, label, classe, nature, is_custom)
         SELECT $1, c.code, c.label, c.classe, c.nature, false
           FROM unnest($2::text[], $3::text[], $4::int[], $5::text[]) AS c(code, label, classe, nature)
          WHERE NOT EXISTS (SELECT 1 FROM accounting_accounts a WHERE a.farm_id = $1 AND a.code = c.code)`,
        [farmId, chart.map((c) => c.code), chart.map((c) => c.label), chart.map((c) => c.classe), chart.map((c) => c.nature)],
      );
      // Exercices, one per year of the books (as ensureExercice).
      const exercices = new Map(
        (await q(`SELECT id, start_date, end_date FROM accounting_exercices WHERE farm_id = $1`, [farmId])).rows.map((e) => [`${iso(e.start_date)}`, e]),
      );
      const exerciceOf = async (date) => {
        const year = date.slice(0, 4);
        const found = [...exercices.values()].find((e) => iso(e.start_date) <= date && iso(e.end_date) >= date);
        if (found) return found.id;
        const [row] = (
          await q(
            `INSERT INTO accounting_exercices (farm_id, label, start_date, end_date, status) VALUES ($1, $2, $3, $4, 'OPEN') RETURNING id, start_date, end_date`,
            [farmId, `Exercice ${year}`, `${year}-01-01`, `${year}-12-31`],
          )
        ).rows;
        exercices.set(`${year}-01-01`, row);
        return row.id;
      };
      const ids = [];
      const years = new Map();
      for (const e of p.entries) {
        if (!years.has(e.date.slice(0, 4))) years.set(e.date.slice(0, 4), await exerciceOf(e.date));
        reference += 1;
        ids.push({ id: randomUUID(), exercice: years.get(e.date.slice(0, 4)), ref: `DEMO-${e.date.replace(/-/g, '')}-${String(reference).padStart(6, '0')}`, e });
      }
      for (let i = 0; i < ids.length; i += 1500) {
        const part = ids.slice(i, i + 1500);
        await q(
          `INSERT INTO accounting_journal_entries (id, farm_id, exercice_id, reference, entry_date, label, source, source_id, created_at)
           SELECT x.id, $1, x.exercice, x.ref, x.d, x.label, 'REGULARISATION', x.sid, x.d::timestamp + interval '10 hours'
             FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::date[], $6::text[], $7::text[]) AS x(id, exercice, ref, d, label, sid)`,
          [farmId, part.map((x) => x.id), part.map((x) => x.exercice), part.map((x) => x.ref), part.map((x) => x.e.date), part.map((x) => x.e.label), part.map((x) => `demo-fin:${p.farm.id.slice(0, 8)}:${x.e.n}`)],
        );
        const lines = part.flatMap((x) => x.e.lines.map((l) => ({ entry: x.id, code: l[0], d: l[1], c: l[2], date: x.e.date })));
        for (let j = 0; j < lines.length; j += 4000) {
          const chunk = lines.slice(j, j + 4000);
          await q(
            `INSERT INTO accounting_journal_entry_lines (entry_id, account_code, debit_fcfa, credit_fcfa, created_at)
             SELECT x.entry, x.code, x.d, x.c, x.date::timestamp + interval '10 hours'
               FROM unnest($1::uuid[], $2::text[], $3::int[], $4::int[], $5::date[]) AS x(entry, code, d, c, date)`,
            [chunk.map((l) => l.entry), chunk.map((l) => l.code), chunk.map((l) => l.d), chunk.map((l) => l.c), chunk.map((l) => l.date)],
          );
        }
      }
    }
    await q('COMMIT');
    console.log(`\nTerminé : ${plans.length} fermes, ${plans.reduce((s, p) => s + p.entries.length, 0)} écritures DEMO-.`);
  } else {
    console.log('\nRien à écrire.');
  }
} catch (err) {
  await q('ROLLBACK').catch(() => undefined);
  console.error('\nÉCHEC :', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
