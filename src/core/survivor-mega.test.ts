import { describe, expect, it } from 'vitest';
import { createSurvivorState, stepSurvivor, survivorDefenseReduction } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import { statsOfDex } from './survivor-stats';
import { typesOfDex } from './species-filter';
import { emptyVillage } from './village/life';
import { ITEM_BY_ID, CRAFT_IDS } from './village/catalog';
import {
  endSurvivorMega,
  megaShardCount,
  settleMegaShard,
  survivorMegaCount,
  survivorMegaForm,
  survivorMegaForms,
  survivorMegaRemainingMs,
  survivorMegaStatDelta,
  SURVIVOR_MEGA_DURATION_MS,
  SURVIVOR_MEGA_ITEM,
  SURVIVOR_MEGA_REFUND_MS,
  takeMegaShard,
} from './survivor-mega';
import type { SurvivorMegaForm } from './survivor-mega';

function runFor(dexId: number, mega?: SurvivorMegaForm, megaDurationMs?: number) {
  const stats = statsOfDex(dexId);
  const move = moveFor(typesOfDex(dexId), stats);
  return createSurvivorState(7, { kindCount: 4, dexId, move, profile: attackProfile(move, stats), ...(mega ? { mega } : {}), ...(megaDurationMs ? { megaDurationMs } : {}) });
}

describe('formas Mega (dado da PokéAPI)', () => {
  it('traz as Megas com stats reais e as duas formas do Charizard', () => {
    expect(survivorMegaCount()).toBeGreaterThanOrEqual(48);
    const charizard = survivorMegaForms(6);
    expect(charizard.map((f) => f.label)).toEqual(['Mega Charizard X', 'Mega Charizard Y']);
    // Stats base da PokéAPI: Mega Charizard X 78/130/111/130/85/100; Y 78/104/78/159/115/100.
    expect(charizard[0]!.stats).toEqual({ hp: 78, attack: 130, defense: 111, spAttack: 130, spDefense: 85, speed: 100 });
    expect(charizard[1]!.stats.spAttack).toBe(159);
    expect(survivorMegaForm(charizard[0]!.formId)?.formName).toBe('charizard-mega-x');
  });

  it('espécie sem Mega não ganha a opção', () => {
    expect(survivorMegaForms(25)).toEqual([]);
    expect(survivorMegaForms(1)).toEqual([]);
  });

  it('toda forma tem espécie base com stats, nome legível e diz se tem sprite', () => {
    for (let dex = 1; dex <= 1025; dex++) {
      for (const form of survivorMegaForms(dex)) {
        expect(statsOfDex(form.dexId), form.formName).not.toBeNull();
        expect(form.formId).toBeGreaterThan(10000);
        expect(form.label.startsWith('Mega '), form.formName).toBe(true);
        expect(['animado', 'parado', 'nenhum']).toContain(form.sprite);
      }
    }
    expect(survivorMegaForms(678).map((f) => f.label)).toEqual(['Mega Meowstic (macho)', 'Mega Meowstic (fêmea)']);
  });

  it('a diferença de stats mostra só o que muda', () => {
    const delta = survivorMegaStatDelta(survivorMegaForms(6)[0]!);
    expect(delta.find((d) => d.stat === 'attack')?.delta).toBe(130 - 84);
    expect(delta.some((d) => d.stat === 'hp')).toBe(false);
  });
});

describe('Mega temporária na corrida', () => {
  const megaX = survivorMegaForms(6)[0]!;

  it('começa na forma Mega com os números dos stats da forma', () => {
    const normal = runFor(6);
    const mega = runFor(6, megaX);
    expect(mega.player.mega?.active).toBe(true);
    expect(mega.player.mega?.untilMs).toBe(SURVIVOR_MEGA_DURATION_MS);
    // Mega Charizard X tem Ataque e Defesa maiores: dano e raio sobem; vida igual (mesmo HP base).
    expect(mega.player.attackDamage).toBeGreaterThan(normal.player.attackDamage);
    expect(mega.player.maxHp).toBe(normal.player.maxHp);
    expect(survivorDefenseReduction(mega.player, 'contato')!).toBeGreaterThan(survivorDefenseReduction(normal.player, 'contato')!);
  });

  it('volta à forma normal quando o tempo acaba', () => {
    const normal = runFor(6);
    const state = runFor(6, megaX, 1_000);
    for (let i = 0; i < 80 && state.player.mega?.active; i++) stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(state.player.mega?.active).toBe(false);
    expect(survivorMegaRemainingMs(state)).toBe(0);
    expect(state.player.attackDamage).toBeCloseTo(normal.player.attackDamage, 0);
    expect(state.player.attackCooldownMs).toBe(normal.player.attackCooldownMs);
    expect(state.player.projectileSize).toBe(normal.player.projectileSize);
    expect(survivorDefenseReduction(state.player, 'contato')).toBe(survivorDefenseReduction(normal.player, 'contato'));
  });

  it('o tempo restante cai com o relógio da corrida', () => {
    const state = runFor(6, megaX);
    stepSurvivor(state, { dx: 0, dy: 0 }, 16);
    expect(survivorMegaRemainingMs(state)).toBe(SURVIVOR_MEGA_DURATION_MS - state.elapsedMs);
  });

  it('a vida mantém a fração ao entrar e sair', () => {
    const garchomp = survivorMegaForms(445)[0]!;
    const state = runFor(445, garchomp);
    const megaMax = state.player.maxHp;
    state.player.hp = Math.round(megaMax / 2);
    endSurvivorMega(state);
    expect(state.player.hp / state.player.maxHp).toBeCloseTo(0.5, 1);
    expect(endSurvivorMega(state)).toBe(false);
  });

  it('não aplica forma de outra espécie', () => {
    const state = runFor(25, megaX);
    expect(state.player.mega).toBeUndefined();
  });
});

describe('Fragmento de Megapedra', () => {
  it('é um item da Vila com nome em português e receita de fabricar', () => {
    const def = ITEM_BY_ID.get(SURVIVOR_MEGA_ITEM);
    expect(def?.name).toBe('Fragmento de Megapedra');
    expect(CRAFT_IDS).toContain(SURVIVOR_MEGA_ITEM);
    for (const part of Object.keys(def?.recipe ?? {})) expect(ITEM_BY_ID.has(part), part).toBe(true);
  });

  it('gasta 1 no começo e devolve em desistência logo no início', () => {
    const village = emptyVillage(1, { x: 0, y: 0 });
    expect(takeMegaShard(village)).toBe(false);
    village.inventory[SURVIVOR_MEGA_ITEM] = 2;
    expect(takeMegaShard(village)).toBe(true);
    expect(megaShardCount(village)).toBe(1);
    expect(settleMegaShard(village, SURVIVOR_MEGA_REFUND_MS - 1)).toBe(true);
    expect(megaShardCount(village)).toBe(2);
    expect(takeMegaShard(village)).toBe(true);
    expect(settleMegaShard(village, SURVIVOR_MEGA_REFUND_MS)).toBe(false);
    expect(megaShardCount(village)).toBe(1);
  });
});
