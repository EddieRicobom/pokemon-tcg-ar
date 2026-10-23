import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import type { App as VueApp } from 'vue';

// A cena (Three.js) e a câmera não rodam no happy-dom: a Caixa fala com elas só por estes dois módulos.
const startBox = vi.fn();
const startRearCamera = vi.fn();
vi.mock('../box/start-box', () => ({ startBox: (...args: unknown[]) => startBox(...args) }));
vi.mock('../core/camera', async (original) => ({ ...(await original<typeof import('../core/camera')>()), startRearCamera: (...args: unknown[]) => startRearCamera(...args), stopCamera: vi.fn() }));
vi.mock('../app/services', async (original) => ({ ...(await original<typeof import('../app/services')>()), getCache: async () => ({ list: async () => [] }) }));

import CaixaView from './CaixaView.vue';

function fakeBox(placeResult: { ok: true } | { ok: false; message: string } = { ok: true }) {
  const calls = { placeAt: 0, setPhoneHeight: [] as number[], setHalfSize: [] as number[], setScenery: [] as boolean[], stop: 0 };
  const box = {
    orientation: { lookBy: vi.fn() },
    scene: { creatureList: [], weatherNow: { kind: 'rain', mode: 'ciclo', state: {} } },
    placeAt: () => { calls.placeAt++; return placeResult; },
    clearPlacement: vi.fn(),
    pick: () => null,
    setCreatures: vi.fn(),
    setMode: vi.fn(), setSmoothing: vi.fn(), setLighting: vi.fn(), setImpactEffects: vi.fn(), setTerrain: vi.fn(), setSocial: vi.fn(), setWeather: vi.fn(), setSound: vi.fn(),
    setScenery: (on: boolean) => calls.setScenery.push(on),
    setPhoneHeight: (m: number) => calls.setPhoneHeight.push(m),
    setHalfSize: (m: number) => calls.setHalfSize.push(m),
    setVideoFov: vi.fn(), unlockAudio: vi.fn(), startBattle: vi.fn(), stopBattle: vi.fn(), recenterBattle: vi.fn(), resize: vi.fn(),
    stop: () => { calls.stop++; },
  };
  return { box, calls };
}

describe('CaixaView: a Arena 3D (palco virtual) e o interruptor de fundo', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;

  async function mount(hash: string): Promise<HTMLElement> {
    window.location.hash = hash;
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(CaixaView);
    app.mount(host);
    await nextTick();
    return host;
  }
  const button = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  beforeEach(() => {
    startBox.mockReset();
    startRearCamera.mockReset();
    localStorage.clear();
  });
  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    window.location.hash = '';
  });

  it('abre como Caixa em AR (câmera) por padrão e troca o fundo no interruptor, sem abrir nada', async () => {
    const root = await mount('#/caixa');
    expect(root.querySelector('h2')?.textContent).toBe('Caixa em AR');
    expect(button(root, 'Abrir câmera e sensores')).toBeTruthy();
    expect(button(root, 'Câmera (AR)')?.getAttribute('aria-pressed')).toBe('true');
    button(root, 'Arena virtual')!.click();
    await nextTick();
    expect(root.querySelector('h2')?.textContent).toBe('Arena 3D');
    expect(button(root, 'Entrar na Arena 3D')).toBeTruthy();
    expect(root.querySelector('.virtual-sky')).not.toBeNull();
    expect(startBox).not.toHaveBeenCalled();
    expect(startRearCamera).not.toHaveBeenCalled();
    button(root, 'Câmera (AR)')!.click();
    await nextTick();
    expect(root.querySelector('h2')?.textContent).toBe('Caixa em AR');
    expect(root.querySelector('.virtual-sky')).toBeNull();
  });

  it('?virtual=1 já abre na Arena 3D; entrar não pede câmera nem sensores e a arena nasce colocada', async () => {
    const { box, calls } = fakeBox();
    startBox.mockResolvedValue(box);
    const root = await mount('#/caixa?virtual=1');
    expect(root.querySelector('h2')?.textContent).toBe('Arena 3D');
    button(root, 'Entrar na Arena 3D')!.click();
    await vi.waitFor(() => expect(root.querySelector('.stage-bar')).not.toBeNull());
    expect(startRearCamera).not.toHaveBeenCalled();
    expect(startBox).toHaveBeenCalledTimes(1);
    const options = startBox.mock.calls[0]![0] as { virtual?: boolean; video?: unknown; canvas: unknown; container: unknown };
    expect(options.virtual).toBe(true);
    expect(options.video).toBeUndefined();
    expect(options.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(calls.placeAt).toBe(1);
    // Sem câmera: a arena nasce de frente, então não há «Colocar a caixa aqui» nem «Mover».
    expect(button(root, 'Colocar a caixa aqui')).toBeUndefined();
    const bar = root.querySelector('.stage-bar')!;
    expect([...bar.querySelectorAll('button')].some((b) => b.textContent?.includes('Mover'))).toBe(false);
    expect([...bar.querySelectorAll('button')].some((b) => b.textContent?.includes('Fechar'))).toBe(true);
    // O cenário recebe a opção do Coliseu e o tamanho da caixa; a altura do celular não vale no palco virtual.
    expect(calls.setScenery).toEqual([true]);
    expect(calls.setHalfSize).toEqual([1.2]);
  });

  it('no palco virtual os Ajustes não mostram altura do celular, sensor nem tamanho da caixa, e o clima não é anunciado', async () => {
    const { box } = fakeBox();
    startBox.mockResolvedValue(box);
    const root = await mount('#/caixa?virtual=1');
    button(root, 'Entrar na Arena 3D')!.click();
    await vi.waitFor(() => expect(root.querySelector('.stage-bar')).not.toBeNull());
    [...root.querySelectorAll<HTMLButtonElement>('.stage-bar button')].find((b) => b.textContent?.includes('Ajustes'))!.click();
    await nextTick();
    const sheet = root.querySelector('[aria-label="Ajustes da caixa"]')!;
    expect(sheet.textContent).toContain('Ângulo de visão');
    for (const text of ['Altura do celular', 'Atraso da câmera', 'Tamanho da caixa', 'presa ao chão pelos sensores']) expect(sheet.textContent).not.toContain(text);
  });

  it('se a cena não monta, mostra o erro em português e volta à tela inicial', async () => {
    startBox.mockRejectedValue(new Error('WebGL indisponível'));
    const root = await mount('#/caixa?virtual=1');
    button(root, 'Entrar na Arena 3D')!.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Não consegui montar a Arena 3D: WebGL indisponível'));
    expect(button(root, 'Entrar na Arena 3D')).toBeTruthy();
    expect(root.querySelector('.stage-bar')).toBeNull();
  });

  it('se a arena não puder ser colocada, para a cena e avisa', async () => {
    const { box, calls } = fakeBox({ ok: false, message: 'sem chão' });
    startBox.mockResolvedValue(box);
    const root = await mount('#/caixa?virtual=1');
    button(root, 'Entrar na Arena 3D')!.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Não consegui montar a Arena 3D: sem chão'));
    expect(calls.stop).toBe(1);
    expect(root.querySelector('.stage-bar')).toBeNull();
  });

  it('vindo da Vila (?vila=1) oferece «Voltar à Vila» na tela inicial', async () => {
    const root = await mount('#/caixa?virtual=1&vila=1');
    const back = [...root.querySelectorAll('a')].find((a) => a.textContent?.includes('Voltar à Vila'));
    expect(back?.getAttribute('href')).toBe('#/vila');
  });

  it('no modo câmera a abertura ainda pede a câmera (a Caixa em AR não mudou)', async () => {
    startRearCamera.mockRejectedValue(new Error('negada'));
    const root = await mount('#/caixa');
    button(root, 'Abrir câmera e sensores')!.click();
    await vi.waitFor(() => expect(startRearCamera).toHaveBeenCalledTimes(1));
    expect(startBox).not.toHaveBeenCalled();
  });
});
