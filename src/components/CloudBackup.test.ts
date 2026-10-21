import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), connect: vi.fn(), list: vi.fn(), upload: vi.fn(), download: vi.fn(), build: vi.fn(), parse: vi.fn(), serialize: vi.fn(), revoke: vi.fn() }));
vi.mock('../app/drive-login', () => ({ prepareDriveLogin: mocks.prepare, connectDrive: mocks.connect, revokeDrive: mocks.revoke }));
vi.mock('../app/drive-backup', () => ({ DriveBackup: class { list = mocks.list; upload = mocks.upload; download = mocks.download; } }));
vi.mock('../app/backup', () => ({ buildFullBackup: mocks.build, parseBackupZip: mocks.parse, serializeBackupZip: mocks.serialize }));
import CloudBackup from './CloudBackup.vue';
let app: App, host: HTMLElement;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await nextTick(); };
const click = async (label: string) => { const button = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(label)); expect(button).toBeDefined(); button!.click(); await flush(); };
function mount(restore = vi.fn()): void { host = document.createElement('div'); document.body.append(host); app = createApp({ render: () => h(CloudBackup, { onRestore: restore }) }); app.mount(host); }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'example.apps.googleusercontent.com');
  mocks.prepare.mockResolvedValue(undefined); mocks.connect.mockResolvedValue({ token: 'token-test', expiresAt: Date.now() + 60000 });
  mocks.list.mockResolvedValue([{ id: 'abc', name: 'save.zip', size: 123, modifiedTime: '2026-10-21T12:00:00Z' }]);
  mocks.build.mockResolvedValue({ data: {} }); mocks.serialize.mockReturnValue(Uint8Array.from([1])); mocks.upload.mockResolvedValue(undefined);
});
afterEach(() => { app?.unmount(); host?.remove(); vi.unstubAllEnvs(); });
const login = async () => { await click('Preparar'); await click('Conectar'); };
describe('backup em nuvem — ações explícitas', () => {
  it('sem configuração informa indisponibilidade e não chama o Google', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', ''); mount();
    expect(host.textContent).toContain('habilitado pelo responsável'); expect(host.querySelector('button')).toBeNull(); expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('não envia automaticamente ao conectar; envia só após pedir e mantém token fora do storage', async () => {
    const before = { ...localStorage }; mount(); await login();
    expect(mocks.upload).not.toHaveBeenCalled(); await click('Enviar');
    expect(mocks.upload).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('Backup enviado');
    expect({ ...localStorage }).toEqual(before);
  });
  it('valida download e pede confirmação ao pai, sem restaurar diretamente', async () => {
    const restore = vi.fn(), file = { exportedAt: '2026-10-21', data: {} }; mocks.parse.mockReturnValue(file); mocks.download.mockResolvedValue(Uint8Array.from([1]));
    mount(restore); await login(); await click('Restaurar'); expect(restore).toHaveBeenCalledWith(file); expect(host.textContent).toContain('confirmação de restauração');
  });
  it('não solicita restauração de arquivo corrompido', async () => {
    const restore = vi.fn(); mocks.parse.mockReturnValue('backup-invalido'); mocks.download.mockResolvedValue(Uint8Array.from([1]));
    mount(restore); await login(); await click('Restaurar'); expect(restore).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toContain('Nada foi restaurado');
  });
  it('informa falha de envio sem mensagem de sucesso e permite tentar de novo', async () => {
    mocks.upload.mockRejectedValue(new Error('Rede indisponível')); mount(); await login(); await click('Enviar'); expect(host.textContent).not.toContain('Backup enviado'); expect(host.textContent).toContain('Rede indisponível');
    mocks.upload.mockResolvedValue(undefined); await click('Enviar'); expect(host.textContent).toContain('Backup enviado');
  });
  it('desconecta e apaga a lista da conta anterior', async () => {
    mount(); await login(); await click('Desconectar'); expect(mocks.revoke).toHaveBeenCalledWith('token-test'); expect(host.querySelector('.cloud-copies')).toBeNull(); expect(host.textContent).toContain('Conectar ao Google Drive');
  });
});
