// Custo do motor em corridas longas: tempo por passo e tamanho de cada lista, minuto a minuto, até 18 min.
// Não mede o desenho (canvas) nem celular: só `stepSurvivor`. Serve para achar o que cresce sem limite.
//
//   LONG_DEX=143 LONG_MIN=16 npx vitest run -c vitest.eval.config.ts scripts/survivor-longrun.eval.ts --silent=false
import { describe, it } from 'vitest';
import { attackProfile, moveFor } from '../src/core/survivor-moves';
import { statsOfDex } from '../src/core/survivor-stats';
import { typesOfDex } from '../src/core/species-filter';
import { applyUpgrade, createSurvivorState, stepSurvivor } from '../src/core/survivor';
import { chooseSurvivorSpecial, chooseSurvivorSpecialBranch } from '../src/core/survivor-specials';
import type { SurvivorInput, SurvivorState } from '../src/core/survivor';

const DEX = Number(process.env.LONG_DEX ?? 143);
const MINUTES = Number(process.env.LONG_MIN ?? 16);
const DT = 33;

function control(s: SurvivorState): SurvivorInput {
  const p = s.player;
  let fx = 0;
  let fy = 0;
  for (const e of s.enemies) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 230) continue;
    fx += (dx / d) * 1e4 / (d * d);
    fy += (dy / d) * 1e4 / (d * d);
  }
  if (Math.hypot(fx, fy) < 0.6) {
    let best = s.orbs[0];
    let bd = Infinity;
    for (const o of s.orbs) {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { fx += (best.x - p.x) / (bd || 1); fy += (best.y - p.y) / (bd || 1); }
  }
  return { dx: fx, dy: fy, special: s.special.phase === 'ready' && s.special.cooldownMs === 0, charge: p.move.category === 'foco' && s.charge.level < 1 };
}

describe('custo do motor em corrida longa', () => {
  it('tempo por passo e listas por minuto', () => {
    const stats = statsOfDex(DEX);
    const move = moveFor(typesOfDex(DEX), stats);
    const s = createSurvivorState(77, { kindCount: 6, dexId: DEX, move, profile: attackProfile(move, stats) });
    // O objetivo é medir custo em pé, não sobrevivência: o jogador não morre.
    s.player.maxHp = 1e9;
    s.player.hp = 1e9;
    const rows: Record<string, number>[] = [];
    let stepMs = 0;
    let worst = 0;
    let steps = 0;
    let nextMark = 60_000;
    while (!s.over && s.elapsedMs < MINUTES * 60_000) {
      if (s.pendingUpgrade) { applyUpgrade(s, s.pendingUpgrade[0]!.id); continue; }
      if (s.special.phase === 'choice') { chooseSurvivorSpecial(s, 'shield'); continue; }
      if (s.special.phase === 'branch-choice') { chooseSurvivorSpecialBranch(s, 'shield-permanent'); continue; }
      const t0 = performance.now();
      stepSurvivor(s, control(s), DT);
      const dt = performance.now() - t0;
      stepMs += dt; steps++; worst = Math.max(worst, dt);
      if (s.elapsedMs >= nextMark) {
        rows.push({
          min: Math.round(s.elapsedMs / 60000), msPorPasso: Math.round((stepMs / steps) * 1000) / 1000, pior: Math.round(worst * 100) / 100,
          inimigos: s.enemies.length, orbes: s.orbs.length, projeteis: s.projectiles.length, hostis: s.hostileProjectiles.length, fx: s.fx.length,
          nivel: s.player.level, abates: s.kills,
        });
        stepMs = 0; steps = 0; worst = 0; nextMark += 60_000;
      }
    }
    console.log(`LONGA dex=${DEX} forma=${move.category} ${JSON.stringify(rows)}`);
  }, 1_800_000);
});
