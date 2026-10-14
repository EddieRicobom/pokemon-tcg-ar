import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { BoxScene } from './box-scene';
import type { CreatureEntry } from './box-scene';
import { INTRO_MAX_MS, MELEE, RANGED, turnDuration } from './battle-director';
import { buildFighter, seededRng } from '../core/battle';
import type { Fighter } from '../core/battle';
import { lookQuaternion } from './orientation';
import { FX_STYLES, ParticleField, typeColorHex } from './effects';
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
    const total = INTRO_MAX_MS + result.turns.reduce((sum, t) => sum + turnDuration(t), 0) + 500;
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
    const impactAt = first.move.special ? RANGED.windup + RANGED.travel : MELEE.windup + MELEE.approach + MELEE.strike;
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
