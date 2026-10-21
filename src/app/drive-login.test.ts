import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectDrive, prepareDriveLogin, revokeDrive } from './drive-login';
import { DRIVE_SCOPE } from './drive-backup';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('autorização Google em memória', () => {
  it('pede somente appdata, inicia no gesto e devolve token sem gravar no storage', async () => {
    const before = { ...localStorage };
    const requestAccessToken = vi.fn(); let reply: (r: unknown) => void = () => {};
    const initTokenClient = vi.fn((options) => { reply = options.callback; return { requestAccessToken }; });
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
    const pending = connectDrive('client.apps.googleusercontent.com');
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(initTokenClient.mock.calls[0]![0].scope).toBe(DRIVE_SCOPE);
    reply({ access_token: 'test', expires_in: 3600, scope: DRIVE_SCOPE });
    expect((await pending).token).toBe('test'); expect({ ...localStorage }).toEqual(before);
  });
  it('recusa permissão incompleta e informa cancelamento do popup', async () => {
    const initTokenClient = vi.fn((options) => ({ requestAccessToken: () => options.callback({ access_token: 'test', scope: 'email' }) }));
    vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
    await expect(connectDrive('client')).rejects.toThrow('não foi autorizado');
    initTokenClient.mockImplementation((options) => ({ requestAccessToken: () => options.error_callback() }));
    await expect(connectDrive('client')).rejects.toThrow('cancelado');
  });
  it('revoga o token ao desconectar', () => {
    const revoke = vi.fn(); vi.stubGlobal('google', { accounts: { oauth2: { revoke } } }); revokeDrive('test'); expect(revoke).toHaveBeenCalledWith('test', expect.any(Function));
  });
  it('permite tentar novamente se o carregamento do SDK expirar', async () => {
    vi.stubGlobal('google', undefined); vi.useFakeTimers();
    vi.spyOn(document.head, 'append').mockImplementation(() => {});
    const pending = prepareDriveLogin(), assertion = expect(pending).rejects.toThrow('carregar o login');
    await vi.advanceTimersByTimeAsync(20_000); await assertion;
    expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).toBeNull();
    const retry = prepareDriveLogin(), next = expect(retry).rejects.toThrow('carregar o login');
    await vi.advanceTimersByTimeAsync(20_000); await next;
  });
});
