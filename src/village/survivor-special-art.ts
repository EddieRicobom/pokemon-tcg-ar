import type { PokemonType } from '../core/pokemon-data';
import type { SurvivorState } from '../core/survivor';
import { SUPREME_RADIUS, SUPREME_WINDUP_MS, SURVIVOR_SUPREMES, supremeWaveMarks } from '../core/survivor-supreme';
import type { WorldToScreen } from './survivor-attack-art';

/** Silhuetas distintas por tipo, sem texturas ou partículas persistentes. */
export function drawElementMark(ctx: CanvasRenderingContext2D, type: PokemonType, x: number, y: number, size: number, time = 0): void {
  ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
  ctx.lineWidth = 0.11; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const polygon = (n: number, radius = 1, angle = 0) => {
    for (let i = 0; i <= n; i++) { const a = angle + i / n * Math.PI * 2; if (!i) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius); else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); }
  };
  switch (type) {
    case 'fire': ctx.moveTo(0, -1.2); ctx.bezierCurveTo(0.9, -0.3, 1.1, 0.4, 0.3, 1); ctx.bezierCurveTo(-1, 1.1, -1, 0, -0.4, -0.5); ctx.lineTo(-0.2, 0.3); ctx.closePath(); break;
    case 'water': for (let i = -1; i <= 1; i++) { ctx.moveTo(-1, i * 0.5); ctx.bezierCurveTo(-0.3, i * 0.5 - 0.7, 0.3, i * 0.5 + 0.7, 1, i * 0.5); } break;
    case 'electric': ctx.moveTo(0.3, -1.2); ctx.lineTo(-0.7, 0.1); ctx.lineTo(0.15, 0.1); ctx.lineTo(-0.3, 1.2); ctx.lineTo(0.8, -0.3); ctx.lineTo(0, -0.3); ctx.closePath(); break;
    case 'grass': ctx.ellipse(-0.4, -0.2, 0.35, 0.85, -0.7, 0, Math.PI * 2); ctx.ellipse(0.45, 0.1, 0.35, 0.85, 0.7, 0, Math.PI * 2); ctx.moveTo(-0.8, -0.9); ctx.lineTo(0.8, 0.9); break;
    case 'ice': for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const c = Math.cos(a), s = Math.sin(a); ctx.moveTo(0, 0); ctx.lineTo(c, s); ctx.moveTo(c * 0.6 - s * 0.25, s * 0.6 + c * 0.25); ctx.lineTo(c * 0.8, s * 0.8); ctx.lineTo(c * 0.6 + s * 0.25, s * 0.6 - c * 0.25); } break;
    case 'fighting': ctx.rect(-0.65, -0.5, 1.3, 1.1); for (let i = 0; i < 4; i++) ctx.rect(-0.65 + i * 0.35, -0.9, 0.3, 0.7); ctx.moveTo(-0.5, 0.7); ctx.lineTo(-0.5, 1.1); ctx.lineTo(0.5, 1.1); ctx.lineTo(0.5, 0.7); break;
    case 'poison': for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + time; ctx.moveTo(Math.cos(a) * 0.6 + 0.45, Math.sin(a) * 0.6); ctx.arc(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0.45, 0, Math.PI * 2); } break;
    case 'ground': ctx.moveTo(-1, -0.6); ctx.lineTo(-0.15, -0.4); ctx.lineTo(-0.5, 0); ctx.lineTo(0.5, 0.2); ctx.lineTo(0.1, 0.6); ctx.lineTo(1, 1); ctx.moveTo(-0.5, 0); ctx.lineTo(-0.8, 0.7); break;
    case 'flying': for (let i = 0; i < 3; i++) { ctx.moveTo(-1, i * 0.6 - 0.5); ctx.bezierCurveTo(1.6, i * 0.6 - 1.4, 0.8, i * 0.6 + 0.8, 0, i * 0.6); } break;
    case 'psychic': ctx.ellipse(0, 0, 1, 0.4, time, 0, Math.PI * 2); ctx.ellipse(0, 0, 1, 0.4, time + Math.PI / 2, 0, Math.PI * 2); break;
    case 'bug': ctx.ellipse(-0.5, 0, 0.45, 0.9, -0.35, 0, Math.PI * 2); ctx.ellipse(0.5, 0, 0.45, 0.9, 0.35, 0, Math.PI * 2); ctx.moveTo(0, -1); ctx.lineTo(0, 1); break;
    case 'rock': polygon(5, 1, -0.8); ctx.moveTo(-0.7, -0.5); ctx.lineTo(0, -0.1); ctx.lineTo(0.4, 0.9); ctx.moveTo(0, -0.1); ctx.lineTo(0.8, -0.6); break;
    case 'ghost': ctx.arc(0, -0.2, 0.8, Math.PI, 0); ctx.lineTo(0.8, 1); ctx.lineTo(0.3, 0.6); ctx.lineTo(0, 1); ctx.lineTo(-0.3, 0.6); ctx.lineTo(-0.8, 1); ctx.closePath(); ctx.moveTo(-0.3, -0.2); ctx.lineTo(-0.3, 0.1); ctx.moveTo(0.3, -0.2); ctx.lineTo(0.3, 0.1); break;
    case 'dragon': for (let i = 0; i < 3; i++) { ctx.moveTo(-0.7 + i * 0.6, -1); ctx.quadraticCurveTo(-1 + i * 0.6, 0.3, -0.5 + i * 0.6, 1); } break;
    case 'dark': ctx.arc(0, 0, 1, -1.3, 1.3); ctx.quadraticCurveTo(-0.6, 0, Math.cos(-1.3), Math.sin(-1.3)); break;
    case 'steel': polygon(6); polygon(6, 0.45); break;
    case 'fairy': for (let i = 0; i <= 8; i++) { const a = i * Math.PI / 4; const r = i % 2 ? 0.24 : 1.1; if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } break;
    case 'normal': ctx.arc(0, 0, 0.5, 0, Math.PI * 2); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.moveTo(Math.cos(a) * 0.8, Math.sin(a) * 0.8); ctx.lineTo(Math.cos(a) * 1.2, Math.sin(a) * 1.2); } break;
  }
  ctx.stroke(); ctx.restore();
}

/** Círculo no chão como linha projetada: a perspectiva do BONK deforma o anel e pontos atrás da câmera só abrem um vão. */
function strokeProjectedRing(ctx: CanvasRenderingContext2D, project: WorldToScreen, x: number, y: number, radius: number, z: number, segments: number): void {
  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const point = project(x + Math.cos(a) * radius, y + Math.sin(a) * radius, z);
    if (!point) { drawing = false; continue; }
    if (drawing) ctx.lineTo(point.x, point.y);
    else ctx.moveTo(point.x, point.y);
    drawing = true;
  }
  ctx.stroke();
}

const flatProjection: WorldToScreen = (x, y, z = 0) => ({ x, y: y - z, s: 1 });

/**
 * Golpe Supremo no mundo: aura com o medidor cheio, energia convergindo na carga e onda com a silhueta do tipo na soltura.
 * Sem sombra nem gradiente. Com `project`, a mesma cena sai na perspectiva do BONK. Sem `detailed` (Modo Rotom, movimento
 * reduzido) não há aura e as marcas não giram; a carga e a onda continuam, porque dizem quando e até onde o golpe chega.
 */
export function drawSurvivorSupreme(ctx: CanvasRenderingContext2D, state: SurvivorState, timeMs: number, detailed: boolean, project: WorldToScreen = flatProjection): void {
  const supreme = state.supreme;
  const p = state.player;
  const color = p.move.color;
  const def = SURVIVOR_SUPREMES[supreme.type];
  const center = project(p.x, p.y, 12);
  if (detailed && supreme.meter >= 1 && supreme.windupMs <= 0 && center) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(timeMs / 130);
    ctx.lineWidth = 2.5 * center.s;
    const spin = timeMs / 300;
    for (let i = 0; i < 2; i++) {
      const direction = i === 0 ? 1 : -1;
      const r = (30 + i * 7) * center.s;
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, r, r * (project === flatProjection ? 1 : 0.5), 0, spin * direction, spin * direction + 2.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, r, r * (project === flatProjection ? 1 : 0.5), 0, spin * direction + Math.PI, spin * direction + Math.PI + 2.1);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (supreme.windupMs > 0) {
    const t = 1 - supreme.windupMs / SUPREME_WINDUP_MS;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45 + t * 0.5;
    ctx.lineWidth = (2 + t * 3) * (center?.s ?? 1);
    strokeProjectedRing(ctx, project, p.x, p.y, 92 * (1 - t) + 14, 12, 28);
    const count = detailed ? 10 : 4;
    const turn = detailed ? timeMs / 240 : 0;
    const r = 104 * (1 - t) + 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + turn;
      const point = project(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 12);
      if (point) drawElementMark(ctx, supreme.type, point.x, point.y, 8 * point.s, detailed ? timeMs / 900 : 0);
    }
    ctx.restore();
  }
  if (supreme.fxMs <= 0) return;
  const t = 1 - supreme.fxMs / 900;
  const radius = SUPREME_RADIUS * (def.radius ?? 1);
  const fade = Math.max(0, 1 - t);
  const groundZ = project === flatProjection ? 10 : 2;
  const spinTime = detailed ? timeMs : 0;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.85 * fade;
  ctx.lineWidth = 10 * fade + 2;
  strokeProjectedRing(ctx, project, supreme.x, supreme.y, radius * Math.min(1, t * 1.6), groundZ, detailed ? 48 : 24);
  for (const mark of supremeWaveMarks(def.pattern, t, radius, detailed ? 14 : 5)) {
    const tip = project(supreme.x + mark.dx, supreme.y + mark.dy, mark.lift + groundZ);
    if (!tip) continue;
    if (def.pattern === 'spokes') {
      const inner = project(supreme.x + mark.innerDx, supreme.y + mark.innerDy, groundZ);
      if (inner) {
        ctx.beginPath();
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
      }
    }
    drawElementMark(ctx, supreme.type, tip.x, tip.y, (def.pattern === 'rain' ? 11 : def.pattern === 'spokes' ? 12 : 13) * tip.s, spinTime / 750);
  }
  ctx.restore();
}

export function drawSurvivorSpecial(ctx: CanvasRenderingContext2D, state: SurvivorState, detailed: boolean): void {
  const special = state.special;
  if (!special.selected || (special.fxMs <= 0 && !special.clone)) return;
  const p = state.player;
  const time = state.elapsedMs / 1000;
  ctx.save(); ctx.strokeStyle = p.move.color; ctx.lineWidth = 3;
  if (special.selected === 'shield') {
    if (detailed) {
      ctx.globalAlpha = 0.38;
      drawElementMark(ctx, special.type, p.x, p.y - 10, 28, time * 0.3);
      ctx.globalAlpha = 1;
    }
    // Uma barreira contínua e um arco que se esvazia mostram proteção e tempo restante.
    ctx.beginPath(); ctx.arc(p.x, p.y - 10, 31, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff3c9'; ctx.lineWidth = 4;
    const shieldProgress = Number.isFinite(special.activeMs) ? Math.min(1, special.activeMs / 3000) : 1;
    ctx.beginPath(); ctx.arc(p.x, p.y - 10, 35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldProgress); ctx.stroke();
    ctx.strokeStyle = p.move.color;
    const count = detailed ? 6 : 2;
    for (let i = 0; i < count; i++) { const a = time * 0.8 + i * Math.PI * 2 / count; drawElementMark(ctx, special.type, p.x + Math.cos(a) * 31, p.y - 10 + Math.sin(a) * 31, 8, time); }
  } else {
    ctx.globalAlpha = Math.min(1, special.fxMs / 350);
    const count = detailed ? 7 : 2;
    for (let i = 0; i < count; i++) {
      const t = i / Math.max(1, count - 1);
      drawElementMark(ctx, special.type, special.from.x + (special.to.x - special.from.x) * t, special.from.y - 10 + (special.to.y - special.from.y) * t, 16, time + i);
    }
    if (special.selected === 'teleport') for (const target of special.targets) {
      ctx.beginPath(); ctx.moveTo(special.to.x, special.to.y - 10); ctx.lineTo(target.x, target.y - 10); ctx.stroke();
      drawElementMark(ctx, special.type, target.x, target.y - 10, 22, time);
    }
    if (special.clone) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalAlpha = Math.min(0.7, special.clone.activeMs / 900);
      ctx.strokeStyle = '#d9f4ff';
      drawElementMark(ctx, special.type, special.clone.x, special.clone.y - 10, 22, time + 0.5);
      ctx.restore();
    }
  }
  ctx.restore();
}
