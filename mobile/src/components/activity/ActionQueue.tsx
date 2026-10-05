import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Bell, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, NotebookPen } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { color } from '@/constants/theme';
import type { ActionQueue as ActionQueueResult, ActivityKind, Priority } from './activityFeed';

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  saisie: NotebookPen,
  tache: ClipboardCheck,
  alerte: Bell,
};

/** Accents sourds : la priorité se lit sans jamais crier. */
function toneFor(priority: Priority) {
  return priority === 'CRITIQUE'
    ? { accent: '#C08575', icon: '#B37C6A', chip: '#8A6A5E' }
    : { accent: '#D3B978', icon: '#B39A5E', chip: '#8A7845' };
}

/**
 * « À traiter » — file d'actions priorisée. La liste est plafonnée et
 * dépliable : une ferme avec 40 actions ne doit pas faire défiler l'écran.
 * Vide = tout est à jour, ce qui est l'information la plus rassurante possible.
 */
export function ActionQueue({ queue, visible = 4 }: { queue: ActionQueueResult; visible?: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);

  const { actions, total } = queue;
  const shown = expanded ? actions : actions.slice(0, visible);
  const hidden = total - shown.length;

  if (total === 0) {
    return (
      <Card tone="green" style={styles.allGood}>
        <View style={styles.allGoodIcon}>
          <CheckCircle2 size={20} color="#5B8F45" strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <AppText size="body" weight="bold" color="text">
            Tout est à jour
          </AppText>
          <AppText size="caption" color="muted">
            Aucune saisie en retard, aucune tâche échue, aucune alerte active.
          </AppText>
        </View>
      </Card>
    );
  }

  const criticals = actions.filter((a) => a.priority === 'CRITIQUE').length;

  return (
    <View style={styles.list}>
      {criticals > 0 ? (
        <View style={styles.banner}>
          <View style={styles.bannerDot} />
          <AppText size="small" color="muted">
            {criticals} point{criticals > 1 ? 's' : ''} prioritaire{criticals > 1 ? 's' : ''} · le reste peut
            attendre
          </AppText>
        </View>
      ) : null}

      {shown.map((action) => {
        const Icon = KIND_ICON[action.kind];
        const tone = toneFor(action.priority);
        return (
          <Pressable
            key={action.id}
            onPress={() => action.href && router.push(action.href as never)}
            disabled={!action.href}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`${action.title}. ${action.detail}`}>
            <View style={[styles.accent, { backgroundColor: tone.accent }]} />
            <View style={styles.icon}>
              <Icon size={15} color={tone.icon} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <AppText size="bodyM" weight="bold" color="text" numberOfLines={1}>
                {action.title}
              </AppText>
              <AppText size="small" color="muted" numberOfLines={2}>
                {action.detail}
              </AppText>
            </View>
            {action.badge ? (
              <View style={styles.badge}>
                <AppText size="small" weight="bold" color="muted">
                  {action.badge}
                </AppText>
              </View>
            ) : null}
            <ChevronRight size={15} color={color.ink[300]} />
          </Pressable>
        );
      })}

      {hidden > 0 || expanded ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Réduire la liste' : `Afficher ${hidden} actions de plus`}>
          <AppText size="small" weight="semibold" color="brand">
            {expanded ? 'Réduire' : `Voir les ${hidden} autre${hidden > 1 ? 's' : ''}`}
          </AppText>
          <ChevronDown
            size={14}
            color={color.brand[600]}
            style={expanded ? styles.chevronUp : undefined}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 4,
    paddingBottom: 2,
  },
  bannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C08575',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingRight: 12,
    paddingLeft: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    overflow: 'hidden',
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceAlt,
    marginLeft: 9,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: color.surfaceAlt,
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  chevronUp: {
    transform: [{ rotate: '180deg' }],
  },
  allGood: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  allGoodIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E6F0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
});