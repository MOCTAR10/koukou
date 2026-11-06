# Règle de gestion des conflits de synchronisation (POUFA)

Livrable du cahier des charges (§9.4, « règle de gestion des conflits de synchronisation »), fonctionnalité « Collecte mobile hors connexion » : *dernière saisie horodatée retenue, conflit signalé*.

Cette règle s'applique à **toutes les fermes** : l'instance ne sert que le programme POUFA, chaque ferme en fait partie (`Farm.programId` toujours renseigné).

Code : `src/modules/sync/conflict-rules.ts` (règle pure, testée), `src/modules/sync/sync.service.ts` (enregistrement), appelé par la saisie journalière (`daily-entries.service.ts`). Toute évolution de la règle doit modifier ce document et ces fichiers ensemble.

## 1. Ce que le téléphone envoie

L'application garde les saisies faites sans réseau dans une file d'attente et les envoie au retour du réseau, dans l'ordre. Chaque opération peut porter :

| Champ | Sens |
|---|---|
| `capturedAt` | Heure de la saisie sur le téléphone (heure du téléphone). |
| `baseUpdatedAt` | Version de la fiche connue du téléphone au moment de la saisie (`updatedAt` renvoyé par le serveur). Absent si la fiche a été créée hors ligne. |
| `baseValues` | Facultatif : valeurs connues du téléphone avant la modification (morts, aliment en kg, eau, poids moyen, nombre pesé, œufs). |
| `deviceSentAt` | Heure du téléphone au moment de l'envoi, pour mesurer l'écart d'horloge. |
| `deviceId` | Identifiant de l'appareil. |

Une écriture **sans** `capturedAt` ni `baseUpdatedAt` est une écriture en ligne : elle s'applique directement, sans contrôle de conflit (le serveur note tout de même qui a écrit chaque champ et quand).

## 2. Horloge du téléphone

1. À chaque envoi qui porte `deviceSentAt`, le serveur calcule l'écart : *heure du téléphone − heure du serveur*. Il l'enregistre dans `sync_clock_samples` (utilisateur, ferme, appareil, écart en millisecondes).
2. Si l'écart dépasse le paramètre **`SYNC_ECART_HORLOGE_MAX_S`** (300 secondes par défaut, modifiable par l'administrateur, versionné), l'heure de saisie est **corrigée de l'écart** avant toute comparaison ; la correction est **marquée** (`clockCorrected`) sur les conflits et les sorties enregistrés.
3. Une heure de saisie ne peut jamais être dans le futur : elle est ramenée à l'heure du serveur (et marquée si l'avance dépasse le seuil).

Ainsi, un téléphone mal réglé ne gagne pas tous les conflits.

## 3. Comparaison champ par champ

La saisie journalière actuelle n'écrase que les champs envoyés, et le mobile renvoie des zéros pour les champs qu'il ne modifie pas. Le conflit se juge donc **champ par champ**. Pour chaque champ envoyé :

1. **Champ non modifié par le téléphone** : si `baseValues` est fourni et que la valeur envoyée est égale à la valeur de base, le téléphone n'a pas touché ce champ. Il n'est pas écrit ; la valeur du serveur reste.
2. **Pas de modification concurrente** : si le champ n'a pas changé sur le serveur depuis la version connue du téléphone (`baseUpdatedAt`), ou s'il a été écrit en dernier par le même appareil, la valeur envoyée s'applique.
3. **Même valeur des deux côtés** : la valeur s'applique, sans conflit.
4. **Conflit** : le champ a changé sur le serveur depuis la version connue du téléphone, depuis un autre appareil, avec une autre valeur. **La saisie dont l'heure de capture (corrigée) est la plus récente gagne.** À égalité, la valeur du serveur reste.

Une fiche créée hors ligne (sans `baseUpdatedAt`) alors qu'une fiche existe déjà sur le serveur pour le même jour est traitée comme une modification concurrente de chaque champ déjà saisi.

Champs comparés : `deaths`, `feedQuantity` (en kg), `waterL`, `avgWeightKg`, `sampleSize`, `eggsCollected`, `eggsSellable`, `eggsCracked`, `eggsSmall`, `eggsDoubleYolk`, `eggsDirty`. Les autres champs (phase et type d'aliment, unité, source) suivent l'écriture.

## 4. Aucune donnée perdue

Chaque conflit crée une ligne dans `sync_conflicts` : fiche concernée, champ, gagnant (`SERVEUR` ou `APPAREIL`), **valeur du serveur et valeur reçue** (la perdante est donc conservée), heures de capture des deux côtés (reçue brute et corrigée), utilisateurs et appareils, écart d'horloge.

Les conflits d'une ferme se consultent par `GET /farms/:farmId/sync-conflicts` (filtre `batchId`). Les tables sont journalisées (journal d'audit, niveau 2).

## 5. Signalement

### 5.1 Ce que les applications envoient

La règle est appliquée par les deux applications de terrain, pour la saisie journalière (la fiche d'élevage), qu'elle parte tout de suite ou qu'elle attende le réseau dans la file :

| Champ | Application mobile | Application web (hors ligne) |
|---|---|---|
| `capturedAt` | Heure à laquelle l'éleveur enregistre la saisie, fixée une fois pour toutes : un nouvel envoi de la même opération garde cette heure. | Idem. |
| `baseUpdatedAt` et `baseValues` | Quand la saisie du jour existait déjà : son `updatedAt` et ses valeurs telles que l'application les connaissait au moment de la modification (aliment en kg). Absents pour une nouvelle saisie. | Idem. |
| `deviceId` | Identifiant aléatoire propre à l'installation, gardé sur le téléphone. | Identifiant aléatoire propre au navigateur. |
| `deviceSentAt` | Heure du téléphone à **chaque** tentative d'envoi (premier essai et chaque reprise de la file). | Idem. |

Comme l'écriture porte `capturedAt`, la règle s'applique aussi à un envoi immédiat : une fiche restée ouverte pendant qu'un autre appareil modifiait le même jour est arbitrée de la même façon.

### 5.2 Notification

Après validation de l'écriture, le serveur émet l'événement `SYNC_CONFLICT` (ferme, bande, conflits). Les règles de notification, réglables par l'administration (`/programme/notification-rules`), l'envoient dans l'application :

- `FERME_CONFLIT_SAISIE` : le propriétaire et les administrateurs de la ferme ;
- `AGENT_CONFLIT_SAISIE` : les agents techniques qui suivent la ferme.

La notification ouvre la fiche de la bande. La trace de l'envoi est la notification elle-même (table `notifications`) ; `sync_conflicts.notifiedAt` n'est pas utilisé.

### 5.3 Affichage dans la fiche de bande

La fiche de bande (web : onglet de synthèse de la bande ; mobile : panneau de la bande) liste les conflits enregistrés pour cette bande (`GET /farms/:farmId/sync-conflicts?batchId=`), du plus récent au plus ancien. Chaque ligne dit, en clair :

- le jour et le champ concernés (par exemple « Saisie du 05/11 — morts ») ;
- **la valeur retenue** et la valeur écartée, qui reste conservée ;
- **pourquoi** : la saisie la plus récente a gagné (heure de capture de chaque côté), ou la valeur du serveur est restée à égalité ;
- « heure corrigée » quand l'horloge de l'appareil était déréglée (§2).

Les agents et les profils institutionnels qui lisent la bande (domaine TECHNIQUE) voient la même liste.

## 6. Sorties d'animaux

Une sortie est une création : elle porte une clé d'idempotence (`idempotencyKey` = identifiant de l'opération). Un nouvel envoi de la même opération renvoie la sortie déjà enregistrée, sans doublon. Son heure de capture est corrigée selon la même règle d'horloge (§2).

**Livraison d'une commande** (commande de la ferme ou du Market, `POST /farms/:farmId/orders/:orderId/livrer`) : le web et le mobile envoient l'heure de la livraison sur l'appareil (`capturedAt`, fixée au premier essai, et `deviceSentAt` à chaque envoi). Corrigée selon la même règle d'horloge (§2), elle donne **le jour de la livraison** : date de livraison de la commande, écriture comptable du chiffre d'affaires et, pour un client lié à un opérateur, **date de la cession** (sortie VENTE, sous-lot et QR). Une livraison faite hors ligne le lundi et synchronisée le mercredi est donc cédée le lundi. Sans `capturedAt` (écriture en ligne), c'est le jour du serveur. Les jours sont comptés en UTC (`src/modules/orders/delivery-day.ts`). La livraison est une transition : un second envoi est refusé (« déjà livrée ») et l'opération est abandonnée sans effet.

## 7. Exemple

| Heure réelle | Appareil | Action |
|---|---|---|
| 08 h 10 | Tablette de l'agent (en ligne) | Saisie du jour : 4 morts. |
| 08 h 40 | Téléphone de l'éleveur (hors ligne) | Même jour : 7 morts, 30 L d'eau. |
| 11 h 00 | Téléphone (retour du réseau) | Envoi : `capturedAt` 08 h 40. |

Le champ « morts » a changé sur le serveur depuis un autre appareil : conflit. La capture du téléphone (08 h 40) est plus récente que celle de la tablette (08 h 10) : **7 morts** est retenu, la valeur 4 est conservée dans `sync_conflicts` et le conflit est signalé. Le champ « eau » n'avait pas été saisi par la tablette : 30 L s'applique sans conflit.

Si le téléphone avait eu deux heures d'avance (envoi daté de 13 h 00 pour 11 h 00 au serveur), sa capture aurait été ramenée de 10 h 40 à 08 h 40 avant la comparaison, et la saisie marquée « heure corrigée ».
