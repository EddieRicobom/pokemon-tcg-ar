<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { cardCompanion, cardJourneys, cardJourneyError, commitCardEvolution } from '../app/card-evolution-store';
import { getCache, getDigitalSprite, resolveSpeciesByDexId } from '../app/services';
import { canEvolveCard, journeyFor } from '../core/card-evolution';
import { nextEvolutions, speciesName } from '../core/survivor-evolution';
import type { CachedCard } from '../cache/types';
import type { Friendship } from '../core/village/life';

const props = defineProps<{ friends: Readonly<Record<string, Friendship>> }>();
const emit = defineEmits<{ evolved: [card: CachedCard] }>();
const cards = ref<CachedCard[]>([]);
const selected = ref('');
const busy = ref(false);
const note = ref('');
const loading = ref(true);
const current = computed(() => {
  const card = cards.value.find((c) => c.id === selected.value);
  const mon = card && cardCompanion(card);
  if (!card || !mon) return null;
  const journey = journeyFor(cardJourneys.value, mon);
  return { card, mon, journey, points: props.friends[card.id]?.points ?? 0, next: nextEvolutions(journey.dexId) };
});
onMounted(async () => {
  try {
    cards.value = (await (await getCache()).list()).filter((c) => cardCompanion(c));
    selected.value = cards.value[0]?.id ?? '';
  } catch { note.value = 'Não consegui ler as cartas guardadas. Tente abrir a Fonte novamente.'; }
  finally { loading.value = false; }
});
async function evolve(nextDexId: number): Promise<void> {
  const c = current.value;
  if (!c || busy.value || !canEvolveCard(c.journey, c.points, nextDexId)) return;
  busy.value = true;
  note.value = 'Preparando a evolução…';
  try {
    const [species, sprite] = await Promise.all([resolveSpeciesByDexId(nextDexId), getDigitalSprite(nextDexId, c.card.shiny === true)]);
    if (!species || !sprite) {
      note.value = 'Não consegui carregar os dados ou o sprite da evolução. Seu progresso está guardado; tente de novo com conexão.';
      return;
    }
    // Reconfere amizade e provas depois da rede; nada é cobrado e o Pokémon mantém seu id.
    if (!commitCardEvolution(c.mon, props.friends[c.card.id]?.points ?? 0, nextDexId, species.cardId)) {
      note.value = cardJourneyError.value || 'Ainda faltam requisitos para evoluir.';
      return;
    }
    note.value = `✨ ${c.mon.name} evoluiu para ${species.name}! A amizade continua; as três vitórias recomeçam para a próxima evolução.`;
    emit('evolved', c.card);
  } catch { note.value = 'Não consegui preparar a evolução agora. Nenhum progresso foi perdido.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <div class="card-evolution-panel">
    <p>O Pokémon da sua carta também pode evoluir. Chegue à amizade máxima e vença com ele nos três modos. A evolução é gratuita.</p>
    <p v-if="loading" role="status">Lendo suas cartas…</p>
    <p v-else-if="!cards.length">Escaneie uma carta de Pokémon para começar.</p>
    <label v-else>Seu companheiro
      <select v-model="selected" :disabled="busy">
        <option v-for="card in cards" :key="card.id" :value="card.id">{{ cardCompanion(card)?.name }} · {{ card.setName }} {{ card.localId }}</option>
      </select>
    </label>
    <template v-if="current">
      <h3>{{ current.mon.name }}</h3>
      <p v-if="current.journey.history.length" class="note">Veio da sua carta de {{ current.card.name }}. A carta e sua ilustração continuam no álbum.</p>
      <ul class="evolution-checklist">
        <li :class="{ done: current.points >= 100 }">{{ current.points >= 100 ? '✓' : '○' }} Amizade máxima · {{ current.points }}/100</li>
        <li :class="{ done: current.journey.wins.survival }">{{ current.journey.wins.survival ? '✓' : '○' }} Survival · vencer o chefão final da Torre</li>
        <li :class="{ done: current.journey.wins.battle }">{{ current.journey.wins.battle ? '✓' : '○' }} Batalha normal · vencer sozinho ou com sua equipe</li>
        <li :class="{ done: current.journey.wins.pins }">{{ current.journey.wins.pins ? '✓' : '○' }} Pins · vencer na sua equipe contra o computador</li>
      </ul>
      <p v-if="!current.next.length">Esta forma não tem uma próxima evolução nos dados disponíveis.</p>
      <button v-for="next in current.next" :key="next" type="button" class="primary" :disabled="busy || !canEvolveCard(current.journey, current.points, next)" @click="evolve(next)">Evoluir para {{ speciesName(next) }}</button>
      <p class="note">As vitórias podem vir em qualquer ordem, antes ou depois da amizade máxima. Cada evolução exige novas vitórias. Na câmera, a carta original chama seu companheiro evoluído com uma chegada especial.</p>
    </template>
    <p v-if="note || cardJourneyError" role="status">{{ cardJourneyError || note }}</p>
  </div>
</template>

<style scoped>
.card-evolution-panel { display: grid; gap: 14px; padding: 4px; }
.card-evolution-panel p, h3 { margin: 0; }
label { display: grid; gap: 6px; }
select { width: 100%; max-width: 100%; padding: 10px; border-radius: 10px; }
.evolution-checklist { display: grid; gap: 10px; padding: 0; list-style: none; }
.evolution-checklist li { padding: 10px; background: #252b40; border-radius: 10px; }
.evolution-checklist .done { color: #b5ffdb; background: #163e36; }
</style>
