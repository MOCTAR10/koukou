import { TraceLotKind } from '../../common/enums/trace.enum.js';
import { PUBLIC_LOT_NOTICE } from './public-lot-view.js';
import type { LotHistory } from './trace-history.service.js';

const KIND_LABELS: Record<TraceLotKind, string> = {
  LOT: 'Lot de la bande',
  SOUS_LOT: 'Sous-lot cédé',
  DERIVE: 'Lot dérivé',
};

/**
 * Printable label of a lot (CDC T5 « Génération, impression »): A6 page with
 * the QR address, the lot code, the producer and the mandatory mention. No
 * phone, cost nor name of a person or operator, like the public page.
 */
export function traceLabelDocument(history: LotHistory): object {
  const { lot, farm, band } = history;
  const facts: [string, string][] = [
    ['Producteur', farm.name],
    ['Bande', band.code ?? '—'],
    ['Mise en place', band.integrationDate.slice(0, 10)],
    ['Sujets', String(lot.quantity)],
  ];
  if (lot.cededOn) facts.push(['Cédé le', lot.cededOn]);
  // The label travels with the product: the operator's kind, not its name.
  if (lot.operator?.typeLabel) facts.push(['Cédé à', lot.operator.typeLabel]);
  return {
    pageSize: 'A6',
    pageMargins: [18, 18, 18, 18],
    content: [
      { text: KIND_LABELS[lot.kind], style: 'kind' },
      { text: lot.code, style: 'code' },
      { qr: lot.qrUrl, fit: 150, alignment: 'center', margin: [0, 6, 0, 6] },
      {
        table: { widths: ['auto', '*'], body: facts },
        layout: 'noBorders',
        fontSize: 9,
      },
      { text: PUBLIC_LOT_NOTICE, style: 'notice' },
    ],
    styles: {
      kind: { fontSize: 9, color: '#555555', alignment: 'center' },
      code: { fontSize: 14, bold: true, alignment: 'center' },
      notice: {
        fontSize: 7,
        italics: true,
        color: '#444444',
        alignment: 'center',
        margin: [0, 8, 0, 0],
      },
    },
    defaultStyle: { font: 'Roboto' },
  };
}
