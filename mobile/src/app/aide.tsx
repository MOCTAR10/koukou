import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BookOpen, CreditCard, Globe2, LifeBuoy, PiggyBank, RefreshCw, ShieldCheck, Syringe, Timer, UserPlus, WifiOff } from 'lucide-react-native';

import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { color } from '@/constants/theme';

function GuideCard({ icon, title, lines }: { icon: React.ReactNode; title: string; lines: string[] }) {
  return (
    <Card tone="default" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>{icon}</View>
        <AppText size="body" weight="bold" color="text">
          {title}
        </AppText>
      </View>
      <View style={{ gap: 4 }}>
        {lines.map((l) => (
          <View key={l} style={styles.line}>
            <View style={styles.bullet} />
            <AppText size="small" color="ink">
              {l}
            </AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

export default function AideScreen() {
  return (
    <Screen>
      <ScreenHeader title="Langue & aide" subtitle="Français · Guide de démarrage" back right={<BookOpen size={18} color={color.ink[300]} />} />

      <SectionHeader title="Démarrage rapide" subtitle="Les 4 premiers gestes" />
      <View style={{ gap: 10 }}>
        <GuideCard
          icon={<PiggyBank size={18} color={color.accent[600]} />}
          title="1. Votre ferme"
          lines={[
            'Créez votre ferme dans la console web : nom, commune, capacité.',
            'Ensuite, connectez cette application avec vos identifiants (« Connexion au serveur »).',
          ]}
        />
        <GuideCard
          icon={<UserPlus size={18} color={color.brand[600]} />}
          title="2. Votre équipe"
          lines={[
            'Menu → Équipe : ajoutez un compte éleveur (terrain) pour les saisies.',
            'L’éleveur saisit, vend et encaisse ; l’ouverture/clôture de caisse reste au propriétaire.',
          ]}
        />
        <GuideCard
          icon={<Syringe size={18} color={color.green[600]} />}
          title="3. Un lot, un calendrier"
          lines={[
            'Créez le lot, entrez les saisies du jour chaque matin (moins d’1 minute).',
            'Menu → Sanitaire : générez le calendrier de soins, complétez les soins et tracez les traitements.',
          ]}
        />
        <GuideCard
          icon={<CreditCard size={18} color={color.amber[700]} />}
          title="4. Vendre & encaisser"
          lines={[
            '« Ventes / Encaisser » : pièce, au kilo, œufs ou autre, avec un client et un coupon optionnels.',
            'La caisse s’ouvre automatiquement ; les reçus et bordereaux proviennent du serveur (PDF).',
          ]}
        />
      </View>

      <SectionHeader title="Offline & qualité" />
      <View style={{ gap: 10 }}>
        <GuideCard
          icon={<WifiOff size={18} color={color.red[500]} />}
          title="Captures hors-ligne"
          lines={[
            'Sans réseau, une saisie ou une vente est mise en attente : « sera synchronisée ».',
            `L'onglet Menu affiche un badge ambre avec le nombre d'opérations à synchroniser et toucher pour envoyer.`,
            'La synchronisation est automatique dès que la connexion revient.',
          ]}
        />
        <GuideCard
          icon={<RefreshCw size={18} color={color.brand[600]} />}
          title="Alertes & advisory"
          lines={[
            'L’onglet Alertes priorise vos actions (rouge → jaune) : saisie manquante, soin, stock de provende.',
            'Acquittez une alerte en la touchant ; elle restera historisée.',
          ]}
        />
        <GuideCard
          icon={<ShieldCheck size={18} color={color.green[600]} />}
          title="Traçabilité"
          lines={[
            'Aliments HACCP : n° de lot fournisseur, péremption, stock par bâtiment.',
            'Menu → Abattage : ordres VIVANT/ABATTU, bordereau pour l’abattoir, passeport sanitaire du lot.',
          ]}
        />
      </View>

      <SectionHeader title="À propos" />
      <View style={{ gap: 10 }}>
        <GuideCard
          icon={<Globe2 size={18} color={color.ink[400]} />}
          title="Langue & support"
          lines={[
            'Interface en français (Gabon).',
            'Aide détaillée et tutoriels vidéo prévus dans une prochaine version.',
          ]}
        />
        <GuideCard
          icon={<Timer size={18} color={color.ink[400]} />}
          title="Statut"
          lines={['Application mobile reliée au serveur ; les saisies hors-ligne se synchronisent au retour en ligne.']}
        />
      </View>

      <View style={styles.footer}>
        <LifeBuoy size={16} color={color.ink[300]} />
        <AppText size="small" color="faint" style={styles.footerText}>
          Besoin d’aide ? Contactez l’équipe Fermia via la console web (support).
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.brand[500],
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  footerText: {
    textAlign: 'center',
  },
});