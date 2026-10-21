<script setup lang="ts">
import { computed, ref } from 'vue';
import { effectiveVisual } from '../app/visual-settings';

const props = defineProps<{ spriteUrl: string }>();
const emit = defineEmits<{ finish: [] }>();

const chapters = [
  { title: 'Um desejo diferente', text: 'A moeda toca a água. O som ecoa por baixo da praça, profundo demais para vir de uma fonte tão pequena.' },
  { title: 'A sombra nas nuvens', text: 'As luzes da cidade tremulam. Uma sombra imensa atravessa o céu e os moradores erguem os olhos, em silêncio.' },
  { title: 'As cores voltam ao céu', text: 'Ho-Oh surge acima dos telhados. Suas asas abrem um rastro de luz, e penas douradas caem devagar sobre a Vila.' },
  { title: 'A cidade inteira testemunha', text: 'Ele dá uma volta sobre a praça e segue em direção ao horizonte. Por um instante, cada janela reflete as cores do arco-íris.' },
] as const;

const step = ref(0);
const chapter = computed(() => chapters[step.value]!);

function advance(): void {
  if (step.value + 1 < chapters.length) step.value++;
  else emit('finish');
}
</script>

<template>
  <section class="hooh-cutscene" :class="{ still: !effectiveVisual.villageFx }" role="dialog" aria-modal="true" aria-labelledby="hooh-title" aria-describedby="hooh-text">
    <div class="hooh-sky" aria-hidden="true">
      <div class="hooh-sun"></div>
      <div class="hooh-rainbow"></div>
      <div class="hooh-flight">
        <img v-if="props.spriteUrl" :src="props.spriteUrl" alt="Ho-Oh, o Pokémon Arco-Íris, voando sobre a cidade" />
        <span v-else class="hooh-fallback" aria-label="Ho-Oh">🪽</span>
      </div>
      <div class="hooh-city far"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="hooh-city near"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="hooh-feathers">✦　✧　✦　✧　✦</div>
    </div>
    <article class="hooh-story">
      <small>A LENDA DA FONTE · {{ step + 1 }}/{{ chapters.length }}</small>
      <h2 id="hooh-title">{{ chapter.title }}</h2>
      <p id="hooh-text">{{ chapter.text }}</p>
      <div class="hooh-progress" aria-label="Progresso da cutscene">
        <span v-for="(_, index) in chapters" :key="index" :class="{ current: index === step, passed: index < step }"></span>
      </div>
      <div class="hooh-actions">
        <button type="button" class="hooh-skip" @click="emit('finish')">Pular cena</button>
        <button type="button" class="hooh-next" @click="advance">{{ step + 1 < chapters.length ? 'Continuar' : 'Voltar à Vila' }}</button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.hooh-cutscene { position: absolute; z-index: 30; inset: 0; display: grid; grid-template-rows: minmax(0, 1fr) auto; overflow: hidden; color: #fff9e6; background: #10142d; }
.hooh-sky { position: relative; min-height: 0; overflow: hidden; isolation: isolate; background: radial-gradient(ellipse at 50% 78%, #754b62 0, #352849 34%, #191d3e 65%, #0d1531 100%); }
.hooh-sky::before { position: absolute; inset: 0; z-index: -1; content: ''; background: radial-gradient(#fff8d4 0.8px, transparent 1.6px) 0 0 / 42px 39px, radial-gradient(#a4b9ff 0.8px, transparent 1.8px) 19px 15px / 61px 53px; opacity: .7; }
.hooh-sun { position: absolute; top: 12%; left: 50%; width: min(43vw, 300px); aspect-ratio: 1; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle, #fff7c5 0 10%, #ffe798 28%, #ffb765 52%, rgb(241 111 93 / 10%) 72%, transparent 74%); filter: drop-shadow(0 0 36px rgb(255 188 110 / 55%)); }
.hooh-rainbow { position: absolute; z-index: 1; top: 18%; left: 50%; width: min(105vw, 780px); aspect-ratio: 2.3; transform: translateX(-50%); border: clamp(10px, 2.8vw, 22px) solid transparent; border-top-color: #ffd36e; border-radius: 50% 50% 0 0; filter: drop-shadow(0 0 12px #ffdc77) drop-shadow(0 0 26px #e982ff); opacity: .72; }
.hooh-flight { position: absolute; z-index: 4; inset: 0; display: grid; place-items: center; }
.hooh-flight img { width: min(86vw, 700px); height: min(65vh, 470px); object-fit: contain; image-rendering: pixelated; filter: drop-shadow(0 12px 22px rgb(255 178 84 / 52%)) drop-shadow(0 0 20px rgb(255 237 145 / 55%)); animation: hooh-glide 8s ease-in-out infinite alternate; }
.hooh-fallback { color: #ffd576; font-size: min(48vw, 280px); filter: drop-shadow(0 8px 26px #f8a644); }
.hooh-city { position: absolute; right: -5%; bottom: 0; left: -5%; display: flex; height: 25%; align-items: end; justify-content: space-around; }
.hooh-city.far { z-index: 2; bottom: 9%; height: 23%; opacity: .7; }
.hooh-city.near { z-index: 3; height: 18%; }
.hooh-city i { position: relative; display: block; width: 11%; height: 55%; border: 2px solid #29314e; background: linear-gradient(90deg, #202744, #343451 50%, #202744); clip-path: polygon(0 10%, 50% 0, 100% 10%, 100% 100%, 0 100%); }
.hooh-city i:nth-child(2n) { height: 78%; width: 14%; }
.hooh-city i:nth-child(3n) { height: 100%; width: 18%; }
.hooh-city i::after { position: absolute; inset: 28% 18% 10%; content: ''; background: repeating-linear-gradient(0deg, transparent 0 13px, #ffd584 14px 18px), repeating-linear-gradient(90deg, transparent 0 13px, #ffd584 14px 18px); opacity: .65; }
.hooh-feathers { position: absolute; z-index: 5; inset: 15% -15%; color: #fff1ab; font-size: clamp(18px, 5vw, 38px); letter-spacing: 1.8em; opacity: .55; transform: rotate(-16deg); text-shadow: 0 0 15px #ffd463; animation: feathers-drift 7s ease-in-out infinite alternate; }
.hooh-story { position: relative; z-index: 6; padding: 18px clamp(18px, 5vw, 42px) max(20px, env(safe-area-inset-bottom)); border-top: 1px solid rgb(255 245 194 / 45%); background: linear-gradient(180deg, rgb(21 25 48 / 98%), #10142d); box-shadow: 0 -12px 36px rgb(7 10 27 / 36%); }
.hooh-story small { color: #ffd875; font-size: .72rem; font-weight: 800; letter-spacing: .14em; }
.hooh-story h2 { margin: 5px 0 6px; font-size: clamp(1.2rem, 5vw, 1.7rem); }
.hooh-story p { margin: 0; max-width: 750px; color: #e5e7f5; font-size: clamp(.96rem, 3.6vw, 1.12rem); line-height: 1.48; }
.hooh-progress { display: flex; gap: 6px; margin-top: 14px; }
.hooh-progress span { width: 25px; height: 4px; border-radius: 5px; background: #414762; }
.hooh-progress .current, .hooh-progress .passed { background: #ffd875; }
.hooh-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; }
.hooh-actions button { min-height: 46px; padding: 9px 17px; border: 1px solid rgb(255 255 255 / 35%); border-radius: 12px; color: inherit; font: inherit; font-weight: 700; }
.hooh-skip { background: transparent; }
.hooh-next { border-color: #ffe495 !important; background: #ffd875; color: #302447 !important; }
@keyframes hooh-glide { from { transform: translate(-14vw, 4%) scale(.9) rotate(-3deg); } to { transform: translate(14vw, -4%) scale(1.12) rotate(2deg); } }
@keyframes feathers-drift { from { transform: translate3d(0, -2%, 0) rotate(-16deg); } to { transform: translate3d(-8%, 8%, 0) rotate(-13deg); } }
.hooh-story { max-height: 53vh; overflow-y: auto; }.hooh-actions { position: sticky; bottom: 0; background: #10142d; padding-block: 6px; }
.still * { animation: none !important; filter: none !important; }
@media (prefers-reduced-motion: reduce) { .hooh-flight img, .hooh-feathers { animation: none; } }
@media (orientation: landscape) and (max-height: 600px) { .hooh-cutscene { grid-template-columns: 1fr 1fr; grid-template-rows: minmax(0,1fr); }.hooh-story { max-height: none; padding-top: 10px; }.hooh-story p { line-height: 1.3; }.hooh-progress { margin-top: 8px; }.hooh-actions { margin-top: 8px; } }
</style>
