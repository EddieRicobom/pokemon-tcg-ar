/**
 * Normalização local de contraste do quadro da câmera (ideia do projeto Momentoos, também em cima do MindAR).
 *
 * Por que: o detector do MindAR usa limiares absolutos de contraste (em níveis de cinza). Com sombra (a mão, o
 * celular), contra-luz ou um lado da carta bem mais escuro, os pontos de interesse da parte sombreada somem e a
 * carta não é reconhecida nem rastreada.
 *
 * O que faz: em cada pixel, tira a média local e escala para um desvio-padrão local alvo, limitando o ganho (um
 * ganho alto transformaria o ruído de uma área lisa em "textura"). Janela de caixa separável (duas passadas 1-D), calculada em meia resolução para pesar pouco.
 * Como nenhum dos dois quadros (normalizado e cru) é melhor sempre, o rastreador alterna entre eles (1 normalizado
 * a cada 3): basta UM quadro bom para reconhecer, e o cru cobre a pouca luz com muito ruído e poupa a GPU.
 */
import type * as TF from '@tensorflow/tfjs';

export interface NormalizeOptions {
  /** Lado da janela local, em pixels do quadro de rastreamento. */
  window: number;
  /** Desvio-padrão local desejado, em níveis de cinza (0–255). */
  targetStd: number;
  /** Ganho máximo. */
  maxGain: number;
}

export const DEFAULT_NORMALIZE: NormalizeOptions = { window: 33, targetStd: 35, maxGain: 3 };

type Tf = typeof TF;

/**
 * `gray`: tensor [altura, largura] com valores 0–255. Devolve um tensor NOVO (a entrada não é alterada nem
 * liberada). Quem chama libera os dois.
 */
export function normalizeLocalContrast(tf: Tf, gray: TF.Tensor2D, options: NormalizeOptions = DEFAULT_NORMALIZE): TF.Tensor2D {
  const { window, targetStd, maxGain } = options;
  const [height, width] = gray.shape;
  return tf.tidy(() => {
    // Em 0..1: aparelhos com textura de 16 bits perderiam precisão com x² até 65025.
    const x = gray.div(255).expandDims(0).expandDims(-1) as TF.Tensor4D;
    // Média e desvio locais variam devagar: calcula numa versão reduzida à metade (janela também pela metade, ~8x
    // menos conta que no quadro cheio) e amplia os mapas. O quadro de rastreamento em si continua na resolução cheia.
    const half = Math.max(3, Math.round(window / 2) | 1);
    const small = tf.avgPool(x, [2, 2], 2, 'same') as TF.Tensor4D;
    const box = (t: TF.Tensor4D): TF.Tensor4D => tf.avgPool(tf.avgPool(t, [half, 1], 1, 'same'), [1, half], 1, 'same');
    const mean = box(small);
    const dev = small.sub(mean) as TF.Tensor4D;
    const std = box(dev.square() as TF.Tensor4D).add(1e-6).sqrt();
    const gain = tf.scalar(targetStd / 255).div(std).minimum(maxGain) as TF.Tensor4D;
    const up = (t: TF.Tensor4D): TF.Tensor4D => tf.image.resizeBilinear(t, [height, width]) as TF.Tensor4D;
    const out = x.sub(up(mean)).mul(up(gain)).mul(255).add(128).clipByValue(0, 255);
    return out.squeeze([0, 3]) as TF.Tensor2D;
  });
}

/** Normaliza 1 quadro a cada `every` (o primeiro é normalizado); os outros seguem crus. */
export class FrameAlternator {
  private count = 0;

  constructor(private readonly every = 3) {}

  /** true = normalizar este quadro. */
  next(): boolean {
    this.count += 1;
    return (this.count - 1) % this.every === 0;
  }
}
