import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity, TrendingUp, Scale, Lightbulb, type LucideIcon } from 'lucide-react-native';

import { Sheet } from './ui/Sheet';
import { AppText } from './ui/AppText';
import { palette, radii, semantic } from '@/constants/theme';

export type MetricKey = 'IC' | 'GMQ' | 'IPE';

interface MetricContent {
  icon: LucideIcon;
  title: string;
  tagline: string;
  body: string;
  prefix: string;
  numerator: string;
  denominator: string;
  suffix?: string;
  example: string;
  ideal: string;
}

const METRIC_CONTENT: Record<MetricKey, MetricContent> = {
  IC: {
    icon: Activity,
    title: 'IC — Indice de Consommation',
    tagline: 'Le KPI d’efficacité alimentaire',
    body: 'L’IC (ou FCR, Feed Conversion Ratio) mesure combien de kilos d’aliment sont nécessaires pour produire un kilo de poulet. C’est l’indicateur clé de la rentabilité : plus l’IC est bas, mieux l’aliment est valorisé en poids vif.',
    prefix: 'IC =',
    numerator: 'Aliment consommé (kg)',
    denominator: 'Poids vif produit (kg)',
    suffix: undefined,
    example: 'Un lot consomme 3 000 kg d’aliment et produit 1 500 kg de poulets → IC = 3 000 ÷ 1 500 = 2,0.',
    ideal: 'Bon IC chair : 1,6 – 1,9. Au-delà de 2,2, l’utilisation de l’aliment se dégrade.',
  },
  GMQ: {
    icon: TrendingUp,
    title: 'GMQ — Gain Moyen Quotidien',
    tagline: 'La vitesse de croissance du lot',
    body: 'Le GMQ représente la croissance moyenne quotidienne des sujets, en grammes par jour. Plus il est élevé, plus les poulets atteignent vite leur poids de vente (poids d’abattage/sacrifice visé).',
    prefix: 'GMQ (g/j) =',
    numerator: 'Poids final (g) − Poids initial (g)',
    denominator: 'Nombre de jours d’élevage',
    suffix: undefined,
    example: 'Poussin pesé à 40 g au départ, 2 500 g à J40 → (2 500 − 40) ÷ 39 ≈ 63 g/j.',
    ideal: 'Au-delà de 55 g/j, la croissance est considérée rapide. Surveillez l’IC quand le GMQ augmente.',
  },
  IPE: {
    icon: Scale,
    title: 'IPE — Indice de Performance d’Élevage',
    tagline: 'Le KPI zootechnique de référence',
    body: "Dans la gestion technico-économique des poulets de chair, l'IPE (ou indice européen) est la formule de référence mondiale pour évaluer l'efficacité globale d'un lot à la fin de la période d'élevage. Il combine en un seul chiffre la viabilité des animaux, leur vitesse de croissance et l'efficacité de leur alimentation.",
    prefix: 'IPE =',
    numerator: 'Viabilité (%) × Poids moyen (kg)',
    denominator: 'Âge au sacrifice (jours) × IC',
    suffix: '× 100',
    example: 'Viabilité 95 %, poids moyen 2,2 kg, âge 45 j, IC 1,8 → IPE = (95 × 2,2 ÷ (45 × 1,8)) × 100 ≈ 258.',
    ideal: 'Un IPE élevé = lot efficace (viable, rapide, économe). La viabilité = 100 % − taux de mortalité.',
  },
};

interface MetricInfoSheetProps {
  metric: MetricKey | null;
  onClose: () => void;
}

export function MetricInfoSheet({ metric, onClose }: MetricInfoSheetProps) {
  const content = metric ? METRIC_CONTENT[metric] : null;

  return (
    <Sheet
      visible={!!content}
      title={content?.title ?? ''}
      subtitle={content?.tagline ?? ''}
      icon={content ? <content.icon size={20} color={semantic.primary} /> : undefined}
      onClose={onClose}>
      {content && (
        <>
          <AppText size='body' color='muted' style={styles.body}>
            {content.body}
          </AppText>

          <View style={styles.formulaBox}>
            <View style={styles.formulaRow}>
              <AppText size='body' weight='semibold' color='brand'>{content.prefix}</AppText>
              <View style={styles.fraction}>
                <View style={styles.fractionPart}>
                  <AppText size='body' weight='semibold' color='ink'>{content.numerator}</AppText>
                </View>
                <View style={styles.fractionLine} />
                <View style={styles.fractionPart}>
                  <AppText size='body' weight='semibold' color='ink'>{content.denominator}</AppText>
                </View>
              </View>
              {content.suffix ? <AppText size='body' weight='semibold' color='brand'>{content.suffix}</AppText> : null}
            </View>
          </View>

          <View style={styles.exampleBox}>
            <AppText size='small' weight='bold' color='ink'>Exemple chiffré</AppText>
            <AppText size='small' color='muted'>{content.example}</AppText>
          </View>

          <View style={styles.tipRow}>
            <Lightbulb size={14} color={palette.amber[500]} />
            <AppText size='small' color='muted' style={styles.tipText}>{content.ideal}</AppText>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { lineHeight: 20 },
  formulaBox: {
    backgroundColor: semantic.primarySoft,
    borderRadius: radii.lg,
    padding: 12,
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  fraction: {
    alignItems: 'center',
    minWidth: 0,
    flexShrink: 1,
  },
  fractionPart: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  fractionLine: {
    alignSelf: 'stretch',
    height: 1.5,
    backgroundColor: palette.brand[400],
    marginVertical: 4,
  },
  exampleBox: {
    backgroundColor: semantic.surface,
    borderRadius: radii.md,
    padding: 10,
    gap: 4,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  tipText: { flex: 1, lineHeight: 18 },
});