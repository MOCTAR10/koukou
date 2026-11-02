import { Activity, AlertTriangle, CalendarDays, Clock, Dna, Info, Layers, ShieldAlert, ShieldCheck, Stethoscope, Syringe, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { OrderPassport } from '../../api/types-orders';
import { classNames, dateFr, num } from '../../lib/format';
import { Pill } from './shared';

const CONFORMITY: Record<OrderPassport['sanitary']['conformity'], { label: string; tone: string }> = {
  CONFORME: { label: 'Conforme', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PRECONFORMITE: { label: 'Préconformité', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  EN_ATTENTE: { label: 'En attente', tone: 'bg-red-50 text-red-700 ring-red-200' },
};

const SEVERITY_LABEL: Record<string, string> = { ROUGE: 'Rouge', JAUNE: 'Jaune', VERT: 'Vert' };

function Row({ label, icon, children, danger }: { label: string; icon?: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="flex items-center gap-1.5 text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0 [&>svg]:text-slate-400">
        {icon}
        {label}
      </span>
      <span className={classNames('text-right font-medium', danger ? 'text-red-600' : 'text-slate-800')}>{children}</span>
    </div>
  );
}

function Heading({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
      {icon}
      {children}
    </h4>
  );
}

function Banner({ tone, icon, children }: { tone: 'green' | 'amber' | 'red'; icon: ReactNode; children: ReactNode }) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800',
  };
  return (
    <div className={classNames('flex items-start gap-2 rounded-lg px-3 py-2 text-sm', tones[tone])}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

/** Lot traceability, frozen when the order was created. */
export function PassportCard({ passport }: { passport: OrderPassport }) {
  const { readiness, vaccinations, sanitary } = passport;
  const sanitaryHold = !readiness.readyForSale && readiness.readyReason === 'SANITARY';
  const conformity = CONFORMITY[sanitary.conformity];
  const lastVaccine = vaccinations.last;

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-brand-600" /> Passeport et traçabilité du lot
        </h3>
        <span className="text-xs text-slate-500">Figé le {dateFr(passport.generatedAt)}</span>
      </div>

      <Banner
        tone={readiness.readyForSale ? 'green' : sanitaryHold ? 'red' : 'amber'}
        icon={
          readiness.readyForSale ? (
            <ShieldCheck className="h-4 w-4" />
          ) : sanitaryHold ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <Info className="h-4 w-4" />
          )
        }
      >
        <p className="font-semibold">{readiness.label}</p>
        <p>{readiness.note}</p>
      </Banner>

      <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        <div>
          <Row label="Lot" icon={<Layers />}>{passport.batchLabel}</Row>
          <Row label="Souche" icon={<Dna />}>{passport.breedName ?? 'Non renseignée'}</Row>
          <Row label="Type" icon={<Activity />}>{passport.batchTypeLabel}</Row>
          <Row label="Espèce" icon={<Users />}>{passport.speciesLabel}</Row>
          <Row label="Intégration" icon={<CalendarDays />}>{dateFr(passport.integrationDate)}</Row>
          <Row label="Âge au bon" icon={<Clock />}>J{passport.ageDays}</Row>
          <Row label="Effectif vivant" icon={<Users />}>{num(passport.liveCount, 0)}</Row>
        </div>
        <div className="space-y-3">
          {passport.metrics.length > 0 ? (
            <div>
              <Heading icon={<Activity />}>Indicateurs du lot</Heading>
              {passport.metrics.map((m) => (
                <Row key={m.label} label={m.label}>
                  {m.value}
                </Row>
              ))}
            </div>
          ) : null}
          <div>
            <Heading icon={<Syringe />}>Vaccinations</Heading>
            <Row label="Dernier vaccin">
              {lastVaccine
                ? `${lastVaccine.name}${lastVaccine.date ? ` (${dateFr(lastVaccine.date)})` : ''}`
                : 'Aucun enregistré'}
            </Row>
            <Row label="Faites / restantes">
              {vaccinations.completed} / {vaccinations.planned}
            </Row>
          </div>
        </div>
      </div>

      {passport.withdrawals.length > 0 ? (
        <div className="space-y-1.5">
          <Heading icon={<Clock />}>Retraits en cours (carence)</Heading>
          {passport.withdrawals.map((w) => (
            <Banner key={`${w.productName}-${w.withdrawalEndDate}`} tone="amber" icon={<Clock className="h-4 w-4" />}>
              {w.productName} ({w.careTypeLabel}) : retrait jusqu’au {dateFr(w.withdrawalEndDate)}
            </Banner>
          ))}
        </div>
      ) : null}

      {sanitary.alerts.length > 0 ? (
        <div className="space-y-1.5">
          <Heading icon={<AlertTriangle />}>Alertes sanitaires actives</Heading>
          {sanitary.alerts.map((a) => (
            <Banner
              key={`${a.kind}-${a.message}`}
              tone={a.level === 'ROUGE' ? 'red' : 'amber'}
              icon={a.level === 'ROUGE' ? <AlertTriangle className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            >
              {a.message}
            </Banner>
          ))}
        </div>
      ) : null}

      {sanitary.events.length > 0 ? (
        <div>
          <Heading icon={<Stethoscope />}>Maladies déclarées</Heading>
          {sanitary.events.map((e) => (
            <Row key={`${e.title}-${e.occurredAt}`} label={e.title} danger={e.severity === 'ROUGE'}>
              {SEVERITY_LABEL[e.severity] ?? e.severity} · {dateFr(e.occurredAt)}
            </Row>
          ))}
        </div>
      ) : null}

      <div className="border-t border-slate-100 pt-2">
        <Row label="Visite vétérinaire" icon={sanitary.vetVisited ? <Stethoscope /> : <Info />}>{sanitary.vetVisited ? 'Oui' : 'Non'}</Row>
        <Row label="Conformité sanitaire" icon={<ShieldCheck />}>
          <Pill tone={conformity.tone}>{conformity.label}</Pill>
        </Row>
        <p className="mt-1 text-sm text-slate-600">{sanitary.conformityNote}</p>
      </div>
    </section>
  );
}
