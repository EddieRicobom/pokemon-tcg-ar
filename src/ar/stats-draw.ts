import type { BattleData, Part } from '../app/pokemon-data-service';
import {
  DAMAGE_CLASS_LABELS_PT, energyLabelPt, energyType, rowProgress, STAT_COLORS, STAT_LABELS_PT, STAT_ORDER, statFraction, TYPE_COLORS,
  TYPE_LABELS_PT,
} from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { PANEL_PAGE_LABELS_PT, PANEL_PAGES, wrapText } from './panel-state';
import type { PanelPage } from './panel-state';

export const PANEL_WIDTH_PX = 512;
export const PANEL_HEIGHT_PX = 384;

export interface PanelModel {
  name: string;
  dexId?: number;
  data: BattleData;
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const TEXT = '#f4f6fb';
const MUTED = 'rgba(244,246,251,0.62)';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function typeChip(ctx: CanvasRenderingContext2D, x: number, y: number, type: PokemonType, label = TYPE_LABELS_PT[type], height = 30): number {
  ctx.font = `700 ${Math.round(height * 0.62)}px ${FONT}`;
  const width = ctx.measureText(label).width + 24;
  roundRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = TYPE_COLORS[type];
  ctx.fill();
  ctx.fillStyle = type === 'electric' || type === 'ground' || type === 'ice' || type === 'steel' || type === 'normal' ? '#1a1d26' : '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 12, y + height / 2 + 1);
  return width;
}

function message(ctx: CanvasRenderingContext2D, text: string, color: string, y = 150, nowMs = 0): void {
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = wrapText((s) => ctx.measureText(s).width, text, PANEL_WIDTH_PX - 48, 5);
  lines.forEach((line, i) => ctx.fillText(line, 24, y + i * 30));
  void nowMs;
}

function partMessage<T>(ctx: CanvasRenderingContext2D, part: Part<T>, nowMs: number): boolean {
  if (part.state === 'loading') {
    const dots = '.'.repeat(1 + (Math.floor(nowMs / 350) % 3));
    message(ctx, `Carregando${dots}`, MUTED);
    return true;
  }
  if (part.state === 'error') {
    message(ctx, part.message, '#fca5a5');
    return true;
  }
  return false;
}

function header(ctx: CanvasRenderingContext2D, model: PanelModel, page: PanelPage): void {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = `800 34px ${FONT}`;
  const name = model.name.length > 18 ? `${model.name.slice(0, 17)}…` : model.name;
  ctx.fillText(name, 24, 50);
  if (model.dexId) {
    ctx.textAlign = 'right';
    ctx.fillStyle = MUTED;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(`Nº ${String(model.dexId).padStart(3, '0')}`, PANEL_WIDTH_PX - 24, 48);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = MUTED;
  ctx.font = `700 15px ${FONT}`;
  ctx.fillText(PANEL_PAGE_LABELS_PT[page].toUpperCase(), 24, 76);
}

function footerDots(ctx: CanvasRenderingContext2D, page: PanelPage): void {
  const gap = 18;
  const startX = PANEL_WIDTH_PX / 2 - ((PANEL_PAGES.length - 1) * gap) / 2;
  PANEL_PAGES.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(startX + i * gap, PANEL_HEIGHT_PX - 16, p === page ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = p === page ? TEXT : 'rgba(244,246,251,0.35)';
    ctx.fill();
  });
}

function statusPage(ctx: CanvasRenderingContext2D, model: PanelModel, elapsed: number, nowMs: number): void {
  const { profile } = model.data;
  if (partMessage(ctx, profile, nowMs) || profile.state !== 'ok') return;
  const { types, stats } = profile.value;
  // Tipos ao lado do título da página.
  let x = 24;
  types.forEach((type) => {
    x += typeChip(ctx, x, 88, type) + 8;
  });
  if (types.length === 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `600 16px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('Tipo indisponível', 24, 103);
  }
  const trackX = 152;
  const trackW = 288;
  STAT_ORDER.forEach((key, i) => {
    const cy = 150 + i * 36;
    const p = rowProgress(elapsed, i);
    const value = stats[key];
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(STAT_LABELS_PT[key], 24, cy);
    roundRect(ctx, trackX, cy - 8, trackW, 16, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    const fillW = Math.max(0, trackW * statFraction(value) * p);
    if (fillW > 1) {
      ctx.save();
      roundRect(ctx, trackX, cy - 8, fillW, 16, 8);
      ctx.clip();
      ctx.fillStyle = STAT_COLORS[key];
      ctx.fillRect(trackX, cy - 8, fillW, 16);
      // Brilho que passa pela barra depois de cheia (mostra que o painel está vivo).
      if (p >= 1) {
        const sweep = ((nowMs / 1700 + i * 0.12) % 1.6) - 0.3;
        const gx = trackX + sweep * trackW;
        const gradient = ctx.createLinearGradient(gx - 30, 0, gx + 30, 0);
        gradient.addColorStop(0, 'rgba(255,255,255,0)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(gx - 30, cy - 8, 60, 16);
      }
      ctx.restore();
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = TEXT;
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText(String(Math.round(value * p)), PANEL_WIDTH_PX - 24, cy + 1);
  });
}

function energyDots(ctx: CanvasRenderingContext2D, x: number, cy: number, cost: string[]): number {
  let cursor = x;
  for (const energy of cost.slice(0, 5)) {
    const type = energyType(energy);
    ctx.beginPath();
    ctx.arc(cursor + 11, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = type ? TYPE_COLORS[type] : '#999999';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();
    cursor += 26;
  }
  return cursor - x;
}

function attacksPage(ctx: CanvasRenderingContext2D, model: PanelModel, elapsed: number, nowMs: number): void {
  const { card } = model.data;
  if (partMessage(ctx, card, nowMs) || card.state !== 'ok') return;
  const info = card.value;
  const bits: string[] = [];
  if (info.hp !== undefined) bits.push(`PS ${info.hp}`);
  const weak = info.weaknesses[0];
  if (weak) bits.push(`Fraqueza ${energyLabelPt(weak.type)}${weak.value ? ` ${weak.value}` : ''}`);
  if (info.retreat !== undefined) bits.push(`Recuo ${info.retreat}`);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = `700 19px ${FONT}`;
  ctx.fillText(bits.join('  ·  '), 24, 108);
  if (info.attacks.length === 0) {
    message(ctx, 'Esta carta não tem ataques (Treinador ou Energia).', MUTED, 160);
    return;
  }
  info.attacks.slice(0, 3).forEach((attack, i) => {
    const p = rowProgress(elapsed, i, 140, 450);
    const top = 124 + i * 82;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate((1 - p) * 24, 0);
    roundRect(ctx, 16, top, PANEL_WIDTH_PX - 32, 74, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    // Sem texto de efeito, nome e dano ficam centralizados na linha.
    const cy = attack.effect ? top + 24 : top + 37;
    const used = energyDots(ctx, 28, cy, attack.cost);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.font = `800 24px ${FONT}`;
    const nameX = 28 + used + (used ? 8 : 0);
    ctx.fillText(attack.name, nameX, cy + 1);
    if (attack.damage) {
      ctx.textAlign = 'right';
      ctx.font = `800 30px ${FONT}`;
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(attack.damage, PANEL_WIDTH_PX - 30, cy);
    }
    if (attack.effect) {
      ctx.textAlign = 'left';
      ctx.font = `500 16px ${FONT}`;
      ctx.fillStyle = MUTED;
      const lines = wrapText((s) => ctx.measureText(s).width, attack.effect, PANEL_WIDTH_PX - 72, 1);
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(lines[0] ?? '', 28, top + 62);
    }
    ctx.restore();
  });
}

function movesPage(ctx: CanvasRenderingContext2D, model: PanelModel, elapsed: number, nowMs: number): void {
  const { moves } = model.data;
  if (partMessage(ctx, moves, nowMs) || moves.state !== 'ok') return;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Golpes por nível mais recentes dos jogos oficiais', 24, 108);
  if (moves.value.length === 0) {
    message(ctx, 'Este Pokémon não aprende golpes por nível nos jogos.', MUTED, 160);
    return;
  }
  moves.value.slice(0, 4).forEach((move, i) => {
    const p = rowProgress(elapsed, i, 120, 450);
    const top = 120 + i * 62;
    ctx.save();
    ctx.globalAlpha = p;
    ctx.translate((1 - p) * 24, 0);
    roundRect(ctx, 16, top, PANEL_WIDTH_PX - 32, 56, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.font = `800 22px ${FONT}`;
    const name = move.name.length > 16 ? `${move.name.slice(0, 15)}…` : move.name;
    ctx.fillText(name, 28, top + 19);
    if (move.type) typeChip(ctx, 28, top + 32, move.type, TYPE_LABELS_PT[move.type], 20);
    ctx.fillStyle = MUTED;
    ctx.font = `600 15px ${FONT}`;
    const bits = [
      move.damageClass ? DAMAGE_CLASS_LABELS_PT[move.damageClass] : null,
      move.accuracy !== null ? `Prec. ${move.accuracy}` : null,
      move.pp !== null ? `PP ${move.pp}` : null,
    ].filter(Boolean);
    ctx.fillText(bits.join(' · '), 28 + 110, top + 42);
    ctx.textAlign = 'right';
    ctx.fillStyle = move.power ? '#fbbf24' : MUTED;
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(move.power ? String(move.power) : '—', PANEL_WIDTH_PX - 30, top + 22);
    ctx.font = `600 13px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText('PODER', PANEL_WIDTH_PX - 30, top + 42);
    ctx.restore();
  });
}

/** Desenha uma página do painel. `elapsedMs` = tempo desde que a página apareceu (anima barras e linhas). */
export function drawPanel(ctx: CanvasRenderingContext2D, model: PanelModel, page: PanelPage, elapsedMs: number, nowMs: number): void {
  ctx.clearRect(0, 0, PANEL_WIDTH_PX, PANEL_HEIGHT_PX);
  roundRect(ctx, 2, 2, PANEL_WIDTH_PX - 4, PANEL_HEIGHT_PX - 4, 26);
  ctx.fillStyle = 'rgba(12,16,26,0.84)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();
  header(ctx, model, page);
  if (page === 'status') statusPage(ctx, model, elapsedMs, nowMs);
  else if (page === 'attacks') attacksPage(ctx, model, elapsedMs, nowMs);
  else movesPage(ctx, model, elapsedMs, nowMs);
  footerDots(ctx, page);
}
