<script setup lang="ts">
import { ref } from 'vue';
import { useDialogFocus } from '../composables/useDialogFocus';
import { resetVisual, visual } from '../app/visual-settings';
import { SMOOTHING_HINTS_PT, SMOOTHING_LABELS_PT, SMOOTHING_MODES } from '../core/pixel-upscale';
import { WEATHER_MODE_LABELS_PT, WEATHER_MODES } from '../core/weather';

defineProps<{ battle?: boolean }>();
defineEmits<{ close: [] }>();
const dialogEl = ref<HTMLElement | null>(null);
useDialogFocus(dialogEl);
</script>

<template>
  <div ref="dialogEl" class="stage-sheet" role="dialog" tabindex="-1" aria-label="Suavização dos pixels" @keydown.esc.stop.prevent="$emit('close')" @pointerdown.stop @pointerup.stop @click.stop>
    <header>
      <strong>Suavização dos pixels</strong>
      <button type="button" class="link" @click="resetVisual">Restaurar</button>
      <button type="button" class="link" @click="$emit('close')">Fechar</button>
    </header>
    <section>
      <h4>Qualidade do GIF</h4>
      <div class="chips" role="group" aria-label="Suavização dos pixels">
        <button v-for="mode in SMOOTHING_MODES" :key="mode" type="button" :class="{ active: visual.smoothing === mode }" :aria-pressed="visual.smoothing === mode" @click="visual.smoothing = mode">
          {{ SMOOTHING_LABELS_PT[mode] }}
        </button>
      </div>
      <p class="hint">{{ SMOOTHING_HINTS_PT[visual.smoothing] }}</p>
    </section>
    <section v-if="!battle">
      <h4>Sombra no chão</h4>
      <div class="chips" role="group" aria-label="Sombra no chão">
        <button type="button" :class="{ active: visual.shadow }" :aria-pressed="visual.shadow" @click="visual.shadow = true">Ligada</button>
        <button type="button" :class="{ active: !visual.shadow }" :aria-pressed="!visual.shadow" @click="visual.shadow = false">Desligada</button>
      </div>
      <p class="hint">
        {{ visual.shadow ? 'Uma sombra suave e um brilho fino aparecem na carta, embaixo do Pokémon.' : 'Sem sombra nem brilho: mais leve para celulares fracos.' }}
      </p>
    </section>
    <section v-if="battle">
      <h4>Luz dos golpes</h4>
      <div class="chips" role="group" aria-label="Luz dos golpes">
        <button type="button" :class="{ active: visual.lighting }" :aria-pressed="visual.lighting" @click="visual.lighting = true">Ligada</button>
        <button type="button" :class="{ active: !visual.lighting }" :aria-pressed="!visual.lighting" @click="visual.lighting = false">Desligada</button>
      </div>
      <p class="hint">
        {{ visual.lighting ? 'Os golpes iluminam os Pokémon, o chão e o ambiente da câmera, e o ambiente real tinge os Pokémon um pouco.' : 'Sem luz dos golpes: mais leve para celulares fracos.' }}
      </p>
    </section>
    <section v-if="battle">
      <h4>Chão e terreno</h4>
      <div class="chips" role="group" aria-label="Chão e terreno">
        <button type="button" :class="{ active: visual.terrain }" :aria-pressed="visual.terrain" @click="visual.terrain = true">Ligado</button>
        <button type="button" :class="{ active: !visual.terrain }" :aria-pressed="!visual.terrain" @click="visual.terrain = false">Desligado</button>
      </div>
      <p class="hint">
        {{ visual.terrain ? 'Chão com relevo, grama, flores e trilha em pixel art. Golpes de fogo, água, grama, gelo e outros deixam marcas no terreno.' : 'Sem chão detalhado, relevo nem marcas dos golpes: mais leve para celulares fracos.' }}
      </p>
    </section>
    <section v-if="battle">
      <h4>Emoções e encontros</h4>
      <div class="chips" role="group" aria-label="Emoções e encontros">
        <button type="button" :class="{ active: visual.social }" :aria-pressed="visual.social" @click="visual.social = true">Ligado</button>
        <button type="button" :class="{ active: !visual.social }" :aria-pressed="!visual.social" @click="visual.social = false">Desligado</button>
      </div>
      <p class="hint">
        {{ visual.social ? 'De vez em quando os Pokémon se cumprimentam, dançam, brincam de pega-pega ou se desafiam, e mostram emoções em balões de emoji. Toque num Pokémon para ele reagir.' : 'Os Pokémon só passeiam, sem encontros nem balões.' }}
      </p>
    </section>
    <section v-if="battle">
      <h4>Clima</h4>
      <div class="chips" role="group" aria-label="Clima">
        <button v-for="m in WEATHER_MODES" :key="m" type="button" :class="{ active: visual.weather === m }" :aria-pressed="visual.weather === m" @click="visual.weather = m">{{ WEATHER_MODE_LABELS_PT[m] }}</button>
      </div>
      <p class="hint">
        {{ visual.weather === 'off' ? 'Sem clima: céu do jeito que a câmera mostra, mais leve para celulares fracos.' : visual.weather === 'ciclo' ? 'O tempo muda sozinho: sol, nuvens com sombra no chão, chuva com poças que refletem os Pokémon e neve que cai e cobre o chão.' : 'O clima fica fixo enquanto esta opção estiver escolhida.' }}
      </p>
    </section>
    <section v-if="battle">
      <h4>Som da batalha</h4>
      <div class="chips" role="group" aria-label="Som da batalha">
        <button type="button" :class="{ active: visual.sound }" :aria-pressed="visual.sound" @click="visual.sound = true">Ligado</button>
        <button type="button" :class="{ active: !visual.sound }" :aria-pressed="!visual.sound" @click="visual.sound = false">Desligado</button>
      </div>
      <p class="hint">
        {{ visual.sound ? 'Golpes, impactos, defesas, nocautes e uma fanfarra para o vencedor. Se não ouvir nada, confira o volume e o modo silencioso do celular.' : 'Batalha sem som.' }}
      </p>
    </section>
  </div>
</template>
