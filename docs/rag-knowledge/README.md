# Koukou RAG — corpus de connaissances avicoles

Base de connaissances métier de Koukou Ferme, destinée à alimenter un RAG
personnel qui répond aux conseils d'élevage **à partir des données de la ferme**
(saisies journalières, stocks, alertes, référentiels). Depuis la phase
Agriculture, elle couvre aussi les cultures et les parcelles.

## Comment utiliser ce corpus

- **Découpage conseillé** : un fichier = un domaine. Découper chaque fichier en
  paragraphes/blocs sémantiques de ~300–600 caractères avant indexation.
- **Ne jamais donner un chiffre de seuil sans son contexte** (constante de
  référence, fenêtre de calcul, périmètre lot vs bâtiment).
- L'application **n'est jamais bloquante** : tout est « advisory » (conseil
  + traçage + recommandation) ; la décision revient à l'éleveur.
- Les seuils servent d'abord de repères pour l'éleveur ; les vraies alertes
  sont calculées côté serveur dans `AdvisoryEngine` (constantes ajustables via
  `reference-constants`, PROPRIETAIRE/ADMIN en lecture).

## Sommaire

| Fichier | Domaine |
|---|---|
| `01-eau.md` | Eau : l'indicateur n°1. Chute d'eau, L/oiseau/j, ratio eau/aliment |
| `02-alimentation.md` | Provende : phases, FEFO, autonomie, achat externe, IPE/GMQ |
| `03-oeufs.md` | Ponte : alvéoles, écarts, taux de ponte, vendables |
| `04-poids.md` | Pesée : échantillon, GMQ, objectif souche, écarts |
| `05-mortalite.md` | Morts : taux journalier, seuils, tendance 7 jours |
| `06-sante.md` | Signaux combinés, chaleur/THI, densité, vide sanitaire, biosécurité |
| `07-especes.md` | Espèces & souches, poids jour 1, courbes de référence |
| `08-donnees-ferme.md` | Modèle de données : saisies, stock, alertes, logique de l'écran "Saisie du jour" |
| `09-cultures.md` | Agriculture — référentiel des cultures : catégories, cycle, eau, routes |
| `10-parcelles.md` | Agriculture — parcelles : statuts, surface (PostGIS optionnel), carte, droits |

## Règles transverses

1. **L'eau est le premier indicateur de santé.** Toute baisse d'eau sans cause
   (abreuvoir, matériel) chez des volailles est le premier signal d'un problème.
2. **Toutes les dates se comparent en UTC** (`YYYY-MM-DD`), jamais en
   heure locale.
3. **Un lot = une saisie par jour** (contrainte d'unicité `(batch, entryDate)`).
   Re-saisir une date met à jour la saisie existante.
4. **2 unités d'aliment** : kg ou sacs (1 sac = 50 kg par défaut).
5. **Le stock ne peut jamais être négatif** et la consommation est affectée en
   **FEFO** (First Expire, First Out).
6. Tout montant est en **FCFA entier** ; l'argent et les ventes ne font pas
   partie des saisies du jour (POS/caisse).