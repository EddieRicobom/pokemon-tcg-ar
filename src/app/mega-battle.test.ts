import { describe, expect, it } from 'vitest';
import type { SpriteSource } from '../ar/sprite-source';
import type { PokemonProfile } from '../core/pokemon-data';
import { megaAwareLoader, planMegaBattle } from './mega-battle';
import type { MegaCandidate } from './mega-battle';
import type { MegaPrepared, MegaReady } from './mega-data';
import { prepareFighters } from './battle-setup';
import type { BattleLoader } from './battle-setup';
import { emptyBattleData } from './pokemon-data-service';

const stats = { hp: 68, attack: 100, defense: 95, spAttack: 65, spDefense: 115, speed: 80 };
const baseProfile: PokemonProfile = { dexId: 475, types: ['psychic', 'fighting'], stats };
const megaProfile: PokemonProfile = { dexId: 10068, types: ['psychic', 'fighting'], stats: { ...stats, attack: 165, speed: 110 } };
const sprite: SpriteSource = { kind: 'gif', url: 'u', blob: new Blob([new Uint8Array(2)]) };

const cand = (id: string, name = `Mega ${id}`): MegaCandidate => ({ id, name, baseDexId: 475 });
const okPrepare = async (c: MegaCandidate): Promise<MegaPrepared> => ({
  ok: true,
  ready: { cardId: c.id, form: { formId: 10068, formName: 'gallade-mega' }, profile: megaProfile, sprite },
});
const decode = async (r: MegaReady) => `fonte-${r.cardId}`;

describe('planMegaBattle', () => {
  it('sem marcados não faz nada e não cobra', async () => {
    expect(await planMegaBattle([], 500, { prepare: okPrepare, decode })).toEqual({ entries: [], cost: 0, notes: [] });
  });

  it('um marcado com energia: troca e cobra 50', async () => {
    const plan = await planMegaBattle([cand('a')], 120, { prepare: okPrepare, decode });
    expect(plan.cost).toBe(50);
    expect(plan.entries.map((e) => [e.cardId, e.source])).toEqual([['a', 'fonte-a']]);
    expect(plan.notes).toEqual([]);
  });

  it('energia só para um: o primeiro marcado troca, o outro luta normal e o aviso diz por quê', async () => {
    const plan = await planMegaBattle([cand('a', 'Mega A'), cand('b', 'Mega B')], 60, { prepare: okPrepare, decode });
    expect(plan.entries.map((e) => e.cardId)).toEqual(['a']);
    expect(plan.cost).toBe(50);
    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0]).toContain('Mega B');
    expect(plan.notes[0]).toContain('sem moedas');
  });

  it('sem energia nenhuma, ninguém troca e nada é cobrado', async () => {
    const plan = await planMegaBattle([cand('a')], 49, { prepare: okPrepare, decode });
    expect(plan).toMatchObject({ entries: [], cost: 0 });
    expect(plan.notes[0]).toContain('sem moedas');
  });

  it('forma que não ficou pronta não é cobrada, e a energia vai para quem ficou', async () => {
    const prepare = async (c: MegaCandidate): Promise<MegaPrepared> => (c.id === 'a' ? { ok: false, reason: 'A: sem rede. Luta na forma normal e não gasta energia.' } : okPrepare(c));
    const plan = await planMegaBattle([cand('a'), cand('b')], 60, { prepare, decode });
    expect(plan.entries.map((e) => e.cardId)).toEqual(['b']);
    expect(plan.cost).toBe(50);
    expect(plan.notes).toEqual(['A: sem rede. Luta na forma normal e não gasta energia.']);
  });

  it('erro ao preparar ou decodificar vira aviso, não quebra a batalha', async () => {
    const plan = await planMegaBattle([cand('a'), cand('b')], 500, {
      prepare: async (c) => { if (c.id === 'a') throw new Error('estouro'); return okPrepare(c); },
      decode: async (r) => { if (r.cardId === 'b') throw new Error('gif inválido'); return 'x'; },
    });
    expect(plan.entries).toEqual([]);
    expect(plan.cost).toBe(0);
    expect(plan.notes.join(' ')).toMatch(/estouro/);
    expect(plan.notes.join(' ')).toMatch(/gif inválido/);
  });
});

describe('megaAwareLoader', () => {
  const base: BattleLoader = async (_card, _dex, onPart) => {
    onPart('profile', { state: 'ok', value: baseProfile });
    onPart('moves', { state: 'ok', value: [{ name: 'psycho-cut', type: 'psychic', power: 70, accuracy: 100, pp: 20, damageClass: 'physical' }] });
    onPart('card', { state: 'error', message: 'sem TCGdex' });
  };

  it('a carta Mega usa os atributos da forma; golpes e carta continuam os da base', async () => {
    const seen: Record<string, unknown> = {};
    const loader = megaAwareLoader(base, [{ cardId: 'a', profile: megaProfile }]);
    const data = emptyBattleData();
    await loader('a', 475, (part, result) => { seen[part] = result; (data as never as Record<string, unknown>)[part] = result; });
    expect(seen.profile).toEqual({ state: 'ok', value: megaProfile });
    expect(seen.moves).toMatchObject({ state: 'ok' });
    expect(seen.card).toMatchObject({ state: 'error' });
  });

  it('as outras cartas seguem iguais', async () => {
    const loader = megaAwareLoader(base, [{ cardId: 'a', profile: megaProfile }]);
    let profile: unknown;
    await loader('b', 475, (part, result) => { if (part === 'profile') profile = result; });
    expect(profile).toEqual({ state: 'ok', value: baseProfile });
  });

  it('na batalha, o lutador Mega sai mais forte que o da forma normal', async () => {
    const [normal] = await prepareFighters([{ id: 'a', name: 'Gallade', dexId: 475 }], base, 1000);
    const [mega] = await prepareFighters([{ id: 'a', name: 'Mega Gallade', dexId: 475 }], megaAwareLoader(base, [{ cardId: 'a', profile: megaProfile }]), 1000);
    expect(mega!.attack).toBeGreaterThan(normal!.attack);
  });
});
