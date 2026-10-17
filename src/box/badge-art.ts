import { polishLook } from '../core/badges';
import type { BadgeDesign, Finish, Point } from '../core/badges';

/**
 * Desenha a face de uma insígnia num canvas 2D (vira a textura da face na maleta 3D): metal com degradê e riscos finos,
 * esmalte, poeira que some com o polimento. O canvas cobre o quadrado de -1 a 1 do desenho.
 */

/** Ruído fixo por insígnia (a poeira não "pula" a cada redesenho). */
function seeded(seed: number): () => number {
  let s = seed * 2654435761 + 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function trace(ctx: CanvasRenderingContext2D, points: readonly Point[], size: number, close: boolean): void {
  const half = size / 2;
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = half + x * half;
    const py = half - y * half;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  if (close) ctx.closePath();
}

export function drawBadgeFace(canvas: HTMLCanvasElement, design: BadgeDesign, polish: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const look = polishLook(design, polish);
  const metal = ctx.createLinearGradient(0, 0, size, size);
  metal.addColorStop(0, design.metal.light);
  metal.addColorStop(0.45, design.metal.base);
  metal.addColorStop(1, design.metal.dark);
  const fill = (f: Finish): string | CanvasGradient => {
    switch (f) {
      case 'metal':
        return metal;
      case 'enamel':
        return design.enamel[0];
      case 'enamel2':
        return design.enamel[1];
      case 'enamel3':
        return design.enamel[2];
      case 'dark':
        return design.metal.dark;
      case 'shine':
        return 'rgba(255,255,255,0.7)';
    }
  };

  ctx.clearRect(0, 0, size, size);
  // Metal até a borda do canvas: o chanfro da peça 3D passa um pouco do contorno.
  ctx.fillStyle = metal;
  ctx.fillRect(0, 0, size, size);
  ctx.save();
  trace(ctx, design.outline, size, true);
  ctx.clip();
  // Riscos finos do metal escovado.
  const rnd = seeded(design.order + 1);
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = design.metal.light;
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const y = rnd() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (rnd() - 0.5) * 8);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const layer of design.layers) {
    trace(ctx, layer.points, size, layer.line === undefined);
    if (layer.line === undefined) {
      ctx.fillStyle = fill(layer.fill);
      ctx.fill();
    } else {
      ctx.strokeStyle = fill(layer.fill) as string;
      ctx.lineWidth = (layer.line * size) / 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }
  // Borda do metal em volta do esmalte.
  trace(ctx, design.outline, size, true);
  ctx.strokeStyle = design.metal.dark;
  ctx.lineWidth = size * 0.02;
  ctx.stroke();
  // Poeira: manchas e pontinhos que somem com o polimento.
  if (look.dust > 0.01) {
    const dust = seeded(design.order + 101);
    ctx.fillStyle = '#6b6252';
    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = look.dust * (0.25 + dust() * 0.35);
      ctx.beginPath();
      ctx.ellipse(dust() * size, dust() * size, size * (0.05 + dust() * 0.12), size * (0.03 + dust() * 0.07), dust() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = look.dust * 0.25;
    ctx.fillRect(0, 0, size, size);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
