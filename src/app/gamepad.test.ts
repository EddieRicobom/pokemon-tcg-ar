import { describe, expect, it } from 'vitest';
import { gamepadButtonPressed, gamepadDirections, type GamepadInput } from './gamepad';

function pad({ axes = [], buttons = [], mapping = 'standard' }: Partial<GamepadInput> = {}): GamepadInput {
  return { axes, buttons, mapping };
}

function button(pressed = true, value = pressed ? 1 : 0): { pressed: boolean; value: number } {
  return { pressed, value };
}

describe('controles de gamepad', () => {
  it('lê o direcional e o analógico do layout padrão', () => {
    const buttons = Array.from({ length: 16 }, () => button(false));
    buttons[12] = button();
    buttons[15] = button();

    expect([...gamepadDirections(pad({ axes: [-.8, .7], buttons }))].sort()).toEqual(['down', 'left', 'right', 'up']);
  });

  it('lê o direcional por eixos extras em um controle DirectInput', () => {
    expect([...gamepadDirections(pad({ mapping: '', axes: [0, 0, 0, 0, 0, 0, -.9, .9] }))].sort())
      .toEqual(['down', 'left']);
  });

  it('lê o hat de oito direções sem confundir o ponto neutro', () => {
    expect([...gamepadDirections(pad({ mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -5 / 7] }))].sort())
      .toEqual(['right', 'up']);
    expect(gamepadDirections(pad({ mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })).size).toBe(0);
  });

  it('aceita botões analógicos acima do limiar', () => {
    expect(gamepadButtonPressed(pad({ buttons: [button(false, .6)] }), 0)).toBe(true);
    expect(gamepadButtonPressed(pad({ buttons: [button(false, .5)] }), 0)).toBe(false);
  });
});
