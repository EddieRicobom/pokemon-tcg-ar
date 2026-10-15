import { describe, expect, it } from 'vitest';
import { seededRng } from './battle';
import {
  advanceRound, afterShot, affordable, arenaLimit, limitForRound, MIN_LIMIT, nextLimit, SHRINK_AFTER_ROUND, SHRINK_STEP, ARENA_RADIUS, aliveOf, buildPatches, canUse, chooseEnemyShot, clearEffects, cooldownFor, createWorld, effectForAttack, isSettled, launch,
  launchSpeed, layoutPins, massOf, MAX_MOVES, MAX_PER_SIDE, MAX_PULL, MIN_PULL, outcomeOf, pinFromSpec, previewPath, scoreMatch, shotFromDrag, stepWorld, STOP_SPEED, typeKnockback,
  typesOf, weightMass,
} from './pins';
import { cellOfWorld, createArenaGrid, frictionOfCell, stampType, terrainAffinity, TYPE_FOR_TERRAIN } from './pin-terrain';
import type { Patch, Pin, PinEvent, PinSpec, PinWorld } from './pins';
import { TERRAIN_FOR_TYPE, TERRAIN_KINDS } from './terrain';
import type { TerrainGrid, TerrainKind } from './terrain';
import type { BaseStats, PokemonType } from './pokemon-data';

const stats = (over: Partial<BaseStats> = {}): BaseStats => ({ hp: 70, attack: 70, defense: 70, spAttack: 70, spDefense: 70, speed: 70, ...over });
const spec = (id: string, over: Partial<PinSpec> = {}): PinSpec => ({ id, name: id, types: ['normal'], stats: stats(), weightKg: 30, ...over });

function world(pins: Pin[], patches: Patch[] = []): PinWorld {
  return { radius: ARENA_RADIUS, patches, pins, time: 0 };
}
/** Chão liso de grama, todo coberto por `kind` (ou sem marca). */
function flatGrid(kind: TerrainKind | null = null): TerrainGrid {
  const grid = createArenaGrid(1);
  grid.base.fill(0);
  grid.over.fill(kind ? TERRAIN_KINDS.indexOf(kind) + 1 : 0);
  return grid;
}
function worldOn(pins: Pin[], terrain: TerrainGrid | null, markRng = seededRng(1)): PinWorld {
  return { radius: ARENA_RADIUS, patches: [], pins, time: 0, terrain, markRng };
}
function pinAt(id: string, side: 0 | 1, x: number, y: number, over: Partial<PinSpec> = {}): Pin {
  const pin = pinFromSpec(spec(id, over), side);
  pin.x = x;
  pin.y = y;
  return pin;
}
function run(w: PinWorld, seconds: number) {
  const events: PinEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 120) stepWorld(w, 1 / 120, events);
  return events;
}

describe('pin a partir do Pokémon', () => {
  it('peso vira massa e tamanho: o pesado é maior e difícil de mover', () => {
    const light = pinFromSpec(spec('l', { weightKg: 0.8 }), 0);
    const heavy = pinFromSpec(spec('h', { weightKg: 460 }), 0);
    expect(heavy.mass).toBeGreaterThan(light.mass * 5);
    expect(heavy.r).toBeGreaterThan(light.r);
    expect(weightMass(0.8)).toBe(0.6);
    expect(weightMass(460)).toBe(6);
  });

  it('ataque dá empurrão, velocidade dá disparo e resistência soma à massa', () => {
    const base = pinFromSpec(spec('a'), 0);
    expect(pinFromSpec(spec('b', { stats: stats({ attack: 130 }) }), 0).punch).toBeGreaterThan(base.punch);
    expect(pinFromSpec(spec('c', { stats: stats({ spAttack: 130 }) }), 0).punch).toBeGreaterThan(base.punch);
    expect(pinFromSpec(spec('d', { stats: stats({ speed: 130 }) }), 0).shot).toBeGreaterThan(base.shot);
    expect(pinFromSpec(spec('e', { stats: stats({ hp: 150, defense: 150, spDefense: 150 }) }), 0).mass).toBeGreaterThan(base.mass);
  });

  it('pins mais fortes custam mais energia, dentro de 5 a 40', () => {
    const weak = pinFromSpec(spec('w', { stats: stats({ hp: 30, attack: 30, defense: 30, spAttack: 30, spDefense: 30, speed: 30 }), weightKg: 1 }), 0);
    const strong = pinFromSpec(spec('s', { stats: stats({ hp: 106, attack: 110, defense: 90, spAttack: 154, spDefense: 90, speed: 130 }), weightKg: 122 }), 0);
    expect(weak.cost).toBeGreaterThanOrEqual(5);
    expect(strong.cost).toBeLessThanOrEqual(40);
    expect(strong.cost).toBeGreaterThan(weak.cost + 15);
    expect(strong.rating).toBeGreaterThan(weak.rating);
  });

  it('sem atributos ou sem peso o pin é neutro e marcado como estimado', () => {
    expect(pinFromSpec(spec('x', { stats: null }), 0).estimated).toBe(true);
    expect(pinFromSpec(spec('y', { weightKg: null }), 0).estimated).toBe(true);
    expect(pinFromSpec(spec('z'), 0).estimated).toBe(false);
  });
});

describe('chão e tipos', () => {
  it('gelo escorrega, lama prende e o tipo certo ignora a marca', () => {
    const frost = flatGrid('frost');
    const toxic = flatGrid('toxic');
    const puddle = flatGrid('puddle');
    const i = frost.index(11, 11);
    expect(frictionOfCell(frost, i, ['normal'])).toBeLessThan(0.2);
    expect(frictionOfCell(toxic, i, ['normal'])).toBeGreaterThan(3);
    expect(frictionOfCell(frost, i, ['ice'])).toBe(1);
    expect(frictionOfCell(toxic, i, ['poison'])).toBe(1);
    expect(frictionOfCell(puddle, i, ['water'])).toBe(1);
    expect(frictionOfCell(puddle, i, ['fire'])).toBeGreaterThan(frictionOfCell(puddle, i, ['normal']));
  });

  it('voador e fantasma pairam sobre qualquer marca; um tipo imune basta', () => {
    expect(terrainAffinity(['flying'], 'toxic')).toBe(0.3);
    expect(terrainAffinity(['normal', 'ghost'], 'thicket')).toBe(0.4);
    expect(terrainAffinity(['fire', 'flying'], 'puddle')).toBe(0.3);
    expect(terrainAffinity(['grass', 'poison'], 'thicket')).toBe(0.2);
    expect(terrainAffinity([], 'frost')).toBe(1);
  });

  it('o chão base também mexe no atrito: mato alto segura e a trilha solta', () => {
    const grid = createArenaGrid(1);
    grid.over.fill(0);
    grid.base.fill(0);
    const i = grid.index(11, 11);
    const grass = frictionOfCell(grid, i, ['normal']);
    grid.base[i] = 3; // mato alto
    expect(frictionOfCell(grid, i, ['normal'])).toBeGreaterThan(grass);
    grid.base[i] = 4; // trilha
    expect(frictionOfCell(grid, i, ['normal'])).toBeLessThan(grass);
  });

  it('vantagem de tipos aumenta o empurrão e imunidade diminui', () => {
    expect(typeKnockback(['water'], ['fire'])).toBe(1.2);
    expect(typeKnockback(['fighting'], ['ghost'])).toBe(0.75);
    expect(typeKnockback(['fire'], ['water'])).toBe(0.9);
    expect(typeKnockback(['normal'], ['normal'])).toBe(1);
    expect(typeKnockback(['rock'], ['fire', 'flying'])).toBe(1.4);
    expect(typeKnockback([], ['fire'])).toBe(1);
  });
});

describe('física', () => {
  it('o pin desliza mais no gelo e para antes na lama', () => {
    const run400 = (grid: TerrainGrid | null) => {
      const w = worldOn([pinAt('a', 0, -150, 0)], grid);
      w.markRng = null;
      w.pins[0]!.vx = 400;
      run(w, 0.8);
      return w.pins[0]!.x;
    };
    const grass = run400(flatGrid());
    expect(run400(flatGrid('frost'))).toBeGreaterThan(grass + 40);
    expect(run400(flatGrid('toxic'))).toBeLessThan(grass - 40);
    // Sem grade o chão é o comum.
    expect(run400(null)).toBeCloseTo(grass, 0);
  });

  it('o pin chega ao repouso e a arena é dada como assentada', () => {
    const w = world([pinAt('a', 0, 0, 100)]);
    w.pins[0]!.vx = 500;
    expect(isSettled(w)).toBe(false);
    run(w, 4);
    expect(isSettled(w)).toBe(true);
    expect(Math.hypot(w.pins[0]!.vx, w.pins[0]!.vy)).toBeLessThan(STOP_SPEED);
  });

  it('colisão: o pesado empurra o leve mais do que o leve empurra o pesado', () => {
    const light = pinAt('l', 0, -80, 0, { weightKg: 2 });
    const heavy = pinAt('h', 1, 80, 0, { weightKg: 300 });
    light.vx = 500;
    const w = world([light, heavy]);
    run(w, 0.3);
    expect(light.vx).toBeLessThan(0);
    expect(heavy.vx).toBeGreaterThan(0);
    expect(Math.abs(light.vx)).toBeGreaterThan(Math.abs(heavy.vx));
  });

  it('o mais forte e com vantagem de tipos empurra o outro mais longe', () => {
    const hit = (types: PokemonType[]) => {
      const a = pinAt('a', 0, -60, 0, { types: ['water'] });
      const b = pinAt('b', 1, 60, 0, { types });
      a.vx = 500;
      const w = world([a, b]);
      run(w, 0.2);
      return b.vx;
    };
    expect(hit(['fire'])).toBeGreaterThan(hit(['water']));
    expect(hit(['water'])).toBeGreaterThan(hit(['grass']) * 0.95);
  });

  it('avisa o choque e a vantagem de tipos', () => {
    const a = pinAt('a', 0, -60, 0, { types: ['water'] });
    const b = pinAt('b', 1, 60, 0, { types: ['fire'] });
    a.vx = 600;
    const events = run(world([a, b]), 0.2);
    const hit = events.find((e) => e.type === 'hit');
    expect(hit).toMatchObject({ type: 'hit', edge: 'super' });
  });

  it('o pin que passa da borda cai e deixa de contar', () => {
    const a = pinAt('a', 0, ARENA_RADIUS - 10, 0);
    a.vx = 300;
    const w = world([a, pinAt('b', 1, 0, -200)]);
    const events = run(w, 1.5);
    expect(events.some((e) => e.type === 'out' && e.id === 'a')).toBe(true);
    expect(a.alive).toBe(false);
    expect(aliveOf(w, 0)).toHaveLength(0);
    expect(outcomeOf(w)).toBe('lost');
  });

  it('vence quem derruba todos os adversários', () => {
    const w = world([pinAt('a', 0, 0, 0), pinAt('b', 1, ARENA_RADIUS + 5, 0)]);
    run(w, 1);
    expect(outcomeOf(w)).toBe('won');
  });

  it('o pino de mola rebate mais forte', () => {
    const bump = world([pinAt('a', 0, -120, 0)], [{ kind: 'bumper', x: 0, y: 0, r: 30, angle: 0 }]);
    bump.pins[0]!.vx = 300;
    const events = run(bump, 0.6);
    expect(events.some((e) => e.type === 'bumper')).toBe(true);
    expect(bump.pins[0]!.vx).toBeLessThan(0);
  });

  it('é repetível: o mesmo disparo dá o mesmo resultado', () => {
    const make = () => {
      const a = pinAt('a', 0, -100, 0);
      const b = pinAt('b', 1, 100, 10);
      launch(a, { dirX: 1, dirY: 0.05, power: 0.8 });
      const w = world([a, b]);
      run(w, 3);
      return w.pins.map((p) => [p.x.toFixed(4), p.y.toFixed(4)]);
    };
    expect(make()).toEqual(make());
  });
});

describe('disparo de estilingue', () => {
  it('o pin sai para o lado contrário do arrasto e a força cresce com a distância', () => {
    const shot = shotFromDrag(0, 0, 0, 75)!;
    expect(shot.dirX).toBeCloseTo(0);
    expect(shot.dirY).toBe(-1);
    expect(shot.power).toBeCloseTo(0.5);
    expect(shotFromDrag(0, 0, 0, MAX_PULL * 3)!.power).toBe(1);
    expect(shotFromDrag(0, 0, 3, 3)).toBeNull();
    expect(shotFromDrag(0, 0, MIN_PULL, 0)).not.toBeNull();
  });

  it('o pin mais veloz sai mais rápido com a mesma força', () => {
    const slow = pinFromSpec(spec('s', { stats: stats({ speed: 20 }) }), 0);
    const fast = pinFromSpec(spec('f', { stats: stats({ speed: 130 }) }), 0);
    const shot = { dirX: 1, dirY: 0, power: 1 };
    expect(launchSpeed(fast, shot)).toBeGreaterThan(launchSpeed(slow, shot));
    launch(fast, shot);
    expect(fast.vx).toBeGreaterThan(0);
    expect(fast.vy).toBeCloseTo(0);
  });

  it('um disparo com força máxima atravessa a arena no chão comum', () => {
    const pin = pinAt('a', 0, 0, 270);
    const w = world([pin]);
    launch(pin, { dirX: 0, dirY: -1, power: 1 });
    run(w, 6);
    expect(pin.alive).toBe(false);
  });

  it('a prévia mostra o caminho sem mexer no pin', () => {
    const pin = pinAt('a', 0, 0, 200);
    const w = world([pin]);
    const { points, falls } = previewPath(w, pin, { dirX: 0, dirY: -1, power: 0.3 });
    expect(points.length).toBeGreaterThan(3);
    expect(points[points.length - 1]!.y).toBeLessThan(200);
    expect(falls).toBe(false);
    expect(pin.y).toBe(200);
    expect(pin.vy).toBe(0);
    expect(previewPath(w, pin, { dirX: 1, dirY: 0, power: 1 }).falls).toBe(true);
  });
});

describe('arena e adversário', () => {
  it('os elementos do chão ficam dentro da arena e sem se sobrepor', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const patches = buildPatches(seededRng(seed));
      expect(patches.length).toBeGreaterThanOrEqual(1);
      for (const p of patches) expect(Math.hypot(p.x, p.y)).toBeLessThan(ARENA_RADIUS * 0.82);
      for (let i = 0; i < patches.length; i++) {
        for (let j = i + 1; j < patches.length; j++) {
          expect(Math.hypot(patches[i]!.x - patches[j]!.x, patches[i]!.y - patches[j]!.y)).toBeGreaterThan(patches[i]!.r + patches[j]!.r);
        }
      }
    }
  });

  it('os elementos do chão evitam os pontos que pedem folga', () => {
    const avoid = [{ x: 0, y: 0, r: 120 }];
    for (let seed = 1; seed <= 20; seed++) {
      for (const p of buildPatches(seededRng(seed), ARENA_RADIUS, avoid)) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(120 + p.r);
    }
  });

  it('cada lado leva no máximo o seu limite, em lados opostos e dentro da arena', () => {
    const many = (n: number, p: string) => Array.from({ length: n }, (_, i) => spec(`${p}${i}`));
    const w = createWorld({ mine: many(9, 'm'), enemy: many(15, 'e') }, seededRng(3));
    expect(aliveOf(w, 0)).toHaveLength(MAX_PER_SIDE[0]);
    expect(aliveOf(w, 1)).toHaveLength(MAX_PER_SIDE[1]);
    for (const p of w.pins) expect(Math.hypot(p.x, p.y)).toBeLessThan(ARENA_RADIUS - p.r);
    for (const p of w.pins) expect(p.side === 0 ? p.y > 0 : p.y < 0).toBe(true);
    // Ninguém nasce em cima de ninguém.
    for (let i = 0; i < w.pins.length; i++) {
      for (let j = i + 1; j < w.pins.length; j++) {
        expect(Math.hypot(w.pins[i]!.x - w.pins[j]!.x, w.pins[i]!.y - w.pins[j]!.y)).toBeGreaterThan(w.pins[i]!.r + w.pins[j]!.r);
      }
    }
    // Nenhum elemento do chão cobre quem está começando.
    for (const p of w.pins) for (const patch of w.patches) expect(Math.hypot(p.x - patch.x, p.y - patch.y)).toBeGreaterThan(patch.r + p.r * 0.2);
  });

  it('o adversário escolhe um pin dele e mira num dos seus', () => {
    const w = createWorld({ mine: [spec('m1'), spec('m2')], enemy: [spec('e1'), spec('e2'), spec('e3')] }, seededRng(5));
    const choice = chooseEnemyShot(w, seededRng(1), 'normal')!;
    const pin = w.pins.find((p) => p.id === choice.pinId)!;
    expect(pin.side).toBe(1);
    expect(choice.shot.power).toBeGreaterThanOrEqual(0.4);
    expect(choice.shot.power).toBeLessThanOrEqual(1);
    // Mira para baixo (para o lado onde você está).
    expect(choice.shot.dirY).toBeGreaterThan(0);
  });

  it('a dificuldade muda a pontaria', () => {
    const w = createWorld({ mine: [spec('m1')], enemy: [spec('e1')] }, seededRng(5));
    const spread = (difficulty: 'facil' | 'dificil') => {
      const angles = Array.from({ length: 60 }, (_, i) => {
        const c = chooseEnemyShot(w, seededRng(i + 1), difficulty)!;
        return Math.atan2(c.shot.dirY, c.shot.dirX);
      });
      const mean = angles.reduce((a, b) => a + b, 0) / angles.length;
      return Math.sqrt(angles.reduce((a, b) => a + (b - mean) ** 2, 0) / angles.length);
    };
    expect(spread('facil')).toBeGreaterThan(spread('dificil') * 2);
  });

  it('sem alvo ou sem pins, o adversário não dispara', () => {
    expect(chooseEnemyShot(world([pinAt('e', 1, 0, -100)]), seededRng(1), 'normal')).toBeNull();
    expect(chooseEnemyShot(world([pinAt('m', 0, 0, 100)]), seededRng(1), 'normal')).toBeNull();
  });

  it('o adversário acerta o seu pin com frequência no difícil', () => {
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = createWorld({ mine: [spec('m1')], enemy: [spec('e1')] }, seededRng(100));
      w.patches = [];
      w.terrain = null;
      const choice = chooseEnemyShot(w, seededRng(seed), 'dificil')!;
      launch(w.pins.find((p) => p.id === choice.pinId)!, choice.shot);
      const ev = run(w, 3);
      if (ev.some((e) => e.type === 'hit')) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(15);
  });
});

describe('energia e nota', () => {
  it('só dá para disparar com o pin que a energia paga', () => {
    const cheap = pinAt('c', 0, 0, 100, { stats: stats({ hp: 30, attack: 30, defense: 30, spAttack: 30, spDefense: 30, speed: 30 }), weightKg: 1 });
    const dear = pinAt('d', 0, 100, 100, { stats: stats({ hp: 120, attack: 120, defense: 120, spAttack: 120, spDefense: 120, speed: 120 }), weightKg: 200 });
    const w = world([cheap, dear]);
    expect(affordable(w, 0)).toHaveLength(0);
    expect(affordable(w, cheap.cost).map((p) => p.id)).toEqual(['c']);
    expect(affordable(w, 100).map((p) => p.id)).toEqual(['c', 'd']);
  });

  it('a nota premia poucos disparos e a derrota vale zero', () => {
    expect(scoreMatch(false, 3, 3)).toBe(0);
    expect(scoreMatch(true, 3, 3)).toBe(100);
    expect(scoreMatch(true, 8, 3)).toBeLessThan(scoreMatch(true, 5, 3));
    expect(scoreMatch(true, 99, 3)).toBe(20);
  });

  it('o layout não deixa pins sobrepostos, mesmo com 10 pesados num lado', () => {
    const pins = Array.from({ length: 10 }, (_, i) => pinFromSpec(spec(`m${i}`, { weightKg: 400 }), 1));
    layoutPins(pins);
    for (let i = 0; i < pins.length; i++) {
      expect(Math.hypot(pins[i]!.x, pins[i]!.y)).toBeLessThan(ARENA_RADIUS - pins[i]!.r);
      for (let j = i + 1; j < pins.length; j++) expect(Math.hypot(pins[i]!.x - pins[j]!.x, pins[i]!.y - pins[j]!.y)).toBeGreaterThan(pins[i]!.r + pins[j]!.r);
    }
  });
});

describe('golpes da carta no disparo', () => {
  const atk = (name: string, cost: string[], damage?: string) => ({ name, cost, damage });
  const withMoves = (id: string, side: 0 | 1, x: number, y: number, attacks: ReturnType<typeof atk>[], over: Partial<PinSpec> = {}) => {
    const pin = pinFromSpec(spec(id, { attacks, ...over }), side);
    pin.x = x;
    pin.y = y;
    return pin;
  };

  it('cada ataque vira um efeito pelo dano e pelo custo impressos', () => {
    expect(effectForAttack(atk('Apoio', ['Colorless'])).kind).toBe('escudo');
    expect(effectForAttack(atk('Apoio', ['Colorless'], '')).kind).toBe('escudo');
    expect(effectForAttack(atk('Forte', ['Fire', 'Fire', 'Colorless', 'Colorless'], '120')).kind).toBe('onda');
    expect(effectForAttack(atk('Médio', ['Water', 'Colorless'], '60')).kind).toBe('impacto');
    expect(effectForAttack(atk('Leve', ['Colorless'], '20')).kind).toBe('turbo');
    expect(effectForAttack(atk('Elétrico', ['Lightning', 'Colorless'], '30'))).toEqual({ kind: 'elemental', type: 'electric' });
    expect(effectForAttack(atk('Incolor', ['Colorless', 'Colorless'], '30')).kind).toBe('turbo');
    expect(effectForAttack(atk('Incolor', ['Colorless', 'Colorless'], '50'), 'psychic')).toEqual({ kind: 'elemental', type: 'psychic' });
  });

  it('a recarga cresce com a energia da carta, de 1 a 4', () => {
    expect(cooldownFor(atk('a', ['Colorless']))).toBe(1);
    expect(cooldownFor(atk('b', ['Fire', 'Colorless', 'Colorless']))).toBe(3);
    expect(cooldownFor(atk('c', ['Fire', 'Fire', 'Fire', 'Fire', 'Fire']))).toBe(4);
    expect(cooldownFor(atk('d', []))).toBe(1);
  });

  it('o pin ganha até 4 golpes da carta, com efeito e recarga', () => {
    const pin = withMoves('a', 0, 0, 0, [atk('1', ['Fire'], '10'), atk('2', ['Fire'], '10'), atk('3', ['Fire'], '10'), atk('4', ['Fire'], '10'), atk('5', ['Fire'], '10')]);
    expect(pin.moves).toHaveLength(MAX_MOVES);
    expect(pin.cooldowns).toEqual([0, 0, 0, 0]);
    expect(pinFromSpec(spec('x'), 0).moves).toEqual([]);
  });

  it('sem golpe escolhido o disparo é normal e com golpe muda a velocidade', () => {
    const shot = { dirX: 1, dirY: 0, power: 1 };
    const pin = withMoves('a', 0, 0, 0, [atk('Leve', ['Colorless'], '20'), atk('Forte', ['Fire', 'Fire', 'Fire'], '130')]);
    const normal = launchSpeed(pin, shot);
    expect(launch(pin, shot)).toBe(true);
    expect(pin.active).toBeNull();
    expect(pin.vx).toBeCloseTo(normal);
    expect(launch(pin, shot, 0)).toBe(true);
    expect(pin.vx).toBeGreaterThan(normal * 1.3);
    expect(pin.active?.kind).toBe('turbo');
    expect(launch(pin, shot, 1)).toBe(true);
    expect(pin.vx).toBeLessThan(normal);
    expect(launch(pin, shot, 7)).toBe(false);
  });

  it('o golpe usado espera os disparos da recarga, contados só entre os do mesmo lado', () => {
    const w = world([withMoves('a', 0, 0, 100, [atk('Leve', ['Colorless'], '20'), atk('Pesado', ['Fire', 'Fire', 'Fire'], '30')]), pinAt('e', 1, 0, -100)]);
    const pin = w.pins[0]!;
    const shot = { dirX: 0, dirY: -1, power: 0.2 };
    expect(launch(pin, shot, 1)).toBe(true);
    afterShot(w, 0, { pinId: 'a', moveIndex: 1 });
    expect(pin.cooldowns).toEqual([0, 3]);
    // O disparo do adversário não conta para a sua recarga.
    afterShot(w, 1, null);
    expect(pin.cooldowns).toEqual([0, 3]);
    expect(canUse(pin, 1)).toBe(false);
    expect(launch(pin, shot, 1)).toBe(false);
    afterShot(w, 0, { pinId: 'a', moveIndex: null });
    afterShot(w, 0, null);
    expect(pin.cooldowns[1]).toBe(1);
    afterShot(w, 0, null);
    expect(canUse(pin, 1)).toBe(true);
    // O disparo normal nunca espera.
    expect(canUse(pin, null)).toBe(true);
  });

  it('o escudo deixa o pin firme até a resposta e depois some', () => {
    const w = world([withMoves('a', 0, 0, 100, [atk('Apoio', ['Colorless'])])]);
    const pin = w.pins[0]!;
    const plain = massOf(pin);
    launch(pin, { dirX: 0, dirY: -1, power: 0.1 }, 0);
    expect(massOf(pin)).toBeGreaterThan(plain * 2);
    clearEffects(w, true);
    expect(pin.active?.kind).toBe('escudo');
    clearEffects(w, false);
    expect(pin.active).toBeNull();
    expect(massOf(pin)).toBe(plain);
  });

  it('um pin com escudo é empurrado bem menos', () => {
    const push = (guard: boolean) => {
      const target = withMoves('t', 1, 60, 0, [atk('Apoio', ['Colorless'])]);
      if (guard) target.active = { kind: 'escudo', type: null };
      const hitter = pinAt('h', 0, -60, 0);
      hitter.vx = 600;
      run(world([hitter, target]), 0.2);
      return target.vx;
    };
    expect(push(true)).toBeLessThan(push(false) * 0.6);
  });

  it('o Elemental passa a valer o tipo do golpe nas colisões', () => {
    const hit = (moveIndex: number | null) => {
      const a = withMoves('a', 0, -60, 0, [atk('Brasa', ['Fire', 'Colorless'], '30')], { types: ['normal'] });
      const b = pinAt('b', 1, 60, 0, { types: ['grass'] });
      launch(a, { dirX: 1, dirY: 0, power: 0.7 }, moveIndex);
      run(world([a, b]), 0.2);
      return b.vx;
    };
    expect(typesOf(withMoves('a', 0, 0, 0, [atk('Brasa', ['Fire', 'Colorless'], '30')]))).toEqual(['normal']);
    expect(hit(0)).toBeGreaterThan(hit(null));
  });

  it('a Onda empurra quem está perto no primeiro choque, uma vez só', () => {
    const a = withMoves('a', 0, -150, 0, [atk('Estrondo', ['Fire', 'Fire', 'Fire'], '140')]);
    const b = pinAt('b', 1, 0, 0);
    const near = pinAt('n', 1, 0, 90);
    const far = pinAt('f', 1, 0, -300);
    launch(a, { dirX: 1, dirY: 0, power: 0.8 }, 0);
    const events = run(world([a, b, near, far]), 0.3);
    expect(events.filter((e) => e.type === 'wave')).toHaveLength(1);
    expect(near.vy).toBeGreaterThan(10);
    expect(far.vy).toBe(0);
    expect(a.active?.used).toBe(true);
  });

  it('o Rápido desliza mais longe no chão comum', () => {
    const dist = (moveIndex: number | null) => {
      const pin = withMoves('a', 0, 0, 0, [atk('Leve', ['Colorless'], '20')]);
      launch(pin, { dirX: 1, dirY: 0, power: 0.4 }, moveIndex);
      run(world([pin]), 4);
      return pin.x;
    };
    expect(dist(0)).toBeGreaterThan(dist(null) * 1.4);
  });

  it('a prévia acompanha o efeito e não gasta a recarga', () => {
    const pin = withMoves('a', 0, 0, 300, [atk('Leve', ['Colorless'], '20')]);
    const w = world([pin]);
    const shot = { dirX: 0, dirY: -1, power: 0.4 };
    const plain = previewPath(w, pin, shot, null).points.at(-1)!;
    const fast = previewPath(w, pin, shot, 0).points.at(-1)!;
    expect(fast.y).toBeLessThan(plain.y - 30);
    expect(pin.cooldowns).toEqual([0]);
    expect(pin.active).toBeNull();
  });

  it('o adversário também usa golpes prontos e respeita a recarga', () => {
    const w = createWorld({ mine: [spec('m')], enemy: [spec('e', { attacks: [atk('Leve', ['Colorless'], '20')] })] }, seededRng(7));
    let used = 0;
    for (let i = 1; i <= 80; i++) if (chooseEnemyShot(w, seededRng(i), 'dificil')!.moveIndex === 0) used++;
    expect(used).toBeGreaterThan(30);
    expect(used).toBeLessThan(80);
    w.pins.find((p) => p.id === 'e')!.cooldowns = [2];
    for (let i = 1; i <= 30; i++) expect(chooseEnemyShot(w, seededRng(i), 'dificil')!.moveIndex).toBeNull();
  });
});

describe('marcas no chão (como na batalha da Caixa)', () => {
  const atk = (name: string, cost: string[], damage?: string) => ({ name, cost, damage });
  const movePin = (id: string, side: 0 | 1, x: number, y: number, attacks: ReturnType<typeof atk>[], types: PokemonType[] = ['fire']) => {
    const pin = pinFromSpec(spec(id, { attacks, types }), side);
    pin.x = x;
    pin.y = y;
    return pin;
  };
  const marksOf = (events: PinEvent[]) => events.filter((e): e is Extract<PinEvent, { type: 'mark' }> => e.type === 'mark');

  it('cada marca tem um tipo que a deixa (para o som)', () => {
    for (const kind of TERRAIN_KINDS) expect(TERRAIN_FOR_TYPE[TYPE_FOR_TERRAIN[kind]]).toBe(kind);
  });

  it('o ponto do mundo cai no bloco certo (y negativo = alto da tela = linha 0)', () => {
    const grid = flatGrid();
    stampType(grid, ARENA_RADIUS, 'fire', 0, -250, 0.6, seededRng(1));
    const top = cellOfWorld(grid, ARENA_RADIUS, 0, -250)!;
    const bottom = cellOfWorld(grid, ARENA_RADIUS, 0, 250)!;
    expect(grid.overlayAt(top)).toBe('scorch');
    expect(grid.overlayAt(bottom)).toBeNull();
    expect(Math.floor(top / grid.cols)).toBeLessThan(grid.rows / 2);
    expect(cellOfWorld(grid, ARENA_RADIUS, 0, ARENA_RADIUS + 50)).toBeNull();
  });

  it('o pin elemental deixa um rastro do tipo do golpe e avisa a tela', () => {
    const grid = flatGrid();
    const pin = movePin('a', 0, -200, 0, [atk('Brasa', ['Fire', 'Colorless'], '30')]);
    const w = worldOn([pin], grid);
    expect(launch(pin, { dirX: 1, dirY: 0, power: 1 }, 0)).toBe(true);
    const events = run(w, 1);
    const marks = marksOf(events);
    expect(marks.length).toBeGreaterThanOrEqual(3);
    expect(marks.every((m) => m.kind === 'scorch')).toBe(true);
    expect(grid.counts().scorch ?? 0).toBeGreaterThan(10);
    // O rastro vai da saída até onde o pin parou.
    expect(grid.overlayAt(cellOfWorld(grid, ARENA_RADIUS, -190, 0)!)).toBe('scorch');
  });

  it('disparo normal, Rápido e tipos sem marca não mexem no chão', () => {
    for (const [attacks, types, move] of [
      [[atk('Brasa', ['Fire', 'Colorless'], '30')], ['fire'], null],
      [[atk('Leve', ['Colorless'], '20')], ['fire'], 0],
      [[atk('Tapa', ['Colorless', 'Colorless'], '30')], ['normal'], 0],
    ] as const) {
      const grid = flatGrid();
      const pin = movePin('a', 0, -200, 0, [...attacks], [...types]);
      launch(pin, { dirX: 1, dirY: 0, power: 1 }, move);
      run(worldOn([pin], grid), 1);
      expect(grid.counts()).toEqual({});
    }
  });

  it('sem sorteio de marcas (opção desligada ou mira) o chão não muda', () => {
    const grid = flatGrid();
    const pin = movePin('a', 0, -200, 0, [atk('Brasa', ['Fire', 'Colorless'], '30')]);
    launch(pin, { dirX: 1, dirY: 0, power: 1 }, 0);
    const w = worldOn([pin], grid);
    w.markRng = null;
    expect(marksOf(run(w, 1))).toHaveLength(0);
    expect(grid.counts()).toEqual({});
  });

  it('a mira só lê o chão', () => {
    const grid = flatGrid('frost');
    const before = Buffer.from(grid.over);
    const pin = movePin('a', 0, 0, 200, [atk('Brasa', ['Fire', 'Colorless'], '30')]);
    const w = worldOn([pin], grid);
    const path = previewPath(w, pin, { dirX: 0, dirY: -1, power: 0.8 }, 0);
    expect(path.points.length).toBeGreaterThan(2);
    expect(Buffer.from(grid.over).equals(before)).toBe(true);
    expect(pin.lastMark).toBeNull();
  });

  it('no gelo a mira prevê um caminho mais longo', () => {
    const reach = (grid: TerrainGrid) => {
      const pin = pinAt('a', 0, 0, 250);
      const w = worldOn([pin], grid);
      const p = previewPath(w, pin, { dirX: 0, dirY: -1, power: 0.5 });
      return -p.points[p.points.length - 1]!.y;
    };
    expect(reach(flatGrid('frost'))).toBeGreaterThan(reach(flatGrid()) + 60);
  });

  it('o primeiro choque do elemental faz um borrão grande no contato, uma vez só', () => {
    const grid = flatGrid();
    const a = movePin('a', 0, -80, 0, [atk('Pulso', ['Psychic', 'Colorless'], '40')], ['psychic']);
    const b = pinAt('b', 1, 80, 0);
    const w = worldOn([a, b], grid);
    launch(a, { dirX: 1, dirY: 0, power: 1 }, 0);
    const events = run(w, 0.5);
    const splashes = marksOf(events).filter((m) => m.cells.length > 12);
    expect(splashes).toHaveLength(1);
    expect(a.active?.used).toBe(true);
    expect(events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('a Pancada racha o chão onde bate', () => {
    const grid = flatGrid();
    const a = movePin('a', 0, -80, 0, [atk('Soco', ['Colorless', 'Colorless'], '70')], ['fighting']);
    const b = pinAt('b', 1, 80, 0);
    launch(a, { dirX: 1, dirY: 0, power: 1 }, 0);
    expect(a.active?.kind).toBe('impacto');
    const events = run(worldOn([a, b], grid), 0.5);
    expect(marksOf(events).map((m) => m.kind)).toEqual(['crack']);
    expect(grid.counts().crack ?? 0).toBeGreaterThan(5);
  });

  it('fogo sobre poça faz o chão reagir e empurra quem está perto', () => {
    const grid = flatGrid();
    stampType(grid, ARENA_RADIUS, 'water', 0, 0, 1.6, seededRng(2));
    const a = movePin('a', 0, -90, 0, [atk('Brasa', ['Fire', 'Colorless'], '30')]);
    const b = pinAt('b', 1, 60, 0);
    const bystander = pinAt('c', 1, 20, 90);
    const w = worldOn([a, b, bystander], grid);
    launch(a, { dirX: 1, dirY: 0, power: 0.8 }, 0);
    const events = run(w, 0.4);
    const reaction = marksOf(events).find((m) => m.reaction);
    expect(reaction?.reaction?.text).toBe('A poça evaporou!');
    expect(Math.hypot(bystander.vx, bystander.vy) + Math.abs(bystander.y - 90)).toBeGreaterThan(5);
  });

  it('o adversário também marca o chão com os golpes dele', () => {
    const grid = flatGrid();
    const e = movePin('e', 1, 0, -200, [atk('Jato', ['Water', 'Colorless'], '30')], ['water']);
    launch(e, { dirX: 0, dirY: 1, power: 1 }, 0);
    run(worldOn([e, pinAt('m', 0, 0, 250)], grid), 1);
    expect(grid.counts().puddle ?? 0).toBeGreaterThan(10);
  });

  it('é repetível: o mesmo disparo marca o mesmo chão', () => {
    const make = () => {
      const grid = flatGrid();
      const a = movePin('a', 0, -150, 0, [atk('Brasa', ['Fire', 'Colorless'], '30')]);
      launch(a, { dirX: 1, dirY: 0.1, power: 0.9 }, 0);
      run(worldOn([a, pinAt('b', 1, 100, 20)], grid, seededRng(9)), 2);
      return Buffer.from(grid.over).toString('hex');
    };
    expect(make()).toBe(make());
  });

  it('a arena já começa com algumas marcas longe de quem começa; desligar deixa só o chão base', () => {
    const specs = { mine: [spec('m1'), spec('m2')], enemy: [spec('e1'), spec('e2')] };
    for (let seed = 1; seed <= 10; seed++) {
      const w = createWorld(specs, seededRng(seed));
      expect(w.terrain).toBeTruthy();
      expect(w.markRng).toBeTruthy();
      expect(Object.keys(w.terrain!.counts()).length).toBeGreaterThanOrEqual(3);
      for (const p of w.pins) {
        const i = cellOfWorld(w.terrain!, w.radius, p.x, p.y)!;
        expect(w.terrain!.overlayAt(i)).toBeNull();
      }
      const off = createWorld(specs, seededRng(seed), { marks: false });
      expect(off.terrain!.counts()).toEqual({});
      expect(off.markRng).toBeNull();
    }
  });
});

describe('borda que encolhe', () => {
  const shrinkWorld = (pins: Pin[], patches: Patch[] = []): PinWorld => ({ ...world(pins, patches), limit: ARENA_RADIUS, round: 0, shrinking: true });

  it('as primeiras rodadas são de aquecimento e depois a borda avança até um mínimo', () => {
    expect(limitForRound(ARENA_RADIUS, 0)).toBe(ARENA_RADIUS);
    expect(limitForRound(ARENA_RADIUS, SHRINK_AFTER_ROUND - 1)).toBe(ARENA_RADIUS);
    expect(limitForRound(ARENA_RADIUS, SHRINK_AFTER_ROUND)).toBe(ARENA_RADIUS - SHRINK_STEP);
    expect(limitForRound(ARENA_RADIUS, SHRINK_AFTER_ROUND + 1)).toBe(ARENA_RADIUS - 2 * SHRINK_STEP);
    expect(limitForRound(ARENA_RADIUS, 99)).toBe(MIN_LIMIT);
  });

  it('avisa o próximo raio com antecedência e não avisa quando desligada', () => {
    const w = shrinkWorld([pinAt('a', 0, 0, 100)]);
    expect(nextLimit(w)).toBeNull();
    w.round = SHRINK_AFTER_ROUND - 1;
    expect(nextLimit(w)).toBe(ARENA_RADIUS - SHRINK_STEP);
    w.shrinking = false;
    expect(nextLimit(w)).toBeNull();
  });

  it('ao fechar a rodada a borda avança, quem fica além cai e os pinos de mola do vazio somem', () => {
    const inside = pinAt('in', 0, 0, 100);
    const edge = pinAt('edge', 0, ARENA_RADIUS - 20, 0);
    const bumpers: Patch[] = [
      { kind: 'bumper', x: 0, y: -100, r: 25, angle: 0 },
      { kind: 'bumper', x: ARENA_RADIUS - 40, y: 0, r: 25, angle: 0 },
    ];
    const w = shrinkWorld([inside, edge, pinAt('e', 1, 0, -200)], bumpers);
    w.round = SHRINK_AFTER_ROUND - 1;
    const events = advanceRound(w);
    expect(w.round).toBe(SHRINK_AFTER_ROUND);
    expect(arenaLimit(w)).toBe(ARENA_RADIUS - SHRINK_STEP);
    expect(events).toContainEqual({ type: 'shrink', limit: ARENA_RADIUS - SHRINK_STEP });
    expect(events.filter((e) => e.type === 'out')).toEqual([{ type: 'out', id: 'edge' }]);
    expect(edge.fall).toBeGreaterThan(0);
    expect(inside.fall).toBe(0);
    expect(w.patches).toHaveLength(1);
    expect(w.patches[0]!.y).toBe(-100);
  });

  it('antes do fim do aquecimento só conta a rodada', () => {
    const w = shrinkWorld([pinAt('a', 0, 0, 100), pinAt('b', 1, 0, -100)]);
    expect(advanceRound(w)).toEqual([]);
    expect(w.round).toBe(1);
    expect(arenaLimit(w)).toBe(ARENA_RADIUS);
  });

  it('o pin cai na borda nova, e a mira também a respeita', () => {
    const w = shrinkWorld([pinAt('a', 0, 0, 100)]);
    w.limit = 200;
    const pin = w.pins[0]!;
    pin.vx = 400;
    pin.y = 0;
    pin.x = 150;
    const events = run(w, 1);
    expect(events.some((e) => e.type === 'out' && e.id === 'a')).toBe(true);
    const fresh = pinAt('b', 0, 150, 0);
    const ghostWorld = shrinkWorld([fresh]);
    ghostWorld.limit = 200;
    expect(previewPath(ghostWorld, fresh, { dirX: 1, dirY: 0, power: 1 }).falls).toBe(true);
  });

  it('o mundo criado liga a borda só quando pedido', () => {
    const specs = { mine: [spec('m')], enemy: [spec('e')] };
    expect(createWorld(specs, seededRng(1)).shrinking).toBe(false);
    const w = createWorld(specs, seededRng(1), { shrink: true });
    expect(w.shrinking).toBe(true);
    expect(arenaLimit(w)).toBe(ARENA_RADIUS);
    expect(w.round).toBe(0);
  });
});
