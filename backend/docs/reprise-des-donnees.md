# Reprise des données — procédure (POUFA, lot L8)

Cette procédure décrit comment reprendre dans Fermia les données existantes du programme : fiches des fermes issues des formulaires AMI, fiches d'élevage (papier ou Excel) et export de l'outil transitoire. Toutes les reprises suivent le même circuit, contrôlé et tracé, et peuvent être relancées sans créer de doublon.

## 1. Préparer le fichier

- Téléchargez le modèle du type de reprise (`GET /programme/imports/templates/:type`). Chaque modèle contient la ligne d'en-tête et une ligne d'exemple :
  - `AMI` : `modele-reprise-ami.csv`, une ligne par ferme. Seuls `nom` et `province` sont obligatoires.
  - `BANDES_HISTORIQUES` : `modele-reprise-bandes.csv`, une ligne par saisie journalière. Les colonnes de la bande sont soit répétées sur chaque ligne, soit portées par la première ligne de la bande. Sont obligatoires `ref_bande`, la ferme (`code_ferme` ou `ref_ami`), `date_mise_en_place` et `effectif_initial`.
  - `OUTIL_TRANSITOIRE` : `modele-reprise-outil-transitoire.csv`. Il fonctionne comme le précédent, avec l'identifiant de bande de l'outil (`id_bande_outil`). La ferme est retrouvée par son code POUFA, ou à défaut par son nom et sa province.
- Le fichier est un CSV dont le séparateur est `,` ou `;`, encodé en UTF-8 ou en Latin-1 (l'enregistrement « CSV » d'Excel convient). Une même reprise accepte au plus 5 000 lignes et un fichier de 5 Mo.
- Les classeurs Excel `.xlsx` et `.xlsm` sont lus directement : seule la première feuille est prise, les cellules telles qu'affichées et les dates au format `aaaa-mm-jj` (`src/modules/data-import/import-file-readers.ts`). Les anciens formats `.xls` et `.ods` sont refusés avec un message clair : enregistrez la feuille en `.xlsx` ou en CSV avant le dépôt.
- Les dates s'écrivent `jj/mm/aaaa` ou `aaaa-mm-jj`. Pour les nombres décimaux, la virgule et le point sont tous deux acceptés.
- Les colonnes peuvent porter d'autres noms courants (« Nom de la ferme », « N° bande », « Mortalité »…), qui sont reconnus automatiquement. Une colonne inconnue est ignorée et signalée.

## 2. Déposer et analyser

`POST /programme/imports` (fichier `file`, `type`, `note` facultative).

- Le fichier est conservé ligne à ligne dans une zone de transit, avec son empreinte SHA-256. Rien n'est encore écrit au registre.
- Les contrôles s'exécutent aussitôt et le dossier passe à l'état **Contrôlé**. Si les colonnes obligatoires ne sont pas trouvées, le dossier reste à l'état **Analysé** : il faut alors indiquer la correspondance des colonnes (`PUT …/:id/settings`).
- Les contrôles portent sur les points suivants :
  - **Doublons** : ils suivent les mêmes règles que le registre (référence AMI unique, nom proche dans la même province, téléphone, GPS…). Un doublon probable est refusé, sauf si l'option `confirmDuplicate` est cochée.
  - **Données de référence** : province, localité, cohorte, statut, souche ou bâtiment inconnus.
  - **Effectifs** : effectif hors bornes ou supérieur à la capacité (avertissement), morts cumulés supérieurs à l'effectif, sujets pesés plus nombreux que les vivants.
  - **Dates** : date future ou antérieure à 2000, saisie antérieure à la mise en place ou postérieure à la clôture, même jour saisi deux fois.
  - **Bandes déjà reprises** : seuls les nouveaux jours seront ajoutés.
- Chaque ligne reçoit un état (valide, avertissement, erreur, exclue) et le motif en français. Consultez-les avec `GET …/:id/rows?status=ERREUR`.

## 3. Corriger

`PATCH …/:id/rows/:line` permet soit de corriger une valeur (`values`), soit d'exclure la ligne (`exclude: true`). Un motif d'au moins 5 caractères est obligatoire. Chaque correction est conservée sur la ligne, avec son auteur, son motif et les valeurs avant et après, et figure au rapport. Les contrôles sont rejoués après chaque correction.

Sur une bande, une seule ligne en erreur suffit à écarter la bande entière tant qu'elle n'est pas corrigée ou exclue.

## 4. Essai à blanc

`POST …/:id/dry-run` exécute toute la reprise puis l'annule. Le dossier passe à l'état **Essai** : chaque ligne indique ce qui serait fait (créée, complétée, déjà présente, rejetée) et le rapport d'essai est disponible.

Toute correction ultérieure ramène le dossier à l'état **Contrôlé** et oblige à refaire l'essai.

## 5. Validation

`POST …/:id/validate` (commentaire facultatif) est réservé aux profils titulaires du droit **Registre : Valider**, par défaut la DGE. La validation n'est possible qu'après un essai à blanc.

## 6. Intégration

`POST …/:id/integrate` intègre la reprise en une seule transaction.

**Fermes (AMI)**
- Une ferme nouvelle est créée au registre, avec son code `G1-0012`.
- Pour une ferme déjà présente, seuls les champs vides sont complétés. Une valeur différente de celle du registre n'est jamais écrasée : elle est signalée. Le statut n'est jamais repris.

**Bandes**
- La bande est ouverte à sa date de mise en place, en J+x selon l'âge initial.
- Chaque jour est saisi en mode rattrapage. L'aliment historique ne touche pas le stock et le prix des poussins n'est pas passé en dépense.
- La bande est clôturée à la date de clôture si elle est indiquée. Une bande vidée par la mortalité est clôturée au dernier jour saisi.
- Une bande est intégrée entièrement ou pas du tout.

**Clés de reprise**

La clé de reprise (référence AMI, ou code ferme et numéro de bande) est conservée. Relancer le même fichier, ou une version complétée, ne crée donc aucun doublon : les lignes déjà reprises sont marquées « déjà présente ».

**Rejet**

`POST …/:id/reject` (motif obligatoire) abandonne le dossier à tout moment avant son intégration.

## 7. Rapport de reprise

- `GET …/:id/report` donne le rapport en JSON. Il compte les lignes lues, intégrées, complétées, déjà présentes, rejetées avec leur motif et corrigées à la main, et liste les fermes et bandes créées.
- `…/report/pdf` donne le rapport à signer, avec un bloc de visa de l'opérateur et de la DGE.
- `…/report/csv` donne le détail ligne à ligne.
- Chaque rapport porte une **empreinte** SHA-256, imprimée sur le PDF et renvoyée dans l'en-tête `X-Report-Fingerprint`. Elle permet de vérifier que le document signé correspond aux données.
- Chaque téléchargement est journalisé.

## Droits

- Toutes les routes relèvent du domaine **Registre**.
- Une institution doit avoir une portée **nationale**.
- Les droits nécessaires à chaque action sont les suivants :

| Action | Droit |
|---|---|
| Consulter | Registre : Consulter |
| Déposer, faire l'essai à blanc, intégrer | Registre : Créer |
| Paramétrer les colonnes, corriger, rejeter | Registre : Modifier |
| Valider | Registre : Valider |

L'administrateur de la plateforme a tous les droits.

## Ce qui n'est pas repris

- Les sorties et les ventes des bandes historiques ne sont pas reprises : seuls la mise en place, les saisies journalières et la clôture le sont.
- La lecture directe des classeurs Excel est prévue dans une version suivante.
