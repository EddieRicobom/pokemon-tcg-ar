<script setup lang="ts">
import { computed } from 'vue';
import { routeHref, useRoute } from './app/route';
import type { RouteName } from './app/route';
import NavIcon from './components/NavIcon.vue';
import { useInstallPrompt } from './composables/useInstallPrompt';
import { detectCapabilities, isIosDevice } from './core/capabilities';
import CarregarView from './views/CarregarView.vue';
import CaixaView from './views/CaixaView.vue';
import DiagnosticoView from './views/DiagnosticoView.vue';
import ScanView from './views/ScanView.vue';
import VariasView from './views/VariasView.vue';

const capabilities = detectCapabilities();
const { canInstall, installed, install } = useInstallPrompt();
const route = useRoute();

const showIosHint =
  isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !capabilities.standalone;

const tabs: { name: RouteName; label: string }[] = [
  { name: 'escanear', label: 'Escanear' },
  { name: 'varias', label: 'Várias' },
  { name: 'caixa', label: 'Caixa' },
  { name: 'carregar', label: 'Cartas' },
  { name: 'diagnostico', label: 'Diagnóstico' },
];
const scanKey = computed(() => `scan-${route.value.cardId ?? 'novo'}`);
</script>

<template>
  <main class="app">
    <header class="app-header">
      <span class="brand-mark" aria-hidden="true"></span>
      <h1>Pokémon TCG AR</h1>
    </header>

    <nav class="tabs" aria-label="Seções do app">
      <a
        v-for="tab in tabs"
        :key="tab.name"
        :href="routeHref(tab.name)"
        :aria-current="route.name === tab.name ? 'page' : undefined"
        :class="{ active: route.name === tab.name }"
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

    <ScanView v-if="route.name === 'escanear'" :key="scanKey" :card-id="route.cardId" />
    <VariasView v-else-if="route.name === 'varias'" />
    <CaixaView v-else-if="route.name === 'caixa'" />
    <CarregarView v-else-if="route.name === 'carregar'" />
    <DiagnosticoView v-else />

    <footer class="app-footer">
      <a href="https://github.com/EddieRicobom/pokemon-tcg-ar">Código-fonte no GitHub</a>
    </footer>
  </main>
</template>
