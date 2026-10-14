import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BoxScene } from './box-scene';
import type { CreatureEntry } from './box-scene';
import { attackStyleOf, GUARD_MS, INTRO_MAX_MS, RESIDUAL_MS, SKIP_MS, turnDuration, turnPlan } from './battle-director';
import { buildFighter, seededRng } from '../core/battle';
import { PERSONALITY_LABELS_PT } from '../core/battle';
import type { BattleTurn } from '../core/battle';
import type { Fighter } from '../core/battle';
import { lookQuaternion } from './orientation';
import { BoltLine, FX_STYLES, IMPACT_STYLES, ParticleField, PHYSICAL_STYLE, RingField, SPECIAL_DELIVERY, STATUS_TINTS, typeColorHex } from './effects';
import { POKEMON_TYPES } from '../core/pokemon-data';

function entry(i: number): CreatureEntry {
  const data = new Uint8ClampedArray(8 * 8 * 4);
  for (let p = 0; p < 64; p++) data.set([200, 50, 50, 255], p * 4);
  return { info: { id: `c${i}`, name: `Mon ${i}`, detail: 'x', dexId: i + 1 }, source: { kind: 'image', image: { width: 8, height: 8, data } } };
}

const stats = { hp: 60, attack: 70, defense: 60, spAttack: 70, spDefense: 60, speed: 60 };

function fighters(n: number): Fighter[] {
  return Array.from({ length: n }, (_, i) =>
    buildFighter({
      id: `c${i}`, name: `Mon ${i}`,
      profile: { dexId: i + 1, types: [i % 2 === 0 ? 'fire' : 'water'], stats: { ...stats, speed: 50 + i * 10 } },
      card: null,
      gameMoves: [
        { name: 'Brasa', type: 'fire', power: 60, accuracy: 100, pp: 10, damageClass: 'special' },
        { name: 'Soco', type: 'fighting', power: 60, accuracy: 100, pp: 10, damageClass: 'physical' },
      ],
    }),
  );
}

function ready(n: number): BoxScene {
  const scene = new BoxScene(seededRng(9));
  scene.setView(400, 800, 60);
  scene.setCameraQuaternion(lookQuaternion(0, -Math.PI / 4));
  scene.setCreatures(Array.from({ length: n }, (_, i) => entry(i)));
  scene.place(new Vector3(0, -1.3, -2), 1.2);
  return scene;
}

function run(scene: BoxScene, totalMs: number, step = 33): number {
  let now = 1000;
  scene.update(now);
  for (let t = 0; t < totalMs; t += step) {
    now += step;
    scene.update(now);
  }
  return now;
}

describe('batalha na cena', () => {
  it('exige a caixa colocada e pelo menos 2 lutadores, um por Pokémon', () => {
    const scene = new BoxScene(seededRng(1));
    scene.setCreatures([entry(0), entry(1)]);
    expect(() => scene.startBattle(fighters(2))).toThrow(/caixa/i);
    const placed = ready(2);
    expect(() => placed.startBattle(fighters(1))).toThrow();
    expect(() => placed.startBattle(fighters(3))).toThrow();
  });

  it('reúne em roda, luta até o fim e o vencedor comemora', () => {
    const scene = ready(3);
    const team = fighters(3);
    const result = scene.startBattle(team, seededRng(5));
    expect(scene.battling).toBe(true);
    expect(scene.battleHud?.phase).toBe('intro');
    expect(scene.battleHud?.banner?.text).toBe('Batalha!');
    const total = INTRO_MAX_MS + result.turns.reduce((sum, t) => sum + turnDuration(t, team[t.attacker]!.personality), 0) * 1.3 + 3000;
    run(scene, total);
    const hud = scene.battleHud!;
    expect(hud.phase).toBe('finished');
    expect(hud.winner?.id).toBe(team[result.winner]!.id);
    expect(hud.banner?.text).toContain('venceu');
    // Barras batem com o resultado simulado; os caídos ficam tombados.
    hud.bars.forEach((bar, i) => {
      expect(bar.hp).toBe(result.hpLeft[i]);
      expect(bar.fainted).toBe(result.hpLeft[i] === 0);
    });
    scene.creatureList.forEach((c, i) => expect(c.fx.faint).toBe(result.hpLeft[i] === 0 ? 1 : 0));
  });

  it('durante a luta a barra de PS desce e aparecem números flutuantes', () => {
    const scene = ready(2);
    const team = fighters(2);
    const result = scene.startBattle(team, seededRng(11));
    const first = result.turns[0]!;
    // Espera a introdução acabar e anda até logo depois do impacto do primeiro golpe.
    let now = run(scene, 0);
    while (scene.battleHud!.phase === 'intro') {
      now += 33;
      scene.update(now);
    }
    const impactAt = turnPlan(first, team[first.attacker]!.personality).impactAt;
    for (let t = 0; t < impactAt + 150; t += 33) {
      now += 33;
      scene.update(now);
    }
    const hud = scene.battleHud!;
    expect(hud.phase).toBe('fight');
    expect(hud.turn).toBe(1);
    const labels = hud.labels.map((l) => l.text);
    if (first.hit && first.damage > 0) {
      expect(labels).toContain(`-${first.damage}`);
      expect(hud.bars[first.target]!.hp).toBeLessThan(team[first.target]!.maxHp);
    } else {
      expect(labels.length).toBeGreaterThan(0);
    }
  });

  it('o anúncio do golpe usa o nome e a origem do golpe', () => {
    const scene = ready(2);
    const team = fighters(2);
    const result = scene.startBattle(team, seededRng(3));
    run(scene, INTRO_MAX_MS + 100);
    const banner = scene.battleHud!.banner!;
    const turn = result.turns[0]!;
    expect(banner.text).toBe(`${team[turn.attacker]!.name} usou ${turn.move.name}!`);
    expect(banner.sub).toContain('golpe do jogo');
    expect(banner.sub).toContain(PERSONALITY_LABELS_PT[team[turn.attacker]!.personality]);
  });

  it('parar a batalha devolve tudo ao normal e o passeio volta', () => {
    const scene = ready(2);
    scene.startBattle(fighters(2), seededRng(2));
    run(scene, INTRO_MAX_MS + 600);
    scene.stopBattle();
    expect(scene.battling).toBe(false);
    expect(scene.battleHud).toBeNull();
    for (const c of scene.creatureList) {
      expect(c.fx.faint).toBe(0);
      expect(c.fx.scale).toBe(1);
      expect(c.fx.tint).toBe(0xffffff);
    }
    const before = scene.creatureList.map((c) => ({ x: c.state.x, z: c.state.z }));
    run(scene, 3000);
    expect(scene.creatureList.some((c, i) => c.state.x !== before[i]!.x || c.state.z !== before[i]!.z)).toBe(true);
  });

  it('trocar a equipe encerra a batalha', () => {
    const scene = ready(2);
    scene.startBattle(fighters(2), seededRng(2));
    scene.setCreatures([entry(0), entry(1), entry(2)]);
    expect(scene.battling).toBe(false);
  });

  it('as barras ficam dentro da tela e seguem os Pokémon', () => {
    const scene = ready(3);
    scene.startBattle(fighters(3), seededRng(4));
    run(scene, 800);
    const hud = scene.battleHud!;
    expect(hud.bars).toHaveLength(3);
    for (const bar of hud.bars) {
      expect(Number.isFinite(bar.x)).toBe(true);
      expect(Number.isFinite(bar.y)).toBe(true);
    }
  });
});

describe('efeitos', () => {
  it('cada tipo tem cor e estilo próprios', () => {
    expect(new Set(POKEMON_TYPES.map((t) => typeColorHex(t))).size).toBe(POKEMON_TYPES.length);
    for (const t of POKEMON_TYPES) {
      expect(FX_STYLES[t].count).toBeGreaterThan(0);
      expect(FX_STYLES[t].life).toBeGreaterThan(0);
    }
  });

  it('partículas nascem, caem e somem', () => {
    const field = new ParticleField(10);
    for (let i = 0; i < 4; i++) {
      field.emit({ position: new Vector3(0, 1, 0), velocity: new Vector3(0, 1, 0), life: 300, size: 0.1, color: 0xff0000, gravity: -5 });
    }
    expect(field.activeCount).toBe(4);
    field.update(100);
    expect(field.activeCount).toBe(4);
    field.update(100);
    field.update(150);
    expect(field.activeCount).toBe(0);
  });

  it('reaproveita as partículas mais antigas quando enche', () => {
    const field = new ParticleField(3);
    for (let i = 0; i < 8; i++) field.emit({ position: new Vector3(), velocity: new Vector3(), life: 1000, size: 0.1, color: 0xffffff });
    expect(field.activeCount).toBe(3);
  });
});

function turnOf(partial: Partial<BattleTurn> & Pick<BattleTurn, 'kind'>): BattleTurn {
  return {
    round: 1, attacker: 0, target: 1, move: { name: 'Teste', type: 'normal', power: 50, accuracy: 100, special: false, source: 'jogo' },
    hit: true, damage: 10, critical: false, effectiveness: 1, targetHpAfter: 90, fainted: false, ...partial,
  } as BattleTurn;
}

describe('encenação por tipo de golpe e personalidade', () => {
  it('golpes físicos e especiais usam estilos diferentes, por tipo', () => {
    const fire = turnOf({ kind: 'attack', move: { name: 'Brasa', type: 'fire', power: 50, accuracy: 100, special: true, source: 'jogo' } });
    const fight = turnOf({ kind: 'attack', move: { name: 'Soco', type: 'fighting', power: 50, accuracy: 100, special: false, source: 'jogo' } });
    expect(attackStyleOf(fire)).toEqual({ family: 'ranged', delivery: SPECIAL_DELIVERY.fire });
    expect(attackStyleOf(fight)).toEqual({ family: 'melee', variant: PHYSICAL_STYLE.fighting });
    expect(new Set(Object.values(SPECIAL_DELIVERY)).size).toBeGreaterThan(3);
    expect(new Set(Object.values(PHYSICAL_STYLE)).size).toBeGreaterThan(3);
  });

  it('o impacto vem depois da preparação e o turno dura mais que o impacto', () => {
    for (const type of POKEMON_TYPES) {
      for (const special of [true, false]) {
        const turn = turnOf({ kind: 'attack', move: { name: 'x', type, power: 50, accuracy: 100, special, source: 'jogo' } });
        const plan = turnPlan(turn);
        expect(plan.impactAt).toBeGreaterThan(plan.windup);
        expect(plan.total).toBeGreaterThan(plan.impactAt);
      }
    }
  });

  it('a personalidade muda o ritmo: veloz < agressivo < equilibrado < defensivo', () => {
    const turn = turnOf({ kind: 'attack' });
    const d = (p: 'veloz' | 'agressivo' | 'equilibrado' | 'defensivo') => turnDuration(turn, p);
    expect(d('veloz')).toBeLessThan(d('agressivo'));
    expect(d('agressivo')).toBeLessThan(d('equilibrado'));
    expect(d('equilibrado')).toBeLessThan(d('defensivo'));
  });

  it('defesa, imobilizado e resíduo têm duração própria; desmaio estende o turno', () => {
    expect(turnDuration(turnOf({ kind: 'guard' }))).toBe(GUARD_MS);
    expect(turnDuration(turnOf({ kind: 'skip' }))).toBe(SKIP_MS);
    expect(turnDuration(turnOf({ kind: 'residual' }))).toBe(RESIDUAL_MS);
    expect(turnDuration(turnOf({ kind: 'residual', fainted: true }))).toBeGreaterThan(RESIDUAL_MS);
    expect(turnDuration(turnOf({ kind: 'attack', fainted: true }))).toBeGreaterThan(turnDuration(turnOf({ kind: 'attack' })));
  });
});

describe('batalha com condições e defesa', () => {
  it('toda a luta roda com condições, defesa e resíduos sem travar e termina no vencedor', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const scene = ready(4);
      const team = fighters(4).map((f, i) => ({ ...f, maxHp: f.maxHp * (i === 0 ? 3 : 1) }));
      const result = scene.startBattle(team, seededRng(seed));
      const total = (INTRO_MAX_MS + result.turns.reduce((s, t) => s + turnDuration(t, team[t.attacker]!.personality), 0)) * 1.3 + 3000;
      run(scene, total, 50);
      const hud = scene.battleHud!;
      expect(hud.phase).toBe('finished');
      expect(hud.winner?.id).toBe(team[result.winner]!.id);
      for (const bar of hud.bars) {
        expect(bar.status).toBeNull();
        expect(bar.guard).toBe(false);
      }
    }
  });

  it('o clarão da tela some depois de um instante', () => {
    const scene = ready(2);
    scene.startBattle(fighters(2), seededRng(2));
    run(scene, INTRO_MAX_MS + 200);
    expect(scene.battleHud!.flash === null || scene.battleHud!.flash.strength <= 1).toBe(true);
  });
});

describe('anéis, raios e tabelas de impacto', () => {
  it('anéis nascem e somem', () => {
    const rings = new RingField(2);
    rings.emit(new Vector3(), 0xffffff, 0.5, 300);
    rings.emit(new Vector3(), 0xffffff, 0.5, 300);
    rings.emit(new Vector3(), 0xffffff, 0.5, 300);
    expect(rings.activeCount).toBe(2);
    for (let i = 0; i < 4; i++) rings.update(100);
    expect(rings.activeCount).toBe(0);
    rings.dispose();
  });

  it('o raio aparece e se esconde', () => {
    const bolt = new BoltLine();
    expect(bolt.visible).toBe(false);
    bolt.show(new Vector3(0, 0, 0), new Vector3(1, 0, 0), 0xffff00, seededRng(1), 0.1);
    expect(bolt.visible).toBe(true);
    bolt.hide();
    expect(bolt.visible).toBe(false);
    bolt.dispose();
  });

  it('cada tipo tem estilo de impacto e cada condição tem cor', () => {
    for (const t of POKEMON_TYPES) {
      expect(IMPACT_STYLES[t].ring).toBeGreaterThanOrEqual(0);
      expect(IMPACT_STYLES[t].extra).toBeTruthy();
    }
    for (const s of ['burn', 'poison', 'paralysis', 'freeze'] as const) expect(STATUS_TINTS[s]).toBeGreaterThan(0);
  });
});

describe('arena da batalha', () => {
  const lookAt = (scene: BoxScene, yawDeg: number, pitchDeg: number) => scene.setCameraQuaternion(lookQuaternion((yawDeg * Math.PI) / 180, (pitchDeg * Math.PI) / 180));

  it('a arena nasce na frente do olhar, pequena e no chão', () => {
    const scene = ready(3);
    lookAt(scene, 0, -45);
    scene.startBattle(fighters(3), seededRng(5));
    const root = scene.scene.children.find((c) => c.children.length > 0 && c.scale.x < 1 && c.scale.x > 0.2)!;
    expect(root).toBeDefined();
    // No chão (a câmera fica a 1,3 m do chão, como no `ready`: -1,3).
    expect(root.position.y).toBeCloseTo(-1.3, 5);
    // Dentro de uma distância confortável do celular.
    const dist = Math.hypot(root.position.x, root.position.z);
    expect(dist).toBeGreaterThanOrEqual(0.89);
    expect(dist).toBeLessThanOrEqual(1.71);
    // E menor que a caixa: encolhida.
    expect(root.scale.x).toBeLessThan(1);
  });

  it('os Pokémon ficam lado a lado de frente para a tela (mais largos que fundos)', () => {
    const scene = ready(4);
    scene.startBattle(fighters(4), seededRng(5));
    run(scene, INTRO_MAX_MS + 200);
    const xs = scene.creatureList.map((c) => c.state.x);
    const zs = scene.creatureList.map((c) => c.state.z);
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(spread(xs)).toBeGreaterThan(spread(zs) * 1.5);
  });

  it('com 2 Pokémon, um fica de cada lado', () => {
    const scene = ready(2);
    scene.startBattle(fighters(2), seededRng(1));
    run(scene, INTRO_MAX_MS + 200);
    const [a, b] = scene.creatureList;
    expect(a!.state.x).toBeLessThan(0);
    expect(b!.state.x).toBeGreaterThan(0);
  });

  it('recentrar leva a arena para onde o celular olha agora; parar devolve os Pokémon à cena', () => {
    const scene = ready(3);
    lookAt(scene, 0, -45);
    scene.startBattle(fighters(3), seededRng(2));
    const root = scene.creatureList[0]!.group.parent!;
    const before = root.position.clone();
    lookAt(scene, 90, -45);
    scene.recenterBattle();
    expect(root.position.distanceTo(before)).toBeGreaterThan(0.5);
    // Virou 90° para o lado: a arena sai do eixo -z e vai para onde o celular aponta (o lado -x neste referencial).
    expect(Math.abs(root.position.x)).toBeGreaterThan(0.5);
    expect(Math.abs(root.position.z)).toBeLessThan(0.2);
    scene.stopBattle();
    for (const c of scene.creatureList) expect(c.group.parent).toBe(scene.scene);
  });

  it('as barras de PS ficam sobre a tela com a arena encolhida (todos cabem sem virar o celular)', () => {
    for (const n of [2, 4, 6]) {
      const scene = ready(n);
      lookAt(scene, 0, -45);
      scene.startBattle(fighters(n), seededRng(4));
      // Fim da entrada, antes do primeiro golpe: todos parados em seus lugares.
      let now = run(scene, 0);
      while (scene.battleHud!.phase === 'intro') {
        now += 33;
        scene.update(now);
      }
      const bars = scene.battleHud!.bars;
      expect(bars.every((b) => b.visible)).toBe(true);
      for (const b of bars) {
        expect(b.x).toBeGreaterThan(2);
        expect(b.x).toBeLessThan(98);
        expect(b.y).toBeGreaterThan(2);
        expect(b.y).toBeLessThan(98);
      }
    }
  });

  it('cinema: nocaute traz aviso grande, câmera lenta, tremor e a tela escurece; no fim há refletor', () => {
    const scene = ready(2);
    const team = fighters(2);
    const result = scene.startBattle(team, seededRng(7));
    let now = run(scene, 0);
    const seen = { callout: new Set<string>(), shake: 0, dim: 0 };
    const end = INTRO_MAX_MS + (result.turns.reduce((s, t) => s + turnDuration(t, team[t.attacker]!.personality), 0)) * 1.3 + 3000;
    for (let t = 0; t < end; t += 33) {
      now += 33;
      scene.update(now);
      const hud = scene.battleHud!;
      if (hud.callout) seen.callout.add(hud.callout.text);
      seen.shake = Math.max(seen.shake, Math.abs(hud.shake.x) + Math.abs(hud.shake.y));
      seen.dim = Math.max(seen.dim, hud.dim);
    }
    expect(seen.callout.has('Já!')).toBe(true);
    expect(seen.callout.has('Nocaute!')).toBe(true);
    expect(seen.callout.has('Vitória!')).toBe(true);
    expect(seen.shake).toBeGreaterThan(1);
    expect(seen.dim).toBeGreaterThan(0.1);
    expect(scene.battleHud!.phase).toBe('finished');
  });
});
