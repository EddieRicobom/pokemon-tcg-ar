import { describe, expect, it } from 'vitest';
import { ARCHETYPES, archetypesOf, evolutionStage, teamArchetypes } from './archetypes';
import { normalizeTraits, traitsFromTcgdex } from './card-traits';

describe('tabela de arquétipos', () => {
  it('tem dezenas de arquétipos com ids únicos e estáveis', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(ARCHETYPES.map((x) => x.id)).size).toBe(ARCHETYPES.length);
    for (const x of ARCHETYPES) expect(x.id).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('detecção', () => {
  it('carta antiga (sem detalhes): sai do nome, raridade, coleção e espécie', () => {
    const ids = archetypesOf({ dexId: 6, name: 'Charizard', rarity: 'Rare Holo', setId: 'base1', setName: 'Base Set', localId: '4', setOfficial: 102 });
    expect(ids).toEqual(expect.arrayContaining(['tipo-fire', 'tipo-flying', 'dois-tipos', 'inicial', 'estagio-2', 'final', 'regiao-kanto', 'holo', 'rara', 'classica-wotc', 'carta-fisica']));
    expect(ids).not.toContain('digital');
  });

  it('mecânicas modernas pelo nome e pelos detalhes do TCGdex', () => {
    expect(archetypesOf({ dexId: 892, name: 'Single Strike Urshifu VMAX', setId: 'swsh5' })).toEqual(expect.arrayContaining(['vmax', 'golpe-unico', 'lendario']));
    expect(archetypesOf({ dexId: 25, name: 'Pikachu V', setId: 'swsh4' })).toContain('v');
    expect(archetypesOf({ dexId: 6, name: 'Charizard ex', setId: 'sv03', rarity: 'Special illustration rare' })).toEqual(expect.arrayContaining(['ex-moderno', 'ilustracao-especial', 'full-art']));
    expect(archetypesOf({ dexId: 6, name: 'Charizard', traits: { suffix: 'VSTAR', stage: 'VSTAR' } })).toContain('vstar');
    expect(archetypesOf({ dexId: 445, name: 'Garchomp & Giratina-GX', setId: 'sm12' })).toContain('tag-team');
    expect(archetypesOf({ dexId: 150, name: 'Mewtwo-EX', setId: 'bw4' })).toContain('ex-maiusculo');
    expect(archetypesOf({ dexId: 6, name: 'Radiant Charizard', setId: 'pgo' })).toContain('radiante');
    expect(archetypesOf({ dexId: 74, name: "Brock's Geodude", setId: 'gym1' })).toContain('treinador-dono');
  });

  it('número secreto e galeria vêm do número da carta', () => {
    expect(archetypesOf({ dexId: 25, name: 'Pikachu', localId: '120', setOfficial: 102 })).toContain('secreta');
    expect(archetypesOf({ dexId: 25, name: 'Pikachu', localId: 'TG05', setOfficial: 189 })).toContain('galeria');
  });

  it('Digital Pokémon ganha só espécie, stats e «Digital»', () => {
    const ids = archetypesOf({ dexId: 149, digital: true, shiny: true });
    expect(ids).toEqual(expect.arrayContaining(['digital', 'shiny', 'tipo-dragon', 'pseudo-lendario', 'estagio-2', 'atacante-fisico']));
    expect(ids).not.toContain('carta-fisica');
    expect(ARCHETYPES.filter((x) => ids.includes(x.id)).every((x) => x.source !== 'carta')).toBe(true);
  });

  it('bebês não contam como estágio (Pikachu é Básico, Raichu é Estágio 1)', () => {
    expect(evolutionStage(25)).toBe(0);
    expect(evolutionStage(26)).toBe(1);
    expect(archetypesOf({ dexId: 172, digital: true })).toContain('bebe');
  });

  it('conta arquétipos em comum numa equipe (base dos bônus futuros)', () => {
    const team = teamArchetypes([{ dexId: 4, digital: true }, { dexId: 6, name: 'Charizard', setId: 'base1' }]);
    expect(team.find((t) => t.id === 'tipo-fire')?.count).toBe(2);
    expect(team.find((t) => t.id === 'inicial')?.count).toBe(2);
  });
});

describe('detalhes da carta (TCGdex)', () => {
  it('lê só o que a fonte manda e ignora lixo', () => {
    const t = traitsFromTcgdex({ category: 'Pokemon', hp: 330, types: ['Fire'], stage: 'VMAX', suffix: 'VMAX', attacks: [{ damage: '300+' }, { damage: 30 }], abilities: [] , regulationMark: 'E' });
    expect(t).toEqual({ category: 'Pokemon', hp: 330, types: ['Fire'], stage: 'VMAX', suffix: 'VMAX', attackCount: 2, maxDamage: 300, abilityCount: 0, regulationMark: 'E' });
    expect(traitsFromTcgdex({})).toBeUndefined();
    expect(traitsFromTcgdex(null)).toBeUndefined();
    expect(normalizeTraits({ hp: -5, stage: 42, suffix: 'V' })).toEqual({ suffix: 'V' });
  });
});
