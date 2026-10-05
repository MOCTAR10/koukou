import { Injectable, Logger } from '@nestjs/common';
import type { OrderPassportSnapshot } from '../../modules/orders/entities/order.entity.js';

export interface ReceiptItemData {
  label: string;
  quantity: string;
  unitPriceFcfa: number;
  amountFcfa: number;
}

export interface ReceiptData {
  referenceNumber: string;
  saleDate: string;
  farmName: string;
  customerName: string | null;
  items: ReceiptItemData[];
  totalAmountFcfa: number;
  discountAmountFcfa: number;
  paidAmountFcfa: number;
  remainingFcfa: number;
  method: string;
}

export interface PnlReportData {
  farmName: string;
  title: string;
  period: string;
  rows: { label: string; value: string }[];
  totals: { label: string; value: string }[];
  grossMarginPct: number | null;
}

export interface BordereauData {
  farmName: string;
  referenceNumber: string;
  batchLabel: string;
  slaughterTypeLabel: string;
  destinationLabel: string;
  destination: 'INTERNE' | 'EXTERNE';
  plannedDate: string;
  birdCount: number;
  totalWeightKg: number | null;
  carcassWeightKg: number | null;
  rendementPercent: number | null;
  internalBatchCode: string | null;
  abattoirLotCode: string | null;
  createdAtLabel: string;
}

export interface BonCommandeData {
  farmName: string;
  referenceNumber: string;
  canalLabel: string;
  expectedDate: string | null;
  customerName: string | null;
  address: string | null;
  batchLabel: string | null;
  items: ReceiptItemData[];
  totalAmountFcfa: number;
  depositFcfa: number;
  remainingFcfa: number;
  method: string;
  /** Passeport de traçabilité du lot (figé au bon de commande). */
  passport?: OrderPassportSnapshot | null;
}

export interface AccountingPdfSection {
  title: string;
  columns: string[];
  rows: string[][];
  totals?: { label: string; value: string }[];
}

export interface AccountingReportData {
  farmName: string;
  title: string;
  period: string;
  generatedAtLabel: string;
  sections: AccountingPdfSection[];
  totals: { label: string; value: string }[];
}

export interface PasseportData {
  farmName: string;
  batchLabel: string;
  breedName: string | null;
  batchTypeLabel: string;
  speciesLabel: string;
  integrationDate: string;
  quantityAtStart: number;
  quantityAlive: number;
  couvoirSupplier: string | null;
  chickLotNumber: string | null;
  hatchDate: string | null;
  batchStatusLabel: string;
  conformity: 'CONFORME' | 'PRECONFORMITE' | 'EN_ATTENTE';
  conformityNote: string;
  metrics: { label: string; value: string }[];
  generatedAtLabel: string;
}

const CONFORMITY_STYLES: Record<
  PasseportData['conformity'],
  { label: string; color: string }
> = {
  CONFORME: { label: 'CONFORME', color: '#27ae60' },
  PRECONFORMITE: { label: 'PRÉCONFORMITÉ', color: '#d68910' },
  EN_ATTENTE: { label: 'EN ATTENTE', color: '#c0392b' },
};

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private fontPromise: Promise<void> | null = null;

  private readonly FONTS = [
    'Roboto-Regular.ttf',
    'Roboto-Medium.ttf',
    'Roboto-Italic.ttf',
    'Roboto-MediumItalic.ttf',
  ];

  /** Prépare pdfmake (Node) une seule fois : polices via virtualfs + addFonts. */
  private async ensurePdfmake(): Promise<any> {
    const pdfmake = (await import('pdfmake')).default as any;
    const pdfFonts = (await import('pdfmake/build/vfs_fonts.js'))
      .default as Record<string, string>;

    if (!this.fontPromise) {
      this.fontPromise = (async () => {
        pdfmake.setUrlAccessPolicy?.(() => false);
        pdfmake.setLocalAccessPolicy?.(() => false);
        for (const fontName of this.FONTS) {
          pdfmake.virtualfs.writeFileSync(
            fontName,
            Buffer.from(pdfFonts[fontName], 'base64'),
          );
        }
        pdfmake.addFonts({
          Roboto: {
            normal: 'Roboto-Regular.ttf',
            bold: 'Roboto-Medium.ttf',
            italics: 'Roboto-Italic.ttf',
            bolditalics: 'Roboto-MediumItalic.ttf',
          },
        });
      })();
    }
    await this.fontPromise;
    return pdfmake;
  }

  async createReceiptPdf(data: ReceiptData): Promise<Buffer> {
    const documentDefinition = {
      content: [
        { text: data.farmName, style: 'header' },
        { text: 'Reçu de vente', style: 'subheader' },
        {
          text: `Référence : ${data.referenceNumber}\nDate : ${data.saleDate}\nClient : ${data.customerName ?? 'Client comptoir'}`,
          style: 'meta',
        },
        {
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            headerRows: 1,
            body: [
              [
                { text: 'Désignation', style: 'tableHeader' },
                { text: 'Qté', style: 'tableHeader' },
                { text: 'PU (FCFA)', style: 'tableHeader' },
                { text: 'Total (FCFA)', style: 'tableHeader' },
              ],
              ...data.items.map((item) => [
                item.label,
                item.quantity,
                String(item.unitPriceFcfa),
                String(item.amountFcfa),
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: '', margin: [0, 10, 0, 0] },
        data.discountAmountFcfa > 0
          ? {
              text: `Réduction : -${data.discountAmountFcfa} FCFA`,
              style: 'total',
            }
          : {},
        { text: `TOTAL : ${data.totalAmountFcfa} FCFA`, style: 'total' },
        { text: `Payé : ${data.paidAmountFcfa} FCFA`, style: 'total' },
        data.remainingFcfa > 0
          ? {
              text: `RESTE À PAYER : ${data.remainingFcfa} FCFA`,
              style: 'warning',
            }
          : {},
        { text: `Paiement : ${data.method}`, style: 'meta' },
        {
          qr: `KOUKOU|VTE|${data.referenceNumber}|${data.totalAmountFcfa}`,
          fit: 110,
          alignment: 'center',
          margin: [0, 14, 0, 0],
        },
        {
          text: "Vérifiez l'authenticité de ce reçu en scannant le code QR.\nKouKou Ferme — reçu généré par l'appareil.",
          style: 'footer',
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        subheader: {
          fontSize: 12,
          bold: true,
          color: '#444444',
          margin: [0, 0, 0, 8],
        },
        meta: {
          fontSize: 9,
          color: '#555555',
          alignment: 'left',
          margin: [0, 0, 0, 8],
        },
        tableHeader: { bold: true, color: '#222222' },
        total: { fontSize: 11, bold: true, margin: [0, 2, 0, 2] },
        passportNote: {
          fontSize: 8.5,
          italics: true,
          color: '#7f8c8d',
          margin: [0, 0, 0, 4],
        },
        warning: {
          fontSize: 11,
          bold: true,
          color: '#c0392b',
          margin: [0, 2, 0, 2],
        },
        footer: {
          fontSize: 8,
          color: '#888888',
          alignment: 'center',
          margin: [0, 12, 0, 0],
        },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdfmake = await this.ensurePdfmake();
    const document = pdfmake.createPdf(documentDefinition);
    return document.getBuffer();
  }

  async createPnlReportPdf(data: PnlReportData): Promise<Buffer> {
    const documentDefinition = {
      content: [
        { text: data.farmName, style: 'header' },
        { text: data.title, style: 'subheader' },
        { text: data.period, style: 'meta' },
        {
          table: {
            widths: ['*', 'auto'],
            headerRows: 1,
            body: [
              [
                { text: 'Rubrique', style: 'tableHeader' },
                { text: 'Montant (FCFA)', style: 'tableHeader' },
              ],
              ...data.rows.map((row) => [row.label, row.value]),
              ...data.totals.map((t) => [
                { text: t.label, style: 'total' },
                { text: t.value, style: 'total' },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        ...(data.grossMarginPct != null
          ? [
              {
                text: `Marge brute : ${data.grossMarginPct.toFixed(2)} %`,
                style: 'meta',
                margin: [0, 12, 0, 0],
              },
            ]
          : []),
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        subheader: {
          fontSize: 12,
          bold: true,
          color: '#444444',
          margin: [0, 0, 0, 8],
        },
        meta: {
          fontSize: 9,
          color: '#555555',
          margin: [0, 0, 0, 8],
        },
        tableHeader: { bold: true, color: '#222222' },
        total: { fontSize: 11, bold: true, color: '#222222' },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdfmake = await this.ensurePdfmake();
    const document = pdfmake.createPdf(documentDefinition);
    return document.getBuffer();
  }

  async createAccountingPdf(data: AccountingReportData): Promise<Buffer> {
    const documentDefinition = {
      content: [
        { text: data.farmName, style: 'header' },
        { text: data.title, style: 'subheader' },
        { text: data.period, style: 'meta' },
        ...data.sections.flatMap((section) => [
          { text: section.title, style: 'section' },
          {
            table: {
              widths:
                section.columns.length > 2
                  ? Array(section.columns.length)
                      .fill('auto')
                      .map((w, i) => (i === 0 ? '*' : w))
                  : ['*', 'auto'],
              headerRows: 1,
              body: [
                section.columns.map((c) => ({ text: c, style: 'tableHeader' })),
                ...section.rows,
                ...(section.totals ?? []).map((t) => [
                  { text: t.label, style: 'total' },
                  ...Array(Math.max(0, section.columns.length - 2)).fill(''),
                  { text: t.value, style: 'total' },
                ]),
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 2, 0, 12],
          },
        ]),
        data.totals.map((t) => ({ text: `${t.label} : ${t.value}`, style: 'total' })),
        { text: `Document généré le ${data.generatedAtLabel}.`, style: 'footer' },
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        subheader: {
          fontSize: 12,
          bold: true,
          color: '#444444',
          margin: [0, 0, 0, 8],
        },
        section: {
          fontSize: 10.5,
          bold: true,
          color: '#206080',
          margin: [0, 0, 0, 4],
        },
        meta: {
          fontSize: 9,
          color: '#555555',
          margin: [0, 0, 0, 8],
        },
        tableHeader: { bold: true, color: '#222222' },
        total: { fontSize: 11, bold: true, color: '#222222' },
        footer: {
          fontSize: 8,
          color: '#888888',
          alignment: 'center',
          margin: [0, 12, 0, 0],
        },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdfmake = await this.ensurePdfmake();
    const document = pdfmake.createPdf(documentDefinition);
    return document.getBuffer();
  }

  async createBordereauPdf(data: BordereauData): Promise<Buffer> {
    const documentDefinition = {
      content: [
        { text: data.farmName, style: 'header' },
        { text: "Bordereau d'envoi à l'abattoir", style: 'subheader' },
        {
          text: [
            `Référence : ${data.referenceNumber}\n` +
              `Destination : ${data.destinationLabel}\n` +
              `Type : ${data.slaughterTypeLabel}\n` +
              `Date prévue : ${data.plannedDate}\n` +
              `Lot : ${data.batchLabel}\n` +
              `Oiseaux : ${data.birdCount}` +
              (data.totalWeightKg != null
                ? ` — Poids vif total : ${data.totalWeightKg} kg`
                : '') +
              (data.carcassWeightKg != null
                ? ` — Poids carcasse : ${data.carcassWeightKg} kg` +
                  (data.rendementPercent != null
                    ? ` (Rendement : ${data.rendementPercent} %)`
                    : '')
                : '') +
              (data.internalBatchCode
                ? `\nCode interne (abattoir propre) : ${data.internalBatchCode}`
                : ''),
          ],
          style: 'meta',
        },
        ...(data.destination === 'EXTERNE'
          ? [
              {
                stack: [
                  {
                    text:
                      data.abattoirLotCode && data.abattoirLotCode.length > 0
                        ? `CODE LOT ABATTOIR : ${data.abattoirLotCode}`
                        : 'CODE LOT ABATTOIR — À SAISIR À LA RÉCEPTION',
                    style:
                      data.abattoirLotCode && data.abattoirLotCode.length > 0
                        ? 'waiverFilled'
                        : 'waiverEmpty',
                  },
                  {
                    text: 'La ferme ou l’abattoir peut renseigner ce code manuellement à la réception des volailles (jamais bloquant).',
                    style: 'meta',
                    margin: [0, 6, 0, 0],
                  },
                ],
                margin: [0, 10, 0, 10],
              },
            ]
          : []),
        {
          qr: `KOUKOU|ABT|${data.referenceNumber}|${data.batchLabel}`,
          fit: 110,
          alignment: 'center',
          margin: [0, 6, 0, 0],
        },
        {
          text: `Document généré le ${data.createdAtLabel}.\nKouKou Ferme — abattage & traçabilité.`,
          style: 'footer',
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        subheader: {
          fontSize: 12,
          bold: true,
          color: '#444444',
          margin: [0, 0, 0, 8],
        },
        meta: {
          fontSize: 9,
          color: '#555555',
          alignment: 'left',
          margin: [0, 0, 0, 8],
        },
        waiverEmpty: {
          fontSize: 13,
          bold: true,
          color: '#555555',
          margin: [12, 18, 12, 6],
          alignment: 'center',
        },
        waiverFilled: {
          fontSize: 13,
          bold: true,
          color: '#27ae60',
          margin: [12, 18, 12, 6],
          alignment: 'center',
        },
        footer: {
          fontSize: 8,
          color: '#888888',
          alignment: 'center',
          margin: [0, 12, 0, 0],
        },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdfmake = await this.ensurePdfmake();
    const document = pdfmake.createPdf(documentDefinition);
    return document.getBuffer();
  }

  async createPasseportPdf(data: PasseportData): Promise<Buffer> {
    const conformityStyle = CONFORMITY_STYLES[data.conformity];
    const documentDefinition = {
      content: [
        { text: data.farmName, style: 'header' },
        { text: 'Passeport sanitaire du lot', style: 'subheader' },
        { text: data.batchLabel, style: 'meta' },
        {
          table: {
            widths: ['auto', '*'],
            headerRows: 0,
            body: [
              ['Souche', data.breedName ?? 'Non renseignée'],
              ['Type', data.batchTypeLabel],
              ['Espèce', data.speciesLabel],
              ['Date d’intégration', data.integrationDate],
              ['Effectif de départ', String(data.quantityAtStart)],
              ['Effectif vivant', String(data.quantityAlive)],
              ['Couvoir (HACCP)', data.couvoirSupplier ?? 'Non renseigné'],
              ['N° lot couvoir', data.chickLotNumber ?? 'Non renseigné'],
              ['Date d’éclosion', data.hatchDate ?? 'Non renseignée'],
              ['Statut du lot', data.batchStatusLabel],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 6, 0, 10],
        },
        {
          table: {
            widths: ['auto', '*'],
            headerRows: 0,
            body: [
              [
                'Conformité sanitaire',
                {
                  text: conformityStyle.label,
                  color: conformityStyle.color,
                  bold: true,
                },
              ],
              ['Note', data.conformityNote],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 10],
        },
        {
          text: 'Indicateurs de santé du lot',
          style: 'subheader',
          margin: [0, 6, 0, 6],
        },
        {
          table: {
            widths: ['*', 'auto'],
            headerRows: 1,
            body: [
              [
                { text: 'Indicateur', style: 'tableHeader' },
                { text: 'Valeur', style: 'tableHeader' },
              ],
              ...data.metrics.map((m) => [m.label, m.value]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        {
          qr: `KOUKOU|PAS|${data.batchLabel}`,
          fit: 110,
          alignment: 'center',
          margin: [0, 14, 0, 0],
        },
        {
          text: `Généré le ${data.generatedAtLabel}.\nKouKou Ferme — passeport sanitaire généré par l’appareil.`,
          style: 'footer',
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        subheader: {
          fontSize: 12,
          bold: true,
          color: '#444444',
          margin: [0, 0, 0, 8],
        },
        meta: {
          fontSize: 9,
          color: '#555555',
          alignment: 'left',
          margin: [0, 0, 0, 8],
        },
        tableHeader: { bold: true, color: '#222222' },
        footer: {
          fontSize: 8,
          color: '#888888',
          alignment: 'center',
          margin: [0, 12, 0, 0],
        },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdfmake = await this.ensurePdfmake();
    const document = pdfmake.createPdf(documentDefinition);
    return document.getBuffer();
  }

  async createBonCommandePdf(data: BonCommandeData): Promise<Buffer> {
    const passportBlocks: object[] = [];
    if (data.passport) {
      const p = data.passport;
      const readyColor = p.readiness.readyForSale ? '#27ae60' : '#c0392b';
      const vaccineLast = p.vaccinations.last
        ? `${p.vaccinations.last.name} (${p.vaccinations.last.date})`
        : 'Aucun vaccin enregistré';
      const withdrawalList =
        p.withdrawals.length > 0
          ? p.withdrawals
              .map(
                (w) =>
                  `- ${w.productName} (${w.careTypeLabel}) : retrait jusqu'au ${w.withdrawalEndDate}`,
              )
              .join('\n')
          : 'Aucun retrait en cours';
      const alertList =
        p.sanitary.alerts.length > 0
          ? p.sanitary.alerts
              .map((a) => `- [${a.level}] ${a.message}`)
              .join('\n')
          : 'Aucune alerte sanitaire active';
      const diseaseList =
        p.sanitary.events.length > 0
          ? p.sanitary.events
              .map((e) => `- ${e.title} (${e.occurredAt})`)
              .join('\n')
          : null;
      const conformityStyle = {
        CONFORME: '#27ae60',
        PRECONFORMITE: '#d68910',
        EN_ATTENTE: '#c0392b',
      }[p.sanitary.conformity];

      passportBlocks.push(
        {
          text: 'Traçabilité du lot — passeport figé au bon de commande',
          style: 'subheader',
          margin: [0, 14, 0, 4],
        },
        {
          table: {
            widths: ['auto', '*'],
            headerRows: 0,
            body: [
              ['Lot', p.batchLabel],
              ['Espèce', p.speciesLabel],
              ['Souche', p.breedName ?? 'Non renseignée'],
              ['Type', p.batchTypeLabel],
              [
                'Intégration',
                `${p.integrationDate} (âge : ${p.ageDays} jours)`,
              ],
              ['Effectif vivant', String(p.liveCount)],
              ['Statut du lot', p.statusLabel],
              [
                'Auto-signal vente',
                { text: p.readiness.label, color: readyColor, bold: true },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 4, 0, 8],
        },
        {
          table: {
            widths: ['*', 'auto'],
            headerRows: 1,
            body: [
              [
                { text: 'Indicateur', style: 'tableHeader' },
                { text: 'Valeur', style: 'tableHeader' },
              ],
              ...p.metrics.map((m) => [m.label, m.value]),
              ['Dernier vaccin', vaccineLast],
              ['Vaccinations faites', String(p.vaccinations.completed)],
              ['Vaccinations restantes', String(p.vaccinations.planned)],
              ['Retraits (carence)', withdrawalList],
              ['Alertes sanitaires', alertList],
              ...(diseaseList
                ? [['Maladies déclarées', diseaseList]]
                : []),
              [
                'Visite vétérinaire',
                p.sanitary.vetVisited ? 'Oui' : 'Non',
              ],
              [
                'Conformité',
                {
                  text: p.sanitary.conformity,
                  color: conformityStyle,
                  bold: true,
                },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 6],
        },
        { text: p.readiness.note, style: 'passportNote' },
        { text: p.sanitary.conformityNote, style: 'passportNote' },
      );
    }

    const documentDefinition = {
      content: [
        { text: data.farmName, style: 'header' },
        { text: 'Bon de commande', style: 'subheader' },
        {
          text:
            `Référence : ${data.referenceNumber}\n` +
            `Canal : ${data.canalLabel}\n` +
            `Retrait / livraison prévue : ${data.expectedDate ?? 'À convenir'}\n` +
            `Client : ${data.customerName ?? 'Client comptoir'}` +
            (data.address ? `\nAdresse : ${data.address}` : '') +
            (data.batchLabel ? `\nLot : ${data.batchLabel}` : ''),
          style: 'meta',
        },
        {
          table: {
            widths: ['*', 'auto', 'auto', 'auto'],
            headerRows: 1,
            body: [
              [
                { text: 'Désignation', style: 'tableHeader' },
                { text: 'Qté', style: 'tableHeader' },
                { text: 'PU (FCFA)', style: 'tableHeader' },
                { text: 'Total (FCFA)', style: 'tableHeader' },
              ],
              ...data.items.map((item) => [
                item.label,
                item.quantity,
                String(item.unitPriceFcfa),
                String(item.amountFcfa),
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: '', margin: [0, 10, 0, 0] },
        { text: `TOTAL : ${data.totalAmountFcfa} FCFA`, style: 'total' },
        {
          text: `Acompte encaissé : ${data.depositFcfa} FCFA (${data.method})`,
          style: 'meta',
        },
        data.remainingFcfa > 0
          ? {
              text: `RESTE À PAYER : ${data.remainingFcfa} FCFA`,
              style: 'warning',
            }
          : {},
        ...passportBlocks,
        {
          qr: `KOUKOU|CMD|${data.referenceNumber}|${data.totalAmountFcfa}`,
          fit: 110,
          alignment: 'center',
          margin: [0, 14, 0, 0],
        },
        {
          text: "Vérifiez l'authenticité de ce bon de commande en scannant le code QR.\nKouKou Ferme — bon de commande généré par l'appareil.",
          style: 'footer',
        },
      ],
      styles: {
        header: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
        subheader: {
          fontSize: 12,
          bold: true,
          color: '#444444',
          margin: [0, 0, 0, 8],
        },
        meta: {
          fontSize: 9,
          color: '#555555',
          alignment: 'left',
          margin: [0, 0, 0, 8],
        },
        tableHeader: { bold: true, color: '#222222' },
        total: { fontSize: 11, bold: true, margin: [0, 2, 0, 2] },
        passportNote: {
          fontSize: 8.5,
          italics: true,
          color: '#7f8c8d',
          margin: [0, 0, 0, 4],
        },
        warning: {
          fontSize: 11,
          bold: true,
          color: '#c0392b',
          margin: [0, 2, 0, 2],
        },
        footer: {
          fontSize: 8,
          color: '#888888',
          alignment: 'center',
          margin: [0, 12, 0, 0],
        },
      },
      defaultStyle: { font: 'Roboto' },
    };

    const pdfmake = await this.ensurePdfmake();
    const document = pdfmake.createPdf(documentDefinition);
    return document.getBuffer();
  }
}
