// POUFA lot A droits: programme-wide economic synthesis for the DGE (and the
// platform admin): figures per province, then per farm, columns by the
// caller's matrix. Read-only; the CSV/Excel export stays on the web.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Landmark } from 'lucide-react-native';

import { fetchEconomieSynthesis, type SynthesisColumns, type SynthesisRow } from '@/api/economie';
import { todayStr } from '@/api/mutations';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/components/ui/Feedback';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Segmented } from '@/components/ui/Segmented';
import { Spinner } from '@/components/ui/Spinner';
import { color, fmt, fmtFcfa, radii, semantic } from '@/constants/theme';
import { useProgrammeAccess } from '@/hooks/useProgrammeAccess';
import {
  farmsOfProvince,
  shownGroup,
  SYNTHESIS_GROUPS,
  SYNTHESIS_SPANS,
  synthesisGroups,
  synthesisWindow,
  visibleFigures,
  type Figure,
  type SynthesisGroup,
  type SynthesisSpan,
} from '@/poufa/economie';
import { readsEconomieSynthesis } from '@/poufa/fermia-access';

function figureText(f: Figure): string {
  if (f.value == null) return '—';
  if (f.kind === 'fcfa') return fmtFcfa(f.value);
  if (f.kind === 'pct') return `${f.value.toLocaleString('fr-FR')} %`;
  if (f.kind === 'kg') return `${fmt(Math.round(f.value))} kg`;
  return fmt(f.value);
}

const NEGATIVE_BAD = new Set(['margin', 'result']);

function Figures({ row, columns, group }: { row: SynthesisRow; columns: SynthesisColumns; group: SynthesisGroup }) {
  return (
    <View style={styles.figures}>
      {visibleFigures(row, columns, group).map((f) => (
        <View key={f.key} style={styles.figure}>
          <AppText size="caption" color="muted" numberOfLines={1}>
            {f.label}
          </AppText>
          <AppText size="body" weight="semibold" color={NEGATIVE_BAD.has(f.key) && (f.value ?? 0) < 0 ? 'danger' : 'text'} numberOfLines={1}>
            {figureText(f)}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export default function SyntheseScreen() {
  const { user } = useAuth();
  const access = useProgrammeAccess();
  const allowed = readsEconomieSynthesis(user.role, access.matrix);
  const [span, setSpan] = useState<SynthesisSpan>('MOIS');
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<SynthesisGroup>('VENTES');
  const window = synthesisWindow(span, todayStr());

  const query = useQuery({
    queryKey: ['economie-synthese', window.from, window.to],
    queryFn: () => fetchEconomieSynthesis(window),
    enabled: allowed,
  });
  const s = query.data;
  // POUFA lot A2 dge: one column group at a time (sales, SYSCOHADA, Market, entries and volumes).
  const groups = s ? synthesisGroups(s.columns) : [];
  const group = s ? shownGroup(picked, s.columns) : 'VENTES';

  return (
    <Screen
      header={<ScreenHeader title="Synthèse du programme" subtitle="Finances, comptabilité, Market, saisies et volumes des fermes" back right={<Landmark size={18} color={color.ink[300]} />} />}
      refreshing={query.isFetching}
      onRefresh={allowed ? () => void query.refetch() : undefined}>
      {!allowed ? (
        access.isLoading ? (
          <Spinner label="Chargement de vos droits…" />
        ) : (
          <EmptyState icon={Landmark} title="Synthèse non accordée" description="La synthèse économique du programme demande la consultation du domaine économique dans votre profil." />
        )
      ) : (
        <View style={{ gap: 12 }}>
          <View style={styles.notice}>
            <AppText size="small" weight="semibold" style={{ color: semantic.accentText }}>
              Consultation seule
            </AppText>
            <AppText size="small" color="muted">
              Chiffres des fermes de votre périmètre, consultation inscrite au journal d’audit. Les colonnes suivent les droits de votre profil ; complétude, volumes et marge suivent les formules du programme. L’export CSV ou Excel se fait sur le web.
            </AppText>
          </View>
          <Segmented<SynthesisSpan> options={SYNTHESIS_SPANS.map((o) => ({ key: o.key, label: o.label }))} value={span} onChange={setSpan} />

          {query.isLoading ? (
            <Spinner label="Calcul de la synthèse…" />
          ) : query.isError ? (
            <EmptyState icon={Landmark} title="Synthèse indisponible" description={errorMessage(query.error)} />
          ) : s ? (
            <>
              {groups.length > 1 ? (
                <Segmented<SynthesisGroup>
                  options={SYNTHESIS_GROUPS.filter((g) => groups.includes(g.key)).map((g) => ({ key: g.key, label: g.label }))}
                  value={group}
                  onChange={setPicked}
                />
              ) : null}
              <Card tone="brand" style={{ gap: 8 }}>
                <AppText size="bodyM" weight="bold">
                  Programme · {fmt(s.total.farmCount ?? 0)} fermes
                </AppText>
                <AppText size="caption" color="muted">
                  Du {s.from.split('-').reverse().join('/')} au {s.to.split('-').reverse().join('/')}
                </AppText>
                <Figures row={s.total} columns={s.columns} group={group} />
              </Card>

              {s.provinces.length === 0 ? (
                <EmptyState icon={Landmark} title="Aucune ferme" description="Aucune ferme du programme dans votre périmètre." />
              ) : null}

              {s.provinces.map((p) => {
                const key = p.provinceCode ?? '—';
                const expanded = open === key;
                return (
                  <Card key={key} style={{ gap: 8 }}>
                    <Pressable onPress={() => setOpen(expanded ? null : key)} style={styles.provinceHead} accessibilityRole="button">
                      <View style={{ flex: 1 }}>
                        <AppText size="body" weight="bold">
                          {p.provinceName ?? 'Sans province'}
                        </AppText>
                        <AppText size="caption" color="muted">
                          {fmt(p.farmCount ?? 0)} fermes
                        </AppText>
                      </View>
                      {expanded ? <ChevronDown size={18} color={color.ink[400]} /> : <ChevronRight size={18} color={color.ink[400]} />}
                    </Pressable>
                    <Figures row={p} columns={s.columns} group={group} />
                    {expanded
                      ? farmsOfProvince(s.farms, p.provinceCode).map((f) => (
                          <View key={f.farmId} style={styles.farm}>
                            <AppText size="small" weight="semibold" numberOfLines={1}>
                              {f.code ? `${f.code} · ` : ''}
                              {f.name}
                            </AppText>
                            <Figures row={f} columns={s.columns} group={group} />
                          </View>
                        ))
                      : null}
                  </Card>
                );
              })}
            </>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { padding: 10, gap: 2, borderRadius: radii.md, backgroundColor: semantic.accentSoft },
  figures: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 12 },
  figure: { minWidth: '45%', flexGrow: 1, gap: 1 },
  provinceHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  farm: { paddingTop: 8, gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: semantic.border },
});
