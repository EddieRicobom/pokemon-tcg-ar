<script setup lang="ts">
import CameraStage from './components/CameraStage.vue';
import StatusPanel from './components/StatusPanel.vue';
import { useInstallPrompt } from './composables/useInstallPrompt';
import { detectCapabilities, isIosDevice } from './core/capabilities';

const capabilities = detectCapabilities();
const { canInstall, installed, install } = useInstallPrompt();

const showIosHint =
  isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !capabilities.standalone;
</script>

<template>
  <main class="app">
    <header class="app-header">
      <h1>Pokémon TCG AR</h1>
      <p>Aponte a câmera para uma carta e veja o Pokémon animado em pé sobre ela.</p>
      <p class="phase">Fase 0 · fundação do projeto</p>
    </header>

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

    <StatusPanel :capabilities="capabilities" />
    <CameraStage />

    <footer class="app-footer">
      <a href="https://github.com/EddieRicobom/pokemon-tcg-ar">Código-fonte no GitHub</a>
    </footer>
  </main>
</template>
