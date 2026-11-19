import { useState, type FormEvent } from 'react';
import { Button, DateInput, ErrorNote, Field, Modal, inputCls, todayIso } from '../form';
import { ReasonModal } from './Dialogs';
import { useRecordPaperConsent, useWithdrawConsent } from './queries';
import { FilePick } from './shared';

/** Records a consent signed on paper: the scan, who signed and when. */
export function PaperConsentModal({ farmId, farmName, onClose }: { farmId: string; farmName: string; onClose: () => void }) {
  const record = useRecordPaperConsent(farmId);
  const [file, setFile] = useState<File | null>(null);
  const [signerName, setSignerName] = useState('');
  const [signerQuality, setSignerQuality] = useState('');
  const [grantedOn, setGrantedOn] = useState(todayIso());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    form.append('signerName', signerName.trim());
    form.append('signerQuality', signerQuality.trim());
    form.append('grantedOn', grantedOn);
    record.mutate(form, { onSuccess: onClose });
  };

  return (
    <Modal title={`Consentement signé : ${farmName}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">
          Enregistrez le consentement que l’exploitant a signé sur papier, avec le modèle en vigueur. La copie numérisée sert de preuve.
        </p>
        <Field label="Copie numérisée signée">
          <FilePick file={file} onPick={setFile} label="Choisir la copie signée" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du signataire">
            <input className={inputCls} value={signerName} onChange={(e) => setSignerName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Qualité du signataire" hint="Par exemple : propriétaire, gérant.">
            <input className={inputCls} value={signerQuality} onChange={(e) => setSignerQuality(e.target.value)} required maxLength={80} />
          </Field>
        </div>
        <Field label="Date de signature">
          <DateInput value={grantedOn} onChange={(e) => setGrantedOn(e.target.value)} max={todayIso()} required />
        </Field>
        <ErrorNote error={record.error} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={record.isPending} disabled={!file || !signerName.trim() || !signerQuality.trim() || !grantedOn}>
            Enregistrer le consentement
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Records that the exploitant withdrew the consent (the bank stops reading the farm). */
export function WithdrawConsentModal({ farmId, farmName, onClose }: { farmId: string; farmName: string; onClose: () => void }) {
  const withdraw = useWithdrawConsent(farmId);
  return (
    <ReasonModal
      title={`Retrait de consentement : ${farmName}`}
      intro="Le retrait est enregistré à la date du jour. Les données de la ferme ne sont plus lues par la BCEG à partir de maintenant ; les pièces déjà versées au dossier restent."
      label="Motif du retrait"
      confirm="Enregistrer le retrait"
      tone="danger"
      busy={withdraw.isPending}
      error={withdraw.error}
      onSubmit={(reason) => withdraw.mutate(reason, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
}
