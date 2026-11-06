# Livraisons d'intrants dans l'historique du lot (POUFA, CDC §6.1 T2)

L'historique d'élevage d'un lot (`GET /farms/:farmId/trace/lots/:lotId`, chronologie `rearing`) liste les livraisons d'intrants **confirmées** par l'éleveur (type `INTRANT`). Une livraison n'apparaît que dans **une seule bande au plus**, selon cette règle (code : `src/modules/trace/delivery-attribution.ts`, règle pure et testée, appelée par `trace-history.service.ts`) :

1. **Livraison rattachée à une bande** (`band_id`, choisi à l'enregistrement ou plus tard par `PUT /farms/:farmId/input-deliveries/:id/band`) : elle apparaît dans cette bande, et seulement dans celle-ci.
2. **Livraison sans bande** : on regarde les bandes de la ferme **ouvertes le jour de la réception** (mises en place ce jour-là ou avant, et pas clôturées avant ce jour) :
   - **une seule** bande ouverte : la livraison lui revient ;
   - **plusieurs** bandes ouvertes : la livraison revient à la bande dont les saisies journalières ont consommé l'aliment des lots de stock créés par cette livraison, **si une seule** de ces bandes l'a fait.
3. **Sinon** (aucune bande ouverte ce jour-là, ou plusieurs bandes possibles) : la livraison n'apparaît dans **aucune** bande. Elle reste visible dans la liste des livraisons de la ferme ; l'éleveur peut la rattacher à une bande en cours (`PUT …/band`), ce qui la fait apparaître dans l'historique de cette bande (étape 1).

Jour de réception = date de réception saisie par l'éleveur, sinon le jour de la confirmation. Une bande clôturée sans date de clôture enregistrée (données anciennes) est considérée close le jour de sa dernière modification.

Pourquoi cette règle : avant le lot A2, une livraison sans bande s'affichait dans chaque bande ouverte pendant la période, ce qui comptait plusieurs fois le même intrant sur une ferme à bandes simultanées. Rattacher d'office à la bande la plus récente aurait pu attribuer à tort l'aliment d'une bande à une autre ; la règle ne devine donc pas quand le doute subsiste. *À valider DGE.*
