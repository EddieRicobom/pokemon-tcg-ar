import { describe, expect, it } from 'vitest';
import { createApp, h, nextTick, ref, type App as VueApp } from 'vue';
import PokeBook from './PokeBook.vue';

describe('Livro dos Pokémon', () => {
  it('abre pelo id interno e acompanha outro id quando o componente já está montado', async () => {
    const selected = ref('internal-b');
    const host = document.createElement('div');
    document.body.append(host);
    let app: VueApp | null = null;
    try {
      const mons = [
        { id: 'internal-a', name: 'Apelido A', real: 'Pikachu', types: ['electric'] as const },
        { id: 'internal-b', name: 'Apelido B', real: 'Eevee', types: ['normal'] as const },
      ];
      app = createApp({
        setup: () => () => h(PokeBook, { mons, friends: {}, initialId: selected.value }),
      });
      app.mount(host);
      await nextTick();
      expect(host.querySelector('h3')?.textContent).toBe('Apelido B');

      selected.value = 'internal-a';
      await nextTick();
      expect(host.querySelector('h3')?.textContent).toBe('Apelido A');
    } finally {
      app?.unmount();
      host.remove();
    }
  });
});
