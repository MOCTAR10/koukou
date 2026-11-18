# Base réglementaire gabonaise des référentiels Fermia

Textes sur lesquels s'appuient les référentiels sanitaires et techniques (demande du jury : itinéraire technique, aliments, vaccins, maladies à surveillance obligatoire). Ils sont servis par la liste `TEXTE_REFERENCE` (`GET /programme/lists/TEXTE_REFERENCE`), tenue par les services vétérinaires comme les autres listes sanitaires.

| Code | Texte | Ce que Fermia en tire |
|---|---|---|
| `LOI_2_65` | Loi n° 2/65 du 5 juin 1965 organisant la police sanitaire en matière de maladies contagieuses du bétail | Art. 1er : maladies réputées contagieuses. Art. 2 : déclaration immédiate à la préfecture ou sous-préfecture, isolement des animaux atteints, suspects ou morts. Art. 3 : périmètre infecté, vaccination obligatoire par arrêté. Art. 4 : sanctions pour non-déclaration. |
| `DECRET_0190_2022` | Décret n° 0190/PR/MAA du 5 août 2022 (élevages avicoles) | Art. 4 : agrément technique au-delà de 500 volailles par bande. Art. 8 : plan de prophylaxie sanitaire et médicale, registres obligatoires. Art. 17 : vétérinaire désigné. Art. 19 : aliments, additifs et médicaments autorisés seulement, délais d'attente. Art. 20 : document d'origine des volailles. Art. 22 : élimination des cadavres. Art. 25 : lutte contre les rongeurs. |
| `DECRET_0578_2015` | Décret n° 0578/PR/MAEAMOPG du 26 novembre 2015 | Hygiène des établissements d'alimentation animale. Cité en référence ; texte intégral non consulté. |
| `LOI_001_2021` | Loi n° 001/2021 du 8 septembre 2021 (médicaments et produits vétérinaires) | Cadre des vaccins et médicaments. Citée en référence ; texte intégral non consulté. |
| `LOI_010_2021` | Loi n° 010/2021 (profession de vétérinaire) | Citée en référence ; texte intégral non consulté. |

Sources lues : [loi n° 2/65](https://faolex.fao.org/docs/pdf/gab88398.pdf), [décret n° 0190](https://faolex.fao.org/docs/pdf/gab233301.pdf) (FAOLEX), [note OMSA sur le cadre gabonais](https://rr-africa.woah.org/app/uploads/2023/02/poster-gabon-copie.pdf).

## Maladies à déclaration obligatoire (liste `MALADIE`)

La loi n° 2/65 (art. 1er) nomme pour les volailles : « la peste, la pseudo-peste, la typhose, la pullorose, la variole chez les animaux de basse-cour », « la tuberculose […] aviaire » et « la psittacose chez toutes les espèces d'oiseaux ». Le catalogue les reprend sous leur nom actuel, famille `DECLARATION_OBLIGATOIRE` :

| Code | Libellé | Terme de la loi |
|---|---|---|
| `INFLUENZA_AVIAIRE` | Influenza aviaire (grippe aviaire) | peste |
| `NEWCASTLE` | Maladie de Newcastle | pseudo-peste |
| `TYPHOSE` | Typhose aviaire | typhose |
| `PULLOROSE` | Pullorose | pullorose |
| `VARIOLE_AVIAIRE` | Variole aviaire | variole |
| `TUBERCULOSE_AVIAIRE` | Tuberculose aviaire | tuberculose aviaire |
| `PSITTACOSE` | Psittacose (ornithose) | psittacose |

Règle dans l'application : une déclaration sanitaire qui nomme une maladie de cette famille (`diseaseCode`) est toujours une suspicion et ouvre l'alerte sanitaire officielle, même si l'éleveur n'a pas coché « suspicion ». Les autres maladies du catalogue (Gumboro, bronchite infectieuse, Marek, coccidiose, coryza, colibacillose, mycoplasmose) sont de famille `AUTRE`.

## Limites

- Aucun texte gabonais trouvé ne fixe un calendrier vaccinal chiffré, des rations ou des valeurs nutritionnelles. Ces valeurs restent des références techniques proposées par Fermia, à valider et modifiables par les services vétérinaires et la DGE.
- Les arrêtés d'application du décret n° 0190 (art. 7, 13, 14) n'ont pas été trouvés en ligne.
- Un projet de Code zoosanitaire doit remplacer la loi n° 2/65 ; la liste `MALADIE` et la liste `TEXTE_REFERENCE` se mettent à jour sans changement de code quand il sera promulgué.
- Le catalogue semé est une proposition : les services vétérinaires le valident, le complètent ou désactivent des éléments.
