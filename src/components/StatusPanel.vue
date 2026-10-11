<script setup lang="ts">
import { computed } from 'vue';
import type { Capabilities } from '../core/capabilities';

const props = defineProps<{ capabilities: Capabilities }>();

interface Row {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}

const rows = computed<Row[]>(() => [
  {
    label: 'Página segura (HTTPS)',
    ok: props.capabilities.secureContext,
    okText: 'Sim',
    failText: 'Não — a câmera não funciona',
  },
  {
    label: 'Câmera',
    ok: props.capabilities.camera,
    okText: 'Disponível',
    failText: 'Indisponível neste navegador',
  },
  {
    label: 'Gráficos 3D (WebGL2)',
    ok: props.capabilities.webgl2,
    okText: 'Disponível',
    failText: 'Indisponível neste aparelho',
  },
  {
    label: 'Uso offline (Service Worker)',
    ok: props.capabilities.serviceWorker,
    okText: 'Disponível',
    failText: 'Indisponível neste navegador',
  },
  {
    label: 'Instalado na tela inicial',
    ok: props.capabilities.standalone,
    okText: 'Sim',
    failText: 'Ainda não (opcional)',
  },
]);
</script>

<template>
  <section class="card" aria-labelledby="status-title">
    <h2 id="status-title">Este aparelho</h2>
    <ul class="status-list">
      <li v-for="row in rows" :key="row.label">
        <span>{{ row.label }}</span>
        <strong :class="row.ok ? 'ok' : 'warn'">
          <span aria-hidden="true">{{ row.ok ? '✔' : '✖' }}</span>
          {{ row.ok ? row.okText : row.failText }}
        </strong>
      </li>
    </ul>

    <h2 id="project-title">Estado do projeto</h2>
    <ul class="status-list" aria-labelledby="project-title">
      <li>
        <span>Reconhecimento de cartas</span>
        <strong class="pending">Ainda não implementado</strong>
      </li>
      <li>
        <span>Pokémon em pé sobre a carta (AR)</span>
        <strong class="pending">Ainda não implementado</strong>
      </li>
    </ul>
  </section>
</template>
