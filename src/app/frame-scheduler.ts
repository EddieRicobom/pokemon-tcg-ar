type PendingFrame = { raf: number | null; timeout: number | null };

let nextHandle = 1;
const pending = new Map<number, PendingFrame>();

/** Agenda quadros só na cadência escolhida; automático continua sincronizado à tela. */
export function requestGameFrame(callback: FrameRequestCallback, maxFps: () => number): number {
  const handle = nextHandle++;
  const frame: PendingFrame = { raf: null, timeout: null };
  pending.set(handle, frame);
  const run = (timestamp: number) => {
    if (!pending.delete(handle)) return;
    callback(timestamp);
  };
  const fps = maxFps();
  if (!Number.isFinite(fps) || fps <= 0) {
    frame.raf = requestAnimationFrame(run);
  } else {
    // Aguarda quase todo o intervalo e deixa o navegador alinhar o desenho ao próximo VSync.
    frame.timeout = window.setTimeout(() => {
      if (pending.has(handle)) frame.raf = requestAnimationFrame(run);
    }, Math.max(0, 1000 / fps - 2));
  }
  return handle;
}

export function cancelGameFrame(handle: number): void {
  const frame = pending.get(handle);
  if (!frame) return;
  pending.delete(handle);
  if (frame.timeout !== null) window.clearTimeout(frame.timeout);
  if (frame.raf !== null) cancelAnimationFrame(frame.raf);
}
