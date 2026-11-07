import type { ArenaImpact } from '../core/arena-impacts';
import type { ScreenPoint } from './survivor-attack-art';

/**
 * Desenho dos impactos da luta da Arena em canvas 2D: linhas de velocidade saindo do ponto do golpe, um núcleo branco e
 * um anel; no choque, uma estrela de pontas alternando as cores dos dois golpes e uma onda larga. `detailed` falso corta
 * linhas e camadas pela metade (efeitos leves).
 */

const rngOf = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

export function drawArenaImpact(ctx: CanvasRenderingContext2D, impact: ArenaImpact, at: ScreenPoint, detailed: boolean): void {
  const t = Math.min(1, impact.ageMs / impact.lifeMs);
  const ease = 1 - (1 - t) * (1 - t);
  const scale = at.s;
  const big = impact.kind === 'clash' ? 1.6 : impact.kind === 'super' ? 1.25 : 1;
  const rng = rngOf(impact.seed);
  const [a, b] = impact.colors;
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.lineCap = 'round';

  // Linhas de velocidade: saem do centro e encolhem, como nos quadros de impacto dos animes.
  const lines = Math.round((impact.kind === 'clash' ? 18 : 12) * (detailed ? 1 : 0.5));
  for (let i = 0; i < lines; i++) {
    const angle = (i / lines) * Math.PI * 2 + rng() * 0.35;
    const inner = (8 + ease * 26) * big * scale;
    const outer = inner + (18 + rng() * 22) * (1 - t) * big * scale;
    ctx.strokeStyle = i % 2 === 0 ? a : b;
    ctx.globalAlpha = (1 - t) * 0.95;
    ctx.lineWidth = Math.max(1, (impact.kind === 'clash' ? 3.2 : 2.2) * (1 - t) * scale);
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  if (impact.kind === 'clash') {
    // Estrela de choque com as duas cores, girando um pouco, e uma onda larga.
    const points = detailed ? 10 : 6;
    const r1 = (14 + ease * 10) * scale;
    const r2 = r1 * 0.45;
    ctx.globalAlpha = (1 - t) * 0.9;
    for (const [color, offset] of [[a, 0], [b, Math.PI / points]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i <= points * 2; i++) {
        const angle = (i / (points * 2)) * Math.PI * 2 + offset + t * 0.6;
        const r = i % 2 === 0 ? r1 : r2;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.fill();
    }
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = (1 - t) * 0.7;
    ctx.lineWidth = Math.max(1, 3 * (1 - t) * scale);
    ctx.beginPath();
    ctx.arc(0, 0, (10 + ease * 60) * scale, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = a;
    ctx.globalAlpha = (1 - t) * 0.8;
    ctx.lineWidth = Math.max(1, 2.4 * (1 - t) * scale);
    ctx.beginPath();
    ctx.arc(0, 0, (6 + ease * 22) * big * scale, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Núcleo branco que estoura e some logo.
  if (t < 0.45) {
    ctx.globalAlpha = (1 - t / 0.45) * 0.95;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, (5 + ease * 9) * big * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
