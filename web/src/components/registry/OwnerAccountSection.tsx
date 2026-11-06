import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2, PencilLine, UserCheck, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import type { ActivateOwnerResult, LoginCodeResult, RegistrySheet } from '../../api/types-programme';
import { Button, ErrorNote } from '../form';
import { ONE_TIME_CODE_MUTATION, OneTimeCodeModal, useOneTimeCode } from '../login-code/OneTimeCodeModal';
import { activationBlocker, classifyActivationError } from './ownerActivation';
import { invalidateRegistry } from './queries';
import type { RegistryRights } from './registryAccess';

/**
 * The exploitant's account: activation (code shown once), link to his
 * existing account (one exploitant, several farms), new login code.
 */
export function OwnerAccountSection({ sheet, rights, onEditSheet }: { sheet: RegistrySheet; rights: RegistryRights; onEditSheet: () => void }) {
  const queryClient = useQueryClient();
  const [code, dispatch] = useOneTimeCode();
  const [linkedTo, setLinkedTo] = useState<string | null>(null);

  const activate = useMutation({
    ...ONE_TIME_CODE_MUTATION,
    mutationFn: (linkExistingUser: boolean) =>
      api.post<ActivateOwnerResult>(`/programme/farms/${sheet.id}/activate-owner`, linkExistingUser ? { linkExistingUser: true } : {}),
    onSuccess: (result) => {
      invalidateRegistry(queryClient, sheet.id);
      if (result.loginCode) {
        dispatch({ type: 'reveal', code: result.loginCode, holder: result.owner, title: 'Compte de l’exploitant activé', regenerated: false });
      } else {
        setLinkedTo(result.owner.fullName);
      }
      // The code now lives in the dialog's state only.
      activate.reset();
    },
  });

  const regenerate = useMutation({
    ...ONE_TIME_CODE_MUTATION,
    mutationFn: (userId: string) => api.post<LoginCodeResult>(`/admin/users/${userId}/login-code`),
    onSuccess: (result) => {
      dispatch({ type: 'reveal', code: result.loginCode, holder: result.user, title: 'Nouveau code de connexion', regenerated: true });
      regenerate.reset();
    },
  });

  const refusal = activate.error ? classifyActivationError(activate.error) : null;
  const blocker = activationBlocker(sheet);

  return (
    <div className="space-y-3">
      {linkedTo ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          Ferme rattachée au compte existant de <b>{linkedTo}</b> : il la retrouve avec son code habituel.
        </p>
      ) : null}
      {sheet.hasOwnerAccount ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <UserCheck className="h-4 w-4 text-emerald-600" />
            <span>
              Compte activé
              {sheet.owner ? (
                <>
                  {' '}
                  : <span className="font-semibold text-slate-900">{sheet.owner.fullName}</span>,{' '}
                  <span className="font-mono">{sheet.owner.phone}</span>
                </>
              ) : null}
            </span>
          </p>
          {rights.regenerateCode && sheet.owner ? (
            <Button
              tone="secondary"
              busy={regenerate.isPending}
              onClick={() => {
                if (window.confirm(`Générer un nouveau code pour ${sheet.owner!.fullName} ? L’ancien code ne fonctionnera plus.`)) {
                  regenerate.mutate(sheet.owner!.id);
                }
              }}
            >
              <KeyRound className="h-4 w-4" /> Nouveau code de connexion
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            L’exploitant n’a pas encore de compte. L’activation crée son compte Propriétaire à partir du téléphone de la fiche et
            donne un code de connexion, affiché une seule fois.
          </p>
          {blocker ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
              <span>{blocker}</span>
              {rights.edit ? (
                <Button tone="secondary" onClick={onEditSheet}>
                  <PencilLine className="h-4 w-4" /> Compléter la fiche
                </Button>
              ) : null}
            </div>
          ) : rights.activateOwner && refusal?.kind !== 'existingAccount' && refusal?.kind !== 'buyerAccount' ? (
            <Button busy={activate.isPending} onClick={() => activate.mutate(false)}>
              <UserPlus className="h-4 w-4" /> Activer le compte de l’exploitant
            </Button>
          ) : null}
        </>
      )}

      {refusal?.kind === 'existingAccount' ? (
        <div className="space-y-2 rounded-xl bg-sky-50 p-4 text-sm text-sky-900 ring-1 ring-sky-200">
          <p className="font-semibold">Un compte Propriétaire existe déjà pour le {sheet.exploitant.phone}.</p>
          <p>
            L’exploitant a sans doute déjà une autre ferme du programme. Rattachez cette ferme à son compte : il la verra avec son code
            habituel, aucun nouveau code n’est créé.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button tone="secondary" onClick={() => activate.reset()}>
              Annuler
            </Button>
            <Button busy={activate.isPending} onClick={() => activate.mutate(true)}>
              <Link2 className="h-4 w-4" /> Rattacher au compte existant
            </Button>
          </div>
        </div>
      ) : null}
      {refusal?.kind === 'buyerAccount' ? (
        <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Ce numéro appartient à un compte acheteur du Market.</p>
          <p>
            Un compte acheteur ne peut pas devenir exploitant. Inscrivez un autre numéro de téléphone pour l’exploitant sur la fiche,
            puis activez son compte.
          </p>
          {rights.edit ? (
            <div className="flex justify-end">
              <Button
                tone="secondary"
                onClick={() => {
                  activate.reset();
                  onEditSheet();
                }}
              >
                <PencilLine className="h-4 w-4" /> Changer le téléphone
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ErrorNote error={refusal?.kind === 'other' ? refusal.error : regenerate.error} />
      <OneTimeCodeModal state={code} dispatch={dispatch} recoveryHint="En cas de perte, générez-en un nouveau depuis la fiche de la ferme : l’ancien cessera alors de fonctionner." />
    </div>
  );
}
