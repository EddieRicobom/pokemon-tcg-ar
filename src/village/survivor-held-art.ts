/**
 * Desenho dos itens segurados da Torre: marcas que os itens põem nos disparos (somadas no mesmo disparo),
 * gemas que orbitam o Pokémon, baús, chaves e os efeitos de raio e de abertura do baú.
 * Só canvas 2D; a regra fica em `src/core/survivor-held.ts`.
 */
import type { HeldProjectileLook } from '../core/survivor-held';

interface ScreenPoint { x: number; y: number; s: number }

/**
 * Marcas dos itens num disparo já desenhado. A ordem importa pouco: cada item acrescenta uma camada,
 * então Placa Chama + Farpa + Pedra do Rei vira um disparo em brasa, com espinhos e coroa.
 */
export function drawHeldProjectileOverlay(c: CanvasRenderingContext2D, head: ScreenPoint, tail: ScreenPoint, size: number, held: HeldProjectileLook, timeMs: number, detailed: boolean, seed: number): void {
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  const r = Math.max(2, size);
  c.save();
  c.translate(head.x, head.y);
  // Casca de pedra: anel grosso e escuro por baixo das outras marcas.
  if (held.heavy > 0) {
    c.strokeStyle = '#8a6a4a';
    c.globalAlpha = 0.85;
    c.lineWidth = Math.min(4, 1 + held.heavy * 0.8);
    c.beginPath(); c.arc(0, 0, r * 1.05, 0, Math.PI * 2); c.stroke();
  }
  // Anéis de cor das placas e orbes, um por item, girando em sentidos alternados.
  held.colors.forEach((color, index) => {
    const spin = timeMs / (180 + index * 40) * (index % 2 === 0 ? 1 : -1) + seed;
    c.strokeStyle = color;
    c.globalAlpha = 0.85;
    c.lineWidth = 1.6;
    if (detailed) { c.shadowColor = color; c.shadowBlur = 8; }
    c.beginPath();
    c.arc(0, 0, r * (1.35 + index * 0.32), spin, spin + Math.PI * 1.3);
    c.stroke();
    c.shadowBlur = 0;
  });
  if (held.spikes) {
    c.fillStyle = '#9be36b';
    c.globalAlpha = 0.95;
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
      const a = (Math.PI * 2 * i) / spikes + timeMs / 400 + seed;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 1.9, Math.sin(a) * r * 1.9);
      c.lineTo(Math.cos(a + 0.28) * r * 0.95, Math.sin(a + 0.28) * r * 0.95);
      c.lineTo(Math.cos(a - 0.28) * r * 0.95, Math.sin(a - 0.28) * r * 0.95);
      c.closePath();
      c.fill();
    }
  }
  if (held.wings) {
    const flap = Math.sin(timeMs / 60 + seed) * 0.5;
    c.save();
    c.rotate(angle);
    c.fillStyle = '#e8fbff';
    c.globalAlpha = 0.85;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.ellipse(-r * 0.6, side * r * 1.1, r * 1.1, r * 0.42, side * (0.6 + flap), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  if (held.star) {
    c.save();
    c.rotate(timeMs / 120 + seed);
    c.fillStyle = '#ffe680';
    c.globalAlpha = 0.95;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r * 0.95 : r * 0.42;
      const a = (Math.PI * i) / 5;
      if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.restore();
  }
  if (held.crown) {
    c.save();
    c.translate(0, -r * 1.6);
    c.fillStyle = '#ffcf3a';
    c.strokeStyle = '#8a5a00';
    c.lineWidth = 0.8;
    c.globalAlpha = 1;
    const w = Math.max(3, r * 1.1);
    c.beginPath();
    c.moveTo(-w, w * 0.45);
    c.lineTo(-w, -w * 0.2);
    c.lineTo(-w * 0.5, w * 0.15);
    c.lineTo(0, -w * 0.45);
    c.lineTo(w * 0.5, w * 0.15);
    c.lineTo(w, -w * 0.2);
    c.lineTo(w, w * 0.45);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
  // Transformadores: marcas originais e abstratas de cada tema.
  if (held.gravity) {
    c.fillStyle = '#05030a';
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(0, 0, r * 0.45, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c9a6ff';
    c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(0, 0, r * 1.5, r * 0.55, timeMs / 300 + seed, 0, Math.PI * 2); c.stroke();
  }
  if (held.time) {
    c.strokeStyle = '#7fd4ff';
    c.lineWidth = 1.2;
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(0, 0, r * 1.7, 0, Math.PI * 2); c.stroke();
    const hand = timeMs / 200 + seed;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(hand) * r * 1.5, Math.sin(hand) * r * 1.5); c.stroke();
  }
  if (held.portal) {
    c.strokeStyle = '#ff9ad5';
    c.lineWidth = 1.4;
    c.globalAlpha = 0.85;
    for (let i = 0; i < 2; i++) {
      const a = timeMs / 110 + seed + i * Math.PI;
      c.beginPath(); c.arc(0, 0, r * (1.25 + i * 0.35), a, a + 1.6); c.stroke();
    }
  }
  if (held.mirror) {
    c.save();
    c.rotate(angle);
    c.globalAlpha = 0.35;
    c.fillStyle = '#b48cff';
    c.beginPath(); c.arc(-r * 2.4, 0, r * 0.9, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  if (held.knot) {
    c.fillStyle = '#ff6f9e';
    c.globalAlpha = 0.95;
    c.beginPath();
    c.ellipse(-r * 0.7, -r * 1.3, r * 0.6, r * 0.35, -0.5, 0, Math.PI * 2);
    c.ellipse(r * 0.7, -r * 1.3, r * 0.6, r * 0.35, 0.5, 0, Math.PI * 2);
    c.fill();
  }
  if (held.sparks && detailed) {
    c.strokeStyle = '#fff27a';
    c.lineWidth = 1.2;
    c.globalAlpha = 0.9;
    const flicker = Math.floor(timeMs / 70 + seed) % 3;
    for (let i = 0; i < 2; i++) {
      const a = seed + i * Math.PI + flicker * 1.7;
      c.beginPath();
      c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      c.lineTo(Math.cos(a + 0.4) * r * 1.7, Math.sin(a + 0.4) * r * 1.7);
      c.lineTo(Math.cos(a - 0.1) * r * 2.3, Math.sin(a - 0.1) * r * 2.3);
      c.stroke();
    }
  }
  c.restore();
}

/**
 * Itens girando em volta do Pokémon: o sprite do item (PokeAPI) quando já carregou, ou uma gema da cor dele enquanto
 * carrega ou se a rede falhar. O visual muda conforme a coleção cresce, como no Isaac.
 */
export function drawHeldGems(c: CanvasRenderingContext2D, x: number, y: number, gems: readonly { color: string; icon: string; image?: CanvasImageSource | null }[], timeMs: number, detailed: boolean): void {
  if (gems.length === 0) return;
  c.save();
  const ring = 30 + Math.min(14, gems.length * 1.2);
  gems.forEach((gem, index) => {
    const a = timeMs / 900 + (Math.PI * 2 * index) / gems.length;
    const gx = x + Math.cos(a) * ring;
    const gy = y - 10 + Math.sin(a) * ring * 0.45;
    if (gem.image) {
      c.globalAlpha = 1;
      const smoothing = c.imageSmoothingEnabled;
      c.imageSmoothingEnabled = false;
      if (detailed) { c.shadowColor = gem.color; c.shadowBlur = 6; }
      c.drawImage(gem.image, gx - 9, gy - 9, 18, 18);
      c.shadowBlur = 0;
      c.imageSmoothingEnabled = smoothing;
      return;
    }
    c.globalAlpha = 0.9;
    c.fillStyle = gem.color;
    if (detailed) { c.shadowColor = gem.color; c.shadowBlur = 8; }
    c.beginPath();
    c.moveTo(gx, gy - 4.5);
    c.lineTo(gx + 3.5, gy);
    c.lineTo(gx, gy + 4.5);
    c.lineTo(gx - 3.5, gy);
    c.closePath();
    c.fill();
    c.shadowBlur = 0;
    c.globalAlpha = 0.7;
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(gx - 1, gy - 1.5, 1, 0, Math.PI * 2); c.fill();
  });
  c.restore();
}

/** Baú de madeira com ferragens douradas; trancado mostra cadeado, com chave na mochila brilha. */
export function drawChest(c: CanvasRenderingContext2D, x: number, y: number, scale: number, timeMs: number, canOpen: boolean): void {
  const s = Math.max(0.4, scale);
  const bob = Math.sin(timeMs / 420) * 1.5 * s;
  c.save();
  c.translate(x, y + bob);
  // Sombra no chão.
  c.globalAlpha = 0.3;
  c.fillStyle = '#000000';
  c.beginPath(); c.ellipse(0, 12 * s, 16 * s, 5 * s, 0, 0, Math.PI * 2); c.fill();
  if (canOpen) {
    c.globalAlpha = 0.35 + 0.25 * Math.sin(timeMs / 160);
    c.fillStyle = '#ffd84a';
    c.beginPath(); c.arc(0, 0, 24 * s, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1;
  // Corpo e tampa.
  c.fillStyle = '#8a5a2b';
  c.strokeStyle = '#3b2412';
  c.lineWidth = 1.5 * s;
  c.beginPath(); c.rect(-14 * s, -4 * s, 28 * s, 16 * s); c.fill(); c.stroke();
  c.fillStyle = '#a56e36';
  c.beginPath();
  c.moveTo(-14 * s, -4 * s);
  c.quadraticCurveTo(0, -18 * s, 14 * s, -4 * s);
  c.closePath();
  c.fill(); c.stroke();
  // Ferragens.
  c.fillStyle = '#ffcf3a';
  c.fillRect(-15 * s, -5 * s, 3 * s, 17 * s);
  c.fillRect(12 * s, -5 * s, 3 * s, 17 * s);
  c.fillRect(-3 * s, -6 * s, 6 * s, 9 * s);
  c.fillStyle = '#3b2412';
  c.beginPath(); c.arc(0, -1 * s, 1.4 * s, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Chave dourada caída, girando devagar e piscando para chamar atenção. */
export function drawKey(c: CanvasRenderingContext2D, x: number, y: number, scale: number, timeMs: number): void {
  const s = Math.max(0.4, scale);
  c.save();
  c.translate(x, y + Math.sin(timeMs / 300) * 2 * s);
  c.rotate(Math.sin(timeMs / 500) * 0.4);
  c.globalAlpha = 0.35 + 0.25 * Math.sin(timeMs / 140);
  c.fillStyle = '#fff2a8';
  c.beginPath(); c.arc(0, 0, 12 * s, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = '#ffcf3a';
  c.fillStyle = '#ffcf3a';
  c.lineWidth = 2.4 * s;
  c.beginPath(); c.arc(-5 * s, 0, 4 * s, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(-1 * s, 0); c.lineTo(9 * s, 0); c.stroke();
  c.fillRect(5 * s, 0, 2 * s, 4 * s);
  c.fillRect(8 * s, 0, 2 * s, 3 * s);
  c.restore();
}

/** Raio da Bola de Luz e salto da Garra Afiada: um traço quebrado que some rápido. */
export function drawChainFx(c: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, t: number, seed: number): void {
  const segments = 5;
  c.save();
  c.globalAlpha = 0.95 * (1 - t);
  c.strokeStyle = color;
  c.lineWidth = 2.4 * (1 - t) + 0.6;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(fromX, fromY - 8);
  const nx = -(toY - fromY);
  const ny = toX - fromX;
  const length = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < segments; i++) {
    const k = i / segments;
    const jitter = Math.sin(seed * 13.7 + i * 7.1) * 10;
    c.lineTo(fromX + (toX - fromX) * k + nx / length * jitter, fromY - 8 + (toY - fromY) * k + ny / length * jitter);
  }
  c.lineTo(toX, toY - 8);
  c.stroke();
  c.strokeStyle = '#ffffff';
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}

/** Baú abrindo: explosão dourada de raios e moedinhas. */
export function drawChestOpenFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  c.save();
  c.globalAlpha = 0.9 * (1 - t);
  c.strokeStyle = '#ffd84a';
  c.lineWidth = 3;
  c.beginPath(); c.arc(x, y - 6, r * (0.3 + 0.9 * t), 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#fff6c8';
  c.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI * 2 * i) / 10;
    const inner = r * (0.2 + 0.6 * t);
    const outer = inner + 14 * (1 - t) + 4;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * inner, y - 6 + Math.sin(a) * inner);
    c.lineTo(x + Math.cos(a) * outer, y - 6 + Math.sin(a) * outer);
    c.stroke();
  }
  c.fillStyle = '#ffcf3a';
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3;
    const d = r * 0.9 * t;
    c.beginPath(); c.arc(x + Math.cos(a) * d, y - 6 - 30 * t + Math.sin(a) * d * 0.5 + 40 * t * t, 2.5, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

/** Faísca de item em cada acerto: losangos da cor de um item saltando do alvo (mais itens, mais faíscas). */
export function drawHeldHitFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, count: number, t: number, seed: number): void {
  c.save();
  c.globalAlpha = 0.95 * (1 - t);
  c.fillStyle = color;
  const sparks = Math.max(1, count) + 1;
  for (let i = 0; i < sparks; i++) {
    const a = seed * 0.7 + (Math.PI * 2 * i) / sparks;
    const d = r * (0.4 + 1.1 * t);
    const sx = x + Math.cos(a) * d;
    const sy = y - 8 + Math.sin(a) * d * 0.8 - 6 * t;
    const k = 3 * (1 - t) + 1;
    c.beginPath();
    c.moveTo(sx, sy - k); c.lineTo(sx + k * 0.7, sy); c.lineTo(sx, sy + k); c.lineTo(sx - k * 0.7, sy);
    c.closePath();
    c.fill();
  }
  c.restore();
}

// ----------------------------------------------------------------------------- transformadores

/** Bolha de tempo (Orbe Adamante): esfera azul translúcida com marcas de relógio e um ponteiro que fecha a volta. */
export function drawTimeBubble(c: CanvasRenderingContext2D, x: number, y: number, radius: number, t: number, timeMs: number, detailed: boolean): void {
  c.save();
  const gradient = c.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, 'rgba(220,245,255,0.35)');
  gradient.addColorStop(1, 'rgba(90,180,255,0.18)');
  c.fillStyle = gradient;
  c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#7fd4ff';
  c.globalAlpha = 0.85;
  c.lineWidth = 2;
  if (detailed) { c.shadowColor = '#7fd4ff'; c.shadowBlur = 10; }
  c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.stroke();
  c.shadowBlur = 0;
  // Marcas de hora.
  c.lineWidth = 1.5;
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    const inner = radius * (i % 3 === 0 ? 0.8 : 0.88);
    c.beginPath();
    c.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
    c.lineTo(x + Math.cos(a) * radius * 0.96, y + Math.sin(a) * radius * 0.96);
    c.stroke();
  }
  // Arco que se fecha até estourar.
  c.strokeStyle = '#ffffff';
  c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, radius * 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); c.stroke();
  // Ponteiro girando devagar.
  const hand = -Math.PI / 2 + Math.PI * 2 * t;
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(hand) * radius * 0.55, y + Math.sin(hand) * radius * 0.55); c.stroke();
  if (detailed) {
    c.fillStyle = '#e8f8ff';
    for (let i = 0; i < 4; i++) {
      const a = timeMs / 900 + i * 1.6;
      c.globalAlpha = 0.6;
      c.beginPath(); c.arc(x + Math.cos(a) * radius * 0.45, y + Math.sin(a * 1.3) * radius * 0.45, 1.6, 0, Math.PI * 2); c.fill();
    }
  }
  c.restore();
}

/** Buraco negro (Bola de Ferro): núcleo escuro, anel de acreção girando e riscos sendo sugados. */
export function drawGravityWell(c: CanvasRenderingContext2D, x: number, y: number, radius: number, t: number, timeMs: number, detailed: boolean): void {
  c.save();
  const core = Math.max(6, radius * 0.16 * (1 + 0.4 * t));
  const halo = c.createRadialGradient(x, y, core * 0.6, x, y, radius);
  halo.addColorStop(0, 'rgba(40,20,70,0.55)');
  halo.addColorStop(0.5, 'rgba(90,60,140,0.18)');
  halo.addColorStop(1, 'rgba(90,60,140,0)');
  c.fillStyle = halo;
  c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
  // Anel de acreção (elipse inclinada) girando.
  const spin = timeMs / 160;
  c.strokeStyle = '#c9a6ff';
  c.lineWidth = 3;
  c.globalAlpha = 0.85;
  if (detailed) { c.shadowColor = '#b48cff'; c.shadowBlur = 14; }
  c.beginPath(); c.ellipse(x, y, core * 2.4, core * 0.9, spin * 0.2, spin, spin + Math.PI * 1.5); c.stroke();
  c.shadowBlur = 0;
  // Riscos espiralando para dentro.
  const streaks = detailed ? 10 : 5;
  c.strokeStyle = '#e6dcff';
  c.lineWidth = 1.4;
  for (let i = 0; i < streaks; i++) {
    const phase = ((timeMs / 700) + i / streaks) % 1;
    const a = (Math.PI * 2 * i) / streaks + phase * 2.4;
    const r0 = radius * (1 - phase);
    const r1 = Math.max(core, r0 - radius * 0.18);
    c.globalAlpha = 0.6 * phase;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    c.lineTo(x + Math.cos(a + 0.5) * r1, y + Math.sin(a + 0.5) * r1);
    c.stroke();
  }
  // Núcleo.
  c.globalAlpha = 1;
  c.fillStyle = '#05030a';
  c.beginPath(); c.arc(x, y, core, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#ffffff';
  c.lineWidth = 1;
  c.globalAlpha = 0.7;
  c.beginPath(); c.arc(x, y, core + 1.5, 0, Math.PI * 2); c.stroke();
  c.restore();
}

/** Portal (Orbe Lustroso): oval rosa com redemoinho, abrindo e fechando. */
export function drawPortalFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, timeMs: number): void {
  const open = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
  const rx = Math.max(6, r * 0.7) * open;
  const ry = Math.max(9, r) * open;
  if (rx <= 0.5) return;
  c.save();
  c.translate(x, y - 8);
  c.globalAlpha = 0.9;
  c.fillStyle = 'rgba(40,10,50,0.55)';
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#ff9ad5';
  c.lineWidth = 3;
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#ffe3f4';
  c.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const a = timeMs / 120 + i * 2.1;
    c.beginPath(); c.ellipse(0, 0, rx * (0.35 + i * 0.2), ry * (0.35 + i * 0.2), 0, a, a + 2.2); c.stroke();
  }
  c.restore();
}

/** Distorção (Orbe Grísea): anel ondulado escuro e roxo, como o espaço dobrando. */
export function drawDistortFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, timeMs: number): void {
  c.save();
  c.globalAlpha = 0.75 * (1 - t);
  c.strokeStyle = '#b48cff';
  c.lineWidth = 3;
  const radius = r * (0.85 + 0.25 * t);
  c.beginPath();
  const points = 36;
  for (let i = 0; i <= points; i++) {
    const a = (Math.PI * 2 * i) / points;
    const wave = Math.sin(a * 6 + timeMs / 80) * 4 * (1 - t);
    const px = x + Math.cos(a) * (radius + wave);
    const py = y - 6 + Math.sin(a) * (radius + wave);
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.stroke();
  c.strokeStyle = '#1a0f2e';
  c.lineWidth = 1.5;
  c.globalAlpha = 0.6 * (1 - t);
  c.beginPath(); c.arc(x, y - 6, radius * 0.9, 0, Math.PI * 2); c.stroke();
  c.restore();
}

/** Estouro da bolha de tempo: anel azul que se expande com estilhaços de vidro. */
export function drawBubblePopFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, repeats: number): void {
  c.save();
  for (let k = 0; k < Math.max(1, repeats); k++) {
    const tt = Math.min(1, t * (1 + k * 0.4));
    c.globalAlpha = 0.85 * (1 - tt);
    c.strokeStyle = k === 0 ? '#ffffff' : '#7fd4ff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, r * (0.8 + 0.5 * tt), 0, Math.PI * 2); c.stroke();
  }
  c.fillStyle = '#d8f3ff';
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI * 2 * i) / 8 + 0.3;
    const d = r * (0.8 + 0.7 * t);
    c.globalAlpha = 0.8 * (1 - t);
    c.beginPath();
    c.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    c.lineTo(x + Math.cos(a + 0.12) * (d - 6), y + Math.sin(a + 0.12) * (d - 6));
    c.lineTo(x + Math.cos(a - 0.12) * (d - 6), y + Math.sin(a - 0.12) * (d - 6));
    c.closePath();
    c.fill();
  }
  c.restore();
}

/** Implosão (Bola de Ferro, estouro da Erva na aura): anel que se fecha rápido para o centro. */
export function drawImplodeFx(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, t: number): void {
  c.save();
  c.globalAlpha = 0.9 * (1 - t);
  c.strokeStyle = color;
  c.lineWidth = 4 * (1 - t) + 1;
  c.beginPath(); c.arc(x, y - 6, Math.max(2, r * (1 - t)), 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#ffffff';
  c.globalAlpha = 0.7 * Math.max(0, 1 - t * 2);
  c.beginPath(); c.arc(x, y - 6, 6 + 10 * t, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Correntes do Laço do Destino: elos rosa entre os inimigos ligados, com um brilho correndo pela corrente. */
export function drawDestinyChains(c: CanvasRenderingContext2D, groups: readonly (readonly { x: number; y: number }[])[], timeMs: number, detailed: boolean): void {
  c.save();
  c.lineCap = 'round';
  for (const group of groups) {
    const anchor = group[0];
    if (!anchor) continue;
    for (let i = 1; i < group.length; i++) {
      const other = group[i]!;
      const ax = anchor.x; const ay = anchor.y - 10;
      const bx = other.x; const by = other.y - 10;
      c.globalAlpha = 0.75;
      c.strokeStyle = '#ff6f9e';
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.lineDashOffset = -timeMs / 40;
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.setLineDash([]);
      if (detailed) {
        const k = ((timeMs / 600) + i * 0.3) % 1;
        c.fillStyle = '#ffd1e1';
        c.globalAlpha = 0.9;
        c.beginPath(); c.arc(ax + (bx - ax) * k, ay + (by - ay) * k, 2.5, 0, Math.PI * 2); c.fill();
      }
    }
    // Laço no inimigo que segura o grupo.
    c.globalAlpha = 0.95;
    c.fillStyle = '#ff6f9e';
    c.beginPath();
    c.ellipse(anchor.x - 4, anchor.y - 24, 4, 2.6, -0.5, 0, Math.PI * 2);
    c.ellipse(anchor.x + 4, anchor.y - 24, 4, 2.6, 0.5, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Disparo carregado da Erva Poderosa, flutuando em volta do Pokémon antes de sair. */
export function drawHeldChargeOrb(c: CanvasRenderingContext2D, x: number, y: number, color: string, timeMs: number, seed: number): void {
  c.save();
  const pulse = 1 + 0.2 * Math.sin(timeMs / 70 + seed);
  c.globalAlpha = 0.45;
  c.fillStyle = '#7be07b';
  c.beginPath(); c.arc(x, y, 7 * pulse, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y, 4 * pulse, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath(); c.arc(x - 1, y - 1, 1.5, 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Orbital espelhado (Orbe Grísea): esfera escura de contorno roxo, girando ao contrário. */
export function drawMirrorOrbiter(c: CanvasRenderingContext2D, x: number, y: number, timeMs: number): void {
  c.save();
  c.globalAlpha = 0.9;
  c.fillStyle = '#1a0f2e';
  c.strokeStyle = '#b48cff';
  c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, 8, 0, Math.PI * 2); c.fill(); c.stroke();
  c.strokeStyle = '#e4d6ff';
  c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, 4, timeMs / 90, timeMs / 90 + Math.PI); c.stroke();
  c.restore();
}

/** Bola de Ferro em aura e órbita: riscos escuros sendo sugados para o centro (o puxão contínuo fica visível). */
export function drawSuctionField(c: CanvasRenderingContext2D, x: number, y: number, reach: number, timeMs: number, detailed: boolean): void {
  c.save();
  c.strokeStyle = '#c9a6ff';
  c.lineWidth = 1.3;
  const streaks = detailed ? 12 : 6;
  for (let i = 0; i < streaks; i++) {
    const phase = ((timeMs / 900) + i / streaks) % 1;
    const a = (Math.PI * 2 * i) / streaks + phase * 1.2;
    const r0 = reach * (1 - phase * 0.6);
    const r1 = r0 - reach * 0.12;
    c.globalAlpha = 0.45 * phase;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * r0, y - 8 + Math.sin(a) * r0);
    c.lineTo(x + Math.cos(a + 0.35) * r1, y - 8 + Math.sin(a + 0.35) * r1);
    c.stroke();
  }
  c.restore();
}
