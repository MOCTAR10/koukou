#!/usr/bin/env node
/**
 * Financer-workspace demo data (BCEG): one consent template, consents for up
 * to 60 farms (a few withdrawn), about 40 financing files over the six steps
 * with coherent terms, tranches, constant-annuity schedules and repayments
 * (most healthy, six late under 90 days, two over 90 days, two repaid, one
 * refused, one restructured), checklist documents (small generated PDFs) with
 * a mix of VALIDE / DEPOSE / REJETE and farmer-, agent- and Fermia-filed ones.
 *
 * Usage (from backend/):
 *
 *   node --env-file=.env scripts/seed-financing-demo.mjs [--dry-run]
 *
 * Same conventions as seed-poufa-demo.mjs / the server: DB_HOST, DB_PORT,
 * DB_USERNAME, DB_PASSWORD, DB_DATABASE (target database), PROGRAM_CODE
 * (default POUFA), UPLOADS_DIR (default ./uploads, where the PDFs are written).
 *
 * It talks to the database directly (the API would stamp every row with
 * today's date) and ONLY INSERTS rows of the financing tables
 * (consent_templates, farm_consents, financing_*) and their files, plus the
 * reference counter: it never reads or writes a farm, user, accounting or
 * any other table beyond SELECTs of the farms and the programme. Not
 * idempotent on purpose: it refuses to run when the programme already has a
 * financing file or a consent template. The server must have booted once on
 * this database (the checklist is seeded by the migrations / at boot).
 * Deterministic: the same farms give the same data.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const DRY = process.argv.includes('--dry-run');
const PROGRAM_CODE = process.env.PROGRAM_CODE ?? 'POUFA';
const UPLOADS = resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));
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
const rnd = prng(20261119);
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = (list) => list[int(0, list.length - 1)];
const chance = (p) => rnd() < p;
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Libreville day (UTC+1). */
const TODAY = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const day = (iso) => Date.parse(`${iso}T00:00:00Z`);
const addDays = (iso, n) => new Date(day(iso) + n * 86_400_000).toISOString().slice(0, 10);
function addMonths(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
const at = (iso, hour = 9) => `${iso}T${String(hour).padStart(2, '0')}:00:00+01:00`;
const STEPS = ['DEMANDE', 'INSTRUCTION', 'DECISION', 'DECAISSEMENT', 'SUIVI', 'CLOTURE'];
const stepIndex = (s) => STEPS.indexOf(s);

/** Same constant-annuity rule as the server's generateSchedule (integer FCFA). */
function schedule({ granted, ratePct, durationMonths, graceMonths, step, firstDue }) {
  const periods = Math.max(1, Math.ceil(durationMonths / step));
  const graceCount = Math.min(Math.ceil(graceMonths / step), periods - 1);
  const amortising = periods - graceCount;
  const rate = (ratePct / 100) * (step / 12);
  const annuity = rate === 0 ? granted / amortising : (granted * rate) / (1 - Math.pow(1 + rate, -amortising));
  const rows = [];
  let balance = granted;
  for (let k = 0; k < periods; k++) {
    const interest = Math.round(balance * rate);
    let principal;
    if (k < graceCount) principal = 0;
    else if (k === periods - 1) principal = balance;
    else principal = Math.min(balance, Math.max(0, Math.round(annuity) - interest));
    rows.push({ number: k + 1, dueDate: addMonths(firstDue, k * step), principal, interest });
    balance -= principal;
  }
  return rows;
}

/** A tiny valid-looking PDF whose text is unique to the document. */
function pdfBytes(title) {
  const text = `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${title.replace(/[^\x20-\x7e]/g, '?')} ${randomUUID()}\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return Buffer.from(text, 'latin1');
}

// ---------------------------------------------------------------- catalogue
const PROJECTS = [
  ['Construction d’un bâtiment d’élevage de 2 000 places', 85, 150],
  ['Fonds de roulement : poussins et aliment pour trois bandes', 12, 35],
  ['Achat de matériel d’abreuvement et de mangeoires automatiques', 5, 15],
  ['Acquisition d’un groupe électrogène et d’une cuve à eau', 8, 20],
  ['Extension du poulailler et construction d’une chambre froide', 45, 90],
  ['Achat d’un broyeur-mélangeur de provende', 18, 40],
  ['Rénovation de la toiture et de la ventilation du bâtiment', 10, 25],
  ['Achat de reproducteurs et d’une couveuse', 25, 60],
  ['Forage et château d’eau pour l’exploitation', 20, 50],
  ['Véhicule frigorifique pour la livraison des poulets', 60, 110],
  ['Fonds de roulement : aliment et produits vétérinaires', 6, 18],
  ['Installation de panneaux solaires et de chauffage des poussins', 14, 38],
];
const KINDS = [
  ...Array(16).fill('SAIN'),
  ...Array(6).fill('RETARD'),
  ...Array(2).fill('RETARD90'),
  ...Array(2).fill('SOLDE'),
  'REFUSE',
  'RESTRUCTURE',
  ...Array(4).fill('DEMANDE'),
  ...Array(3).fill('INSTRUCTION'),
  'DECISION',
  'AJOURNE',
  ...Array(3).fill('DECAISSEMENT'),
];
const METHODS = ['VIREMENT', 'MOBILE_MONEY', 'ESPECES', 'VIREMENT', 'PRELEVEMENT'];
const GUARANTEES = [
  'Gage des stocks d’aliment et de poussins',
  'Cautionnement solidaire de l’exploitant et de son conjoint',
  'Gage du matériel financé',
  'Nantissement du compte de l’exploitation et gage des stocks',
];
const REJECT_REASONS = [
  'Pièce illisible : scannez de nouveau',
  'Document incomplet : la page de signature manque',
  'Pièce périmée ou non signée',
  'Le nom ne correspond pas à celui du promoteur',
];

// ---------------------------------------------------------------- plan
/** Terms and timeline of one file, by kind (pure, no database). */
function planFile(kind, farm, index) {
  const [purpose, loMax, hiMax] = pick(PROJECTS);
  const requested = int(loMax, hiMax) * 1_000_000;
  const f = {
    kind,
    farm,
    purpose,
    requested,
    granted: null,
    step: 'DEMANDE',
    decision: null,
    decisionDate: null,
    decisionNote: null,
    ratePct: null,
    durationMonths: null,
    graceMonths: null,
    periodicity: null,
    guarantees: null,
    guaranteeFund: null,
    guaranteePct: null,
    claimFlag: null,
    claimFlagNote: null,
    notes: null,
    created: TODAY,
    events: [],
    tranches: [],
    instalments: [],
    repayments: [],
  };
  const grantedTerms = () => {
    f.granted = Math.round((requested * (0.8 + rnd() * 0.2)) / 100_000) * 100_000;
    f.ratePct = pick([8.5, 9, 10, 10.5, 11, 12, 12.5, 14]);
    f.durationMonths = pick([12, 18, 24, 36]);
    f.graceMonths = pick([0, 0, 3]);
    f.periodicity = chance(0.75) ? 'MENSUELLE' : 'TRIMESTRIELLE';
    f.guarantees = pick(GUARANTEES);
    if (chance(0.4)) {
      f.guaranteeFund = 'Fonds de garantie agricole';
      f.guaranteePct = pick([40, 50, 60]);
    }
  };
  const proposedTerms = () => {
    f.ratePct = pick([10, 11, 12]);
    f.durationMonths = pick([18, 24, 36]);
    f.graceMonths = pick([0, 3]);
    f.periodicity = 'MENSUELLE';
  };
  const timeline = (created, steps) => {
    // steps: [[toStep, date, decision?, note?]...]
    f.created = created;
    f.events = [{ from: null, to: 'DEMANDE', date: created, decision: null, note: 'Ouverture du dossier' }];
    let from = 'DEMANDE';
    for (const [to, date, decision, note] of steps) {
      f.events.push({ from, to, date, decision: decision ?? null, note: note ?? null });
      from = to;
    }
    f.step = from;
  };

  if (kind === 'DEMANDE') {
    timeline(addDays(TODAY, -int(1, 25)), []);
    f.notes = chance(0.5) ? 'Demande déposée à l’agence, pièces en cours de collecte.' : null;
  } else if (kind === 'INSTRUCTION') {
    const c = addDays(TODAY, -int(20, 60));
    timeline(c, [['INSTRUCTION', addDays(c, int(5, 12))]]);
    proposedTerms();
  } else if (kind === 'DECISION' || kind === 'AJOURNE') {
    const c = addDays(TODAY, -int(35, 80));
    const i = addDays(c, int(8, 14));
    timeline(c, [
      ['INSTRUCTION', i],
      ['DECISION', addDays(i, int(10, 18))],
    ]);
    proposedTerms();
    if (kind === 'AJOURNE') {
      f.decision = 'AJOURNE';
      f.decisionDate = addDays(TODAY, -int(3, 12));
      f.decisionNote = 'Ajourné : attendre le rapport de visite complémentaire du comité.';
      f.events.push({ from: 'DECISION', to: 'DECISION', date: f.decisionDate, decision: 'AJOURNE', note: f.decisionNote });
    }
  } else if (kind === 'REFUSE') {
    const c = addDays(TODAY, -int(60, 160));
    const i = addDays(c, 10);
    const d = addDays(i, 16);
    timeline(c, [
      ['INSTRUCTION', i],
      ['DECISION', d],
      ['CLOTURE', addDays(d, 4), 'REFUSE', 'Capacité de remboursement insuffisante au vu des états de la ferme.'],
    ]);
    f.decision = 'REFUSE';
    f.decisionDate = addDays(d, 4);
    f.decisionNote = 'Capacité de remboursement insuffisante au vu des états de la ferme.';
    proposedTerms();
  } else if (kind === 'DECAISSEMENT') {
    grantedTerms();
    const decided = addDays(TODAY, -int(15, 50));
    const i = addDays(decided, -int(12, 20));
    const c = addDays(i, -int(6, 12));
    timeline(c, [
      ['INSTRUCTION', i],
      ['DECISION', addDays(decided, -int(2, 6))],
      ['DECAISSEMENT', decided, 'ACCORDE', 'Accordé par le comité de crédit.'],
    ]);
    f.decision = 'ACCORDE';
    f.decisionDate = decided;
    f.decisionNote = 'Accordé par le comité de crédit.';
    const first = Math.round((f.granted * 0.6) / 100_000) * 100_000;
    const released = addDays(TODAY, -int(2, 12));
    f.tranches = [
      { number: 1, planned: released, amount: first, status: 'DEBLOQUEE', released, condition: 'Signature du contrat et de l’acte de gage' },
      { number: 2, planned: addDays(TODAY, int(10, 40)), amount: f.granted - first, status: 'PREVUE', released: null, condition: 'Après la visite de contrôle de la première tranche' },
    ];
  } else {
    // Disbursed kinds: SAIN, RETARD, RETARD90, RESTRUCTURE, SOLDE.
    grantedTerms();
    const step = f.periodicity === 'MENSUELLE' ? 1 : 3;
    let firstDue;
    let paidUntil; // number of instalments fully paid
    let partial = 0; // extra partial payment on the next instalment
    let late = 0;
    if (kind === 'SOLDE') {
      f.durationMonths = 12;
      f.graceMonths = 0;
      f.periodicity = 'MENSUELLE';
      firstDue = addDays(addMonths(TODAY, -12), -int(2, 9));
      paidUntil = 12;
    } else if (kind === 'SAIN') {
      const periods = Math.ceil(f.durationMonths / step);
      const k = int(2, Math.max(2, Math.min(8, periods - 2)));
      firstDue = addDays(addMonths(TODAY, -(k - 1) * step), -int(0, 9));
      paidUntil = k;
    } else {
      late = kind === 'RETARD90' ? pick([104, 128, 141]) : kind === 'RESTRUCTURE' ? int(18, 40) : int(9, 82);
      const periods = Math.ceil(f.durationMonths / step);
      const u = Math.max(2, Math.min(int(3, 6), periods - 2));
      // Oldest unpaid instalment (number u) fell due `late` days ago.
      firstDue = addMonths(addDays(TODAY, -late), -(u - 1) * step);
      paidUntil = u - 1;
      if (chance(0.4)) partial = 0.4;
    }
    f.instalments = schedule({ granted: f.granted, ratePct: f.ratePct, durationMonths: f.durationMonths, graceMonths: f.graceMonths, step, firstDue });
    // Disbursement one period before the first instalment.
    const disb = addDays(addMonths(firstDue, -step), -int(0, 10));
    const decided = addDays(disb, -int(4, 14));
    const i = addDays(decided, -int(12, 20));
    const c = addDays(i, -int(6, 12));
    const closedOn = kind === 'SOLDE' ? addDays(f.instalments.at(-1).dueDate, int(1, 5)) : null;
    timeline(c, [
      ['INSTRUCTION', i],
      ['DECISION', addDays(decided, -int(2, 6))],
      ['DECAISSEMENT', decided, 'ACCORDE', 'Accordé par le comité de crédit.'],
      ['SUIVI', disb],
      ...(closedOn ? [['CLOTURE', closedOn, null, 'Crédit soldé : attestation de remboursement remise.']] : []),
    ]);
    f.decision = 'ACCORDE';
    f.decisionDate = decided;
    f.decisionNote = 'Accordé par le comité de crédit.';
    // One or two released tranches.
    if (chance(0.35)) {
      const first = Math.round((f.granted * pick([0.5, 0.6, 0.7])) / 100_000) * 100_000;
      const second = addDays(disb, int(14, 35));
      f.tranches = [
        { number: 1, planned: disb, amount: first, status: 'DEBLOQUEE', released: disb, condition: 'Signature du contrat et de l’acte de gage' },
        { number: 2, planned: second, amount: f.granted - first, status: 'DEBLOQUEE', released: second, condition: 'Visite de contrôle de la première tranche' },
      ];
    } else {
      f.tranches = [{ number: 1, planned: disb, amount: f.granted, status: 'DEBLOQUEE', released: disb, condition: 'Signature du contrat et de l’acte de gage' }];
    }
    // Repayments: each paid instalment on (or just after) its due date.
    f.instalments.forEach((it, idx) => {
      const due = it.principal + it.interest;
      if (idx < paidUntil) {
        f.repayments.push({
          paidOn: addDays(it.dueDate, int(0, 4)),
          amount: due,
          method: pick(METHODS),
          reference: `${pick(['VIR', 'MM', 'CAI'])}-${int(100000, 999999)}`,
        });
      } else if (idx === paidUntil && partial > 0 && it.dueDate <= TODAY) {
        f.repayments.push({
          paidOn: addDays(it.dueDate, int(5, 20)) > TODAY ? TODAY : addDays(it.dueDate, int(5, 20)),
          amount: Math.max(1, Math.round((due * partial) / 1000) * 1000),
          method: pick(METHODS),
          reference: `MM-${int(100000, 999999)}`,
          note: 'Paiement partiel',
        });
      }
    });
    f.repayments = f.repayments.filter((r) => r.paidOn <= TODAY);
    if (kind === 'RESTRUCTURE') {
      f.claimFlag = 'RESTRUCTURE';
      f.claimFlagNote = 'Rééchelonnement accordé après la perte d’une bande (maladie), accord du comité du mois dernier.';
    }
    if (kind === 'RETARD90') f.notes = 'Relances écrites envoyées ; visite de recouvrement planifiée.';
  }
  f.index = index;
  return f;
}

// ---------------------------------------------------------------- run
const client = new pg.Client(DB);
await client.connect();
const q = (sql, params = []) => client.query(sql, params);
const written = { files: 0, bytes: 0 };

function storeFile(dir, name, bytes) {
  if (DRY) return `dry-${name}`;
  mkdirSync(dir, { recursive: true });
  const stored = `${randomUUID()}.pdf`;
  writeFileSync(join(dir, stored), bytes);
  written.files += 1;
  written.bytes += bytes.length;
  return stored;
}

try {
  const [program] = (await q(`SELECT id FROM programs WHERE code = $1`, [PROGRAM_CODE])).rows;
  if (!program) throw new Error(`Programme ${PROGRAM_CODE} introuvable dans ${DB.database}.`);
  const programId = program.id;
  const [{ n: nFiles }] = (await q(`SELECT COUNT(*)::int AS n FROM financing_files WHERE program_id = $1`, [programId])).rows;
  const [{ n: nTemplates }] = (await q(`SELECT COUNT(*)::int AS n FROM consent_templates WHERE program_id = $1`, [programId])).rows;
  if (nFiles > 0 || nTemplates > 0) {
    throw new Error(`Refus : le programme ${PROGRAM_CODE} a déjà ${nFiles} dossier(s) et ${nTemplates} modèle(s) de consentement. Ce script ne se relance pas.`);
  }
  const requirements = (
    await q(
      `SELECT id, code, label, step, required, provided_by, validity_months FROM financing_requirements WHERE program_id = $1 AND active ORDER BY sort`,
      [programId],
    )
  ).rows;
  if (requirements.length === 0) {
    throw new Error('Aucune exigence dans la liste de pièces : démarrez l’application une fois sur cette base (migrations).');
  }
  const farms = (
    await q(`SELECT id, code, name, exploitant_name FROM farms WHERE program_id = $1 ORDER BY code NULLS LAST, name`, [programId])
  ).rows;
  if (farms.length === 0) throw new Error('Aucune ferme dans le programme : alimentez-le d’abord (seed-poufa-demo).');

  const order = shuffle(farms);
  const plans = shuffle(KINDS).map((kind, i) => planFile(kind, order[i % order.length], i));
  // Consents: every farm with a file first, then others up to 60.
  const consentFarms = [...new Set([...plans.map((p) => p.farm.id), ...order.map((f) => f.id)])].slice(0, 60);
  const withdrawn = new Set(consentFarms.slice(-5).concat(consentFarms.slice(3, 5)).slice(0, 5));

  const summary = {
    programme: PROGRAM_CODE,
    base: DB.database,
    fermesDuProgramme: farms.length,
    modeleDeConsentement: 1,
    consentements: consentFarms.length,
    consentementsRetires: withdrawn.size,
    dossiers: plans.length,
    parEtape: Object.fromEntries(STEPS.map((s) => [s, plans.filter((p) => p.step === s).length])),
    parType: Object.fromEntries([...new Set(KINDS)].map((k) => [k, plans.filter((p) => p.kind === k).length])),
    montantDemandeTotalFcfa: plans.reduce((s, p) => s + p.requested, 0),
    montantAccordeTotalFcfa: plans.reduce((s, p) => s + (p.granted ?? 0), 0),
  };
  if (DRY) {
    console.log('--dry-run : rien n’est écrit.');
    console.log(JSON.stringify(summary, null, 2));
    console.log('\nExemples de dossiers :');
    for (const p of plans.slice(0, 8)) {
      console.log(
        `  ${p.kind.padEnd(12)} ${p.farm.code ?? '—'} ${p.step.padEnd(12)} ${String(p.requested / 1e6).padStart(5)} M — ${p.purpose} (${p.instalments.length} échéances, ${p.repayments.length} remboursements)`,
      );
    }
  } else {
    await q('BEGIN');
    // 1. Consent template
    const templateName = 'modele-consentement-bceg.pdf';
    const templateBytes = pdfBytes('Modele de consentement BCEG');
    const templateStored = storeFile(join(UPLOADS, 'financing', 'templates'), templateName, templateBytes);
    const clauses = [
      'IDENTITE_RESPONSABLE', 'FINALITE', 'CATEGORIES_DONNEES', 'DESTINATAIRES', 'DUREE_CONSERVATION',
      'DROITS', 'RETRAIT', 'RECLAMATION_APDPVP', 'DISTINCT_DU_CONTRAT', 'TRANSFERT_HORS_GABON',
    ];
    const [template] = (
      await q(
        `INSERT INTO consent_templates (program_id, version, title, purpose, data_categories, retention, original_name,
                                         stored_name, mime, size_bytes, sha256, confirmed_clauses, active, created_at)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, 'application/pdf', $8, $9, $10, true, $11) RETURNING id, sha256`,
        [
          programId,
          'Consentement au partage des données avec la BCEG',
          'Instruction et suivi des demandes de financement agricole de la BCEG',
          JSON.stringify([
            'Identification de l’exploitation',
            'Production, effectifs et mortalité',
            'Ventes, dépenses et trésorerie',
            'États financiers (comptabilité SYSCOHADA)',
          ]),
          'Durée du financement, puis 5 ans',
          templateName,
          templateStored,
          templateBytes.length,
          createHash('sha256').update(templateBytes).digest('hex'),
          JSON.stringify(clauses),
          at(addDays(TODAY, -190)),
        ],
      )
    ).rows;

    // 2. Consents
    for (const [i, farmId] of consentFarms.entries()) {
      const farm = farms.find((f) => f.id === farmId);
      const paper = i % 4 === 3;
      const granted = addDays(TODAY, -int(5, 170));
      const gone = withdrawn.has(farmId);
      let proof = [null, null, null, null];
      if (paper) {
        const bytes = pdfBytes(`Consentement papier ${farm.code}`);
        proof = ['consentement-signe.pdf', storeFile(join(UPLOADS, 'financing', farmId), 'consentement-signe.pdf', bytes), 'application/pdf', createHash('sha256').update(bytes).digest('hex')];
      }
      await q(
        `INSERT INTO farm_consents (program_id, farm_id, status, template_id, template_version, template_sha256, method,
            signer_name, signer_quality, granted_at, ip, user_agent, proof_original_name, proof_stored_name, proof_mime,
            proof_sha256, withdrawn_at, withdrawn_by_side, withdraw_reason, created_at)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$9)`,
        [
          programId, farmId, gone ? 'WITHDRAWN' : 'ACTIVE', template.id, template.sha256, paper ? 'PAPIER' : 'EN_LIGNE',
          farm.exploitant_name ?? `Exploitant ${farm.code ?? ''}`.trim(), paper ? 'Propriétaire' : null, at(granted, 10),
          paper ? null : `41.158.${int(1, 250)}.${int(1, 250)}`, paper ? null : 'Mozilla/5.0 (Linux; Android 13) Fermia/1.0',
          proof[0], proof[1], proof[2], proof[3],
          gone ? at(addDays(granted, int(2, 4)), 15) : null, gone ? pick(['FARMER', 'BANK']) : null,
          gone ? pick(['Changement d’établissement bancaire', 'Je ne souhaite plus partager mes données']) : null,
        ],
      );
    }

    // 3. Files
    const year = Number(TODAY.slice(0, 4));
    let docCount = 0;
    for (const [n, f] of plans.entries()) {
      const reference = `BCEG-${year}-${String(n + 1).padStart(4, '0')}`;
      const [row] = (
        await q(
          `INSERT INTO financing_files (program_id, farm_id, reference, purpose, step, decision, decision_date, decision_note,
              requested_fcfa, granted_fcfa, rate_pct, duration_months, grace_months, periodicity, guarantees, guarantee_fund,
              guarantee_pct, claim_flag, claim_flag_note, notes, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
          [
            programId, f.farm.id, reference, f.purpose, f.step, f.decision, f.decisionDate, f.decisionNote, f.requested, f.granted,
            f.ratePct, f.durationMonths, f.graceMonths, f.periodicity, f.guarantees, f.guaranteeFund, f.guaranteePct,
            f.claimFlag, f.claimFlagNote, f.notes, at(f.created), at(f.events.at(-1).date, 16),
          ],
        )
      ).rows;
      f.id = row.id;
      f.reference = reference;
      for (const e of f.events) {
        await q(
          `INSERT INTO financing_step_events (file_id, from_step, to_step, decision, note, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
          [f.id, e.from, e.to, e.decision, e.note, at(e.date, 11)],
        );
      }
      for (const t of f.tranches) {
        await q(
          `INSERT INTO financing_disbursements (file_id, number, planned_date, amount_fcfa, condition, status, released_on, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
          [f.id, t.number, t.planned, t.amount, t.condition, t.status, t.released, at(f.created, 14)],
        );
      }
      for (const it of f.instalments) {
        await q(
          `INSERT INTO financing_instalments (file_id, number, due_date, principal_fcfa, interest_fcfa) VALUES ($1,$2,$3,$4,$5)`,
          [f.id, it.number, it.dueDate, it.principal, it.interest],
        );
      }
      for (const r of f.repayments) {
        await q(
          `INSERT INTO financing_repayments (file_id, paid_on, amount_fcfa, method, reference, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [f.id, r.paidOn, r.amount, r.method, r.reference ?? null, r.note ?? null, at(r.paidOn, 12)],
        );
      }

      // Documents: the required items of the steps passed are in; at the current step some are missing,
      // deposited, validated or rejected.
      const cur = stepIndex(f.step);
      const stepDate = (s) => f.events.find((e) => e.to === s)?.date ?? f.created;
      let missingLeft = f.kind === 'DEMANDE' ? 2 : f.kind === 'INSTRUCTION' ? 1 : 0;
      for (const rq of requirements) {
        if (rq.code === 'DEMANDE_CONSENTEMENT') continue; // satisfied by the consent itself
        const idx = stepIndex(rq.step);
        if (idx > cur) continue;
        const reached = idx < cur || f.step === 'CLOTURE';
        const current = idx === cur && f.step !== 'CLOTURE';
        if (f.kind === 'REFUSE' && idx > 2) continue;
        let status = null;
        if (rq.required) {
          if (reached) status = chance(0.88) ? 'VALIDE' : 'DEPOSE';
          else if (current) {
            if (missingLeft > 0 && chance(0.6)) { missingLeft -= 1; continue; }
            status = pick(['DEPOSE', 'DEPOSE', 'VALIDE', 'REJETE']);
          }
        } else if (chance(0.4)) status = reached ? 'VALIDE' : 'DEPOSE';
        if (!status) continue;
        const provider = rq.provided_by;
        let source = 'BCEG';
        if (provider === 'EXPLOITANT') source = chance(0.2) ? 'AGENT' : 'EXPLOITANT';
        if (rq.code === 'INSTRUCTION_ETATS_FINANCIERS' && chance(0.35)) source = 'FERMIA';
        const uploaded = addDays(stepDate(rq.step), int(0, 3));
        const rejectedFirst = status === 'VALIDE' && chance(0.08);
        const versions = rejectedFirst ? ['REJETE', 'VALIDE'] : [status];
        for (const [v, st] of versions.entries()) {
          const upDate = addDays(uploaded, v * 4);
          const stale = rq.validity_months && f.kind === 'SAIN' && f.index % 7 === 0 && st === 'VALIDE';
          const issued = rq.validity_months ? addDays(upDate, stale ? -440 : -int(5, 150)) : null;
          const bytes = pdfBytes(`${rq.label} ${f.reference}`);
          const name = `${rq.code.toLowerCase()}.pdf`;
          const stored = storeFile(join(UPLOADS, 'financing', f.farm.id), name, bytes);
          await q(
            `INSERT INTO financing_documents (file_id, requirement_id, label, original_name, stored_name, mime, size_bytes, sha256,
                status, reject_reason, source, issued_on, expires_on, uploaded_at, reviewed_at)
             VALUES ($1,$2,$3,$4,$5,'application/pdf',$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              f.id, rq.id, rq.label, name, stored, bytes.length, createHash('sha256').update(bytes).digest('hex'), st,
              st === 'REJETE' ? pick(REJECT_REASONS) : null, source, issued,
              issued && rq.validity_months ? addMonths(issued, rq.validity_months) : null,
              at(upDate, 10), st === 'DEPOSE' ? null : at(addDays(upDate, int(1, 3)), 15),
            ],
          );
          docCount += 1;
        }
      }
    }
    // The reference counter continues after the demo files.
    await q(
      `INSERT INTO id_counters (scope, next) VALUES ($1, $2)
       ON CONFLICT (scope) DO UPDATE SET next = GREATEST(id_counters.next, EXCLUDED.next)`,
      [`FINANCEMENT:${programId}:${year}`, plans.length],
    );
    await q('COMMIT');
    summary.documents = docCount;
    summary.fichiersEcrits = written.files;
    console.log(JSON.stringify(summary, null, 2));
    console.log(`\nTerminé : ${plans.length} dossiers, ${consentFarms.length} consentements, ${docCount} pièces, ${written.files} fichiers sous ${UPLOADS}.`);
  }
  if (DRY) console.log('\n(dry-run) fichiers qui seraient écrits sous', UPLOADS);
} catch (err) {
  await q('ROLLBACK').catch(() => undefined);
  console.error('\nÉCHEC :', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
