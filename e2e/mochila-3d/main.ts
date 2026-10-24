/**
 * Harness da Mochila 3D: monta o componente real com uma mochila de exemplo, sem passar pela Vila.
 * Só dev. Uso: `npx vite` e abrir `/pokemon-tcg-ar/e2e/mochila-3d/index.html` (`?n=4` muda quantos tipos de item vão dentro).
 */
import { createApp, h } from 'vue';
import BackpackView from '../../src/components/BackpackView.vue';
import { ITEMS } from '../../src/core/village/catalog';
import '../../src/styles.css';

const params = new URLSearchParams(location.search);
const wanted = ['oran', 'madeira', 'cristal', 'peixe', 'mel', 'pena', 'concha', 'ouro', 'flor', 'pedra', 'champignon', 'estrela'];
const n = Math.max(0, Number(params.get('n') ?? 9));
const items = wanted
  .map((id) => ITEMS.find((item) => item.id === id))
  .filter((item) => item !== undefined)
  .slice(0, n)
  .map((item, index) => ({ id: item.id, name: item.name, qty: index % 3 === 0 ? 12 : index + 1 }));

createApp({ render: () => h(BackpackView, { items, onClose: () => location.reload() }) }).mount('#app');
