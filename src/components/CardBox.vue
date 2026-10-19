<script setup lang="ts">
/**
 * A Box (pedido do dono): as cartas guardadas organizadas em caixas de 30 espaços (6 × 5), como nos jogos Pokémon.
 * Toque numa carta para ver os detalhes e as ações; em "Mover", toque numa carta e depois no espaço de destino
 * (vazio: ela vai; ocupado: as duas trocam). A organização é só de lugares — as cartas continuam no cache.
 */
import { computed, ref, watch } from 'vue';
import CardMarks from './CardMarks.vue';
import { routeHref } from '../app/route';
import { loadBoxLayout, saveBoxLayout } from '../app/box-store';
import { addBox, BOX_SIZE, findCard, moveSlot, removeEmptyBox, renameBox, sortBox } from '../core/box-layout';
import type { BoxLayout, BoxSort, SlotRef } from '../core/box-layout';
import { isShiny } from '../core/shiny';
import type { CachedCard, CacheStatus } from '../cache/types';

/** `digital`: Digital Pokémon (não vem de carta física) — símbolo ✨, sem scan, sem AR sobre carta e sem remover daqui. */
type BoxCard = CachedCard & { status: CacheStatus; thumb?: string; icon?: string; digital?: boolean; originCardId?: string };

const props = defineProps<{
  cards: BoxCard[];
  /** Ids dos moradores da Vila, na ordem (o número aparece no canto do espaço). */
  team: string[];
  busyId: string | null;
  /** Cartas que passam no filtro/busca da tela; as outras ficam apagadas na grade. */
  visibleIds: Set<string>;
  statusText: Record<CacheStatus, string>;
}>();
const emit = defineEmits<{ toggleTeam: [id: string]; run: [id: string, action: 'prepare' | 'reload']; remove: [id: string] }>();

const byId = computed(() => new Map(props.cards.map((c) => [c.id, c])));
const layout = ref<BoxLayout>(loadBoxLayout(props.cards.map((c) => c.id)));
const current = ref(0);
// Cartas novas ou removidas: a organização se acerta sozinha (nova vai pro primeiro espaço livre).
watch(
  () => props.cards.map((c) => c.id).join('|'),
  () => {
    layout.value = loadBoxLayout(props.cards.map((c) => c.id));
    if (current.value >= layout.value.boxes.length) current.value = layout.value.boxes.length - 1;
  },
);
function commit(next: BoxLayout): void {
  layout.value = next;
  saveBoxLayout(next);
}

const box = computed(() => layout.value.boxes[current.value]!);
const filled = computed(() => box.value.slots.filter((s) => s !== null).length);
function go(delta: number): void {
  const n = layout.value.boxes.length;
  current.value = (current.value + delta + n) % n;
}

// Seleção e modo "Mover".
const selected = ref<string | null>(null);
const moving = ref(false);
const moveFrom = ref<SlotRef | null>(null);
const notice = ref('');
const selectedCard = computed(() => (selected.value ? byId.value.get(selected.value) ?? null : null));
/** Remover uma carta pede um segundo toque; o backup inclui a coleção local. */
const confirmRemove = ref<string | null>(null);

function tapSlot(slot: number): void {
  const id = box.value.slots[slot] ?? null;
  const here: SlotRef = { box: current.value, slot };
  if (moving.value) {
    if (!moveFrom.value) {
      if (!id) return;
      moveFrom.value = here;
      notice.value = `Toque no espaço para onde ${byId.value.get(id)?.name ?? 'a carta'} vai (pode trocar de caixa nas setas).`;
      return;
    }
    if (moveFrom.value.box === here.box && moveFrom.value.slot === here.slot) {
      moveFrom.value = null;
      notice.value = 'Toque numa carta para movê-la.';
      return;
    }
    commit(moveSlot(layout.value, moveFrom.value, here));
    moveFrom.value = null;
    notice.value = id ? 'Trocaram de lugar. Toque em outra carta para mover.' : 'Movida. Toque em outra carta para mover.';
    return;
  }
  selected.value = id && selected.value !== id ? id : null;
}

function toggleMove(): void {
  moving.value = !moving.value;
  moveFrom.value = null;
  selected.value = null;
  notice.value = moving.value ? 'Toque numa carta para movê-la.' : '';
}

const isSource = (slot: number) => moving.value && moveFrom.value?.box === current.value && moveFrom.value.slot === slot;

// Nome da caixa.
const renaming = ref(false);
const nameDraft = ref('');
function startRename(): void {
  nameDraft.value = box.value.name;
  renaming.value = true;
}
function finishRename(): void {
  commit(renameBox(layout.value, current.value, nameDraft.value));
  renaming.value = false;
}

function arrange(by: BoxSort): void {
  commit(sortBox(layout.value, current.value, by, (id) => ({ name: byId.value.get(id)?.name ?? id, dex: byId.value.get(id)?.dexIds[0] })));
}
function newBox(): void {
  commit(addBox(layout.value));
  current.value = layout.value.boxes.length - 1;
}
function dropEmptyBox(): void {
  commit(removeEmptyBox(layout.value, current.value));
  current.value = Math.min(current.value, layout.value.boxes.length - 1);
}

/** Leva a carta selecionada até a caixa onde ela está (usado quando a busca acha uma carta noutra caixa). */
function reveal(id: string): void {
  const where = findCard(layout.value, id);
  if (where) current.value = where.box;
}
defineExpose({ reveal });

const teamIndex = (id: string) => props.team.indexOf(id);
</script>

<template>
  <section class="pbox" aria-label="Box: suas cartas em caixas">
    <header class="pbox-head">
      <button type="button" class="pbox-arrow" aria-label="Caixa anterior" @click="go(-1)">‹</button>
      <form v-if="renaming" class="pbox-rename" @submit.prevent="finishRename">
        <input v-model="nameDraft" type="text" maxlength="24" aria-label="Nome da caixa" autofocus @blur="finishRename" />
      </form>
      <button v-else type="button" class="pbox-name" title="Toque para dar um nome à caixa" @click="startRename">
        {{ box.name }}<small>{{ filled }}/{{ BOX_SIZE }} · caixa {{ current + 1 }} de {{ layout.boxes.length }}</small>
      </button>
      <button type="button" class="pbox-arrow" aria-label="Próxima caixa" @click="go(1)">›</button>
    </header>

    <nav v-if="layout.boxes.length > 1" class="pbox-selector" aria-label="Selecionar caixa">
      <button
        v-for="(entry, index) in layout.boxes"
        :key="index"
        type="button"
        :aria-pressed="current === index"
        @click="current = index"
      >{{ index + 1 }} · {{ entry.name }}</button>
    </nav>

    <div class="pbox-grid" role="grid" :aria-label="`${box.name}: ${filled} de ${BOX_SIZE} espaços ocupados`">
      <button
        v-for="(id, slot) in box.slots"
        :key="slot"
        type="button"
        role="gridcell"
        class="pbox-cell"
        :class="{
          filled: !!id,
          selected: !!id && selected === id,
          source: isSource(slot),
          target: moving && !!moveFrom && !isSource(slot),
          dim: !!id && !visibleIds.has(id),
          shiny: !!id && !!byId.get(id) && isShiny(byId.get(id)!),
          incomplete: !!id && byId.get(id)?.status !== 'completo',
          digital: !!id && byId.get(id)?.digital === true,
        }"
        :aria-label="id ? `${byId.get(id)?.name ?? id}${byId.get(id)?.digital ? ', Digital Pokémon' : ''}${teamIndex(id) >= 0 ? ', morador da Vila' : ''}` : `Espaço ${slot + 1} vazio`"
        @click="tapSlot(slot)"
      >
        <template v-if="id && byId.get(id)">
          <img v-if="byId.get(id)!.icon || byId.get(id)!.thumb" :src="byId.get(id)!.icon ?? byId.get(id)!.thumb" :class="{ card: !byId.get(id)!.icon }" alt="" />
          <span v-else class="pbox-noimg" aria-hidden="true">?</span>
          <span v-if="teamIndex(id) >= 0" class="pbox-team" aria-hidden="true">{{ teamIndex(id) + 1 }}</span>
          <span v-if="byId.get(id)!.digital" class="pbox-digital" aria-hidden="true">✨</span>
        </template>
      </button>
    </div>

    <div class="pbox-tools">
      <button type="button" :class="{ active: moving }" :aria-pressed="moving" @click="toggleMove">{{ moving ? 'Concluir' : '↔ Mover' }}</button>
      <button type="button" :disabled="moving" @click="arrange('pokedex')">Arrumar pela Pokédex</button>
      <button type="button" :disabled="moving" @click="arrange('nome')">Arrumar por nome</button>
      <button type="button" :disabled="moving" @click="newBox">+ Caixa</button>
      <button v-if="filled === 0 && layout.boxes.length > 1" type="button" @click="dropEmptyBox">Apagar esta caixa</button>
    </div>
    <p v-if="notice" class="pbox-notice" role="status">{{ notice }}</p>
    <p class="pbox-legend">
      Número no canto = posição entre moradores da Vila · ✨ = Digital Pokémon (sem carta física) · borda tracejada = carta ainda não completa · apagadas = fora do filtro.
    </p>

    <div v-if="selectedCard && !moving" class="pbox-detail" role="region" :aria-label="`Detalhes de ${selectedCard.name}`">
      <img v-if="selectedCard.thumb" :src="selectedCard.thumb" :alt="`Carta ${selectedCard.name}`" width="72" height="100" />
      <div>
        <template v-if="selectedCard.digital">
          <strong>{{ selectedCard.name }} <span class="badge digital">✨ Digital</span></strong>
          <span>Pokédex nº {{ selectedCard.dexIds[0] }} · carta de origem {{ selectedCard.originCardId }}</span>
          <small>🔒 Sem scan e sem AR (não é uma carta física). Batalha na Caixa como qualquer outro.</small>
          <div class="actions row">
            <button type="button" :class="{ active: teamIndex(selectedCard.id) >= 0 }" @click="emit('toggleTeam', selectedCard.id)">
              {{ teamIndex(selectedCard.id) >= 0 ? '✓ Na Vila · tirar' : '+ Adicionar à Vila' }}
            </button>
          </div>
        </template>
        <template v-else>
        <strong>{{ selectedCard.name }} <CardMarks :card="selectedCard" /></strong>
        <span>{{ selectedCard.setName }} · {{ selectedCard.localId }}/{{ selectedCard.setOfficial }}{{ selectedCard.dexIds[0] ? ` · Pokédex nº ${selectedCard.dexIds[0]}` : '' }}</span>
        <span class="badge" :class="selectedCard.status">{{ statusText[selectedCard.status] }}</span>
        <div class="actions card-actions">
          <button v-if="selectedCard.status !== 'completo'" type="button" :disabled="busyId === selectedCard.id" @click="emit('run', selectedCard.id, 'prepare')">Carregar</button>
          <button v-if="selectedCard.status !== 'completo'" type="button" :disabled="busyId === selectedCard.id" @click="emit('run', selectedCard.id, 'reload')">Recarregar</button>
          <a class="button" :href="routeHref('escanear', selectedCard.id)">Ver em AR</a>
          <button type="button" :class="{ active: teamIndex(selectedCard.id) >= 0 }" @click="emit('toggleTeam', selectedCard.id)">
            {{ teamIndex(selectedCard.id) >= 0 ? '✓ Na Vila · tirar' : '+ Adicionar à Vila' }}
          </button>
          <button v-if="confirmRemove !== selectedCard.id" type="button" :disabled="busyId === selectedCard.id" @click="confirmRemove = selectedCard.id">Apagar…</button>
          <template v-else>
            <button type="button" class="danger" @click="emit('remove', selectedCard.id); selected = null; confirmRemove = null">Apagar {{ selectedCard.name }}</button>
            <button type="button" @click="confirmRemove = null">Não</button>
          </template>
        </div>
        </template>
      </div>
    </div>
  </section>
</template>
