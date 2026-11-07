import { ArrowRight, Clock, KeyRound, LifeBuoy, LogOut, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ACCESS_ACTIONS,
  ACTION_LABELS,
  DOMAIN_LABELS,
  GRANTABLE_DOMAINS,
  SCOPE_KIND_LABELS,
  type AccessAction,
  type AccessDomain,
} from '../api/types-access';
import { useFarm } from '../app/FarmContext';
import { worksWithoutFarm } from '../app/roles';
import { grantsAccess, institutionShowsEntry, pagesOfDomain, scopeReachesFarms } from '../app/menu-access';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { useAuth } from '../auth/AuthContext';
import { dateFromValidUntil, scopeKindNote } from '../components/access/matrix';
import { Button, ErrorNote } from '../components/form';
import { Pill } from '../components/org/shared';
import { Card, IconTile, Loading, PageHeader } from '../components/ui';
import { dateFr, plural } from '../lib/format';

/** Pages of the web app a domain opens (existing routes only), with their menu label. */
const PAGE_LABELS: Record<string, string> = {
  '/app/dashboard': 'Tableau de bord',
  '/app/alerts': 'Conseils d’élevage',
  '/app/tasks': 'Tâches',
  '/app/batches': 'Lots & suivi',
  '/app/activities': 'Activités',
  '/app/sanitary': 'Sanitaire',
  '/app/stock': 'Stock & provendes',
  '/app/slaughter': 'Abattage',
  '/app/reports': 'Rentabilité',
  '/app/expenses': 'Dépenses',
  '/app/registre': 'Registre des fermes',
  '/app/acces': 'Accès institutionnels',
  '/app/pilotage': 'Pilotage du programme',
  // POUFA L5 (begin)
  '/app/surveillance': 'Surveillance sanitaire',
  '/app/notifications/regles': 'Règles de notification',
  // POUFA L5 (end)
  // --- Programme administration (parameters, audit journal, data recovery) ---
  '/app/parametres': 'Paramètres',
  '/app/audit': 'Journal d’audit',
  '/app/reprise': 'Reprise des données',
  // --- end programme administration ---
  // POUFA W6
  '/app/intrants': 'Intrants (livraisons du programme)',
  '/app/livraisons': 'Livraisons d’intrants de la ferme',
  '/app/tracabilite': 'Traçabilité et opérateurs',
  // POUFA lot A droits: the Fermia modules opened in consultation, and the programme synthesis.
  '/app/finance/ventes': 'Ventes',
  '/app/finance/caisse': 'Caisse',
  '/app/finance/clients': 'Clients',
  '/app/orders': 'Commandes',
  '/app/points-of-sale': 'Points de vente',
  '/app/market': 'Marché',
  '/app/accounting': 'Comptabilité',
  '/app/hr': 'Dossiers RH',
  '/app/team': 'Équipe',
  '/app/economie': 'Synthèse économique',
  '/app/visites': 'Visites techniques et biosécurité',
};

/**
 * Concrete things a granted action lets the account do, shown on the domain
 * card. Derived from the effective matrix (never from the profile code), so
 * an admin changing the matrix changes this list. Recette ANINF A20.
 */
const ACTION_CAPABILITIES: ReadonlyArray<{ domain: AccessDomain; action: AccessAction; label: string }> = [
  { domain: 'TECHNIQUE', action: 'VALIDER', label: 'Créer des visites techniques (observations, grille de biosécurité, photos) et relever le point GPS d’une ferme' },
  { domain: 'DECLARATIONS', action: 'CONSULTER', label: 'Lire les déclarations sanitaires des fermes de votre périmètre' },
  { domain: 'SANITAIRE', action: 'VALIDER', label: 'Valider les déclarations sanitaires et publier les alertes' },
  { domain: 'SANITAIRE', action: 'MODIFIER', label: 'Qualifier les alertes et gérer les listes sanitaires' },
  { domain: 'REGISTRE', action: 'CREER', label: 'Enregistrer de nouvelles fermes au registre' },
  { domain: 'INTRANTS', action: 'CREER', label: 'Enregistrer les livraisons d’intrants de l’État' },
];

/** Programme-wide pages: open without a farm in the scope (POUFA L5 adds surveillance and notification rules). */

/** Domains without a screen in the web app yet: what the account can expect. */
const NO_SCREEN_YET: Partial<Record<AccessDomain, string>> = {
  PARAMETRES: 'Les paramètres et listes du programme en vigueur : écran de consultation à venir.',
  AUDIT: 'Le journal d’audit du programme (consultation, export, vérification des scellés quotidiens) : écran à venir. En attendant, l’équipe technique peut l’extraire pour vous.',
  REGISTRE: 'Les fiches des fermes de votre périmètre, au registre du programme.',
};

/**
 * The institutional account's own access: profile, scope, validity, and what
 * each granted domain opens. The landing page of an account whose scope
 * reaches no farm (aggregates, audit, financed farms before consent).
 */
export function MyAccessPage() {
  const { user, logout } = useAuth();
  const { farms } = useFarm();
  const { access, pending, revoked, failed, error, refetch } = useInstitutionAccess();

  if (pending) return <Loading label="Chargement de votre accès…" />;

  if (revoked || !access) {
    return (
      <Card className="mx-auto mt-6 max-w-xl p-6 text-center sm:p-8">
        <div className="flex justify-center">
          <IconTile icon={<ShieldAlert className="h-6 w-6" />} tone={revoked ? 'red' : 'amber'} size="lg" />
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          {revoked ? 'Votre accès au programme n’est pas actif' : 'Votre accès n’a pas pu être chargé'}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {revoked
            ? 'Votre rattachement a été suspendu ou a dépassé sa date de fin de validité. Contactez l’administration du programme POUFA pour le réactiver.'
            : 'Le serveur ne répond pas, ou cet appareil est hors ligne et n’a encore jamais chargé votre accès.'}
        </p>
        {failed ? (
          <div className="mt-3 text-left">
            <ErrorNote error={error} />
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {failed ? (
            <Button onClick={refetch}>
              <RotateCcw className="h-4 w-4" /> Réessayer
            </Button>
          ) : null}
          <Link to="/app/help" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <LifeBuoy className="h-4 w-4" /> Aide
          </Link>
          <Button tone="secondary" onClick={logout}>
            <LogOut className="h-4 w-4" /> Se déconnecter
          </Button>
        </div>
      </Card>
    );
  }

  const { profile } = access;
  const reaches = scopeReachesFarms(profile.scopeKind);
  const granted = GRANTABLE_DOMAINS.filter((d) => (profile.matrix[d]?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Mon accès" icon={<KeyRound className="h-6 w-6" />} subtitle={user?.fullName} />

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <IconTile icon={<ShieldCheck className="h-6 w-6" />} tone="brand" size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-lg font-bold text-slate-900">{profile.label}</p>
            <p className="text-sm text-slate-600">
              {SCOPE_KIND_LABELS[profile.scopeKind]}
              {profile.scopeKind === 'PROVINCES' && access.provinceCodes.length ? ` : ${access.provinceCodes.join(', ')}` : ''}
              {profile.scopeKind === 'FARMS' ? ` : ${plural(access.farmIds.length, 'ferme')}` : ''}
            </p>
            <p className="text-sm text-slate-500">{scopeKindNote(profile.scopeKind)}</p>
          </div>
          <div className="space-y-1 text-sm text-slate-600">
            <p className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" />
              {access.validUntil ? `Accès valable jusqu’au ${dateFr(dateFromValidUntil(access.validUntil))}` : 'Accès sans date de fin'}
            </p>
            <p className="text-xs text-slate-500">Une session dure 8 heures : reconnectez-vous ensuite.</p>
          </div>
        </div>
        {reaches && farms.length === 0 ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            Aucune ferme de votre périmètre n’est encore enregistrée au registre du programme.
          </p>
        ) : null}
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ce que votre profil vous permet</h2>
        {granted.length === 0 ? (
          <Card className="p-5 text-sm text-slate-600">Votre profil ne donne encore aucun droit. Contactez l’administration du programme.</Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {granted.map((d) => {
              const actions = ACCESS_ACTIONS.filter((a) => grantsAccess(profile, d, a));
              // Farm pages need a farm in scope; the access, registry and administration screens don't.
              const pages = pagesOfDomain(d).filter(
                (p) => PAGE_LABELS[p] && institutionShowsEntry(p, profile) && (worksWithoutFarm(p) || (reaches && farms.length > 0)),
              );
              const note = NO_SCREEN_YET[d];
              const capabilities = ACTION_CAPABILITIES.filter((c) => c.domain === d && grantsAccess(profile, d, c.action));
              return (
                <Card key={d} className="p-4">
                  <p className="font-semibold text-slate-900">{DOMAIN_LABELS[d]}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {actions.map((a) => (
                      <Pill key={a} tone={a === 'CONSULTER' ? 'slate' : 'brand'}>
                        {ACTION_LABELS[a]}
                      </Pill>
                    ))}
                  </div>
                  {capabilities.length > 0 ? (
                    <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                      {capabilities.map((c) => (
                        <li key={c.action + c.label}>{c.label}</li>
                      ))}
                    </ul>
                  ) : null}
                  {pages.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {pages.map((p) => (
                        <Link key={p} to={p} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                          {PAGE_LABELS[p]} <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ))}
                    </div>
                  ) : note ? (
                    <p className="mt-3 text-sm text-slate-500">{note}</p>
                  ) : !reaches ? (
                    <p className="mt-3 text-sm text-slate-500">Aucune fiche de ferme dans votre périmètre : ce domaine s’ouvrira avec les écrans agrégés.</p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
