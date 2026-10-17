<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { routeHref, useRoute } from './app/route';
import type { RouteName } from './app/route';
import NavIcon from './components/NavIcon.vue';
import RewardToasts from './components/RewardToasts.vue';
import PokemonSpeech from './components/PokemonSpeech.vue';
import { useInstallPrompt } from './composables/useInstallPrompt';
import { detectCapabilities, isIosDevice } from './core/capabilities';
import CarregarView from './views/CarregarView.vue';
import CaixaView from './views/CaixaView.vue';
import VilaView from './views/VilaView.vue';
import DiagnosticoView from './views/DiagnosticoView.vue';
import PinsView from './views/PinsView.vue';
import ScanView from './views/ScanView.vue';
import TreinadorView from './views/TreinadorView.vue';
import VariasView from './views/VariasView.vue';

const capabilities = detectCapabilities();
const { canInstall, installed, install } = useInstallPrompt();
const route = useRoute();

const showIosHint =
  isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !capabilities.standalone;

/**
 * A barra de baixo tem só o essencial; "Várias" é modo do Escanear, e o Diagnóstico fica na engrenagem do topo. A Vila
 * tem aba própria (antes morava dentro da Caixa, atrás de um botão "Modo vida"). "Cartas" junta «Minhas cartas» (a Box,
 * que antes era modo do Escanear) e a «Caixa em AR» (que antes era aba própria) em duas sub-abas.
 */
const tabs: { name: RouteName; label: string }[] = [
  { name: 'escanear', label: 'Escanear' },
  { name: 'vila', label: 'Vila' },
  { name: 'cartas', label: 'Cartas' },
  { name: 'pins', label: 'Pins' },
  { name: 'treinador', label: 'Treinador' },
];
const scanModes: { name: RouteName; label: string }[] = [
  { name: 'escanear', label: 'Uma carta' },
  { name: 'varias', label: 'Várias' },
];
const cardModes: { name: RouteName; label: string }[] = [
  { name: 'cartas', label: 'Minhas cartas' },
  { name: 'caixa', label: 'Caixa em AR' },
];
const inScanGroup = computed(() => scanModes.some((m) => m.name === route.value.name));
const inCardGroup = computed(() => cardModes.some((m) => m.name === route.value.name));
const subModes = computed(() => (inScanGroup.value ? scanModes : inCardGroup.value ? cardModes : null));
const tabActive = (name: RouteName): boolean =>
  name === 'escanear' ? inScanGroup.value : name === 'cartas' ? inCardGroup.value : route.value.name === name;
const scanKey = computed(() => `scan-${route.value.cardId ?? 'novo'}`);
/** Para onde o ✕ da Vila volta: a última tela fora dela (ou o Escanear, se a Vila foi a primeira). */
const beforeVila = ref<string>(route.value.name === 'vila' ? '#/' : window.location.hash || '#/');
watch(
  () => route.value.name,
  (name, previous) => {
    if (previous && previous !== 'vila' && name === 'vila') return;
    if (name !== 'vila') beforeVila.value = window.location.hash || '#/';
  },
);
</script>

<template>
  <main class="app">
    <header class="app-header">
      <span class="brand-mark" aria-hidden="true"></span>
      <h1>Pokémon TCG AR</h1>
      <a
        class="header-gear"
        :href="routeHref('diagnostico')"
        :aria-current="route.name === 'diagnostico' ? 'page' : undefined"
        aria-label="Diagnóstico e ajustes"
        title="Diagnóstico e ajustes"
      >
        <NavIcon name="diagnostico" />
      </a>
    </header>

    <nav class="tabs" aria-label="Seções do app">
      <a
        v-for="tab in tabs"
        :key="tab.name"
        :href="routeHref(tab.name)"
        :aria-current="tabActive(tab.name) ? 'page' : undefined"
        :class="{ active: tabActive(tab.name) }"
      >
        <NavIcon :name="tab.name" />
        <span>{{ tab.label }}</span>
      </a>
    </nav>

    <section v-if="canInstall && !installed" class="card install" aria-label="Instalar app">
      <p>Instale o app na tela inicial para abrir em tela cheia.</p>
      <button type="button" class="primary" @click="install">Instalar app</button>
    </section>
    <section v-else-if="showIosHint" class="card install" aria-label="Instalar no iPhone">
      <p>
        No iPhone ou iPad: toque em <strong>Compartilhar</strong> e depois em
        <strong>Adicionar à Tela de Início</strong>.
      </p>
    </section>

    <nav v-if="subModes" class="modes" :aria-label="inScanGroup ? 'Modos de escaneamento' : 'Cartas e Caixa'">
      <a v-for="m in subModes" :key="m.name" :href="routeHref(m.name)" :aria-current="route.name === m.name ? 'page' : undefined" :class="{ active: route.name === m.name }">{{ m.label }}</a>
    </nav>

    <ScanView v-if="route.name === 'escanear'" :key="scanKey" :card-id="route.cardId" />
    <VariasView v-else-if="route.name === 'varias'" />
    <VilaView v-else-if="route.name === 'vila'" :back="beforeVila" />
    <CaixaView v-else-if="route.name === 'caixa'" />
    <PinsView v-else-if="route.name === 'pins'" />
    <CarregarView v-else-if="route.name === 'cartas'" />
    <TreinadorView v-else-if="route.name === 'treinador'" />
    <DiagnosticoView v-else />

    <RewardToasts />
    <PokemonSpeech />

    <footer class="app-footer">
      <a :href="routeHref('diagnostico')">Diagnóstico e ajustes</a> ·
      <a href="https://github.com/EddieRicobom/pokemon-tcg-ar">Código-fonte no GitHub</a>
    </footer>
  </main>
</template>
