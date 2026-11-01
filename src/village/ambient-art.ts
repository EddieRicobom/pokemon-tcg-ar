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
  if (rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(8,12,28,${alpha.toFixed(3)})`);
  g.addColorStop(0.6, `rgba(8,12,28,${(alpha * 0.55).toFixed(3)})`);
  g.addColorStop(1, 'rgba(8,12,28,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Brilho em cruz de quatro pontas, que pisca (estrelinhas de magia, orvalho e reflexos). */
export function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, rgb = '255,248,210'): void {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 2.2);
  halo.addColorStop(0, `rgba(${rgb},${(alpha * 0.55).toFixed(3)})`);
  halo.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(x - size * 2.2, y - size * 2.2, size * 4.4, size * 4.4);
  ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
  ctx.fillRect(Math.round(x - size), Math.round(y), Math.round(size * 2), Math.max(1, Math.round(size * 0.35)));
  ctx.fillRect(Math.round(x), Math.round(y - size), Math.max(1, Math.round(size * 0.35)), Math.round(size * 2));
  ctx.restore();
}
