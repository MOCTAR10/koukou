import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, ChevronDown, ClipboardCheck, NotebookPen } from 'lucide-react-native';

import { AppText } from '@/components/ui/AppText';
import { color } from '@/constants/theme';
import type { ActivityKind, JournalGroup } from './activityFeed';
import { timeLabel } from './activityFeed';

const KIND_DOT: Record<ActivityKind, { bg: string; icon: React.ComponentType<{ size?: number; color?: string }> }> = {
  saisie: { bg: '#D4E6F3', icon: NotebookPen },
  tache: { bg: '#E0EFDA', icon: ClipboardCheck },
  alerte: { bg: '#F8E0DB', icon: Bell },
};

/** Un jour du journal, repliable s'il contient plus de `perDay` entrées. */
function DayGroup({ group, perDay }: { group: JournalGroup; perDay: number }) {
  const router = useRouter();
  const [expanded, setExpanded] = React.useState(false);
  const collapsible = group.totalEntries > perDay;
  const shown = expanded ? group.entries : group.entries.slice(0, perDay);
  const hidden = group.totalEntries - shown.length;

  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <AppText size="label" weight="bold" color="brand">
          {group.label.toUpperCase()}
        </AppText>
        <View style={styles.groupRule} />
        <AppText size="small" color="faint">
          {group.totalEntries}
        </AppText>
      </View>

      {shown.map((entry) => {
        const meta = KIND_DOT[entry.kind];
        const Icon = meta.icon;
        const body = (
          <View style={styles.entry}>
            <View style={[styles.dot, { backgroundColor: meta.bg }]}>
              <Icon size={12} color="#206080" />
            </View>
            <View style={{ flex: 1, gap: 1, minWidth: 0 }}>
              <AppText size="bodyM" weight="semibold" color="text" numberOfLines={1}>
                {entry.title}
              </AppText>
              <AppText size="small" color="muted" numberOfLines={1}>
                {entry.detail}
              </AppText>
            </View>
            <AppText size="small" color="faint">
              {timeLabel(entry.at)}
            </AppText>
          </View>
        );
        return entry.href ? (
          <Pressable
            key={entry.id}
            onPress={() => router.push(entry.href as never)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={`${entry.title}, ${entry.detail}`}>
            {body}
          </Pressable>
        ) : (
          <View key={entry.id}>{body}</View>
        );
      })}

      {collapsible ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Masquer ${hidden} entrées` : `Afficher ${hidden} entrées de plus`}>
          <AppText size="small" weight="semibold" color="brand">
            {expanded ? 'Réduire' : `+${hidden} de plus`}
          </AppText>
          <ChevronDown size={13} color={color.brand[600]} style={expanded ? styles.chevronUp : undefined} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Journal horodaté, groupé par jour — la mémoire des opérations de la ferme. */
export function JournalTimeline({
  groups,
  perDay = 4,
}: {
  groups: JournalGroup[];
  perDay?: number;
}) {
  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <AppText size="small" color="faint" align="center">
          Aucune opération sur cette période.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {groups.map((group) => (
        <DayGroup key={group.key} group={group} perDay={perDay} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  group: {
    gap: 2,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  groupRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DDE7EC',
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingLeft: 36,
  },
  chevronUp: {
    transform: [{ rotate: '180deg' }],
  },
  empty: {
    paddingVertical: 18,
  },
});