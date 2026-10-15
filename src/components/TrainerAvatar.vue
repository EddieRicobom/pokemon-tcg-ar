<script setup lang="ts">
import { ref } from 'vue';
import { NAME_MAX, profile } from '../app/profile-store';
import { PLAYER_SPRITES, trainerSprite, trainerSpriteUrl } from '../core/trainer-sprites';

/** O seu treinador: sprite e nome. Toque no sprite para trocar (aparece nos Ginásios e no PvP da Caixa). */
const picking = ref(false);

function choose(id: string): void {
  profile.sprite = id;
  picking.value = false;
}
</script>

<template>
  <div class="tr-avatar">
    <button type="button" class="tr-avatar-pic" :aria-label="`Seu treinador: ${trainerSprite(profile.sprite).label}. Trocar`" :aria-expanded="picking" @click="picking = !picking">
      <img :src="trainerSpriteUrl(profile.sprite)" alt="" width="80" height="80" />
      <span>Trocar</span>
    </button>
    <label class="tr-avatar-name">
      <small>Seu nome</small>
      <input v-model.lazy="profile.name" type="text" :maxlength="NAME_MAX" autocomplete="nickname" />
    </label>
    <div v-if="picking" class="tr-picker" role="listbox" aria-label="Escolha o seu treinador">
      <button
        v-for="s in PLAYER_SPRITES"
        :key="s.id"
        type="button"
        role="option"
        :aria-selected="profile.sprite === s.id"
        :class="{ on: profile.sprite === s.id }"
        @click="choose(s.id)"
      >
        <img :src="trainerSpriteUrl(s.id)" alt="" width="56" height="56" loading="lazy" />
        <small>{{ s.label }}</small>
      </button>
    </div>
  </div>
</template>
