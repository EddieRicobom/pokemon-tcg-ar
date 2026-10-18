import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestOrientationPermission } from './orientation-permission';

describe('permissão dos sensores sem carregar o renderizador', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'DeviceOrientationEvent');
  afterEach(() => {
    if (original) Object.defineProperty(window, 'DeviceOrientationEvent', original);
    else Reflect.deleteProperty(window, 'DeviceOrientationEvent');
  });
  function sensor(value: unknown) { Object.defineProperty(window, 'DeviceOrientationEvent', { value, configurable: true }); }
  it('informa ausência e a permissão implícita de navegadores sem diálogo', async () => {
    sensor(undefined);
    expect(await requestOrientationPermission()).toBe('unsupported');
    sensor({});
    expect(await requestOrientationPermission()).toBe('granted');
  });
  it('chama a permissão imediatamente, dentro do gesto, antes de aguardar', async () => {
    const requestPermission = vi.fn(async () => 'granted');
    sensor({ requestPermission });
    const pending = requestOrientationPermission();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(await pending).toBe('granted');
  });
  it('respeita recusa e falhas do navegador', async () => {
    sensor({ requestPermission: async () => 'denied' });
    expect(await requestOrientationPermission()).toBe('denied');
    sensor({ requestPermission: async () => { throw new Error('bloqueado'); } });
    expect(await requestOrientationPermission()).toBe('denied');
  });
});
