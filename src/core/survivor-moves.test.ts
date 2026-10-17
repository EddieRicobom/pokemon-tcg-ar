import { describe, expect, it } from 'vitest';
import { POKEMON_TYPES } from './pokemon-data';
import { attackProfile, categoryForStats, moveFor, MOVE_CATEGORY_LABELS_PT, MOVE_EFFECT_LABELS_PT, profileBars } from './survivor-moves';
import { statsOfDex } from './survivor-stats';

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

  it('a forma vem dos stats reais: Alakazam projétil, Pikachu área, Snorlax e Onix aura', () => {
    expect(categoryForStats(statsOfDex(65)!)).toBe('projetil');
    expect(categoryForStats(statsOfDex(25)!)).toBe('area');
    expect(categoryForStats(statsOfDex(143)!)).toBe('aura');
    expect(categoryForStats(statsOfDex(95)!)).toBe('aura');
    expect(moveFor(['electric'], statsOfDex(25)).name).toBe('Faísca');
  });

  it('só o 1º tipo conta; sem tipo é Normal; sem stats é projétil marcado como estimado', () => {
    expect(moveFor(['fire', 'flying'], null).name).toBe('Bola de fogo');
    expect(moveFor([], null).type).toBe('normal');
    expect(moveFor(['water'], null)).toMatchObject({ category: 'projetil', estimated: true });
    expect(moveFor(['water'], statsOfDex(7)!).estimated).toBeUndefined();
  });

  it('os números seguem os stats: rápido recarrega antes, Atq. Esp. alto bate mais, HP alto tem mais vida', () => {
    const alakazam = attackProfile(moveFor(['psychic'], statsOfDex(65)), statsOfDex(65));
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
      expect(p.damage).toBeGreaterThan(3);
    }
  });

  it('as barras da tela de escolha ficam entre 0 e 1', () => {
    const move = moveFor(['electric'], statsOfDex(25));
    for (const bar of profileBars(move, attackProfile(move, statsOfDex(25)))) {
      expect(bar.value).toBeGreaterThanOrEqual(0);
      expect(bar.value).toBeLessThanOrEqual(1);
    }
  });
});
