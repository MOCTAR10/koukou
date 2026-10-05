/**
 * Nature de l'activité du client (fixée par l'éleveur), distincte du
 * `segment` (NOUVEAU/REGULIER/TOP) qui est calculé côté serveur.
 * Colonne varchar : l'ajout futur d'un type ne requiert aucune migration.
 */
export enum CustomerType {
  PARTICULIER = 'PARTICULIER',
  RESTAURANT = 'RESTAURANT',
  HOTEL = 'HOTEL',
  EVENEMENT = 'EVENEMENT',
  TRAITEUR = 'TRAITEUR',
  COMMERCE = 'COMMERCE',
  REVENDEUR = 'REVENDEUR',
  GROSSISTE = 'GROSSISTE',
  BOULANGERIE = 'BOULANGERIE',
  COLLECTIVITE = 'COLLECTIVITE',
  ENTREPRISE = 'ENTREPRISE',
  ELEVEUR = 'ELEVEUR',
  ONG = 'ONG',
  TRANSFORMATEUR = 'TRANSFORMATEUR',
}