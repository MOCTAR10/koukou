import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wheat } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { Parcelle, Recolte, RecolteInput, RecolteUnit } from '../../api/types-agri';
import { useFarm } from '../../app/FarmContext';
import { Button, ErrorNote, Field, inputCls, Modal, DateInput } from '../form';
import { invalidateAgri, localYmd, parseDecimal, RECOLTE_UNIT_LABELS, RECOLTE_UNITS } from './agri';

export function RecolteFormModal({ parcelles, onClose }: { parcelles: Parcelle[]; onClose: () => void }) {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const today = localYmd();

  const [parcelleId, setParcelleId] = useState('');
  const [harvestDate, setHarvestDate] = useState(today);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<RecolteUnit>('KG');
  const [notes, setNotes] = useState('');

  const qty = parseDecimal(quantity);
  const quantityInvalid = quantity.trim() !== '' && (qty === null || qty <= 0);
  const canSubmit = Boolean(parcelleId) && Boolean(harvestDate) && qty !== null && qty > 0;

  const save = useMutation({
    mutationFn: () => {
      const body: RecolteInput = {
        parcelleId,
        harvestDate,
        quantity: qty ?? 0,
        unit,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      return api.post<Recolte>(`/farms/${farmId}/recoltes`, body);
    },
    onSuccess: () => {
      invalidateAgri(queryClient, farmId);
      onClose();
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) save.mutate();
  };

  const sorted = [...parcelles].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <Modal title="Journaliser une récolte" onClose={onClose}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <p className="text-sm text-slate-500">
          Quantité récoltée sur une parcelle : elle devient vendable au point de vente.
        </p>
        <Field label="Parcelle *">
          <select
            className={inputCls}
            value={parcelleId}
            onChange={(e) => setParcelleId(e.target.value)}
            required
          >
            <option value="">Choisir une parcelle…</option>
            {sorted.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.culture.name})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date de récolte *">
          <DateInput
            
            className={inputCls}
            value={harvestDate}
            max={today}
            onChange={(e) => setHarvestDate(e.target.value)}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Quantité récoltée *"
            hint={quantityInvalid ? 'Saisissez une quantité positive, par exemple 12,5.' : undefined}
          >
            <input
              className={inputCls}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-invalid={quantityInvalid}
              required
            />
          </Field>
          <Field label="Unité">
            <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value as RecolteUnit)}>
              {RECOLTE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {RECOLTE_UNIT_LABELS[u]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notes (optionnel)">
          <textarea
            className={inputCls}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex. : plantains mûrs, sacs de 25 kg…"
          />
        </Field>

        <ErrorNote error={save.error} />

        <div className="flex justify-end gap-2 pt-1">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!canSubmit}>
            {save.isPending ? null : <Wheat className="h-4 w-4" />}
            Enregistrer la récolte
          </Button>
        </div>
      </form>
    </Modal>
  );
}
