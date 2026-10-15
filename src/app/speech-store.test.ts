import { beforeEach, describe, expect, it } from 'vitest';
import { GALLADE_LINE, isShinyGallade, maybeGalladeSpeaks, speech } from './speech-store';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('a fala da Gallade shiny', () => {
  beforeEach(() => {
    speech.value = null;
  });

  it('fala uma única vez, com a frase certa e o sprite shiny', () => {
    const store = memory();
    expect(maybeGalladeSpeaks({ name: 'Mega Gallade ex', shiny: true }, store)).toBe(true);
    expect(speech.value).toMatchObject({ name: 'Gallade', text: 'Eu sempre acreditei que você é o maior treinador de todos!' });
    expect(speech.value?.sprite).toContain('/showdown/shiny/475.gif');
    expect(GALLADE_LINE).toBe('Eu sempre acreditei que você é o maior treinador de todos!');
    speech.value = null;
    expect(maybeGalladeSpeaks({ name: 'Mega Gallade ex', shiny: true }, store)).toBe(false);
    expect(speech.value).toBeNull();
  });

  it('só a Gallade shiny fala', () => {
    const store = memory();
    expect(isShinyGallade({ name: 'Gallade', shiny: false })).toBe(false);
    expect(maybeGalladeSpeaks({ name: 'Gallade', shiny: false }, store)).toBe(false);
    expect(maybeGalladeSpeaks({ name: 'Pikachu', shiny: true }, store)).toBe(false);
    expect(maybeGalladeSpeaks({ name: 'Gallade', shiny: true }, store)).toBe(true);
  });

  it('sem armazenamento, fica calada (não repete a cada vez)', () => {
    expect(maybeGalladeSpeaks({ name: 'Gallade', shiny: true }, null)).toBe(false);
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => undefined };
    expect(maybeGalladeSpeaks({ name: 'Gallade', shiny: true }, broken)).toBe(false);
  });
});
