import { describe, expect, it } from 'vitest';
import { isGameKeyboardControl } from './game-keyboard';

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
});
