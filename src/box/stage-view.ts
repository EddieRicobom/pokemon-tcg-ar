import { visibleVerticalFov } from './orientation';

/** O que a cena precisa saber do vídeo de fundo: só o tamanho dele (ainda 0×0 antes de `loadedmetadata`). */
export interface VideoSize {
  videoWidth: number;
  videoHeight: number;
}

/**
 * Proporção da imagem de fundo: a do vídeo, se ele já sabe o tamanho; senão a do próprio palco (sem vídeo, ou antes de
 * ele carregar, o fundo cobre o palco todo, então não há nada cortado).
 */
export function backdropAspect(width: number, height: number, video?: VideoSize | null): number {
  return video && video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : width / height;
}

/**
 * Campo de visão vertical da câmera virtual para um palco `width`×`height`. Com vídeo ele é exibido em "cover", então o
 * campo visível desconta o corte (`visibleVerticalFov`); sem vídeo o campo é o próprio `fovDeg`.
 */
export function stageVerticalFov(width: number, height: number, fovDeg: number, video?: VideoSize | null): number {
  return visibleVerticalFov(fovDeg, backdropAspect(width, height, video), width / height);
}

/**
 * A câmera do palco virtual: de frente para a arena, olhando para baixo o bastante para o centro da tela encontrar o chão
 * a `distance` metros (a distância máxima em que a arena da batalha é posta, para o cenário e a luta ficarem alinhados).
 */
export const VIRTUAL_YAW_RAD = 0;
export function virtualPitchRad(phoneHeightM: number, distanceM: number): number {
  return -Math.atan2(phoneHeightM, distanceM);
}
