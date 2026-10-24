<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getCache } from '../app/services';
import { loadVillage } from '../app/village-store';
import { pokedex, recordSightings } from '../app/pokedex-store';
import type { DexSource } from '../core/pokedex';
import { DEX_COINS_PER_NEW, DEX_GENERATIONS, DEX_MILESTONES, DEX_SOURCE_LABELS_PT, generationProgress, hasSeen, seenCount } from '../core/pokedex';
import { LAST_DEX, typesOfDex } from '../core/species-filter';
import { TYPE_LABELS_PT } from '../core/pokemon-data';
import { speciesName } from '../core/survivor-evolution';
import { pokemonSpriteUrl } from '../ar/sprite-url';

/**
 * Pokédex do jogador: uma casa por espécie nacional (1 a 1025). A espécie só aparece (sprite, nome e tipos) depois
 * de encontrada de verdade; antes é uma casa vazia com o número. Ao abrir, junta o que já estava no aparelho
 * (cartas escaneadas e Digital Pokémon da Vila); Pins e Torre registram na hora em que o adversário aparece.
 */
const generation = ref(0);
const onlySeen = ref(false);
const selected = ref<number | null>(null);
const syncing = ref(true);

onMounted(async () => {
  try {
    const cards = await (await getCache()).list();
    recordSightings(cards.flatMap((c) => c.dexIds), 'carta');
    recordSightings(loadVillage().digital.instances.map((i) => i.dexId), 'vila');
  } catch {
    // Sem acesso ao cache: a Pokédex continua mostrando o que já estava registrado.
  } finally {
    syncing.value = false;
  }
});

const total = LAST_DEX;
const seen = computed(() => seenCount(pokedex.value));
const gens = computed(() => generationProgress(pokedex.value));
const range = computed(() => DEX_GENERATIONS[generation.value]!);
const tiles = computed(() => {
  const out: { id: number; seen: boolean }[] = [];
  for (let id = range.value.from; id <= range.value.to; id++) {
    const known = hasSeen(pokedex.value, id);
    if (!onlySeen.value || known) out.push({ id, seen: known });
  }
  return out;
});
const nextMilestone = computed(() => DEX_MILESTONES.find((m) => seen.value < m.count) ?? null);

const detail = computed(() => {
  const id = selected.value;
  if (id === null) return null;
  const entry = pokedex.value.seen[String(id)];
  if (!entry) return { id, name: '', types: [], entry: null };
  return { id, name: speciesName(id) || `Pokémon nº ${id}`, types: typesOfDex(id), entry };
});

function pad(id: number): string {
  return String(id).padStart(4, '0');
}
function toggle(id: number): void {
  selected.value = selected.value === id ? null : id;
}
function sourcesText(sources: readonly DexSource[]): string {
  return sources.map((source) => DEX_SOURCE_LABELS_PT[source]).join(' · ');
}
function dateOf(ms: number): string {
  return ms > 0 ? new Date(ms).toLocaleDateString('pt-BR') : 'data desconhecida';
}
</script>

<template>
  <div class="card pokedex">
    <h2>Pokédex <small class="count">{{ seen }} de {{ total }}</small></h2>
    <p class="note">
      Cada espécie que você encontra fica registrada aqui, em cartas escaneadas, moradores da Vila, adversários dos Pins e inimigos da Torre.
      Espécie nova rende {{ DEX_COINS_PER_NEW }} moedas.
      <template v-if="nextMilestone"> Próximo bônus: {{ nextMilestone.count }} espécies (+{{ nextMilestone.coins }} moedas).</template>
    </p>
    <div class="dex-bar" role="progressbar" :aria-valuemin="0" :aria-valuemax="total" :aria-valuenow="seen" aria-label="Espécies registradas"><b :style="{ width: (seen / total) * 100 + '%' }"></b></div>

    <div class="dex-gens" role="group" aria-label="Geração">
      <button v-for="(g, i) in gens" :key="g.label" type="button" :class="{ active: generation === i }" :aria-pressed="generation === i" @click="generation = i; selected = null">
        {{ g.label }}<small>{{ g.seen }}/{{ g.total }}</small>
      </button>
    </div>
    <label class="dex-only"><input v-model="onlySeen" type="checkbox" /> Mostrar só os encontrados</label>

    <p v-if="seen === 0 && !syncing" class="note">Nenhuma espécie ainda. Escaneie uma carta, jogue nos Pins ou entre na Torre para começar o registro.</p>

    <ul class="dex-grid" aria-label="Espécies">
      <li v-for="t in tiles" :key="t.id">
        <button type="button" :class="{ seen: t.seen, on: selected === t.id }" :disabled="!t.seen" :aria-label="t.seen ? `${speciesName(t.id) || 'Pokémon'} nº ${t.id}` : `Espécie nº ${t.id} ainda não encontrada`" :aria-pressed="selected === t.id" @click="toggle(t.id)">
          <img v-if="t.seen" :src="pokemonSpriteUrl(t.id)" alt="" loading="lazy" width="56" height="56" />
          <span v-else class="dex-unknown" aria-hidden="true">?</span>
          <small>{{ pad(t.id) }}</small>
        </button>
      </li>
    </ul>
    <p v-if="tiles.length === 0" class="note">Nada encontrado nesta geração ainda.</p>

    <div v-if="detail?.entry" class="dex-detail" role="status">
      <img :src="pokemonSpriteUrl(detail.id)" :alt="detail.name" width="96" height="96" />
      <div>
        <strong>{{ detail.name }} <small>nº {{ pad(detail.id) }}</small></strong>
        <p v-if="detail.types.length" class="dex-types"><span v-for="type in detail.types" :key="type" :class="`dex-type t-${type}`">{{ TYPE_LABELS_PT[type] }}</span></p>
        <p class="note">Visto {{ detail.entry.count }} {{ detail.entry.count === 1 ? 'vez' : 'vezes' }} · primeiro encontro em {{ dateOf(detail.entry.first) }}.</p>
        <p class="note">{{ sourcesText(detail.entry.sources) }}</p>
      </div>
    </div>
  </div>
</template>
