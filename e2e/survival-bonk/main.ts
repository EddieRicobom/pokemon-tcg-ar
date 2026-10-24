/**
 * Harness do modo BONK da Torre: monta o componente real e começa uma corrida BONK direto, sem passar pela escolha.
 * Só dev (o Vite expõe o estado do `<script setup>`). Uso: `npx vite` e abrir
 * `/pokemon-tcg-ar/e2e/survival-bonk/index.html?dex=25&god=1` (`god=1` deixa o jogador sem morrer, para olhar o cenário).
 */
import { createApp, h } from 'vue';
import MinigameSobrevivencia from '../../src/components/MinigameSobrevivencia.vue';
import '../../src/styles.css';

const params = new URLSearchParams(location.search);
const DEX = Number(params.get('dex') ?? 25);
const NAME = params.get('name') ?? 'Pikachu';

const app = createApp({ render: () => h(MinigameSobrevivencia) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vm = app.mount(document.getElementById('app')!) as any;
// O wrapper só renderiza o componente: o estado do `<script setup>` fica na instância filha (`subTree.component`).
const setup = (vm.$.subTree.component as { setupState: Record<string, unknown> }).setupState as {
  beginRun: (dexId: number, name: string, picked?: unknown, infinite?: boolean, bonk?: boolean) => Promise<void>;
  state: { player: { hp: number; maxHp: number } } | null;
  bonkPhysics: unknown;
};

setTimeout(() => {
  void setup.beginRun(DEX, NAME, undefined, false, true).then(() => {
    if (params.get('god') === '1' && setup.state) {
      setup.state.player.hp = 1e9;
      setup.state.player.maxHp = 1e9;
    }
  });
}, 600);

(window as unknown as { survivalBonk: unknown }).survivalBonk = {
  state: () => setup.state,
  physics: () => setup.bonkPhysics,
};
