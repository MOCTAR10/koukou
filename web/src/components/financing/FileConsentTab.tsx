import { useState } from 'react';
import { FileSignature, UserMinus } from 'lucide-react';
import type { FinancingFile } from '../../api/types-financing';
import { dateFr } from '../../lib/format';
import { Button, ErrorNote } from '../form';
import { Loading } from '../ui';
import { PaperConsentModal, WithdrawConsentModal } from './ConsentModals';
import { proofUrl, useFarmConsent } from './queries';
import { ConsentBadge, Fact, OpenFileButton, SectionTitle } from './shared';

/** Consent of the file's farm: state, proof, and the two paper records. */
export function FileConsentTab({ file }: { file: FinancingFile }) {
  const consent = useFarmConsent(file.farmId, file.farmCode);
  const [recording, setRecording] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const c = consent.data;
  const status = c?.status ?? file.consent;

  return (
    <div className="space-y-4">
      <SectionTitle>Consentement de l’exploitant</SectionTitle>
      <p className="flex items-center gap-2 text-sm text-slate-700">
        État actuel : <ConsentBadge value={status} />
      </p>
      {consent.isLoading ? <Loading /> : null}
      {consent.isError ? <ErrorNote error={consent.error} onRetry={() => void consent.refetch()} /> : null}
      {c && c.status !== 'AUCUN' ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Donné le">{dateFr(c.grantedAt)}</Fact>
          <Fact label="Version du modèle">{c.templateVersion != null ? `Version ${c.templateVersion}` : null}</Fact>
          <Fact label="Mode">{c.method === 'EN_LIGNE' ? 'En ligne, par l’exploitant' : c.method === 'PAPIER' ? 'Papier signé, saisi par la BCEG' : null}</Fact>
          <Fact label="Signataire">{[c.signerName, c.signerQuality].filter(Boolean).join(', ')}</Fact>
          <Fact label="Enregistré par">{c.recordedByName}</Fact>
          {c.status === 'RETIRE' ? <Fact label="Retiré le">{dateFr(c.withdrawnAt)}</Fact> : null}
          {c.status === 'RETIRE' && c.withdrawReason ? <Fact label="Motif du retrait" className="col-span-2">{c.withdrawReason}</Fact> : null}
        </dl>
      ) : null}
      {status === 'AUCUN' ? <p className="text-sm text-slate-600">Aucun consentement n’a été recueilli pour cette ferme.</p> : null}
      <div className="flex flex-wrap items-start gap-2">
        {c?.hasProof ? <OpenFileButton path={proofUrl(file.farmId)} label="Voir la copie signée" /> : null}
        {file.rights.create && status !== 'ACTIF' ? (
          <Button onClick={() => setRecording(true)}>
            <FileSignature className="h-4 w-4" /> Enregistrer un consentement signé
          </Button>
        ) : null}
        {file.rights.create && status === 'ACTIF' ? (
          <Button tone="secondary" onClick={() => setWithdrawing(true)}>
            <UserMinus className="h-4 w-4" /> Enregistrer un retrait
          </Button>
        ) : null}
      </div>
      {recording ? <PaperConsentModal farmId={file.farmId} farmName={file.farmName} onClose={() => setRecording(false)} /> : null}
      {withdrawing ? <WithdrawConsentModal farmId={file.farmId} farmName={file.farmName} onClose={() => setWithdrawing(false)} /> : null}
    </div>
  );
}
