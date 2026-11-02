import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { alternativeMoveFor, attackProfile, BASIC_ATTACK_DAMAGE_FACTOR, categoryForStats, CATEGORY_BASE, moveFor, MOVE_CATEGORY_LABELS_PT, MOVE_EFFECT_LABELS_PT, profileBars, rankedCategories } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
import { typesOfDex } from './species-filter';
import { survivorAttackChoices, survivorAttackOf } from './survivor-loadout';
import { createSurvivorState } from './survivor';

describe('golpes da Torre: elemento pelo tipo, forma e números pelos stats', () => {
  it('todo tipo tem um elemento com nome, efeito, cor e ícone', () => {
    for (const type of POKEMON_TYPES) {
      const move = moveFor([type], null);
      expect(move.type).toBe(type);
      expect(move.name.length).toBeGreaterThan(2);
      expect(MOVE_EFFECT_LABELS_PT[move.effect]).toBeTruthy();
      expect(MOVE_CATEGORY_LABELS_PT[move.category]).toBeTruthy();
      expect(move.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(move.icon).toBeTruthy();
    }
  });

  it('a forma vem da afinidade dos seis stats reais: Alakazam Rajada, Pikachu Teleporte, Snorlax Aura e Onix Órbita', () => {
    expect(categoryForStats(statsOfDex(65)!)).toBe('rapido');
    expect(categoryForStats(statsOfDex(25)!)).toBe('teleporte');
    expect(categoryForStats(statsOfDex(143)!)).toBe('aura');
    expect(categoryForStats(statsOfDex(95)!)).toBe('orbit');
    expect(moveFor(['electric'], statsOfDex(25)).name).toBe('Faísca');
  });

  it('só o 1º tipo define o elemento; a forma não muda com tipo, e sem stats é projétil estimado', () => {
    expect(moveFor(['fire', 'flying'], null).name).toBe('Bola de fogo');
    expect(moveFor([], null).type).toBe('normal');
    expect(moveFor(['water'], null)).toMatchObject({ category: 'projetil', estimated: true });
    expect(moveFor(['water'], statsOfDex(7)!).estimated).toBeUndefined();
    const s = { hp: 70, attack: 110, defense: 70, spAttack: 70, spDefense: 70, speed: 80 };
    expect(moveFor(['fighting'], s).category).toBe(moveFor(['water'], s).category);
  });

  it('diferencia Cone físico ágil e Órbita defensiva móvel, sem consultar tipo', () => {
    expect(categoryForStats({ hp: 70, attack: 110, defense: 70, spAttack: 70, spDefense: 70, speed: 80 })).toBe('cone');
    expect(categoryForStats({ hp: 100, attack: 65, defense: 100, spAttack: 65, spDefense: 100, speed: 75 })).toBe('orbit');
    expect(moveFor(['bug'], null).category).toBe('projetil');
    expect(CATEGORY_BASE.cone.damage).toBeLessThan(CATEGORY_BASE.area.damage);
    expect(CATEGORY_BASE.orbit.cooldownMs).toBeGreaterThan(CATEGORY_BASE.aura.cooldownMs);
    expect(CATEGORY_BASE.foco.cooldownMs).toBe(3900); // um terço da cadência anterior
  });

  it('reduz pela metade o dano dos ataques automáticos', () => {
    const stats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
    const profile = attackProfile({ ...moveFor(['normal'], stats), category: 'projetil' }, stats);
    expect(BASIC_ATTACK_DAMAGE_FACTOR).toBe(0.5);
    expect(profile.damage).toBe(CATEGORY_BASE.projetil.damage * 1.2 * BASIC_ATTACK_DAMAGE_FACTOR);
  });

  it('compara estilos nos mesmos stats e dá retorno compatível à exposição dos golpes próximos', () => {
    const stats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
    const dps = (category: 'projetil' | 'aura' | 'area' | 'cone' | 'orbit') => {
      const move = { ...moveFor([], stats), category };
      const profile = attackProfile(move, stats);
      return profile.damage * 1000 / profile.cooldownMs;
    };
    // DPS em um único alvo alcançado continuamente, sem contar efeitos, área multi-alvo nem movimento.
    // São valores de referência matemática; partidas reais ainda precisam validar se a exposição é justa.
    expect(dps('aura')).toBeGreaterThanOrEqual(dps('projetil') * 0.84);
    expect(dps('orbit')).toBeGreaterThanOrEqual(dps('projetil') * 0.8);
    expect(dps('cone')).toBeGreaterThanOrEqual(dps('projetil') * 0.82);
    expect(dps('area')).toBeLessThan(dps('projetil'));
  });

  it('o elemento só modifica dano/efeito; não escolhe a forma', () => {
    const stats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
    const normal = attackProfile({ ...moveFor(['normal'], stats), category: 'orbit' }, stats).damage;
    expect(attackProfile({ ...moveFor(['bug'], stats), category: 'orbit' }, stats).damage).toBe(normal);
    expect(attackProfile({ ...moveFor(['grass'], stats), category: 'orbit' }, stats).damage).toBeGreaterThan(normal);
    expect(attackProfile({ ...moveFor(['ice'], stats), category: 'projetil' }, stats).damage).toBeGreaterThan(attackProfile({ ...moveFor(['normal'], stats), category: 'projetil' }, stats).damage);
    expect(attackProfile({ ...moveFor(['fighting'], stats), category: 'cone' }, stats).damage).toBeGreaterThan(normal);
    // O cone acerta uma linha e a área só 15% nos alvos secundários: o golpe do cone pode passar um pouco do da área, mas não 20%.
    const area = attackProfile({ ...moveFor(['normal'], stats), category: 'area' }, stats).damage;
    expect(attackProfile(moveFor(['fighting'], stats), stats).damage).toBeLessThan(area * 1.2);
  });

  it('os números seguem os stats: rápido recarrega antes, Atq. Esp. alto bate mais, HP alto tem mais vida', () => {
    const alakazam = attackProfile({ ...moveFor(['psychic'], statsOfDex(65)), category: 'projetil' }, statsOfDex(65));
    const slowbro = attackProfile({ ...moveFor(['water'], null), category: 'projetil' }, statsOfDex(80));
    expect(alakazam.damage).toBeGreaterThan(slowbro.damage);
    expect(alakazam.cooldownMs).toBeLessThan(slowbro.cooldownMs);
    const snorlax = attackProfile(moveFor(['normal'], statsOfDex(143)), statsOfDex(143));
    expect(snorlax.maxHp).toBeGreaterThan(alakazam.maxHp);
    const onix = attackProfile(moveFor(['rock'], statsOfDex(95)), statsOfDex(95));
    expect(onix.radius).toBeGreaterThan(snorlax.radius); // Defesa 160 contra 65
  });

  it('nenhum Pokémon fica com números absurdos (limites)', () => {
    for (let dex = 1; dex <= 1025; dex++) {
      const stats = statsOfDex(dex);
      expect(stats).not.toBeNull();
      const p = attackProfile(moveFor(['normal'], stats), stats);
      expect(p.maxHp).toBeGreaterThanOrEqual(80);
      expect(p.maxHp).toBeLessThanOrEqual(160);
      expect(p.cooldownMs).toBeGreaterThan(300);
      expect(p.damage).toBeGreaterThan(1.5);
    }
  });

  it('classifica as 1.025 espécies por stats, com distribuição concreta e sem influência do tipo', () => {
    const counts: Record<MoveCategory, number> = { projetil: 0, aura: 0, area: 0, cone: 0, orbit: 0, foco: 0, rapido: 0, teleporte: 0 };
    for (let dex = 1; dex <= 1025; dex++) {
      const stats = statsOfDex(dex)!;
      const types = typesOfDex(dex);
      const category = moveFor(types, stats).category;
      expect(category).toBe(categoryForStats(stats));
      // Trocar apenas o elemento não pode alterar a forma definida pelos atributos.
      expect(moveFor(['normal'], stats).category).toBe(category);
      counts[category]++;
    }
    expect(counts).toEqual({ projetil: 155, aura: 122, area: 154, cone: 122, orbit: 122, foco: 122, rapido: 122, teleporte: 106 });
  });

  it('as barras da tela de escolha ficam entre 0 e 1', () => {
    const move = moveFor(['electric'], statsOfDex(25));
    for (const bar of profileBars(move, attackProfile(move, statsOfDex(25)))) {
      expect(bar.value).toBeGreaterThanOrEqual(0);
      expect(bar.value).toBeLessThanOrEqual(1);
    }
  });
});

describe('ataque alternativo: a forma mais próxima depois de eliminar a principal', () => {
  it('a primeira forma do ranking é sempre a que a classificação já escolhe, em todas as espécies', () => {
    for (let dex = 1; dex <= 1025; dex++) {
      const types = typesOfDex(dex);
      const stats = statsOfDex(dex);
      const ranking = rankedCategories(types[0] ?? 'normal', stats);
      expect(ranking[0]).toBe(moveFor(types, stats).category);
      expect(alternativeMoveFor(types, stats).category).toBe(ranking[1]);
      expect(new Set(ranking).size).toBe(ranking.length);
      expect(ranking.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('o alternativo nunca repete a forma principal e só troca de tipo quando há um segundo tipo', () => {
    const seen = new Set<MoveCategory>();
    for (let dex = 1; dex <= 1025; dex++) {
      const types = typesOfDex(dex);
      const stats = statsOfDex(dex);
      const main = moveFor(types, stats);
      const alternative = alternativeMoveFor(types, stats);
      expect(alternative.category).not.toBe(main.category);
      expect(alternative.type).toBe(types.find((type) => type !== (types[0] ?? 'normal')) ?? main.type);
      seen.add(alternative.category);
    }
    // Todas as formas aparecem como alternativa em algum Pokémon; a posição vem somente dos stats.
    expect(seen.has('aura') && seen.has('projetil') && seen.has('area')).toBe(true);
  });

  it('exemplos conhecidos obedecem só aos stats também na alternativa', () => {
    expect(alternativeMoveFor(typesOfDex(143), statsOfDex(143)).category).toBe('foco');
    expect(alternativeMoveFor(typesOfDex(25), statsOfDex(25)).category).toBe('rapido');
    expect(moveFor(typesOfDex(106), statsOfDex(106)).category).toBe('cone');
    expect(alternativeMoveFor(typesOfDex(106), statsOfDex(106)).category).toBe('teleporte');
    expect(moveFor(typesOfDex(68), statsOfDex(68)).category).toBe('area');
    expect(alternativeMoveFor(typesOfDex(68), statsOfDex(68)).category).toBe('foco');
  });

  it('sem stats a classificação cai em Projétil e o alternativo em Área', () => {
    expect(rankedCategories('normal', null)).toEqual(['projetil', 'area', 'aura']);
    expect(alternativeMoveFor(['fire'], null)).toMatchObject({ type: 'fire', category: 'area', estimated: true });
  });

  it('trocar: o alternativo vira o principal, o antigo vira o segundo ataque e a Mistura vem do tipo antigo', () => {
    // Charizard: Fogo/Voador.
    const kept = survivorAttackOf(6);
    const swapped = survivorAttackOf(6, undefined, true);
    const choices = survivorAttackChoices(6);
    expect(swapped.move).toEqual(choices.alternative.move);
    expect(swapped.profile).toEqual(choices.alternative.profile);
    expect(kept.move).toEqual(choices.current.move);
    expect(swapped.move.type).toBe('flying');
    expect(swapped.secondMove).toEqual(kept.move);
    expect(swapped.hypotheticalSecondaryType).toBe('fire');
    const state = createSurvivorState(7, { kindCount: 1, move: swapped.move, profile: swapped.profile, ...(swapped.secondMove ? { secondMove: swapped.secondMove } : {}), ...(swapped.hypotheticalSecondaryType ? { hypotheticalSecondaryType: swapped.hypotheticalSecondaryType } : {}) });
    expect(state.player.move.type).toBe('flying');
    expect(state.hypotheticalSecondaryType).toBe('fire');
    expect(state.secondMoveCandidate).toEqual(kept.move);
  });

  it('trocar num Pokémon de um tipo só muda a forma e mantém a Mistura da semente', () => {
    // Snorlax: Normal.
    const swapped = survivorAttackOf(143, undefined, true);
    expect(swapped.move.type).toBe('normal');
    expect(swapped.move.category).toBe('foco');
    expect(swapped.hypotheticalSecondaryType).toBeUndefined();
    expect(swapped.secondMove).toEqual(survivorAttackOf(143).move);
  });

  it('Sintonia Ômega troca só a forma, preserva o tipo escolhido e guarda o golpe natural como secundário', () => {
    const tuned = survivorAttackOf(25, 'electric', false, 'aura');
    expect(tuned.move).toMatchObject({ type: 'electric', category: 'aura' });
    expect(tuned.secondMove).toEqual(survivorAttackOf(25, 'electric').move);
    expect(tuned.hypotheticalSecondaryType).toBeUndefined();
  });

  it('com o tipo escolhido na tela de dois tipos, o ranking parte do tipo escolhido', () => {
    const flying = survivorAttackChoices(6, 'flying');
    expect(flying.current.move.type).toBe('flying');
    expect(flying.alternative.move.type).toBe('fire');
  });
});
