import { describe, expect, it } from 'vitest';
import { handleDialogEscape, isGameKeyboardControl } from './game-keyboard';

describe('atalhos do jogo e controles', () => {
  it('reserva o teclado para controles e seus filhos', () => {
    for (const markup of ['<button><span>Sim</span></button>', '<div role="dialog"><span>Conversa</span></div>', '<textarea></textarea>', '<select></select>', '<input>', '<a href="#/">Voltar</a>', '<div contenteditable></div>']) {
      const host = document.createElement('div');
      host.innerHTML = markup;
      expect(isGameKeyboardControl(host.querySelector('span') ?? host.firstElementChild)).toBe(true);
    }
  });

  it('mantém os atalhos disponíveis no cenário', () => {
    expect(isGameKeyboardControl(document.createElement('canvas'))).toBe(false);
    expect(isGameKeyboardControl(document.createElement('div'))).toBe(false);
    expect(isGameKeyboardControl(null)).toBe(false);
  });

  it('fecha a folha por Escape mesmo com foco no botão', () => {
    for (const label of ['Construir a casa', 'Loja da Vila']) {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-label', label);
      const button = document.createElement('button');
      dialog.append(button);
      document.body.append(dialog);
      button.focus();
      let closed = 0;
      const listener = (event: KeyboardEvent) => handleDialogEscape(event, () => { closed++; dialog.remove(); });
      window.addEventListener('keydown', listener);
      try {
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        button.dispatchEvent(event);
        expect(closed).toBe(1);
        expect(dialog.isConnected).toBe(false);
        expect(event.defaultPrevented).toBe(true);
      } finally {
        window.removeEventListener('keydown', listener);
        dialog.remove();
      }
    }
  });

  it('não consome outras teclas nem Escape já tratado pelo diálogo', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    let closed = 0;
    for (const [type, key, prevented] of [['keydown', 'Enter', false], ['keyup', 'Escape', false], ['keydown', 'Escape', true]] as const) {
      const event = new KeyboardEvent(type, { key, cancelable: true });
      if (prevented) event.preventDefault();
      dialog.addEventListener(type, (e) => expect(handleDialogEscape(e as KeyboardEvent, () => closed++)).toBe(false), { once: true });
      dialog.dispatchEvent(event);
    }
    expect(closed).toBe(0);
  });
});
