import { describe, expect, it } from 'vitest';
import { renderScene, syntheticCard } from './__fixtures__/synthetic';
import { compareFeatures, computeFeatures, featuresFromJson, featuresToJson, hamming } from './hash';
import { rectify } from './homography';
import { parseBottomText } from './parse-ocr';
import { rankCandidates, scoreMeta } from './ranking';
import type { CandidateInfo, Evidence } from './ranking';
import type { Quad } from './types';

const pikachu: CandidateInfo = { id: 'base1-58', setId: 'base1', localId: '58', name: 'Pikachu', setOfficial: 102, setTotal: 102 };
const jungle: CandidateInfo = { id: 'base2-60', setId: 'base2', localId: '60', name: 'Pikachu', setOfficial: 64, setTotal: 64 };
const modern: CandidateInfo = { id: 'sv03.5-025', setId: 'sv03.5', localId: '025', name: 'Pikachu', setOfficial: 165, setTotal: 207, setCode: 'MEW' };

function evidence(text: string, name?: string): Evidence {
  return { bottom: parseBottomText(text), nameGuesses: name ? [name] : [] };
}

describe('scoreMeta', () => {
  it('número + total + nome distinguem reimpressões do mesmo Pokémon', () => {
    const e = evidence('58/102', 'Pikachu');
    expect(scoreMeta(pikachu, e).meta).toBeCloseTo(1, 5);
    expect(scoreMeta(jungle, e).meta!).toBeLessThan(0.5);
  });

  it('sem nenhuma evidência a nota é nula, não zero', () => {
    expect(scoreMeta(pikachu, evidence('')).meta).toBeNull();
  });

  it('zeros à esquerda e código do set contam', () => {
    const e = evidence('MEW EN 025/165', 'Pikachu');
    expect(scoreMeta(modern, e).meta).toBeCloseTo(1, 5);
    expect(scoreMeta({ ...modern, setCode: 'SVI' }, e).meta!).toBeLessThan(0.95);
  });

  it('só o nome vale pouco', () => {
    expect(scoreMeta(pikachu, evidence('', 'Pikachu')).meta!).toBeLessThan(0.5);
  });
});

describe('rankCandidates (só metadados)', () => {
  it('escolhe a impressão exata quando OCR e catálogo concordam', () => {
    const result = rankCandidates([jungle, pikachu, modern], evidence('58/102', 'Pikachu'));
    expect(result.best?.candidate.id).toBe('base1-58');
    expect(result.decision).toBe('confident');
    expect(result.best?.visual).toBeNull();
  });

  it('número ilegível com só o nome gera "nenhum", nunca chute confiante', () => {
    const result = rankCandidates([pikachu, jungle, modern], evidence('', 'Pikachu'));
    expect(result.decision).toBe('none');
  });

  it('empate real vira "incerto" com alternativas', () => {
    const twin: CandidateInfo = { ...pikachu, id: 'xx-58', setId: 'xx' };
    const result = rankCandidates([pikachu, twin], evidence('58/102', 'Pikachu'));
    expect(result.decision).not.toBe('confident');
    expect(result.ranked).toHaveLength(2);
  });

  it('sem candidatos devolve "nenhum"', () => {
    expect(rankCandidates([], evidence('58/102')).decision).toBe('none');
  });
});

describe('características visuais', () => {
  const cardA = syntheticCard(1);
  const cardB = syntheticCard(2);
  const flat = [{ x: 0, y: 0 }, { x: 629, y: 0 }, { x: 629, y: 879 }, { x: 0, y: 879 }] as Quad;

  it('a mesma carta fotografada em perspectiva fica muito mais perto dela mesma que de outra', () => {
    const quad: Quad = [{ x: 200, y: 70 }, { x: 410, y: 40 }, { x: 440, y: 350 }, { x: 230, y: 330 }];
    const photo = rectify(renderScene(cardA, quad, 640, 480, { noise: 12 }), quad, 630, 880)!;
    const featuresPhoto = computeFeatures(photo);
    const same = compareFeatures(featuresPhoto, computeFeatures(rectify(cardA, flat, 630, 880)!));
    const other = compareFeatures(featuresPhoto, computeFeatures(rectify(cardB, flat, 630, 880)!));
    expect(same.combined).toBeGreaterThan(0.85);
    expect(other.combined).toBeLessThan(0.75);
  });

  it('hamming e serialização', () => {
    const features = computeFeatures(cardA);
    expect(hamming(features.artHash, features.artHash)).toBe(0);
    expect(featuresFromJson(featuresToJson(features))).toEqual(features);
    expect(features.fullHash).toHaveLength(32);
    expect(features.color).toHaveLength(48);
  });

  it('o ranking usa a visual para desempatar candidatos com os mesmos metadados', () => {
    const photoFeatures = computeFeatures(cardA);
    const a: CandidateInfo = { ...pikachu, features: computeFeatures(cardA) };
    const b: CandidateInfo = { ...pikachu, id: 'xx-58', setId: 'xx', features: computeFeatures(cardB) };
    const result = rankCandidates([b, a], { ...evidence('58/102', 'Pikachu'), features: photoFeatures });
    expect(result.best?.candidate.id).toBe('base1-58');
    expect(result.decision).toBe('confident');
    expect(result.best?.visual).toBeGreaterThan(0.9);
  });
});
