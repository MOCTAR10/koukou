import { Eye } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { radii, semantic } from '@/constants/theme';
import { useFarmProfile } from '@/hooks/useFarmProfile';

/**
 * POUFA lot A droits: banner of a Fermia screen opened by an institution
 * (granted in consultation only). Renders nothing for farm accounts.
 */
export function ReadOnlyNotice({ what }: { what?: string }) {
  const { fermiaReadOnly } = useFarmProfile();
  if (!fermiaReadOnly) return null;
  return (
    <View style={styles.box} accessibilityRole="summary">
      <Eye size={16} color={semantic.accentText} />
      <View style={styles.text}>
        <AppText size="small" weight="semibold" style={{ color: semantic.accentText }}>
          Consultation seule
        </AppText>
        <AppText size="small" color="muted">
          {what ? `${what} : lecture` : 'Lecture'} accordée par votre profil institutionnel. Les saisies restent celles de la ferme.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: semantic.accentSoft,
  },
  text: { flex: 1, gap: 2 },
});
