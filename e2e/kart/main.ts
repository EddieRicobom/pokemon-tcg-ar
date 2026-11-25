/**
 * Harness visual do Kart: monta o componente real e começa uma corrida rápida, sem passar pela Vila.
 * Uso: `npx vite` e abrir `/e2e/kart/index.html?dex=25` (`auto=0` mostra o menu; `cup=1` abre a Copa).
 * Expõe `window.kart.setup()` para inspecionar o estado no console.
 */
import { createApp, h } from 'vue';
import KartRacer from '../../src/components/KartRacer.vue';
import '../../src/styles.css';

const params = new URLSearchParams(location.search);
const DEX = Number(params.get('dex') ?? 25);
localStorage.setItem('tcg-ar-kart-auto-v1', '1');

const app = createApp({ render: () => h(KartRacer, { playerDexId: DEX, onClose: () => {} }) });
const vm = app.mount(document.getElementById('app')!) as unknown as { $: { subTree: { component: { setupState: Record<string, unknown> } } } };
const setup = vm.$.subTree.component.setupState as {
  launchRace: (kind: 'quick' | 'cup', round?: number) => Promise<void>;
  race: unknown;
  useItem: () => void;
};

if (params.get('auto') !== '0') {
  setTimeout(() => { void setup.launchRace(params.get('cup') === '1' ? 'cup' : 'quick'); }, 700);
}
(window as unknown as { kart: unknown }).kart = { setup: () => setup, race: () => setup.race };
