import { afterEach, describe, expect, it, vi } from 'vitest';
import { adjustFocusedControl } from './gamepad-controls';

afterEach(() => document.body.replaceChildren());

describe('ajustes de menu por controle', () => {
  it('ajusta a faixa sem ultrapassar o limite e emite os dois eventos', () => {
    document.body.innerHTML = '<input type="range" min="0" max="1" step="0.1" value="0.8">';
    const input = document.querySelector('input')!;
    const onInput = vi.fn();
    const onChange = vi.fn();
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('change', onChange);
    input.focus();
    expect(adjustFocusedControl('right')).toBe(true);
    expect(input.value).toBe('0.9');
    expect(adjustFocusedControl('right')).toBe(true);
    expect(adjustFocusedControl('right')).toBe(true);
    expect(input.value).toBe('1');
    expect(onInput).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
    document.body.removeEventListener('input', onInput);
    document.body.removeEventListener('change', onChange);
  });

  it('pula opções desabilitadas e respeita o diálogo em foco', () => {
    document.body.innerHTML = '<div role="dialog"><select><option>A</option><option disabled>B</option><option>C</option></select></div><div role="dialog"></div>';
    const select = document.querySelector('select')!;
    const [active, other] = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const onChange = vi.fn();
    select.addEventListener('change', onChange);
    select.focus();
    expect(adjustFocusedControl('right', other)).toBe(false);
    expect(adjustFocusedControl('up', active)).toBe(false);
    expect(adjustFocusedControl('right', active)).toBe(true);
    expect(select.value).toBe('C');
    expect(adjustFocusedControl('left', active)).toBe(true);
    expect(select.value).toBe('A');
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
