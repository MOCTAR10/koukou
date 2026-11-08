import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSSARY_KEYS, IC_OFFICIEL_LABEL, IC_TECHNIQUE_LABEL, costPerKgSoldView } from './glossary';

describe('glossaire', () => {
  it('définit chaque indicateur affiché', () => {
    for (const k of ['ic_officiel', 'ic_technique', 'gmq', 'ipe', 'mortalite', 'viabilite', 'taux_ponte', 'autonomie_provende', 'rendement_carcasse', 'vide_sanitaire', 'classe_biosecurite', 'cout_kg_vendu', 'cout_kg_produit']) {
      expect(GLOSSARY_KEYS).toContain(k);
    }
    for (const key of GLOSSARY_KEYS) {
      expect(GLOSSARY[key].term.length).toBeGreaterThan(2);
      expect(GLOSSARY[key].definition.length).toBeGreaterThan(20);
    }
  });
  it('distingue les deux IC', () => {
    expect(IC_OFFICIEL_LABEL).not.toBe(IC_TECHNIQUE_LABEL);
    expect(GLOSSARY.ic_officiel.formula).toContain('poids vif produit');
    expect(GLOSSARY.ic_technique.formula).toContain('morts');
  });
  it('coût par kg vendu : non applicable sans vente au kilo', () => {
    expect(costPerKgSoldView(1200, 50).applicable).toBe(true);
    expect(costPerKgSoldView(null, 0).note).toContain('vente à l’unité');
    expect(costPerKgSoldView(1200, 0).applicable).toBe(false);
  });
});
