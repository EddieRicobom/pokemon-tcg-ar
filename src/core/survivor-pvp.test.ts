import { describe, expect, it } from 'vitest';
import {
  aliveCount, applyArenaSnapshot, canSwitch, createArena, guardBlockReason, NO_INPUT, arenaCamera, arenaCameraTarget, offscreenPointer, SV_ARENA_H, SV_ARENA_W, SV_START_OFFSET, SV_VIEW_H, SV_VIEW_W, SV_COUNTDOWN_MS, SV_ENTRY_SHIELD_MS, SV_GUARD_COOLDOWN_MS,
  SV_GUARD_MS, SV_MAX_MS, SV_SUDDEN_DEATH_MS, SV_SWAP_RECALL_MS, SV_SWAP_SEND_MS, SV_SWAP_TOTAL_MS, SV_SWITCH_COOLDOWN_MS, snapshotArena, stepArena, svMonFromRun, svRunScore, switchBlockReason,
} from './survivor-pvp';
import type { ArenaEvent, ArenaInput, ArenaState, SvMonSpec, SvRunResult } from './survivor-pvp';

const run = (extra: Partial<SvRunResult> = {}): SvRunResult => ({
  id: 'c1', dexId: 25, name: 'Pikachu', shiny: false, types: ['electric'], attackType: 'electric', survivedMs: 120_000, kills: 40, level: 6, defeated: false, ...extra,
});

const mon = (id: string, extra: Partial<SvMonSpec> = {}): SvMonSpec => ({
  id, name: id, dexId: 25, shiny: false, types: ['normal'], attackType: 'normal', maxHp: 100, power: 20, speed: 100, fireMs: 500, score: 50, estimated: false, ...extra,
});

/** Passa o tempo da contagem inicial. */
function begin(state: ArenaState): void {
  for (let i = 0; i < SV_COUNTDOWN_MS / 50 + 1; i++) stepArena(state, [NO_INPUT, NO_INPUT], 50);
}

const run60 = (state: ArenaState, ms: number, a: ArenaInput = NO_INPUT, b: ArenaInput = NO_INPUT): void => {
  for (let t = 0; t < ms && state.winner === null; t += 20) stepArena(state, [a, b], 20);
};

describe('survival pvp: da run para o Pokémon', () => {
  it('a nota sobe com tempo, vitórias e nível e fica entre 0 e 100', () => {
    const base = svRunScore({ survivedMs: 30_000, kills: 5, level: 2 });
    expect(svRunScore({ survivedMs: 60_000, kills: 5, level: 2 })).toBeGreaterThan(base);
    expect(svRunScore({ survivedMs: 30_000, kills: 25, level: 2 })).toBeGreaterThan(base);
    expect(svRunScore({ survivedMs: 30_000, kills: 5, level: 9 })).toBeGreaterThan(base);
    expect(svRunScore({ survivedMs: 0, kills: 0, level: 0 })).toBe(0);
    expect(svRunScore({ survivedMs: 10_000_000, kills: 9999, level: 99 })).toBe(100);
  });

  it('usa os stats reais da espécie e marca quando só há números médios', () => {
    const real = svMonFromRun(run(), 'a');
    expect(real.estimated).toBe(false);
    expect(real.maxHp).toBeGreaterThan(100);
    const unknown = svMonFromRun(run({ dexId: 999999 }), 'b');
    expect(unknown.estimated).toBe(true);
  });

  it('uma run melhor rende um Pokémon mais forte (até +30%)', () => {
    const weak = svMonFromRun(run({ survivedMs: 5_000, kills: 0, level: 1 }), 'a');
    const strong = svMonFromRun(run(), 'b');
    expect(strong.maxHp).toBeGreaterThan(weak.maxHp);
    expect(strong.power).toBeGreaterThanOrEqual(weak.power);
    expect(strong.maxHp / weak.maxHp).toBeLessThanOrEqual(1.31);
  });

  it('leva os buffs e a forma real do golpe para a arena', () => {
    const fromRun = svMonFromRun(run({
      combat: {
        moveName: 'Nuvem tóxica', category: 'area', effect: 'queimar', maxHp: 420, power: 84, speed: 160,
        cooldownMs: 480, projectileSpeed: 510, projectileSize: 12, shots: 3, pierce: 2, attackRange: 230,
        attackRadius: 92, critChance: 0.2, buffs: ['power', 'multishot', 'pierce'],
      },
    }), 'a');
    expect(fromRun).toMatchObject({ maxHp: 420, power: 84, moveCategory: 'area', moveEffect: 'queimar', shots: 3, pierce: 2 });
    expect(fromRun.speed).toBeGreaterThan(160);
    expect(fromRun.buffs).toEqual(['power', 'multishot', 'pierce']);
  });
});

describe('survival pvp: a arena', () => {
  it('a contagem trava tudo e começa com as equipes cheias', () => {
    const s = createArena([mon('a'), mon('b'), mon('c')], [mon('x'), mon('y'), mon('z')]);
    stepArena(s, [{ dx: 1, dy: 0, switchTo: -1 }, NO_INPUT], 50);
    expect(s.countdownMs).toBeLessThan(SV_COUNTDOWN_MS);
    expect(s.sides[0].x).toBe(SV_ARENA_W / 2);
    expect(s.shots).toHaveLength(0);
    expect(aliveCount(s.sides[0])).toBe(3);
    begin(s);
    expect(s.countdownMs).toBe(0);
  });

  it('anda na direção da entrada, sem sair da arena e sem correr mais na diagonal', () => {
    const s = createArena([mon('a')], [mon('x')]);
    begin(s);
    stepArena(s, [{ dx: 1, dy: 0, switchTo: -1 }, NO_INPUT], 50);
    const straight = s.sides[0].x - SV_ARENA_W / 2;
    const d = createArena([mon('a')], [mon('x')]);
    begin(d);
    stepArena(d, [{ dx: 1, dy: 1, switchTo: -1 }, NO_INPUT], 50);
    expect(Math.hypot(d.sides[0].x - SV_ARENA_W / 2, d.sides[0].y - (SV_ARENA_H / 2 + SV_START_OFFSET))).toBeCloseTo(straight, 6);
    run60(s, 10_000, { dx: 1, dy: 0, switchTo: -1 });
    expect(s.sides[0].x).toBeLessThanOrEqual(SV_ARENA_W);
  });

  it('é determinística: as mesmas entradas dão o mesmo resultado', () => {
    const play = (): string => {
      const s = createArena([mon('a'), mon('b'), mon('c')], [mon('x'), mon('y'), mon('z')]);
      begin(s);
      for (let i = 0; i < 400; i++) stepArena(s, [{ dx: Math.sin(i / 20), dy: 0, switchTo: i === 100 ? 1 : -1 }, { dx: Math.cos(i / 15), dy: 0, switchTo: -1 }], 20);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it('o golpe acerta, tira vida e respeita a vantagem de tipo', () => {
    const neutral = createArena([mon('a')], [mon('x', { types: ['normal'] })]);
    const weak = createArena([mon('a', { attackType: 'fire' })], [mon('x', { types: ['grass'] })]);
    const immune = createArena([mon('a', { attackType: 'normal' })], [mon('x', { types: ['ghost'] })]);
    for (const s of [neutral, weak, immune]) {
      begin(s);
      run60(s, 3000);
    }
    const lost = (s: ArenaState): number => s.sides[1].mons[0]!.maxHp - s.sides[1].mons[0]!.hp;
    expect(lost(neutral)).toBeGreaterThan(0);
    expect(lost(weak)).toBeGreaterThan(lost(neutral));
    expect(lost(immune)).toBe(0);
  });

  it('avisa a área por 1,5 s e deixa o alvo sair antes do dano', () => {
    const s = createArena(
      [mon('a', { fireMs: 250, power: 40, moveCategory: 'area', attackRadius: 80 })],
      [mon('x', { fireMs: 2000 })],
    );
    begin(s);
    const warning = Array.from({ length: 13 }, () => stepArena(s, [NO_INPUT, NO_INPUT], 50)).flat();
    expect(warning.some((event) => event.k === 'telegraph')).toBe(true);
    expect(s.markers).toHaveLength(1);
    const hp = s.sides[1].mons[0]!.hp;
    run60(s, 1000);
    expect(s.sides[1].mons[0]!.hp).toBe(hp);
    run60(s, 600);
    expect(s.sides[1].mons[0]!.hp).toBeLessThan(hp);

    const dodge = createArena(
      [mon('a', { fireMs: 250, power: 40, moveCategory: 'area', attackRadius: 80 })],
      [mon('x', { fireMs: 2000 })],
    );
    begin(dodge);
    run60(dodge, 650);
    run60(dodge, 1400, NO_INPUT, { dx: 1, dy: 0, switchTo: -1 });
    stepArena(dodge, [NO_INPUT, { dx: 1, dy: 0, switchTo: -1 }], 120);
    expect(dodge.sides[1].mons[0]!.hp).toBe(dodge.sides[1].mons[0]!.maxHp);
  });

  it('a vida de cada Pokémon se mantém entre trocas', () => {
    const s = createArena([mon('a', { fireMs: 2000 }), mon('b')], [mon('x', { power: 10 }), mon('y')]);
    begin(s);
    run60(s, 3000);
    const hurt = s.sides[0].mons[0]!.hp;
    expect(hurt).toBeLessThan(100);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 1 }, NO_INPUT], 20);
    run60(s, SV_SWAP_TOTAL_MS + 100);
    expect(s.sides[0].active).toBe(1);
    expect(s.sides[0].mons[0]!.hp).toBe(hurt);
    run60(s, SV_SWITCH_COOLDOWN_MS + 200);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 0 }, NO_INPUT], 20);
    run60(s, SV_SWAP_TOTAL_MS + 100);
    expect(s.sides[0].active).toBe(0);
    expect(s.sides[0].mons[0]!.hp).toBeLessThanOrEqual(hurt);
  });

  it('a troca tem recarga, não vale para o mesmo Pokémon nem para um caído', () => {
    const s = createArena([mon('a'), mon('b'), mon('c')], [mon('x'), mon('y')]);
    expect(canSwitch(s, 0, 1)).toBe(false);
    expect(switchBlockReason(s, 0, 1)).toMatch(/não começou/);
    begin(s);
    expect(canSwitch(s, 0, 0)).toBe(false);
    expect(switchBlockReason(s, 0, 0)).toMatch(/em campo/);
    expect(switchBlockReason(s, 0, 7)).not.toBeNull();
    expect(canSwitch(s, 0, 1)).toBe(true);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 1 }, NO_INPUT], 20);
    // A troca leva 3 s: nada muda de lugar no começo, o campo é do novo só depois da volta à bola.
    expect(s.sides[0].active).toBe(0);
    expect(s.sides[0].swapMs).toBeGreaterThan(SV_SWAP_TOTAL_MS - 100);
    expect(s.sides[0].switchCdMs).toBeGreaterThan(SV_SWITCH_COOLDOWN_MS - 100);
    expect(switchBlockReason(s, 0, 2)).toMatch(/acontecendo/);
    run60(s, SV_SWAP_TOTAL_MS + 100);
    expect(s.sides[0].active).toBe(1);
    expect(s.sides[0].swapMs).toBe(0);
    stepArena(s, [{ dx: 0, dy: 0, switchTo: 2 }, NO_INPUT], 20);
    expect(s.sides[0].active).toBe(1);
    expect(switchBlockReason(s, 0, 2)).toMatch(/Troca em/);
    s.sides[0].switchCdMs = 0;
    s.sides[0].mons[2]!.hp = 0;
    expect(canSwitch(s, 0, 2)).toBe(false);
    expect(switchBlockReason(s, 0, 2)).toMatch(/fora de combate/);
  });

  it('quem entra fica protegido por um instante', () => {
    const make = (): ArenaState => {
      const s = createArena([mon('a'), mon('b')], [mon('x', { fireMs: 450, power: 30 })]);
      s.sides[1].y = s.sides[0].y - 50; // colados: o golpe chega quase na hora
      begin(s);
      return s;
    };
    const shielded = make();
    stepArena(shielded, [{ dx: 0, dy: 0, switchTo: 1 }, NO_INPUT], 20);
    // Parado e protegido durante a troca inteira; ao entrar ganha ainda a proteção de quem chega.
    run60(shielded, SV_SWAP_RECALL_MS + 100);
    expect(shielded.sides[0].active).toBe(1);
    expect(shielded.sides[0].shieldMs).toBeGreaterThan(SV_ENTRY_SHIELD_MS - 300);
    run60(shielded, SV_SWAP_SEND_MS);
    expect(shielded.sides[0].mons[1]!.hp).toBe(100);
    const control = make();
    run60(control, 800);
    expect(control.sides[0].mons[0]!.hp).toBeLessThan(100);
  });

  it('quem desmaia é trocado na hora pelo próximo de pé, sem recarga', () => {
    const s = createArena([mon('a', { maxHp: 20 }), mon('b'), mon('c')], [mon('x', { power: 60, maxHp: 500 })]);
    begin(s);
    run60(s, 4000);
    expect(s.sides[0].mons[0]!.hp).toBe(0);
    expect(s.sides[0].active).not.toBe(0);
    expect(s.sides[0].mons[s.sides[0].active]!.hp).toBeGreaterThan(0);
    expect(s.sides[0].switchCdMs).toBe(0);
  });

  it('vence quem deixa a equipe do outro sem ninguém de pé', () => {
    const s = createArena([mon('a', { power: 120, fireMs: 450, maxHp: 400 })], [mon('x', { maxHp: 20 }), mon('y', { maxHp: 20 })]);
    begin(s);
    run60(s, 20_000);
    expect(aliveCount(s.sides[1])).toBe(0);
    expect(s.winner).toBe(0);
  });

  it('a morte súbita faz toda luta terminar', () => {
    const s = createArena([mon('a', { power: 1, maxHp: 400, fireMs: 2000 })], [mon('x', { power: 1, maxHp: 300, fireMs: 2000 })]);
    begin(s);
    // Golpes fracos e raros, cantos opostos: sem a morte súbita a luta levaria uma eternidade.
    s.sides[0].x = 18;
    s.sides[0].y = SV_ARENA_H - 18;
    s.sides[1].x = SV_ARENA_W - 18;
    s.sides[1].y = 18;
    for (let t = 0; t < SV_MAX_MS + 5000 && s.winner === null; t += 50) stepArena(s, [NO_INPUT, NO_INPUT], 50);
    expect(s.winner).not.toBeNull();
    expect(s.timeMs).toBeGreaterThan(SV_SUDDEN_DEATH_MS);
  });

  it('ignora entradas inválidas', () => {
    const s = createArena([mon('a')], [mon('x')]);
    begin(s);
    stepArena(s, [{ dx: Number.NaN, dy: 999, switchTo: 1.5 }, undefined], 20);
    expect(Number.isFinite(s.sides[0].x)).toBe(true);
    expect(s.sides[0].x).toBe(SV_ARENA_W / 2);
  });
});

describe('survival pvp: instantâneo', () => {
  it('o convidado adota exatamente o estado do anfitrião', () => {
    const team = [mon('a'), mon('b')];
    const host = createArena(team, [mon('x'), mon('y')]);
    const guest = createArena(team, [mon('x'), mon('y')]);
    begin(host);
    run60(host, 2500, { dx: 0.4, dy: -0.2, switchTo: -1 });
    expect(applyArenaSnapshot(guest, JSON.parse(JSON.stringify(snapshotArena(host, 1))))).toBe(true);
    expect(guest.sides.map((t) => t.mons.map((m) => m.hp))).toEqual(host.sides.map((t) => t.mons.map((m) => Math.round(m.hp))));
    expect(guest.shots).toHaveLength(host.shots.length);
    expect(guest.sides[0].x).toBeCloseTo(host.sides[0].x, 0);
  });

  it('recusa um instantâneo que não casa com as equipes', () => {
    const host = createArena([mon('a'), mon('b')], [mon('x')]);
    const guest = createArena([mon('a')], [mon('x')]);
    const before = JSON.stringify(guest);
    expect(applyArenaSnapshot(guest, snapshotArena(host, 1))).toBe(false);
    expect(JSON.stringify(guest)).toBe(before);
  });
});

describe('survival pvp: escudo', () => {
  const press: ArenaInput = { dx: 0, dy: 0, switchTo: -1, shield: true };
  const collect = (s: ArenaState, ms: number, a: ArenaInput = NO_INPUT): ArenaEvent[] => {
    const out: ArenaEvent[] = [];
    for (let t = 0; t < ms && s.winner === null; t += 20) out.push(...stepArena(s, [a, NO_INPUT], 20));
    return out;
  };

  it('cancela qualquer dano por 2 s e só recarrega 10 s depois de ativado', () => {
    const s = createArena([mon('a', { fireMs: 2000, maxHp: 100_000 })], [mon('x', { fireMs: 250, power: 30, maxHp: 100_000 })]);
    begin(s);
    const first = stepArena(s, [press, NO_INPUT], 20);
    expect(first.some((e) => e.k === 'guard' && e.side === 0)).toBe(true);
    expect(s.sides[0].guardMs).toBeGreaterThan(SV_GUARD_MS - 100);
    expect(s.sides[0].guardCdMs).toBeGreaterThan(SV_GUARD_COOLDOWN_MS - 100);
    const hp = s.sides[0].mons[0]!.hp;
    const during = collect(s, 1900);
    expect(during.some((e) => e.k === 'block' && e.side === 0)).toBe(true);
    expect(during.some((e) => e.k === 'hit' && e.side === 0)).toBe(false);
    expect(s.sides[0].mons[0]!.hp).toBe(hp);
    collect(s, 800); // o escudo acabou: os golpes voltam a entrar
    expect(s.sides[0].mons[0]!.hp).toBeLessThan(hp);
  });

  it('não ativa de novo durante a recarga e volta depois dos 10 s', () => {
    const s = createArena([mon('a', { fireMs: 2000, maxHp: 100_000 })], [mon('x', { fireMs: 5000, maxHp: 100_000 })]);
    begin(s);
    stepArena(s, [press, NO_INPUT], 20);
    expect(guardBlockReason(s, 0)).toBe('O escudo já está ativo.');
    collect(s, 3000);
    expect(guardBlockReason(s, 0)).toMatch(/Escudo em \d+ s/);
    expect(stepArena(s, [press, NO_INPUT], 20).some((e) => e.k === 'guard')).toBe(false);
    collect(s, SV_GUARD_COOLDOWN_MS);
    expect(guardBlockReason(s, 0)).toBeNull();
    expect(stepArena(s, [press, NO_INPUT], 20).some((e) => e.k === 'guard')).toBe(true);
  });

  it('não vale antes da luta começar nem depois dela acabar', () => {
    const s = createArena([mon('a')], [mon('x')]);
    expect(stepArena(s, [press, NO_INPUT], 20).some((e) => e.k === 'guard')).toBe(false);
    expect(guardBlockReason(s, 0)).toBe('A luta ainda não começou.');
  });

  it('cancela também o efeito do golpe (lentidão) e vai no instantâneo do convidado', () => {
    const s = createArena([mon('a', { fireMs: 2000, maxHp: 100_000 })], [mon('x', { fireMs: 250, power: 30, moveEffect: 'lentidao' })]);
    begin(s);
    stepArena(s, [press, NO_INPUT], 20);
    collect(s, 1900);
    expect(s.sides[0].slowMs).toBe(0);
    const guest = createArena([mon('a', { fireMs: 2000, maxHp: 100_000 })], [mon('x')]);
    expect(applyArenaSnapshot(guest, snapshotArena(s, 1))).toBe(true);
    expect(guest.sides[0].guardCdMs).toBe(Math.round(s.sides[0].guardCdMs));
  });
});

describe('survival pvp: golpes iguais aos da corrida', () => {
  /** Quem joga fica em y = 390 e o rival, na mesma coluna, em `foeY`. */
  const place = (s: ArenaState, foeY: number): void => {
    s.sides[0].y = 390;
    s.sides[1].y = foeY;
  };
  const events = (s: ArenaState, ms: number): ArenaEvent[] => {
    const out: ArenaEvent[] = [];
    for (let t = 0; t < ms && s.winner === null; t += 20) out.push(...stepArena(s, [NO_INPUT, NO_INPUT], 20));
    return out;
  };
  const foeLost = (s: ArenaState): number => s.sides[1].mons[0]!.maxHp - s.sides[1].mons[0]!.hp;
  // O rival parado: a Trilha não dispara nada e só anda se mandarem.
  const idle: Partial<SvMonSpec> = { moveCategory: 'trilha', fireMs: 60_000 };

  it('cone: acerta só quem está no alcance, e o desenho recebe o ângulo', () => {
    const near = createArena([mon('a', { moveCategory: 'cone', attackRange: 200, fireMs: 400 })], [mon('x', idle)]);
    begin(near);
    place(near, 250);
    const seen = events(near, 800);
    expect(seen.some((e) => e.k === 'cone' && e.side === 0 && e.range === 200)).toBe(true);
    expect(foeLost(near)).toBeGreaterThan(0);
    const far = createArena([mon('a', { moveCategory: 'cone', attackRange: 200, fireMs: 400 })], [mon('x', idle)]);
    begin(far);
    place(far, 90);
    events(far, 800);
    expect(foeLost(far)).toBe(0);
  });

  it('aura: pulsa com 80% do raio do golpe', () => {
    const s = createArena([mon('a', { moveCategory: 'aura', attackRadius: 100, fireMs: 400 })], [mon('x', idle)]);
    begin(s);
    place(s, 390 - 90); // 90 <= 80 + 18: o rival está dentro do pulso
    const seen = events(s, 800);
    expect(seen.find((e) => e.k === 'pulse')).toMatchObject({ radius: 80 });
    expect(foeLost(s)).toBeGreaterThan(0);
    const out = createArena([mon('a', { moveCategory: 'aura', attackRadius: 100, fireMs: 400 })], [mon('x', idle)]);
    begin(out);
    place(out, 390 - 140);
    events(out, 800);
    expect(foeLost(out)).toBe(0);
  });

  it('órbita: os orbitais giram e acertam quem encosta', () => {
    const s = createArena([mon('a', { moveCategory: 'orbit', attackRadius: 60, fireMs: 500 })], [mon('x', idle)]);
    begin(s);
    place(s, 340);
    events(s, 2000);
    expect(s.sides[0].orbitAngle).toBeGreaterThan(0);
    expect(foeLost(s)).toBeGreaterThan(0);
  });

  it('rajada: três salvas seguidas por golpe', () => {
    const s = createArena([mon('a', { moveCategory: 'rapido', fireMs: 1000, shots: 1 })], [mon('x', idle)]);
    begin(s);
    events(s, 900);
    expect(s.nextShotId - 1).toBe(3);
  });

  it('foco: carrega sozinho, marca a linha e só depois o feixe acerta', () => {
    const s = createArena([mon('a', { moveCategory: 'foco', fireMs: 1000, power: 20 })], [mon('x', idle)]);
    begin(s);
    place(s, 200);
    const early = events(s, 1000);
    expect(early.some((e) => e.k === 'beam')).toBe(false);
    expect(s.sides[0].focusCharge).toBeGreaterThan(0.3);
    const marked = events(s, 2000);
    const mark = marked.find((e) => e.k === 'beam' && e.leftMs > 0);
    expect(mark).toBeDefined();
    expect(foeLost(s)).toBe(0);
    const fired = events(s, 1200);
    expect(fired.some((e) => e.k === 'beam' && e.leftMs === 0)).toBe(true);
    expect(foeLost(s)).toBeGreaterThanOrEqual(50);
  });

  it('foco: quem sai da linha marcada não leva o feixe', () => {
    const s = createArena([mon('a', { moveCategory: 'foco', fireMs: 1000 })], [mon('x', idle)]);
    begin(s);
    place(s, 200);
    let moved = false;
    for (let t = 0; t < 6000 && s.winner === null; t += 20) {
      const seen = stepArena(s, [NO_INPUT, NO_INPUT], 20);
      if (!moved && seen.some((e) => e.k === 'beam' && e.leftMs > 0)) {
        s.sides[1].x += 140;
        moved = true;
      }
    }
    expect(moved).toBe(true);
    expect(foeLost(s)).toBe(0);
  });

  it('teleporte: salta até o rival e acerta quem está no caminho', () => {
    const s = createArena([mon('a', { moveCategory: 'teleporte', attackRange: 240, fireMs: 1000 })], [mon('x', idle)]);
    begin(s);
    place(s, 200);
    const seen = events(s, 700);
    expect(seen.some((e) => e.k === 'blink' && e.side === 0)).toBe(true);
    expect(s.sides[0].y).toBeLessThan(390);
    expect(foeLost(s)).toBeGreaterThan(0);
  });

  it('trilha: andar enche a carga, desenha a faixa por 4 s e anda 25% mais rápido', () => {
    const s = createArena([mon('a', { moveCategory: 'trilha', speed: 220, fireMs: 1000, attackRadius: 30 })], [mon('x', idle)]);
    begin(s);
    for (let t = 0; t < 4600 && s.sides[0].trailMs <= 0; t += 20) {
      stepArena(s, [{ dx: Math.floor(t / 1000) % 2 === 0 ? 1 : -1, dy: 0, switchTo: -1 }, NO_INPUT], 20);
    }
    expect(s.sides[0].trailMs).toBeGreaterThan(0);
    const before = s.sides[0].x;
    stepArena(s, [{ dx: 1, dy: 0, switchTo: -1 }, NO_INPUT], 60);
    const sprint = Math.abs(s.sides[0].x - before);
    expect(s.sides[0].trail.length).toBeGreaterThan(0);
    expect(sprint).toBeCloseTo(220 * 1.25 * 0.06, 0);
  });

  it('efeitos: lentidão, atordoamento e queimadura vêm do golpe', () => {
    for (const [effect, key] of [['lentidao', 'slowMs'], ['atordoar', 'stunMs'], ['queimar', 'burnMs']] as const) {
      const s = createArena([mon('a', { moveEffect: effect, fireMs: 400, projectileSpeed: 500 })], [mon('x', idle)]);
      begin(s);
      place(s, 300);
      events(s, 850);
      expect(s.sides[1][key], effect).toBeGreaterThan(0);
    }
  });

  it('atravessar: o tiro continua depois de acertar, sem acertar duas vezes', () => {
    const s = createArena([mon('a', { pierce: 1, fireMs: 60_000, projectileSpeed: 500 })], [mon('x', idle)]);
    begin(s);
    place(s, 300);
    events(s, 1500);
    expect(foeLost(s)).toBe(20);
  });
});

describe('câmera da arena', () => {
  it('o campo é maior que a tela', () => {
    expect(SV_ARENA_W).toBeGreaterThan(SV_VIEW_W);
    expect(SV_ARENA_H).toBeGreaterThan(SV_VIEW_H);
  });

  it('os dois lados começam vendo um ao outro', () => {
    const s = createArena([], []);
    expect(Math.abs(s.sides[0].y - s.sides[1].y)).toBeLessThan(SV_VIEW_H / 2);
  });

  it('segue quem joga e para na borda do campo', () => {
    expect(arenaCamera(SV_ARENA_W / 2, SV_ARENA_H / 2)).toEqual({ x: (SV_ARENA_W - SV_VIEW_W) / 2, y: (SV_ARENA_H - SV_VIEW_H) / 2 });
    expect(arenaCamera(0, 0)).toEqual({ x: 0, y: 0 });
    expect(arenaCamera(SV_ARENA_W, SV_ARENA_H)).toEqual({ x: SV_ARENA_W - SV_VIEW_W, y: SV_ARENA_H - SV_VIEW_H });
  });

  it('a seta só aparece para quem está fora da tela e fica dentro dela', () => {
    expect(offscreenPointer(100, 100)).toBeNull();
    const arrow = offscreenPointer(SV_VIEW_W + 300, SV_VIEW_H / 2)!;
    expect(arrow.x).toBeLessThan(SV_VIEW_W);
    expect(arrow.y).toBe(SV_VIEW_H / 2);
    expect(arrow.angle).toBeCloseTo(0);
  });
  it('a câmera puxa para o lado do rival sem perder quem joga', () => {
    const me = { x: SV_ARENA_W / 2, y: SV_ARENA_H / 2 };
    const centered = arenaCamera(me.x, me.y);
    const toward = arenaCameraTarget(me, { x: me.x, y: me.y - 400 });
    expect(toward.y).toBeLessThan(centered.y);
    expect(me.y - toward.y).toBeLessThan(SV_VIEW_H);
    expect(me.y - toward.y).toBeGreaterThan(0);
  });
});

describe('placar da luta', () => {
  it('conta o dano e os nocautes de quem atacou', () => {
    const s = createArena([mon('a', { power: 60, fireMs: 300, projectileSpeed: 600 })], [mon('b', { maxHp: 50, moveCategory: 'trilha', fireMs: 60_000 })]);
    s.countdownMs = 0;
    s.sides[1].y = s.sides[0].y - 120;
    s.sides[1].x = s.sides[0].x;
    for (let t = 0; t < 3000 && s.winner === null; t += 20) stepArena(s, [NO_INPUT, NO_INPUT], 20);
    expect(s.sides[0].mons[0]!.dealt).toBeGreaterThan(0);
    expect(s.sides[0].mons[0]!.kos).toBe(1);
  });
});
