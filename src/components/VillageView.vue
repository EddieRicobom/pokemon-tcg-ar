<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { getCache, loadPinData } from '../app/services';
import { resolveTeam } from '../app/team';
import { savedTeam } from '../app/team-store';
import { profile } from '../app/profile-store';
import { loadVillage, saveVillage, villageMap } from '../app/village-store';
import { browserDecoders, loadCreatureEntries } from '../box/load-creatures';
import { dayKey } from '../core/trainer';
import { ACCESSORY_IDS, FURNITURE_IDS, itemDef, ITEMS, shopToday } from '../core/village/catalog';
import {
  buy, canFollow, count, craft, dailyHelp, describeCost, friendLevel, friendOf, giveGift, harvest, harvestCrop, HOUSE_LEVELS, itemName, pickUp, place,
  plant, pruneHarvest, RECIPES, sell, talk, tickCrops, upgradeHouse, water, wear,
} from '../core/village/life';
import type { ItemId } from '../core/village/life';
import type { Dir } from '../core/village/actors';
import type { PokemonType } from '../core/pokemon-data';
import { paintItemIcon } from '../village/item-art';
import { VillageGame } from '../village/village-game';
import type { VillageMon } from '../village/village-game';
import PokeBook from './PokeBook.vue';

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

type Sheet = null | 'menu' | 'build' | 'shop' | 'dress';
const sheet = ref<Sheet>(null);
type Tab = 'mochila' | 'fabricar' | 'colecao' | 'livro' | 'visual';
const tab = ref<Tab>('mochila');
const shopTab = ref<'comprar' | 'vender'>('comprar');
const dressFor = ref<string>('player');
const dialog = ref<{ id?: string; name: string; text: string; actions: { label: string; run: () => void }[] } | null>(null);
const giftPick = ref(false);
const welcome = ref(true);

let game: VillageGame | null = null;
let observer: ResizeObserver | null = null;
let saveTimer: ReturnType<typeof setInterval> | null = null;
let cropTimer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
const mons = ref<{ id: string; name: string; shiny: boolean; dexId?: number; thumb?: string }[]>([]);
const types = reactive(new Map<string, PokemonType[]>());

// ---- ícones em pixel art (PixelBuf → imagem), uma vez por item
const iconCache = new Map<string, string>();
function icon(id: string): string {
  let url = iconCache.get(id);
  if (url) return url;
  const buf = paintItemIcon(id);
  const c = document.createElement('canvas');
  c.width = buf.w;
  c.height = buf.h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(buf.w, buf.h);
  img.data.set(buf.data);
  ctx.putImageData(img, 0, 0);
  url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

function changed(): void {
  dirty = true;
}

function say(text: string): void {
  if (!text) return;
  toast.value = text;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ''), 2800);
}

function nameOf(id: string): string {
  return mons.value.find((m) => m.id === id)?.name ?? 'Pokémon';
}

const inventory = computed(() => ITEMS.filter((i) => count(state, i.id) > 0));
const giftable = computed(() => inventory.value.filter((i) => i.kind !== 'accessory'));
const nextHouse = computed(() => HOUSE_LEVELS[state.house + 1] ?? null);
const shopItems = computed(() => shopToday(day.value));
const collection = computed(() => FURNITURE_IDS.map((id) => ({ id, name: itemName(id), have: state.collected.includes(id), group: itemDef(id)?.group ?? '' })));
const craftable = computed(() => Object.keys(RECIPES));
const bookMons = computed(() => mons.value.map((m) => ({ id: m.id, name: m.name, types: types.get(m.id) ?? [], thumb: m.thumb, accessory: state.wear.mons[m.id] ?? null })));
const accessoriesOwned = computed(() => ACCESSORY_IDS.filter((id) => count(state, id) > 0));

// ---- controle
function hold(dir: Dir | null): void {
  game?.hold(dir);
}

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
let keyDir: Dir | null = null;
function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
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

function refreshDay(): string {
  const today = dayKey(new Date());
  if (today !== day.value) {
    day.value = today;
    pruneHarvest(state, today);
  }
  return today;
}

function pressA(): void {
  welcome.value = false;
  if (dialog.value) {
    if (dialog.value.actions.length === 0) dialog.value = null;
    return;
  }
  if (sheet.value || !game) return;
  const today = refreshDay();
  const t = game.target();
  if (t.kind === 'mon') {
    game.faceMe(t.id);
    const name = nameOf(t.id);
    const result = talk(state, t.id, name, types.get(t.id) ?? [], today, new Date().getHours(), Math.random);
    if (result.gained > 0) game.bubble(t.id, '❤️');
    let text = result.text;
    const help = dailyHelp(state, t.id, today, Math.random);
    if (help.items.length > 0) text += ` Ah! Achei isto pela Vila para você: ${help.items.map((h) => `${h.qty} ${itemName(h.item)}`).join(' e ')}.`;
    if (help.rare) {
      text += ` E... guardei um presente especial: ${itemName(help.rare)}!`;
      game.bubble(t.id, '🎁', 2600);
    }
    changed();
    openFriendDialog(t.id, text);
  } else if (t.kind === 'crop') {
    const now = Date.now();
    tickCrops(state, now);
    const ready = harvestCrop(state, t.x, t.y, Math.random);
    if (ready.ok) {
      say(ready.message);
      changed();
      return;
    }
    const r = water(state, t.x, t.y, now);
    say(r.message);
    if (r.ok) changed();
  } else if (t.kind === 'furniture') {
    dialog.value = {
      name: itemName(t.item),
      text: 'Quer guardar na mochila?',
      actions: [
        { label: 'Guardar', run: () => { say(pickUp(state, t.x, t.y).message); changed(); dialog.value = null; } },
        { label: 'Deixar', run: () => { dialog.value = null; } },
      ],
    };
  } else if (t.kind === 'plot') {
    sheet.value = 'build';
  } else if (t.kind === 'shop') {
    shopTab.value = 'comprar';
    sheet.value = 'shop';
  } else if (t.kind === 'tile') {
    const r = harvest(state, map, t.x, t.y, today, Math.random);
    say(r.message);
    if (r.ok) changed();
  }
}

function openFriendDialog(id: string, text: string): void {
  const f = friendOf(state, id);
  const lvl = friendLevel(f.points);
  const following = state.follower === id;
  const actions: { label: string; run: () => void }[] = [{ label: 'Presentear', run: () => { giftPick.value = true; } }];
  actions.push({ label: 'Acessório', run: () => { dialog.value = null; openDress(id); } });
  if (following) actions.push({ label: 'Pode passear', run: () => { state.follower = null; changed(); dialog.value = null; } });
  else if (canFollow(state, id)) actions.push({ label: 'Vem comigo!', run: () => { state.follower = id; changed(); game?.bubble(id, '🥰'); dialog.value = null; } });
  actions.push({ label: 'Tchau', run: () => { dialog.value = null; } });
  dialog.value = { id, name: `${nameOf(id)} · ${lvl.name} ${'♥'.repeat(lvl.hearts)}${'♡'.repeat(5 - lvl.hearts)}`, text, actions };
}

function give(item: ItemId): void {
  const id = dialog.value?.id;
  giftPick.value = false;
  if (!id) return;
  const r = giveGift(state, id, types.get(id) ?? [], item, refreshDay());
  if (r.ok) {
    changed();
    game?.bubble(id, r.gained >= 10 ? '😍' : '😊');
  }
  openFriendDialog(id, r.text);
}

function pressB(): void {
  welcome.value = false;
  if (giftPick.value) giftPick.value = false;
  else if (dialog.value) dialog.value = null;
  else sheet.value = sheet.value ? null : 'menu';
}

function act(result: { ok: boolean; message: string }, close = false): void {
  say(result.message);
  if (result.ok) {
    changed();
    if (close) sheet.value = null;
  }
}

function doPlace(item: ItemId): void {
  const spot = game?.frontSpot();
  if (!spot) return say('Fique de frente para um lugar livre.');
  act(place(state, map, item, spot.x, spot.y, (x, y) => game?.occupied(x, y) ?? false), true);
}

function doPlant(seed: ItemId): void {
  const spot = game?.frontSpot();
  if (!spot) return say('Fique de frente para a grama livre.');
  act(plant(state, map, seed, spot.x, spot.y, Date.now(), (x, y) => game?.occupied(x, y) ?? false), true);
}

function openDress(who: string): void {
  dressFor.value = who;
  sheet.value = 'dress';
}

function dress(acc: string | null): void {
  const r = wear(state, dressFor.value, acc);
  act(r);
  if (r.ok && dressFor.value !== 'player') game?.bubble(dressFor.value, acc ? '✨' : '🙂');
}

function fitsWho(acc: string): boolean {
  const slot = itemDef(acc)?.slot;
  return dressFor.value === 'player' ? slot !== 'pokemon' : slot !== 'player';
}

function friendRows() {
  return mons.value.map((m) => {
    const f = friendOf(state, m.id);
    const lvl = friendLevel(f.points);
    const req = f.request && f.request.day === day.value && !f.request.done ? f.request : null;
    return { ...m, lvl, points: f.points, following: state.follower === m.id, req };
  });
}

function tickClock(): void {
  const d = new Date();
  const h = d.getHours();
  clock.value = `${h >= 19 || h < 6 ? '🌙' : '☀️'} ${String(h).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function thumbOf(gif: VillageMon['gif']): string {
  const f = gif.frames[0];
  if (!f) return '';
  const c = document.createElement('canvas');
  c.width = gif.width;
  c.height = gif.height;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(gif.width, gif.height);
  img.data.set(f.rgba);
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
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
    mons.value = loaded.entries.map((e, i) => ({ id: e.info.id, name: e.info.name, shiny: e.info.shiny === true, dexId: e.info.dexId, thumb: thumbOf(villagers[i]!.gif) }));
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
  if (tickCrops(state, Date.now()) > 0) changed();
  cropTimer = setInterval(() => {
    if (tickCrops(state, Date.now()) > 0) changed();
  }, 5000);
  saveTimer = setInterval(() => {
    if (dirty) dirty = !saveVillage(state);
  }, 1500);
  // Tipos (presente favorito, opiniões do Livro) chegam em segundo plano; sem rede, ficam neutros.
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
  if (cropTimer) clearInterval(cropTimer);
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
        <span class="village-coins" aria-label="Moedas"><i aria-hidden="true">●</i>{{ state.coins }}</span>
        <span class="village-house">{{ HOUSE_LEVELS[state.house]?.name }}</span>
        <button type="button" class="village-close" aria-label="Sair da Vila" @click="emit('close')">✕</button>
      </header>
      <p v-if="loading" class="village-loading">{{ loading }}</p>
      <div v-else-if="welcome" class="village-welcome" @click="welcome = false">
        <strong>Bem-vindo à Vila, {{ profile.name }}!</strong>
        <span>Ande com as setas. <b>A</b> conversa, coleta, rega, colhe e abre a loja e a casa. <b>B</b> abre a mochila, o Livro dos Pokémon e mais.</span>
      </div>
      <p v-if="toast" class="village-toast" role="status">{{ toast }}</p>

      <div v-if="dialog" class="speech in-stage village-dialog" role="dialog" :aria-label="dialog.name">
        <div class="speech-box">
          <strong>{{ dialog.name }}</strong>
          <p>{{ dialog.text }}</p>
          <div v-if="giftPick" class="village-choices icons">
            <button v-for="i in giftable" :key="i.id" type="button" :title="i.name" @click="give(i.id)"><img :src="icon(i.id)" alt="" width="32" height="32" />{{ i.name }} ×{{ count(state, i.id) }}</button>
            <span v-if="giftable.length === 0">A mochila está vazia. Colete frutas, flores ou conchas!</span>
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
          <button type="button" class="primary" @click="act(upgradeHouse(state), true)">Construir</button>
        </template>
        <p v-else>Sua casa está completa! Decore o quintal com móveis.</p>
      </div>

      <div v-if="sheet === 'shop'" class="village-sheet" role="dialog" aria-label="Loja da Vila">
        <header>
          <div class="chips" role="tablist">
            <button type="button" role="tab" :class="{ active: shopTab === 'comprar' }" :aria-selected="shopTab === 'comprar'" @click="shopTab = 'comprar'">Comprar</button>
            <button type="button" role="tab" :class="{ active: shopTab === 'vender' }" :aria-selected="shopTab === 'vender'" @click="shopTab = 'vender'">Vender</button>
          </div>
          <span class="village-coins"><i aria-hidden="true">●</i>{{ state.coins }}</span>
          <button type="button" class="link" @click="sheet = null">Fechar</button>
        </header>
        <p class="hint">{{ shopTab === 'comprar' ? 'Sementes sempre; os móveis e acessórios mudam todo dia.' : 'A loja compra tudo o que você coleta e colhe.' }}</p>
        <ul v-if="shopTab === 'comprar'" class="item-grid">
          <li v-for="i in shopItems" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }}<small>{{ i.price }} moedas</small></span>
            <button type="button" :disabled="state.coins < i.price" @click="act(buy(state, i.id, day))">Comprar</button>
          </li>
        </ul>
        <ul v-else class="item-grid">
          <li v-for="i in inventory" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }} ×{{ count(state, i.id) }}<small>{{ i.sell }} cada</small></span>
            <button type="button" @click="act(sell(state, i.id))">Vender 1</button>
          </li>
          <li v-if="inventory.length === 0" class="hint">Nada para vender ainda.</li>
        </ul>
      </div>

      <div v-if="sheet === 'dress'" class="village-sheet" role="dialog" aria-label="Acessórios">
        <header><strong>Acessório {{ dressFor === 'player' ? 'para você' : `para ${nameOf(dressFor)}` }}</strong><button type="button" class="link" @click="sheet = null">Fechar</button></header>
        <ul class="item-grid">
          <li v-for="acc in accessoriesOwned.filter(fitsWho)" :key="acc">
            <img :src="icon(acc)" alt="" width="40" height="40" />
            <span>{{ itemName(acc) }}<small>{{ (dressFor === 'player' ? state.wear.player : state.wear.mons[dressFor]) === acc ? 'usando' : `você tem ${count(state, acc)}` }}</small></span>
            <button type="button" @click="dress(acc)">Usar</button>
          </li>
          <li v-if="accessoriesOwned.filter(fitsWho).length === 0" class="hint">Nenhum acessório para {{ dressFor === 'player' ? 'você' : 'Pokémon' }} ainda. A loja vende alguns todo dia; a coroa de flores se fabrica com 6 flores.</li>
        </ul>
        <button type="button" @click="dress(null)">Tirar o acessório</button>
      </div>

      <div v-if="sheet === 'menu'" class="village-sheet tall" role="dialog" aria-label="Menu da Vila">
        <header>
          <div class="chips" role="tablist">
            <button v-for="t in (['mochila', 'fabricar', 'colecao', 'livro', 'visual'] as const)" :key="t" type="button" role="tab" :class="{ active: tab === t }" :aria-selected="tab === t" @click="tab = t">
              {{ { mochila: 'Mochila', fabricar: 'Fabricar', colecao: 'Coleção', livro: 'Livro', visual: 'Visual' }[t] }}
            </button>
          </div>
          <button type="button" class="link" @click="sheet = null">Fechar</button>
        </header>

        <ul v-if="tab === 'mochila'" class="item-grid">
          <li v-for="i in inventory" :key="i.id">
            <img :src="icon(i.id)" alt="" width="40" height="40" />
            <span>{{ i.name }} ×{{ count(state, i.id) }}<small>{{ { material: 'Material', crop: 'Colheita', seed: 'Semente', furniture: i.group ?? 'Móvel', accessory: 'Acessório' }[i.kind] }}</small></span>
            <button v-if="i.kind === 'furniture'" type="button" @click="doPlace(i.id)">Colocar à frente</button>
            <button v-else-if="i.kind === 'seed'" type="button" @click="doPlant(i.id)">Plantar à frente</button>
            <button v-else-if="i.kind === 'accessory'" type="button" @click="openDress('player')">Usar</button>
          </li>
          <li v-if="inventory.length === 0" class="hint">Vazia. De frente para árvores, pedras, arbustos, flores, mato alto ou areia, toque em A para coletar.</li>
        </ul>

        <ul v-else-if="tab === 'fabricar'" class="item-grid">
          <li v-for="id in craftable" :key="id">
            <img :src="icon(id)" alt="" width="40" height="40" />
            <span>{{ itemName(id) }}<small>{{ describeCost(state, RECIPES[id]!) }}</small></span>
            <button type="button" @click="act(craft(state, id))">Fazer</button>
          </li>
        </ul>

        <div v-else-if="tab === 'colecao'">
          <p class="hint">{{ collection.filter((c) => c.have).length }} de {{ collection.length }} móveis. Alguns só vêm de presente dos melhores amigos.</p>
          <ul class="collection-grid">
            <li v-for="c in collection" :key="c.id" :class="{ have: c.have }" :title="c.have ? c.name : '???'">
              <img :src="icon(c.id)" alt="" width="40" height="40" />
              <small>{{ c.have ? c.name : '???' }}</small>
            </li>
          </ul>
        </div>

        <PokeBook v-else-if="tab === 'livro'" :mons="bookMons" :friends="state.friends" can-dress @accessory="openDress" />

        <div v-else>
          <p>Seu acessório: <strong>{{ state.wear.player ? itemName(state.wear.player) : 'nenhum' }}</strong></p>
          <button type="button" @click="openDress('player')">Escolher acessório</button>
          <h4>Amigos e pedidos de hoje</h4>
          <ul class="village-list">
            <li v-for="m in friendRows()" :key="m.id">
              <span>{{ m.name }}<small>{{ m.lvl.name }} · {{ '♥'.repeat(m.lvl.hearts) }}{{ '♡'.repeat(5 - m.lvl.hearts) }}{{ m.following ? ' · seguindo você' : '' }}{{ m.req ? ` · quer ${m.req.qty} ${itemName(m.req.item)}` : '' }}</small></span>
            </li>
            <li v-if="mons.length === 0" class="hint">Nenhum Pokémon na Vila ainda.</li>
          </ul>
        </div>
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
