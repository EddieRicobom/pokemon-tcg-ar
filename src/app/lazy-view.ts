import { defineAsyncComponent, h, type Component } from 'vue';
import { loadChunk } from './stale-build';

/** Cada tela baixa seu código quando abre, com recuperação de arquivos de uma versão antiga. */
export function lazyView<T extends Component>(loader: () => Promise<{ default: T }>): T {
  return defineAsyncComponent<T>({
    loader: async () => (await loadChunk(loader)).default,
    delay: 0,
    loadingComponent: {
      render: () => h('p', { role: 'status', 'data-route-pending': '', class: 'card' }, 'Abrindo a tela…'),
    },
    errorComponent: {
      render: () => h('section', { role: 'alert', class: 'card' }, [
        h('p', 'Não foi possível abrir esta tela. Confira a conexão e tente novamente.'),
        h('button', { type: 'button', onClick: () => window.location.reload() }, 'Tentar novamente'),
      ]),
    },
  });
}
