/** Efeitos decorativos sem estado: só desenham dentro do ladrilho visível. */
export function drawWaterFx(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, now: number, seed: number, rain: number, dark: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  const phase = now / 1600 + seed;
  ctx.strokeStyle = `rgba(202,244,255,${0.24 * (1 - dark)})`;
  ctx.lineWidth = Math.max(1, size / 24);
  for (let i = 0; i < 2; i++) {
    const cy = y + size * (0.3 + i * 0.44);
    const cx = x + size * (0.5 + Math.sin(phase + i * 2) * 0.16);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.18, cy);
    ctx.quadraticCurveTo(cx, cy + Math.sin(phase) * size * 0.08, cx + size * 0.18, cy);
    ctx.stroke();
  }
  // Reflexos de luz que piscam na superfície (some com a noite e a chuva).
  const glintPower = (1 - dark) * (1 - rain);
  if (glintPower > 0.05) {
    ctx.fillStyle = `rgba(255,255,240,${glintPower})`;
    for (let i = 0; i < 3; i++) {
      const blink = Math.sin(now / 520 + seed * 5 + i * 2.1);
      if (blink < 0.55) continue;
      ctx.globalAlpha = (blink - 0.55) / 0.45 * 0.9;
      const gx = x + size * (0.15 + ((seed * 3.7 + i * 0.37) % 0.7));
      const gy = y + size * (0.2 + ((seed * 5.3 + i * 0.29) % 0.6));
      ctx.fillRect(Math.round(gx), Math.round(gy), Math.max(1, Math.round(size / 16)) * 2, Math.max(1, Math.round(size / 16)));
    }
    ctx.globalAlpha = 1;
  }
  if (rain > 0.05) {
    const age = ((now / 850 + seed) % 1 + 1) % 1;
    ctx.strokeStyle = `rgba(220,240,255,${(1 - age) * rain * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.5, y + size * 0.55, size * age * 0.4, size * age * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Gotas em arco, limitadas à bacia da fonte; sem criar partículas por quadro. */
export function drawFountainFx(ctx: CanvasRenderingContext2D, x: number, bottom: number, scale: number, now: number): void {
  ctx.save();
  // Névoa leve sobre a água, que respira.
  const mist = ctx.createRadialGradient(x, bottom - 10 * scale, 0, x, bottom - 10 * scale, 16 * scale);
  mist.addColorStop(0, `rgba(220,248,255,${(0.22 + 0.06 * Math.sin(now / 700)).toFixed(3)})`);
  mist.addColorStop(1, 'rgba(220,248,255,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(x - 16 * scale, bottom - 26 * scale, 32 * scale, 32 * scale);
  for (let i = 0; i < 16; i++) {
    const t = ((now / 950 + i / 16) % 1 + 1) % 1;
    const side = i % 2 ? 1 : -1;
    const dx = side * (2 + (i % 3) * 1.8) * t;
    const dy = -23 + 13 * t - 13 * Math.sin(t * Math.PI);
    ctx.fillStyle = `rgba(204,249,255,${0.85 - t * 0.5})`;
    ctx.fillRect(Math.round(x + dx * scale), Math.round(bottom + dy * scale), scale, scale * (t < 0.5 ? 2 : 1));
    // A gota que cai na bacia levanta um respingo curto.
    if (t > 0.9) {
      ctx.fillStyle = `rgba(235,252,255,${((1 - t) * 6).toFixed(2)})`;
      ctx.fillRect(Math.round(x + dx * scale), Math.round(bottom - 9 * scale), scale * 2, scale);
    }
  }
  ctx.strokeStyle = 'rgba(209,250,255,0.5)';
  ctx.lineWidth = Math.max(1, scale * 0.5);
  for (let i = 0; i < 2; i++) {
    const t = (now / 1300 + i * 0.5) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.beginPath();
    ctx.ellipse(x, bottom - 9 * scale, (3 + t * 8) * scale, (1 + t * 2) * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSunRays(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, strength: number): void {
  if (strength <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const light = ctx.createLinearGradient(0, 0, width * 0.7, height);
  light.addColorStop(0, `rgba(255,240,177,${strength * 0.14})`);
  light.addColorStop(0.6, `rgba(255,236,170,${strength * 0.04})`);
  light.addColorStop(1, 'rgba(255,240,177,0)');
  ctx.fillStyle = light;
  // Cinco feixes de larguras diferentes, cada um respirando no seu ritmo.
  for (let i = 0; i < 5; i++) {
    const x = width * (i * 0.21 - 0.2) + Math.sin(now / 14000 + i) * width * 0.025;
    const beam = width * (0.05 + (i % 3) * 0.035);
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 2600 + i * 1.9);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + beam, 0);
    ctx.lineTo(x + width * 0.65 + beam, height);
    ctx.lineTo(x + width * 0.4, height);
    ctx.closePath();
    ctx.fill();
  }
  // Poeira flutuando na luz.
  ctx.fillStyle = `rgba(255,248,214,${(strength * 0.55).toFixed(3)})`;
  for (let i = 0; i < 18; i++) {
    const t = (now / (22000 + i * 900) + i * 0.137) % 1;
    const px = (((i * 0.61803) % 1) * width + Math.sin(now / 1900 + i) * 10) % width;
    const py = t * height;
    ctx.globalAlpha = Math.sin(t * Math.PI) * (0.5 + 0.5 * Math.sin(now / 700 + i * 2.3));
    ctx.fillRect(Math.round(px), Math.round(py), i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
  }
  ctx.restore();
}

/** Sombra macia (gradiente radial) sob o Pokémon ou objeto, no lugar da elipse chapada. */
export function drawSoftShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, alpha: number): void {
  if (rx <= 0 || ry <= 0 || alpha <= 0) return;
  // Um desenho por objeto da tela e por quadro: copiar um sprite pronto custa bem menos que criar um gradiente.
  const sprite = (shadowSprite ??= radialSprite('8,12,28', [[0, 1], [0.6, 0.55], [1, 0]]));
  if (sprite) stampSprite(ctx, sprite, cx - rx, cy - ry, rx * 2, ry * 2, alpha);
}

const GLOW_SPRITE_SIZE = 64;
let shadowSprite: HTMLCanvasElement | null = null;
const glowSprites = new Map<string, HTMLCanvasElement>();

function radialSprite(rgb: string, stops: readonly (readonly [number, number])[]): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GLOW_SPRITE_SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  const center = GLOW_SPRITE_SIZE / 2;
  const fill = g.createRadialGradient(center, center, 0, center, center, center);
  for (const [at, alpha] of stops) fill.addColorStop(at, `rgba(${rgb},${alpha})`);
  g.fillStyle = fill;
  g.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
  return canvas;
}

function stampSprite(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement, x: number, y: number, w: number, h: number, alpha: number): void {
  const previousAlpha = ctx.globalAlpha;
  const previousSmoothing = ctx.imageSmoothingEnabled;
  ctx.globalAlpha = previousAlpha * Math.min(1, alpha);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sprite, x, y, w, h);
  ctx.imageSmoothingEnabled = previousSmoothing;
  ctx.globalAlpha = previousAlpha;
}

/**
 * Halo redondo que vai de `alpha` no centro a zero na borda, com a cor `rgb` ("255,214,120"). Usa o modo de composição
 * que já estiver no contexto. Os sprites ficam guardados por cor, sem gradiente novo a cada lâmpada e a cada quadro.
 */
export function drawGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rgb: string, alpha: number): void {
  if (r <= 0 || alpha <= 0.004 || cx + r < 0 || cy + r < 0 || cx - r > ctx.canvas.width || cy - r > ctx.canvas.height) return;
  let sprite = glowSprites.get(rgb);
  if (!sprite) {
    const made = radialSprite(rgb, [[0, 1], [1, 0]]);
    if (!made) return;
    sprite = made;
    glowSprites.set(rgb, made);
  }
  stampSprite(ctx, sprite, cx - r, cy - r, r * 2, r * 2, alpha);
}

const RAINBOW_COLORS = ['#ff5d5d', '#ffa64d', '#ffe66b', '#6fdc7c', '#63b8ff', '#a98bff'] as const;

/** Arco-íris suave por cima da cena, ancorado num canto: seis traços, sem gradiente nem cópia da tela. */
export function drawRainbow(ctx: CanvasRenderingContext2D, width: number, height: number, alpha: number): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha) * 0.3;
  ctx.lineCap = 'butt';
  const band = Math.max(3, Math.min(width, height) * 0.022);
  const outer = Math.max(width, height) * 0.74;
  ctx.lineWidth = band;
  RAINBOW_COLORS.forEach((color, index) => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(width * 0.82, height * 1.02, outer - index * band, Math.PI * 1.02, Math.PI * 1.62);
    ctx.stroke();
  });
  ctx.restore();
}

/** Brilho em cruz de quatro pontas, que pisca (estrelinhas de magia, orvalho e reflexos). */
export function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, rgb = '255,248,210'): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y, size * 2.2, rgb, alpha * 0.55);
  ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
  ctx.fillRect(Math.round(x - size), Math.round(y), Math.round(size * 2), Math.max(1, Math.round(size * 0.35)));
  ctx.fillRect(Math.round(x), Math.round(y - size), Math.max(1, Math.round(size * 0.35)), Math.round(size * 2));
  ctx.restore();
}
