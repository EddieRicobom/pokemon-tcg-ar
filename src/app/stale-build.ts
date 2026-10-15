/**
 * Versão antiga da página depois de uma atualização.
 *
 * O app é um PWA: um Service Worker novo assume sozinho e apaga os arquivos da versão anterior. Uma página que já
 * estava aberta (ou guardada na memória do celular) continua com o código antigo e, ao pedir um pedaço carregado sob
 * demanda (`import()` do AR, da Caixa…), recebe "Failed to fetch dynamically imported module", porque o arquivo
 * com aquele nome não existe mais. A saída é recarregar a página uma vez, para pegar a versão nova.
 */

const STALE_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
];

/** O erro é de um arquivo da versão anterior que sumiu? */
export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return STALE_PATTERNS.some((pattern) => pattern.test(message));
}

const RELOAD_KEY = 'tcg-ar-stale-reload-v1';
/** Dentro desta janela, uma segunda tentativa não recarrega de novo (evita laço se o problema for outro, como estar sem rede). */
export const RELOAD_COOLDOWN_MS = 60_000;

export interface ReloadEnv {
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
  reload: () => void;
}

/** Recarrega a página no máximo uma vez por minuto. Devolve true se mandou recarregar. */
export function reloadOnce(env: ReloadEnv): boolean {
  const now = env.now();
  try {
    const last = Number(env.storage?.getItem(RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) return false;
    env.storage?.setItem(RELOAD_KEY, String(now));
  } catch {
    // Sem armazenamento (modo privado): recarrega mesmo assim; o risco de laço só existe com armazenamento que falha só na leitura.
  }
  env.reload();
  return true;
}

export const STALE_MESSAGE_PT = 'O app foi atualizado e esta tela ainda era da versão antiga. Estou recarregando; se o erro voltar, feche o app e abra de novo.';

export interface ChunkLoaderDeps {
  reload: () => boolean;
  /** Pede ao navegador para procurar a versão nova do Service Worker (melhor esforço). */
  checkForUpdate?: () => Promise<unknown>;
}

/**
 * Carrega um pedaço sob demanda. Se o arquivo da versão antiga sumiu, recarrega a página (uma vez) e devolve um erro
 * em português; qualquer outro erro passa como estava.
 */
export async function loadChunk<T>(loader: () => Promise<T>, deps: ChunkLoaderDeps = defaultDeps()): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (!isStaleChunkError(error)) throw error;
    void deps.checkForUpdate?.()?.catch(() => undefined);
    if (deps.reload()) throw new Error(STALE_MESSAGE_PT);
    throw new Error(
      'Não consegui baixar uma parte do app. Confira a internet e, se continuar, feche o app e abra de novo para pegar a versão nova.',
    );
  }
}

function defaultDeps(): ChunkLoaderDeps {
  return {
    reload: () => reloadOnce(browserReloadEnv()),
    checkForUpdate: () => navigator.serviceWorker?.getRegistration().then((registration) => registration?.update()) ?? Promise.resolve(),
  };
}

export function browserReloadEnv(win: Window = window): ReloadEnv {
  let storage: Storage | null = null;
  try {
    storage = win.sessionStorage;
  } catch {
    storage = null;
  }
  return { storage, now: () => Date.now(), reload: () => win.location.reload() };
}

/** Há uma câmera aberta agora? Nesse caso a página não recarrega sozinha por causa de uma atualização. */
export function hasLiveCamera(doc: Document): boolean {
  for (const video of Array.from(doc.querySelectorAll('video'))) {
    const stream = video.srcObject as MediaStream | null;
    if (stream && typeof stream.getTracks === 'function' && stream.getTracks().some((t) => t.readyState === 'live')) return true;
  }
  return false;
}

/**
 * Liga o aviso global de troca de Service Worker (versão nova assumindo uma página que já estava aberta).
 * O arquivo sumido em `import()` é tratado por `loadChunk`; o evento `vite:preloadError` fica de fora de propósito,
 * porque cancelá-lo faz o `import()` devolver `undefined` em vez de falhar.
 */
export function watchForNewVersion(win: Window & typeof globalThis = window): void {
  const env = browserReloadEnv(win);
  const sw = win.navigator.serviceWorker;
  if (!sw) return;
  // Na primeira instalação ainda não há controlador; só uma troca depois disso é uma atualização.
  let hadController = Boolean(sw.controller);
  sw.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    // Com a câmera aberta, deixa quem está usando terminar: o carregamento sob demanda recarrega se precisar.
    if (hasLiveCamera(win.document)) return;
    reloadOnce(env);
  });
}
