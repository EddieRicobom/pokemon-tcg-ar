<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { rememberBeforeVila, routeHref, useRoute } from './app/route';
import type { RouteName } from './app/route';
import NavIcon from './components/NavIcon.vue';
import RewardToasts from './components/RewardToasts.vue';
import PokemonSpeech from './components/PokemonSpeech.vue';
import UniversalControls from './components/UniversalControls.vue';
import { useInstallPrompt } from './composables/useInstallPrompt';
import { detectCapabilities, isIosDevice } from './core/capabilities';
import { lazyView } from './app/lazy-view';
import ScanView from './views/ScanView.vue';
import FirstRunOnboarding from './components/FirstRunOnboarding.vue';

const CarregarView = lazyView(() => import('./views/CarregarView.vue'));
const CaixaView = lazyView(() => import('./views/CaixaView.vue'));
const ArenaView = lazyView(() => import('./views/ArenaView.vue'));
const VilaView = lazyView(() => import('./views/VilaView.vue'));
const TorreView = lazyView(() => import('./views/TorreView.vue'));
const DiagnosticoView = lazyView(() => import('./views/DiagnosticoView.vue'));
const PinsView = lazyView(() => import('./views/PinsView.vue'));
const TreinadorView = lazyView(() => import('./views/TreinadorView.vue'));
const VariasView = lazyView(() => import('./views/VariasView.vue'));

const capabilities = detectCapabilities();
const { canInstall, installed, installError, install } = useInstallPrompt();
const route = useRoute();
const firstRun = ref(false);
try { firstRun.value = localStorage.getItem('tcg-ar-onboarding-v1') !== '1'; } catch { firstRun.value = true; }

const showIosHint =
  isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !capabilities.standalone;

/**
 * A barra de baixo tem só o essencial; "Várias" é modo do Escanear, e o Diagnóstico fica na engrenagem do topo. A Vila
 * tem aba própria (antes morava dentro da Caixa, atrás de um botão "Modo vida"). As lutas moram no Coliseu da Vila (o
 * diálogo do prédio oferece a Arena, a Liga e as corridas 6×6). Pins também abre pela Vila: essas telas
 * continuam existindo e abrindo por endereço e por link, mas não têm aba nem sub-aba, e a aba da Vila fica acesa.
 */
const tabs: { name: 'escanear' | 'vila' | 'cartas' | 'treinador'; label: string }[] = [
  { name: 'escanear', label: 'Escanear' },
  { name: 'vila', label: 'Vila' },
  { name: 'cartas', label: 'Cartas' },
  { name: 'treinador', label: 'Treinador' },
];
const scanModes: { name: RouteName; label: string }[] = [
  { name: 'escanear', label: 'Uma carta' },
  { name: 'varias', label: 'Várias' },
];
/** Modos que se acessam por prédios da Vila: a aba da Vila fica acesa neles. */
const villageRoutes: readonly RouteName[] = ['arena', 'caixa', 'torre', 'pins'];
const inScanGroup = computed(() => scanModes.some((m) => m.name === route.value.name));
const subModes = computed(() => (inScanGroup.value ? scanModes : null));
const tabActive = (name: RouteName): boolean =>
  name === 'escanear' ? inScanGroup.value : name === 'vila' ? route.value.name === 'vila' || villageRoutes.includes(route.value.name) : route.value.name === name;
const scanKey = computed(() => `scan-${route.value.cardId ?? 'novo'}`);
/** Para onde o ✕ da Vila volta: a última tela fora dela (ou o Escanear, se a Vila foi a primeira). */
const beforeVila = ref<string>(route.value.name === 'vila' ? '#/' : window.location.hash || '#/');
watch(
  () => route.value.name,
  (name, previous) => {
    if (previous && previous !== 'vila' && name === 'vila') return;
    if (name !== 'vila' && rememberBeforeVila(window.location.hash)) beforeVila.value = window.location.hash || '#/';
  },
);
/** Cada tela abre do topo: sem isto, a rolagem da aba anterior ficava (Várias abria no meio da página). */
watch(
  () => route.value.name,
  () => window.scrollTo(0, 0),
);
</script>

<template>
  <main class="app">
    <header class="app-header">
      <span class="brand-mark" aria-hidden="true"></span>
      <h1>Digital Holo</h1>
      <a
        class="header-gear"
        :href="routeHref('diagnostico')"
        :aria-current="route.name === 'diagnostico' ? 'page' : undefined"
        aria-label="Diagnóstico"
        title="Diagnóstico"
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
    <p v-if="installError" role="alert">{{ installError }}</p>
    <section v-if="showIosHint" class="card install" aria-label="Instalar no iPhone">
      <p>
        No iPhone ou iPad: toque em <strong>Compartilhar</strong> e depois em
        <strong>Adicionar à Tela de Início</strong>.
      </p>
    </section>

    <nav v-if="subModes" class="modes" aria-label="Modos de escaneamento">
      <a v-for="m in subModes" :key="m.name" :href="routeHref(m.name)" :aria-current="route.name === m.name ? 'page' : undefined" :class="{ active: route.name === m.name }">{{ m.label }}</a>
    </nav>

    <ScanView v-if="route.name === 'escanear'" :key="scanKey" :card-id="route.cardId" />
    <VariasView v-else-if="route.name === 'varias'" />
    <VilaView v-else-if="route.name === 'vila'" :back="beforeVila" />
    <TorreView v-else-if="route.name === 'torre'" />
    <CaixaView v-else-if="route.name === 'caixa'" />
    <ArenaView v-else-if="route.name === 'arena'" />
    <PinsView v-else-if="route.name === 'pins'" />
    <CarregarView v-else-if="route.name === 'cartas'" />
    <TreinadorView v-else-if="route.name === 'treinador'" />
    <DiagnosticoView v-else />

    <RewardToasts />
    <PokemonSpeech />
    <UniversalControls />
    <FirstRunOnboarding v-if="firstRun" @done="firstRun = false" />

    <footer class="app-footer">
      <a :href="routeHref('diagnostico')">Diagnóstico</a> ·
      <a href="https://github.com/EddieRicobom/pokemon-tcg-ar">Código-fonte no GitHub</a>
    </footer>
  </main>
</template>
