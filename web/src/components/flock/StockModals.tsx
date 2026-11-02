import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { FeedStockSummary } from '../../api/types';
import type { FeedEntryType, FeedLossReason } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { num } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import {
  ENTRY_TYPE_LABEL,
  FEED_PHASES,
  FEED_PHASE_LABEL,
  LOSS_REASON_LABEL,
  Note,
  Tabs,
  localYmd,
  parseNum,
  phaseLabel,
  useInvalidateFarm,
} from './shared';

const ACTIVE_INGREDIENTS = [
  'Vitamine AD3E',
  'Vitamine A',
  'Vitamine D3',
  'Vitamine E',
  'Vitamine K3',
  'Vitamine B-complexe',
  'Oxytetracycline',
  'Colistine',
  'Enrofloxacine',
  'Florfenicol',
  'Avilamycine',
  'Tylosine',
  'Salinomycine',
  'Maduramycine',
  'Diclazuril',
  'Toltrazuril',
  'Monensine',
  'Lasalocide',
  'Phytase',
  'Xylanase',
  'Bêta-glucanase',
  'Protéase',
  'Amylase',
  'Lactobacillus',
  'Saccharomyces',
  'FOS (fructo-oligosaccharides)',
  'MOS (manno-oligosaccharides)',
  'Éthoxyquine',
  'BHT',
  'Astaxanthine',
  'Xanthophylle',
  'Acide formique',
  'Acide propionique',
  'Acide benzoïque',
  'Charbon actif',
  'Silice / anti-poussière',
];

const DOSE_UNITS = [
  { id: 'sachet', label: 'Sachet' },
  { id: 'litre', label: 'Litre (L)' },
  { id: 'kg', label: 'Kilogramme (kg)' },
  { id: 'g', label: 'Gramme (g)' },
  { id: 'mg', label: 'Milligramme (mg)' },
  { id: 'ml', label: 'Millilitre (mL)' },
  { id: 'comprime', label: 'Comprimé' },
  { id: 'dose', label: 'Dose unitaire' },
];

const RAW_MATERIALS = [
  'Maïs',
  'Soja (graine)',
  'Tourteau de soja',
  "Tourteau d'arachide",
  'Tourteau de coton',
  'Tourteau de palmiste',
  'Farine de poisson',
  'Son de blé',
  'Manioc / farine de manioc',
  'Huile de palme',
  'Sel',
  "Coquille d'huître",
  'Phosphate',
  'Mélasse',
  'Levure',
  'Grit',
  'Avocat',
];

const ENTRY_DESC: Record<FeedEntryType, string> = {
  BULKER: 'Vrac livré en camion, facturé à la tonne.',
  BAG: 'Sacs de provende, taille et prix par sac.',
  MEDICAMENT: 'Médicament ou additif, tracé par date de péremption.',
  MATIERE_PREMIERE: 'Matière première en tonnage (maïs, tourteau…).',
};

const ENTRY_TYPES: FeedEntryType[] = ['BULKER', 'BAG', 'MEDICAMENT', 'MATIERE_PREMIERE'];
const BAG_SIZES = [10, 25, 40, 50];

function intFcfa(raw: string): number | undefined {
  const n = parseNum(raw);
  return n === undefined ? undefined : Math.round(n);
}

export function FeedEntryModal({ stock, onClose }: { stock: FeedStockSummary | undefined; onClose: () => void }) {
  const { farmId, farm } = useFarm();
  const invalidate = useInvalidateFarm();
  const [entryType, setEntryType] = useState<FeedEntryType>('BAG');
  const [productName, setProductName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [expiration, setExpiration] = useState('');
  const [received, setReceived] = useState(localYmd());
  const [phase, setPhase] = useState('DEMARRAGE');
  const [customPhase, setCustomPhase] = useState('');
  const [tonnage, setTonnage] = useState('');
  const [costPerMt, setCostPerMt] = useState('');
  const [bags, setBags] = useState('');
  const [bagSize, setBagSize] = useState(String(farm?.defaultSacKg ?? 50));
  const [unitPrice, setUnitPrice] = useState('');
  const [additive, setAdditive] = useState('');
  const [doseQty, setDoseQty] = useState('');
  const [doseUnit, setDoseUnit] = useState('sachet');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');

  const isFeed = entryType === 'BULKER' || entryType === 'BAG';
  const phaseRow = stock?.byType.find((t) => t.feedPhase === phase);
  const autonomy = phaseRow?.autonomyDays ?? null;
  const expiryPast = !!expiration && expiration < received;

  const typeOk =
    entryType === 'BAG'
      ? (parseNum(bags) ?? 0) > 0
      : entryType === 'MEDICAMENT'
        ? additive.trim() !== '' && (parseNum(doseQty) ?? 0) > 0
        : (parseNum(tonnage) ?? 0) > 0;
  const canSubmit = productName.trim() !== '' && supplier.trim() !== '' && lotNumber.trim() !== '' && typeOk;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        kind: 'ALIMENT',
        entryType,
        productName: productName.trim(),
        supplier: supplier.trim(),
        supplierLotNumber: lotNumber.trim(),
        receivedDate: received,
      };
      if (expiration) body.expirationDate = expiration;
      if (isFeed) {
        body.feedPhase = phase;
        if (phase === 'PERSONNALISE' && customPhase.trim()) body.customFeedPhaseName = customPhase.trim();
      }
      if (entryType === 'BULKER') {
        body.tonnageMt = parseNum(tonnage);
        if (costPerMt.trim()) body.costPerMtFcfa = intFcfa(costPerMt);
      } else if (entryType === 'BAG') {
        body.numberOfBags = Math.round(parseNum(bags) ?? 0);
        body.bagSizeKg = parseNum(bagSize);
        if (unitPrice.trim()) body.unitPriceFcfa = intFcfa(unitPrice);
      } else if (entryType === 'MEDICAMENT') {
        body.additiveName = additive.trim();
        body.doseQuantity = parseNum(doseQty);
        if (doseUnit) body.doseUnit = doseUnit;
        if (notes.trim()) body.notes = notes.trim();
      } else {
        body.tonnageMt = parseNum(tonnage);
        if (totalCost.trim()) body.totalCostFcfa = intFcfa(totalCost);
      }
      return api.post(`/farms/${farmId}/inputs`, body);
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) save.mutate();
  };

  return (
    <Modal title="Réception de stock" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Tabs
          value={entryType}
          onChange={setEntryType}
          options={ENTRY_TYPES.map((t) => ({ key: t, label: ENTRY_TYPE_LABEL[t] }))}
        />
        <p className="text-sm text-slate-500">{ENTRY_DESC[entryType]}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Produit *">
            <input
              className={inputCls}
              list={entryType === 'MATIERE_PREMIERE' ? 'flock-raw-materials' : undefined}
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
            <datalist id="flock-raw-materials">
              {RAW_MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Fournisseur *">
            <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} required />
          </Field>
          <Field label="N° de lot fournisseur *">
            <input className={inputCls} value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} required />
          </Field>
          <Field label="Date de réception *">
            <input className={inputCls} type="date" max={localYmd()} value={received} onChange={(e) => setReceived(e.target.value)} required />
          </Field>
          <Field label="Date de péremption">
            <input className={inputCls} type="date" value={expiration} onChange={(e) => setExpiration(e.target.value)} />
          </Field>
          {isFeed ? (
            <Field label="Phase d'alimentation">
              <select className={inputCls} value={phase} onChange={(e) => setPhase(e.target.value)}>
                {FEED_PHASES.map((p) => (
                  <option key={p} value={p}>
                    {FEED_PHASE_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {isFeed && phase === 'PERSONNALISE' ? (
            <Field label="Nom de la phase">
              <input className={inputCls} value={customPhase} onChange={(e) => setCustomPhase(e.target.value)} />
            </Field>
          ) : null}
          {entryType === 'BULKER' ? (
            <>
              <Field label="Tonnage (t) *">
                <input className={inputCls} inputMode="decimal" value={tonnage} onChange={(e) => setTonnage(e.target.value)} required />
              </Field>
              <Field label="Coût par tonne (FCFA)">
                <input className={inputCls} inputMode="numeric" value={costPerMt} onChange={(e) => setCostPerMt(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </>
          ) : null}
          {entryType === 'BAG' ? (
            <>
              <Field label="Nombre de sacs *">
                <input className={inputCls} inputMode="numeric" value={bags} onChange={(e) => setBags(e.target.value.replace(/\D/g, ''))} required />
              </Field>
              <Field label="Taille du sac (kg)">
                <select className={inputCls} value={bagSize} onChange={(e) => setBagSize(e.target.value)}>
                  {[...new Set([...BAG_SIZES, Number(bagSize)])].sort((a, b) => a - b).map((s) => (
                    <option key={s} value={s}>
                      {s} kg
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prix par sac (FCFA)">
                <input className={inputCls} inputMode="numeric" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </>
          ) : null}
          {entryType === 'MEDICAMENT' ? (
            <>
              <Field label="Principe actif *">
                <input className={inputCls} list="flock-actives" value={additive} onChange={(e) => setAdditive(e.target.value)} required />
                <datalist id="flock-actives">
                  {ACTIVE_INGREDIENTS.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </Field>
              <Field label="Quantité *">
                <input className={inputCls} inputMode="decimal" value={doseQty} onChange={(e) => setDoseQty(e.target.value)} required />
              </Field>
              <Field label="Unité">
                <select className={inputCls} value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)}>
                  {DOSE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </>
          ) : null}
          {entryType === 'MATIERE_PREMIERE' ? (
            <>
              <Field label="Tonnage (t) *">
                <input className={inputCls} inputMode="decimal" value={tonnage} onChange={(e) => setTonnage(e.target.value)} required />
              </Field>
              <Field label="Coût total (FCFA)">
                <input className={inputCls} inputMode="numeric" value={totalCost} onChange={(e) => setTotalCost(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </>
          ) : null}
        </div>
        {isFeed && autonomy != null ? (
          <Note tone={autonomy < 3 ? 'red' : autonomy < 5 ? 'amber' : 'slate'}>
            Stock actuel {phaseLabel(phase).toLowerCase()} : {num(phaseRow?.availableKg ?? 0)} kg, soit {num(autonomy)} jours
            d'autonomie.
          </Note>
        ) : null}
        {expiryPast ? <Note tone="amber">La date de péremption est antérieure à la réception.</Note> : null}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!canSubmit}>
            Enregistrer la réception
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function LossModal({ stock, onClose }: { stock: FeedStockSummary | undefined; onClose: () => void }) {
  const { farmId, farm } = useFarm();
  const invalidate = useInvalidateFarm();
  const lots = (stock?.lots ?? []).filter((l) => l.availableKg > 0);
  const [lotId, setLotId] = useState('');
  const [unit, setUnit] = useState<'KG' | 'SAC'>('KG');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<FeedLossReason>('HUMIDITE');
  const [occurredAt, setOccurredAt] = useState(localYmd());
  const [notes, setNotes] = useState('');

  const lot = lots.find((l) => l.id === lotId) ?? null;
  const sacKg = farm?.defaultSacKg ?? 50;
  const qty = parseNum(quantity) ?? 0;
  const kg = unit === 'SAC' ? qty * sacKg : qty;
  const exceeds = lot != null && kg > lot.availableKg;

  const save = useMutation({
    mutationFn: () =>
      api.post(`/farms/${farmId}/feed-stock/losses`, {
        inputLotId: lotId,
        quantity: qty,
        unit,
        reason,
        occurredAt,
        notes: notes.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  return (
    <Modal title="Déclarer une perte" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (lot && qty > 0 && !exceeds) save.mutate();
        }}
      >
        <Field label="Lot d'aliment *">
          <select className={inputCls} value={lotId} onChange={(e) => setLotId(e.target.value)} required>
            <option value="">Sélectionner un lot…</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.productName} · {l.supplierLotNumber} ({num(l.availableKg)} kg)
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantité perdue *">
            <input className={inputCls} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
          </Field>
          <Field label="Unité" hint={unit === 'SAC' ? `Sac de ${sacKg} kg` : undefined}>
            <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as 'KG' | 'SAC')}>
              <option value="KG">Kilogrammes</option>
              <option value="SAC">Sacs</option>
            </select>
          </Field>
          <Field label="Raison">
            <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as FeedLossReason)}>
              {(Object.keys(LOSS_REASON_LABEL) as FeedLossReason[]).map((r) => (
                <option key={r} value={r}>
                  {LOSS_REASON_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className={inputCls} type="date" max={localYmd()} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {exceeds ? <Note tone="red">Quantité supérieure au disponible du lot ({num(lot?.availableKg ?? 0)} kg).</Note> : null}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!lot || qty <= 0 || exceeds}>
            Déclarer la perte
          </Button>
        </div>
      </form>
    </Modal>
  );
}
