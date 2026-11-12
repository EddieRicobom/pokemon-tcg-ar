import { describe, expect, it } from 'vitest';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorEvent, SurvivorState } from './survivor';
import { attackProfile, moveFor, moveWith } from './survivor-moves';
import { chooseSurvivorSpecial } from './survivor-specials';
import { POKEMON_TYPES } from './pokemon-data';
import type { BaseStats, PokemonType } from './pokemon-data';
import { creditSupremeKill, gainSupreme, SUPREME_BANK_CAP, SUPREME_DAMAGE_BOUNDS, SUPREME_GRACE_MS, SUPREME_MIN_FILL_MS, SUPREME_RADIUS, SUPREME_WINDUP_MS, supremeDamageTo, supremeWaveMarks, SURVIVOR_SUPREMES } from './survivor-supreme';

const STATS: BaseStats = { hp: 75, attack: 75, defense: 75, spAttack: 75, spDefense: 75, speed: 75 };
const idle = { dx: 0, dy: 0 };

function run(type: PokemonType = 'fire', seed = 7): SurvivorState {
  const move = moveFor([type], STATS);
  const s = createSurvivorState(seed, { kindCount: 1, move, profile: attackProfile(move, STATS) });
  s.spawnAccumMs = -1e9;
  s.nextBossAtMs = Infinity;
  s.nextTrainerAtMs = Infinity;
  s.player.attackTimerMs = Infinity;
  return s;
}
function foe(id: number, x: number, y: number, extra: Partial<SurvivorEnemy> = {}): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp: 1000, maxHp: 1000, speed: 0, damage: 0, radius: 13, hitFlashMs: 0, ...extra };
}
function fire(s: SurvivorState): SurvivorEvent[] {
  s.supreme.meter = 1;
  const events = stepSurvivor(s, { ...idle, supreme: true }, 16);
  events.push(...stepSurvivor(s, idle, SUPREME_WINDUP_MS));
  return events;
}

describe('Golpe Supremo da Torre', () => {
  it('tem um golpe próprio para cada um dos 18 tipos, sem repetir efeito nem nome', () => {
    expect(Object.keys(SURVIVOR_SUPREMES).sort()).toEqual([...POKEMON_TYPES].sort());
    const defs = Object.values(SURVIVOR_SUPREMES);
    expect(new Set(defs.map((d) => d.name)).size).toBe(18);
    const signature = (d: (typeof defs)[number]) => JSON.stringify({ ...d, name: '', pattern: '' });
    expect(new Set(defs.map(signature)).size).toBe(18);
  });

  it('nenhum tipo sai do orçamento de poder: efeito extra custa dano', () => {
    for (const [type, d] of Object.entries(SURVIVOR_SUPREMES)) {
      const extras = (d.stunMs ?? 0) / 1200 + (d.burnFraction ?? 0) + (d.healFraction ?? 0) * 4 + (d.invulnMs ?? 0) / 2000 + (d.executeBelow ?? 0) * 2 + (d.refund ?? 0) * 2 + (d.healPerHit ?? 0) * 40 + (d.clearsShots ? 0.6 : 0) + (d.gathersOrbs ? 0.5 : 0) + (d.pushPx ?? 0) / 260 + (d.slowMs ?? 0) / 4000 + ((d.bossFactor ?? 1) - 1);
      const score = d.damage * (d.radius ?? 1) + extras * 1.5;
      expect(score, type).toBeGreaterThanOrEqual(4.9);
      expect(score, type).toBeLessThanOrEqual(8.2);
    }
  });

  it('enche com abates, dano causado e dano recebido, mas nunca mais rápido que o limite', () => {
    const s = run();
    for (let i = 0; i < 2000; i++) gainSupreme(s, 1);
    expect(s.supreme.banked).toBeCloseTo(SUPREME_BANK_CAP);
    let elapsed = 0;
    const events: SurvivorEvent[] = [];
    while (s.supreme.meter < 1 && elapsed < 200_000) {
      gainSupreme(s, 0.5);
      events.push(...stepSurvivor(s, idle, 100));
      elapsed += 100;
    }
    expect(elapsed).toBeGreaterThanOrEqual(SUPREME_MIN_FILL_MS - 200);
    expect(events.filter((e) => e.type === 'supremeReady')).toHaveLength(1);
  });

  it('abate pelo próprio Supremo não recarrega; abate comum recarrega', () => {
    const s = run();
    creditSupremeKill(s, foe(1, 0, 0, { supremeHit: true }));
    expect(s.supreme.banked).toBe(0);
    creditSupremeKill(s, foe(2, 0, 0));
    expect(s.supreme.banked).toBeGreaterThan(0);
  });

  it('sem medidor cheio o toque não faz nada', () => {
    const s = run();
    const events = stepSurvivor(s, { ...idle, supreme: true }, 16);
    expect(events.some((e) => e.type === 'supremeCharge')).toBe(false);
    expect(s.supreme.windupMs).toBe(0);
  });

  it('protege durante a carga e solta dentro do raio, deixando o jogador mover', () => {
    const s = run('dragon');
    const near = foe(1, s.player.x + 100, s.player.y);
    const far = foe(2, s.player.x + SUPREME_RADIUS + 200, s.player.y);
    s.enemies = [near, far];
    s.supreme.meter = 1;
    const charge = stepSurvivor(s, { ...idle, supreme: true }, 16);
    expect(charge.some((e) => e.type === 'supremeCharge')).toBe(true);
    expect(s.supreme.meter).toBe(0);
    expect(s.player.invulnMs).toBeGreaterThanOrEqual(SUPREME_WINDUP_MS + SUPREME_GRACE_MS - 16);
    const x = s.player.x;
    stepSurvivor(s, { dx: 1, dy: 0 }, 50);
    expect(s.player.x).toBeGreaterThan(x);
    expect(near.hp).toBe(1000);
    const release = stepSurvivor(s, idle, SUPREME_WINDUP_MS);
    expect(release.find((e) => e.type === 'supremeRelease')).toMatchObject({ name: SURVIVOR_SUPREMES.dragon.name, hits: 1 });
    expect(near.hp).toBeLessThan(1000);
    expect(far.hp).toBe(1000);
  });

  it('mantém o dano nas faixas de cada classe, com qualquer força de golpe', () => {
    for (const attack of [1, 12, 90, 5000]) for (const def of Object.values(SURVIVOR_SUPREMES)) {
      const common = supremeDamageTo(foe(1, 0, 0), def, attack);
      expect(common).toBeGreaterThanOrEqual(1000 * SUPREME_DAMAGE_BOUNDS.comum.min);
      const elite = supremeDamageTo(foe(2, 0, 0, { grade: 'elite' }), def, attack);
      expect(elite).toBeLessThanOrEqual(1000 * SUPREME_DAMAGE_BOUNDS.elite.max);
      const boss = supremeDamageTo(foe(3, 0, 0, { boss: true }), def, attack);
      expect(boss).toBeLessThanOrEqual(1000 * SUPREME_DAMAGE_BOUNDS.chefao.max * (def.bossFactor ?? 1));
      expect(boss).toBeGreaterThanOrEqual(1000 * SUPREME_DAMAGE_BOUNDS.chefao.min * (def.bossFactor ?? 1));
    }
  });

  it('comum sempre cai, mesmo com ataque baixo; só a proteção de suporte o segura', () => {
    for (const def of Object.values(SURVIVOR_SUPREMES)) expect(supremeDamageTo(foe(1, 0, 0, { hp: 40, maxHp: 40 }), def, 1)).toBeGreaterThanOrEqual(40);
    const s = run('water');
    s.player.attackDamage = 1;
    const weak = foe(1, s.player.x + 70, s.player.y, { hp: 40, maxHp: 40 });
    const shielded = foe(2, s.player.x - 70, s.player.y, { hp: 40, maxHp: 40, protectedMs: 5000 });
    s.enemies = [weak, shielded];
    fire(s);
    expect(s.enemies.includes(weak)).toBe(false);
    expect(shielded.hp).toBeCloseTo(10);
  });

  it('o Juízo Espectral executa elite solto ferido, mas não elite inteiro, treinador nem chefe', () => {
    const s = run('ghost');
    const x = s.player.x + 80;
    const wounded = foe(1, x, s.player.y, { grade: 'elite', hp: 400 });
    const healthy = foe(2, x, s.player.y + 20, { grade: 'elite' });
    const trainer = foe(3, x, s.player.y - 20, { grade: 'elite', hp: 400, trainerId: 1 });
    const boss = foe(4, x, s.player.y + 40, { boss: true, hp: 100 });
    s.enemies = [wounded, healthy, trainer, boss];
    fire(s);
    expect(s.enemies.includes(wounded)).toBe(false);
    expect(healthy.hp).toBeGreaterThan(300);
    expect(trainer.hp).toBeGreaterThan(0);
    expect(boss.hp).toBeGreaterThan(0);
  });

  it('a onda desenhada fica dentro do raio do golpe e a chuva cai do alto', () => {
    for (const pattern of ['radial', 'spokes', 'rain'] as const) for (const t of [0, 0.3, 0.7, 1]) {
      const marks = supremeWaveMarks(pattern, t, 300, 14);
      expect(marks).toHaveLength(14);
      for (const m of marks) {
        expect(Math.hypot(m.dx, m.dy)).toBeLessThanOrEqual(300.001);
        expect(m.lift).toBeGreaterThanOrEqual(0);
        expect(m.lift).toBeLessThanOrEqual(170);
      }
    }
    expect(Math.hypot(supremeWaveMarks('spokes', 0.6, 300, 4)[0]!.dx, supremeWaveMarks('spokes', 0.6, 300, 4)[0]!.dy)).toBeCloseTo(300);
    expect(supremeWaveMarks('rain', 0.1, 300, 1)[0]!.lift).toBeGreaterThan(supremeWaveMarks('rain', 0.4, 300, 1)[0]!.lift);
  });

  it('não acerta o Meowth ladrão: pegá-lo continua sendo perseguição', () => {
    const s = run('dragon');
    const thief = foe(1, s.player.x + 60, s.player.y, { thief: true });
    s.enemies = [thief];
    fire(s);
    expect(thief.hp).toBe(1000);
  });

  it('cada efeito faz o que diz', () => {
    const near = (s: SurvivorState, extra: Partial<SurvivorEnemy> = {}) => { const e = foe(1, s.player.x + 80, s.player.y, extra); s.enemies = [e]; return e; };
    const ice = run('ice'); const frozen = near(ice, { grade: 'elite' }); fire(ice);
    expect(frozen.stunMs).toBeGreaterThan(0);

    const fireRun = run('fire'); const burning = near(fireRun, { grade: 'elite' }); fire(fireRun);
    expect(burning.burnMs).toBeGreaterThan(0);

    const psychic = run('psychic'); near(psychic);
    psychic.hostileProjectiles = [{ id: 9, x: psychic.player.x + 200, y: psychic.player.y, vx: 0, vy: 0, damage: 5, lifeMs: 5000, size: 4 }];
    fire(psychic);
    expect(psychic.hostileProjectiles).toHaveLength(0);

    const flying = run('flying'); near(flying, { grade: 'elite' });
    flying.orbs = [{ id: 3, x: flying.player.x + 500, y: flying.player.y, value: 2 }];
    fire(flying);
    expect(flying.orbs).toHaveLength(0);

    const grass = run('grass'); near(grass); grass.player.hp = 10; fire(grass);
    expect(grass.player.hp).toBeGreaterThan(10);

    const blocked = run('grass'); near(blocked); blocked.player.hp = 10; blocked.player.healBlockMs = 5000; fire(blocked);
    expect(blocked.player.hp).toBe(10);

    const steel = run('steel'); near(steel); fire(steel);
    expect(steel.player.invulnMs).toBeGreaterThan(2500);

    const normal = run('normal'); near(normal); fire(normal);
    expect(normal.supreme.banked).toBeGreaterThan(0);

    const ghost = run('ghost'); const haunted = near(ghost); const held = foe(2, ghost.player.x + 90, ghost.player.y, { boss: true }); ghost.enemies.push(held); fire(ghost);
    expect(ghost.enemies.includes(haunted)).toBe(false);
    expect(held.hp).toBeGreaterThan(800);
  });

  it('água empurra chefe bem menos que elite e ninguém sai da arena', () => {
    const s = run('water');
    const common = foe(1, s.player.x + 60, s.player.y, { grade: 'elite' });
    const boss = foe(2, s.player.x - 60, s.player.y, { boss: true });
    const [commonX, bossX] = [common.x, boss.x];
    s.enemies = [common, boss];
    fire(s);
    expect(Math.abs(common.x - commonX)).toBeGreaterThan(Math.abs(boss.x - bossX) * 3);
  });

  it('com o motor real: ajuda sem virar vitória automática e respeita o limite de usos', () => {
    const survival = (useSupreme: boolean, seed: number) => {
      const move = moveWith('fire', 'projetil', null);
      const s = createSurvivorState(seed, { kindCount: 8, move, profile: attackProfile(move, STATS) });
      let steps = 0;
      while (!s.over && s.elapsedMs < 720_000 && steps++ < 8000) {
        if (s.pendingUpgrade) { const option = s.pendingUpgrade[0]; if (option) applyUpgrade(s, option.id); continue; }
        if (s.special.phase === 'choice') { chooseSurvivorSpecial(s, 'shield'); continue; }
        const p = s.player;
        const near = s.enemies.reduce<SurvivorEnemy | null>((best, e) => (e.hp > 0 && (!best || Math.hypot(e.x - p.x, e.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) ? e : best), null);
        let dx = Math.cos(s.elapsedMs / 1700);
        let dy = Math.sin(s.elapsedMs / 2100);
        // Mantém distância de tiro em vez de só fugir: quem foge para longe não abate ninguém e o medidor nem enche.
        if (near) {
          const gap = Math.hypot(near.x - p.x, near.y - p.y);
          const sign = gap < 95 ? 1 : gap > 150 ? -1 : 0;
          if (sign !== 0) { dx = (p.x - near.x) * sign; dy = (p.y - near.y) * sign; }
        }
        stepSurvivor(s, { dx, dy, supreme: useSupreme && s.supreme.meter >= 1 }, 100);
      }
      return { ms: s.elapsedMs, uses: s.supreme.uses };
    };
    const seeds = [11, 23, 37, 41, 59, 67, 73, 89, 97, 103, 127, 131];
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
    const off = seeds.map((seed) => survival(false, seed));
    const on = seeds.map((seed) => survival(true, seed));
    for (const r of on) expect(r.uses).toBeLessThanOrEqual(Math.ceil(r.ms / SUPREME_MIN_FILL_MS) + 1);
    expect(median(on.map((r) => r.uses))).toBeGreaterThan(0);
    const ratio = median(on.map((r) => r.ms)) / Math.max(1, median(off.map((r) => r.ms)));
    expect(ratio).toBeGreaterThanOrEqual(1);
    expect(ratio).toBeLessThanOrEqual(1.9);
  }, 30_000);
});
