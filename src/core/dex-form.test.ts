import { describe, expect, it } from 'vitest';
import { formDexId, REGION_FORM_IDS, regionOfName, spriteIdOf, spriteKeyIsFor } from './dex-form';

describe('formas regionais', () => {
  it('lê a região no nome da carta em inglês e em português', () => {
    expect(regionOfName('Galarian Ponyta')).toBe('galar');
    expect(regionOfName('Ponyta de Galar')).toBe('galar');
    expect(regionOfName('Alolan Raichu')).toBe('alola');
    expect(regionOfName('Raichu de Alola')).toBe('alola');
    expect(regionOfName('Hisuian Growlithe')).toBe('hisui');
    expect(regionOfName('Growlithe de Hisui')).toBe('hisui');
    expect(regionOfName('Paldean Wooper')).toBe('paldea');
    expect(regionOfName('Pikachu')).toBeNull();
    expect(regionOfName('Galarica Wreath')).toBeNull();
  });

  it('troca o número da espécie pelo da forma só quando há forma', () => {
    expect(formDexId(77, 'Galarian Ponyta')).toBe(10162);
    expect(formDexId(77, 'Ponyta')).toBe(77);
    expect(formDexId(26, 'Alolan Raichu')).toBe(10100);
    // Ponyta não tem forma de Alola: continua a espécie comum.
    expect(formDexId(77, 'Alolan Ponyta')).toBe(77);
    expect(formDexId(25, 'Galarian Pikachu')).toBe(25);
    expect(formDexId(77, undefined)).toBe(77);
  });

  it('a tabela só tem ids de forma (acima de 10000) e regiões conhecidas', () => {
    for (const forms of Object.values(REGION_FORM_IDS)) {
      for (const [region, id] of Object.entries(forms)) {
        expect(['alola', 'galar', 'hisui', 'paldea']).toContain(region);
        expect(id).toBeGreaterThan(10000);
      }
    }
    expect(Object.keys(REGION_FORM_IDS).length).toBeGreaterThanOrEqual(45);
  });

  it('reconhece se o sprite guardado é o do id', () => {
    expect(spriteKeyIsFor('https://x/other/showdown/77.gif', 77)).toBe(true);
    expect(spriteKeyIsFor('https://x/other/showdown/77.gif', 10162)).toBe(false);
    expect(spriteKeyIsFor('https://x/sprites/pokemon/10162.png', 10162)).toBe(true);
    expect(spriteKeyIsFor('https://x/other/showdown/10162.gif?v=2', 10162)).toBe(true);
    expect(spriteKeyIsFor(undefined, 77)).toBe(false);
  });

  it('o id de uma carta junta número e nome', () => {
    expect(spriteIdOf({ dexIds: [77], name: 'Galarian Ponyta' })).toBe(10162);
    expect(spriteIdOf({ dexIds: [], name: 'Potion' })).toBeUndefined();
  });
});
