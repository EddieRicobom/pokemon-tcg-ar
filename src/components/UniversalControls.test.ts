import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import UniversalControls from './UniversalControls.vue';

describe('navegação universal por controle', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; document.documentElement.classList.remove('gamepad-connected'); });

  it('entrega solturas mesmo quando um diálogo abre e mostra a conexão', async () => {
    let callback: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { callback = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const pad = { connected: true, index: 0, mapping: 'standard', axes: [0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad as unknown as Gamepad] });
    const root = document.createElement('main'); root.className = 'app'; document.body.append(root);
    const app = createApp(UniversalControls); app.mount(root); await nextTick();
    const events: { direction: string; pressed: boolean }[] = [];
    const listen = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('tcg-gamepad-direction', listen);
    expect(document.documentElement.classList.contains('gamepad-connected')).toBe(true);
    pad.axes[0] = 1; callback(0);
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); root.append(dialog);
    vi.spyOn(dialog, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    pad.axes[0] = 0; callback(16);
    expect(events.map(({ direction, pressed }) => [direction, pressed])).toEqual([['right', true], ['right', false]]);
    window.removeEventListener('tcg-gamepad-direction', listen);
    app.unmount();
    expect(document.documentElement.classList.contains('gamepad-connected')).toBe(false);
  });

  it('ajusta volume com direcional e confirma um checkbox no diálogo ativo', async () => {
    let callback: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { callback = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    const pad = { connected: true, index: 0, mapping: 'standard', axes: [0, 0], buttons };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad as unknown as Gamepad] });
    const root = document.createElement('main'); root.className = 'app'; document.body.append(root);
    const app = createApp({ render: () => h('div', [h(UniversalControls), h('div', { role: 'dialog' }, [h('input', { id: 'volume', type: 'range', min: '0', max: '100', step: '5', value: '50' }), h('input', { id: 'check', type: 'checkbox' })])]) });
    app.mount(root); await nextTick();
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
    const range = root.querySelector<HTMLInputElement>('#volume')!;
    const change = vi.fn(); range.addEventListener('input', change); range.focus();
    pad.axes[0] = 1; callback(0);
    expect(range.value).toBe('55'); expect(change).toHaveBeenCalledOnce();
    pad.axes[0] = 0; callback(16);
    const check = root.querySelector<HTMLInputElement>('#check')!; check.focus();
    buttons[0]!.pressed = true; callback(32);
    expect(check.checked).toBe(true);
    app.unmount();
  });
});
