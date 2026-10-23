import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App as VueApp } from 'vue';
import FirstRunOnboarding from './FirstRunOnboarding.vue';
import { profile } from '../app/profile-store';

describe('primeira abertura', () => {
  let host: HTMLElement | null = null;
  let app: VueApp | null = null;
  const originalProfile = { ...profile };

  afterEach(() => {
    app?.unmount();
    host?.remove();
    app = null;
    host = null;
    profile.name = originalProfile.name;
    profile.sprite = originalProfile.sprite;
    localStorage.removeItem('tcg-ar-onboarding-v1');
    window.location.hash = '';
  });

  it('deixa quem não tem carta ir diretamente para a Vila depois de escolher o perfil', async () => {
    let completed = false;
    host = document.createElement('div');
    document.body.append(host);
    app = createApp({ render: () => h(FirstRunOnboarding, { onDone: () => { completed = true; } }) });
    app.mount(host);

    const name = host.querySelector<HTMLInputElement>('input[autocomplete="nickname"]');
    expect(name).not.toBeNull();
    name!.value = 'Lia';
    name!.dispatchEvent(new Event('input'));
    host.querySelector<HTMLButtonElement>('button.primary')!.click();
    await nextTick();

    const village = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('Não tenho cartas agora'));
    expect(village).toBeDefined();
    village!.click();

    expect(completed).toBe(true);
    expect(window.location.hash).toBe('#/vila');
    expect(localStorage.getItem('tcg-ar-onboarding-v1')).toBe('1');
    expect(profile.name).toBe('Lia');
  });
});
