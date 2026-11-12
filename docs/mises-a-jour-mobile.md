# Mises à jour de l'app mobile Fermia

Deux mécanismes, un seul job Jenkins complet.

| | Quand | Ce que voit l'utilisateur |
|---|---|---|
| OTA (bundle JS) | correction du code JS/TS, textes, écrans | « Nouvelle mise à jour · Installer » : un clic, l'app redémarre (1 à 3 s) |
| Nouvel APK | changement natif (nouvelle librairie, permission, config native) | « Nouvelle version disponible · Mettre à jour » : téléchargement puis installateur Android |

L'APK n'est proposé que si son **runtime version** diffère de celui installé ; sinon l'OTA suffit.

## Fonctionnement

- `runtimeVersion` = empreinte (fingerprint) du code natif, calculée par `scripts/ota.mjs runtime` (écrite dans `app.json` dans l'espace de travail Jenkins uniquement). Un bundle n'est servi qu'aux APK de même runtime.
- Manifeste : fichiers statiques servis par nginx (`deploy/nginx-fermia.conf`, `/ota/manifest` choisit le fichier selon l'en-tête `expo-runtime-version`). Aucun changement backend.
- Disque : `/var/www/trees-apk/fermia/ota/{assets,rv/<runtime>/current.multipart,rv/<runtime>/releases/<id>/}`. Les 10 dernières versions sont gardées.
- Signature : chaque manifeste est signé RSA-SHA256 ; l'APK embarque le certificat public et refuse tout bundle non signé par la clé. Clé privée : `/var/jenkins_home/fermia-secrets/ota/private-key.pem` (créée au premier build, jamais dans git). **À sauvegarder** : si elle est perdue, un nouveau certificat impose un nouvel APK, les anciens ne recevraient plus d'OTA.
- Dans l'app : vérification 4 s après le démarrage puis au retour au premier plan (au plus toutes les 5 min), téléchargement en arrière-plan, rechargement uniquement au clic, après l'envoi des opérations hors ligne en cours. Toute erreur est silencieuse. Après un plantage, l'app cherche seule une version corrigée (`ON_ERROR_RECOVERY`).

## Publier

- **Tout (APK + OTA)** : job `fermia-android` (comme avant). Publie l'APK, `apk/version.json` et le bundle OTA.
- **Correctif JS seulement (rapide, sans APK)** : job `fermia-android-ota`, mode `publier`. S'arrête avec un message si le code natif a changé.

## Retour arrière

Job `fermia-android-ota` : mode `lister` pour voir les identifiants, puis mode `retour arriere` avec `ROLLBACK_TO=<identifiant>`. Cela republie l'ancien contenu comme nouvelle version (un téléphone ne prend jamais une version plus ancienne que celle qu'il exécute). Les téléphones le reçoivent comme une mise à jour normale.

## Test sur téléphone

1. Installer l'APK construit par le job complet (premier APK avec l'updater).
2. Modifier un texte, lancer `fermia-android-ota`.
3. Ouvrir l'app, attendre ~10 s : la bannière apparaît ; « Installer » redémarre avec le nouveau texte.
