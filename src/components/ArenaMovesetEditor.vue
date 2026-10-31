<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { pokemonSpriteUrl } from '../ar/sprite-url';
import type { ArenaMember } from '../app/arena-members';
import { cachedMoveData, loadLearnset, loadMoveData } from '../app/learnset-service';
import { movesetBook, saveMoves, savedMoves } from '../app/moveset-store';
import { loadProfile } from '../app/pokemon-data-service';
import { compatibleMoves, coverageGaps, effectSummary, LEARN_METHOD_LABELS_PT, MOVESET_SIZE, moveChosenMove, suggestMoveset, toChosenMove, toggleChosenMove, unusableReason } from '../core/moveset';
import type { ChosenMove, LearnableMove, Learnset, MoveDetail } from '../core/moveset';
import { DAMAGE_CLASS_LABELS_PT, POKEMON_TYPES, prettyMoveName, TYPE_COLORS, TYPE_LABELS_PT } from '../core/pokemon-data';
import type { DamageClass, PokemonProfile, PokemonType } from '../core/pokemon-data';

const props = defineProps<{ members: ArenaMember[] }>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type LearnsetState = { state: 'loading' } | { state: 'ok'; value: Learnset } | { state: 'error'; message: string };
const learnsets = reactive(new Map<number, LearnsetState>());
const profiles = reactive(new Map<number, PokemonProfile | null>());
const moveData = reactive<Record<string, MoveDetail>>(cachedMoveData(storage()));
const failedMoves = ref<string[]>([]);
const loadingMoves = ref(false);
const editing = ref<string | null>(null);
const notice = ref('');
const search = ref('');
const typeFilter = ref<PokemonType | ''>('');
const classFilter = ref<DamageClass | ''>('');
const onlyUsable = ref(true);

async function ensureLearnset(dexId: number): Promise<void> {
  const current = learnsets.get(dexId);
  if (current && current.state !== 'error') return;
  learnsets.set(dexId, { state: 'loading' });
  const result = await loadLearnset(dexId, { storage: storage() });
  learnsets.set(dexId, result.ok ? { state: 'ok', value: result.value } : { state: 'error', message: result.message });
}

/** Tira dos conjuntos salvos o que a espécie deixou de aprender (o learnset é a referência). */
function pruneSaved(member: ArenaMember): void {
  if (member.dexId === undefined) return;
  const ls = learnsets.get(member.dexId);
  if (ls?.state !== 'ok') return;
  const saved = savedMoves(member.id, member.dexId);
  const kept = compatibleMoves(saved, ls.value);
  if (kept.length !== saved.length) {
    saveMoves(member.id, member.dexId, kept);
    notice.value = `${member.name}: ${saved.length - kept.length} golpe(s) salvo(s) saíram porque a espécie não os aprende.`;
  }
}

watch(() => props.members.map((m) => `${m.id}:${m.dexId ?? ''}`).join('|'), async () => {
  if (editing.value && !props.members.some((m) => m.id === editing.value)) editing.value = null;
  for (const member of props.members) {
    if (member.dexId === undefined) continue;
    await ensureLearnset(member.dexId);
    pruneSaved(member);
  }
}, { immediate: true });

const editingMember = computed(() => props.members.find((m) => m.id === editing.value) ?? null);
const editingLearnset = computed(() => {
  const dex = editingMember.value?.dexId;
  return dex === undefined ? null : learnsets.get(dex) ?? null;
});
const learnsetOk = computed(() => (editingLearnset.value?.state === 'ok' ? editingLearnset.value.value : null));
const learnsetMessage = computed(() => (editingLearnset.value?.state === 'error' ? editingLearnset.value.message : ''));
const chosen = computed<ChosenMove[]>(() => {
  void movesetBook.value;
  const m = editingMember.value;
  return m ? savedMoves(m.id, m.dexId) : [];
});

async function loadDetails(learnset: Learnset): Promise<void> {
  loadingMoves.value = true;
  failedMoves.value = [];
  const { failed } = await loadMoveData(learnset.moves, { storage: storage() }, (slug, move) => { moveData[slug] = move; });
  failedMoves.value = failed;
  loadingMoves.value = false;
}

async function edit(member: ArenaMember): Promise<void> {
  notice.value = '';
  if (editing.value === member.id) {
    editing.value = null;
    return;
  }
  editing.value = member.id;
  search.value = '';
  typeFilter.value = '';
  classFilter.value = '';
  if (member.dexId === undefined) return;
  await ensureLearnset(member.dexId);
  if (!profiles.has(member.dexId)) void loadProfile(member.dexId, { storage: storage() }).then((p) => profiles.set(member.dexId!, p));
  const ls = learnsets.get(member.dexId);
  if (ls?.state === 'ok' && editing.value === member.id) await loadDetails(ls.value);
}

interface Row {
  ref: LearnableMove;
  data: MoveDetail | null;
  choice: ChosenMove | null;
  reason: string | null;
}
const rows = computed<Row[]>(() => {
  const ls = editingLearnset.value;
  if (ls?.state !== 'ok') return [];
  const q = search.value.trim().toLowerCase();
  return ls.value.moves.flatMap((item) => {
    const data = moveData[item.slug] ?? null;
    const choice = data ? toChosenMove(item.slug, data) : null;
    const reason = data ? unusableReason(data) : null;
    if (onlyUsable.value && data && !choice) return [];
    if (typeFilter.value && data?.type !== typeFilter.value) return [];
    if (classFilter.value && data?.damageClass !== classFilter.value) return [];
    if (q && !`${data?.name ?? ''} ${item.slug.replace(/-/g, ' ')}`.toLowerCase().includes(q)) return [];
    return [{ ref: item, data, choice, reason }];
  });
});
const missingData = computed(() => {
  const ls = editingLearnset.value;
  return ls?.state === 'ok' ? ls.value.moves.filter((m) => !moveData[m.slug]).length : 0;
});

function persist(member: ArenaMember, moves: ChosenMove[]): void {
  if (member.dexId === undefined) return;
  notice.value = saveMoves(member.id, member.dexId, moves) ? 'Golpes salvos neste aparelho.' : 'O aparelho não deixou salvar: os golpes valem só até fechar o app.';
}

function toggle(row: Row): void {
  const member = editingMember.value;
  if (!member || !row.choice) return;
  const next = toggleChosenMove(chosen.value, row.choice);
  if (next.full) {
    notice.value = `Já há ${MOVESET_SIZE} golpes. Tire um para colocar outro.`;
    return;
  }
  persist(member, next.moves);
}

function reorder(slug: string, delta: -1 | 1): void {
  const member = editingMember.value;
  if (member) persist(member, moveChosenMove(chosen.value, slug, delta));
}

function remove(slug: string): void {
  const member = editingMember.value;
  if (member) persist(member, chosen.value.filter((m) => m.slug !== slug));
}

const editingProfile = computed(() => {
  const dex = editingMember.value?.dexId;
  return dex === undefined ? null : profiles.get(dex) ?? null;
});

function suggest(): void {
  const member = editingMember.value;
  if (!member) return;
  const options = rows.value.length > 0 && !search.value && !typeFilter.value && !classFilter.value
    ? rows.value.flatMap((r) => (r.choice ? [r.choice] : []))
    : (editingLearnset.value?.state === 'ok' ? editingLearnset.value.value.moves : []).flatMap((item) => {
      const data = moveData[item.slug];
      const choice = data ? toChosenMove(item.slug, data) : null;
      return choice ? [choice] : [];
    });
  if (options.length === 0) {
    notice.value = 'Ainda não há golpes com dados para sugerir.';
    return;
  }
  const profile = editingProfile.value;
  const physical = profile ? profile.stats.attack >= profile.stats.spAttack : true;
  persist(member, suggestMoveset(options, profile?.types ?? [], physical));
  if (!profile) notice.value = 'Golpes salvos. Sem os atributos da PokéAPI, a sugestão não considerou os tipos do Pokémon.';
}

function methodText(lm: LearnableMove): string {
  return lm.methods.map((m) => (m === 'level-up' && lm.level ? `Nv. ${lm.level}` : LEARN_METHOD_LABELS_PT[m])).join(' · ');
}

/** Tipos que nenhum golpe de dano do conjunto acerta com super efetivo (só com 2 ou mais golpes de dano). */
const gaps = computed(() => (chosen.value.filter((m) => m.damageClass !== 'status').length >= 2 ? coverageGaps(chosen.value) : []));

function rowEffects(row: Row): string[] {
  return row.data ? effectSummary(row.data.effect) : [];
}

function memberMoves(member: ArenaMember): ChosenMove[] {
  void movesetBook.value;
  return savedMoves(member.id, member.dexId);
}

function retry(): void {
  const ls = editingLearnset.value;
  if (ls?.state === 'ok') void loadDetails(ls.value);
  else if (editingMember.value) {
    const member = editingMember.value;
    editing.value = null;
    void edit(member);
  }
}
</script>

<template>
  <div class="moveset-editor">
    <p v-if="members.length === 0" class="hint">Escolha a equipe acima para montar os golpes.</p>
    <ul class="ms-members">
      <li v-for="member in members" :key="member.id" class="ms-member" :class="{ open: editing === member.id }">
        <div class="ms-head">
          <img v-if="member.dexId" :src="pokemonSpriteUrl(member.dexId, member.shiny)" alt="" loading="lazy" />
          <div class="ms-title">
            <strong>{{ member.name }}</strong>
            <small v-if="member.dexId === undefined" class="warn">Sem número da Pokédex: não dá para buscar golpes.</small>
            <small v-else-if="learnsets.get(member.dexId)?.state === 'error'" class="warn">Lista de golpes indisponível (PokéAPI).</small>
            <small v-else>{{ memberMoves(member).length }}/{{ MOVESET_SIZE }} golpes</small>
          </div>
          <button type="button" :disabled="member.dexId === undefined" @click="edit(member)">{{ editing === member.id ? 'Fechar' : 'Escolher golpes' }}</button>
        </div>
        <ol class="ms-slots" :aria-label="`Golpes de ${member.name}`">
          <li v-for="slot in MOVESET_SIZE" :key="slot" :class="{ empty: !memberMoves(member)[slot - 1] }">
            <template v-if="memberMoves(member)[slot - 1]">
              <span class="ms-type" :style="{ '--type': TYPE_COLORS[memberMoves(member)[slot - 1]!.type] }">{{ TYPE_LABELS_PT[memberMoves(member)[slot - 1]!.type] }}</span>
              <span class="ms-name">{{ memberMoves(member)[slot - 1]!.name }}</span>
              <small>{{ memberMoves(member)[slot - 1]!.damageClass === 'status' ? 'Status' : `Poder ${memberMoves(member)[slot - 1]!.power}` }} · PP {{ memberMoves(member)[slot - 1]!.pp }}</small>
            </template>
            <span v-else class="ms-name">— vazio —</span>
          </li>
        </ol>

        <section v-if="editing === member.id" class="ms-picker" :aria-label="`Escolher golpes de ${member.name}`">
          <p v-if="editingLearnset?.state === 'loading'" class="hint" role="status">Buscando a lista de golpes na PokéAPI…</p>
          <div v-else-if="editingLearnset?.state === 'error'" class="ms-error" role="alert">
            <span>{{ learnsetMessage }} Sem a lista, nenhum golpe pode ser escolhido.</span>
            <button type="button" @click="retry">Tentar de novo</button>
          </div>
          <template v-else-if="learnsetOk">
            <div v-if="chosen.length > 0" class="ms-chosen">
              <span class="ms-chosen-title">Ordem no menu de batalha</span>
              <div v-for="(move, i) in chosen" :key="move.slug" class="ms-chosen-row">
                <b>{{ i + 1 }}</b><span class="ms-type" :style="{ '--type': TYPE_COLORS[move.type] }">{{ TYPE_LABELS_PT[move.type] }}</span>
                <span class="ms-name">{{ move.name }}</span>
                <button type="button" aria-label="Subir" :disabled="i === 0" @click="reorder(move.slug, -1)">↑</button>
                <button type="button" aria-label="Descer" :disabled="i === chosen.length - 1" @click="reorder(move.slug, 1)">↓</button>
                <button type="button" :aria-label="`Tirar ${move.name}`" @click="remove(move.slug)">✕</button>
              </div>
            </div>
            <p v-if="gaps.length > 0" class="ms-gaps"><strong>Cobertura:</strong> nenhum golpe acerta com super efetivo os tipos
              <span v-for="t in gaps" :key="t" class="ms-type" :style="{ '--type': TYPE_COLORS[t] }">{{ TYPE_LABELS_PT[t] }}</span></p>
            <p class="note">Golpes que {{ member.name }} aprende em {{ prettyMoveName(learnsetOk.versionGroup) }} (PokéAPI): por nível, MT, ovo ou tutor. Toque para pôr ou tirar; salva na hora.</p>
            <div class="ms-tools">
              <input v-model="search" type="search" placeholder="Buscar golpe" aria-label="Buscar golpe" />
              <select v-model="typeFilter" aria-label="Filtrar por tipo">
                <option value="">Todos os tipos</option>
                <option v-for="t in POKEMON_TYPES" :key="t" :value="t">{{ TYPE_LABELS_PT[t] }}</option>
              </select>
              <select v-model="classFilter" aria-label="Filtrar por categoria">
                <option value="">Todas as categorias</option>
                <option value="physical">Físico</option>
                <option value="special">Especial</option>
                <option value="status">Status</option>
              </select>
              <label><input v-model="onlyUsable" type="checkbox" /> Só os que dá para usar</label>
              <button type="button" @click="suggest">Sugerir 4</button>
            </div>
            <p v-if="loadingMoves" class="hint" role="status">Carregando os números dos golpes… faltam {{ missingData }}.</p>
            <div v-if="!loadingMoves && failedMoves.length > 0" class="ms-error" role="alert">
              <span>{{ failedMoves.length }} golpe(s) não carregaram da PokéAPI e ficam sem dados.</span>
              <button type="button" @click="retry">Tentar de novo</button>
            </div>
            <p v-if="notice" class="ms-notice" role="status">{{ notice }}</p>
            <ul class="ms-list">
              <li v-for="row in rows" :key="row.ref.slug">
                <button
                  type="button"
                  class="ms-row"
                  :class="{ picked: chosen.some((c) => c.slug === row.ref.slug), off: !row.choice }"
                  :disabled="!row.choice"
                  :aria-pressed="chosen.some((c) => c.slug === row.ref.slug)"
                  @click="toggle(row)"
                >
                  <span v-if="row.data?.type" class="ms-type" :style="{ '--type': TYPE_COLORS[row.data.type] }">{{ TYPE_LABELS_PT[row.data.type] }}</span>
                  <span v-else class="ms-type">?</span>
                  <span class="ms-row-main">
                    <span class="ms-name">{{ row.data?.name ?? prettyMoveName(row.ref.slug) }}</span>
                    <small>{{ methodText(row.ref) }}<template v-if="row.data?.damageClass"> · {{ DAMAGE_CLASS_LABELS_PT[row.data.damageClass] }}</template></small>
                    <small v-if="rowEffects(row).length" class="ms-effect">{{ rowEffects(row).join(' · ') }}</small>
                    <small v-if="row.choice && row.data && row.data.unsupported.length" class="warn">Não simulado: {{ row.data.unsupported.join(', ') }}.</small>
                    <small v-if="row.reason" class="warn">{{ row.reason }}</small>
                    <small v-else-if="!row.data" class="warn">Sem dados ainda.</small>
                  </span>
                  <span v-if="row.data" class="ms-stats">
                    <span><small>Poder</small>{{ row.data.power ?? '—' }}</span>
                    <span><small>Prec.</small>{{ row.data.accuracy ?? '—' }}</span>
                    <span><small>PP</small>{{ row.data.pp ?? '—' }}</span>
                  </span>
                  <span v-if="chosen.some((c) => c.slug === row.ref.slug)" class="ms-check" aria-hidden="true">✓</span>
                </button>
              </li>
            </ul>
            <p v-if="rows.length === 0 && !loadingMoves" class="hint">Nenhum golpe com esse filtro.</p>
          </template>
        </section>
      </li>
    </ul>
    <p v-if="notice && !editing" class="ms-notice" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
.moveset-editor { display: grid; gap: .6rem; }
.ms-members { display: grid; gap: .6rem; margin: 0; padding: 0; list-style: none; }
.ms-member { display: grid; gap: .5rem; padding: .7rem; border: 1px solid var(--line); border-radius: .85rem; background: rgba(12, 17, 34, .55); }
.ms-member.open { border-color: var(--accent); }
.ms-head { display: flex; align-items: center; gap: .6rem; }
.ms-head img { width: 48px; height: 48px; object-fit: contain; image-rendering: pixelated; }
.ms-title { display: grid; flex: 1; min-width: 0; }
.ms-title small { color: var(--muted); }
.warn { color: #ffb36b !important; }
.ms-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .35rem; margin: 0; padding: 0; list-style: none; }
.ms-slots li { display: grid; gap: .1rem; padding: .4rem .5rem; border: 1px solid var(--line); border-radius: .6rem; font-size: .85rem; min-width: 0; }
.ms-slots li.empty { border-style: dashed; color: var(--muted); }
.ms-slots small { color: var(--muted); }
.ms-type { justify-self: start; display: inline-block; padding: .05rem .4rem; border-radius: 99px; background: var(--type, #666); color: #fff; font-size: .68rem; font-weight: 800; text-shadow: 0 1px 1px rgba(0, 0, 0, .45); white-space: nowrap; }
.ms-name { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.ms-picker { display: grid; gap: .5rem; padding-top: .4rem; border-top: 1px solid var(--line); }
.ms-picker .note { margin: 0; }
.ms-chosen { display: grid; gap: .3rem; }
.ms-chosen-title { color: var(--gold); font-size: .72rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
.ms-chosen-row { display: grid; grid-template-columns: auto auto 1fr auto auto auto; align-items: center; gap: .35rem; }
.ms-chosen-row button { min-width: 2rem; padding: .2rem .4rem; }
.ms-tools { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.ms-tools input[type='search'] { flex: 1 1 9rem; min-width: 0; }
.ms-tools label { display: inline-flex; align-items: center; gap: .3rem; font-size: .85rem; }
.ms-error { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .5rem .6rem; border: 1px solid #ffb36b; border-radius: .6rem; color: #ffd2a6; font-size: .88rem; }
.ms-notice { margin: 0; color: #a7ebc3; font-size: .88rem; }
.ms-list { display: grid; gap: .3rem; max-height: 22rem; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
.ms-row { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: .5rem; width: 100%; padding: .45rem .55rem; border: 1px solid var(--line); border-radius: .6rem; color: inherit; font: inherit; text-align: left; background: rgba(255, 255, 255, .03); }
.ms-row.picked { border-color: #68bd91; background: rgba(104, 189, 145, .14); }
.ms-row.off { opacity: .6; }
.ms-row-main { display: grid; min-width: 0; }
.ms-row-main small { color: var(--muted); font-size: .74rem; }
.ms-stats { display: grid; grid-template-columns: repeat(3, 2.4rem); gap: .2rem; text-align: center; font-size: .85rem; font-weight: 700; }
.ms-stats small { display: block; color: var(--muted); font-size: .62rem; font-weight: 600; }
.ms-check { color: #68bd91; font-weight: 900; }
.ms-effect { color: #9fd3ff !important; }
.ms-gaps { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem; margin: 0; padding: .45rem .55rem; border: 1px dashed #ffb36b; border-radius: .6rem; font-size: .82rem; }
</style>
