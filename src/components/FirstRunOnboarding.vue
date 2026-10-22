<script setup lang="ts">
import { ref } from 'vue';
import { NAME_MAX, normalizeName, profile } from '../app/profile-store';
import { PLAYER_SPRITES, trainerSpriteUrl } from '../core/trainer-sprites';

const emit = defineEmits<{ done: [] }>();

const STORAGE_KEY = 'tcg-ar-onboarding-v1';
const step = ref<'profile' | 'scan'>('profile');
const name = ref(profile.name === 'Treinador' ? '' : profile.name);
const sprite = ref(profile.sprite);

function saveProfile(): void {
  profile.name = normalizeName(name.value);
  profile.sprite = sprite.value;
  step.value = 'scan';
}

function finish(destination: 'scan' | 'vila'): void {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* segue mesmo sem persistência */ }
  emit('done');
  window.location.hash = destination === 'vila' ? '#/vila' : '#/';
}
</script>

<template>
  <div class="first-run-overlay" role="dialog" aria-modal="true" aria-labelledby="first-run-title">
    <section class="card first-run-card">
      <template v-if="step === 'profile'">
        <p class="first-run-kicker">PRIMEIRA VEZ</p>
        <h2 id="first-run-title">Como vamos chamar você?</h2>
        <p class="note">Escolha seu nome e o treinador que aparece na Vila e nos desafios.</p>
        <label class="first-run-name">Nome do treinador
          <input v-model="name" :maxlength="NAME_MAX" type="text" autocomplete="nickname" placeholder="Treinador" @keyup.enter="saveProfile" />
        </label>
        <div class="first-run-sprites" role="listbox" aria-label="Escolha seu treinador">
          <button v-for="entry in PLAYER_SPRITES" :key="entry.id" type="button" role="option" :aria-selected="sprite === entry.id" :class="{ selected: sprite === entry.id }" @click="sprite = entry.id">
            <img :src="trainerSpriteUrl(entry.id)" alt="" width="64" height="64" />
            <span>{{ entry.label }}</span>
          </button>
        </div>
        <button type="button" class="primary" @click="saveProfile">Continuar</button>
      </template>
      <template v-else>
        <p class="first-run-kicker">PRIMEIROS PASSOS</p>
        <h2 id="first-run-title">Comece escaneando uma carta</h2>
        <p class="note">Aponte a câmera para uma carta física. O app só guarda a carta quando o reconhecimento real terminar.</p>
        <div class="first-run-actions">
          <button type="button" class="primary" @click="finish('scan')">📷 Escanear minha primeira carta</button>
          <button type="button" class="button" @click="finish('vila')">Não tenho cartas agora — ir para a Vila</button>
        </div>
        <p class="hint">Você pode escanear depois. A Vila entrega um companheiro digital para começar a explorar.</p>
      </template>
    </section>
  </div>
</template>
