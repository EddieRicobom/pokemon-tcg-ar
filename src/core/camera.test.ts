import { describe, expect, it, vi } from 'vitest';
import {
  CameraError,
  classifyCameraError,
  startRearCamera,
  stopCamera,
  type CameraDeps,
  type VideoLike,
} from './camera';

function fakeStream() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream;
  return { stream, stop };
}

function fakeVideo(play: () => Promise<void> = () => Promise.resolve()): VideoLike {
  return { srcObject: null, muted: false, playsInline: false, play };
}

function namedError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

describe('classifyCameraError', () => {
  it('mapeia os erros conhecidos de getUserMedia', () => {
    expect(classifyCameraError(namedError('NotAllowedError'))).toBe('permission-denied');
    expect(classifyCameraError(namedError('SecurityError'))).toBe('permission-denied');
    expect(classifyCameraError(namedError('NotFoundError'))).toBe('not-found');
    expect(classifyCameraError(namedError('OverconstrainedError'))).toBe('not-found');
    expect(classifyCameraError(namedError('NotReadableError'))).toBe('in-use');
    expect(classifyCameraError(namedError('AbortError'))).toBe('in-use');
    expect(classifyCameraError(namedError('TypeError'))).toBe('unsupported');
  });

  it('usa "unknown" para o que não reconhece', () => {
    expect(classifyCameraError(namedError('AlgoNovo'))).toBe('unknown');
    expect(classifyCameraError('texto')).toBe('unknown');
    expect(classifyCameraError(null)).toBe('unknown');
  });
});

describe('startRearCamera', () => {
  it('falha com "insecure-context" fora de HTTPS e sem mediaDevices', async () => {
    const deps: CameraDeps = { isSecureContext: false, mediaDevices: undefined };
    await expect(startRearCamera(fakeVideo(), deps)).rejects.toMatchObject({
      code: 'insecure-context',
    });
  });

  it('falha com "unsupported" em HTTPS sem mediaDevices', async () => {
    const deps: CameraDeps = { isSecureContext: true, mediaDevices: undefined };
    await expect(startRearCamera(fakeVideo(), deps)).rejects.toMatchObject({
      code: 'unsupported',
    });
  });

  it('pede a câmera traseira, sem áudio, e liga o stream ao vídeo', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const video = fakeVideo();

    const result = await startRearCamera(video, {
      isSecureContext: true,
      mediaDevices: { getUserMedia },
    });

    expect(result).toBe(stream);
    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      }),
    );
  });

  it('converte a recusa de permissão em CameraError', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(namedError('NotAllowedError'));
    const promise = startRearCamera(fakeVideo(), {
      isSecureContext: true,
      mediaDevices: { getUserMedia },
    });

    await expect(promise).rejects.toBeInstanceOf(CameraError);
    await expect(promise).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('para as trilhas e solta o vídeo se o play() falhar', async () => {
    const { stream, stop } = fakeStream();
    const video = fakeVideo(() => Promise.reject(namedError('NotAllowedError')));

    await expect(
      startRearCamera(video, {
        isSecureContext: true,
        mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });

    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
  });
});

describe('stopCamera', () => {
  it('para todas as trilhas e limpa o vídeo', () => {
    const { stream, stop } = fakeStream();
    const video = fakeVideo();
    video.srcObject = stream;

    stopCamera(video, stream);

    expect(stop).toHaveBeenCalledTimes(2);
    expect(video.srcObject).toBeNull();
  });

  it('aceita nulos sem lançar erro', () => {
    expect(() => stopCamera(null, null)).not.toThrow();
  });
});
