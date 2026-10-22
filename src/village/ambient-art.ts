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
  for (let i = 0; i < 10; i++) {
    const t = ((now / 950 + i / 10) % 1 + 1) % 1;
    const side = i % 2 ? 1 : -1;
    const dx = side * (2 + (i % 3) * 1.8) * t;
    const dy = -23 + 13 * t - 13 * Math.sin(t * Math.PI);
    ctx.fillStyle = `rgba(204,249,255,${0.85 - t * 0.5})`;
    ctx.fillRect(Math.round(x + dx * scale), Math.round(bottom + dy * scale), scale, scale * (t < 0.5 ? 2 : 1));
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

/**
 * Coluna de dados da Torre de Sobrevivência.
 *
 * O efeito é feito só com retângulos pequenos, sem blur nem criação de
 * partículas. Assim ele mantém o acabamento pixel art, sobe muito acima do
 * prédio e continua barato para a GPU. O ciclo é determinístico para não
 * causar mudanças bruscas quando a câmera é redesenhada.
 */
export function drawTowerDataFx(ctx: CanvasRenderingContext2D, x: number, bottom: number, scale: number, now: number): void {
  ctx.save();
  const height = 132 * scale;
  const base = bottom - 22 * scale;
  const phase = now / 1450;
  const streams = [
    { dx: -12, width: 2, speed: 0.88, color: 'rgba(83,220,255,0.72)' },
    { dx: -5, width: 1, speed: 1.18, color: 'rgba(138,160,255,0.72)' },
    { dx: 3, width: 2, speed: 0.72, color: 'rgba(103,248,207,0.68)' },
    { dx: 10, width: 1, speed: 1.06, color: 'rgba(196,133,255,0.72)' },
  ] as const;

  // Trilhas verticais interrompidas simulam dados subindo, sem uma camada
  // contínua que esconda a fachada da Torre.
  for (let i = 0; i < streams.length; i++) {
    const stream = streams[i]!;
    const drift = Math.sin(phase * 0.7 + i * 1.8) * 2.4 * scale;
    ctx.fillStyle = stream.color;
    for (let j = 0; j < 7; j++) {
      const progress = (phase * stream.speed + j * 0.17 + i * 0.23) % 1;
      const y = base - progress * height;
      const size = Math.max(1, Math.round((j % 3 === 0 ? 3 : 2) * scale));
      const xOffset = (stream.dx + drift / scale + Math.sin(j * 2.7 + phase) * 1.2) * scale;
      const alpha = 0.22 + (1 - progress) * 0.66;
      ctx.globalAlpha = alpha;
      ctx.fillRect(Math.round(x + xOffset), Math.round(y), stream.width * scale, size);
    }
  }

  // Um fio central e o núcleo no topo dão a leitura de uma torre de dados.
  ctx.globalAlpha = 0.5 + Math.sin(phase * 1.7) * 0.16;
  ctx.fillStyle = '#b6f4ff';
  ctx.fillRect(Math.round(x - scale), Math.round(base - height), Math.max(1, scale), Math.round(height));
  ctx.globalAlpha = 0.9;
  ctx.fillRect(Math.round(x - 2 * scale), Math.round(base - height - 2 * scale), 4 * scale, 2 * scale);
  ctx.fillStyle = '#d9b6ff';
  ctx.fillRect(Math.round(x - scale), Math.round(base - height - 4 * scale), 2 * scale, 2 * scale);
  ctx.restore();
}

export function drawSunRays(ctx: CanvasRenderingContext2D, width: number, height: number, now: number, strength: number): void {
  if (strength <= 0.01) return;
  ctx.save();
  const light = ctx.createLinearGradient(0, 0, width * 0.7, height);
  light.addColorStop(0, `rgba(255,240,177,${strength * 0.12})`);
  light.addColorStop(1, 'rgba(255,240,177,0)');
  ctx.fillStyle = light;
  for (let i = 0; i < 3; i++) {
    const x = width * (i * 0.32 - 0.2) + Math.sin(now / 14000 + i) * width * 0.025;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + width * 0.09, 0);
    ctx.lineTo(x + width * 0.65, height);
    ctx.lineTo(x + width * 0.4, height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
