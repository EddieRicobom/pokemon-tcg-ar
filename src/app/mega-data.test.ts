import { describe, expect, it } from 'vitest';
import type { SpriteSource } from '../ar/sprite-source';
import type { PokemonProfile } from '../core/pokemon-data';
import { planMegaEvolutions, prepareMegaForm, resolveMegaForm } from './mega-data';
import type { MegaPrepareDeps } from './mega-data';

const species = (names: [string, number][]) => ({
  varieties: names.map(([name, id], i) => ({ is_default: i === 0, pokemon: { name, url: `https://pokeapi.co/api/v2/pokemon/${id}/` } })),
});
const GALLADE = species([['gallade', 475], ['gallade-mega', 10068]]);
const CHARIZARD = species([['charizard', 6], ['charizard-mega-x', 10034], ['charizard-mega-y', 10035], ['charizard-gmax', 10196]]);

function fakeFetch(table: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = table[url];
    if (hit === undefined) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(hit), { status: 200 });
  }) as typeof fetch;
}

const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('resolveMegaForm', () => {
  it('acha a única forma Mega e o id dela', async () => {
    const form = await resolveMegaForm(475, null, { fetchImpl: fakeFetch({ 'https://pokeapi.co/api/v2/pokemon-species/475': GALLADE }) });
    expect(form).toEqual({ formId: 10068, formName: 'gallade-mega' });
  });

  it('com X e Y, usa a variante da carta; sem variante, não chuta', async () => {
    const table = { 'https://pokeapi.co/api/v2/pokemon-species/6': CHARIZARD };
    expect(await resolveMegaForm(6, 'y', { fetchImpl: fakeFetch(table) })).toEqual({ formId: 10035, formName: 'charizard-mega-y' });
    expect(await resolveMegaForm(6, 'x', { fetchImpl: fakeFetch(table) })).toEqual({ formId: 10034, formName: 'charizard-mega-x' });
    expect(await resolveMegaForm(6, null, { fetchImpl: fakeFetch(table) })).toBeNull();
  });

  it('espécie sem Mega devolve null', async () => {
    const table = { 'https://pokeapi.co/api/v2/pokemon-species/25': species([['pikachu', 25], ['pikachu-gmax', 10199]]) };
    expect(await resolveMegaForm(25, null, { fetchImpl: fakeFetch(table) })).toBeNull();
  });

  it('guarda a forma no aparelho e não consulta de novo', async () => {
    const calls: string[] = [];
    const storage = memoryStorage();
    const table = { 'https://pokeapi.co/api/v2/pokemon-species/475': GALLADE };
    await resolveMegaForm(475, null, { fetchImpl: fakeFetch(table, calls), storage });
    const again = await resolveMegaForm(475, null, { fetchImpl: fakeFetch(table, calls), storage });
    expect(again?.formId).toBe(10068);
    expect(calls).toHaveLength(1);
  });

  it('sem rede, lança (quem chama explica); não inventa forma', async () => {
    const offline = (async () => { throw new TypeError('offline'); }) as typeof fetch;
    await expect(resolveMegaForm(475, null, { fetchImpl: offline })).rejects.toThrow();
  });

  it('ignora id de forma que não é ≥ 10000', async () => {
    const odd = species([['gallade', 475], ['gallade-mega', 99]]);
    expect(await resolveMegaForm(475, null, { fetchImpl: fakeFetch({ 'https://pokeapi.co/api/v2/pokemon-species/475': odd }) })).toBeNull();
  });
});

describe('prepareMegaForm', () => {
  const profile: PokemonProfile = { dexId: 10068, types: ['psychic', 'fighting'], stats: { hp: 68, attack: 165, defense: 95, spAttack: 65, spDefense: 115, speed: 110 } };
  const sprite: SpriteSource = { kind: 'gif', url: 'https://x/10068.gif', blob: new Blob([new Uint8Array(4)]) };
  const card = { id: 'me03-244', name: 'Mega Gallade ex', baseDexId: 475 };
  const deps = (over: Partial<MegaPrepareDeps> = {}): MegaPrepareDeps => ({
    resolve: async () => ({ formId: 10068, formName: 'gallade-mega' }),
    loadProfile: async () => profile,
    fetchSprite: async () => sprite,
    ...over,
  });

  it('tudo pronto: devolve forma, atributos e sprite', async () => {
    const out = await prepareMegaForm(card, deps());
    expect(out).toMatchObject({ ok: true, ready: { cardId: 'me03-244', form: { formId: 10068 }, profile: { types: ['psychic', 'fighting'] } } });
  });

  it('carta shiny pede o sprite shiny da forma Mega; carta normal, o normal', async () => {
    const asked: boolean[] = [];
    const d = deps({ fetchSprite: async (_id, shiny) => { asked.push(shiny); return sprite; } });
    await prepareMegaForm({ ...card, shiny: true }, d);
    await prepareMegaForm(card, d);
    expect(asked).toEqual([true, false]);
  });

  it('passa a variante X/Y do nome da carta', async () => {
    let seen: unknown = 'nada';
    await prepareMegaForm({ id: 'c', name: 'Mega Charizard X ex', baseDexId: 6 }, deps({ resolve: async (_dex, variant) => { seen = variant; return null; } }));
    expect(seen).toBe('x');
  });

  it('cada falta vira um motivo e a luta segue na forma normal', async () => {
    const cases: [Partial<MegaPrepareDeps>, RegExp][] = [
      [{ resolve: async () => null }, /não achei a forma Mega/],
      [{ resolve: async () => { throw new Error('timeout'); } }, /não consegui consultar.*timeout/],
      [{ loadProfile: async () => null }, /não devolveu os atributos/],
      [{ fetchSprite: async () => null }, /não tem sprite/],
      [{ fetchSprite: async () => { throw new Error('offline'); } }, /não consegui baixar.*sem conexão/],
    ];
    for (const [over, pattern] of cases) {
      const out = await prepareMegaForm(card, deps(over));
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.reason).toMatch(pattern);
        expect(out.reason).toContain('não gasta energia');
      }
    }
  });

  it('erro de rede do navegador vira "sem conexão" em português', async () => {
    const out = await prepareMegaForm(card, deps({ resolve: async () => { throw new TypeError('Failed to fetch'); } }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('(sem conexão)');
  });

  it('carta sem número da Pokédex não tenta nada', async () => {
    const out = await prepareMegaForm({ ...card, baseDexId: undefined }, deps({ resolve: async () => { throw new Error('não devia chamar'); } }));
    expect(out.ok).toBe(false);
  });
});

describe('planMegaEvolutions', () => {
  it('50 de energia por troca', () => {
    expect(planMegaEvolutions(1, 120)).toEqual({ afford: 1, skipped: 0, total: 50 });
    expect(planMegaEvolutions(2, 120)).toEqual({ afford: 2, skipped: 0, total: 100 });
    expect(planMegaEvolutions(3, 120)).toEqual({ afford: 2, skipped: 1, total: 100 });
  });

  it('sem energia suficiente, nada é cobrado', () => {
    expect(planMegaEvolutions(1, 49)).toEqual({ afford: 0, skipped: 1, total: 0 });
    expect(planMegaEvolutions(0, 500)).toEqual({ afford: 0, skipped: 0, total: 0 });
    expect(planMegaEvolutions(2, 50)).toEqual({ afford: 1, skipped: 1, total: 50 });
  });
});
