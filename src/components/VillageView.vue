<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { getCache, loadPinData } from '../app/services';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { profile } from '../app/profile-store';
import { loadVillage, saveVillage, villageMap } from '../app/village-store';
import { browserDecoders, loadCreatureEntries } from '../box/load-creatures';
import { dayKey } from '../core/trainer';
import {
  canFollow, count, craft, describeCost, FURNITURE, friendLevel, friendOf, giveGift, harvest, HOUSE_LEVELS, ITEM_INFO, MATERIALS, pickUp, place, pruneHarvest,
  RECIPES, talk, upgradeHouse,
} from '../core/village/life';
import type { FurnitureId, ItemId } from '../core/village/life';
import type { Dir } from '../core/village/actors';
import type { PokemonType } from '../core/pokemon-data';
import { VillageGame } from '../village/village-game';
import type { VillageMon } from '../village/village-game';

/** Modo vida da Caixa: a Vila, sem câmera, com controle na tela. */
const emit = defineEmits<{ close: [] }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const wrapEl = ref<HTMLElement | null>(null);
const loading = ref('Chamando os seus Pokémon para a Vila…');
const toast = ref('');
const clock = ref('');
const map = villageMap();
const state = reactive(loadVillage());
const day = ref(dayKey(new Date()));
pruneHarvest(state, day.value);

type Sheet = null | 'menu' | 'build';
const sheet = ref<Sheet>(null);
const tab = ref<'mochila' | 'fabricar' | 'amigos'>('mochila');
const dialog = ref<{ id?: string; name: string; text: string; actions: { label: string; run: () => void }[] } | null>(null);
const giftPick = ref(false);

let game: VillageGame | null = null;
let observer: ResizeObserver | null = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
const mons = ref<{ id: string; name: string; shiny: boolean; dexId?: number }[]>([]);
const types = new Map<string, PokemonType[]>();

function changed(): void {
  dirty = true;
}

function say(text: string): void {
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2600);
}

function nameOf(id: string): string {
  return mons.value.find((m) => m.id === id)?.name ?? 'Pokémon';
}

const inventory = computed(() => (Object.entries(state.inventory) as [ItemId, number][]).filter(([, n]) => n > 0));
const nextHouse = computed(() => HOUSE_LEVELS[state.house + 1] ?? null);

// ---- controle
function hold(dir: Dir | null): void {
  game?.hold(dir);
}

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
let keyDir: Dir | null = null;
function onKey(e: KeyboardEvent): void {
  if (e.type === 'keydown') {
    const dir = KEYS[e.key];
    if (dir) {
      keyDir = dir;
      hold(dir);
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
      pressA();
      e.preventDefault();
    } else if (e.key === 'x' || e.key === 'Escape') pressB();
  } else if (KEYS[e.key] && KEYS[e.key] === keyDir) {
    keyDir = null;
    hold(null);
  }
}

function pressA(): void {
  if (dialog.value) {
    if (dialog.value.actions.length === 0) dialog.value = null;
    return;
  }
  if (sheet.value || !game) return;
  const today = dayKey(new Date());
  if (today !== day.value) {
    day.value = today;
    pruneHarvest(state, today);
  }
  const t = game.target();
  if (t.kind === 'mon') {
    game.faceMe(t.id);
    const name = nameOf(t.id);
    const result = talk(state, t.id, name, types.get(t.id) ?? [], today, new Date().getHours(), Math.random);
    if (result.gained > 0) game.bubble(t.id, '❤️');
    changed();
    openFriendDialog(t.id, result.text);
  } else if (t.kind === 'furniture') {
    dialog.value = {
      name: ITEM_INFO[t.item].name,
      text: 'Quer guardar na mochila?',
      actions: [
        { label: 'Guardar', run: () => { say(pickUp(state, t.x, t.y).message); changed(); dialog.value = null; } },
        { label: 'Deixar', run: () => (dialog.value = null) },
      ],
    };
  } else if (t.kind === 'plot') {
    sheet.value = 'build';
  } else if (t.kind === 'tile') {
    const r = harvest(state, map, t.x, t.y, today, Math.random);
    if (r.message) say(r.message);
    if (r.ok) changed();
  }
}

function openFriendDialog(id: string, text: string): void {
  const f = friendOf(state, id);
  const lvl = friendLevel(f.points);
  const following = state.follower === id;
  const actions: { label: string; run: () => void }[] = [{ label: 'Presentear', run: () => { giftPick.value = true; } }];
  if (following) actions.push({ label: 'Pode passear', run: () => { state.follower = null; changed(); dialog.value = null; } });
  else if (canFollow(state, id)) actions.push({ label: 'Vem comigo!', run: () => { state.follower = id; changed(); game?.bubble(id, '🥰'); dialog.value = null; } });
  actions.push({ label: 'Tchau', run: () => { dialog.value = null; } });
  dialog.value = { id, name: `${nameOf(id)} · ${lvl.name} ${'♥'.repeat(lvl.hearts)}${'♡'.repeat(5 - lvl.hearts)}`, text, actions };
}

function give(item: ItemId): void {
  const id = dialog.value?.id;
  giftPick.value = false;
  if (!id) return;
  const r = giveGift(state, id, types.get(id) ?? [], item, dayKey(new Date()));
  if (r.ok) {
    changed();
    game?.bubble(id, r.gained >= 10 ? '😍' : '😊');
  }
  openFriendDialog(id, r.text);
}

function pressB(): void {
  if (giftPick.value) giftPick.value = false;
  else if (dialog.value) dialog.value = null;
  else sheet.value = sheet.value ? null : 'menu';
}

function doCraft(item: FurnitureId): void {
  say(craft(state, item).message);
  changed();
}

function doPlace(item: FurnitureId): void {
  const spot = game?.frontSpot();
  if (!spot) {
    say('Fique de frente para um lugar livre para colocar.');
    return;
  }
  const r = place(state, map, item, spot.x, spot.y, (x, y) => game?.occupied(x, y) ?? false);
  say(r.message);
  if (r.ok) {
    changed();
    sheet.value = null;
  }
}

function doBuild(): void {
  const r = upgradeHouse(state);
  say(r.message);
  if (r.ok) {
    changed();
    sheet.value = null;
  }
}

function friendRows() {
  return mons.value.map((m) => {
    const f = friendOf(state, m.id);
    const lvl = friendLevel(f.points);
    return { ...m, lvl, points: f.points, following: state.follower === m.id };
  });
}

function tickClock(): void {
  const d = new Date();
  const h = d.getHours();
  clock.value = `${h >= 19 || h < 6 ? '🌙' : '☀️'} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

onMounted(async () => {
  tickClock();
  const clockTimer = setInterval(tickClock, 15000);
  onBeforeUnmount(() => clearInterval(clockTimer));
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  let villagers: VillageMon[] = [];
  try {
    const cache = await getCache();
    const team = resolveTeam(savedTeam.value, await cache.list());
    const loaded = await loadCreatureEntries(cache, browserDecoders, team.ids);
    villagers = loaded.entries.map((e) => ({
      id: e.info.id,
      name: e.info.name,
      shiny: e.info.shiny === true,
      gif: e.source.kind === 'gif' ? e.source.gif : { width: e.source.image.width, height: e.source.image.height, frames: [{ rgba: e.source.image.data, delayMs: 1000 }], durationMs: 1000 },
    }));
    mons.value = loaded.entries.map((e) => ({ id: e.info.id, name: e.info.name, shiny: e.info.shiny === true, dexId: e.info.dexId }));
  } catch {
    say('Não consegui ler as cartas guardadas; a Vila abre só com você.');
  }
  if (!canvasEl.value || !wrapEl.value) return;
  game = new VillageGame(canvasEl.value, map, state, villagers, profile.sprite);
  game.harvestedToday = (x, y) => state.harvested[`${x},${y}`] === day.value;
  game.onStep = changed;
  const resize = () => game?.resize(wrapEl.value!.clientWidth, wrapEl.value!.clientHeight);
  observer = new ResizeObserver(resize);
  observer.observe(wrapEl.value);
  resize();
  game.start();
  loading.value = '';
  if (villagers.length === 0) say('Sua equipe está vazia: escaneie cartas para trazer Pokémon para a Vila.');
  saveTimer = setInterval(() => {
    if (dirty) dirty = !saveVillage(state);
  }, 1500);
  // Tipos (para os presentes favoritos) chegam em segundo plano; sem rede, todos gostam de Fruta Oran.
  for (const m of mons.value) {
    void loadPinData(m.id, m.dexId).then((d) => d.profile && types.set(m.id, d.profile.types)).catch(() => undefined);
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  game?.stop();
  observer?.disconnect();
  if (saveTimer) clearInterval(saveTimer);
  if (toastTimer) clearTimeout(toastTimer);
  saveVillage(state);
});
</script>

<template>
  <div class="village" role="application" aria-label="Vila: modo vida da Caixa">
    <div ref="wrapEl" class="village-stage">
      <canvas ref="canvasEl" class="village-canvas"></canvas>
      <header class="village-top">
        <strong>Vila</strong>
        <span>{{ clock }}</span>
        <span class="village-house">{{ HOUSE_LEVELS[state.house]?.name }}</span>
        <button type="button" class="village-close" aria-label="Sair da Vila" @click="emit('close')">✕</button>
      </header>
      <p v-if="loading" class="village-loading">{{ loading }}</p>
      <p v-if="toast" class="village-toast" role="status">{{ toast }}</p>

      <div v-if="dialog" class="speech in-stage village-dialog" role="dialog" :aria-label="dialog.name">
        <div class="speech-box">
          <strong>{{ dialog.name }}</strong>
          <p>{{ dialog.text }}</p>
          <div v-if="giftPick" class="village-choices">
            <button v-for="[item, n] in inventory" :key="item" type="button" @click="give(item)">{{ ITEM_INFO[item].emoji }} {{ ITEM_INFO[item].name }} ×{{ n }}</button>
            <span v-if="inventory.length === 0">A mochila está vazia. Colete frutas, flores ou conchas!</span>
            <button type="button" @click="giftPick = false">Voltar</button>
          </div>
          <div v-else class="village-choices">
            <button v-for="a in dialog.actions" :key="a.label" type="button" @click="a.run()">{{ a.label }}</button>
            <button v-if="dialog.actions.length === 0" type="button" @click="dialog = null">OK</button>
          </div>
        </div>
      </div>

      <div v-if="sheet === 'build'" class="village-sheet" role="dialog" aria-label="Construir a casa">
        <header><strong>Sua casa: {{ HOUSE_LEVELS[state.house]?.name }}</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <template v-if="nextHouse">
          <p>Próximo: <strong>{{ nextHouse.name }}</strong></p>
          <p class="hint">Precisa de: {{ describeCost(state, nextHouse.cost) }}</p>
          <button type="button" class="primary" @click="doBuild">Construir</button>
        </template>
        <p v-else>Sua casa está completa! Decore o quintal com móveis.</p>
      </div>

      <div v-if="sheet === 'menu'" class="village-sheet" role="dialog" aria-label="Menu da Vila">
        <header>
          <div class="chips" role="tablist">
            <button v-for="t in (['mochila', 'fabricar', 'amigos'] as const)" :key="t" type="button" role="tab" :class="{ active: tab === t }" :aria-selected="tab === t" @click="tab = t">
              {{ t === 'mochila' ? 'Mochila' : t === 'fabricar' ? 'Fabricar' : 'Amigos' }}
            </button>
          </div>
          <button type="button" class="link" @click="sheet = null">Fechar</button>
        </header>
        <ul v-if="tab === 'mochila'" class="village-list">
          <li v-for="item in [...MATERIALS, ...FURNITURE]" v-show="count(state, item) > 0" :key="item">
            <span>{{ ITEM_INFO[item].emoji }} {{ ITEM_INFO[item].name }}</span>
            <b>×{{ count(state, item) }}</b>
            <button v-if="(FURNITURE as readonly string[]).includes(item)" type="button" @click="doPlace(item as FurnitureId)">Colocar à frente</button>
          </li>
          <li v-if="inventory.length === 0" class="hint">Vazia. Toque em A de frente para árvores, pedras, arbustos, flores ou areia para coletar.</li>
        </ul>
        <ul v-else-if="tab === 'fabricar'" class="village-list">
          <li v-for="f in FURNITURE" :key="f">
            <span>{{ ITEM_INFO[f].emoji }} {{ ITEM_INFO[f].name }}<small>{{ describeCost(state, RECIPES[f]) }}</small></span>
            <button type="button" @click="doCraft(f)">Fazer</button>
          </li>
        </ul>
        <ul v-else class="village-list">
          <li v-for="m in friendRows()" :key="m.id">
            <span>{{ m.name }}<small>{{ m.lvl.name }} · {{ '♥'.repeat(m.lvl.hearts) }}{{ '♡'.repeat(5 - m.lvl.hearts) }}{{ m.following ? ' · seguindo você' : '' }}</small></span>
          </li>
          <li v-if="mons.length === 0" class="hint">Nenhum Pokémon na Vila ainda.</li>
        </ul>
      </div>
    </div>

    <div class="village-pad" @contextmenu.prevent>
      <div class="dpad" aria-label="Direcional">
        <button
          v-for="d in (['up', 'left', 'right', 'down'] as const)"
          :key="d"
          type="button"
          :class="'d-' + d"
          :aria-label="{ up: 'Cima', down: 'Baixo', left: 'Esquerda', right: 'Direita' }[d]"
          @pointerdown.prevent="hold(d)"
          @pointerup="hold(null)"
          @pointerleave="hold(null)"
          @pointercancel="hold(null)"
        >{{ { up: '▲', down: '▼', left: '◀', right: '▶' }[d] }}</button>
      </div>
      <div class="ab">
        <button type="button" class="b-btn" aria-label="B: menu e voltar" @click="pressB">B</button>
        <button type="button" class="a-btn" aria-label="A: interagir e falar" @click="pressA">A</button>
      </div>
    </div>
  </div>
</template>
