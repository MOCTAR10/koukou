import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, SlidersHorizontal } from 'lucide-react';
import { api } from '../api/client';
import type { NotificationEventInfo, NotificationRule } from '../api/types-surveillance';
import { NOTIFICATION_AUDIENCES } from '../api/types-surveillance';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { useAccessProfiles } from '../components/access/queries';
import { Pill } from '../components/flock/shared';
import { Button, ErrorNote, Field, Modal, inputCls } from '../components/form';
import {
  AUDIENCE_LABELS,
  ESCALATE_MAX_MIN,
  SEVERITY_LABELS,
  createRuleBody,
  deliverySummary,
  emptyRuleForm,
  formFromRule,
  ruleBody,
  ruleFormProblem,
  type RuleForm,
} from '../components/surveillance/ruleForm';
import { useNotificationRights } from '../components/surveillance/useSurveillanceRights';
import { Card, DataTable, EmptyState, IconButton, Loading, PageHeader, Td, Th } from '../components/ui';

const RULES_KEY = ['notification-rules'] as const;
const EVENTS_KEY = ['notification-events'] as const;

/**
 * Notification rules of the programme (POUFA §7.6): which event goes to
 * whom, on which channels, with which escalation. Read with ADMINISTRATION
 * CONSULTER, written with ADMINISTRER (server matrix).
 */
export function NotificationRulesPage() {
  const rights = useNotificationRights();
  const rules = useQuery({
    queryKey: RULES_KEY,
    queryFn: () => api.get<NotificationRule[]>('/programme/notification-rules'),
    enabled: rights.readRules,
  });
  const events = useQuery({
    queryKey: EVENTS_KEY,
    queryFn: () => api.get<NotificationEventInfo[]>('/programme/notification-rules/events'),
    enabled: rights.readRules,
    staleTime: 30 * 60_000,
  });
  const profiles = useAccessProfiles();
  const [editing, setEditing] = useState<NotificationRule | 'new' | null>(null);

  if (rights.loading) return <Loading />;
  if (!rights.readRules) return <PageNotOpen />;

  const eventLabel = (code: string) => events.data?.find((e) => e.event === code)?.label ?? code;
  const profileLabel = (code: string | null) => (code ? (profiles.data?.find((p) => p.code === code)?.label ?? code) : '');
  const list = [...(rules.data ?? [])].sort((a, b) => a.event.localeCompare(b.event) || a.code.localeCompare(b.code));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Règles de notification"
        icon={<SlidersHorizontal />}
        subtitle="Quel événement prévient qui, par quels canaux, avec quelle escalade"
        actions={
          <>
            <Link
              to="/app/notifications"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" /> Mes notifications
            </Link>
            {rights.writeRules ? (
              <Button onClick={() => setEditing('new')}>
                <Plus className="h-4 w-4" /> Nouvelle règle
              </Button>
            ) : null}
          </>
        }
      />
      <ErrorNote error={rules.error ?? events.error} />
      {rules.isLoading ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState message="Aucune règle de notification." icon={<SlidersHorizontal />} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable>
            <thead>
              <tr>
                <Th>Événement</Th>
                <Th>Règle</Th>
                <Th>Destinataires</Th>
                <Th>Canaux</Th>
                <Th className="md:max-lg:hidden">Gravité</Th>
                <Th>État</Th>
                {rights.writeRules ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <Td label="Événement">{eventLabel(r.event)}</Td>
                  <Td label="Règle">
                    <span className="font-medium text-slate-900">{r.label}</span>
                    <span className="block text-xs text-slate-400">{r.code}</span>
                  </Td>
                  <Td label="Destinataires">
                    {AUDIENCE_LABELS[r.audience] ?? r.audience}
                    {r.audience === 'PROFILE' && r.profileCode ? <span className="block text-xs text-slate-500">{profileLabel(r.profileCode)}</span> : null}
                  </Td>
                  <Td label="Canaux">{deliverySummary(r)}</Td>
                  <Td label="Gravité" className="md:max-lg:hidden">
                    {SEVERITY_LABELS[r.severityMin] ?? r.severityMin}
                  </Td>
                  <Td label="État">{r.active ? <Pill tone="emerald">Active</Pill> : <Pill>Inactive</Pill>}</Td>
                  {rights.writeRules ? (
                    <Td>
                      <IconButton label={`Modifier ${r.label}`} onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
      {editing ? (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          events={events.data ?? []}
          profiles={(profiles.data ?? []).map((p) => ({ code: p.code, label: p.label }))}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function RuleModal({
  rule,
  events,
  profiles,
  onClose,
}: {
  rule: NotificationRule | null;
  events: NotificationEventInfo[];
  profiles: Array<{ code: string; label: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const creating = rule === null;
  const [form, setForm] = useState<RuleForm>(() => (rule ? formFromRule(rule) : emptyRuleForm()));
  const [tried, setTried] = useState(false);
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const confidential = events.find((e) => e.event === form.event)?.confidential ?? false;
  const problem = ruleFormProblem(form, { creating, confidential });
  const save = useMutation({
    mutationFn: () =>
      rule
        ? api.patch<NotificationRule>(`/programme/notification-rules/${rule.id}`, ruleBody(form))
        : api.post<NotificationRule>('/programme/notification-rules', createRuleBody(form)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: RULES_KEY });
      onClose();
    },
  });
  const submit = () => {
    setTried(true);
    if (!problem) save.mutate();
  };

  return (
    <Modal title={rule ? `Modifier « ${rule.label} »` : 'Nouvelle règle de notification'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!rule ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Événement">
              <select className={inputCls} value={form.event} onChange={(e) => set('event', e.target.value as RuleForm['event'])}>
                <option value="">Choisir…</option>
                {events.map((e) => (
                  <option key={e.event} value={e.event}>
                    {e.label}
                    {e.confidential ? ' (confidentiel avant publication)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Code" hint="Majuscules, chiffres ou _ ; il ne change plus ensuite.">
              <input className={inputCls} value={form.code} maxLength={60} onChange={(e) => set('code', e.target.value.toUpperCase())} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Événement : <span className="font-medium text-slate-900">{events.find((e) => e.event === rule.event)?.label ?? rule.event}</span>
            <span className="text-slate-400"> · {rule.code}</span>
          </p>
        )}
        {confidential ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Données sanitaires non publiées : seuls la ferme et le profil des services vétérinaires peuvent les recevoir.
          </p>
        ) : null}
        <Field label="Libellé">
          <input className={inputCls} value={form.label} maxLength={200} onChange={(e) => set('label', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Destinataires">
            <select className={inputCls} value={form.audience} onChange={(e) => set('audience', e.target.value as RuleForm['audience'])}>
              {NOTIFICATION_AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {AUDIENCE_LABELS[a]}
                </option>
              ))}
            </select>
          </Field>
          {form.audience === 'PROFILE' ? (
            <Field label="Profil destinataire">
              <select className={inputCls} value={form.profileCode} onChange={(e) => set('profileCode', e.target.value)}>
                <option value="">Choisir…</option>
                {profiles.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
                {form.profileCode && !profiles.some((p) => p.code === form.profileCode) ? <option value={form.profileCode}>{form.profileCode}</option> : null}
              </select>
            </Field>
          ) : null}
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-slate-600">Canaux</legend>
          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input type="checkbox" checked disabled /> Dans l’application (toujours : sa lecture arrête l’escalade)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.push} onChange={(e) => set('push', e.target.checked)} /> Notification push
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.sms} onChange={(e) => set('sms', e.target.checked)} /> SMS tout de suite
          </label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Escalade par SMS si non lue après (minutes)" hint={form.sms ? 'Sans objet : la règle envoie déjà un SMS.' : `Vide = pas d’escalade ; 1 à ${ESCALATE_MAX_MIN}.`}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={form.escalate}
              disabled={form.sms && !form.escalate}
              onChange={(e) => set('escalate', e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
          <Field label="Gravité minimale">
            <select className={inputCls} value={form.severityMin} onChange={(e) => set('severityMin', e.target.value as RuleForm['severityMin'])}>
              {(Object.keys(SEVERITY_LABELS) as Array<RuleForm['severityMin']>).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> Règle active
        </label>
        {tried && problem ? <ErrorNote error={problem} /> : null}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
