import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import * as frames from '../app/frame-scheduler';
import * as survivor from '../core/survivor';

// Carregamento dos sprites controlado pelo teste: todos ficam pendentes até `release()`.
const pending: (() => void)[] = [];
const release = () => pending.splice(0).forEach((resolve) => resolve());
vi.mock('../app/services', () => ({
  assetUrl: (path: string) => path,
  getCache: async () => ({ list: async () => [] }),
  getLocalVillageSprite: () => new Promise((resolve) => pending.push(() => resolve(null))),
  getLocalVillageSpriteDirs: () => new Promise((resolve) => pending.push(() => resolve(null))),
}));

const { default: MinigameSobrevivencia } = await import('./MinigameSobrevivencia.vue');

// O carregamento segue pelo caminho de sprite ausente, sem depender da rede.
class FailingImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
}

describe('Torre de Sobrevivência', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;
  // Sem rede: o componente pede `village-sprite-meta.json`; sem este estanque o happy-dom tentava abrir localhost:3000.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => null })));
  });
  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('move e revela o foco, mantém o Enter no favorito e recupera o foco ao voltar da escolha', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(MinigameSobrevivencia, { digital: [{ dexId: 25, name: 'Pikachu' }] }) });
    app.mount(host);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    release();
    await vi.waitFor(() => expect(host!.querySelector('.survivor-favorite')).not.toBeNull());

    const normal = host.querySelector<HTMLButtonElement>('[data-gamepad-default]')!;
    const bonk = host.querySelector<HTMLButtonElement>('.bonk-mode-button')!;
    const pvp = host.querySelector<HTMLButtonElement>('.survivor-pvp-entry')!;
    const favorite = host.querySelector<HTMLButtonElement>('.survivor-favorite')!;
    const pokemon = favorite.parentElement!;
    const keyboard = (target: HTMLElement, key: string) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };
    expect(document.activeElement).toBe(normal);
    vi.spyOn(normal, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 60, 440, 60));
    vi.spyOn(bonk, 'getBoundingClientRect').mockReturnValue(new DOMRect(450, 60, 440, 60));
    vi.spyOn(pvp, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 10, 890, 40));
    const reveal = vi.spyOn(bonk, 'scrollIntoView');
    keyboard(normal, 'ArrowRight');
    expect(document.activeElement).toBe(bonk);
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    favorite.focus();
    expect(keyboard(favorite, 'Enter').defaultPrevented).toBe(false);
    favorite.click();
    await nextTick();
    expect(favorite.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.survivor-attack-choice')).toBeNull();

    pokemon.focus();
    expect(keyboard(pokemon, ' ').defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(host!.querySelector('.survivor-attack-option')));
    expect(host!.querySelector('.survivor-attack-choice')!.textContent).toContain('5 min reais');
    expect(host!.querySelectorAll('.survivor-attack-option .survivor-pick-kind')).toHaveLength(2);
    keyboard(document.activeElement as HTMLElement, 'Escape');
    await vi.waitFor(() => expect(document.activeElement).toBe(host!.querySelector('[data-gamepad-default]')));

    const volume = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    host.querySelectorAll<HTMLDetailsElement>('.survivor-more, .survivor-more details').forEach((details) => { details.open = true; });
    volume.focus();
    expect(keyboard(volume, 'ArrowRight').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(volume);
  });

  it('sair enquanto os sprites ainda carregam não deixa um laço de animação rodando depois', async () => {
    vi.stubGlobal('Image', FailingImage);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(MinigameSobrevivencia) });
    app.mount(host);
    // Caixa vazia → começa a corrida com o Pikachu de reserva e fica esperando os sprites.
    await new Promise((r) => setTimeout(r, 10));
    app.unmount();
    app = null;
    release();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();
    expect(raf).not.toHaveBeenCalled();
  });

  it('sair tira os ouvintes de teclado e de visibilidade', async () => {
    const removedWindow = vi.spyOn(window, 'removeEventListener');
    const removedDoc = vi.spyOn(document, 'removeEventListener');
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(MinigameSobrevivencia) });
    app.mount(host);
    app.unmount();
    app = null;
    expect(removedWindow.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining([
      'keydown', 'keyup', 'tcg-gamepad-action', 'tcg-gamepad-back', 'tcg-gamepad-button', 'tcg-gamepad-direction', 'tcg-gamepad-menu',
    ]));
    expect(removedDoc.mock.calls.map((c) => c[0])).toContain('visibilitychange');
  });

  async function startRunWithTwoLevels(pvpRun?: { index: number; total: number; limitMs: number }) {
    vi.stubGlobal('Image', FailingImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    const scheduled = vi.spyOn(frames, 'requestGameFrame').mockReturnValue(1);
    const create = survivor.createSurvivorState;
    const createRun = vi.spyOn(survivor, 'createSurvivorState').mockImplementation((_seed, options) => {
      const run = create(153, options);
      run.player.xp = run.player.xpToNext + survivor.xpForLevel(2);
      run.player.upgradeRerolls = 1;
      run.bansLeft = 1;
      return run;
    });
    release();
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(MinigameSobrevivencia, { digital: [{ dexId: 25, name: 'Pikachu' }], pvpRun });
    app.mount(host);
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    release();
    await vi.waitFor(() => expect(host!.querySelector('.survivor-favorite')).not.toBeNull());
    host.querySelector('.survivor-favorite')!.parentElement!.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.survivor-attack-option')!.click();
    await vi.waitFor(() => { release(); expect(scheduled).toHaveBeenCalled(); });
    return { frame: scheduled.mock.calls[0]![0], run: createRun.mock.results[0]!.value as ReturnType<typeof create> };
  }

  const cards = () => [...host!.querySelectorAll<HTMLButtonElement>('[aria-label="Escolha uma melhoria"] .survivor-upgrade-btn')];
  const deferButton = () => host!.querySelector<HTMLButtonElement>('.survivor-defer-upgrades');
  const resumeButton = () => host!.querySelector<HTMLButtonElement>('.survivor-resume-upgrades');

  it('protege cada escolha nova, mantém rerrolar e banir imediatos e recupera o foco', async () => {
    const { frame, run } = await startRunWithTwoLevels();
    const stage = host!.querySelector<HTMLElement>('.survivor-stage')!;
    const touch = (type: string) => new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 3, button: 0 });
    stage.dispatchEvent(touch('pointerdown'));
    await nextTick();
    expect(host!.querySelector('.survivor-joy-base')).not.toBeNull();

    vi.useFakeTimers();
    frame(performance.now() + 60);
    await nextTick();
    expect(host!.querySelector('.survivor-joy-base')).toBeNull();
    expect(cards()).toHaveLength(3);
    expect(cards().every((card) => card.disabled)).toBe(true);
    cards()[0]!.dispatchEvent(touch('pointerup'));
    cards()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(run.pendingUpgrade).not.toBeNull();

    await vi.advanceTimersByTimeAsync(320);
    expect(document.activeElement).toBe(cards()[0]);
    const reroll = host!.querySelector<HTMLButtonElement>('.survivor-jirachi-reroll')!;
    reroll.focus();
    reroll.click();
    await nextTick();
    expect(run.player.upgradeRerolls).toBe(0);
    expect(cards().every((card) => !card.disabled)).toBe(true);
    expect(document.activeElement).toBe(cards()[0]);

    host!.querySelector<HTMLButtonElement>('.survivor-ban-toggle')!.click();
    await nextTick();
    cards()[0]!.focus();
    cards()[0]!.click();
    await nextTick();
    expect(run.bansLeft).toBe(0);
    expect(cards().every((card) => !card.disabled)).toBe(true);
    expect(document.activeElement).toBe(cards()[0]);

    const holdingConfirm = new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true, repeat: true });
    cards()[0]!.dispatchEvent(holdingConfirm);
    expect(holdingConfirm.defaultPrevented).toBe(true);
    cards()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
    await nextTick();
    expect(cards().every((card) => card.disabled)).toBe(true);
    expect(Object.values(run.player.upgradeLevels)).toEqual([1]);

    await vi.advanceTimersByTimeAsync(320);
    expect(document.activeElement).toBe(cards()[0]);
    cards()[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    expect(run.pendingUpgrade).not.toBeNull();
    cards()[0]!.click();
    await nextTick();
    expect(cards()).toHaveLength(0);
    expect(run.pendingUpgrade).toBeNull();
  });

  it('troca o golpe por teclado e controle antes de abrir melhorias', async () => {
    const { run } = await startRunWithTwoLevels();
    expect(run.attackSlots?.active).toBe(0);
    const key = new KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true });
    window.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(run.attackSlots?.active).toBe(1);
    const detail = { handled: false, pressed: true, button: 6 };
    window.dispatchEvent(new CustomEvent('tcg-gamepad-button', { detail }));
    expect(detail.handled).toBe(true);
    expect(run.attackSlots?.active).toBe(0);
  });

  it('guarda a oferta e permite reabrir pelo HUD, teclado ou controle', async () => {
    const { frame, run } = await startRunWithTwoLevels();
    vi.useFakeTimers();
    frame(performance.now() + 60);
    await nextTick();
    const offer = run.pendingUpgrade;
    const dialog = host!.querySelector<HTMLElement>('[aria-label="Escolha uma melhoria"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Reabra em Melhorias no topo, com U no teclado ou LB no controle.');
    const reopenActions = [
      () => resumeButton()!.click(),
      () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', cancelable: true })),
      () => {
        const detail = { handled: false, pressed: true, button: 4 };
        window.dispatchEvent(new CustomEvent('tcg-gamepad-button', { detail }));
        expect(detail.handled).toBe(true);
      },
    ];
    for (const reopen of reopenActions) {
      await vi.advanceTimersByTimeAsync(320);
      deferButton()!.click();
      await nextTick();
      expect(cards()).toHaveLength(0);
      expect(resumeButton()?.textContent).toContain('Melhorias (2)');
      reopen();
      await nextTick();
      expect(run.pendingUpgrade).toBe(offer);
      expect(cards()).toHaveLength(3);
      expect(resumeButton()).toBeNull();
    }
  });

  it('guarda níveis automaticamente só quando ativado e mantém a escolha reaberta', async () => {
    const { frame, run } = await startRunWithTwoLevels();
    host!.querySelector<HTMLButtonElement>('.survivor-menu-btn')!.click();
    await nextTick();
    const toggle = host!.querySelector<HTMLButtonElement>('.survivor-auto-defer')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    await nextTick();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    host!.querySelector<HTMLButtonElement>('.survivor-menu-btn')!.click();
    vi.useFakeTimers();
    frame(performance.now() + 60);
    await nextTick();
    expect(cards()).toHaveLength(0);
    expect(resumeButton()?.textContent).toContain('Melhorias (2)');
    const offer = run.deferredUpgrade?.options;
    resumeButton()!.click();
    await nextTick();
    const dialogToggle = host!.querySelector<HTMLButtonElement>('.survivor-upgrade-overlay .survivor-auto-defer')!;
    expect(dialogToggle.getAttribute('aria-pressed')).toBe('true');
    dialogToggle.click();
    dialogToggle.click();
    frame(performance.now() + 120);
    await nextTick();
    expect(run.pendingUpgrade).toBe(offer);
    await vi.advanceTimersByTimeAsync(320);
    cards()[0]!.click();
    await nextTick();
    expect(cards()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(320);
    cards()[0]!.click();
    await nextTick();
    host!.querySelector<HTMLButtonElement>('.survivor-menu-btn')!.click();
    await nextTick();
    host!.querySelector<HTMLButtonElement>('.survivor-auto-defer')!.click();
    host!.querySelector<HTMLButtonElement>('.survivor-menu-btn')!.click();
    run.player.xp = run.player.xpToNext;
    frame(performance.now() + 180);
    await nextTick();
    expect(run.pendingUpgrade).not.toBeNull();
    expect(run.deferredUpgrade).toBeNull();
  });

  it('mantém obrigatória a escolha de nível no PvP', async () => {
    const { frame, run } = await startRunWithTwoLevels({ index: 0, total: 3, limitMs: 60_000 });
    host!.querySelector<HTMLButtonElement>('.survivor-menu-btn')!.click();
    await nextTick();
    expect(host!.querySelector('.survivor-auto-defer')).toBeNull();
    host!.querySelector<HTMLButtonElement>('.survivor-menu-btn')!.click();
    vi.useFakeTimers();
    frame(performance.now() + 60);
    await vi.advanceTimersByTimeAsync(320);
    expect(cards()).toHaveLength(3);
    expect(deferButton()).toBeNull();
    expect(resumeButton()).toBeNull();
    const elapsed = run.elapsedMs;
    expect(survivor.stepSurvivor(run, { dx: 1, dy: 0 }, 16)).toEqual([]);
    expect(run.elapsedMs).toBe(elapsed);
  });
});
