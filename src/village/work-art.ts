import type { FarmTask } from '../core/village/farm';
import { FARM_RULES } from '../core/village/farm';
import type { VillageActivity } from '../core/village/vocations';

/** Ferramentas 2D sobre o morador e o recurso real. Sem partículas persistentes nem nova camada WebGL. */
export function drawWorkAction(ctx: CanvasRenderingContext2D, task: FarmTask, cx: number, base: number, tx: number, ty: number, scale: number, now: number, animate: boolean): void {
  if (task.workingSince === null) return;
  const phase = animate ? (now % 800) / 800 : .55;
  ctx.save();
  ctx.lineCap = 'round';
  if (task.kind === 'fish') {
    const rodX = cx + (tx > cx ? 7 : -7) * scale;
    const rodY = base - 19 * scale;
    ctx.strokeStyle = '#b48b55';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath(); ctx.moveTo(cx, base - 7 * scale); ctx.lineTo(rodX, rodY); ctx.stroke();
    ctx.strokeStyle = '#e8e5d3'; ctx.lineWidth = Math.max(1, scale * .45);
    const bobY = ty + (animate ? Math.sin(now / 330) * scale : 0);
    ctx.beginPath(); ctx.moveTo(rodX, rodY); ctx.quadraticCurveTo((rodX + tx) / 2, bobY - 3 * scale, tx, bobY); ctx.stroke();
    ctx.fillStyle = '#fff1d5'; ctx.fillRect(tx - scale, bobY - 2 * scale, 2 * scale, 2 * scale);
    ctx.fillStyle = '#dd5749'; ctx.fillRect(tx - scale, bobY, 2 * scale, 2 * scale);
    ctx.strokeStyle = '#bae0e8'; ctx.beginPath(); ctx.ellipse(tx, bobY + 2 * scale, 4 * scale, 1.5 * scale, 0, 0, Math.PI * 2); ctx.stroke();
  } else {
    const direction = tx >= cx ? 1 : -1;
    ctx.translate(cx + direction * 4 * scale, base - 7 * scale);
    ctx.scale(direction, 1);
    ctx.rotate((animate ? Math.sin(phase * Math.PI * 2) * .7 : -.4) - .6);
    ctx.fillStyle = '#795030'; ctx.fillRect(0, -scale, 11 * scale, 2 * scale);
    ctx.fillStyle = task.kind === 'water' ? '#5eabd5' : '#d0d5cd';
    if (task.kind === 'mine') {
      ctx.fillRect(9 * scale, -5 * scale, 3 * scale, 10 * scale);
      ctx.fillRect(7 * scale, -5 * scale, 3 * scale, 2 * scale);
    } else if (task.kind === 'lumber') {
      ctx.fillRect(8 * scale, -5 * scale, 6 * scale, 5 * scale);
      ctx.fillStyle = '#f2eee0'; ctx.fillRect(13 * scale, -5 * scale, scale, 5 * scale);
    } else {
      ctx.fillRect(7 * scale, -3 * scale, 6 * scale, 5 * scale);
    }
  }
  ctx.restore();
  if (animate && phase > .64 && phase < .82 && task.kind !== 'fish') {
    ctx.fillStyle = task.kind === 'water' ? '#9bddf7' : task.kind === 'lumber' ? '#d2a15c' : '#eee0a0';
    for (let n = 0; n < 3; n++) ctx.fillRect(tx + (n * 4 - 4) * scale, ty - (n % 2 + 2) * scale, scale, 2 * scale);
  }
  const progress = Math.max(0, Math.min(1, (Date.now() - task.workingSince) / FARM_RULES.workMs));
  ctx.fillStyle = '#242a2e'; ctx.fillRect(tx - 7 * scale, ty + 4 * scale, 14 * scale, 3 * scale);
  ctx.fillStyle = '#a9d875'; ctx.fillRect(tx - 6 * scale, ty + 5 * scale, 12 * scale * progress, scale);
}

/** Ações visuais dos ciclos sociais que não passam pela FarmSession. */
export function drawCommunityWorkAction(ctx: CanvasRenderingContext2D, activity: VillageActivity, cx: number, base: number, tx: number, ty: number, scale: number, now: number, animate: boolean): void {
  const kind = activity === 'mineracao' ? 'mine' : activity === 'madeireira' ? 'lumber' : activity === 'pesca' ? 'fish' : null;
  if (!kind) return;
  drawWorkAction(ctx, { kind, x: tx, y: ty, residentId: '', seed: '', stand: { x: 0, y: 0 }, createdAt: 0, workingSince: 0 }, cx, base, tx, ty, scale, now, animate);
}
