import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import QuizDialog from './QuizDialog.vue';

describe('QuizDialog', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;
  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
  });

  function mount(props: Record<string, unknown>, events: Record<string, (...a: never[]) => void> = {}): HTMLElement {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(QuizDialog, { name: 'Squirtle', text: 'Qual o seu doce favorito?', ...props, ...events } as never) });
    app.mount(host);
    return host;
  }

  it('na pergunta: só deixa responder com texto, e manda o que foi digitado', async () => {
    const got: string[] = [];
    const el = mount({ stage: 'ask', chips: ['Brigadeiro'] }, { onAnswer: (t: never) => got.push(t) });
    const send = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Responder')!;
    expect(send.disabled).toBe(true);
    const input = el.querySelector<HTMLInputElement>('.quiz-input')!;
    input.value = '  bunda fedida ';
    input.dispatchEvent(new Event('input'));
    await nextTick();
    expect(send.disabled).toBe(false);
    el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(got).toEqual(['bunda fedida']);
  });

  it('uma sugestão responde na hora', () => {
    const got: string[] = [];
    const el = mount({ stage: 'ask', chips: ['Brigadeiro', 'Sorvete'] }, { onAnswer: (t: never) => got.push(t) });
    [...el.querySelectorAll('.quiz-chips button')].find((b) => b.textContent === 'Sorvete')!.dispatchEvent(new Event('click'));
    expect(got).toEqual(['Sorvete']);
  });

  it('no seguimento, cada opção devolve o seu índice; na fala final, só fecha', () => {
    const chosen: number[] = [];
    let closed = 0;
    const el = mount({ stage: 'follow', options: ['Sim', 'Não'] }, { onChoose: (i: never) => chosen.push(i), onClose: () => closed++ });
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Não')!.dispatchEvent(new Event('click'));
    expect(chosen).toEqual([1]);
    app!.unmount();
    host!.remove();
    const el2 = mount({ stage: 'reply' }, { onClose: () => closed++ });
    expect(el2.querySelector('input')).toBeNull();
    [...el2.querySelectorAll('button')].find((b) => b.textContent === 'Valeu!')!.dispatchEvent(new Event('click'));
    expect(closed).toBe(1);
  });
});
