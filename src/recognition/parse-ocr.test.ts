import { describe, expect, it } from 'vitest';
import { parseBottomText, parseNameText } from './parse-ocr';
import { levenshtein, nameSimilarity, normalizeName } from './text';

describe('parseBottomText', () => {
  it('lê número e total clássicos', () => {
    const parsed = parseBottomText('Illus. Mitsuhiro Arita  ©1995 58/102 ●');
    expect(parsed.number).toMatchObject({ prefix: '', value: 58, raw: '58', total: { prefix: '', value: 102 } });
  });

  it('lê número com zeros e código do set em cartas modernas', () => {
    const parsed = parseBottomText('SVI EN 025/198 ●');
    expect(parsed.number?.value).toBe(25);
    expect(parsed.number?.raw).toBe('025');
    expect(parsed.number?.total?.value).toBe(198);
    expect(parsed.setCode).toBe('SVI');
    expect(parsed.language).toBe('EN');
  });

  it('corrige O e l confundidos com 0 e 1 dentro do número', () => {
    const parsed = parseBottomText('O58/lO2');
    expect(parsed.number?.value).toBe(58);
    expect(parsed.number?.total?.value).toBe(102);
  });

  it('lê prefixos de subconjuntos (Galeria de Treinadores, Galarian Gallery)', () => {
    expect(parseBottomText('TG05/TG30').number).toMatchObject({ prefix: 'TG', value: 5, total: { prefix: 'TG', value: 30 } });
    expect(parseBottomText('GG10/GG70').number).toMatchObject({ prefix: 'GG', value: 10 });
  });

  it('lê promos sem total', () => {
    expect(parseBottomText('SWSH123').number).toMatchObject({ prefix: 'SWSH', value: 123 });
    expect(parseBottomText('SVP 045').number).toMatchObject({ prefix: 'SVP', value: 45 });
  });

  it('não confunde a etiqueta de idioma com número de promo', () => {
    expect(parseBottomText('PAL EN').number).toBeUndefined();
  });

  it('devolve vazio quando não há nada legível', () => {
    expect(parseBottomText('')).toEqual({});
    expect(parseBottomText('~~ ..')).toEqual({});
  });
});

describe('parseNameText', () => {
  it('remove HP e palavras de estágio', () => {
    expect(parseNameText('BASIC Pikachu HP 60')).toEqual(['Pikachu']);
    expect(parseNameText('Estágio 1\nCharmeleon PS 80')).toEqual(['Charmeleon']);
  });

  it('mantém sufixos como ex e acentos', () => {
    expect(parseNameText('Pikachu ex HP 190')[0]).toBe('Pikachu ex');
    expect(parseNameText("Farfetch'd PS 60")[0]).toBe("Farfetch'd");
  });

  it('ignora linhas sem letras suficientes', () => {
    expect(parseNameText('12\n!!')).toEqual([]);
  });
});

describe('text', () => {
  it('normaliza acentos e pontuação', () => {
    expect(normalizeName("Flabébé"))
      .toBe('flabebe');
    expect(normalizeName("Mr. Mime")).toBe('mrmime');
  });

  it('distância de edição', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  it('similaridade tolera erro de OCR e sufixo', () => {
    expect(nameSimilarity('Pikachu', 'Pikachu')).toBe(1);
    expect(nameSimilarity('Pikachv', 'Pikachu')).toBeGreaterThan(0.8);
    expect(nameSimilarity('Pikachu ex', 'Pikachu')).toBeGreaterThanOrEqual(0.85);
    expect(nameSimilarity('Charizard', 'Blastoise')).toBeLessThan(0.4);
    expect(nameSimilarity('', 'Pikachu')).toBe(0);
  });
});
