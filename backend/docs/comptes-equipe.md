# Comptes d'équipe créés par l'exploitant (POUFA, friction F13)

## Délégation

L'exploitant (compte Propriétaire, activé par le registre) crée lui-même les comptes de son équipe dans **Équipe** (`POST /farms/:farmId/eleveurs`) : un **membre** (ELEVEUR, droits fixes de saisie) ou un **administrateur de ferme** (ADMIN, droits choisis un par un dans le catalogue des permissions). Un administrateur de ferme qui a « Gérer l'équipe » peut à son tour créer des membres, sans jamais donner plus de droits qu'il n'en a. Ces comptes n'ont accès qu'à la ferme qui les a créés (un lien par ferme, `farm_employees`) ; ils ne voient aucune donnée du programme.

L'exploitant peut à tout moment désactiver un membre (fiche du membre, `PATCH /farms/:farmId/eleveurs/:id` avec `active: false`) : toutes les routes de la ferme lui répondent alors 403.

## Ce que voit l'administration du programme

- **Liste** : `GET /programme/farms/:farmId/team` — compte (nom, téléphone), rôle (membre / administrateur de ferme), permissions, accès à la ferme actif ou suspendu, compte actif ou non, date de création. Ouvert à l'administrateur plateforme et aux profils qui ont **ADMINISTRATION : Consulter** sur une ferme de leur périmètre (profil ADMIN « Administrateur du programme » par défaut). Aucun salaire ni donnée RH. Chaque lecture est journalisée (lecture par un tiers).
- **Suspension** : `PUT /programme/farms/:farmId/team/:employmentId/active` avec `{ "active": false }` (ou `true` pour rétablir), réservé à **ADMINISTRATION : Administrer** (profil ADMIN par défaut) ou à l'administrateur plateforme. Seul l'accès à cette ferme est suspendu ; le compte et ses autres fermes ne changent pas. L'action est journalisée comme toute écriture. On ne suspend pas son propre accès.
- Un **nouveau code de connexion** pour un membre reste une action de l'administrateur plateforme (`POST /admin/users/:userId/login-code`), qui peut aussi suspendre le compte entier (`PATCH /admin/users/:userId/suspend`).

Le domaine EQUIPE de la matrice (lecture de l'équipe et des RH de la ferme, DGE par défaut) est distinct : il donne la consultation de l'écran Équipe/RH, pas la suspension.

Interface web : pas encore d'écran dédié dans le registre (à faire) ; les routes ci-dessus sont utilisables par l'API.
