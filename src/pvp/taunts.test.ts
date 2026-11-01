import { describe, expect, it } from 'vitest';
import { acceptTaunt, buffRarity, canTaunt, TAUNT_ACCEPT_MS, TAUNT_COOLDOWN_MS, TAUNTS, tauntText, tauntWait } from './taunts';
import { encodeMessage, parseMessage } from './wire';
import type { WireMessage } from './wire';

const parse = (o: unknown) => parseMessage(JSON.stringify(o));

describe('provocações', () => {
  it('a lista é fechada: de 4 a 6 frases curtas, cada id uma vez', () => {
    expect(TAUNTS.length).toBeGreaterThanOrEqual(4);
    expect(TAUNTS.length).toBeLessThanOrEqual(6);
    expect(new Set(TAUNTS.map((t) => t.id)).size).toBe(TAUNTS.length);
    for (const t of TAUNTS) expect(t.text.length).toBeLessThanOrEqual(20);
  });

  it('cada id vai e volta pelo fio; id fora da lista e texto livre são recusados', () => {
    for (const t of TAUNTS) {
      const msg: WireMessage = { t: 'taunt', id: t.id };
      expect(parseMessage(encodeMessage(msg))).toEqual(msg);
      expect(tauntText(t.id)).toBe(t.text);
    }
    expect(parse({ t: 'taunt', id: 'xingamento' })).toBeNull();
    expect(parse({ t: 'taunt', text: 'oi' })).toBeNull();
    expect(parse({ t: 'taunt', id: 5 })).toBeNull();
    expect(parse({ t: 'taunt' })).toBeNull();
  });

  it('a recarga de quem envia é de ~3 s e a de quem recebe é menor', () => {
    expect(canTaunt(0, 1000)).toBe(true);
    expect(canTaunt(1000, 1000 + TAUNT_COOLDOWN_MS - 1)).toBe(false);
    expect(canTaunt(1000, 1000 + TAUNT_COOLDOWN_MS)).toBe(true);
    expect(tauntWait(1000, 1500)).toBe(3);
    expect(tauntWait(1000, 1000 + TAUNT_COOLDOWN_MS)).toBe(0);
    expect(acceptTaunt(1000, 1000 + TAUNT_ACCEPT_MS - 1)).toBe(false);
    expect(acceptTaunt(1000, 1000 + TAUNT_ACCEPT_MS)).toBe(true);
    expect(TAUNT_ACCEPT_MS).toBeLessThan(TAUNT_COOLDOWN_MS);
  });
});

describe('aviso de buff', () => {
  it('a raridade sai das regras: lendária, grau 3+ é raro, o resto é comum', () => {
    expect(buffRarity('gem', { legendary: true, tier: 1 })).toBe('lendario');
    expect(buffRarity('gem', { legendary: false, tier: 3 })).toBe('raro');
    expect(buffRarity('gem', { legendary: false, tier: 1 })).toBe('comum');
    expect(buffRarity('potion')).toBe('comum');
    expect(buffRarity('fusion')).toBe('comum');
  });

  it('as mensagens válidas vão e voltam', () => {
    const msgs: WireMessage[] = [
      { t: 'buff-event', kind: 'gem', id: 'rubi', rarity: 'comum' },
      { t: 'buff-event', kind: 'gem', id: 'topazio', rarity: 'raro' },
      { t: 'buff-event', kind: 'gem', id: 'fenix', rarity: 'lendario' },
      { t: 'buff-event', kind: 'potion', id: '', rarity: 'comum' },
      { t: 'buff-event', kind: 'fusion', id: '', rarity: 'comum' },
      { t: 'buff-event', kind: 'weapon', id: 'laminas', rarity: 'comum' },
    ];
    for (const msg of msgs) expect(parseMessage(encodeMessage(msg))).toEqual(msg);
  });

  it('recusa tipo, id ou raridade inventados e combinações que não existem nas regras', () => {
    expect(parse({ t: 'buff-event', kind: 'gem', id: 'diamante', rarity: 'comum' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'gem', id: 'fenix', rarity: 'comum' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'gem', id: 'rubi', rarity: 'lendario' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'gem', id: 'rubi', rarity: 'epico' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'tesouro', id: '', rarity: 'comum' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'potion', id: 'x', rarity: 'comum' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'potion', id: '', rarity: 'lendario' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'weapon', id: '', rarity: 'comum' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'weapon', id: '<script>', rarity: 'comum' })).toBeNull();
    expect(parse({ t: 'buff-event', kind: 'weapon', id: 'a'.repeat(40), rarity: 'comum' })).toBeNull();
  });
});
