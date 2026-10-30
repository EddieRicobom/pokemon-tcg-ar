<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, toRaw, triggerRef, watch } from 'vue';
import MusicControls from './MusicControls.vue';
import { MusicPlayer } from '../app/music-player';
import { survivorAudio } from '../app/survivor-audio-settings';
import { survivorMusicMix, survivorMusicTitle } from '../core/survivor-music';
import { assetUrl, getCache, getDigitalSprite, getLocalVillageSprite, getLocalVillageSpriteDirs } from '../app/services';
import villageAtlasUrl from '../village/vila-atlas.png?url';
import { fetchSprite } from '../ar/sprite-source';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import { recordEvent } from '../app/trainer-store';
import { recordSightings } from '../app/pokedex-store';
import { addCoins, withVillage } from '../app/wallet';
import { settleTowerRun, startTowerRun } from '../core/village/dojo';
import { PURE_LOADOUT, towerLoadout } from '../core/survivor-loadout';
import type { TowerLoadout } from '../core/survivor-loadout';
import { lunchEffectFor } from '../core/survivor-lunch';
import { cardCompanion, cardJourneyError, recordCardVictories } from '../app/card-evolution-store';
import type { CardCompanion } from '../core/card-evolution';
import { survivalWinners } from '../core/card-evolution';
import { effectiveVisual, maxVisualFps, visual } from '../app/visual-settings';
import { isFrameDue } from '../core/frame-rate';
import { cancelGameFrame, requestGameFrame } from '../app/frame-scheduler';
import { combatMotion } from '../core/combat-motion';
import { seededRng } from '../core/battle';
import {
  applyUpgrade,
  banSurvivorUpgrade,
  survivorBanBlockReason,
  ARENA_H,
  ARENA_W,
  PLAYER_RADIUS,
  createSurvivorState,
  chooseSurvivorTypeAffinity,
  rerollSurvivorUpgradeOffer,
  stepSurvivor,
  survivorCoins,
  survivorDefenseReduction,
  survivorScore,
  SURVIVOR_UPGRADE_RARITIES,
  SURVIVOR_UPGRADE_FAMILIES,
  SURVIVOR_LOVE_CANDY_MS,
  SURVIVOR_TRUST_STONE_MS,
  SURVIVOR_MEGA_SHARD_MS,
  SURVIVOR_ARTIFACT_DETAILS,
  survivorProjectileOpacity,
  FAST_TIME_SCALE,
  SURVIVOR_LANDSCAPE_TILE_H,
  SURVIVOR_LANDSCAPE_TILE_W,
} from '../core/survivor';
import type { SurvivorEnemy, SurvivorEvolutionOption, SurvivorState, SurvivorSummary, SurvivorSupportCandidate, SurvivorUpgradeOption, SurvivorUpgradeRarity } from '../core/survivor';
import { attackProfile, moveEffectForType, moveFor, MOVE_CATEGORY_LABELS_PT, MOVE_EFFECT_LABELS_PT, profileBars } from '../core/survivor-moves';
import { survivorAttackOf } from '../core/survivor-loadout';
import { TYPE_LABELS_PT } from '../core/pokemon-data';
import type { PokemonType } from '../core/pokemon-data';
import { SURVIVOR_CLEAR_BONUS } from '../core/survivor';
import { trainer } from '../app/trainer-store';
import type { SurvivorMove } from '../core/survivor-moves';
import { statsOfDex } from '../core/survivor-stats';
import { megaShardCount, settleMegaShard, survivorMegaForm, survivorMegaForms, survivorMegaStatDelta, takeMegaShard } from '../core/survivor-mega';
import type { SurvivorMegaForm, SurvivorMegaSprite } from '../core/survivor-mega';
import { nextEvolutions, speciesName } from '../core/survivor-evolution';
import type { DecodedGif } from '../core/gif';
import { firstSpriteFrame, frameIndex, SURVIVOR_TILE_PX, toSprite } from '../village/survivor-sprite';
import type { Sprite, SpriteAsset } from '../village/survivor-sprite';
import { SoundEngine } from '../box/sound';
import { survivorRegionLabel } from '../core/survivor-regions';
import { survivorBiomeAt, survivorBiomeLabel } from '../core/survivor-biomes';
import { resolveSurvivorLandscapeMove } from '../core/survivor-collision';
import { createSurvivorLandscape, planSurvivorFloor, SURVIVOR_LANDSCAPE_CELL } from '../village/survivor-landscape';
import { REGIONAL_ENCOUNTERS, REGIONAL_ENEMY_SPRITES, REGIONAL_KIND_COUNT, regionalEnemyDexId } from '../core/survivor-encounters';
import { survivorRegionAt } from '../core/survivor-regions';
import type { SoundCue } from '../box/sound-recipes';
import { normalizeSurvivorFavorites, selectSurvivorCandidates } from '../core/survivor-selection';
import { dayKey } from '../core/trainer';
import { survivorMinimapSnapshot } from '../core/survivor-minimap';
import { fitSurvivorViewport } from '../core/survivor-camera';
import { survivorObjectives, survivorRerollLimit, SURVIVOR_OBJECTIVE_DETAILS, SURVIVOR_OBJECTIVE_IDS } from '../core/survivor-objectives';
import { availableSurvivorPreparations, SURVIVOR_PREPARATIONS } from '../core/survivor-preparations';
import type { SurvivorPreparationId } from '../core/survivor-preparations';
import { chooseSurvivorSpecial, chooseSurvivorSpecialBranch, SPECIAL_GUARDIANS, SURVIVOR_SPECIAL_BRANCHES, SURVIVOR_SPECIALS } from '../core/survivor-specials';
import type { SurvivorSpecialBranchId, SurvivorSpecialId } from '../core/survivor-specials';
import { drawSurvivorSpecial } from '../village/survivor-special-art';
import { emptySurvivorFeedbackAnswers, encodeSurvivorFeedback } from '../core/survivor-feedback';
import type { FeedbackRating, FeedbackRatingKey } from '../core/survivor-feedback';
import { BONK_LANDING_MS, bonkInputToWorld, bonkJumpsRemaining, createBonkPhysics, projectBonkPoint, resolveBonkPosition, stepBonkPhysics } from '../core/survivor-bonk';
import type { BonkPhysics } from '../core/survivor-bonk';
import { isBonkDoubleTap, isBonkTap } from '../core/survivor-gesture';
import { survivorStick } from '../core/survivor-controls';
import type { SurvivorPointerSample } from '../core/survivor-gesture';
import { bonkGroundEllipse, bonkObstacleDrawables, createBonkArt, drawBonkGround } from '../village/survivor-bonk-landscape';
import type { BonkArt } from '../village/survivor-bonk-landscape';
import { PROJECTILE_TIER_NAMES, survivorProjectileTier } from '../core/survivor-projectile-power';
import { drawConeGuide, drawElementAuraField, drawElementFx, drawElementOrbiter, drawElementProjectile, drawOrbitPath } from '../village/survivor-attack-art';
import type { WorldToScreen } from '../village/survivor-attack-art';
import { survivorOrbiters } from '../core/survivor-shapes';
import { survivorSpriteDirection, survivorSpriteDirectionFromAngle } from '../core/survivor-sprite-direction';
import type { SurvivorSpriteDirection } from '../core/survivor-sprite-direction';
import { paintAccessory } from '../village/item-art';
import { placeAccessory } from '../core/village/accessory-fit';
import { itemDef } from '../core/village/catalog';
import type { Facing, Placement } from '../core/village/accessory-fit';

/** Ícone por upgrade, só pra ficar mais fácil de reconhecer na hora do susto do nível — não muda a lógica. */
const UPGRADE_ICON: Record<string, string> = {
  power: '💥', haste: '⏳', legs: '👟', vigor: '❤️', range: '📏', multishot: '🎯', pierce: '🏹', magnet: '🧲', radius: '⭕',
  'more-upgrade-choices': '🃏',
  'jirachi-reroll': '⭐',
  'second-attack': '✦',
};
const upgradeIcon = (option: SurvivorUpgradeOption): string => (option.icon ?? (option.id.startsWith('evolve:') ? '✨' : (UPGRADE_ICON[option.id] ?? (option.family ? SURVIVOR_UPGRADE_FAMILIES[option.family].icon : '✨'))));
const RARITY_BALL_IMAGE: Record<SurvivorUpgradeRarity, string> = {
  normal: assetUrl('assets/survivor/balls/poke-ball.png'),
  raro: assetUrl('assets/survivor/balls/great-ball.png'),
  lendario: assetUrl('assets/survivor/balls/ultra-ball.png'),
  ancestral: assetUrl('assets/survivor/balls/master-ball.png'),
};

const moveLine = (m: SurvivorMove): string => `${m.icon} ${m.name} · ${MOVE_CATEGORY_LABELS_PT[m.category]}`;
/** Uma frase de uso prático antes da corrida, sem esconder os números e efeitos reais do golpe. */
const MOVE_CATEGORY_HINTS_PT: Record<SurvivorMove['category'], string> = {
  projetil: 'Mantenha distância: o dano cai conforme o alvo se afasta.',
  aura: 'Fere quem encosta. Circule para não ficar cercado.',
  area: 'Explode no alvo e também atinge inimigos próximos.',
  cone: 'Acerte à frente e atravesse grupos em movimento.',
  orbit: 'Ataca ao redor. Fica melhor quando você se aproxima e se move.',
  foco: 'Disparo largo e lento. Segure o botão de carga (ou R) para um feixe que atravessa todos; você fica lento enquanto carrega.',
  rapido: 'Tiros pequenos e rápidos. Andar enche a barra; com ela pela metade, aperte para virar teleportes. Correndo, você leva mais dano.',
};

/**
 * Zona de Sobrevivência: um modo próprio da Vila (como a Arena e a Pista de Pins), aberto pela Torre — não é um
 * minigame do Fliperama. Você anda arrastando o dedo em qualquer lugar da tela (ou WASD/setas), seu Pokémon ataca sozinho quem chegar perto,
 * orbes de XP sobem de nível e abrem a escolha de um upgrade, e as ondas ficam mais difíceis com o tempo. A lógica
 * fica inteira em `core/survivor.ts` (pura, testada); aqui é só o laço de desenho e os controles — como a Vila faz
 * com o próprio jogo dela. O chão usa um recorte real de um dos tilesets enviados (`public/tilesets/`, créditos em
 * THIRD_PARTY_NOTICES.md); os inimigos e o seu Pokémon usam o mesmo pacote de sprites locais da Vila ("Walk").
 * Se algum sprite não carregar, desenha uma forma neutra no lugar — nunca finge ser outro Pokémon. XP conta do
 * mesmo jeito que a Pista de Pins (`recordEvent({ type: 'minigame', game: 'sobrevivencia', ... })`), sem entrar
 * no catálogo de minigames do Fliperama (`core/minigames.ts`).
 */
const emit = defineEmits<{ leave: []; complete: [summary: SurvivorSummary, participant: { id: string; name: string }, runId: string] }>();
/** Digital Pokémon (Fase 6: elegíveis como parceiro na Torre, igual a qualquer carta escaneada). */
const props = defineProps<{ digital?: { instanceId?: string; dexId: number; name: string; shiny?: boolean; accessory?: string | null }[]; accessories?: Record<string, string | null | undefined>; /** Abre já com o modo BONK escolhido (atalho da Vila). */ startBonk?: boolean }>();

/**
 * A Torre ocupa a tela inteira. O lado menor parte de `VIEW_SHORT` unidades e aproxima 1,5×, mantendo o formato do
 * aparelho sem desenhar fora da arena.
 */
const VIEW_SHORT = 360;
const CAMERA_ZOOM = 1.5;
const view = reactive({ w: 340, h: 420 });
const stageEl = ref<HTMLElement | null>(null);
let resizer: ResizeObserver | null = null;
function fitView(): void {
  const el = stageEl.value;
  if (!el) return;
  const W = el.clientWidth;
  const H = el.clientHeight;
  if (W <= 0 || H <= 0) return;
  const fitted = fitSurvivorViewport(W, H, ARENA_W, ARENA_H, VIEW_SHORT, CAMERA_ZOOM);
  if (fitted.w <= 0 || fitted.h <= 0) return;
  view.w = fitted.w;
  view.h = fitted.h;
  // Mudar o tamanho do canvas apaga o contexto: as configurações voltam no próximo quadro (`draw` refaz tudo).
  if (ctx) ctx.imageSmoothingEnabled = false;
}
const JOY_MAX = 42;
const regionScenery = ref(true);
const minimapEnabled = ref(true);
const specialEffects = ref(true);
const hudExpanded = ref(false);
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const detailedSpecialEffects = computed(() => specialEffects.value && !reducedMotion && !effectiveVisual.value.rotomMode);
// A arte é um setor repetível: o mundo cresce sem ampliar árvores, itens ou a textura de cada canvas.
const drawLandscape = createSurvivorLandscape(SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
const collisionPlans = new Map<number, ReturnType<typeof planSurvivorFloor>>();
function landscapeCollisionPlan(elapsedMs: number, runSeed: number) {
  const { current } = survivorRegionAt(elapsedMs, runSeed);
  let plan = collisionPlans.get(current);
  if (!plan) {
    plan = planSurvivorFloor(current, SURVIVOR_LANDSCAPE_TILE_W, SURVIVOR_LANDSCAPE_TILE_H);
    collisionPlans.set(current, plan);
  }
  return { cols: plan.cols, rows: plan.rows, cellSize: SURVIVOR_LANDSCAPE_CELL, solid: plan.solid };
}
let landscapeAtlasLoaded = false;
/** Atlas da Vila já carregado (null enquanto carrega ou se falhar): o BONK recorta as texturas dele. */
let landscapeAtlasImage: HTMLImageElement | null = null;
/** Grama do Survival (`survivor-grass.png`), também usada como textura do chão do BONK. */
let groundImage: HTMLImageElement | null = null;
/** Arte por região da corrida BONK: a próxima entra durante a transição, sem recarregar imagens por quadro. */
let bonkLandscapeSeed = 0;
const bonkArtByRegion = new Map<number, BonkArt>();
function bonkArtForRegion(region: number): BonkArt | null {
  if (!ctx || !bonkRun.value) return null;
  const cached = bonkArtByRegion.get(region);
  if (cached) return cached;
  const art = createBonkArt(ctx, landscapeAtlasImage, groundImage, bonkLandscapeSeed, region);
  bonkArtByRegion.set(region, art);
  return art;
}
async function loadLandscapeAtlas(): Promise<void> {
  if (landscapeAtlasLoaded) return;
  landscapeAtlasLoaded = true;
  const image = new Image();
  image.src = villageAtlasUrl;
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  });
  if (image.naturalWidth > 0) {
    drawLandscape.setAtlas(image);
    landscapeAtlasImage = image;
  }
}

const accessoryMemory = new Map<string, HTMLCanvasElement | null>();
function accessoryCanvas(id: string | null | undefined): HTMLCanvasElement | null {
  if (!id) return null;
  if (accessoryMemory.has(id)) return accessoryMemory.get(id) ?? null;
  try {
    const art = paintAccessory(id);
    const canvas = document.createElement('canvas');
    canvas.width = art.w;
    canvas.height = art.h;
    canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(art.data), art.w, art.h), 0, 0);
    accessoryMemory.set(id, canvas);
    return canvas;
  } catch {
    accessoryMemory.set(id, null);
    return null;
  }
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** Aviso rapido na tela da Torre (treinador chegou, chefao caiu...): some em 3 s. */
const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function say(text: string, ms = 3000): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), ms);
}

/** Item do chão fica no centro e separado dos avisos de região, para o efeito não passar despercebido. */
const artifactNotice = ref<null | { icon: string; name: string; description: string }>(null);
let artifactNoticeTimer: ReturnType<typeof setTimeout> | null = null;
function showArtifactNotice(kind: keyof typeof SURVIVOR_ARTIFACT_DETAILS): void {
  artifactNotice.value = SURVIVOR_ARTIFACT_DETAILS[kind];
  if (artifactNoticeTimer) clearTimeout(artifactNoticeTimer);
  artifactNoticeTimer = setTimeout(() => (artifactNotice.value = null), 2600);
}

/** Imagem parada (PNG) como um GIF de um quadro so: a ultima alternativa de sprite. */
async function staticAsGif(blob: Blob): Promise<DecodedGif> {
  const bmp = await createImageBitmap(blob);
  try {
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const cx = c.getContext('2d')!;
    cx.drawImage(bmp, 0, 0);
    const rgba = cx.getImageData(0, 0, c.width, c.height).data;
    return { width: c.width, height: c.height, frames: [{ rgba, delayMs: 1000 }], durationMs: 1000 } as DecodedGif;
  } finally {
    bmp.close();
  }
}

/**
 * O sprite de um Pokémon na Torre, na ordem: a pose de andar do pacote local; senão o GIF baixado (o mesmo da Vila,
 * `getDigitalSprite`); senão a imagem parada do PokéAPI. Sem nenhum dos três, null (vira a forma neutra, sem fingir
 * ser outro Pokémon).
 */
const spriteMemory = new Map<string, Promise<SpriteAsset | null>>();

async function loadSpriteOrNull(dexId: number, shiny = false, metallic = false): Promise<SpriteAsset | null> {
  const key = `${dexId}:${shiny ? 's' : 'n'}:${metallic ? 'm' : 'p'}`;
  const cached = spriteMemory.get(key);
  if (cached) return cached;
  const pending = loadSpriteOrNullUncached(dexId, shiny, metallic);
  pending.catch(() => spriteMemory.delete(key));
  spriteMemory.set(key, pending);
  return pending;
}

async function loadSpriteOrNullUncached(dexId: number, shiny = false, metallic = false): Promise<SpriteAsset | null> {
  try {
    const dirs = await getLocalVillageSpriteDirs(dexId, shiny, 'Walk');
    if (dirs?.down) {
      const local: Partial<Record<SurvivorSpriteDirection, Sprite>> = {};
      for (const direction of ['up', 'right', 'down', 'left'] as const) {
        const gif = dirs[direction];
        if (gif) local[direction] = toSprite(gif, dexId, metallic);
      }
      return local;
    }
  } catch {
    // segue para a próxima alternativa
  }
  try {
    const any = await getDigitalSprite(dexId, shiny);
    if (any) return toSprite(any.gif, dexId, metallic);
  } catch {
    // segue para a próxima alternativa
  }
  try {
    const src = await fetchSprite(dexId, undefined, { shiny });
    if (src && src.kind !== 'gif') return toSprite(await staticAsGif(src.blob), dexId, metallic);
  } catch {
    // sem rede: fica a forma neutra
  }
  return null;
}

/**
 * Pose de costas (linha "up" da folha de andar local) para o BONK: a câmera fica atrás do Pokémon, então ele
 * precisa estar de costas para a cena parecer terceira pessoa. Sem essa pose no pacote, null (fica a de frente).
 */
async function loadBackSpriteOrNull(dexId: number, shiny = false, metallic = false): Promise<Sprite | null> {
  try {
    const dirs = await getLocalVillageSpriteDirs(dexId, shiny, 'Walk');
    return dirs?.up ? toSprite(dirs.up, dexId, metallic) : null;
  } catch {
    return null;
  }
}

/** Moedas que a última corrida rendeu (mostradas no resumo). */
const runCoins = ref(0);

/** Premio extra deste fim de corrida (por zerar) e se destravou o infinito agora. */
const runClearBonus = ref(0);
const runUnlockedInfinite = ref(false);

let runCompanion: CardCompanion | null = null;
let runParticipant = { id: 'survivor-pikachu', name: 'Pikachu' };
let runParticipantDexId = 25;
let runCounter = 0;
let activeRunId = '';
const completedRunIds = new Set<string>();
const selectedPreparation = ref<SurvivorPreparationId>('classica');

// ----------------------------------------------------------------------------- Vila na corrida (Survival e BONK)
// Dojô, sorte do Carteiro e marmita entram pelo mesmo `beginRun`, então valem nos dois modos. Nada é inventado: se a
// Vila não puder ser lida, a corrida sai pura (PURE_LOADOUT).
const PURE_PREF_KEY = 'tcg-ar-survivor-pure-v1';
function readPurePref(): boolean {
  try { return localStorage.getItem(PURE_PREF_KEY) === '1'; } catch { return false; }
}
/** "Corrida pura": sem Dojô, sorte nem marmita. Preferência leve do aparelho. */
const pureWanted = ref(readPurePref());
watch(pureWanted, (value) => {
  try { localStorage.setItem(PURE_PREF_KEY, value ? '1' : '0'); } catch { /* armazenamento indisponível */ }
});
/** O que a Vila entregaria agora, só para mostrar na seleção (não consome a sorte nem a marmita). */
const towerPreview = ref<string[]>([]);
function refreshTowerPreview(): void {
  const lines: string[] = [];
  try {
    withVillage((village) => {
      const lunch = village.tower.lunchbox ? lunchEffectFor(village.tower.lunchbox) : null;
      lines.push(...towerLoadout(village.tower, { pure: false, luck: village.tower.luckPending, lunch }).summary);
      return false;
    });
  } catch { /* sem Vila legível: nada a mostrar */ }
  towerPreview.value = lines;
}
let runLoadout: TowerLoadout = PURE_LOADOUT;
let runLoadoutSettled = true;
let lunchWasActive = false;

// ----------------------------------------------------------------------------- Mega da corrida (core/survivor-mega.ts)
// Na seleção, quem tem forma Mega na PokéAPI ganha o botão; a corrida começa na forma Mega gastando 1 Fragmento de
// Megapedra da mochila da Vila e fica assim até o fim (sem tempo). Corrida pura não usa nada da Vila.
const megaShards = ref(0);
/** Mega marcada na seleção: qual Pokémon (id da opção) e qual forma. */
const megaPick = ref<{ optId: string; formId: number } | null>(null);
const megaPickForm = computed(() => (megaPick.value ? survivorMegaForm(megaPick.value.formId) : null));
const megaPickOption = computed(() => pickOptions.value?.find((opt) => opt.id === megaPick.value?.optId) ?? null);
let megaWasActive = false;
let runMegaShardTaken = false;
/** Sprites da forma normal, para voltar quando a Mega acabar. */
let normalPlayerSprite: SpriteAsset | null = null;
let normalPlayerBackSprite: Sprite | null = null;
function refreshMegaShards(): void {
  let total = 0;
  try {
    withVillage((village) => { total = megaShardCount(village); return false; });
  } catch { total = 0; }
  megaShards.value = total;
  if (total < 1 || pureWanted.value) megaPick.value = null;
}
function toggleMegaPick(opt: PickOption, form: SurvivorMegaForm): void {
  if (megaShards.value < 1 || pureWanted.value) return;
  megaPick.value = megaPick.value?.optId === opt.id && megaPick.value.formId === form.formId ? null : { optId: opt.id, formId: form.formId };
}
watch(pureWanted, () => refreshMegaShards());
const MEGA_SPRITE_NOTES: Record<SurvivorMegaSprite, string> = {
  animado: 'Sprite animado da forma Mega.',
  parado: 'Esta forma não tem GIF animado no repositório de sprites: aparece a imagem parada.',
  nenhum: 'Esta forma não tem sprite no repositório: o Pokémon mantém o sprite normal.',
};
/** Tira o fragmento da mochila para a corrida; false se não houver (a corrida sai na forma normal). */
function takeRunMegaShard(): boolean {
  let taken = false;
  try {
    withVillage((village) => { taken = takeMegaShard(village); return taken; });
  } catch { taken = false; }
  return taken;
}
/** Pede à Vila o loadout da corrida (consome a sorte do Carteiro) na mesma escrita. */
function takeRunLoadout(pure: boolean): TowerLoadout {
  let loadout: TowerLoadout = PURE_LOADOUT;
  try {
    withVillage((village) => {
      const luckBefore = village.tower.luckPending;
      loadout = startTowerRun(village, { pure }).loadout;
      return village.tower.luckPending !== luckBefore;
    });
  } catch { loadout = PURE_LOADOUT; }
  return loadout;
}
/** Fim ou abandono: a marmita é gasta se a corrida contou e volta para a mochila se foi desistência logo no começo. */
function settleRunLoadout(survivedMs: number): void {
  if (runLoadoutSettled) return;
  runLoadoutSettled = true;
  const loadout = runLoadout;
  try {
    withVillage((village) => {
      const before = village.tower.lunchbox;
      settleTowerRun(village, loadout, survivedMs);
      return village.tower.lunchbox !== before;
    });
  } catch { /* a Vila não gravou: a marmita continua reservada */ }
  if (runMegaShardTaken) {
    runMegaShardTaken = false;
    try {
      withVillage((village) => settleMegaShard(village, survivedMs));
    } catch { /* a Vila não gravou: o fragmento fica gasto */ }
  }
}

function recordRun(s: SurvivorSummary): void {
  // A recompensa só é emitida pelo evento gameover, e o mesmo resultado não pode ser aplicado duas vezes.
  if (!activeRunId || completedRunIds.has(activeRunId)) return;
  completedRunIds.add(activeRunId);
  if (!recordCardVictories(survivalWinners(runCompanion, s), 'survival')) say(cardJourneyError.value, 9000);
  recordEvent({ type: 'minigame', game: 'sobrevivencia', won: s.kills > 0, score: survivorScore(s) });
  const beforeInfinite = trainer.value.torre.infiniteUnlocked;
  const runRewards = recordEvent({
    type: 'survivor', runId: activeRunId, survivedMs: s.survivedMs, trainersBeaten: s.trainersBeaten, bossesBeaten: s.bossesBeaten,
    clearedTorre: s.finalBossBeaten, infinite: s.infinite, trained: runLoadout.trained, wave: s.wave, kills: s.kills, level: s.level,
    completedObjectives: survivorObjectives(state.value!).filter((objective) => objective.complete).map((objective) => objective.id),
  });
  runUnlocks.value = runRewards.filter((reward) => reward.tone === 'achievement').map((reward) => reward.sub ?? reward.text);
  runUnlockedInfinite.value = s.finalBossBeaten && !beforeInfinite;
  const today = dayKey(new Date());
  const last = trainer.value.torre.lastClearBonusDay;
  const canClearBonus = s.finalBossBeaten && last !== today;
  if (canClearBonus) trainer.value.torre.lastClearBonusDay = today;
  const total = survivorCoins(s) + (canClearBonus ? SURVIVOR_CLEAR_BONUS : 0);
  runCoins.value = total > 0 ? addCoins(total) : 0;
  runClearBonus.value = canClearBonus ? SURVIVOR_CLEAR_BONUS : 0;
  emit('complete', s, runParticipant, activeRunId);
}

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface PickOption {
  id: string;
  origin: string;
  dexId: number;
  name: string;
  types: PokemonType[];
  move: SurvivorMove;
  /** Barras do golpe (dano, rapidez, alcance ou raio, vida) pelos stats. */
  bars: { label: string; value: number }[];
  /** Retrato (data URL) pro cartão de escolha; null quando o pacote local não tem sprite pra essa espécie. */
  thumb: string | null;
  shiny?: boolean;
  accessory?: string | null;
  digital?: boolean;
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
/** Aviso breve de dano: fica fora do canvas para não acrescentar trabalho ao renderizador do jogo. */
const damageFeedback = ref(false);
let damageFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
const ready = ref(false);
const failed = ref(false);
const avatarName = ref('');
const state = ref<SurvivorState | null>(null);
/** Variante BONK: mesma corrida, mas com câmera em terceira pessoa e terreno físico. */
const bonkRun = ref(false);
// Mudado em todo quadro pelo laço: `shallowRef` evita um proxy por campo, e o laço chama `triggerRef` uma vez.
const bonkPhysics = shallowRef<BonkPhysics | null>(null);
let bonkJumpQueued = false;
/** Para que lado o sprite olha no BONK: segue o lado do analógico na tela, não a direção no mundo. */
let bonkFacing: -1 | 1 = 1;
const guardian = computed(() => state.value ? SPECIAL_GUARDIANS[state.value.special.type] : null);
const chosenSpecial = computed(() => state.value?.special.selected ? SURVIVOR_SPECIALS[state.value.special.selected] : null);
const specialModalOpen = computed(() => {
  const phase = state.value?.special.phase;
  return phase === 'arrival' || phase === 'choice' || phase === 'branch-arrival' || phase === 'branch-choice';
});
const shadowCutsceneOpen = computed(() => state.value?.shadowEncounter.phase === 'arrival');
const specialBranchOptions = computed(() => state.value?.special.selected ? SURVIVOR_SPECIAL_BRANCHES[state.value.special.selected] : []);
const specialBlocked = computed(() => !state.value || state.value.over || paused.value || shadowCutsceneOpen.value || !!pendingUpgrade.value || !!evolving.value || state.value.special.phase !== 'ready');
const guardianSprite = ref<string | null>(null);
const shadowBossSprite = ref<string | null>(null);
let specialQueued = false;
/** Botão de carga (Foco e Rápido) apertado agora; o motor lê se está segurado a cada passo. */
const chargeHeld = ref(false);
const chargeStyle = computed(() => {
  const category = state.value?.player.move.category;
  return category === 'foco' || category === 'rapido' ? category : null;
});
/** Barra do botão: os teleportes do Rápido esvaziam com o tempo; fora deles, o quanto a barra encheu. */
const chargeMeter = computed(() => {
  const charge = state.value?.charge;
  if (!charge) return 0;
  return charge.rushMs > 0 ? charge.rushMs / Math.max(1, charge.rushTotalMs) : charge.level;
});
const chargeLabel = computed(() => {
  const charge = state.value?.charge;
  if (!charge || !chargeStyle.value) return '';
  if (chargeStyle.value === 'rapido') return charge.rushMs > 0 ? `${Math.ceil(charge.rushMs / 1000)}s` : charge.level >= 0.5 ? 'PRONTO' : `${Math.floor(charge.level * 100)}%`;
  return charge.level >= 1 ? 'MÁXIMO' : charge.level > 0 || chargeHeld.value ? `${Math.floor(charge.level * 100)}%` : 'SEGURE';
});
function pressCharge(event?: PointerEvent): void {
  if (!state.value || state.value.over || paused.value || !chargeStyle.value) return;
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.setPointerCapture?.(event.pointerId);
  unlockSound();
  chargeHeld.value = true;
}
function releaseCharge(): void {
  chargeHeld.value = false;
}
function queueSpecial(): void {
  if (specialBlocked.value || (state.value?.special.cooldownMs ?? 1) > 0) return;
  unlockSound();
  specialQueued = true;
}
function chooseSpecial(id: SurvivorSpecialId): void {
  if (!state.value || !chooseSurvivorSpecial(state.value, id)) return;
  heldKeys.clear(); joyUp(); specialQueued = false; chargeHeld.value = false;
  playSound('success');
  say(`${SURVIVOR_SPECIALS[id].name} pronto! Toque no botão à direita ou pressione E.`, 4500);
}
function chooseSpecialBranch(id: SurvivorSpecialBranchId): void {
  if (!state.value || !chooseSurvivorSpecialBranch(state.value, id)) return;
  heldKeys.clear(); joyUp(); specialQueued = false; chargeHeld.value = false;
  say('Ramo escolhido. O novo efeito está pronto.', 2200);
}
const paused = ref(false);
/** Ajuda dos controles aberta (dentro da pausa: abrir a ajuda pausa a corrida, retomar fecha). */
const helpOpen = ref(false);

/** Botões Pular e Especial: tamanho e arranjo ajustáveis para uso com dois polegares (ficam guardados no aparelho). */
type ButtonSize = 'p' | 'm' | 'g';
type ButtonLayout = 'lado' | 'pilha' | 'troca';
const BUTTONS_KEY = 'tcg-ar-survivor-buttons-v1';
const BUTTON_SCALE: Record<ButtonSize, number> = { p: 0.85, m: 1, g: 1.2 };
const BUTTON_SIZE_LABELS: Record<ButtonSize, string> = { p: 'Pequenos', m: 'Médios', g: 'Grandes' };
const BUTTON_LAYOUT_LABELS: Record<ButtonLayout, string> = { lado: 'Lado a lado', pilha: 'Empilhados', troca: 'Trocados' };
function readButtons(): { size: ButtonSize; layout: ButtonLayout } {
  try {
    const raw = JSON.parse(localStorage.getItem(BUTTONS_KEY) ?? 'null') as { size?: string; layout?: string } | null;
    return {
      size: raw?.size === 'p' || raw?.size === 'g' ? raw.size : 'm',
      layout: raw?.layout === 'pilha' || raw?.layout === 'troca' ? raw.layout : 'lado',
    };
  } catch {
    return { size: 'm', layout: 'lado' };
  }
}
const savedButtons = readButtons();
const buttonSize = ref<ButtonSize>(savedButtons.size);
const buttonLayout = ref<ButtonLayout>(savedButtons.layout);
watch([buttonSize, buttonLayout], () => {
  try { localStorage.setItem(BUTTONS_KEY, JSON.stringify({ size: buttonSize.value, layout: buttonLayout.value })); } catch { /* armazenamento indisponível */ }
});
function openHelp(): void {
  if (!paused.value) togglePause();
  if (paused.value) helpOpen.value = true;
}
const leaveConfirm = ref(false);
const bonkJumpBlocked = computed(() => !bonkRun.value || !state.value || state.value.over || paused.value || !!pendingUpgrade.value || !!evolving.value || specialModalOpen.value);
/** Saltos disponíveis agora (true) e já usados (false), na ordem; vira as bolinhas do botão Pular. */
const bonkJumpPips = computed(() => {
  const physics = bonkPhysics.value;
  const player = state.value?.player;
  if (!physics || !player) return [] as boolean[];
  const maximum = 1 + Math.max(0, player.bonkAirJumps ?? 0);
  const remaining = bonkJumpsRemaining(physics, player);
  return Array.from({ length: maximum }, (_, i) => i < remaining);
});
const bonkJumpLabel = computed(() => {
  const pips = bonkJumpPips.value;
  if (pips.length === 0) return '';
  return `${pips.filter(Boolean).length} de ${pips.length} saltos`;
});
/** Liga o estado "apertado" do botão por um instante: no toque, `:active` some antes de o quadro ser desenhado. */
const bonkJumpPressed = ref(false);
let bonkJumpPressTimer: ReturnType<typeof setTimeout> | null = null;
function queueBonkJump(): void {
  if (bonkJumpBlocked.value) return;
  unlockSound();
  bonkJumpQueued = true;
  bonkJumpPressed.value = true;
  if (bonkJumpPressTimer) clearTimeout(bonkJumpPressTimer);
  bonkJumpPressTimer = setTimeout(() => { bonkJumpPressed.value = false; bonkJumpPressTimer = null; }, 160);
}
let wasPausedBeforeLeave = false;
const trainerPresentation = ref<null | { trainerId: number; count: number; final: boolean }>(null);
let trainerPresentationTimer: ReturnType<typeof setTimeout> | null = null;
function clearTrainerPresentation(resume = false): void {
  if (trainerPresentationTimer) clearTimeout(trainerPresentationTimer);
  trainerPresentationTimer = null;
  trainerPresentation.value = null;
  if (resume && !leaveConfirm.value && !summary.value) {
    paused.value = false;
    lastTs = performance.now();
  }
}
function showTrainerPresentation(event: { trainerId: number; count: number; final: boolean }): void {
  clearTrainerPresentation();
  heldKeys.clear();
  joyUp();
  // A chegada do treinador interrompe a corrida por alguns segundos; o menu aberto
  // antes não deve disputar atenção com esse aviso.
  hudExpanded.value = false;
  paused.value = true;
  trainerPresentation.value = event;
  trainerPresentationTimer = setTimeout(() => clearTrainerPresentation(true), event.final ? 3400 : 2800);
}
const minimap = ref({ markers: [] as ReturnType<typeof survivorMinimapSnapshot>['markers'], viewport: { x: 0, y: 0, width: ARENA_W, height: ARENA_H } });
const objectives = ref<ReturnType<typeof survivorObjectives>>([]);
const pendingUpgrade = ref<SurvivorUpgradeOption[] | null>(null);
const upgradeMenuLocked = ref(false);
const UPGRADE_OPEN_DELAY_MS = 1000;
let upgradeMenuLockTimer: ReturnType<typeof setTimeout> | null = null;
watch(pendingUpgrade, (offer) => {
  if (upgradeMenuLockTimer) clearTimeout(upgradeMenuLockTimer);
  upgradeMenuLockTimer = null;
  upgradeMenuLocked.value = Boolean(offer);
  if (offer) {
    upgradeMenuLockTimer = setTimeout(() => {
      upgradeMenuLockTimer = null;
      upgradeMenuLocked.value = false;
      focusFirstSurvivorAction();
    }, UPGRADE_OPEN_DELAY_MS);
  }
});
const availableUpgradeRerolls = computed(() => state.value?.player.upgradeRerolls ?? 0);
const summary = ref<SurvivorSummary | null>(null);
const feedback = reactive(emptySurvivorFeedbackAnswers());
const feedbackCode = ref('');
const feedbackSubmitted = ref(false);
const feedbackCopied = ref(false);
const feedbackError = ref('');
const feedbackQuestions: readonly { key: FeedbackRatingKey; label: string; low: string; high: string }[] = [
  { key: 'fun', label: 'Quanto a corrida foi divertida?', low: 'Nada', high: 'Muito' },
  { key: 'difficulty', label: 'Como você sentiu a dificuldade?', low: 'Muito fácil', high: 'Muito difícil' },
  { key: 'clarity', label: 'As ameaças e escolhas ficaram claras?', low: 'Nada claras', high: 'Muito claras' },
  { key: 'fairness', label: 'A derrota pareceu justa?', low: 'Nada justa', high: 'Muito justa' },
  { key: 'replay', label: 'Você jogaria outra corrida?', low: 'De jeito nenhum', high: 'Com certeza' },
];
const feedbackComplete = computed(() => feedbackQuestions.every(({ key }) => feedback[key] >= 1 && feedback[key] <= 5));
function setFeedbackRating(key: FeedbackRatingKey, value: number): void {
  if (value >= 1 && value <= 5) feedback[key] = value as FeedbackRating;
}
function resetFeedback(): void {
  Object.assign(feedback, emptySurvivorFeedbackAnswers());
  feedbackCode.value = '';
  feedbackSubmitted.value = false;
  feedbackCopied.value = false;
  feedbackError.value = '';
}
function submitFeedback(): void {
  if (!summary.value || !state.value || !feedbackComplete.value) {
    feedbackError.value = 'Escolha uma nota em cada pergunta antes de gerar o código.';
    return;
  }
  feedbackCode.value = encodeSurvivorFeedback({
    runId: activeRunId,
    seed: state.value.runSeed,
    participant: { ...runParticipant, dexId: runParticipantDexId },
    summary: summary.value,
    move: state.value.player.move,
    preparation: selectedPreparation.value,
    state: state.value,
    answers: { ...feedback, fun: feedback.fun as FeedbackRating, difficulty: feedback.difficulty as FeedbackRating, clarity: feedback.clarity as FeedbackRating, fairness: feedback.fairness as FeedbackRating, replay: feedback.replay as FeedbackRating },
  });
  feedbackSubmitted.value = true;
  feedbackError.value = '';
}
async function copyFeedbackCode(): Promise<void> {
  if (!feedbackCode.value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(feedbackCode.value);
    } else {
      const field = document.createElement('textarea');
      field.value = feedbackCode.value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      try {
        field.select();
        if (!document.execCommand('copy')) throw new Error('copy indisponível');
      } finally {
        field.remove();
      }
    }
    feedbackCopied.value = true;
  } catch {
    feedbackError.value = 'Não consegui acessar a área de transferência. Selecione o código e copie manualmente.';
  }
}
const runUnlocks = ref<string[]>([]);
/** Tela de escolha antes de cada corrida: até 6 Pokémon aleatórios da caixa do jogador, para escolher quem joga
 * dessa vez. Null enquanto ainda está sorteando/carregando os retratos. */
const pickOptions = ref<PickOption[] | null>(null);
/** A Torre nunca inventa um protagonista: sem parceiro, explica como conseguir um antes de iniciar. */
const noCompanion = ref(false);
const pickBusy = ref(false);
const rerollsUsed = ref(0);
const previousPickIds = ref<string[]>([]);
const favoriteIds = ref<Set<string>>(new Set());
const FAVORITES_KEY = 'tcg-ar-survivor-favorites-v1';
/** Evoluindo: o jogo espera o sprite da nova forma carregar (com o brilho na tela) antes de continuar. */
const evolving = ref<string | null>(null);
/** Espécies que têm sprite no pacote local (`village-sprite-meta.json`): a carta "Evoluir" só oferece estas. */
let spriteSpecies: Set<number> | null = null;
async function loadSpriteSpecies(): Promise<Set<number>> {
  if (spriteSpecies) return spriteSpecies;
  const meta = (await fetch(assetUrl('data/village-sprite-meta.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Record<string, { a?: Record<string, unknown> }> | null;
  spriteSpecies = new Set(Object.entries(meta ?? {}).filter(([, v]) => !!v.a?.Walk).map(([k]) => Number(k)));
  return spriteSpecies;
}
/**
 * Próximas formas reais que a Torre consegue desenhar (sem sprite no pacote, a forma não é oferecida), com os números
 * pelos stats da nova forma — a forma do golpe continua a mesma da corrida.
 */
function evolutionsFor(dexId: number, moveOverride?: SurvivorMove): SurvivorEvolutionOption[] {
  const move = moveOverride ?? state.value?.player.move;
  return nextEvolutions(dexId)
    .filter((id) => spriteSpecies?.has(id))
    .map((id) => {
      const stats = statsOfDex(id);
      return { dexId: id, name: speciesName(id) || `Pokémon nº ${id}`, ...(move && stats ? { profile: attackProfile(move, stats) } : {}) };
    });
}
const sound = new SoundEngine();
const musicUnavailable = ref(false);
const music = new MusicPlayer(path => `${import.meta.env.BASE_URL}${path}`, () => { musicUnavailable.value = true; });
function syncMusic(): void {
  const s = state.value;
  music.update(survivorMusicMix(s?.elapsedMs ?? 0, s?.runSeed ?? 0), !!s && ready.value && !s.over && !paused.value && !leaveConfirm.value && !pendingUpgrade.value && !evolving.value && !document.hidden, survivorAudio.enabled ? survivorAudio.volume / 100 : 0);
}
watch([() => survivorAudio.enabled, () => survivorAudio.volume, ready, paused, leaveConfirm, pendingUpgrade, evolving, summary], syncMusic);
function unlockMusic(): void { musicUnavailable.value = false; syncMusic(); music.unlock(); }
type UiSound = Extract<SoundCue, { kind: 'ui' }>['cue'];

function unlockSound(): void {
  unlockMusic();
  sound.setEnabled(visual.sound);
  sound.unlock();
}

function playSound(cue: UiSound): void {
  sound.setEnabled(visual.sound);
  sound.play({ kind: 'ui', cue });
}

let lastAttackSoundAt = -Infinity;
/** Uma tentativa de ataque por quadro basta: rajadas e aliados não viram ruído contínuo. */
function playAttackSound(move: SurvivorMove, now: number): void {
  if (!survivorAudio.attackSounds || now - lastAttackSoundAt < 70) return;
  lastAttackSoundAt = now;
  sound.setEnabled(visual.sound);
  sound.play({ kind: 'survivor-attack', type: move.type, category: move.category });
}

/** Flash e tremor discretos, desligáveis junto com os impactos e ausentes no Modo Rotom. */
function showDamageFeedback(): void {
  if (!effectiveVisual.value.impactFx || reducedMotion) return;
  if (damageFeedbackTimer) clearTimeout(damageFeedbackTimer);
  damageFeedback.value = false;
  requestAnimationFrame(() => { damageFeedback.value = true; });
  damageFeedbackTimer = setTimeout(() => {
    damageFeedback.value = false;
    damageFeedbackTimer = null;
  }, 500);
}

let ctx: CanvasRenderingContext2D | null = null;
let groundPattern: CanvasPattern | null = null;
let playerSprite: SpriteAsset | null = null;
/** Só no BONK: o mesmo Pokémon de costas para a câmera (ver `loadBackSpriteOrNull`). */
let playerBackSprite: Sprite | null = null;
const supportSprites = new Map<number, SpriteAsset | null>();
const supportAccessories = new Map<number, string | null | undefined>();
let playerAccessory: string | null | undefined;
const enemySprites = new Map<number, SpriteAsset | null>();
const enemySpriteLoads = new Map<number, Promise<void>>();
const requestedEnemyRegions = new Set<number>();
const missingEnemySprites = ref(0);
let rafId = 0;
/**
 * A tela saiu (fechou a Torre). O carregamento da corrida espera sprites e o chão; se a pessoa sai no meio dele, nada
 * pode recomeçar o laço depois (antes o `beginRun` terminava e ligava um requestAnimationFrame que nunca parava).
 */
let disposed = false;
let lastTs = 0;
let lastMusicSync = -Infinity;
let animMs = 0;
// Marca única do último golpe: o desenho consulta a pose por quadro, sem timers por Pokémon.
let playerAttackAt = -Infinity;
let lastMinimapMs = -Infinity;
let announcedRegion = '';
const heldKeys = new Set<string>();
/** Joystick flutuante: aparece onde o dedo encostou na tela da Torre (`lx`, `ly`, relativos à tela). */
const joystick = reactive({ active: false, pointerId: null as number | null, cx: 0, cy: 0, dx: 0, dy: 0, lx: 0, ly: 0 });
let bonkPointerStart: (SurvivorPointerSample & { pointerId: number }) | null = null;
let previousBonkTap: SurvivorPointerSample | null = null;

function clearBonkTap(): void {
  bonkPointerStart = null;
  previousBonkTap = null;
}

type SurvivorDirection = 'up' | 'right' | 'down' | 'left';
const KEY_DIR: Record<string, SurvivorDirection> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

const SURVIVOR_ACTION_SELECTOR = 'button:not(:disabled), [role="button"][tabindex]:not([tabindex="-1"]), a[href], input:not(:disabled), select:not(:disabled)';

function activeSurvivorDialog(): HTMLElement | null {
  // Alguns momentos (como a afinidade do segundo tipo) pausam a corrida e deixam
  // o aviso de pausa no DOM. O último overlay visível é o que está por cima.
  return [...document.querySelectorAll<HTMLElement>('.survivor-overlay[role="dialog"], .survivor-overlay[role="alertdialog"]')].reverse()
    .find((element) => element.getClientRects().length > 0) ?? null;
}

function focusFirstSurvivorAction(): void {
  void nextTick(() => {
    const dialog = activeSurvivorDialog();
    const action = dialog?.querySelector<HTMLElement>(SURVIVOR_ACTION_SELECTOR);
    action?.focus({ preventScroll: true });
  });
}

function moveSurvivorFocus(direction: SurvivorDirection): boolean {
  const dialog = activeSurvivorDialog();
  if (!dialog) return false;
  const actions = [...dialog.querySelectorAll<HTMLElement>(SURVIVOR_ACTION_SELECTOR)]
    .filter((element) => element.getClientRects().length > 0);
  if (!actions.length) return false;
  const active = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)
    ? document.activeElement
    : actions[0]!;
  if (!dialog.contains(document.activeElement)) {
    active.focus({ preventScroll: true });
    return true;
  }
  const from = active.getBoundingClientRect();
  const originX = from.left + from.width / 2;
  const originY = from.top + from.height / 2;
  const next = actions
    .filter((element) => element !== active)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - originX;
      const dy = rect.top + rect.height / 2 - originY;
      const primary = direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      return { element, primary, score: primary + secondary * 1.7 };
    })
    .filter((candidate) => candidate.primary > 1)
    .sort((a, b) => a.score - b.score)[0]?.element;
  (next ?? actions[(actions.indexOf(active) + 1) % actions.length]!).focus({ preventScroll: true });
  return true;
}

function confirmSurvivorDialog(): boolean {
  const dialog = activeSurvivorDialog();
  if (!dialog) return false;
  const active = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)
    ? document.activeElement
    : dialog.querySelector<HTMLElement>(SURVIVOR_ACTION_SELECTOR);
  if (!active) return false;
  active.click();
  return true;
}

function onKey(e: KeyboardEvent): void {
  // Cartões acessíveis do seletor já tratam Enter/Espaço localmente.
  // Ao chegar na janela, o mesmo evento não deve escolher a opção duas vezes.
  if (e.defaultPrevented) return;
  if (e.type === 'keydown' && e.key === 'Escape') {
    e.preventDefault();
    requestBack();
    return;
  }
  const dir = KEY_DIR[e.key];
  if (e.type === 'keydown' && dir && moveSurvivorFocus(dir)) {
    e.preventDefault();
    return;
  }
  if (e.type === 'keydown' && (e.key === ' ' || e.key === 'Enter' || e.key === 'z') && !(e.key !== 'z' && document.activeElement instanceof HTMLButtonElement) && confirmSurvivorDialog()) {
    e.preventDefault();
    return;
  }
  if ((e.key === 'e' || e.key === 'E') && e.type === 'keydown' && !e.repeat) { e.preventDefault(); queueSpecial(); return; }
  if (e.key === 'r' || e.key === 'R') {
    if (e.type === 'keyup') releaseCharge();
    else if (!e.repeat) pressCharge();
    if (chargeStyle.value) e.preventDefault();
    return;
  }
  if (bonkRun.value && (e.key === 'q' || e.key === 'Q' || e.key === ' ') && e.type === 'keydown' && !e.repeat && !(e.key === ' ' && document.activeElement instanceof HTMLButtonElement)) {
    queueBonkJump();
    if (bonkRun.value) e.preventDefault();
    return;
  }
  if (!dir) return;
  if (e.type === 'keydown') heldKeys.add(dir);
  else heldKeys.delete(dir);
}

function onGamepadDirection(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean; direction?: string; pressed?: boolean }>;
  const direction = custom.detail.direction;
  if (custom.detail.handled || !direction || custom.detail.pressed === undefined) return;
  // Soltar precisa funcionar mesmo se um diálogo abriu enquanto o botão estava pressionado.
  if (!custom.detail.pressed) heldKeys.delete(direction);
  if (!ready.value || paused.value || shadowCutsceneOpen.value || summary.value || pickOptions.value || pendingUpgrade.value || evolving.value || specialModalOpen.value) return;
  if (custom.detail.pressed) heldKeys.add(direction);
  else heldKeys.delete(direction);
  custom.detail.handled = true;
}

function onGamepadAction(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean }>;
  if (custom.detail.handled || !ready.value || !state.value || paused.value || shadowCutsceneOpen.value || summary.value || pickOptions.value || pendingUpgrade.value || evolving.value || specialModalOpen.value) return;
  if (!chosenSpecial.value || state.value.special.cooldownMs > 0) return;
  custom.detail.handled = true;
  queueSpecial();
}

function onGamepadBack(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean }>;
  if (custom.detail.handled) return;
  custom.detail.handled = true;
  requestBack();
}

function onGamepadMenu(event: Event): void {
  const custom = event as CustomEvent<{ handled: boolean }>;
  if (custom.detail.handled || !ready.value || !state.value || paused.value || summary.value || pendingUpgrade.value || evolving.value) return;
  custom.detail.handled = true;
  if (specialModalOpen.value) return;
  togglePause();
}

function joyDown(e: PointerEvent): void {
  if (joystick.active || paused.value || shadowCutsceneOpen.value || !ready.value || summary.value || pickOptions.value || specialModalOpen.value) return;
  // Botões das cartas (escolha, upgrades, resumo) continuam sendo botões: o joystick não pega esse toque.
  if ((e.target as HTMLElement | null)?.closest?.('button, .card')) return;
  unlockSound();
  const el = e.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  joystick.active = true;
  joystick.pointerId = e.pointerId;
  joystick.cx = e.clientX;
  joystick.cy = e.clientY;
  joystick.lx = e.clientX - rect.left;
  joystick.ly = e.clientY - rect.top;
  if (bonkRun.value && e.button === 0) bonkPointerStart = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp };
  el.setPointerCapture?.(e.pointerId);
  joyMove(e);
}
function joyMove(e: PointerEvent): void {
  if (!joystick.active || e.pointerId !== joystick.pointerId) return;
  const dx = e.clientX - joystick.cx;
  const dy = e.clientY - joystick.cy;
  const stick = survivorStick(dx, dy, JOY_MAX);
  joystick.dx = stick.dx;
  joystick.dy = stick.dy;
}
function joyUp(e?: PointerEvent): void {
  if (e && e.pointerId !== joystick.pointerId) return;
  const start = bonkPointerStart;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = 0;
  bonkPointerStart = null;
  if (!e || !start || start.pointerId !== e.pointerId || !bonkRun.value) return;
  const tap = { x: e.clientX, y: e.clientY, at: e.timeStamp };
  if (!isBonkTap(start, tap)) {
    previousBonkTap = null;
    return;
  }
  if (isBonkDoubleTap(previousBonkTap, tap)) {
    previousBonkTap = null;
    queueBonkJump();
    return;
  }
  previousBonkTap = tap;
}
function joyCancel(e: PointerEvent): void {
  if (e.pointerId !== joystick.pointerId) return;
  clearBonkTap();
  joyUp(e);
}

function drawSprite(asset: SpriteAsset | null, x: number, y: number, flip: boolean, scale: number, direction: SurvivorSpriteDirection = 'down', accessory?: string | null): void {
  if (!ctx) return;
  if (!asset) {
    ctx.fillStyle = 'rgba(110,116,130,0.92)';
    ctx.beginPath();
    ctx.ellipse(x, y, 12 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const directional = !('frames' in asset);
  const sprite = directional ? (asset[direction] ?? asset.down ?? asset.right ?? asset.left ?? asset.up ?? null) : asset;
  if (!sprite) return;
  const frame = sprite.frames[frameIndex(sprite, animMs)] ?? sprite.frames[0]!;
  const w = sprite.w * sprite.fit * scale;
  const h = sprite.h * sprite.fit * scale;
  // Pés (base dos pixels opacos) no ponto (x, y) e corpo centrado: a margem transparente da folha não conta.
  const left = -((sprite.bounds.left + sprite.bounds.right) / 2) * w;
  const top = -sprite.bounds.bottom * h;
  const mirror = flip && !directional;
  // Sem poses por direção, a folha mostra sempre a mesma pose de frente (o espelho só a vira).
  const facing: Facing = !directional ? 'front' : direction === 'up' ? 'back' : direction === 'down' ? 'front' : direction;
  const fit = accessory ? accessoryFit(accessory, sprite, x, y + top, w, h, scale, facing, mirror) : null;
  if (fit?.behind) drawAccessoryOverlay(fit);
  // Sem espelho, a posição entra direto no desenho: sem `save`/`restore` por inimigo (são a parte mais cara aqui).
  if (!mirror) ctx.drawImage(frame, x + left, y + top, w, h);
  else {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(frame, left, top, w, h);
    ctx.restore();
  }
  if (fit && !fit.behind) drawAccessoryOverlay(fit);
}

interface AccessoryFit extends Placement { art: HTMLCanvasElement; mirror: boolean }

/**
 * A Vila desenha acessórios em pixel art; a Torre reaproveita o mesmo desenho e a mesma âncora genérica, com o pixel do
 * desenho do tamanho de um pixel do tileset da Torre (`SURVIVOR_TILE_PX` por bloco de 16).
 */
function accessoryFit(id: string, sprite: Sprite, x: number, frameTop: number, w: number, h: number, scale: number, facing: Facing, mirror: boolean): AccessoryFit | null {
  const def = itemDef(id);
  const art = accessoryCanvas(id);
  if (!def?.pos || !art) return null;
  const frameLeft = x - ((sprite.bounds.left + sprite.bounds.right) / 2) * w;
  const body = { left: frameLeft + sprite.bounds.left * w, top: frameTop + sprite.bounds.top * h, w: (sprite.bounds.right - sprite.bounds.left) * w, h: (sprite.bounds.bottom - sprite.bounds.top) * h };
  const placed = placeAccessory(def.pos, { w: art.width, h: art.height }, (SURVIVOR_TILE_PX / 16) * scale, { ...body, headX: x, headTop: body.top }, facing, def.nudge);
  if (placed.hidden) return null;
  return { ...placed, x: mirror ? Math.round(2 * x - placed.x - placed.w) : placed.x, art, mirror };
}

function drawAccessoryOverlay(fit: AccessoryFit): void {
  if (!ctx) return;
  if (!fit.mirror) { ctx.drawImage(fit.art, fit.x, fit.y, fit.w, fit.h); return; }
  ctx.save();
  ctx.translate(fit.x + fit.w / 2, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(fit.art, -fit.w / 2, fit.y, fit.w, fit.h);
  ctx.restore();
}

function drawShadowFlames(x: number, y: number, radius: number): void {
  if (!ctx || effectiveVisual.value.rotomMode) return;
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = '#b575ff';
  ctx.shadowColor = '#6826b8';
  ctx.shadowBlur = 13;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8 + animMs / 820;
    const fx = x + Math.cos(angle) * radius;
    const fy = y - 10 + Math.sin(angle) * radius * 0.58;
    ctx.beginPath();
    ctx.moveTo(fx - 4, fy + 8);
    ctx.quadraticCurveTo(fx + Math.sin(angle) * 9, fy - 17, fx + 5, fy + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEnemy(e: SurvivorEnemy): void {
  if (!ctx) return;
  const sprite = e.dexId === undefined ? null : (enemySprites.get(e.dexId) ?? null);
  // Grau: elite com anel dourado, chefão (do treinador) com anel vermelho — ajuda a reconhecer na correria.
  if (e.grade !== 'comum') {
    ctx.strokeStyle = e.grade === 'chefao' ? '#e8453c' : '#ffd84a';
    ctx.lineWidth = e.grade === 'chefao' ? 3 : 2;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.grade === 'chefao' ? 22 : 18), 0, Math.PI * 2);
    ctx.stroke();
  }
  const scale = e.shadowBoss ? 1.7 : e.boss ? 1.2 : e.grade === 'chefao' ? 1.3 : e.grade === 'elite' ? 1.1 : 1;
  if (e.shadowBoss) drawShadowFlames(e.x, e.y, 31);
  if (e.archetype === 'protetor' || e.archetype === 'suporte' || e.protectedMs) {
    ctx.save();
    ctx.globalAlpha = e.protectedMs ? 0.55 : 0.3;
    ctx.strokeStyle = e.protectedMs ? '#8ed8ff' : e.archetype === 'suporte' ? '#8ee6a0' : '#9bb8ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(e.x, e.y - 8, e.protectedMs ? 21 : 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (e.chargeMs) {
    // Aviso da investida: o anel vermelho se fecha até o avanço, para dar tempo de sair do caminho.
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 26 - (e.chargeMs / 500) * 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (e.archetype === 'explosivo') {
    // Pavio aceso: um ponto laranja acima do sprite indica que ele explode ao cair.
    ctx.fillStyle = '#ff8c3a';
    ctx.beginPath();
    ctx.arc(e.x + 12, e.y - 30, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const player = state.value?.player;
  drawSprite(sprite, e.x, e.y, false, scale, player ? survivorSpriteDirection(player.x - e.x, player.y - e.y) : 'down');
  // Efeitos do golpe no inimigo: um pontinho colorido em cima (queimando, lento, atordoado).
  const marks: string[] = [];
  if (e.burnMs) marks.push(state.value?.player.move.color ?? '#ff7a2f');
  if (e.slowMs) marks.push('#9fe8ff');
  if (e.stunMs) marks.push('#ffe23d');
  if (e.wetMs) marks.push('#5bc0ff');
  if (e.seededMs) marks.push('#5ccf5c');
  marks.forEach((color, i) => {
    ctx!.fillStyle = color;
    ctx!.beginPath();
    ctx!.arc(e.x - (marks.length - 1) * 4 + i * 8, e.y - (e.boss ? 54 : 32), 3, 0, Math.PI * 2);
    ctx!.fill();
  });
  if (e.hitFlashMs > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.35 * (e.hitFlashMs / 90)})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, (e.boss ? 24 : 13) * (e.boss ? 1.3 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  if (e.hp < e.maxHp) {
    const w = e.boss ? 44 : 22;
    const y = e.y - (e.boss ? 46 : 26);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - w / 2, y, w, 4);
    // O suporte usa rosa e um coração: a recuperação deixa de parecer um HP que voltou sozinho.
    ctx.fillStyle = e.boss ? '#f06a6a' : e.archetype === 'suporte' ? '#ff78b7' : '#8be06a';
    ctx.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
  }
  if (e.archetype === 'suporte') {
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ff78b7';
    ctx.fillText('♥', e.x + (e.boss ? 26 : 17), e.y - (e.boss ? 48 : 27));
  }
}

/** Sprite 2D voltado para a câmera (billboard): a perspectiva vem da projeção, não de um modelo 3D inventado. */
function drawBonkBillboard(
  sprite: SpriteAsset | null, x: number, y: number, scale: number, flip = false, alpha = 1,
  shadow: { x: number; y: number; rx: number; ry: number } | null = null, squash = 0, direction: SurvivorSpriteDirection = 'down', accessory?: string | null,
): void {
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // A sombra fica no chão: no pulo, o sprite sobe e ela encolhe embaixo dele (é o que dá para ler a altura).
  const ground = shadow ?? { x, y: y + 2, rx: Math.max(3, 15 * scale), ry: Math.max(1.5, 5 * scale) };
  ctx.fillStyle = 'rgba(13, 23, 43, .32)';
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, ground.rx, ground.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (squash !== 0) {
    // Achatado ao pousar (squash > 0), esticado ao subir (squash < 0), sempre com os pés no mesmo ponto.
    ctx.translate(x, y);
    ctx.scale(1 + squash * 0.7, 1 - squash);
    drawSprite(sprite, 0, 0, flip, scale, direction, accessory);
  } else {
    drawSprite(sprite, x, y, flip, scale, direction, accessory);
  }
  ctx.restore();
}

function drawBonkEnemy(e: SurvivorEnemy, x: number, y: number, scale: number): void {
  if (!ctx) return;
  const sprite = e.dexId === undefined ? null : (enemySprites.get(e.dexId) ?? null);
  const size = (e.shadowBoss ? 1.7 : e.boss ? 1.2 : e.grade === 'chefao' ? 1.12 : e.grade === 'elite' ? 0.96 : 0.84) * scale;
  if (e.shadowBoss) drawShadowFlames(x, y, 20 * size);
  if (e.grade !== 'comum') {
    ctx.save();
    ctx.strokeStyle = e.grade === 'chefao' ? '#ff6e73' : '#ffd84a';
    ctx.lineWidth = Math.max(1, scale * 1.8);
    ctx.beginPath();
    ctx.ellipse(x, y, 16 * size, 5 * size, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (e.chargeMs) {
    // Aviso da investida também no BONK: anel vermelho no chão que se fecha até o avanço.
    ctx.save();
    ctx.strokeStyle = '#ff5a5a';
    ctx.lineWidth = Math.max(1.5, 2.4 * scale);
    ctx.beginPath();
    ctx.ellipse(x, y, (26 - (e.chargeMs / 500) * 8) * size, (8 - (e.chargeMs / 500) * 2.5) * size, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const player = state.value?.player;
  drawBonkBillboard(sprite, x, y, size, false, 1, null, 0, player ? survivorSpriteDirection(player.x - e.x, player.y - e.y) : 'down');
  if (e.hp < e.maxHp) {
    const width = Math.max(14, 28 * scale);
    const barY = y - Math.max(22, 38 * scale);
    ctx.fillStyle = 'rgba(8, 14, 25, .72)';
    ctx.fillRect(x - width / 2, barY, width, Math.max(2, 3 * scale));
    ctx.fillStyle = e.archetype === 'suporte' ? '#ff78b7' : '#8be06a';
    ctx.fillRect(x - width / 2, barY, width * clamp(e.hp / e.maxHp, 0, 1), Math.max(2, 3 * scale));
  }
  const mark = e.stunMs ? '#ffe23d' : e.burnMs ? '#ff7a2f' : e.slowMs ? '#9fe8ff' : e.archetype === 'explosivo' ? '#ff8c3a' : null;
  if (mark) {
    ctx.fillStyle = mark;
    ctx.beginPath();
    ctx.arc(x, y - Math.max(25, 42 * scale), Math.max(2, 3 * scale), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Renderizador BONK: perspectiva suave, profundidade e sprites em billboard; o motor de combate é o mesmo da Torre. */
function drawBonkScene(s: SurvivorState, physics: BonkPhysics): void {
  if (!ctx) return;
  const c = ctx;
  const viewport = { width: view.w, height: view.h };
  c.clearRect(0, 0, viewport.width, viewport.height);
  const region = survivorRegionAt(s.elapsedMs, s.runSeed);
  const art = bonkArtForRegion(region.current);
  const nextArt = region.blend > 0 ? bonkArtForRegion(region.next) : null;
  drawBonkGround(c, physics, s.player, viewport, s.elapsedMs, art, nextArt, region.blend);

  const drawPoint = (point: { x: number; y: number }, z = 0) => projectBonkPoint(physics, s.player, { ...point, z }, viewport);
  const toScreen: WorldToScreen = (x, y, z = 0) => {
    const p = projectBonkPoint(physics, s.player, { x, y, z }, viewport);
    return p ? { x: p.x, y: p.y, s: p.scale } : null;
  };
  const move = s.player.move;
  const detailed = detailedSpecialEffects.value;
  // Marcas de alcance no chão vão antes das figuras: o Pokémon e os inimigos ficam por cima delas.
  if (move.category === 'aura') drawElementAuraField(c, s.player, move.type, toScreen, animMs, detailed);
  else if (move.category === 'cone') drawConeGuide(c, s.player, s.player.attackRange, move.type, toScreen, 1 - s.player.attackTimerMs / Math.max(1, s.player.attackCooldownMs));
  else if (move.category === 'orbit') drawOrbitPath(c, s.player, move.type, toScreen);
  // Tudo que tem altura entra numa só ordenação: obstáculo na frente cobre o inimigo atrás, e vice-versa.
  const figures = bonkObstacleDrawables(c, physics, s.player, viewport, s.elapsedMs, art, nextArt, region.blend);
  for (const orb of s.orbs) {
    const ground = drawPoint(orb);
    const p = drawPoint(orb, 10 + Math.sin(animMs / 320 + orb.id) * 3);
    if (!p || !ground || p.scale < 0.05) continue;
    const color = orb.doubleXp ? '#62e6ff' : '#ffe066';
    figures.push({ depth: ground.depth, draw: () => {
      const shadow = bonkGroundEllipse(ground, 5);
      c.fillStyle = 'rgba(13, 23, 43, .22)';
      c.beginPath(); c.ellipse(ground.x, ground.y, shadow.rx, shadow.ry, 0, 0, Math.PI * 2); c.fill();
      c.save();
      c.globalAlpha = 0.92;
      c.fillStyle = color;
      c.shadowColor = color;
      c.shadowBlur = Math.min(16, 8 * p.scale);
      c.beginPath();
      c.arc(p.x, p.y, clamp(4 * p.scale, 1.4, 10), 0, Math.PI * 2);
      c.fill();
      c.restore();
    } });
  }
  for (const artifact of s.artifacts) {
    const ground = drawPoint(artifact);
    const p = drawPoint(artifact, 16 + Math.sin(animMs / 260 + artifact.id) * 4);
    if (!p || !ground) continue;
    const color = artifact.kind === 'shadow-ball' ? '#a66bff' : artifact.kind === 'pokeball' ? '#ff5b5b' : artifact.kind === 'speed' ? '#7bdcff' : artifact.kind === 'power' ? '#ffb35c' : artifact.kind === 'magnet' ? '#d68cff' : artifact.kind === 'focus' ? '#ffe071' : '#ff8fbb';
    figures.push({ depth: ground.depth, draw: () => {
      const ring = bonkGroundEllipse(ground, 14);
      c.save();
      c.strokeStyle = color;
      c.globalAlpha = 0.7;
      c.lineWidth = Math.max(1, ground.scale * 0.8);
      c.beginPath(); c.ellipse(ground.x, ground.y, ring.rx, ring.ry, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      c.fillStyle = color;
      c.shadowColor = color;
      c.shadowBlur = Math.min(18, 10 * p.scale);
      c.beginPath();
      c.arc(p.x, p.y, clamp(8 * p.scale, 3, 15), 0, Math.PI * 2);
      c.fill();
      c.restore();
    } });
  }
  for (const enemy of s.enemies) {
    if (enemy.hp <= 0) continue;
    const p = drawPoint(enemy);
    if (!p || p.scale < 0.08) continue;
    figures.push({ depth: p.depth, draw: () => drawBonkEnemy(enemy, p.x, p.y, clamp(p.scale * 0.8, 0.55, 3)) });
  }
  for (const support of s.supports) {
    const p = drawPoint(support);
    if (!p || p.scale < 0.08) continue;
    figures.push({ depth: p.depth, draw: () => drawBonkBillboard(supportSprites.get(support.dexId) ?? null, p.x, p.y, clamp(p.scale * 0.6, 0.18, 2), bonkFacing < 0, 0.82, null, 0, survivorSpriteDirection(s.player.x - support.x, s.player.y - support.y), supportAccessories.get(support.dexId)) });
  }
  const playerGround = drawPoint(s.player);
  const playerPoint = drawPoint(s.player, physics.z);
  if (playerPoint && playerGround) {
    const scale = clamp(playerPoint.scale * 0.92, 0.3, 3.2);
    // Quanto mais alto, menor e mais clara a sombra.
    const lift = clamp(physics.z / 220, 0, 0.6);
    const shadow = bonkGroundEllipse(playerGround, 17 * (1 - lift));
    const landing = physics.landingMs / BONK_LANDING_MS;
    const squash = landing > 0 ? 0.2 * landing : !physics.grounded && physics.verticalVelocity > 120 ? -0.08 : 0;
    figures.push({ depth: playerGround.depth - 0.01, draw: () => {
      // Anel na cor do golpe sob os pés: acha o próprio Pokémon no meio de uma onda.
      const ring = bonkGroundEllipse(playerGround, 22);
      c.save();
      c.strokeStyle = s.player.move.color;
      c.globalAlpha = 0.55;
      c.lineWidth = Math.max(1.5, playerGround.scale * 0.9);
      c.beginPath(); c.ellipse(playerGround.x, playerGround.y, ring.rx, ring.ry, 0, 0, Math.PI * 2); c.stroke();
      c.restore();
      const motion = effectiveVisual.value.impactFx && !reducedMotion ? combatMotion(animMs - playerAttackAt) : combatMotion(-1);
      // A pose acontece no billboard projetado: o avanço segue a frente da câmera e não altera posição, hitbox ou câmera.
      c.save();
      c.translate(playerPoint.x, playerPoint.y);
      c.scale(motion.scaleX, motion.scaleY);
      drawBonkBillboard(playerBackSprite ?? playerSprite, motion.lunge * 18 * scale, 0, scale, bonkFacing < 0,
        s.player.invulnMs > 0 && Math.floor(animMs / 80) % 2 === 0 ? 0.45 : 1,
        { x: playerGround.x - playerPoint.x, y: playerGround.y - playerPoint.y, rx: shadow.rx, ry: shadow.ry }, squash, 'down', playerAccessory);
      c.restore();
    } });
  }
  if (move.category === 'orbit') {
    // Cada orbital entra na ordenação: o que passa atrás do Pokémon some atrás dele, o da frente cobre.
    survivorOrbiters(s.player).forEach((orbiter, index) => {
      const p = drawPoint(orbiter, 12);
      if (p) figures.push({ depth: p.depth, draw: () => drawElementOrbiter(c, s.player, move.type, toScreen, index, animMs, detailed) });
    });
  }
  figures.sort((a, b) => b.depth - a.depth).forEach((figure) => figure.draw());

  for (const projectile of s.projectiles) {
    const head = toScreen(projectile.x, projectile.y, 18);
    const tail = toScreen(projectile.x - projectile.vx * 0.05, projectile.y - projectile.vy * 0.05, 18);
    if (!head || !tail) continue;
    const support = projectile.source === 'support';
    drawElementProjectile(c, projectile.move?.type ?? move.type, head, tail, clamp((projectile.size ?? 4) * head.s * 0.7, 1.5, 12), support ? 0.75 : 1, animMs, detailed && !support, projectile.id, projectile.look);
  }
  for (const projectile of s.hostileProjectiles) {
    const p = drawPoint(projectile, 16);
    if (!p) continue;
    c.fillStyle = projectile.effect === 'stun' ? '#e6b6ff' : projectile.effect === 'slow' ? '#7bdcff' : '#ff6c64';
    c.beginPath(); c.arc(p.x, p.y, clamp(projectile.size * p.scale * 0.65, 1.5, 10), 0, Math.PI * 2); c.fill();
  }
  for (const fx of s.fx) {
    if (drawElementFx(c, fx, toScreen, animMs, detailed)) continue;
    if (fx.kind !== 'blast' && fx.kind !== 'pulse') continue;
    const p = drawPoint(fx);
    if (!p) continue;
    const t = fx.ageMs / fx.lifeMs;
    const size = bonkGroundEllipse(p, fx.r * (0.6 + t * 0.4));
    c.save();
    c.globalAlpha = (1 - t) * 0.6;
    c.strokeStyle = fx.color;
    c.lineWidth = Math.max(1.5, p.scale * 2);
    c.beginPath(); c.ellipse(p.x, p.y, size.rx, size.ry, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  if (playerGround && s.special.activeMs > 0) {
    const ring = bonkGroundEllipse(playerGround, Math.max(20, s.player.attackRadius * 0.8));
    c.save();
    c.strokeStyle = s.player.move.color;
    c.globalAlpha = 0.5;
    c.lineWidth = Math.max(1.5, playerGround.scale * 1.1);
    c.setLineDash([6, 5]);
    c.beginPath(); c.ellipse(playerGround.x, playerGround.y, ring.rx, ring.ry, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  if (playerGround && physics.landingMs > 0) {
    // Poeira do pouso: um anel que abre e some.
    const t = 1 - physics.landingMs / BONK_LANDING_MS;
    const dust = bonkGroundEllipse(playerGround, 18 + t * 26);
    c.save();
    c.globalAlpha = (1 - t) * 0.7;
    c.strokeStyle = '#f4ead2';
    c.lineWidth = Math.max(1.5, playerGround.scale * 1.4 * (1 - t));
    c.beginPath(); c.ellipse(playerGround.x, playerGround.y, dust.rx, dust.ry, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  if (physics.collisionFlashMs > 0 && playerPoint) {
    c.save();
    c.globalAlpha = physics.collisionFlashMs / 130;
    c.strokeStyle = '#fff6bd';
    c.lineWidth = 2;
    c.beginPath(); c.arc(playerPoint.x, playerPoint.y - 18, 15, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
}

/** Carrega somente a região atual e a próxima; os 45 sprites não precisam ficar decodificados desde o menu inicial. */
async function preloadEnemyRegion(index: number): Promise<void> {
  const encounter = REGIONAL_ENCOUNTERS[index];
  if (!encounter || requestedEnemyRegions.has(index)) return;
  requestedEnemyRegions.add(index);
  const ids = [...new Set([...encounter.wild, encounter.boss])];
  await Promise.all(ids.map((id) => {
    if (enemySprites.has(id)) return Promise.resolve();
    const existing = enemySpriteLoads.get(id);
    if (existing) return existing;
    const load = loadSpriteOrNull(id).then((sprite) => {
      enemySprites.set(id, sprite);
      missingEnemySprites.value = REGIONAL_ENEMY_SPRITES.filter((candidate) => enemySprites.get(candidate) === null).length;
    }).catch(() => {
      enemySprites.set(id, null);
      missingEnemySprites.value = REGIONAL_ENEMY_SPRITES.filter((candidate) => enemySprites.get(candidate) === null).length;
    }).finally(() => enemySpriteLoads.delete(id));
    enemySpriteLoads.set(id, load);
    return load;
  }));
}

async function preloadShadowBoss(dexId: number): Promise<void> {
  const existing = enemySpriteLoads.get(dexId);
  if (existing) await existing;
  else if (!enemySprites.has(dexId)) {
    const load = loadSpriteOrNull(dexId).then((sprite) => { enemySprites.set(dexId, sprite); }).catch(() => { enemySprites.set(dexId, null); }).finally(() => enemySpriteLoads.delete(dexId));
    enemySpriteLoads.set(dexId, load);
    await load;
  }
  shadowBossSprite.value = firstSpriteFrame(enemySprites.get(dexId))?.toDataURL() ?? null;
}

function preloadVisibleEnemyRegions(elapsedMs: number, runSeed = 0): void {
  const { current, next } = survivorRegionAt(elapsedMs, runSeed);
  void preloadEnemyRegion(current);
  // Antecipar a próxima região evita uma forma neutra durante a transição sem bloquear a primeira tela.
  void preloadEnemyRegion(next);
}

function draw(): void {
  if (!ctx || !canvasEl.value || !state.value) return;
  // O motor escreve no objeto cru (ver `loop`); o proxy do Vue só custava leituras e escritas a mais no desenho.
  const s = toRaw(state.value);
  if (bonkRun.value && bonkPhysics.value) {
    drawBonkScene(s, bonkPhysics.value);
    return;
  }
  const VIEW_W = view.w;
  const VIEW_H = view.h;
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const presentation = trainerPresentation.value;
  const focusEnemies = presentation ? s.enemies.filter((enemy) => enemy.trainerId === presentation.trainerId && enemy.hp > 0) : [];
  const focus = focusEnemies.length
    ? focusEnemies.reduce((center, enemy) => ({ x: center.x + enemy.x, y: center.y + enemy.y }), { x: 0, y: 0 })
    : { x: s.player.x, y: s.player.y };
  const zoom = presentation ? 1.38 : 1;
  const targetX = focusEnemies.length ? focus.x / focusEnemies.length : focus.x;
  const targetY = focusEnemies.length ? focus.y / focusEnemies.length : focus.y;
  const worldViewW = VIEW_W / zoom;
  const worldViewH = VIEW_H / zoom;
  const camX = clamp(targetX - worldViewW / 2, 0, Math.max(0, ARENA_W - worldViewW));
  const camY = clamp(targetY - worldViewH / 2, 0, Math.max(0, ARENA_H - worldViewH));
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-(camX + worldViewW / 2), -(camY + worldViewH / 2));
  if (regionScenery.value) {
    // Flores e brilho da água só balançam com "Efeitos: completos" (e sem movimento reduzido nem modo Rotom).
    drawLandscape(ctx, s.elapsedMs, { x: camX - 2, y: camY - 2, w: worldViewW + 4, h: worldViewH + 4 }, { timeMs: animMs, animate: detailedSpecialEffects.value }, s.runSeed);
  } else if (groundPattern) {
    ctx.fillStyle = groundPattern;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  } else {
    ctx.fillStyle = '#4e9a62';
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, ARENA_W - 4, ARENA_H - 4);

  // Só o que cai na câmera (com folga para o desenho): fora da tela não há nada a pintar.
  const margin = 120;
  const left = camX - margin;
  const right = camX + worldViewW + margin;
  const top = camY - margin;
  const bottom = camY + worldViewH + margin;
  // Orbes comuns: um caminho e um preenchimento para todos (mesma cor, então a sobreposição não muda nada).
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  for (const orb of s.orbs) {
    if (orb.doubleXp || orb.x < left || orb.x > right || orb.y < top || orb.y > bottom) continue;
    ctx.moveTo(orb.x + 5, orb.y);
    ctx.arc(orb.x, orb.y, 5, 0, Math.PI * 2);
  }
  ctx.fill();
  // O diamante ciano distingue a recompensa rara sem animação contínua pesada.
  for (const orb of s.orbs) {
    if (!orb.doubleXp || orb.x < left || orb.x > right || orb.y < top || orb.y > bottom) continue;
    ctx.beginPath();
    ctx.fillStyle = '#62e6ff';
    ctx.strokeStyle = '#e8fcff';
    ctx.lineWidth = 1.5;
    ctx.moveTo(orb.x, orb.y - 7);
    ctx.lineTo(orb.x + 7, orb.y);
    ctx.lineTo(orb.x, orb.y + 7);
    ctx.lineTo(orb.x - 7, orb.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#ffe066';

  const move = s.player.move;
  const detailed = detailedSpecialEffects.value;
  // Vista de cima: a altura (z) de um efeito só o sobe na tela.
  const flat: WorldToScreen = (x, y, z = 0) => ({ x, y: y - z, s: 1 });
  // O alcance fica sempre marcado de leve: o anel da aura, o leque do cone e a trilha da órbita.
  if (move.category === 'aura') drawElementAuraField(ctx, s.player, move.type, flat, animMs, detailed);
  else if (move.category === 'cone') drawConeGuide(ctx, s.player, s.player.attackRange, move.type, flat, 1 - s.player.attackTimerMs / Math.max(1, s.player.attackCooldownMs));
  else if (move.category === 'orbit') drawOrbitPath(ctx, s.player, move.type, flat);
  else if (move.category === 'foco' || move.category === 'rapido') drawChargeAura(ctx, s);

  for (const e of s.enemies) {
    if (e.x >= left && e.x <= right && e.y >= top && e.y <= bottom) drawEnemy(e);
  }

  // Os apoios são puramente visuais: o motor mantém suas posições separadas e
  // todos os golpes continuam surgindo no jogador, sem hitbox própria.
  for (const support of s.supports) {
    ctx.save();
    ctx.globalAlpha = effectiveVisual.value.rotomMode ? 0.72 : 0.84;
    drawSprite(supportSprites.get(support.dexId) ?? null, support.x, support.y, s.player.facing < 0, 0.76, survivorSpriteDirection(s.player.x - support.x, s.player.y - support.y), supportAccessories.get(support.dexId));
    ctx.restore();
  }
  const blink = s.player.invulnMs > 0 && Math.floor(animMs / 80) % 2 === 0;
  // Orbitais acima do Pokémon na tela passam por trás dele; os de baixo, pela frente.
  const orbiters = move.category === 'orbit' ? survivorOrbiters(s.player) : [];
  orbiters.forEach((orbiter, index) => { if (orbiter.y < s.player.y) drawElementOrbiter(ctx!, s.player, move.type, flat, index, animMs, detailed); });
  if (!blink) {
    const motion = effectiveVisual.value.impactFx && !reducedMotion ? combatMotion(animMs - playerAttackAt) : combatMotion(-1);
    const aimAngle = s.player.aimAngle ?? (s.player.facing < 0 ? Math.PI : 0);
    const aimX = Math.cos(aimAngle);
    const aimY = Math.sin(aimAngle);
    ctx.save();
    ctx.translate(s.player.x, s.player.y);
    ctx.rotate(motion.rotation * s.player.facing);
    ctx.scale(motion.scaleX, motion.scaleY);
    drawSprite(playerSprite, motion.lunge * 18 * aimX, motion.lunge * 12 * aimY, s.player.facing < 0, 1, survivorSpriteDirectionFromAngle(aimAngle, s.player.facing), playerAccessory);
    ctx.restore();
  }
  orbiters.forEach((orbiter, index) => { if (orbiter.y >= s.player.y) drawElementOrbiter(ctx!, s.player, move.type, flat, index, animMs, detailed); });
  drawSurvivorSpecial(ctx, s, detailedSpecialEffects.value);

  for (const proj of s.projectiles) {
    if (proj.x < left || proj.x > right || proj.y < top || proj.y > bottom) continue;
    // O dano direto já cai com a distância; a apresentação acompanha a mesma curva
    // para o jogador perceber quando um disparo está fora do alcance ideal.
    const distanceOpacity = survivorProjectileOpacity(Math.hypot(proj.x - s.player.x, proj.y - s.player.y));
    const type = proj.move?.type ?? move.type;
    const support = proj.source === 'support';
    drawElementProjectile(ctx, type, { x: proj.x, y: proj.y, s: 1 }, { x: proj.x - proj.vx * 0.05, y: proj.y - proj.vy * 0.05, s: 1 },
      (proj.size ?? 4) * (support ? 0.85 : 1), (support ? 0.72 : 1) * distanceOpacity, animMs, detailed && !support, proj.id, proj.look);
  }

  for (const proj of s.hostileProjectiles) {
    ctx.save();
    const tint = proj.effect === 'burn' ? '#ff7b42' : proj.effect === 'slow' ? '#7bdcff' : proj.effect === 'stun' ? '#e6b6ff' : '#ff5b5b';
    ctx.globalAlpha = proj.grade === 'chefao' ? 0.5 : 0.35;
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.size * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = proj.effect ? tint : '#fff0a8';
    ctx.beginPath();
    ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
    ctx.fill();
    if (proj.effect && !effectiveVisual.value.rotomMode) {
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = tint;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, proj.size * (2.8 + Math.sin(animMs / 120) * 0.25), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  for (const artifact of s.artifacts) {
    // A Pokébola é uma recompensa importante e continua visível no Modo Rotom; os artefatos temporários podem ser ocultados para economizar GPU.
    if (effectiveVisual.value.rotomMode && artifact.kind !== 'pokeball' && artifact.kind !== 'shadow-ball') continue;
    const ball = artifact.kind === 'pokeball' || artifact.kind === 'shadow-ball';
    const shadowBall = artifact.kind === 'shadow-ball';
    const color = shadowBall ? '#a66bff' : artifact.kind === 'pokeball' ? '#ff5b5b' : artifact.kind === 'speed' ? '#7bdcff' : artifact.kind === 'power' ? '#ffb35c' : artifact.kind === 'magnet' ? '#d68cff' : artifact.kind === 'focus' ? '#ffe071' : '#ff8fbb';
    const icon = ball ? '★' : artifact.kind === 'speed' ? '⚡' : artifact.kind === 'power' ? '✦' : artifact.kind === 'magnet' ? '🧲' : artifact.kind === 'focus' ? '◈' : '♥';
    const pulse = 1 + (effectiveVisual.value.rotomMode ? 0 : Math.sin(animMs / 180 + artifact.id) * 0.12);
    const wobble = ball && !effectiveVisual.value.rotomMode
      ? Math.sin(animMs / 220 + artifact.id) * 0.12
      : 0;
    ctx.save();
    ctx.translate(artifact.x, artifact.y);
    ctx.rotate(wobble);
    ctx.globalAlpha = ball ? 0.38 : 0.28;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = effectiveVisual.value.rotomMode ? 0 : 16;
    ctx.beginPath();
    ctx.arc(0, 0, (ball ? 20 : 15) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (ball) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f5f5f5';
      ctx.beginPath();
      ctx.arc(0, 0, 13 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 13 * pulse, Math.PI, 0);
      ctx.clip();
      ctx.fillStyle = shadowBall ? '#4c2069' : '#ef4b57';
      ctx.fillRect(-15, -15, 30, 15);
      ctx.restore();
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13 * pulse, 0); ctx.lineTo(13 * pulse, 0); ctx.stroke();
      ctx.fillStyle = '#fff8df';
      ctx.beginPath(); ctx.arc(0, 0, 4 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1d2433';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!ball) ctx.fillText(icon, 0, 0);
    ctx.restore();
  }

  // Golpes com a arte do elemento (aura, área, cone, toques da órbita) e, no fim, as marcas genéricas.
  // No Modo Rotom só o leque do cone continua (é ele que mostra para onde o golpe saiu), em versão leve.
  for (const f of s.fx) {
    if (effectiveVisual.value.rotomMode && f.kind !== 'cone') continue;
    if (drawElementFx(ctx, f, flat, animMs, detailed)) continue;
    if (effectiveVisual.value.rotomMode) continue;
    const t = clamp(f.ageMs / f.lifeMs, 0, 1);
    ctx.save();
    if (f.kind === 'pulse') {
      ctx.globalAlpha = 0.55 * (1 - t);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 8, f.r * (0.55 + 0.45 * t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'blast') {
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (f.kind === 'echo') {
      ctx.globalAlpha = 0.35 * (1 - t);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * (0.55 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'follow-up') {
      // O eco secundário entra alguns milissegundos depois do golpe principal e viaja
      // do jogador até o alvo, deixando claro que insetos/fantasmas estão acompanhando o ataque.
      const delay = f.delayMs ?? 85;
      const travel = clamp((f.ageMs - delay) / Math.max(1, f.lifeMs - delay), 0, 1);
      if (f.ageMs >= delay) {
        const fromX = f.fromX ?? f.x;
        const fromY = f.fromY ?? f.y;
        const toX = f.toX ?? f.x;
        const toY = f.toY ?? f.y;
        const count = f.count ?? 3;
        const spread = f.element === 'bug' ? 8 : 12;
        ctx.globalAlpha = (f.element === 'bug' ? 0.82 : 0.68) * (1 - travel * 0.35);
        for (let i = 0; i < count; i++) {
          const phase = (i - (count - 1) / 2) / Math.max(1, count - 1);
          const x = fromX + (toX - fromX) * travel - (toY - fromY) * phase * 0.08;
          const y = fromY + (toY - fromY) * travel + (toX - fromX) * phase * 0.08;
          ctx.save();
          ctx.translate(x, y);
          if (f.element === 'bug') {
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.ellipse(-spread * 0.42, 0, spread * 0.42, spread * 0.24, -0.35, 0, Math.PI * 2);
            ctx.ellipse(spread * 0.42, 0, spread * 0.42, spread * 0.24, 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff4a8';
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(2, f.r * 0.32), 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = f.color;
            ctx.beginPath();
            ctx.arc(0, -spread * 0.2, Math.max(3, f.r * 0.45), Math.PI, 0);
            ctx.lineTo(spread * 0.48, spread * 0.55);
            ctx.lineTo(0, spread * 0.3);
            ctx.lineTo(-spread * 0.48, spread * 0.55);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha *= 0.8;
            ctx.strokeStyle = '#eadbff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, -spread * 0.2, Math.max(3, f.r * 0.45), Math.PI, 0);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    } else if (f.kind === 'beam') {
      // Feixe do Foco: entra rápido e se apaga; o nível (count) engrossa o brilho branco do miolo.
      const fromX = f.fromX ?? f.x;
      const fromY = (f.fromY ?? f.y) - 8;
      const toX = f.toX ?? f.x;
      const toY = (f.toY ?? f.y) - 8;
      const grow = Math.min(1, t * 6);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5 * (1 - t);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = f.r * 2 * (0.55 + 0.45 * grow);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * (1 - t);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, f.r * (0.25 + 0.15 * (f.count ?? 1)) * (1 - t));
      ctx.stroke();
    } else if (f.kind === 'rush') {
      // Teleporte do Rápido: um risco de onde saiu até onde chegou e um anel no impacto.
      ctx.globalAlpha = 0.7 * (1 - t);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(f.fromX ?? f.x, (f.fromY ?? f.y) - 8);
      ctx.lineTo(f.toX ?? f.x, (f.toY ?? f.y) - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(f.x, f.y - 8, f.r * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'heal') {
      // Pulso rosa e coração subindo indicam explicitamente que um suporte recuperou este alvo.
      const rise = t * 24;
      ctx.globalAlpha = 0.9 * (1 - t);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 10 - rise * 0.35, f.r * (0.45 + t * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1 - t;
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = f.color;
      ctx.fillText('+♥', f.x, f.y - 16 - rise);
    } else if (f.kind === 'artifact') {
      const color = f.color;
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 8, f.r * (0.45 + t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1 - t;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.fillText(f.artifact === 'pokeball' || f.artifact === 'shadow-ball' ? '★' : f.artifact === 'speed' ? '⚡' : f.artifact === 'power' ? '✦' : f.artifact === 'magnet' ? '🧲' : f.artifact === 'focus' ? '◈' : '♥', f.x, f.y - 8 - t * 24);
    } else {
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.7 * (1 - t);
        ctx.strokeStyle = k === 1 ? '#ffe066' : '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.player.x, s.player.y - 12, f.r * (0.2 + t) * (1 + k * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Anel em volta do Pokémon: o Foco fecha o anel enquanto carrega; o Rápido pisca durante os teleportes. */
function drawChargeAura(c: CanvasRenderingContext2D, s: SurvivorState): void {
  const p = s.player;
  const charge = s.charge;
  c.save();
  c.strokeStyle = p.move.color;
  if (p.move.category === 'foco' && charge.holding && charge.level > 0) {
    c.globalAlpha = 0.35 + 0.45 * charge.level;
    c.lineWidth = 2 + 3 * charge.level;
    c.beginPath();
    c.arc(p.x, p.y - 8, 36 - 14 * charge.level + Math.sin(animMs / 90) * 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge.level);
    c.stroke();
  } else if (p.move.category === 'rapido' && charge.rushMs > 0) {
    c.globalAlpha = 0.45 + 0.3 * Math.sin(animMs / 60);
    c.lineWidth = 3;
    c.setLineDash([5, 5]);
    c.beginPath();
    c.arc(p.x, p.y - 8, 26, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

/** Espécies de inimigos já registradas na Pokédex nesta corrida (cada espécie conta uma vez por corrida). */
const runSeenDex = new Set<number>();
let lastDexScanMs = 0;
function scanEnemySightings(s: SurvivorState): void {
  if (animMs - lastDexScanMs < 600) return;
  lastDexScanMs = animMs;
  const fresh: number[] = [];
  for (const enemy of s.enemies) {
    if (enemy.dexId !== undefined && !runSeenDex.has(enemy.dexId)) {
      runSeenDex.add(enemy.dexId);
      fresh.push(enemy.dexId);
    }
  }
  if (fresh.length > 0) recordSightings(fresh, 'torre');
}

function updateMinimap(s: SurvivorState): void {
  // O minimapa é uma fotografia leve, atualizada algumas vezes por segundo; a arena continua no canvas a cada frame.
  if (animMs - lastMinimapMs < 120) return;
  lastMinimapMs = animMs;
  minimap.value = survivorMinimapSnapshot(s, { width: ARENA_W, height: ARENA_H }, { width: view.w, height: view.h });
  objectives.value = survivorObjectives(s);
}

function visibleEnemyCountForDanger(s: SurvivorState): number {
  const worldViewW = view.w;
  const worldViewH = view.h;
  const camX = clamp(s.player.x - worldViewW / 2, 0, Math.max(0, ARENA_W - worldViewW));
  const camY = clamp(s.player.y - worldViewH / 2, 0, Math.max(0, ARENA_H - worldViewH));
  return s.enemies.filter((enemy) => enemy.hp > 0 && enemy.x >= camX && enemy.x <= camX + worldViewW && enemy.y >= camY && enemy.y <= camY + worldViewH).length;
}

function loop(ts: number): void {
  if (disposed) {
    rafId = 0;
    return;
  }
  rafId = requestGameFrame(loop, maxVisualFps);
  const fps = effectiveVisual.value.frameRate === 'auto' ? 0 : Number(effectiveVisual.value.frameRate);
  if (!isFrameDue(ts, lastTs, fps)) return;
  if (ts - lastMusicSync > 100) { lastMusicSync = ts; syncMusic(); }
  // O carimbo do quadro pode vir antes de um `lastTs` marcado com performance.now() (ao retomar): sem tempo negativo,
  // que faria o pouso do BONK "desandar" e o anel de poeira ganhar raio negativo.
  const dt = Math.min(60, Math.max(1, ts - lastTs || 16));
  lastTs = ts;
  if (document.hidden || !state.value) return;
  if (paused.value) {
    if (trainerPresentation.value) animMs += dt;
    draw();
    return;
  }
  animMs += dt;
  // A corrida inteira muda o objeto a cada quadro: o motor trabalha no objeto cru (sem um proxy do Vue por campo e
  // por inimigo) e o `triggerRef` abaixo avisa a interface uma vez por quadro. As outras telas do componente continuam
  // reativas, porque as mudanças fora do laço passam pelo proxy como antes.
  const s = toRaw(state.value!);
  preloadVisibleEnemyRegions(s.elapsedMs, s.runSeed);
  if (!s.over && !s.pendingUpgrade && !evolving.value) {
    const attackTimerBefore = s.player.attackTimerMs;
    const projectilesBefore = s.projectiles.length;
    const hpBefore = s.player.hp;
    const xpBefore = s.player.xp;
    const killsBefore = s.kills;
    const kx = (heldKeys.has('right') ? 1 : 0) - (heldKeys.has('left') ? 1 : 0);
    const ky = (heldKeys.has('down') ? 1 : 0) - (heldKeys.has('up') ? 1 : 0);
    const dx = kx + (joystick.active ? joystick.dx : 0);
    const dy = ky + (joystick.active ? joystick.dy : 0);
    const beforeBonkPosition = bonkRun.value ? { x: s.player.x, y: s.player.y } : null;
    const beforeLandscapePosition = !bonkRun.value && regionScenery.value ? { x: s.player.x, y: s.player.y } : null;
    const previousSpecialPhase = s.special.phase;
    // No BONK, frente/trás move; os lados deslocam lateralmente e giram a câmera.
    const move = bonkRun.value && bonkPhysics.value ? bonkInputToWorld(bonkPhysics.value, dx, dy) : { dx, dy };
    if (bonkRun.value && Math.abs(dx) > 0.15) bonkFacing = dx < 0 ? -1 : 1;
    // O Ritmo acelerado comprime a partida, mas não a animação: somente o relógio e o motor avançam 2×.
    const simulationDt = s.fast ? dt * FAST_TIME_SCALE : dt;
    const events = stepSurvivor(s, { dx: move.dx, dy: move.dy, special: specialQueued, charge: chargeHeld.value, visibleEnemies: visibleEnemyCountForDanger(s), ...(bonkRun.value && bonkPhysics.value ? { aimAngle: bonkPhysics.value.cameraYaw } : {}) }, simulationDt);
    if (s.player.attackTimerMs > attackTimerBefore) {
      playerAttackAt = animMs;
      playAttackSound(s.player.move, ts);
    }
    specialQueued = false;
    if (bonkRun.value && bonkPhysics.value && beforeBonkPosition) {
      stepBonkPhysics(bonkPhysics.value, s.player, beforeBonkPosition, { dx, dy, jump: bonkJumpQueued }, simulationDt);
      // Inimigos também respeitam rochas e paredes; a altura do jogador não deve abrir a parede para eles.
      const groundPhysics = { ...bonkPhysics.value, z: 0 };
      for (const enemy of s.enemies) {
        if (enemy.hp <= 0) continue;
        const resolved = resolveBonkPosition(groundPhysics, enemy.x, enemy.y, enemy.radius);
        enemy.x = resolved.x;
        enemy.y = resolved.y;
      }
      triggerRef(bonkPhysics);
    }
    if (beforeLandscapePosition) {
      const resolved = resolveSurvivorLandscapeMove(
        landscapeCollisionPlan(s.elapsedMs, s.runSeed),
        beforeLandscapePosition,
        s.player,
        PLAYER_RADIUS,
      );
      s.player.x = resolved.x;
      s.player.y = resolved.y;
    }
    bonkJumpQueued = false;
    const region = survivorRegionLabel(s.elapsedMs, s.runSeed);
    if (region !== announcedRegion) {
      announcedRegion = region;
      if (s.elapsedMs > 0) say(`Região: ${region}`, 2200);
    }
    if (previousSpecialPhase === 'locked' && s.special.phase === 'arrival') {
      heldKeys.clear(); joyUp(); playSound('survivor-level');
    }
    if (s.projectiles.length > projectilesBefore) playSound('survivor-shot');
    if (s.kills > killsBefore) playSound('survivor-hit');
    if (s.player.xp > xpBefore) playSound('survivor-pickup');
    if (s.player.hp < hpBefore) {
      playSound('survivor-hurt');
      showDamageFeedback();
    }
    for (const ev of events) {
      if (ev.type === 'levelup') playSound('survivor-level');
      else if (ev.type === 'bossSpawn') playSound('survivor-boss');
      else if (ev.type === 'milestone') {
        playSound('success');
        say(ev.id === 'ten-minutes'
          ? '🎁 Marco de 10 minutos! Love Candy assegurado — conclua a corrida para guardar.'
          : ev.id === 'fifteen-minutes'
            ? '💠 Marco de 15 minutos! Pedra da Confiança assegurada — conclua a corrida para guardar.'
            : '💎 Marco de 20 minutos! Fragmento de Megapedra assegurado — conclua a corrida para guardar.', 6000);
      }
      else if (ev.type === 'shadowBallSpawn') {
        void preloadShadowBoss(ev.dexId);
        playSound('survivor-boss');
        say(`◉ Pokébola Sombria detectada: ${ev.name} foi sorteado. Encontre-a para abrir o desafio.`, 6500);
      }
      else if (ev.type === 'shadowBossArrival') {
        playSound('survivor-boss');
        say(`CHAMAS SOMBRIAS · ${ev.name} entrou na arena!`, 5000);
      }
      else if (ev.type === 'shadowBossDefeated') {
        playSound('success');
        say(`💠 Pedra da Confiança assegurada (${ev.trustStones}/5). Conclua a corrida para guardá-la.`, 6500);
      }
      else if (ev.type === 'chargeRelease') {
        playSound(ev.style === 'rapido' ? 'survivor-level' : 'survivor-shot');
        if (ev.style === 'rapido') say(`» Teleportes por ${Math.round(s.charge.rushTotalMs / 1000)} s!`, 2200);
        else if (ev.level >= 1) say(`◎ ${ev.name}!`, 1800);
      }
      else if (ev.type === 'artifactCollected') {
        playSound('survivor-pickup');
        showArtifactNotice(ev.kind);
      }
      else if (ev.type === 'typeAffinityOffer') {
        paused.value = true;
        typeAffinityOffer.value = ev.types;
        say('O primeiro líder caiu. Escolha a afinidade do segundo tipo.', 4200);
      }
      if (ev.type === 'gameover') {
        playSound('survivor-gameover');
        objectives.value = survivorObjectives(s);
        summary.value = ev.summary;
        settleRunLoadout(ev.summary.survivedMs);
        recordRun(ev.summary);
      }
      else if (ev.type === 'trainerSpawn') {
        say(ev.trigger === 'digital-danger' ? 'Você está atraindo treinadores!' : ev.final ? 'CHEFAO FINAL! 6 Pokemon!' : 'Um treinador! 3 Pokemon mais fortes.');
        showTrainerPresentation(ev);
      }
      else if (ev.type === 'trainerDown') say(ev.final ? 'CHEFAO DERROTADO!' : 'Treinador derrotado!');
    }
  }
  scanEnemySightings(s);
  updateMinimap(s);
  pendingUpgrade.value = s.pendingUpgrade;
  if (lunchWasActive && s.player.lunch && !s.player.lunch.active) {
    lunchWasActive = false;
    say('🍱 A marmita acabou: o efeito terminou.', 3200);
  }
  // A Mega não tem tempo: só a evolução a desfaz (a forma Mega é da espécie de antes). O sprite novo chega por `evolveTo`.
  if (megaWasActive && !s.player.mega?.active) {
    megaWasActive = false;
    playerSprite = normalPlayerSprite;
    playerBackSprite = normalPlayerBackSprite;
    say('💎 A evolução desfez a Mega.', 3600);
  }
  triggerRef(state);
  draw();
}

function chooseUpgrade(id: string): void {
  if (!state.value || upgradeMenuLocked.value) return;
  if (banMode.value) { banUpgradeCard(id); return; }
  const tierBefore = survivorProjectileTier(state.value.player);
  const events = applyUpgrade(state.value, id);
  playSound('success');
  const tierAfter = survivorProjectileTier(state.value.player);
  if (state.value.player.move.category === 'projetil' && tierAfter > tierBefore) {
    say(`✦ Seus projéteis evoluíram: ${PROJECTILE_TIER_NAMES[tierAfter]} (nível ${tierAfter}/4)!`, 3200);
  }
  pendingUpgrade.value = null;
  for (const ev of events) {
    if (ev.type === 'evolve') void evolveTo(ev.dexId, ev.name);
    if (ev.type === 'supportEvolve') {
      void loadSpriteOrNull(ev.dexId).then((sprite) => {
        if (!disposed) supportSprites.set(ev.dexId, sprite);
      });
      say(`${ev.name} evoluiu e fortaleceu o seu apoio!`, 2600);
    }
  }
}

/** Modo banir: o próximo toque numa carta a bane em vez de escolhê-la. */
const banMode = ref(false);
const bansLeft = computed(() => state.value?.bansLeft ?? 0);
const banAvailable = computed(() => bansLeft.value > 0 || (state.value?.bannedUpgradeIds?.length ?? 0) > 0);
function banBlock(id: string): string | null {
  return state.value ? survivorBanBlockReason(state.value, id) : 'Corrida indisponível.';
}
function toggleBanMode(): void {
  if (upgradeMenuLocked.value || bansLeft.value <= 0) return;
  banMode.value = !banMode.value;
}
function banUpgradeCard(id: string): void {
  if (!state.value || upgradeMenuLocked.value) return;
  const reason = survivorBanBlockReason(state.value, id);
  if (reason) { say(reason, 2600); return; }
  if (!banSurvivorUpgrade(state.value, id)) { say('Não há outra carta para ocupar a vaga: banimento cancelado.', 3000); return; }
  pendingUpgrade.value = state.value.pendingUpgrade;
  banMode.value = false;
  triggerRef(state);
  playSound('survivor-pickup');
  say(`🚫 Carta banida até o fim da corrida. Restam ${state.value.bansLeft ?? 0}.`, 2600);
}
watch(pendingUpgrade, () => { banMode.value = false; });

function rerollUpgradeSelection(): void {
  if (upgradeMenuLocked.value || !state.value || !rerollSurvivorUpgradeOffer(state.value)) return;
  pendingUpgrade.value = state.value.pendingUpgrade;
  playSound('survivor-pickup');
  say('⭐ Desejo de Jirachi: oferta renovada!', 2200);
}

function togglePause(): void {
  if (!state.value || state.value.over || summary.value || pendingUpgrade.value || evolving.value || trainerPresentation.value) return;
  paused.value = !paused.value;
  if (!paused.value) helpOpen.value = false;
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = 0;
  lastTs = performance.now();
  say(paused.value ? 'Jogo pausado.' : 'Jogo retomado.', 1600);
}

/** Troca o sprite pela nova forma; o jogo espera (com o brilho) até carregar. Sem sprite, a forma neutra no lugar. */
async function evolveTo(dexId: number, name: string): Promise<void> {
  evolving.value = `${avatarName.value} evoluiu para ${name}!`;
  const [sprite, back] = await Promise.all([loadSpriteOrNull(dexId), bonkRun.value ? loadBackSpriteOrNull(dexId) : Promise.resolve(null), new Promise((r) => setTimeout(r, 900))]);
  if (disposed) return;
  normalPlayerSprite = sprite;
  normalPlayerBackSprite = back;
  playerSprite = sprite;
  playerBackSprite = back;
  avatarName.value = name;
  evolving.value = null;
  lastTs = performance.now();
}

function leaveNow(): void {
  emit('leave');
}

function requestLeave(): void {
  if (leaveConfirm.value) return;
  // Na escolha de Pokémon (ou depois do resultado) não há uma corrida a abandonar.
  // Volta imediatamente para a Vila, sem apresentar um aviso que sugira perda de progresso.
  if (!ready.value || !state.value || summary.value) {
    leaveNow();
    return;
  }
  heldKeys.clear(); joyUp(); specialQueued = false; chargeHeld.value = false;
  clearTrainerPresentation();
  wasPausedBeforeLeave = paused.value;
  paused.value = true;
  leaveConfirm.value = true;
}

function cancelLeave(): void {
  leaveConfirm.value = false;
  paused.value = wasPausedBeforeLeave;
}

function confirmLeave(): void {
  leaveConfirm.value = false;
  if (state.value && !state.value.over) settleRunLoadout(state.value.elapsedMs);
  emit('leave');
}

/** O caminho de Voltar fica dentro da Torre; sair exige a ação explícita de saída. */
function requestBack(): void {
  if (leaveConfirm.value) { cancelLeave(); return; }
  if (typeChoice.value) { typeChoice.value = null; return; }
  if (helpOpen.value) { helpOpen.value = false; return; }
  if (hudExpanded.value) { hudExpanded.value = false; return; }
  if (paused.value) { togglePause(); return; }
  if (summary.value) { playAgain(); return; }
  // Escolhas que alteram a corrida não podem ser descartadas pelo botão Voltar.
  if (pickOptions.value || noCompanion.value || pendingUpgrade.value || typeAffinityOffer.value || shadowCutsceneOpen.value || specialModalOpen.value) return;
  // Durante a corrida, Voltar abre a pausa; outro Voltar retoma.
  if (ready.value && state.value) togglePause();
}

defineExpose({ requestBack, requestLeave });

/** Sorteia até 6 companheiros da caixa, identificados por carta/instância, pra escolher quem joga desta vez.
 * Caixa vazia (nenhuma carta ainda) não trava nada: cai pro Pikachu de reserva sem tela de escolha, como antes. */
function readFavorites(ids: readonly string[]): Set<string> {
  try {
    return normalizeSurvivorFavorites(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? 'null'), new Set(ids));
  } catch {
    return new Set();
  }
}

function writeFavorites(): void {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds.value])); } catch { /* armazenamento indisponível */ }
}

function toggleFavorite(id: string): void {
  const next = new Set(favoriteIds.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  favoriteIds.value = next;
  writeFavorites();
  if (pickOptions.value) pickOptions.value = pickOptions.value.map((option) => ({ ...option }));
}

async function rollPickOptions(previousIds: readonly string[] = []): Promise<PickOption[]> {
  const cache = await getCache();
  const cards = await cache.list();
  const pool: (CardCompanion & { origin: string })[] = [];
  for (const c of cards) {
    const mon = cardCompanion(c);
    if (mon) pool.push({ ...mon, accessory: props.accessories?.[c.id] ?? null, digital: false, origin: `${c.setName} ${c.localId}` });
  }
  // Digital Pokémon entram no mesmo sorteio (Fase 6): não vêm de carta nenhuma, mas jogam igual a qualquer outro.
  for (const [i, d] of (props.digital ?? []).entries()) pool.push({ id: d.instanceId ?? `dp_torre_${i}`, dexId: d.dexId, name: d.name, shiny: d.shiny, accessory: d.accessory, digital: true, origin: 'Digital Pokémon' });
  if (pool.length === 0) return [];
  const ids = pool.map((item) => item.id);
  favoriteIds.value = readFavorites(ids);
  const chosen = selectSurvivorCandidates(pool, seededRng((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0), favoriteIds.value, 6, previousIds);
  const thumbs = await Promise.all(
    chosen.map(({ dexId, shiny }) =>
      getLocalVillageSprite(dexId, shiny === true, 'Idle')
        .then((g) => (g ? toSprite(g).frames[0]?.toDataURL() ?? null : null))
        .catch(() => null)
        // Fora do pacote local: o sprite público da espécie (o mesmo que a Torre baixa para jogar).
        .then((url) => url ?? pokemonSpriteUrl(dexId)),
    ),
  );
  return chosen.map(({ id, dexId, name, origin, shiny, accessory }, i) => {
    const { move, profile, types } = survivorAttackOf(dexId);
    return { id, dexId, name, origin, types, move, bars: profileBars(move, profile), thumb: thumbs[i] ?? null, shiny, accessory, digital: chosen[i]?.digital === true };
  });
}

async function beginRun(dexId: number, name: string, picked?: PokemonType, infinite = false, bonk = false, companion: CardCompanion | null = null, preparation: SurvivorPreparationId = 'classica', supportCandidates: readonly SurvivorSupportCandidate[] = [], typeAffinityChoices: readonly PokemonType[] = [], fast = false, shiny = false, accessory: string | null = null, mega: SurvivorMegaForm | null = null): Promise<void> {
  runCompanion = companion;
  pickBusy.value = true;
  try {
    avatarName.value = name;
    evolving.value = null;
    const runSeed = Math.floor(Math.random() * 2 ** 31);
    await Promise.all([loadSpriteSpecies(), loadLandscapeAtlas()]);
    enemySprites.clear();
    enemySpriteLoads.clear();
    requestedEnemyRegions.clear();
    // Sprite da forma Mega (GIF animado ou imagem parada); sem nenhum, a forma normal continua no desenho.
    const megaSpriteLoad = mega && mega.sprite !== 'nenhum' ? loadSpriteOrNull(mega.formId, shiny).catch(() => null) : Promise.resolve(null);
    const [player, back, megaSprite, ...supports] = await Promise.all([
      loadSpriteOrNull(dexId, shiny, runParticipant?.id.startsWith('dp_') === true && visual.metallic),
      bonk ? loadBackSpriteOrNull(dexId, shiny, runParticipant?.id.startsWith('dp_') === true && visual.metallic) : Promise.resolve(null),
      megaSpriteLoad,
      ...supportCandidates.map((candidate) => loadSpriteOrNull(candidate.dexId, candidate.shiny === true, candidate.digital === true && visual.metallic)),
      preloadEnemyRegion(survivorRegionAt(0, runSeed).current),
    ]);
    normalPlayerSprite = player;
    normalPlayerBackSprite = back as Sprite | null;
    playerSprite = normalPlayerSprite;
    playerBackSprite = normalPlayerBackSprite;
    supportSprites.clear();
    supportAccessories.clear();
    supportCandidates.forEach((candidate, index) => {
      supportSprites.set(candidate.dexId, (supports[index] as SpriteAsset | null | undefined) ?? null);
      supportAccessories.set(candidate.dexId, candidate.accessory);
    });
    playerAccessory = accessory;
    missingEnemySprites.value = REGIONAL_ENEMY_SPRITES.filter((id) => enemySprites.get(id) === null).length;

    if (disposed) return;
    if (!groundPattern) {
      const groundImg = new Image();
      groundImg.src = assetUrl('tilesets/survivor-grass.png');
      await new Promise<void>((resolve) => {
        groundImg.onload = () => resolve();
        groundImg.onerror = () => resolve();
      });
      if (ctx && groundImg.naturalWidth > 0) {
        groundPattern = ctx.createPattern(groundImg, 'repeat');
        groundImage = groundImg;
      }
    }
    if (disposed) return;
    pickOptions.value = null;
    summary.value = null;
    resetFeedback();
    runUnlocks.value = [];
    pendingUpgrade.value = null;
    clearTrainerPresentation();
    paused.value = false;
    const { move, profile, secondMove } = survivorAttackOf(dexId, picked);
    runSeenDex.clear();
    // A Vila entrega o loadout (e gasta a sorte do Carteiro) antes de a corrida existir; vale no Survival e no BONK.
    runLoadout = takeRunLoadout(pureWanted.value);
    runLoadoutSettled = false;
    lunchWasActive = runLoadout.lunch !== null;
    banMode.value = false;
    activeRunId = `${Date.now().toString(36)}-${(++runCounter).toString(36)}-${Math.floor(Math.random() * 0x1_0000_0000).toString(36)}`;
    // A Mega só entra se o fragmento saiu mesmo da mochila; ele volta se a corrida for abandonada logo no começo.
    runMegaShardTaken = mega !== null && !pureWanted.value && takeRunMegaShard();
    const runMega = runMegaShardTaken ? mega : null;
    state.value = createSurvivorState(runSeed, { kindCount: REGIONAL_KIND_COUNT, enemyDexId: regionalEnemyDexId, move, profile, secondMove, supportCandidates, dexId, evolutions: evolutionsFor, infinite, bonk, preparation, typeAffinityChoices, fast, loadout: runLoadout, ...(runMega ? { mega: runMega } : {}) });
    megaWasActive = state.value.player.mega?.active === true;
    if (megaWasActive && megaSprite) {
      playerSprite = megaSprite as SpriteAsset;
      // Não há pose de costas da forma Mega: no BONK a Mega aparece de frente em vez da costas da forma normal.
      playerBackSprite = null;
    }
    refreshMegaShards();
    const perks = runLoadout.summary.filter((line) => line.startsWith('Sorte') || line.startsWith('Marmita'));
    if (megaWasActive && runMega) perks.unshift(`💎 ${runMega.label} até o fim da corrida${megaSprite ? '' : ' (sem sprite da forma)'}`);
    else if (mega) say('💎 Sem Fragmento de Megapedra na mochila: a corrida começou na forma normal.', 4200);
    if (perks.length > 0) say(`🍀 ${perks.join(' · ')}`, 4200);
    bonkRun.value = bonk;
    bonkPhysics.value = bonk ? createBonkPhysics(Math.PI / 2, state.value.runSeed) : null;
    // Cada corrida BONK usa a própria seed para trocar tiles, árvores e posição dos obstáculos.
    // Sem atlas/grama, a função ainda devolve o fallback desenhado por código — sem fingir um asset ausente.
    bonkLandscapeSeed = state.value.runSeed;
    bonkArtByRegion.clear();
    if (bonk) bonkArtForRegion(0);
    if (ctx) ctx.imageSmoothingEnabled = false;
    announcedRegion = survivorRegionLabel(0, state.value.runSeed);
    guardianSprite.value = null;
    shadowBossSprite.value = null;
    specialQueued = false;
    chargeHeld.value = false;
    bonkJumpQueued = false;
    clearBonkTap();
    const runState = state.value;
    void loadSpriteOrNull(SPECIAL_GUARDIANS[move.type].dexId).then((sprite) => {
      if (!disposed && state.value === runState) guardianSprite.value = firstSpriteFrame(sprite)?.toDataURL() ?? null;
    });
    ready.value = true;
    lastTs = performance.now();
    if (!rafId) rafId = requestGameFrame(loop, maxVisualFps);
  } catch {
    failed.value = true;
  } finally {
    pickBusy.value = false;
  }
}

function choosePlayer(opt: PickOption, picked?: PokemonType): void {
  unlockSound();
  runParticipant = { id: opt.id, name: opt.name };
  runParticipantDexId = opt.dexId;
  const supportCandidates = (pickOptions.value ?? [])
    .filter((candidate) => candidate.id !== opt.id)
    .slice(0, 5)
    .map((support) => ({
      dexId: support.dexId,
      name: support.name,
      move: support.move,
      profile: attackProfile(support.move, statsOfDex(support.dexId)),
      shiny: support.shiny,
      accessory: support.accessory,
      digital: support.digital,
    } satisfies SurvivorSupportCandidate));
  const primary = picked ?? opt.types[0] ?? opt.move.type;
  const typeAffinityChoices = opt.types.filter((type) => type !== primary);
  const infinite = infiniteWanted.value && torre.value.infiniteUnlocked;
  const mega = megaPick.value?.optId === opt.id && !pureWanted.value ? survivorMegaForm(megaPick.value.formId) : null;
  megaPick.value = null;
  void beginRun(opt.dexId, opt.name, picked, infinite, bonkWanted.value, opt.id.startsWith('dp_') ? null : { id: opt.id, dexId: opt.dexId, name: opt.name, shiny: opt.shiny === true, accessory: opt.accessory }, selectedPreparation.value, supportCandidates, typeAffinityChoices, fastWanted.value && torre.value.infiniteUnlocked && !infinite, opt.shiny === true, opt.accessory ?? null, mega?.dexId === opt.dexId ? mega : null);
}

/** Tela "qual tipo?" aberta: a opcao clicada tem dois tipos. */
const typeChoice = ref<PickOption | null>(null);
const typeAffinityOffer = ref<PokemonType[] | null>(null);

watch(
  [pickOptions, typeChoice, typeAffinityOffer, pendingUpgrade, paused, leaveConfirm, specialModalOpen],
  (next, previous) => {
    if (next.some((value, index) => Boolean(value) && !previous[index])) focusFirstSurvivorAction();
  },
);
/** Marcou "Modo infinito" na tela de escolha (so vale se ja estiver destravado). */
watch(pickOptions, (options) => {
  if (!options) return;
  refreshTowerPreview();
  if (megaPick.value && !options.some((opt) => opt.id === megaPick.value?.optId)) megaPick.value = null;
  refreshMegaShards();
});
const infiniteWanted = ref(false);
const bonkWanted = ref(props.startBonk === true);
const fastWanted = ref(false);
const torre = computed(() => trainer.value.torre);
const rerollLimit = computed(() => survivorRerollLimit(torre.value.completedObjectives));
const recordedObjectiveCount = computed(() => new Set(torre.value.completedObjectives).size);
const preparations = computed(() => availableSurvivorPreparations(torre.value.completedObjectives));
const nextPreparation = computed(() => SURVIVOR_PREPARATIONS.find(({ unlockAtObjectives }) => unlockAtObjectives > recordedObjectiveCount.value));
const nextTowerGoal = computed(() => {
  if (!torre.value.infiniteUnlocked) return 'Próximo marco: derrote o chefão final aos 20 min para liberar o Infinito e o Ritmo acelerado.';
  if (torre.value.trainersBeaten < 10) return `Próximo marco: derrote ${10 - torre.value.trainersBeaten} treinador(es) para a conquista Mestre da Torre.`;
  if (torre.value.bossesBeaten < 3) return `Próximo marco: derrote ${3 - torre.value.bossesBeaten} chefão(ões) para Caçador do infinito.`;
  if (recordedObjectiveCount.value < 3) return `Próximo marco: conclua ${3 - recordedObjectiveCount.value} desafio(s) opcional(is) distinto(s) em corridas encerradas para liberar outra troca de sorteio.`;
  return `Registro: ${torre.value.runs} corridas concluídas · melhor onda ${torre.value.bestWave} · nível ${torre.value.bestLevel}.`;
});
function openTypeChoice(opt: PickOption): void { typeChoice.value = opt; }
function chooseType(opt: PickOption, picked: PokemonType): void {
  typeChoice.value = null;
  choosePlayer(opt, picked);
}
function acceptTypeAffinity(type: PokemonType): void {
  if (!state.value || !typeAffinityOffer.value || !chooseSurvivorTypeAffinity(state.value, type)) return;
  typeAffinityOffer.value = null;
  paused.value = false;
  say(`✨ Afinidade de ${TYPE_LABELS_PT[type]} ativada: ${MOVE_EFFECT_LABELS_PT[moveEffectForType(type)]}.`, 4200);
}

function skipTypeAffinity(): void {
  if (!typeAffinityOffer.value) return;
  typeAffinityOffer.value = null;
  paused.value = false;
  say('Você guardou a afinidade para outra corrida.', 2600);
}
watch(() => torre.value.infiniteUnlocked, (ok) => { if (!ok) { infiniteWanted.value = false; fastWanted.value = false; } });

/** Abre a tela de escolha de novo (3 novos sorteados) antes de cada corrida, inclusive ao "Jogar de novo". */
async function openPicker(): Promise<void> {
  music.reset();
  ready.value = false;
  // O resumo encerra a corrida anterior, mas não pode continuar por cima da seleção seguinte.
  // Sem isto, "Jogar de novo" abria o seletor atrás do overlay do resultado.
  summary.value = null;
  pendingUpgrade.value = null;
  typeAffinityOffer.value = null;
  leaveConfirm.value = false;
  clearTrainerPresentation();
  bonkRun.value = false;
  bonkPhysics.value = null;
  bonkJumpQueued = false;
  clearBonkTap();
  pickBusy.value = true;
  pickOptions.value = null;
  noCompanion.value = false;
  try {
    rerollsUsed.value = 0;
    previousPickIds.value = [];
    const options = await rollPickOptions();
    if (disposed) return;
    if (options.length === 0) {
      noCompanion.value = true;
      return;
    }
    pickOptions.value = options;
    previousPickIds.value = options.map((option) => option.id);
  } catch {
    failed.value = true;
  } finally {
    pickBusy.value = false;
  }
}

async function rerollPicker(): Promise<void> {
  if (rerollsUsed.value >= rerollLimit.value || pickBusy.value || !pickOptions.value) return;
  rerollsUsed.value++;
  pickBusy.value = true;
  try {
    const options = await rollPickOptions(previousPickIds.value);
    if (disposed) return;
    pickOptions.value = options;
    previousPickIds.value = options.map((option) => option.id);
  } finally {
    pickBusy.value = false;
  }
}

function playAgain(): void {
  unlockSound();
  cancelGameFrame(rafId);
  rafId = 0;
  void openPicker();
}

onMounted(() => {
  ctx = canvasEl.value?.getContext('2d') ?? null;
  fitView();
  if (typeof ResizeObserver !== 'undefined' && stageEl.value) {
    resizer = new ResizeObserver(fitView);
    resizer.observe(stageEl.value);
  }
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('tcg-gamepad-direction', onGamepadDirection);
  window.addEventListener('tcg-gamepad-action', onGamepadAction);
  window.addEventListener('tcg-gamepad-back', onGamepadBack);
  window.addEventListener('tcg-gamepad-menu', onGamepadMenu);
  void openPicker();
});
/** Saiu do app (outra aba, tela apagada): ninguém fica andando sozinho com uma tecla "presa" ao voltar. */
function onVisibility(): void {
  sound.setPaused(document.hidden);
  syncMusic();
  if (document.hidden) {
    heldKeys.clear();
    joystick.active = false;
    joystick.pointerId = null;
    joystick.dx = 0;
    joystick.dy = 0;
    clearBonkTap();
  }
}
document.addEventListener('visibilitychange', onVisibility);

onBeforeUnmount(() => {
  disposed = true;
  cancelGameFrame(rafId);
  rafId = 0;
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  window.removeEventListener('tcg-gamepad-direction', onGamepadDirection);
  window.removeEventListener('tcg-gamepad-action', onGamepadAction);
  window.removeEventListener('tcg-gamepad-back', onGamepadBack);
  window.removeEventListener('tcg-gamepad-menu', onGamepadMenu);
  document.removeEventListener('visibilitychange', onVisibility);
  resizer?.disconnect();
  resizer = null;
  if (toastTimer) clearTimeout(toastTimer);
  if (artifactNoticeTimer) clearTimeout(artifactNoticeTimer);
  if (damageFeedbackTimer) clearTimeout(damageFeedbackTimer);
  clearTrainerPresentation();
  if (upgradeMenuLockTimer) clearTimeout(upgradeMenuLockTimer);
  upgradeMenuLockTimer = null;
  upgradeMenuLocked.value = false;
  heldKeys.clear();
  sound.dispose();
  music.dispose();
});
</script>

<template>
  <div class="survivor" :class="{ 'survivor-gameplay': ready && state && !summary }">
    <p v-if="failed" class="hint">Não deu para carregar a Zona de Sobrevivência agora. Tente de novo mais tarde.</p>
    <template v-else>
      <div
        ref="stageEl"
        class="survivor-stage"
        :class="[{ 'survivor-stage-picker': pickOptions }, `btn-${buttonLayout}`]"
        :style="{ '--move': state?.player.move.color ?? '#ffd84a', '--sv-s': BUTTON_SCALE[buttonSize] }"
        @pointerdown="joyDown"
        @pointermove="joyMove"
        @pointerup="joyUp"
        @pointercancel="joyCancel"
        @lostpointercapture="joyCancel"
      >
        <canvas ref="canvasEl" :width="view.w" :height="view.h" class="survivor-canvas" :class="{ 'bonk-canvas': bonkRun, 'survivor-damage-shake': damageFeedback }" :aria-label="bonkRun ? 'BONK: arraste para andar, toque ou clique duplo na tela para pular' : 'Torre: arraste em qualquer lugar para andar'"></canvas>

        <div class="survivor-vignette" aria-hidden="true"></div>
        <div v-if="damageFeedback" class="survivor-damage-flash" aria-hidden="true"></div>

        <div v-if="toast" class="survivor-toast" role="status" aria-live="polite">{{ toast }}</div>
        <div v-if="artifactNotice" class="survivor-artifact-notice" role="status" aria-live="polite">
          <span class="survivor-artifact-notice-icon" aria-hidden="true">{{ artifactNotice.icon }}</span>
          <span><b>{{ artifactNotice.name }}</b><small>{{ artifactNotice.description }}</small></span>
        </div>
        <div v-if="trainerPresentation" class="survivor-trainer-intro" :class="{ final: trainerPresentation.final, 'reduced-motion': !detailedSpecialEffects }" role="status" aria-live="assertive">
          <span class="survivor-trainer-kicker">ATENÇÃO · NOVO DESAFIO</span>
          <strong>{{ trainerPresentation.final ? 'CHEFÃO FINAL' : 'TREINADOR NA ARENA' }}</strong>
          <small>{{ trainerPresentation.count }} Pokémon reforçados aguardam a batalha</small>
        </div>
        <div v-if="ready && state" class="survivor-hud">
          <div class="survivor-hp" :class="{ low: state.player.hp / state.player.maxHp < 0.3, medium: state.player.hp / state.player.maxHp >= 0.3 && state.player.hp / state.player.maxHp < 0.5 }">
            <div class="survivor-hp-heading"><span class="survivor-hp-label">{{ avatarName }}</span><span>Nv {{ state.player.level }}</span></div>
            <div class="survivor-hp-row"><b>HP</b><div class="survivor-hp-track"><div class="survivor-hp-fill" :style="{ width: Math.max(0, Math.min(100, (state.player.hp / state.player.maxHp) * 100)) + '%' }"></div></div></div>
            <span class="survivor-hp-value">{{ Math.ceil(Math.max(0, state.player.hp)) }}/{{ Math.ceil(state.player.maxHp) }}</span>
          </div>
          <div class="survivor-xp-bar" role="progressbar" :aria-valuemin="0" :aria-valuemax="state.player.xpToNext" :aria-valuenow="state.player.xp" :aria-label="`Experiência: ${state.player.xp} de ${state.player.xpToNext} para o próximo nível`" :title="`Faltam ${Math.max(0, state.player.xpToNext - state.player.xp)} XP para o próximo nível`">
            <div class="survivor-xp-fill" :style="{ width: `${Math.max(0, Math.min(100, (state.player.xp / Math.max(1, state.player.xpToNext)) * 100))}%` }"></div>
            <span>XP {{ state.player.xp }}/{{ state.player.xpToNext }}</span>
          </div>
          <div class="survivor-stats">
            <span v-if="bonkRun" class="chip survivor-bonk-chip" title="Câmera em terceira pessoa, terreno físico e salto">💥 BONK</span>
            <span v-if="state.player.mega?.active" class="chip survivor-mega-chip" role="status" title="Stats base da forma Mega (PokéAPI) até o fim da corrida.">💎 {{ state.player.mega.label }}</span>
            <span v-if="state.typeAffinity" class="chip survivor-move-chip affinity" :style="{ '--move': moveFor([state.typeAffinity.type], null).color }" :title="`Afinidade rara: ${MOVE_EFFECT_LABELS_PT[state.typeAffinity.effect]}`">✨ {{ TYPE_LABELS_PT[state.typeAffinity.type] }} · afinidade</span>
            <span v-if="state.artifacts.length || state.player.artifactSpeedMs > 0 || state.player.artifactPowerMs > 0 || state.player.artifactShieldMs > 0 || state.player.artifactMagnetMs > 0 || state.player.artifactFocusMs > 0" class="chip survivor-artifact-chip" role="status">
              {{ state.player.artifactSpeedMs > 0 ? '⚡ Velocidade' : state.player.artifactPowerMs > 0 ? '✦ Poder' : state.player.artifactShieldMs > 0 ? '♥ Cura' : state.player.artifactMagnetMs > 0 ? '🧲 Ímã' : state.player.artifactFocusMs > 0 ? '◈ Foco' : `✦ ${state.artifacts.length} artefato${state.artifacts.length === 1 ? '' : 's'}` }}
            </span>
            <span v-if="state.shadowEncounter.phase === 'available'" class="chip survivor-shadow-chip" title="Ache a Pokébola Sombria para iniciar o confronto opcional">◉ {{ state.shadowEncounter.name }} aguarda</span>
            <span v-else-if="state.shadowEncounter.phase === 'battle'" class="chip survivor-shadow-chip" title="Lendário sombrio em combate">🔥 {{ state.shadowEncounter.name }}</span>
            <span v-if="state.shadowTrustStones > 0" class="chip survivor-shadow-chip" :title="`${state.shadowTrustStones} Pedra(s) da Confiança assegurada(s); entram no inventário ao concluir a corrida`">💠 {{ state.shadowTrustStones }} Pedra{{ state.shadowTrustStones === 1 ? '' : 's' }} assegurada{{ state.shadowTrustStones === 1 ? '' : 's' }}</span>
            <span class="chip survivor-run-stats" :title="`${state.kills} inimigos derrotados${state.fast ? ' · Ritmo acelerado' : ''}`">{{ state.fast ? '⚡ ' : '' }}⏱ {{ formatTime(state.elapsedMs) }} · ☠ {{ state.kills }}</span>
            <span v-if="missingEnemySprites" class="chip" role="status">{{ missingEnemySprites }} sprites indisponíveis: exibidos como formas neutras</span>
            <span class="survivor-action-dock">
              <button type="button" class="chip survivor-menu-btn" :aria-label="hudExpanded ? 'Fechar menu da Torre' : 'Abrir menu da Torre: pausa, informações e opções'" :title="hudExpanded ? 'Fechar menu da Torre' : 'Abrir menu da Torre: pausa, informações e opções'" :aria-expanded="hudExpanded" aria-controls="survivor-info-panel" @pointerdown.stop @click.stop="hudExpanded = !hudExpanded">{{ hudExpanded ? '✕ Fechar' : '☰ Menu' }}</button>
            </span>
          </div>
          <section v-if="hudExpanded" id="survivor-info-panel" class="survivor-info-panel" aria-label="Menu da Torre: pausa, informações e opções" @pointerdown.stop>
            <div v-if="!summary && !pendingUpgrade && !evolving && !specialModalOpen" class="survivor-info-actions">
              <button type="button" class="chip survivor-pause-btn" :aria-pressed="paused" @click.stop="togglePause">{{ paused ? '▶ Retomar' : '⏸ Pausar' }}</button>
              <button type="button" class="chip survivor-help-btn" @click.stop="openHelp">? Controles</button>
              <button type="button" class="chip survivor-back-btn" @click.stop="requestBack">← Voltar</button>
            </div>
            <div class="survivor-info-section">
              <strong>Golpe e defesas</strong>
              <span class="chip survivor-move-chip" :style="{ '--move': state.player.move.color }" :title="MOVE_EFFECT_LABELS_PT[state.player.move.effect]">{{ moveLine(state.player.move) }}</span>
              <span class="chip" title="Contato e explosões usam Defesa; projéteis usam Defesa Especial. Cartas defensivas somam pontos aos atributos reais.">{{ survivorDefenseReduction(state.player, 'contato') === null ? 'Defesas indisponíveis' : `🛡 ${Math.round((survivorDefenseReduction(state.player, 'contato') ?? 0) * 100)}% físico · ✨ ${Math.round((survivorDefenseReduction(state.player, 'projétil') ?? 0) * 100)}% especial` }}</span>
            </div>
            <div class="survivor-info-section">
              <strong>Corrida</strong>
              <span class="chip">🌊 Onda {{ state.wave }}</span>
              <span v-if="survivorBiomeLabel(state.elapsedMs)" class="chip" :title="survivorBiomeAt(state.elapsedMs)?.description">{{ survivorBiomeLabel(state.elapsedMs) }}</span>
              <span v-if="(state.player.difficultyStacks ?? 0) > 0" class="chip" :title="`Dificuldade ${state.player.difficultyStacks}: +${(state.player.difficultyStacks ?? 0) * 15}% densidade e +${(state.player.difficultyStacks ?? 0) * 12}% de velocidade e dano dos inimigos`">☠ Dificuldade {{ state.player.difficultyStacks }}</span>
              <span v-if="(state.player.bonusCoins ?? 0) > 0" class="chip" title="Moedas das cartas, pagas no fim da corrida">🪙 +{{ state.player.bonusCoins }} no fim</span>
            </div>
            <div class="survivor-info-section">
              <strong>Exibição</strong>
              <button type="button" class="chip" :aria-pressed="minimapEnabled" @click.stop="minimapEnabled = !minimapEnabled">Mapa: {{ minimapEnabled ? 'ligado' : 'desligado' }}</button>
              <button type="button" class="chip" :aria-pressed="regionScenery" @click.stop="regionScenery = !regionScenery">Cenário: {{ regionScenery ? 'ligado' : 'desligado' }}</button>
              <button type="button" class="chip" :aria-pressed="specialEffects" @click.stop="specialEffects = !specialEffects">Efeitos: {{ specialEffects ? 'completos' : 'leves' }}</button>
            </div>
            <div v-if="objectives.length" class="survivor-objectives" aria-label="Objetivos opcionais da corrida">
              <strong class="survivor-objectives-title">Objetivos</strong>
              <span v-for="objective in objectives" :key="objective.id" class="survivor-objective" :class="{ complete: objective.complete }">
                <b>{{ objective.complete ? '✓' : '○' }}</b>
                <span>{{ objective.title }}</span>
                <small v-if="!objective.complete">{{ objective.unit === 's' ? Math.floor(objective.progress / 1000) : objective.progress }} / {{ objective.unit === 's' ? Math.floor(objective.target / 1000) : objective.target }}{{ objective.unit === 's' ? 's' : objective.unit }}</small>
              </span>
            </div>
            <div v-if="state.supports.length" class="survivor-supports" aria-label="Aliados que seguem o protagonista">
              <strong>🤝 Aliados · {{ state.supports.length }}/5</strong>
              <small>Atacam a partir de você e não recebem upgrades.</small>
              <div v-for="support in state.supports" :key="`${support.dexId}-${support.name}`" class="survivor-support-line">
                <b>{{ support.name }}</b>
                <span>{{ support.move.icon }} {{ support.move.name }} · {{ MOVE_CATEGORY_LABELS_PT[support.move.category] }}</span>
                <small>{{ Math.round(support.profile.damage * support.damageFactor) }} dano · {{ Math.round(support.profile.cooldownMs) }} ms</small>
              </div>
            </div>
          </section>
        </div>

        <div v-if="ready && state && minimapEnabled" class="survivor-minimap" role="img" aria-label="Minimapa da arena; o ponto azul é você, pontos vermelhos são chefes, pontos amarelos são elites e estrelas são Pokébolas">
          <span class="survivor-minimap-title">Mapa</span>
          <span v-if="!bonkRun" class="survivor-minimap-viewport" :style="{ left: `${(minimap.viewport.x / ARENA_W) * 100}%`, top: `${(minimap.viewport.y / ARENA_H) * 100}%`, width: `${(minimap.viewport.width / ARENA_W) * 100}%`, height: `${(minimap.viewport.height / ARENA_H) * 100}%` }"></span>
          <template v-if="bonkRun && bonkPhysics">
            <!-- No BONK o mapa mostra o que bloqueia de verdade e um cone para onde a câmera olha. -->
            <span v-for="obstacle in bonkPhysics.obstacles" :key="obstacle.id" class="survivor-minimap-obstacle" :class="`kind-${obstacle.kind}`"
              :style="{ left: `${(obstacle.x / ARENA_W) * 100}%`, top: `${(obstacle.y / ARENA_H) * 100}%`, width: `${(obstacle.w / ARENA_W) * 100}%`, height: `${(obstacle.h / ARENA_H) * 100}%` }"></span>
            <span class="survivor-minimap-view" :style="{ left: `${(state.player.x / ARENA_W) * 100}%`, top: `${(state.player.y / ARENA_H) * 100}%`, transform: `rotate(${bonkPhysics.cameraYaw}rad)` }"></span>
          </template>
          <span
            v-for="marker in minimap.markers"
            :key="`${marker.kind}-${marker.id}`"
            class="survivor-minimap-marker"
            :class="`kind-${marker.kind}`"
            :style="{ left: `${(marker.x / ARENA_W) * 100}%`, top: `${(marker.y / ARENA_H) * 100}%` }"
          ></span>
        </div>

        <div v-if="ready && state && !summary" class="survivor-danger-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(state.digitalDanger)" :aria-label="state.digitalDanger >= 60 ? 'Você está atraindo treinadores!' : 'Perigo digital'">
          <div class="survivor-danger-fill" :style="{ width: `${state.digitalDanger}%` }"></div>
          <span>{{ state.digitalDanger >= 60 ? 'Você está atraindo treinadores!' : 'Perigo digital' }}</span>
        </div>

        <div v-if="ready && !summary && joystick.active" class="survivor-joy-base active" :style="{ left: `${joystick.lx}px`, top: `${joystick.ly}px` }" aria-hidden="true">
          <div class="survivor-joy-stick" :style="{ transform: `translate(${joystick.dx * JOY_MAX}px, ${joystick.dy * JOY_MAX}px)` }"></div>
        </div>
        <p v-if="ready && !summary && !joystick.active && !pickOptions && !hudExpanded && state && state.elapsedMs < 6000" class="survivor-move-hint" :class="{ 'is-bonk': bonkRun }">{{ bonkRun ? 'Arraste: para cima avança, para os lados vira a câmera · Pular: botão, toque/clique duplo, Q ou Espaço · Start pausa' : 'Arraste, use setas/WASD ou o analógico do controle para andar · Start pausa' }}</p>

        <div v-if="paused && !trainerPresentation && !typeAffinityOffer && !leaveConfirm" class="survivor-overlay" role="dialog" aria-label="Jogo pausado" aria-modal="true">
          <div class="card survivor-pause">
            <h2>Jogo pausado</h2>
            <MusicControls v-model:enabled="survivorAudio.enabled" v-model:volume="survivorAudio.volume" v-model:attack-sounds="survivorAudio.attackSounds" :track="survivorMusicTitle(state?.elapsedMs ?? 0, state?.runSeed ?? 0)" :unavailable="musicUnavailable" regional @unlock="unlockMusic" />
            <p class="note">O relógio, os inimigos e os projéteis estão parados.</p>
            <details class="survivor-help" :open="helpOpen" @toggle="helpOpen = ($event.target as HTMLDetailsElement).open">
              <summary>Como jogar · controles</summary>
              <ul>
                <li v-if="bonkRun"><b>Andar:</b> arraste para cima para avançar e para os lados para virar a câmera. Teclado: setas ou WASD.</li>
                <li v-else><b>Andar:</b> arraste em qualquer lugar da tela. Teclado: setas ou WASD. Controle: analógico.</li>
                <li><b>Atacar:</b> automático, em quem chegar perto.</li>
                <li v-if="bonkRun"><b>Pular:</b> botão PULAR, toque duplo na tela, Q ou Espaço. Dá para pular de novo no ar enquanto sobrar bolinha no botão.</li>
                <li><b>Especial:</b> botão do canto ou tecla E. Libera aos 3 minutos e recarrega sozinho.</li>
                <li v-if="chargeStyle === 'foco'"><b>Foco:</b> segure o botão ◎ (ou R) para carregar, devagar e andando mais lento; solte para um feixe que atravessa todos. Cheio, vira um canhão que cruza a arena.</li>
                <li v-if="chargeStyle === 'rapido'"><b>Rápido:</b> andar enche o botão » (ou R). Da metade em diante, aperte: o golpe vira teleportes de dano alto, cada um com 2 s sem levar dano. Correndo, você leva mais dano.</li>
                <li><b>Pausar:</b> botão ⏸ ou Start no controle. O botão ? abre esta ajuda.</li>
              </ul>
            </details>
            <section class="survivor-button-prefs" aria-label="Botões Pular e Especial">
              <strong>Botões da tela</strong>
              <div class="survivor-mode" role="group" aria-label="Tamanho dos botões">
                <button v-for="size in (['p', 'm', 'g'] as const)" :key="size" type="button" :class="{ active: buttonSize === size }" :aria-pressed="buttonSize === size" @pointerdown.stop @click.stop="buttonSize = size">{{ BUTTON_SIZE_LABELS[size] }}</button>
              </div>
              <div class="survivor-mode" role="group" aria-label="Posição dos botões">
                <button v-for="layout in (['lado', 'pilha', 'troca'] as const)" :key="layout" type="button" :class="{ active: buttonLayout === layout }" :aria-pressed="buttonLayout === layout" @pointerdown.stop @click.stop="buttonLayout = layout">{{ BUTTON_LAYOUT_LABELS[layout] }}</button>
              </div>
              <small>Empilhados deixa os dois mais perto da borda; Trocados põe o Pular no canto e o Especial ao lado.</small>
            </section>
            <button type="button" class="primary" @pointerdown.stop @click.stop="togglePause">▶ Retomar</button>
            <button type="button" class="link survivor-back" @pointerdown.stop @click.stop="requestBack">← Voltar</button>
            <button type="button" class="link survivor-exit" @pointerdown.stop @click.stop="requestLeave">Sair da Torre</button>
          </div>
        </div>

        <div v-if="pickOptions" class="survivor-overlay" role="dialog" aria-label="Escolha quem joga">
          <div v-if="typeChoice" class="card survivor-pick survivor-type-choice">
            <h2>{{ typeChoice.name }} tem dois tipos</h2>
            <p class="note">Qual deles ataca na corrida?</p>
            <div class="survivor-pick-grid">
              <button v-for="t in typeChoice.types" :key="t" type="button" class="survivor-pick-btn" @click="chooseType(typeChoice, t)">
                <strong>{{ TYPE_LABELS_PT[t] }}</strong>
                <small>{{ moveFor([t], null).name }}</small>
                <small class="survivor-pick-tip">{{ MOVE_CATEGORY_HINTS_PT[typeChoice.move.category] }}</small>
              </button>
            </div>
            <button type="button" class="link survivor-back" @click="typeChoice = null">← Voltar aos Pokémon</button>
          </div>
          <div v-else class="card survivor-pick">
            <h2>Quem vai pra Torre dessa vez?</h2>
            <p class="note" role="status">{{ nextTowerGoal }}</p>
            <p v-if="torre.runs > 0" class="note">{{ torre.runs }} corridas concluídas · melhor onda {{ torre.bestWave }} · melhor nível {{ torre.bestLevel }} · melhor tempo {{ formatTime(torre.bestMs) }} (corrida pura: {{ torre.bestPureMs > 0 ? formatTime(torre.bestPureMs) : '—' }}) · {{ recordedObjectiveCount }} desafio(s) distinto(s) registrados.</p>
            <p class="note">Cada corrida traz 3 desafios opcionais, escolhidos entre 12 pelo sorteio da própria corrida. Só contam quando ela termina.</p>
            <details class="survivor-ledger">
              <summary>Trilha dos desafios · {{ recordedObjectiveCount }}/{{ SURVIVOR_OBJECTIVE_IDS.length }} concluídos</summary>
              <ul>
                <li v-for="objectiveId in SURVIVOR_OBJECTIVE_IDS" :key="objectiveId" :class="{ complete: torre.completedObjectives.includes(objectiveId) }">
                  <span>{{ SURVIVOR_OBJECTIVE_DETAILS[objectiveId].title }}</span>
                  <small>{{ torre.completedObjectives.includes(objectiveId) ? 'Concluído em corrida encerrada' : 'Ainda não registrado' }}</small>
                </li>
              </ul>
            </details>
             <p class="note">Até 6 Pokémon são sorteados da sua caixa: 1 protagonista e até 5 apoios para recrutar durante a corrida. Você pode marcar favoritos para aumentar a chance de vê-los.</p>
            <p v-if="!bonkWanted" class="note">Viaje pelas nove regiões durante a corrida. Trilhas, árvores e lagoas são decorativas: você pode atravessar tudo.</p>
            <p v-else class="note bonk-picker-note">💥 BONK é um teste opcional: câmera em terceira pessoa, mapa amplo com ruínas, ponte e bosque físicos. Pedras e muretas bloqueiam; use o botão Pular ou Q/Espaço para atravessar obstáculos baixos.</p>
            <p class="note">Novos inimigos acompanham a região; os que já estão na arena mantêm a espécie. A dificuldade continua seguindo o tempo e a onda.</p>
            <div class="survivor-mode survivor-mode-bonk" role="group" aria-label="Modo da Torre">
              <button type="button" :class="{ active: !infiniteWanted && !bonkWanted }" @click="infiniteWanted = false; bonkWanted = false">🗼 Normal<small>Chefão aos 20 min</small></button>
              <button type="button" class="bonk-mode-button" :class="{ active: bonkWanted }" @click="bonkWanted = true; infiniteWanted = false">💥 BONK<small>3D, física e pulo</small></button>
              <button v-if="torre.infiniteUnlocked" type="button" :class="{ active: infiniteWanted }" @click="infiniteWanted = true; bonkWanted = false; fastWanted = false">♾️ Infinito<small>Mais difícil, sem fim</small></button>
            </div>
            <p v-if="bonkWanted" class="note bonk-picker-note">💥 BONK: câmera em terceira pessoa e física. Use o botão Pular (ou Q/Espaço) para atravessar obstáculos baixos.</p>
            <section v-if="torre.infiniteUnlocked" class="survivor-preparations" aria-label="Modificadores da corrida">
              <strong>Modificadores</strong>
              <div class="survivor-mode" role="group" aria-label="Ritmo da corrida">
                <button type="button" :class="{ active: fastWanted }" :disabled="infiniteWanted" :aria-pressed="fastWanted" @click="fastWanted = !fastWanted">
                  ⚡ Ritmo acelerado<small>Relógio 2× · orbes 1,75× XP · chefão aos 10 min</small>
                </button>
              </div>
              <p class="note">10 min no relógio da Torre equivalem a cerca de 5 min reais. A densidade e os chefes compensam o relógio para a arena não ficar apertada.</p>
            </section>
            <section v-if="preparations.length > 1" class="survivor-preparations" aria-label="Preparação para a corrida">
              <strong>Preparação</strong>
              <div class="survivor-mode" role="group" aria-label="Escolha uma preparação">
                <button v-for="preparation in preparations" :key="preparation.id" type="button" :class="{ active: selectedPreparation === preparation.id }" :aria-pressed="selectedPreparation === preparation.id" @click="selectedPreparation = preparation.id">
                  {{ preparation.name }}<small>{{ preparation.description }}</small>
                </button>
              </div>
            </section>
            <p v-if="preparations.length > 1 && nextPreparation" class="note">{{ recordedObjectiveCount }} desafio(s) distinto(s) registrado(s). Próxima preparação: {{ nextPreparation.name }} após {{ nextPreparation.unlockAtObjectives }} objetivos.</p>
            <p v-else-if="preparations.length > 1" class="note">Todas as preparações estratégicas estão liberadas pelos seus desafios concluídos.</p>
            <p v-else class="note">Conclua desafios em corridas reais para liberar preparações: 3 objetivos distintos liberam Passo leve; 6, Mira calculada; 9, Ímã de campo; 12, Mira de longo alcance.</p>
            <section class="survivor-preparations survivor-tower-perks" aria-label="O que a Vila entrega">
              <strong>Da Vila para a Torre</strong>
              <label class="survivor-pure-toggle">
                <input v-model="pureWanted" type="checkbox" />
                <span><strong>Corrida pura</strong><small>Sem Dojô, sem sorte do Carteiro e sem marmita. Conta num recorde separado.</small></span>
              </label>
              <p v-if="pureWanted" class="note" role="status">Corrida pura ligada: nada da Vila entra nesta corrida.</p>
              <ul v-else-if="towerPreview.length" class="survivor-tower-list" aria-label="Entra nesta corrida">
                <li v-for="line in towerPreview" :key="line">{{ line }}</li>
              </ul>
              <p v-else class="note">Nada da Vila entra por enquanto. Treinos do Dojô, a sorte do Carteiro e a marmita do Café aparecem aqui.</p>
            </section>
            <section class="survivor-preparations survivor-mega-panel" aria-label="Mega Evolução temporária">
              <strong>💎 Mega Evolução · {{ megaShards }} Fragmento{{ megaShards === 1 ? '' : 's' }} de Megapedra</strong>
              <p v-if="pureWanted" class="note">Corrida pura ligada: a Mega usa um item da Vila e fica de fora.</p>
              <p v-else-if="megaShards < 1" class="note">Sem fragmentos. Ganhe 1 ao chegar aos 20 min numa corrida ou fabrique na bancada da Vila (2 Pedras da Confiança, 2 Cristais e 1 Pérola).</p>
              <p v-else-if="!megaPickForm" class="note">Toque em «Mega» no Pokémon que tem forma Mega para começar a corrida megaevoluído. Gasta 1 fragmento e vale até o fim da corrida.</p>
              <div v-else class="survivor-mega-detail" role="status">
                <p class="note"><strong>{{ megaPickForm.label }}</strong> para {{ megaPickOption?.name }}: a corrida começa na forma Mega, com os stats base dela, e fica assim até o fim da corrida (só uma evolução desfaz a Mega). Gasta 1 fragmento (devolvido se você desistir nos primeiros 20 s).</p>
                <ul class="survivor-tower-list" aria-label="Efeito nos stats base">
                  <li v-for="row in survivorMegaStatDelta(megaPickForm)" :key="row.stat">{{ row.label }} {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</li>
                </ul>
                <p class="note">{{ MEGA_SPRITE_NOTES[megaPickForm.sprite] }}</p>
              </div>
            </section>
            <div class="survivor-pick-grid">
               <div
                v-for="opt in pickOptions"
                :key="opt.id"
                class="survivor-pick-btn"
                 :class="{ disabled: pickBusy }"
                 role="button"
                 :tabindex="pickBusy ? -1 : 0"
                 @keydown.enter.prevent="opt.types.length > 1 ? openTypeChoice(opt) : choosePlayer(opt, opt.types[0])"
                 @click="opt.types.length > 1 ? openTypeChoice(opt) : choosePlayer(opt, opt.types[0])"
              >
                 <button type="button" class="survivor-favorite" :aria-label="favoriteIds.has(opt.id) ? `Remover ${opt.name} dos favoritos` : `Favoritar ${opt.name}`" :aria-pressed="favoriteIds.has(opt.id)" @click.stop="toggleFavorite(opt.id)">{{ favoriteIds.has(opt.id) ? '★' : '☆' }}</button>
                <img v-if="opt.thumb" :src="opt.thumb" :alt="opt.name" class="survivor-pick-thumb" />
                <span v-else class="survivor-pick-thumb placeholder" aria-hidden="true">?</span>
                <strong>{{ opt.name }}</strong>
                <small>{{ opt.origin }}</small>
                <small class="survivor-pick-move" :style="{ '--move': opt.move.color }">{{ opt.move.icon }} {{ opt.move.name }}</small>
                <small class="survivor-pick-kind">{{ MOVE_CATEGORY_LABELS_PT[opt.move.category] }} · {{ MOVE_EFFECT_LABELS_PT[opt.move.effect] }}</small>
                 <small class="survivor-pick-tip">{{ MOVE_CATEGORY_HINTS_PT[opt.move.category] }}</small>
                <span class="survivor-pick-bars" :style="{ '--move': opt.move.color }">
                  <span v-for="b in opt.bars" :key="b.label" class="survivor-pick-bar"><small>{{ b.label }}</small><i><b :style="{ width: Math.round(b.value * 100) + '%' }"></b></i></span>
                </span>
                <small v-if="opt.move.estimated" class="survivor-pick-kind">Sem stats desta espécie: números médios.</small>
                <span v-if="survivorMegaForms(opt.dexId).length" class="survivor-mega-picks" role="group" :aria-label="`Mega de ${opt.name}`">
                  <button
                    v-for="form in survivorMegaForms(opt.dexId)"
                    :key="form.formId"
                    type="button"
                    class="survivor-mega-pick"
                    :class="{ active: megaPick?.optId === opt.id && megaPick.formId === form.formId }"
                    :aria-pressed="megaPick?.optId === opt.id && megaPick.formId === form.formId"
                    :disabled="megaShards < 1 || pureWanted || pickBusy"
                    :title="megaShards < 1 ? 'Precisa de 1 Fragmento de Megapedra' : `${form.label}: gasta 1 fragmento`"
                    @click.stop="toggleMegaPick(opt, form)"
                    @keydown.enter.stop
                  >💎 {{ form.short }}</button>
                </span>
               </div>
            </div>
             <button type="button" class="link survivor-reroll" :disabled="rerollsUsed >= rerollLimit || pickBusy" @click="rerollPicker">🔄 Sortear novamente <small>{{ Math.max(0, rerollLimit - rerollsUsed) }} de {{ rerollLimit }} troca(s) grátis nesta tentativa</small></button>
            <p v-if="pickBusy" class="note" role="status">Preparando a corrida…</p>
            <details class="survivor-more">
              <summary>Mais opções e informações</summary>
            <details><summary>Música da Torre</summary><MusicControls v-model:enabled="survivorAudio.enabled" v-model:volume="survivorAudio.volume" v-model:attack-sounds="survivorAudio.attackSounds" :unavailable="musicUnavailable" regional @unlock="unlockMusic" /><p class="hint">As nove regiões têm temas próprios: cinco arranjos GBA e quatro temas com tratamento sonoro retrô. A troca acompanha a transição do cenário.</p></details>
            <p v-if="torre.runs > 0" class="note">{{ torre.runs }} corridas concluídas · melhor onda {{ torre.bestWave }} · melhor nível {{ torre.bestLevel }} · {{ recordedObjectiveCount }} desafio(s) distinto(s) registrados.</p>
            <p class="note">Cada corrida traz 3 desafios opcionais, escolhidos entre 12 pelo sorteio da própria corrida. Só contam quando ela termina.</p>
            <details class="survivor-ledger">
              <summary>Trilha dos desafios · {{ recordedObjectiveCount }}/{{ SURVIVOR_OBJECTIVE_IDS.length }} concluídos</summary>
              <ul>
                <li v-for="objectiveId in SURVIVOR_OBJECTIVE_IDS" :key="objectiveId" :class="{ complete: torre.completedObjectives.includes(objectiveId) }">
                  <span>{{ SURVIVOR_OBJECTIVE_DETAILS[objectiveId].title }}</span>
                  <small>{{ torre.completedObjectives.includes(objectiveId) ? 'Concluído em corrida encerrada' : 'Ainda não registrado' }}</small>
                </li>
              </ul>
            </details>
             <p class="note">Até 6 Pokémon são sorteados da sua caixa: 1 protagonista e até 5 apoios para recrutar durante a corrida. Você pode marcar favoritos para aumentar a chance de vê-los.</p>
            <p v-if="!bonkWanted" class="note">Viaje pelas nove regiões durante a corrida. Trilhas, árvores e lagoas são decorativas: você pode atravessar tudo.</p>
            <p v-else class="note bonk-picker-note">💥 BONK é um teste opcional: câmera em terceira pessoa, mapa amplo com ruínas, ponte e bosque físicos. Pedras e muretas bloqueiam; use o botão Pular ou Q/Espaço para atravessar obstáculos baixos.</p>
            <p class="note">Novos inimigos acompanham a região; os que já estão na arena mantêm a espécie. A dificuldade continua seguindo o tempo e a onda.</p>
            <p v-if="preparations.length > 1 && nextPreparation" class="note">{{ recordedObjectiveCount }} desafio(s) distinto(s) registrado(s). Próxima preparação: {{ nextPreparation.name }} após {{ nextPreparation.unlockAtObjectives }} objetivos.</p>
            <p v-else-if="preparations.length > 1" class="note">Todas as preparações estratégicas estão liberadas pelos seus desafios concluídos.</p>
            <p v-else class="note">Conclua desafios em corridas reais para liberar preparações: 3 objetivos distintos liberam Passo leve; 6, Mira calculada; 9, Ímã de campo; 12, Mira de longo alcance.</p>
            <p v-if="rerollLimit === 1" class="note">Conclua 3 desafios distintos em corridas encerradas para liberar uma segunda troca de sorteio nas próximas tentativas.</p>
            <p v-else class="note">📜 Caderno de campo completo: a segunda troca de sorteio foi liberada pelos seus três desafios concluídos.</p>
            </details>
          </div>
        </div>

        <div v-else-if="noCompanion" class="survivor-overlay" role="dialog" aria-modal="true" aria-label="Você precisa de um companheiro">
          <div class="card survivor-pick">
            <h2>Você precisa de um companheiro</h2>
            <p class="note">A Torre usa Pokémon da sua coleção ou Digital Pokémon da Vila. Escaneie uma carta ou conclua o questionário inicial da Vila para receber seu primeiro companheiro.</p>
            <button type="button" class="primary survivor-exit" @pointerdown.stop @click.stop="requestLeave">Sair da Torre</button>
          </div>
        </div>

        <div v-if="typeAffinityOffer" class="survivor-overlay" role="dialog" aria-label="Escolha de afinidade de tipo" aria-modal="true">
          <div class="card survivor-pick survivor-type-choice">
            <h2>Sinergia desbloqueada!</h2>
            <p class="note">O primeiro líder foi derrotado aos 5 minutos. Escolha o segundo tipo real do seu Pokémon para aplicar um efeito leve durante esta corrida.</p>
            <div class="survivor-pick-grid">
              <button v-for="t in typeAffinityOffer" :key="t" type="button" class="survivor-pick-btn" @click="acceptTypeAffinity(t)">
                <strong>✨ {{ TYPE_LABELS_PT[t] }}</strong>
                <small>{{ MOVE_EFFECT_LABELS_PT[moveEffectForType(t)] }}</small>
              </button>
            </div>
            <button type="button" class="link" @click="skipTypeAffinity">Continuar sem afinidade</button>
          </div>
        </div>

        <button v-if="bonkRun && ready && state && !summary && !pickOptions && !pendingUpgrade && !evolving && !leaveConfirm && !specialModalOpen"
          type="button" class="survivor-jump-button"
          :class="{ 'is-airborne': bonkPhysics && !bonkPhysics.grounded, 'is-empty': bonkJumpPips.length > 0 && !bonkJumpPips.some(Boolean), 'is-pressed': bonkJumpPressed }"
          :disabled="bonkJumpBlocked"
          :aria-label="`Pular: ${bonkJumpLabel || 'indisponível'}; toque ou clique duplo na tela, tecla Q ou Espaço`"
          @pointerdown.stop.prevent="queueBonkJump">
          <svg class="jump-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 20 12h-5v7.5H9V12H4z" /></svg>
          <strong>PULAR</strong>
          <span class="jump-pips" aria-hidden="true"><i v-for="(available, index) in bonkJumpPips" :key="index" :class="{ on: available }"></i></span>
        </button>

        <button v-if="ready && state && chargeStyle && !summary && !pickOptions && !pendingUpgrade && !evolving && !leaveConfirm && !specialModalOpen"
          type="button" class="survivor-charge-button" :class="{ 'is-held': chargeHeld, 'is-full': state.charge.level >= 1 || (chargeStyle === 'rapido' && state.charge.level >= 0.5), 'is-rush': state.charge.rushMs > 0 }"
          :style="{ '--special-color': state.player.move.color, '--charge': `${chargeMeter * 100}%` }"
          :aria-label="chargeStyle === 'foco' ? `Foco: segure para carregar, solte para disparar; carga ${Math.floor(state.charge.level * 100)}%; tecla R` : `Rápido: ${state.charge.rushMs > 0 ? 'teleportes ativos' : state.charge.level >= 0.5 ? 'pronto' : `carga ${Math.floor(state.charge.level * 100)}%, ande para encher`}; tecla R`"
          @pointerdown.stop.prevent="pressCharge" @pointerup.stop.prevent="releaseCharge" @pointercancel="releaseCharge" @lostpointercapture="releaseCharge">
          <span class="special-icon" aria-hidden="true">{{ chargeStyle === 'foco' ? '◎' : '»' }}</span>
          <strong>{{ chargeLabel }}</strong>
          <small>{{ chargeStyle === 'foco' ? 'Foco' : 'Rápido' }}</small>
        </button>

        <button v-if="ready && state && !summary && !pickOptions && !pendingUpgrade && !evolving && !leaveConfirm && !specialModalOpen"
          type="button" class="survivor-special-button" :class="{ 'is-ready': chosenSpecial && !state.special.cooldownMs }"
          :style="{ '--special-color': state.player.move.color, '--charge': chosenSpecial ? `${(1 - state.special.cooldownMs / chosenSpecial.cooldownMs) * 100}%` : '0%' }"
          :disabled="specialBlocked || !chosenSpecial || state.special.cooldownMs > 0"
          :aria-label="chosenSpecial ? `${chosenSpecial.name}: ${state.special.cooldownMs > 0 ? `recarregando, ${Math.ceil(state.special.cooldownMs / 1000)} segundos` : 'pronto; tecla E'}` : 'Especial bloqueado: sobreviva por 3 minutos'"
          @pointerdown.stop.prevent="queueSpecial">
          <span class="special-icon" aria-hidden="true">{{ chosenSpecial?.icon ?? '🔒' }}</span>
          <strong>{{ !chosenSpecial ? '3:00' : state.special.activeMs > 0 ? 'ATIVO' : state.special.cooldownMs > 0 ? `${Math.ceil(state.special.cooldownMs / 1000)}s` : 'PRONTO' }}</strong>
          <small>{{ state.player.move.icon }} Especial</small>
        </button>

        <div v-if="ready && state && shadowCutsceneOpen && !leaveConfirm" class="survivor-overlay survivor-shadow-cutscene" :class="{ 'reduced-motion': !detailedSpecialEffects }" role="dialog" aria-modal="true" aria-label="Chegada de lendário sombrio" @pointerdown.stop>
          <div class="card survivor-upgrades">
            <div class="shadow-boss-arrival" aria-hidden="true">
              <img v-if="shadowBossSprite" :src="shadowBossSprite" alt="" />
              <span v-else class="guardian-missing">{{ state.shadowEncounter.name }}<small>Sprite indisponível</small></span>
            </div>
            <p class="guardian-title">LENDÁRIO SOMBRIO · sorteado nesta Pokébola</p>
            <h2>{{ state.shadowEncounter.name }} atravessa a fenda</h2>
            <p role="status">A arena está congelada por um instante. Derrote-o para assegurar uma Pedra da Confiança; ela entra no inventário ao concluir a corrida.</p>
          </div>
        </div>

        <div v-if="ready && state && guardian && !leaveConfirm && (state.special.phase === 'arrival' || state.special.phase === 'choice')" class="survivor-overlay survivor-guardian" :class="{ 'reduced-motion': !detailedSpecialEffects }" role="dialog" aria-modal="true" aria-label="Orbe elemental: escolha um especial" :style="{ '--special-color': state.player.move.color }" @pointerdown.stop>
          <div class="card survivor-upgrades">
            <div class="guardian-gift" :class="{ delivered: state.special.phase === 'choice' }" aria-hidden="true">
              <img v-if="guardianSprite" :src="guardianSprite" alt="" />
              <span v-else class="guardian-missing">{{ guardian.name }}<small>Sprite indisponível</small></span>
              <span class="guardian-orb">{{ state.player.move.icon }}</span>
            </div>
            <p class="guardian-title">{{ guardian.name }}{{ guardian.mythical ? ' · mítico' : ' · lendário' }}</p>
            <h2>{{ state.special.phase === 'arrival' ? 'Uma presença elemental…' : `Orbe do tipo ${TYPE_LABELS_PT[state.special.type]}` }}</h2>
            <p role="status">{{ state.special.phase === 'arrival' ? 'O guardião entrega uma orbe para o seu Pokémon.' : 'Escolha um especial para esta corrida. O combate está pausado.' }}</p>
            <div v-if="state.special.phase === 'choice'" class="survivor-choice-list">
              <button v-for="(definition, id) in SURVIVOR_SPECIALS" :key="id" type="button" class="survivor-upgrade-btn" @click="chooseSpecial(id)">
                <span class="survivor-upgrade-icon" aria-hidden="true">{{ definition.icon }}</span>
                <span class="survivor-upgrade-text"><strong>{{ definition.name }}</strong><small>{{ definition.description }}</small></span>
              </button>
            </div>
          </div>
        </div>

        <div v-if="ready && state && guardian && state.special.selected && !leaveConfirm && (state.special.phase === 'branch-arrival' || state.special.phase === 'branch-choice')" class="survivor-overlay survivor-guardian" :class="{ 'reduced-motion': !detailedSpecialEffects }" role="dialog" aria-modal="true" aria-label="Ramificação do especial" :style="{ '--special-color': state.player.move.color }" @pointerdown.stop>
          <div class="card survivor-upgrades">
            <div class="guardian-gift" :class="{ delivered: state.special.phase === 'branch-choice' }" aria-hidden="true">
              <img v-if="guardianSprite" :src="guardianSprite" alt="" />
              <span v-else class="guardian-missing">{{ guardian.name }}<small>Sprite indisponível</small></span>
              <span class="guardian-orb">{{ chosenSpecial?.icon }}</span>
            </div>
            <p class="guardian-title">{{ guardian.name }} · segundo presságio</p>
            <h2>{{ state.special.phase === 'branch-arrival' ? 'O especial encontrou dois novos caminhos…' : 'Escolha uma das duas ramificações' }}</h2>
            <p role="status">{{ state.special.phase === 'branch-arrival' ? 'Aos 7 minutos, o Especial escolhido aos 3 minutos oferece duas opções próprias.' : 'Escolha uma das duas opções do seu Especial. A batalha está pausada.' }}</p>
            <div v-if="state.special.phase === 'branch-choice'" class="survivor-choice-list">
              <button v-for="option in specialBranchOptions" :key="option.id" type="button" class="survivor-upgrade-btn" @click="chooseSpecialBranch(option.id)">
                <span class="survivor-upgrade-icon" aria-hidden="true">{{ option.icon }}</span>
                <span class="survivor-upgrade-text"><strong>{{ option.name }}</strong><small>{{ option.description }}</small></span>
              </button>
            </div>
          </div>
        </div>

        <div v-if="pendingUpgrade" class="survivor-overlay" role="dialog" aria-label="Escolha um upgrade">
          <div class="card survivor-upgrades survivor-levelup" @click.self="banMode = false">
            <p class="survivor-kicker">Nível {{ state?.player.level }}</p>
            <h2>Subiu de nível!</h2>
            <p class="survivor-rarity-hint">Cada carta tem uma raridade e um efeito próprio. O Especial continua disponível após o encontro com o guardião.</p>
            <p v-if="upgradeMenuLocked" class="survivor-upgrade-delay" role="status" aria-live="polite">Escolha liberada em instantes…</p>
            <div class="survivor-choice-list">
              <button v-for="u in pendingUpgrade" :key="u.id" type="button" class="survivor-upgrade-btn" :class="[u.rarity ? `rarity-${u.rarity}` : '', { evolve: u.id.startsWith('evolve:') }]" :disabled="upgradeMenuLocked || (banMode && !!banBlock(u.id))" :title="banMode ? (banBlock(u.id) ?? 'Banir esta carta') : undefined" @pointerdown.stop @click="chooseUpgrade(u.id)">
                <span class="survivor-upgrade-icon" aria-hidden="true">{{ upgradeIcon(u) }}</span>
                <span class="survivor-upgrade-text">
                  <span v-if="u.rarity" class="survivor-rarity-label" :title="`${SURVIVOR_UPGRADE_RARITIES[u.rarity].label}: ${SURVIVOR_UPGRADE_RARITIES[u.rarity].impact}`">
                    <img class="survivor-rarity-ball" :src="RARITY_BALL_IMAGE[u.rarity]" alt="" />
                    <span>{{ SURVIVOR_UPGRADE_RARITIES[u.rarity].label }}</span>
                  </span>
                  <span v-if="u.family" class="survivor-upgrade-family">{{ SURVIVOR_UPGRADE_FAMILIES[u.family].icon }} {{ SURVIVOR_UPGRADE_FAMILIES[u.family].label }}</span>
                  <strong>{{ u.name }}</strong><small>{{ u.description }}</small>
                  <small v-if="banMode && banBlock(u.id)" class="survivor-ban-reason">Não dá para banir: {{ banBlock(u.id) }}</small>
                </span>
              </button>
            </div>
            <button v-if="banAvailable" type="button" class="survivor-ban-toggle" :class="{ active: banMode }" :disabled="upgradeMenuLocked || bansLeft <= 0" :aria-pressed="banMode" @pointerdown.stop @click="toggleBanMode">
              <span class="survivor-upgrade-icon" aria-hidden="true">🚫</span>
              <span><strong>Banir ({{ bansLeft }})</strong><small>{{ banMode ? 'Toque numa carta para bani-la; toque aqui de novo para cancelar.' : 'A carta banida não aparece mais nesta corrida e a vaga é reposta.' }}</small></span>
            </button>
            <button v-if="availableUpgradeRerolls > 0" type="button" class="survivor-jirachi-reroll" :disabled="upgradeMenuLocked" @pointerdown.stop @click="rerollUpgradeSelection">
              <span class="survivor-upgrade-icon" aria-hidden="true">⭐</span>
              <span><strong>Desejo de Jirachi · Rerrolar</strong><small>{{ availableUpgradeRerolls }} desejo(s) restante(s). Cartas normais são trocadas; se todas forem Great Ball ou melhor, uma nova raridade superior é garantida quando já estiver liberada.</small></span>
            </button>
            <details class="survivor-rarity-guide">
              <summary>Como funcionam as raridades</summary>
              <p>Pesos relativos entre cartas disponíveis: Poké Ball {{ SURVIVOR_UPGRADE_RARITIES.normal.weight }}, Great Ball {{ SURVIVOR_UPGRADE_RARITIES.raro.weight }}, Ultra Ball {{ SURVIVOR_UPGRADE_RARITIES.lendario.weight }} e Master Ball {{ SURVIVOR_UPGRADE_RARITIES.ancestral.weight }}. As chances mudam quando uma faixa ainda não está liberada ou acaba.</p>
              <p>Great Ball: nível 3 · Ultra Ball: nível 8 · Master Ball: nível 12. Só uma carta Master Ball pode ser escolhida por corrida.</p>
            </details>
          </div>
        </div>

        <div v-if="leaveConfirm" class="survivor-overlay" role="alertdialog" aria-label="Abandonar corrida" aria-modal="true">
          <div class="card survivor-pause">
            <h2>Abandonar a Torre?</h2>
            <p class="note">A corrida será encerrada sem registrar objetivos, marcos ou recompensas. Só corridas que chegam ao fim contam para a progressão.</p>
            <button type="button" class="primary" @pointerdown.stop @click.stop="cancelLeave">Continuar na Torre</button>
            <button type="button" class="link" @pointerdown.stop @click.stop="confirmLeave">Abandonar corrida</button>
          </div>
        </div>

        <p v-if="evolving" class="survivor-evolving" role="status">✨ {{ evolving }}</p>

        <div v-if="summary" class="survivor-overlay" role="dialog" aria-label="Fim da corrida">
          <div class="card survivor-summary">
            <h2>Fim de jogo</h2>
            <div class="survivor-summary-grid">
              <div><strong>{{ formatTime(summary.survivedMs) }}</strong><small>Tempo</small></div>
              <div><strong>Nv {{ summary.level }}</strong><small>Nível</small></div>
              <div><strong>{{ summary.kills }}</strong><small>Derrotas</small></div>
              <div><strong>{{ summary.wave }}</strong><small>Onda</small></div>
            </div>
            <p v-if="summary.finalHit" class="note" role="status">
              Golpe final: {{ summary.finalHit.shadowBoss ? 'lendário sombrio' : summary.finalHit.boss || summary.finalHit.grade === 'chefao' ? 'chefão' : summary.finalHit.grade === 'elite' ? 'inimigo de treinador' : 'inimigo' }}{{ summary.finalHit.dexId ? ` (${speciesName(summary.finalHit.dexId) || `Pokémon nº ${summary.finalHit.dexId}`})` : '' }} · {{ summary.finalHit.kind }} · {{ summary.finalHit.damage }} de dano (vida antes: {{ Math.ceil(summary.finalHit.hpBefore) }}).
            </p>
            <p v-if="state && !state.trained" class="note" role="status">🧼 Corrida pura: nada da Vila entrou. Conta no recorde puro.</p>
            <div v-else-if="state?.towerSummary?.length" class="survivor-tower-summary" role="status">
              <strong>Da Vila nesta corrida</strong>
              <ul><li v-for="line in state.towerSummary" :key="line">{{ line }}</li></ul>
            </div>
            <p v-if="summary.fast" class="survivor-cleared" role="status">⚡ Ritmo acelerado: relógio 2× e orbes com 1,75× XP.</p>
            <p v-if="objectives.length" class="survivor-objectives-summary" role="status">
              Objetivos opcionais: {{ objectives.filter((objective) => objective.complete).length }}/{{ objectives.length }} concluídos.
            </p>
            <p class="survivor-coins" role="status">
              {{ runCoins > 0 ? `🪙 +${runCoins} moedas` : 'Sem moedas desta vez: dure 20 segundos ou derrote alguém.' }}
              <small v-if="runClearBonus > 0"> (inclui o bônus de {{ runClearBonus }} por zerar, 1× por dia)</small>
            </p>
             <p v-if="summary.survivedMs >= SURVIVOR_LOVE_CANDY_MS" class="survivor-cleared" role="status">🍬 Love Candy conquistado por alcançar 10 minutos.</p>
              <p v-if="summary.survivedMs >= SURVIVOR_TRUST_STONE_MS" class="survivor-cleared" role="status">💠 Pedra da Confiança conquistada por alcançar 15 minutos.</p>
             <p v-if="(summary.shadowTrustStones ?? 0) > 0" class="survivor-cleared" role="status">💠 {{ summary.shadowTrustStones }} Pedra{{ summary.shadowTrustStones === 1 ? '' : 's' }} da Confiança assegurada{{ summary.shadowTrustStones === 1 ? '' : 's' }} ao derrotar lendário{{ summary.shadowTrustStones === 1 ? '' : 's' }} sombrio{{ summary.shadowTrustStones === 1 ? '' : 's' }}.</p>
             <p v-if="summary.survivedMs >= SURVIVOR_MEGA_SHARD_MS" class="survivor-cleared" role="status">💎 Fragmento de Megapedra conquistado por alcançar 20 minutos.</p>
             <p v-if="summary.finalBossBeaten" class="survivor-cleared" role="status">🏆 Chefão final derrotado!<small v-if="runUnlockedInfinite"> Modo infinito destravado.</small></p>
            <p v-if="runUnlocks.length" class="survivor-cleared" role="status">Desbloqueios desta corrida: {{ runUnlocks.join(' · ') }}.</p>
            <p v-if="summary.trainersBeaten > 0 || summary.bossesBeaten > 0" class="note">Treinadores derrotados: {{ summary.trainersBeaten }}{{ summary.bossesBeaten > 0 ? ` · chefões: ${summary.bossesBeaten}` : '' }}.</p>
            <p v-if="summary.stage > 0" class="note">Evoluiu {{ summary.stage === 1 ? 'uma vez' : `${summary.stage} vezes` }} nesta corrida (como {{ avatarName }}).</p>
             <section v-if="!feedbackSubmitted" class="survivor-feedback" aria-labelledby="survivor-feedback-title">
               <h3 id="survivor-feedback-title">Ajude a equilibrar a Torre</h3>
               <p class="note">Suas respostas ficam anônimas e viram um código sobre esta corrida. Não alteram o save.</p>
               <fieldset v-for="question in feedbackQuestions" :key="question.key" class="survivor-feedback-question">
                 <legend>{{ question.label }}</legend>
                 <div class="survivor-rating" role="radiogroup" :aria-label="question.label">
                   <button v-for="value in 5" :key="value" type="button" :class="{ selected: feedback[question.key] === value }" :aria-label="`${value} de 5`" :aria-pressed="feedback[question.key] === value" @click="setFeedbackRating(question.key, value)">{{ value }}</button>
                 </div>
                 <small class="survivor-rating-legend"><span>{{ question.low }}</span><span>{{ question.high }}</span></small>
               </fieldset>
               <label class="survivor-feedback-comment">Comentário opcional
                 <textarea v-model.trim="feedback.comment" maxlength="240" rows="3" placeholder="O que deixou a corrida boa, frustrante ou confusa?"></textarea>
               </label>
               <p v-if="feedbackError" class="survivor-feedback-error" role="alert">{{ feedbackError }}</p>
               <button type="button" class="primary" :disabled="!feedbackComplete" @click="submitFeedback">Gerar código de feedback</button>
             </section>
             <section v-else class="survivor-feedback-result" aria-labelledby="survivor-feedback-result-title">
               <h3 id="survivor-feedback-result-title">Feedback pronto para enviar</h3>
               <p class="note">Envie este código junto de uma mensagem. Ele permite comparar sua opinião com os dados reais da corrida.</p>
               <textarea class="survivor-feedback-code" readonly rows="5" :value="feedbackCode" aria-label="Código de feedback"></textarea>
               <button type="button" class="primary" @click="copyFeedbackCode">{{ feedbackCopied ? 'Código copiado ✓' : 'Copiar código' }}</button>
               <p v-if="feedbackError" class="survivor-feedback-error" role="alert">{{ feedbackError }}</p>
             </section>
            <button type="button" class="primary" @click="playAgain">Jogar de novo</button>
            <button type="button" class="link survivor-back" @click="playAgain">← Voltar ao menu da Torre</button>
            <button type="button" class="link survivor-exit" @click="leaveNow">Sair da Torre</button>
          </div>
        </div>

        <p v-if="!ready && !pickOptions" class="hint survivor-loading">Carregando a Zona de Sobrevivência…</p>
      </div>
      <p class="note">Arraste em qualquer lugar da tela para andar (ou WASD/setas); seu Pokémon ataca sozinho com o golpe do tipo dele: projétil, aura, área, cone frontal ou órbita. Evolua e escolha melhorias durante a corrida. Ondas cada vez maiores e um chefe de tempos em tempos. Chão e inimigos: créditos no rodapé do app.</p>
    </template>
  </div>
</template>

