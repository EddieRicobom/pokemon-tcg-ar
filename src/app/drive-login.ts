import { DRIVE_SCOPE } from './drive-backup';
interface TokenReply { access_token?: string; expires_in?: number; error?: string; scope?: string }
interface GoogleOAuth {
  initTokenClient(options: { client_id: string; scope: string; callback: (reply: TokenReply) => void; error_callback: () => void }): { requestAccessToken(options: { prompt: string }): void };
  revoke(token: string, callback: () => void): void;
}
const oauth = (): GoogleOAuth | undefined => (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth } } }).google?.accounts?.oauth2;
let loading: Promise<void> | null = null;
export function prepareDriveLogin(): Promise<void> {
  if (oauth()) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    const timeout = setTimeout(() => fail(), 20_000);
    const fail = () => { clearTimeout(timeout); script.remove(); loading = null; reject(new Error('Não consegui carregar o login Google. Confira a conexão e tente novamente.')); };
    script.onload = () => { clearTimeout(timeout); if (oauth()) resolve(); else fail(); };
    script.onerror = fail; document.head.append(script);
  });
  return loading;
}
/** Chamar diretamente de um clique, com o SDK já preparado. Token só em memória. */
export function connectDrive(clientId: string): Promise<{ token: string; expiresAt: number }> {
  return new Promise((resolve, reject) => {
    const api = oauth(); if (!api) { reject(new Error('Prepare o login Google antes de conectar.')); return; }
    const client = api.initTokenClient({ client_id: clientId, scope: DRIVE_SCOPE,
      callback: (reply) => {
        if (!reply.access_token || reply.error || !reply.scope?.split(' ').includes(DRIVE_SCOPE)) { reject(new Error('O acesso à pasta de backup não foi autorizado.')); return; }
        resolve({ token: reply.access_token, expiresAt: Date.now() + Math.max(0, (reply.expires_in ?? 0) - 30) * 1000 });
      }, error_callback: () => reject(new Error('O login foi cancelado ou o navegador bloqueou a janela. Tente novamente.')),
    });
    client.requestAccessToken({ prompt: 'select_account' });
  });
}
export function revokeDrive(token: string): void { oauth()?.revoke(token, () => {}); }
