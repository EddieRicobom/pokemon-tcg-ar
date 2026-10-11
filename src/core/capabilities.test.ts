import { describe, expect, it } from 'vitest';
import { evaluateCapabilities, isIosDevice, type CapabilitySources } from './capabilities';

const full: CapabilitySources = {
  isSecureContext: true,
  mediaDevices: { getUserMedia: () => Promise.resolve() },
  serviceWorker: {},
  displayModeStandalone: false,
  iosStandalone: false,
  probeWebGL2: () => true,
};

describe('evaluateCapabilities', () => {
  it('reconhece um navegador completo', () => {
    expect(evaluateCapabilities(full)).toEqual({
      secureContext: true,
      camera: true,
      webgl2: true,
      serviceWorker: true,
      standalone: false,
    });
  });

  it('marca a câmera como indisponível sem mediaDevices ou getUserMedia', () => {
    expect(evaluateCapabilities({ ...full, mediaDevices: undefined }).camera).toBe(false);
    expect(evaluateCapabilities({ ...full, mediaDevices: {} }).camera).toBe(false);
  });

  it('marca o Service Worker como indisponível quando ausente', () => {
    expect(evaluateCapabilities({ ...full, serviceWorker: undefined }).serviceWorker).toBe(false);
  });

  it('propaga o resultado da sonda de WebGL2', () => {
    expect(evaluateCapabilities({ ...full, probeWebGL2: () => false }).webgl2).toBe(false);
  });

  it('detecta app instalado pelo display-mode ou pelo flag do iOS', () => {
    expect(evaluateCapabilities({ ...full, displayModeStandalone: true }).standalone).toBe(true);
    expect(evaluateCapabilities({ ...full, iosStandalone: true }).standalone).toBe(true);
  });
});

describe('isIosDevice', () => {
  it('reconhece iPhone e iPad pelo user agent', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', 5)).toBe(true);
  });

  it('reconhece iPadOS que se apresenta como Macintosh com toque', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
  });

  it('não confunde Mac de mesa nem Android com iOS', () => {
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(false);
  });
});
