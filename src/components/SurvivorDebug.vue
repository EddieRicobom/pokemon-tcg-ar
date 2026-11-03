<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef } from 'vue';
import { applyUpgrade } from '../core/survivor';
import { createSurvivorDebug, debugTenLevels, DEBUG_TARGETS, setDebugInfinite, stepSurvivorDebug } from '../core/survivor-debug';
import { POKEMON_TYPES, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { attackProfile, moveWith, MOVE_CATEGORY_LABELS_PT } from '../core/survivor-moves';
import type { MoveCategory } from '../core/survivor-moves';
import { autoChargeHeld, createSurvivorCharge, TELEPORT_FULL_HOLD_MS } from '../core/survivor-charge';
import { drawElementAuraField, drawConeGuide, drawOrbitPath, drawElementOrbiter, drawElementProjectile, drawElementFx } from '../village/survivor-attack-art';
import { survivorOrbiters } from '../core/survivor-shapes';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { SoundEngine } from '../box/sound';
import { survivorAudio } from '../app/survivor-audio-settings';
import { visual } from '../app/visual-settings';
import { createSurvivorSpecial, SURVIVOR_SPECIALS, SURVIVOR_SPECIAL_BRANCHES } from '../core/survivor-specials';
import type { SurvivorSpecialId, SurvivorSpecialBranchId } from '../core/survivor-specials';
import { emptySurvivorFeedbackAnswers } from '../core/survivor-feedback';
import type { FeedbackRatingKey, FeedbackRating } from '../core/survivor-feedback';

const emit = defineEmits<{ exit: [] }>();
const lab = shallowRef(createSurvivorDebug());
const type = ref<PokemonType>('normal');
const category = ref<MoveCategory>('projetil');
const blessing = ref<SurvivorSpecialId | ''>('');
const branch = ref<SurvivorSpecialBranchId | ''>('');
const panel = ref(true);
const reporting = ref(false);
const answers = ref(emptySurvivorFeedbackAnswers());
const code = ref('');
const copied = ref(false);
const canvas = ref<HTMLCanvasElement | null>(null);
const charge = ref(false);
const autoCharge = ref(true);
const direction = ref({ dx: 0, dy: 0 });
const keys = new Set<string>();
let special = false, frame = 0, last = 0;
let dittoSprite: HTMLImageElement | null = null;
const sound = new SoundEngine();
let lastCriticalSound = -Infinity;
const floating: { x: number; y: number; damage: number; at: number; critical: boolean }[] = [];
function unlockAudio(): void { sound.setEnabled(visual.sound); sound.unlock(); }
const categories = Object.keys(MOVE_CATEGORY_LABELS_PT) as MoveCategory[];
const questions: { key: FeedbackRatingKey; label: string }[] = [
  { key: 'fun', label: 'Diversão' }, { key: 'difficulty', label: 'Dificuldade' },
  { key: 'clarity', label: 'Clareza' }, { key: 'fairness', label: 'Equilíbrio' }, { key: 'replay', label: 'Vontade de jogar novamente' },
];
const dps = computed(() => lab.value.damageElapsedMs ? lab.value.damage * 1000 / lab.value.damageElapsedMs : 0);
const chargeStatus = computed(() => {
  const { player, charge: meter } = lab.value.state;
  if (player.move.category === 'trilha') return (player.trailActiveMs ?? 0) > 0 ? 'Desenhe a Trilha andando' : `Trilha ${Math.floor((player.trailCharge ?? 0) * 100)}% · ande para carregar`;
  if (player.move.category === 'teleporte') return meter.teleportCooldownMs > 0 ? `Teleporte recarregando · ${Math.ceil(meter.teleportCooldownMs / 1000)}s` : `Teleporte ${Math.floor(meter.teleportHoldMs / TELEPORT_FULL_HOLD_MS * 100)}%`;
  if (player.move.category === 'foco') return `Foco ${Math.floor(meter.level * 100)}%`;
  return '';
});
function changeAttack(): void {
  const s = lab.value.state, p = s.player;
  const old = attackProfile(p.move, null), move = moveWith(type.value, category.value, null), next = attackProfile(move, null);
  const cadence = p.move.category === 'trilha' ? (p.trailCadenceFactor ?? 1) : p.attackCooldownMs / old.cooldownMs;
  p.attackDamage *= next.damage / old.damage;
  if (category.value === 'trilha') { p.trailCadenceFactor = Math.max(0.4, cadence); p.attackCooldownMs = next.cooldownMs; }
  else p.attackCooldownMs = Math.max(240, next.cooldownMs * cadence);
  const oldUsesRadius = ['aura', 'orbit', 'trilha'].includes(p.move.category);
  const reachFactor = oldUsesRadius ? p.attackRadius / Math.max(1, old.radius) : p.attackRange / Math.max(1, old.range);
  const radiusFactor = old.radius > 0 ? p.attackRadius / old.radius : reachFactor;
  const sizeFactor = p.projectileSize / Math.max(1, old.projectileSize);
  p.attackRange = next.range * reachFactor; p.attackRadius = next.radius * radiusFactor; p.projectileSpeed *= next.projectileSpeed / old.projectileSpeed;
  p.projectileSize = next.projectileSize * sizeFactor; p.areaDamageMultiplier = category.value === 'area' ? .15 : 1;
  p.move = move; p.attackTimerMs = 0; s.charge = createSurvivorCharge(); s.projectiles = [];
  p.trailCharge = 0; p.trailActiveMs = 0; p.trailPath = [];
  s.special.type = type.value; triggerRef(lab);
}
function changeBlessing(): void {
  const s = lab.value.state;
  s.special = createSurvivorSpecial(type.value);
  s.special.phase = 'ready'; s.special.selected = blessing.value || null;
  s.special.branch = branch.value || null;
  if (branch.value === 'dash-triple') s.special.dashCharges = 3;
  triggerRef(lab);
}
function resetDps(): void { lab.value.damage = 0; lab.value.damageElapsedMs = 0; triggerRef(lab); }
function chooseUpgrade(id: string): void { applyUpgrade(lab.value.state, id); triggerRef(lab); }
function reset(): void {
  const wasInfinite = lab.value.infinite;
  lab.value = createSurvivorDebug(type.value, category.value); setDebugInfinite(lab.value, wasInfinite);
  changeBlessing();
}
function report(): void {
  const s = lab.value.state;
  const payload = { version: 1, mode: 'laboratorio', seed: s.runSeed, answers: answers.value,
    player: s.player, special: s.special, charge: s.charge, affinity: s.typeAffinity,
    hypotheticalType: s.hypotheticalSecondaryType, hypotheticalActive: s.hypotheticalSecondaryActive,
    autoCharge: autoCharge.value, elapsedMs: s.elapsedMs, supports: s.supports, infiniteTargets: lab.value.infinite, targets: s.enemies, targetTimers: lab.value.targets.map(t => ({ id: t.template.id, respawnMs: t.respawnMs })),
    projectiles: s.projectiles, hostileProjectiles: s.hostileProjectiles, effects: s.fx,
    damage: lab.value.damage, damageElapsedMs: lab.value.damageElapsedMs };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  code.value = 'SVDEBUG1.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function copy(): Promise<void> { try { await navigator.clipboard.writeText(code.value); copied.value = true; } catch { copied.value = false; } }
function onKey(e: KeyboardEvent, down: boolean): void {
  if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'r'].includes(k)) e.preventDefault();
  if (down) keys.add(k); else keys.delete(k);
  if (k === 'r') charge.value = down;
  if (k === 'e' && down && !e.repeat) special = true;
}
function capture(event: PointerEvent): void { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
const down = (e: KeyboardEvent) => onKey(e, true);
const up = (e: KeyboardEvent) => onKey(e, false);
function clearInputs(): void { keys.clear(); charge.value = false; direction.value = { dx: 0, dy: 0 }; special = false; }
function loop(ts: number): void {
  frame = requestAnimationFrame(loop);
  const dt = Math.min(50, Math.max(0, ts - (last || ts))); last = ts;
  const s = lab.value.state;
  if (!panel.value && !reporting.value && !s.pendingUpgrade && dt > 0) {
    const dx = direction.value.dx + Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const dy = direction.value.dy + Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    const chargeStyle = s.player.move.category;
    const automatic = autoCharge.value && (chargeStyle === 'foco' || chargeStyle === 'teleporte' || chargeStyle === 'trilha') && autoChargeHeld(chargeStyle, s.charge);
    stepSurvivorDebug(lab.value, { dx, dy, charge: charge.value || automatic, special }, dt); special = false;
    for (const hit of lab.value.damageHits) floating.push({ x: hit.x, y: hit.y, damage: hit.amount, at: ts, critical: hit.critical });
    if (floating.length > 48) floating.splice(0, floating.length - 48);
    if (s.criticalHits.length && survivorAudio.attackSounds && ts - lastCriticalSound >= 200) { sound.setEnabled(visual.sound); sound.play({ kind: 'ui', cue: 'survivor-critical' }); lastCriticalSound = ts; }
    triggerRef(lab);
  }
  const c = canvas.value, ctx = c?.getContext('2d'); if (!c || !ctx) return;
  const width = Math.max(1, Math.floor(c.clientWidth)), height = Math.max(1, Math.floor(c.clientHeight));
  if (c.width !== width || c.height !== height) { c.width = width; c.height = height; }
  const w = c.width, h = c.height, px = s.player.x, py = s.player.y;
  const x = (n: number) => w / 2 + n - px, y = (n: number) => h / 2 + n - py;
  ctx.fillStyle = '#263b2e'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#385744'; ctx.lineWidth = 1;
  for (let i = -1000; i < 1000; i += 64) { ctx.beginPath(); ctx.moveTo(x(px + i), 0); ctx.lineTo(x(px + i), h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, y(py + i)); ctx.lineTo(w, y(py + i)); ctx.stroke(); }
  const map = (wx: number, wy: number, z = 0) => ({ x: x(wx), y: y(wy) - z, s: 1 });
  const move = s.player.move;
  if (move.category === 'aura') drawElementAuraField(ctx, s.player, move.type, map, ts, true);
  if (move.category === 'cone') drawConeGuide(ctx, s.player, s.player.attackRange, move.type, map, 1 - s.player.attackTimerMs / Math.max(1, s.player.attackCooldownMs));
  if (move.category === 'orbit') {
    drawOrbitPath(ctx, s.player, move.type, map);
    survivorOrbiters(s.player).forEach((_, index) => drawElementOrbiter(ctx, s.player, move.type, map, index, ts, true));
  }
  const trail = s.player.trailPath ?? [];
  if (trail.length) { ctx.strokeStyle = move.color; ctx.lineWidth = Math.max(2, s.player.attackRadius * 2); ctx.globalAlpha = .45; ctx.lineCap = 'round'; ctx.beginPath(); trail.forEach((point, i) => i ? ctx.lineTo(x(point.x), y(point.y)) : ctx.moveTo(x(point.x), y(point.y))); ctx.stroke(); ctx.globalAlpha = 1; }
  for (const e of s.enemies) {
    const i = lab.value.targets.findIndex(t => t.template.id === e.id);
    ctx.beginPath(); ctx.fillStyle = e.hitFlashMs > 0 ? '#fff8df' : e.boss ? '#d65d65' : e.grade === 'elite' ? '#e6c55e' : '#a4baba'; ctx.arc(x(e.x), y(e.y), e.radius, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = 'white'; ctx.fillText(DEBUG_TARGETS[i]?.label ?? 'Alvo', x(e.x), y(e.y) - e.radius - 8);
    if (!lab.value.infinite) { ctx.fillStyle = '#172419'; ctx.fillRect(x(e.x) - 22, y(e.y) + e.radius + 4, 44, 5); ctx.fillStyle = '#8be06a'; ctx.fillRect(x(e.x) - 22, y(e.y) + e.radius + 4, 44 * Math.max(0, e.hp / e.maxHp), 5); }
  }
  lab.value.targets.forEach((target, i) => { if (target.respawnMs <= 0) return; ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ffdcaf'; ctx.fillText(`${DEBUG_TARGETS[i]?.label ?? 'Alvo'} · ${Math.ceil(target.respawnMs / 1000)}s`, x(target.template.x), y(target.template.y)); });
  for (const p of s.projectiles) drawElementProjectile(ctx, p.move?.type ?? move.type, map(p.x, p.y), map(p.x - p.vx * .05, p.y - p.vy * .05), p.size ?? 4, 1, ts, true, p.id, p.look);
  for (const f of s.fx) if (!drawElementFx(ctx, f, map, ts, true)) { ctx.globalAlpha = Math.max(0, 1 - f.ageMs / f.lifeMs); ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x(f.x), y(f.y), Math.max(1, f.r), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  for (let i = floating.length - 1; i >= 0; i--) { const hit = floating[i]!; const age = ts - hit.at; if (age >= 720) { floating.splice(i, 1); continue; } ctx.font = hit.critical ? 'bold 22px sans-serif' : 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#201727'; ctx.fillStyle = hit.critical ? '#ffbf28' : '#fff4de'; const value = hit.damage < 1 ? hit.damage.toFixed(1) : Math.round(hit.damage).toString(); const label = `${value}${hit.critical ? '!' : ''}`; ctx.strokeText(label, x(hit.x), y(hit.y) - 20 - age / 25); ctx.fillText(label, x(hit.x), y(hit.y) - 20 - age / 25); }
  if (dittoSprite?.complete && dittoSprite.naturalWidth > 0) ctx.drawImage(dittoSprite, w / 2 - 24, h / 2 - 30, 48, 48);
  else { ctx.fillStyle = '#cc9be2'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#25142c'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Ditto', w / 2, h / 2 + 4); }
}
onMounted(() => { dittoSprite = new Image(); dittoSprite.src = pokemonSpriteUrl(132); window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', clearInputs); frame = requestAnimationFrame(loop); });
onBeforeUnmount(() => { sound.dispose(); cancelAnimationFrame(frame); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clearInputs); });
</script>

<template>
  <div class="debug-lab" @pointerdown="unlockAudio">
    <canvas ref="canvas" width="900" height="600" aria-label="Mapa do laboratório de combate" />
    <div class="debug-top"><strong>Laboratório · DPS {{ dps.toFixed(1) }}</strong><button @click="panel = !panel">{{ panel ? 'Fechar painel' : 'Configurar' }}</button><button @click="emit('exit')">🚪 Sair</button></div>
    <div v-if="!panel && !reporting && !lab.state.pendingUpgrade" class="debug-hint" role="status">
      {{ chargeStatus ? `${chargeStatus} · ${autoCharge ? 'automático' : category === 'trilha' ? 'aperte a carga quando cheia' : 'segure e solte a carga'}` : category === 'aura' || category === 'orbit' || category === 'cone' ? 'Aproxime-se dos alvos para acertar.' : 'Ataque automático: aproxime-se de um alvo.' }}
    </div>
    <div v-if="!panel && !reporting" class="debug-controls">
      <div class="debug-pad"><button @pointerdown.prevent="capture($event); direction.dy = -1" @pointerup="direction.dy = 0" @pointercancel="direction.dy = 0" @lostpointercapture="direction.dy = 0">↑</button><div><button @pointerdown.prevent="capture($event); direction.dx = -1" @pointerup="direction.dx = 0" @pointercancel="direction.dx = 0" @lostpointercapture="direction.dx = 0">←</button><button @pointerdown.prevent="capture($event); direction.dy = 1" @pointerup="direction.dy = 0" @pointercancel="direction.dy = 0" @lostpointercapture="direction.dy = 0">↓</button><button @pointerdown.prevent="capture($event); direction.dx = 1" @pointerup="direction.dx = 0" @pointercancel="direction.dx = 0" @lostpointercapture="direction.dx = 0">→</button></div></div>
      <div><button @pointerdown.prevent="capture($event); charge = true" @pointerup="charge = false" @pointercancel="charge = false" @lostpointercapture="charge = false">Segurar carga</button><button @click="special = true">Especial</button></div>
    </div>
    <div v-if="panel" class="debug-panel">
      <h2>Laboratório do Ditto</h2><p>Stats médios (75). Use as setas ou WASD para andar, R para carga e E para especial. Nenhum progresso é salvo.</p>
      <label>Elemento <select v-model="type" @change="changeAttack"><option v-for="t in POKEMON_TYPES" :key="t" :value="t">{{ TYPE_LABELS_PT[t] }}</option></select></label>
      <label>Forma <select v-model="category" @change="changeAttack"><option v-for="c in categories" :key="c" :value="c">{{ MOVE_CATEGORY_LABELS_PT[c] }}</option></select></label>
      <label>Bênção <select v-model="blessing" @change="branch = ''; changeBlessing()"><option value="">Nenhuma</option><option v-for="(item, id) in SURVIVOR_SPECIALS" :key="id" :value="id">{{ item.name }}</option></select></label>
      <label v-if="blessing">Ramificação <select v-model="branch" @change="changeBlessing"><option value="">Nenhuma</option><option v-for="item in SURVIVOR_SPECIAL_BRANCHES[blessing]" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label><input v-model="autoCharge" type="checkbox"> Carga automática (Foco, Teleporte e Trilha)</label>
      <label><input :checked="lab.infinite" type="checkbox" @change="setDebugInfinite(lab, ($event.target as HTMLInputElement).checked)"> Vida infinita dos alvos</label>
      <p>Vida finita: os alvos reaparecem após 5 segundos. DPS é a média desde o último reset.</p>
      <button @click="resetDps">Zerar DPS</button>
      <button @click="debugTenLevels(lab); panel = false">Ganhar XP para 10 níveis</button>
      <button @click="reset">Resetar nível e melhorias</button>
      <button @click="reporting = true; panel = false">Reportar bug</button>
      <button @click="panel = false">Voltar ao mapa</button>
    </div>
    <div v-if="lab.state.pendingUpgrade && !reporting" class="debug-panel"><h2>Escolha uma melhoria</h2><button v-for="option in lab.state.pendingUpgrade" :key="option.id" @click="chooseUpgrade(option.id)"><strong>{{ option.name }}</strong> · {{ option.description }}</button></div>
    <div v-if="reporting" class="debug-panel"><h2>Relatar bug</h2><p>Conte o que aconteceu e avalie a experiência. O código contém a configuração atual; copie e envie junto da mensagem.</p>
      <fieldset v-for="q in questions" :key="q.key"><legend>{{ q.label }}</legend><button v-for="n in 5" :key="n" :aria-pressed="answers[q.key] === n" @click="answers[q.key] = n as FeedbackRating">{{ n }}</button></fieldset>
      <label>O que aconteceu? <textarea v-model="answers.comment" maxlength="1000" rows="4" /></label>
      <button :disabled="questions.some(q => !answers[q.key])" @click="report">Gerar código</button>
      <template v-if="code"><textarea :value="code" readonly rows="4" aria-label="Código do relatório"/><button @click="copy">{{ copied ? 'Copiado' : 'Copiar código' }}</button></template>
      <button @click="reporting = false; panel = true">Voltar</button>
    </div>
  </div>
</template>

<style scoped>
.debug-lab{position:fixed;inset:0;z-index:1000;background:#18281e;color:white;overflow:hidden}.debug-lab canvas{width:100%;height:100%;object-fit:contain}.debug-top{position:absolute;top:env(safe-area-inset-top);left:8px;right:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.debug-top strong{background:#15251ce8;padding:8px;border-radius:8px}.debug-lab button,.debug-lab select,.debug-lab textarea{font:inherit;padding:8px;border-radius:8px}.debug-panel{position:absolute;inset:50px 8px 8px;overflow:auto;background:#f8f5e7;color:#202b28;border-radius:14px;padding:16px;max-width:650px;margin:auto}.debug-panel label{display:block;margin:10px 0}.debug-panel button{margin:4px}.debug-panel textarea{display:block;width:100%;box-sizing:border-box}.debug-hint{position:absolute;top:calc(50px + env(safe-area-inset-top));left:8px;max-width:80%;padding:6px 9px;background:#15251ce8;color:#fff;border-radius:8px;font-size:13px}.debug-controls{position:absolute;bottom:calc(12px + env(safe-area-inset-bottom));left:12px;right:12px;display:flex;justify-content:space-between;align-items:end}.debug-controls button{touch-action:none;min-width:48px;min-height:48px}.debug-pad{text-align:center}.debug-pad div{display:flex}.debug-panel [aria-pressed=true]{background:#72d48d}
</style>
