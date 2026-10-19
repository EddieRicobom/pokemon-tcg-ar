import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import CardBox from './CardBox.vue';
import { BOX_KEY } from '../app/box-store';

function card(id: string, name: string, dex: number) {
  return {
    id, schema: 1, name, setId: 's', setName: 'Set', localId: id.slice(1), setOfficial: 100, setTotal: 100, dexIds: [dex],
    reference: { state: 'ok' }, sprite: { state: 'ok', kind: 'gif' }, target: { state: 'ok' }, firstSeenAt: 1, lastSeenAt: 1, scanCount: 1,
    status: 'completo' as const,
  };
}

describe('Box (tela)', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;
  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    localStorage.removeItem(BOX_KEY);
  });

  async function mount(): Promise<HTMLElement> {
    localStorage.removeItem(BOX_KEY);
    host = document.createElement('div');
    document.body.append(host);
    const cards = [card('c1', 'Pikachu', 25), card('c2', 'Bulbasaur', 1), card('c3', 'Charmander', 4)];
    app = createApp({
      render: () => h(CardBox, {
        cards, team: ['c2'], busyId: null, visibleIds: new Set(['c1', 'c2']),
        statusText: { completo: 'Completa', parcial: 'Parcial', falhou: 'Falhou' },
      } as never),
    });
    app.mount(host);
    await nextTick();
    return host;
  }
  const cells = () => [...(host?.querySelectorAll<HTMLButtonElement>('.pbox-cell') ?? [])];

  it('mostra uma caixa 6 × 5 com as cartas em ordem, a equipe numerada e o filtro apagando o resto', async () => {
    await mount();
    expect(cells()).toHaveLength(30);
    expect(cells().filter((c) => c.classList.contains('filled'))).toHaveLength(3);
    expect(cells()[1]!.querySelector('.pbox-team')?.textContent).toBe('1');
    expect(cells()[2]!.classList.contains('dim')).toBe(true);
  });

  it('mover: toca na carta e no destino — ela vai, e a organização fica gravada', async () => {
    await mount();
    [...host!.querySelectorAll('button')].find((b) => b.textContent?.includes('Mover'))!.click();
    await nextTick();
    cells()[0]!.click();
    await nextTick();
    expect(cells()[0]!.classList.contains('source')).toBe(true);
    cells()[29]!.click();
    await nextTick();
    expect(cells()[0]!.classList.contains('filled')).toBe(false);
    expect(cells()[29]!.classList.contains('filled')).toBe(true);
    const saved = JSON.parse(localStorage.getItem(BOX_KEY)!);
    expect(saved.boxes[0].slots[29]).toBe('c1');
  });

  it('tocar numa carta (fora do Mover) abre os detalhes com as ações', async () => {
    await mount();
    cells()[0]!.click();
    await nextTick();
    const detail = host!.querySelector('.pbox-detail');
    expect(detail?.textContent).toContain('Pikachu');
    expect(detail?.textContent).toContain('Ver em AR');
  });

  it('permite escolher diretamente entre caixas adicionais', async () => {
    await mount();
    host!.querySelector<HTMLButtonElement>('.pbox-tools button:last-child')!.click();
    await nextTick();
    const choices = [...host!.querySelectorAll<HTMLButtonElement>('.pbox-selector button')];
    expect(choices).toHaveLength(2);
    expect(choices[1]!.getAttribute('aria-pressed')).toBe('true');
    choices[0]!.click();
    await nextTick();
    expect(choices[0]!.getAttribute('aria-pressed')).toBe('true');
  });
});
