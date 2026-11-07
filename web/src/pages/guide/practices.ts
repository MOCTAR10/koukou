import type { Fact } from './types';

/**
 * « Mise en œuvre professionnelle et portabilité » and « Sécurité et protection des données ».
 * Every line below was checked against the repository (file noted in `source`), not against intentions.
 */

export interface Practice extends Fact {
  /** Where it can be checked in the repository. */
  source: string;
}

export const PRACTICES: Practice[] = [
  { title: 'API en conteneur Docker', text: 'L’API est livrée sous forme d’image Docker, avec une base PostgreSQL 16 / PostGIS dans un second conteneur.', source: 'backend/Dockerfile, deploy/docker-compose.yml' },
  { title: 'Configuration par variables d’environnement', text: 'Secrets, base de données et origines autorisées sont lus dans un fichier .env hors du dépôt. Un modèle sans valeur est fourni ; aucun secret n’est dans le code.', source: 'deploy/env.example' },
  { title: 'Chiffrement en transit', text: 'Le site est servi en HTTPS : nginx redirige le port 80 vers 443, avec un certificat Let’s Encrypt.', source: 'deploy/nginx-fermia.conf' },
  { title: 'Sauvegardes chiffrées chaque nuit', text: 'Un export de la base est chiffré (AES-256) et conservé 7 jours. La commande de restauration est notée dans le script.', source: 'deploy/backup.sh' },
  { title: 'Redéploiement en une commande', text: 'Un script récupère le code sur GitHub, reconstruit l’API et le web, puis les publie. Il prend en option le nom de la branche.', source: 'deploy/deploy.sh' },
  { title: 'Migrations de base versionnées', text: 'Le schéma évolue par migrations datées (27 à ce jour), appliquées au démarrage. La synchronisation automatique du schéma est coupée en production.', source: 'backend/src/database/migrations, deploy/env.example' },
  { title: 'Intégration continue sur GitHub', text: 'Compilation, contrôle de style et tests unitaires du backend, du web et du mobile à chaque envoi. Les tests de bout en bout sur PostgreSQL tournent à chaque demande de fusion vers main et chaque nuit.', source: '.github/workflows/ci.yml, e2e.yml' },
  { title: 'Revue par demandes de fusion', text: 'Les évolutions entrent dans main par des demandes de fusion (pull requests), relues et validées par la CI.', source: 'Historique GitHub du dépôt' },
  { title: 'APK Android signé par Jenkins', text: 'L’application Android est construite et signée par un job Jenkins, puis publiée à une adresse fixe. La clé de signature reste hors du dépôt.', source: 'mobile/Jenkinsfile' },
  { title: 'Journal d’audit immuable', text: 'Les tables du journal refusent toute modification ou suppression (déclencheurs PostgreSQL) et le journal est scellé chaque jour.', source: 'migrations AuditJournal, modules/audit' },
  { title: 'Droits paramétrables', text: 'Les droits de chaque profil se règlent dans une matrice par l’administrateur, sans changer le code.', source: 'modules/access' },
  { title: 'API documentée', text: 'L’API est décrite au format OpenAPI et consultable avec Swagger.', source: 'backend/src/main.ts' },
];

export const PIPELINE = [
  { title: 'Code', text: 'Développement par branche' },
  { title: 'Tests CI', text: 'Build, lint, tests unitaires et e2e' },
  { title: 'Revue', text: 'Demande de fusion vers main' },
  { title: 'Déploiement', text: 'Un script, depuis GitHub' },
  { title: 'Sauvegardes', text: 'Export chiffré chaque nuit' },
];

export const REDEPLOY = [
  { title: 'Prérequis', text: 'Un serveur Linux avec Docker, nginx et un nom de domaine.' },
  { title: 'Récupérer le code', text: 'Cloner le dépôt GitHub du projet.' },
  { title: 'Configurer', text: 'Copier le modèle env.example en .env et renseigner les secrets propres au serveur.' },
  { title: 'Démarrer', text: 'Construire l’image de l’API, puis docker compose up : base PostGIS et API.' },
  { title: 'Migrations', text: 'Appliquées toutes seules au démarrage de l’API.' },
  { title: 'Web et HTTPS', text: 'Compiler le web, le publier, activer nginx et le certificat TLS.' },
  { title: 'Reprendre les données', text: 'Si besoin, restaurer une sauvegarde chiffrée avec pg_restore.' },
];

export const SECURITY: Practice[] = [
  { title: 'Authentification par jeton signé', text: 'Après la connexion, l’API délivre un jeton JWT signé. Sa durée est réglable (7 jours par défaut).', source: 'modules/auth/auth.module.ts' },
  { title: 'Codes secrets hachés', text: 'Les codes de connexion ne sont jamais stockés : seule leur empreinte bcrypt l’est.', source: 'common/utils/login-code.ts' },
  { title: 'Droits : refus par défaut', text: 'Une route sans domaine de droit déclaré est refusée. Chaque institution n’agit que dans le périmètre que la matrice lui donne.', source: 'common/guards/program-access.guard.ts' },
  { title: 'Journal d’audit pour l’ANINF', text: 'Écritures et consultations sensibles sont inscrites dans un journal en ajout seul, scellé chaque jour.', source: 'modules/audit' },
  { title: 'Limitation du débit', text: 'L’API accepte au plus 120 requêtes par minute et par adresse, avec des limites plus strictes sur la connexion.', source: 'app.module.ts, auth.controller.ts' },
  { title: 'HTTPS et sauvegardes chiffrées', text: 'Trafic chiffré en transit ; sauvegardes nocturnes chiffrées en AES-256.', source: 'deploy/' },
  { title: 'Code à usage unique, au choix', text: 'Pour les comptes institutionnels, un code reçu par SMS peut être exigé (INSTITUTION_OTP=sms). C’est un réglage, désactivé par défaut.', source: 'modules/auth/login-challenge.service.ts' },
  { title: 'Banques : périmètre prévu, pas encore actif', text: 'Le périmètre « fermes financées, avec consentement » existe dans la matrice, mais le consentement de l’éleveur n’est pas encore construit : ce périmètre ne donne accès à aucune ferme aujourd’hui.', source: 'modules/access/access-rules.ts' },
  { title: 'Santé : seuls les vétérinaires voient', text: 'Les déclarations sanitaires des fermes ne sont visibles que des profils vétérinaires, par la matrice.', source: 'sanitary-declaration.policy.ts' },
  { title: 'QR public sans donnée sensible', text: 'La page publique d’un lot montre l’origine du produit, sans coût, sans personne, sans position précise. Elle porte la mention : ne constitue pas un certificat sanitaire.', source: 'modules/trace/public-lot-view.ts' },
  { title: 'Écritures rejouables sans doublon', text: 'Les encaissements et paiements portent une clé d’idempotence : un envoi rejoué après une coupure réseau ne crée pas de doublon.', source: 'common/utils/idempotency.ts' },
];

export const GUIDE_SAFETY = [
  'Page publique : aucune donnée réelle ni personnelle. Les captures montrent une ferme de démonstration, téléphones masqués.',
  'Aucun secret, aucune adresse de serveur, aucun traceur externe : tous les fichiers sont servis par la plateforme elle-même.',
];
