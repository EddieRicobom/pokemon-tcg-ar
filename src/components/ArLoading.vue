<script setup lang="ts">
import type { LoadingMode, StepInfo } from '../app/ar-stages';

/**
 * O que o app está fazendo enquanto o AR não aparece: uma Pokébola que balança com a lista das etapas (carregando) ou
 * um visor em formato de carta com uma linha que varre (procurando). Só desenho: o texto vem de `app/ar-stages.ts`.
 */
defineProps<{
  mode: LoadingMode;
  title: string;
  hint: string;
  seconds: number;
  /** Etapas até "Procurando a carta" (sem "Carta selecionada"). */
  steps: StepInfo[];
}>();
</script>

<template>
  <div class="ar-loading" :class="mode" aria-hidden="true">
    <div v-if="mode === 'loading'" class="ball" :class="{ slow: seconds >= 12 }"><i></i></div>
    <div v-else class="finder">
      <b class="c tl"></b><b class="c tr"></b><b class="c bl"></b><b class="c br"></b>
      <span class="sweep"></span>
    </div>

    <div class="info">
      <strong>{{ title }}<small v-if="seconds >= 3"> · {{ seconds }} s</small></strong>
      <ol v-if="mode === 'loading'" class="mini-steps">
        <li v-for="step in steps" :key="step.key" :class="step.state">{{ step.label }}</li>
      </ol>
      <p>{{ hint }}</p>
    </div>
  </div>
</template>

<style scoped>
.ar-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 120px 18px 150px;
  pointer-events: none;
  text-align: center;
  color: #fff;
}

.loading {
  background: radial-gradient(circle at 50% 45%, rgba(8, 12, 24, 0.55), rgba(8, 12, 24, 0.82));
}

.info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: min(340px, 100%);
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(10, 14, 26, 0.72);
  backdrop-filter: blur(8px);
}

.info strong {
  font-size: 1rem;
}

.info small {
  font-weight: 500;
  opacity: 0.75;
}

.info p {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.35;
  opacity: 0.88;
}

/* Pokébola feita de CSS. */
.ball {
  position: relative;
  width: 74px;
  height: 74px;
  border-radius: 50%;
  border: 4px solid #1b1f2b;
  background: linear-gradient(#e8493f 0 47%, #1b1f2b 47% 53%, #f4f4f4 53%);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
  animation: ball-wobble 1.4s ease-in-out infinite;
}

.ball i {
  position: absolute;
  inset: 50% auto auto 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border-radius: 50%;
  border: 4px solid #1b1f2b;
  background: #f4f4f4;
  animation: ball-blink 1.4s ease-in-out infinite;
}

.ball.slow {
  animation-duration: 2.2s;
}

@keyframes ball-wobble {
  0%,
  100% {
    transform: rotate(0);
  }
  20% {
    transform: rotate(-16deg);
  }
  40% {
    transform: rotate(14deg);
  }
  60% {
    transform: rotate(-8deg);
  }
  80% {
    transform: rotate(4deg);
  }
}

@keyframes ball-blink {
  50% {
    background: var(--gold);
  }
}

.mini-steps {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  text-align: left;
}

.mini-steps li {
  display: flex;
  align-items: center;
  gap: 7px;
  opacity: 0.55;
}

.mini-steps li::before {
  content: '';
  flex: none;
  width: 11px;
  height: 11px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid currentColor;
}

.mini-steps li.done {
  opacity: 1;
  color: var(--ok);
}

.mini-steps li.done::before {
  background: currentColor;
}

.mini-steps li.active {
  opacity: 1;
  color: var(--gold);
}

.mini-steps li.active::before {
  border-color: rgba(255, 203, 5, 0.3);
  border-top-color: var(--gold);
  animation: mini-spin 0.8s linear infinite;
}

.mini-steps li.failed {
  opacity: 1;
  color: var(--warn);
}

@keyframes mini-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Visor em formato de carta (63 x 88) com uma linha de varredura. */
.finder {
  position: relative;
  width: min(46%, 190px);
  aspect-ratio: 63 / 88;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  animation: finder-breathe 2.2s ease-in-out infinite;
}

.c {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 0 solid var(--gold);
}

.tl {
  top: 0;
  left: 0;
  border-width: 4px 0 0 4px;
  border-top-left-radius: 10px;
}

.tr {
  top: 0;
  right: 0;
  border-width: 4px 4px 0 0;
  border-top-right-radius: 10px;
}

.bl {
  bottom: 0;
  left: 0;
  border-width: 0 0 4px 4px;
  border-bottom-left-radius: 10px;
}

.br {
  right: 0;
  bottom: 0;
  border-width: 0 4px 4px 0;
  border-bottom-right-radius: 10px;
}

.sweep {
  position: absolute;
  inset: 0 6px auto;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  box-shadow: 0 0 12px 2px rgba(255, 203, 5, 0.55);
  animation: finder-sweep 1.8s ease-in-out infinite;
}

@keyframes finder-sweep {
  0%,
  100% {
    top: 4%;
  }
  50% {
    top: 94%;
  }
}

@keyframes finder-breathe {
  50% {
    transform: scale(1.04);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ball,
  .ball i,
  .finder,
  .sweep {
    animation: none;
  }
  .sweep {
    top: 50%;
  }
}
</style>
