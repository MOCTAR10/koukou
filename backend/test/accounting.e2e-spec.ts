import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * M11 — Comptabilité SYSCOHADA : écritures auto (ventes, paiements, caisse,
 * dépenses, annulation), backfill idempotent (init), rapports (journal, grand
 * livre, balance, compte de résultat, bilan), régularisations, gates
 * compta:rapports / compta:ecritures.
 */
describe('M11 — Comptabilité SYSCOHADA (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let adminEmploymentId: string;
  let adminToken: string;
  let farmId: string;
  let authzFarmId: string;
  let batchId: string;
  let sale2Id: string;

  async function login(phone: string, code: string) {
    const res = await request(server)
      .post('/auth/login')
      .send({ phone, code })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function createFarm(name: string) {
    const res = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function journalEntries() {
    const res = await request(server)
      .get(`/farms/${farmId}/accounting/journal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.entries as any[];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const stamp = Date.now();
    const phone = (n: number) => `+24171${stamp}${n}`;
    await request(server)
      .post('/auth/register')
      .send({ phone: phone(1), fullName: 'Proprio Compta', code: 'secret123' })
      .expect(201);
    token = await login(phone(1), 'secret123');

    await request(server)
      .post('/auth/register')
      .send({ phone: phone(2), fullName: 'Autre Proprio', code: 'secret123' })
      .expect(201);
    otherToken = await login(phone(2), 'secret123');

    farmId = await createFarm(`Ferme Compta ${stamp}`);
    authzFarmId = await createFarm(`Ferme Compta Authz ${stamp}`);

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot Compta',
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CL-${stamp}`,
        hatchDate: today(),
        chickUnitPriceFcfa: 1000,
      })
      .expect(201);
    batchId = batch.body.id;

    // ADMIN par défaut : pas de droits comptables.
    const admin = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: phone(3),
        fullName: 'Admin Compta',
        code: 'secret456',
        role: 'ADMIN',
        jobTitle: 'Comptable',
      })
      .expect(201);
    adminEmploymentId = admin.body.employment.id;
    adminToken = await login(phone(3), 'secret456');
  }, 180000);

  afterAll(async () => {
    await app.close();
  });

  it('ouverture de caisse (100000) → écriture auto équilibrée 571/108', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);

    const entries = await journalEntries();
    const open = entries.find((e) => e.sourceId.startsWith('open:'));
    expect(open).toBeDefined();
    expect(open.source).toBe('CAISSE');
    expect(open.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '571', debitFcfa: 100000 }),
        expect.objectContaining({ accountCode: '108', creditFcfa: 100000 }),
      ]),
    );
  });

  it('vente payée (2 × 5000 espèces) → 411/701 + 571/411', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 2,
            unit: 'PIECE',
            unitPriceFcfa: 5000,
            batchId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 10000 }],
      })
      .expect(201);

    const entries = await journalEntries();
    const sale = entries.find((e) => e.sourceId === `sale:${res.body.sale.id}`);
    expect(sale.source).toBe('SALE');
    expect(sale.lines).toEqual([
      expect.objectContaining({ accountCode: '411', debitFcfa: 10000 }),
      expect.objectContaining({ accountCode: '7011', creditFcfa: 10000 }),
    ]);
    const payment = entries.find((e) => e.sourceId === `payment:${res.body.payments[0].id}`);
    expect(payment.lines).toEqual([
      expect.objectContaining({ accountCode: '571', debitFcfa: 10000 }),
      expect.objectContaining({ accountCode: '411', creditFcfa: 10000 }),
    ]);
  });

  it('vente partielle (2 × 5000, 5000 payés) → créance 411 résiduelle', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 2,
            unit: 'PIECE',
            unitPriceFcfa: 5000,
            batchId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 5000 }],
      })
      .expect(201);
    sale2Id = res.body.sale.id;

    const entries = await journalEntries();
    const sale = entries.find((e) => e.sourceId === `sale:${sale2Id}`);
    expect(sale.lines).toEqual([
      expect.objectContaining({ accountCode: '411', debitFcfa: 10000 }),
      expect.objectContaining({ accountCode: '7011', creditFcfa: 10000 }),
    ]);
  });

  it('dépense ALIMENTS 8000 payée en caisse → 6011/571', async () => {
    await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'ALIMENTS',
        amountFcfa: 8000,
        label: 'Provende démarrée',
        paidByCaisse: true,
      })
      .expect(201);

    const entries = await journalEntries();
    const expense = entries.find((e) => e.source === 'EXPENSE');
    expect(expense.lines).toEqual([
      expect.objectContaining({ accountCode: '6011', debitFcfa: 8000 }),
      expect.objectContaining({ accountCode: '571', creditFcfa: 8000 }),
    ]);
  });

  it('mouvement manuel OUT 3000 → 108/571', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/movements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'OUT', amountFcfa: 3000, reason: 'Retrait exploitant' })
      .expect(201);

    const entries = await journalEntries();
    const movement = entries.find((e) => e.sourceId.startsWith('movement:'));
    expect(movement.source).toBe('CAISSE');
    expect(movement.lines).toEqual([
      expect.objectContaining({ accountCode: '108', debitFcfa: 3000 }),
      expect.objectContaining({ accountCode: '571', creditFcfa: 3000 }),
    ]);
  });

  it('annulation de la vente partielle → contrepassation 701 / 411 + 571 (solde équilibré)', async () => {
    const before = await journalEntries();
    await request(server)
      .delete(`/farms/${farmId}/sales/${sale2Id}`)
      .set('Authorization', `Bearer ${token}`)
      .query({ reason: 'Client insatisfait' })
      .expect(200);

    const entries = await journalEntries();
    const cancel = entries.find((e) => e.sourceId === `cancel:${sale2Id}`);
    expect(cancel.message).toBeUndefined();
    expect(cancel.lines).toEqual([
      expect.objectContaining({ accountCode: '7011', debitFcfa: 10000 }),
      expect.objectContaining({ accountCode: '411', creditFcfa: 5000 }),
      expect.objectContaining({ accountCode: '571', creditFcfa: 5000 }),
    ]);
    // Aucune écriture REFUND séparée : le remboursement est porté par la
    // contrepassation (le backfill init ne repasse pas non plus les REFUND
    // d'une vente annulée).
    const refund = entries.find((e) => e.source === 'REFUND');
    expect(refund).toBeUndefined();
    expect(entries.length).toBe(before.length + 1);
  });

  it('grand livre 571 = solde de caisse attendu (99000)', async () => {
    const gl = await request(server)
      .get(`/farms/${farmId}/accounting/grand-livre`)
      .set('Authorization', `Bearer ${token}`)
      .query({ accountCode: '571' })
      .expect(200);
    const [compte571] = gl.body as any[];
    expect(compte571.account).toBe('571');
    expect(compte571.soldeFcfa).toBe(99000);

    const caisse = await request(server)
      .get(`/farms/${farmId}/caisse/current`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(caisse.body.expectedBalanceFcfa).toBe(99000);
    expect(compte571.soldeFcfa).toBe(caisse.body.expectedBalanceFcfa);
  });

  it('balance d’essai : débits = crédits, soldes cohérents', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/accounting/balance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.totals.totalDebit).toBe(res.body.totals.totalCredit);

    const byCode = Object.fromEntries(
      (res.body.byClasse as any[]).flatMap((g: any) => g.accounts).map((a: any) => [a.code, a]),
    );
    expect(byCode['571'].soldeFcfa).toBe(99000);
    expect(byCode['108'].soldeFcfa).toBe(-97000);
    expect(byCode['7011'].soldeFcfa).toBe(-10000);
    expect(byCode['6011'].soldeFcfa).toBe(8000);
    expect(byCode['411'].soldeFcfa).toBe(0);
  });

  it('compte de résultat : produits 10000, charges 8000, résultat 2000', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/accounting/compte-resultat`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalProduits).toBe(10000);
    expect(res.body.totalCharges).toBe(8000);
    expect(res.body.resultatFcfa).toBe(2000);
    expect(res.body.resultatNegatif).toBe(false);
  });

  it('bilan : actif = capitaux + résultat (écart 0)', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/accounting/bilan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalActif).toBe(99000);
    expect(res.body.capitauxApportsFcfa).toBe(97000);
    expect(res.body.resultatFcfa).toBe(2000);
    expect(res.body.totalCapitaux).toBe(99000);
    expect(res.body.totalPassifExterne).toBe(0);
    expect(res.body.ecartFcfa).toBe(0);
  });

  it('init : idempotent — repasse l’historique sans créer de doublons', async () => {
    const before = await journalEntries();
    await request(server)
      .post(`/farms/${farmId}/accounting/init`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/accounting/init`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const after = await journalEntries();
    expect(after.length).toBe(before.length);
    for (const a of after) {
      expect(a.lines.reduce((s: number, l: any) => s + (l.debitFcfa ?? 0) - (l.creditFcfa ?? 0), 0)).toBe(0);
    }
  });

  it('clôture de caisse sans écart → aucune écriture de variance, init toujours stable', async () => {
    const before = await journalEntries();
    await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ declaredBalanceFcfa: 99000 })
      .expect(201);
    const after = await journalEntries();
    expect(after.filter((e) => e.sourceId.startsWith('close:')).length).toBe(0);
    expect(after.length).toBe(before.length);

    await request(server)
      .post(`/farms/${farmId}/accounting/init`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect((await journalEntries()).length).toBe(after.length);
  });

  it('régularisation manuelle équilibrée (6011/471)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/accounting/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: today(),
        label: 'Ajustement provende non étiquetée',
        lines: [
          { account: '6011', debitFcfa: 1000, label: 'Provende sans étiquette' },
          { account: '471', creditFcfa: 1000, label: 'Comptes d’attente' },
        ],
      })
      .expect(201);
    expect(res.body.reference).toMatch(/^EC-\d{8}-\d{6}$/);
    expect(res.body.source).toBe('REGULARISATION');
    expect(res.body.lines.length).toBe(2);

    const entries = await journalEntries();
    const regul = entries.find((e) => e.id === res.body.id);
    expect(regul.source).toBe('REGULARISATION');
    expect(regul.reference).toBe(res.body.reference);

    const balance = await request(server)
      .get(`/farms/${farmId}/accounting/balance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(balance.body.totals.totalDebit).toBe(balance.body.totals.totalCredit);
  });

  it('refuse une régularisation déséquilibrée (400)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/accounting/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: today(),
        label: 'Déséquilibrée',
        lines: [
          { account: '6011', debitFcfa: 1000 },
          { account: '401', creditFcfa: 500 },
        ],
      })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('équilibrée');
  });

  it('admin par défaut → 403 ; après grant compta → accès + écritures', async () => {
    await request(server)
      .get(`/farms/${farmId}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(server)
      .post(`/farms/${farmId}/accounting/init`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(server)
      .post(`/farms/${farmId}/accounting/entries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        date: today(),
        label: 'Sans droit',
        lines: [{ account: '6011', debitFcfa: 100 }, { account: '471', creditFcfa: 100 }],
      })
      .expect(403);

    await request(server)
      .patch(`/farms/${farmId}/eleveurs/${adminEmploymentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        permissions: [
          'saisie:creer',
          'caisse:lire',
          'sanitaire:lecture',
          'compta:rapports',
          'compta:ecritures',
        ],
      })
      .expect(200);

    await request(server)
      .get(`/farms/${farmId}/accounting/journal`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(server)
      .post(`/farms/${farmId}/accounting/init`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('ferme étrangère → 403', async () => {
    await request(server)
      .get(`/farms/${farmId}/accounting/bilan`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await request(server)
      .post(`/farms/${authzFarmId}/accounting/init`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    await request(server)
      .post(`/farms/${authzFarmId}/accounting/init`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  it('exports CSV (journal) et PDF (bilan)', async () => {
    const csv = await request(server)
      .get(`/farms/${farmId}/accounting/export`)
      .set('Authorization', `Bearer ${token}`)
      .query({ report: 'journal', format: 'csv' })
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Compte');

    const pdf = await request(server)
      .get(`/farms/${farmId}/accounting/export`)
      .set('Authorization', `Bearer ${token}`)
      .query({ report: 'bilan', format: 'pdf' })
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.body.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  // ---------- Classe 3 (stock provende) + clôture / RAN ----------

  it('Classe 3 : réception ALIMENT (totalCost) → charge 6011/401 + stock valorisé', async () => {
    const stockFarmId = await createFarm(`Ferme Stock ${Date.now()}`);
    await request(server)
      .post(`/farms/${stockFarmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        productName: 'Mais grain',
        supplier: 'CEAG',
        supplierLotNumber: `CEAG-${Date.now()}`,
        entryType: 'MATIERE_PREMIERE',
        tonnageMt: 2,
        totalCostFcfa: 1000000,
        receivedDate: today(),
      })
      .expect(201);

    const journal = await request(server)
      .get(`/farms/${stockFarmId}/accounting/journal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const inputEntry = (journal.body.entries as any[]).find(
      (e) => e.source === 'INPUT',
    );
    expect(inputEntry.lines).toEqual([
      expect.objectContaining({ accountCode: '6011', debitFcfa: 1000000 }),
      expect.objectContaining({ accountCode: '401', creditFcfa: 1000000 }),
    ]);

    const stock = await request(server)
      .get(`/farms/${stockFarmId}/accounting/stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stock.body.totalValueFcfa).toBe(1000000);
    expect(stock.body.lots).toHaveLength(1);
    expect(stock.body.lots[0]).toMatchObject({
      productName: 'Mais grain',
      receivedKg: 2000,
      availableKg: 2000,
      valueFcfa: 1000000,
    });
  });

  it('clôture : exercice passé, résultat perdu reporté à nouveau (12/129), idempotent', async () => {
    const exLabel = `Régularisation annuelle ${Date.now()}`;
    const reg = await request(server)
      .post(`/farms/${farmId}/accounting/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2025-06-15',
        label: exLabel,
        lines: [
          { account: '6011', debitFcfa: 2000, label: 'Fournitures 2025' },
          { account: '471', creditFcfa: 2000, label: 'Comptes d’attente' },
        ],
      })
      .expect(201);
    expect(reg.body.reference).toMatch(/^EC-\d{8}-\d{6}$/);

    const exercices = await request(server)
      .get(`/farms/${farmId}/accounting/exercices`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ex2025 = (exercices.body as any[]).find(
      (e) => e.startDate === '2025-01-01',
    );
    expect(ex2025).toBeDefined();
    expect(ex2025.status).toBe('OPEN');

    const close = await request(server)
      .post(`/farms/${farmId}/accounting/exercices/${ex2025.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(close.body.resultatFcfa).toBe(-2000);
    expect(close.body.resultatNegatif).toBe(true);
    expect(close.body.stockFcfa).toBe(0);
    expect(close.body.posted).toEqual(['resultat']);
    expect(close.body.exercice.status).toBe('CLOSED');
    expect(close.body.next.startDate).toBe('2026-01-01');
    expect(close.body.next.status).toBe('OPEN');

    const entries = await journalEntries();
    const ran = entries.find(
      (e) => e.source === 'CLOTURE' && e.sourceId === `ran:${ex2025.id}`,
    );
    expect(ran.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '12', debitFcfa: 2000 }),
        expect.objectContaining({ accountCode: '129', creditFcfa: 2000 }),
      ]),
    );

    await request(server)
      .post(`/farms/${farmId}/accounting/exercices/${ex2025.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    const bilan2025 = await request(server)
      .get(`/farms/${farmId}/accounting/bilan`)
      .set('Authorization', `Bearer ${token}`)
      .query({ from: '2025-01-01', to: '2025-12-31' })
      .expect(200);
    expect(bilan2025.body.resultatFcfa).toBe(-2000);
    expect(bilan2025.body.totalActif).toBe(0);
    expect(bilan2025.body.totalPassifExterne).toBe(2000);
    expect(bilan2025.body.ecartFcfa).toBe(0);

    // Toutes périodes : le RAN ne doit pas être double-compté avec le résultat.
    const bilanGlobal = await request(server)
      .get(`/farms/${farmId}/accounting/bilan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bilanGlobal.body.ecartFcfa).toBe(0);
  });

  it('clôture : refuse un exercice en cours (endDate dans le futur)', async () => {
    const exercices = await request(server)
      .get(`/farms/${farmId}/accounting/exercices`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const current = (exercices.body as any[]).find(
      (e) => e.status === 'OPEN' && e.endDate >= today(),
    );
    await request(server)
      .post(`/farms/${farmId}/accounting/exercices/${current.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('clôture avec stock : 311/603 en clôture, 603/311 en reprise, résultat neutre', async () => {
    const closeFarmId = await createFarm(`Ferme Clôture ${Date.now()}`);
    await request(server)
      .post(`/farms/${closeFarmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        productName: 'Mais grain',
        supplier: 'CEAG',
        supplierLotNumber: `CEAG-${Date.now()}`,
        entryType: 'MATIERE_PREMIERE',
        tonnageMt: 1,
        totalCostFcfa: 500000,
        receivedDate: '2025-12-15',
      })
      .expect(201);

    const exercices = await request(server)
      .get(`/farms/${closeFarmId}/accounting/exercices`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ex2025 = (exercices.body as any[]).find(
      (e) => e.startDate === '2025-01-01',
    );
    expect(ex2025).toBeDefined();

    const close = await request(server)
      .post(`/farms/${closeFarmId}/accounting/exercices/${ex2025.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(close.body.resultatFcfa).toBe(0);
    expect(close.body.stockFcfa).toBe(500000);
    expect(close.body.posted).toEqual(['stock', 'reprise']);
    expect(close.body.exercice.status).toBe('CLOSED');

    const journal = await request(server)
      .get(`/farms/${closeFarmId}/accounting/journal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const stockFinal = (journal.body.entries as any[]).find(
      (e) => e.sourceId === `close:${ex2025.id}`,
    );
    expect(stockFinal.lines).toEqual([
      expect.objectContaining({ accountCode: '311', debitFcfa: 500000 }),
      expect.objectContaining({ accountCode: '603', creditFcfa: 500000 }),
    ]);
    const reprise = (journal.body.entries as any[]).find(
      (e) => e.sourceId === `open:${ex2025.id}`,
    );
    expect(reprise.entryDate).toBe('2026-01-01');
    expect(reprise.lines).toEqual([
      expect.objectContaining({ accountCode: '603', debitFcfa: 500000 }),
      expect.objectContaining({ accountCode: '311', creditFcfa: 500000 }),
    ]);

    const bilan2025 = await request(server)
      .get(`/farms/${closeFarmId}/accounting/bilan`)
      .set('Authorization', `Bearer ${token}`)
      .query({ from: '2025-01-01', to: '2025-12-31' })
      .expect(200);
    expect(bilan2025.body.totalActif).toBe(500000);
    expect(bilan2025.body.totalPassifExterne).toBe(500000);
    expect(bilan2025.body.ecartFcfa).toBe(0);

    const stock = await request(server)
      .get(`/farms/${closeFarmId}/accounting/stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(stock.body.totalValueFcfa).toBe(500000);
  });
});