export interface Capabilities {
  /** Página servida por HTTPS (ou localhost): exigência do navegador para a câmera e o PWA. */
  secureContext: boolean;
  /** `navigator.mediaDevices.getUserMedia` disponível. */
  camera: boolean;
  /** Contexto WebGL2 disponível (necessário para o Three.js). */
  webgl2: boolean;
  /** Service Worker disponível (cache offline e instalação). */
  serviceWorker: boolean;
  /** App aberto a partir da tela inicial (instalado). */
  standalone: boolean;
}

/** Valores brutos lidos do navegador; separados para permitir testes sem DOM real. */
export interface CapabilitySources {
  isSecureContext: boolean;
  mediaDevices: { getUserMedia?: unknown } | undefined;
  serviceWorker: unknown;
  displayModeStandalone: boolean;
  iosStandalone: boolean;
  probeWebGL2: () => boolean;
}

export function evaluateCapabilities(sources: CapabilitySources): Capabilities {
  return {
    secureContext: sources.isSecureContext,
    camera: typeof sources.mediaDevices?.getUserMedia === 'function',
    webgl2: sources.probeWebGL2(),
    serviceWorker: sources.serviceWorker !== undefined && sources.serviceWorker !== null,
    standalone: sources.displayModeStandalone || sources.iosStandalone,
  };
}

function probeWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) return false;
    // Libera o contexto de teste: navegadores móveis limitam quantos contextos ficam vivos.
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function readBrowserSources(): CapabilitySources {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    isSecureContext: window.isSecureContext,
    mediaDevices: nav.mediaDevices,
    serviceWorker: 'serviceWorker' in nav ? nav.serviceWorker : undefined,
    displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    iosStandalone: nav.standalone === true,
    probeWebGL2,
  };
}

export function detectCapabilities(): Capabilities {
  return evaluateCapabilities(readBrowserSources());
}

/** iPhone, iPad e iPod (inclui iPadOS, que se identifica como Macintosh com toque). */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true;
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1;
}
