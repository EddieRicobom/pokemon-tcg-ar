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

/** Gemas dos itens girando em volta do Pokémon: o visual dele muda conforme a coleção cresce, como no Isaac. */
export function drawHeldGems(c: CanvasRenderingContext2D, x: number, y: number, gems: readonly { color: string; icon: string }[], timeMs: number, detailed: boolean): void {
  if (gems.length === 0) return;
  c.save();
  const ring = 30 + Math.min(14, gems.length * 1.2);
  gems.forEach((gem, index) => {
    const a = timeMs / 900 + (Math.PI * 2 * index) / gems.length;
    const gx = x + Math.cos(a) * ring;
    const gy = y - 10 + Math.sin(a) * ring * 0.45;
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
