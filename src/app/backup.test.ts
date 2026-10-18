import { beforeEach, describe, expect, it } from 'vitest';
import { applyBackup, BACKUP_FORMAT, BACKUP_KEYS, backupFileName, buildBackup, parseBackup, parseBackupZip, serializeBackup, serializeBackupZip } from './backup';

const NOW = '2026-10-16T12:00:00.000Z';

describe('backup — exportar', () => {
  beforeEach(() => localStorage.clear());

  it('junta todas as chaves conhecidas, com null pra quem não existe no aparelho', () => {
    localStorage.setItem('tcg-ar-trainer-v1', '{"xp":100}');
    localStorage.setItem('tcg-ar-perfil-v1', '{"name":"Ash"}');
    const file = buildBackup(localStorage, NOW);
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.exportedAt).toBe(NOW);
    expect(file.data['tcg-ar-trainer-v1']).toBe('{"xp":100}');
    expect(file.data['tcg-ar-perfil-v1']).toBe('{"name":"Ash"}');
    expect(file.data['tcg-ar-vila-v1']).toBeNull();
    expect(Object.keys(file.data).sort()).toEqual([...BACKUP_KEYS].sort());
  });

  it('nunca inclui um cache de PokeAPI/TCGdex ou as cartas escaneadas (IndexedDB)', () => {
    localStorage.setItem('tcg-ar-dex-names-v1', '[[1,"Bulbasaur"]]');
    localStorage.setItem('tcg-ar-profile-25', '{}');
    const file = buildBackup(localStorage, NOW);
    expect(Object.keys(file.data)).not.toContain('tcg-ar-dex-names-v1');
    expect(Object.keys(file.data)).not.toContain('tcg-ar-profile-25');
  });

  it('serializa como JSON legível e com um nome de arquivo datado', () => {
    const file = buildBackup(localStorage, NOW);
    expect(() => JSON.parse(serializeBackup(file))).not.toThrow();
    expect(backupFileName(new Date(NOW))).toBe('pokemon-tcg-ar-backup-2026-10-16.zip');
  });

  it('empacota o manifesto e recupera o backup ZIP', () => {
    const file = buildBackup(localStorage, NOW);
    const parsed = parseBackupZip(serializeBackupZip(file));
    expect(parsed).toEqual(file);
  });
});

describe('backup — importar', () => {
  beforeEach(() => localStorage.clear());

  it('ida e volta: exporta, limpa o aparelho, importa de volta — tudo igual', () => {
    localStorage.setItem('tcg-ar-trainer-v1', '{"xp":500}');
    localStorage.setItem('tcg-ar-vila-v1', '{"coins":10}');
    const file = buildBackup(localStorage, NOW);
    const text = serializeBackup(file);
    localStorage.clear();
    const parsed = parseBackup(text);
    expect(parsed).not.toBe('json-invalido');
    expect(parsed).not.toBe('formato-desconhecido');
    applyBackup(parsed as Exclude<typeof parsed, string>, localStorage);
    expect(localStorage.getItem('tcg-ar-trainer-v1')).toBe('{"xp":500}');
    expect(localStorage.getItem('tcg-ar-vila-v1')).toBe('{"coins":10}');
  });

  it('uma chave ausente no backup é removida do aparelho ao restaurar (restauração completa, não soma)', () => {
    localStorage.setItem('tcg-ar-perfil-v1', '{"name":"velho"}');
    const file = buildBackup(localStorage, NOW); // perfil entra como null porque nunca foi setado? não, foi setado acima
    // Agora simula um backup de outro perfil, sem o perfil setado:
    localStorage.clear();
    applyBackup(file, localStorage); // esse `file` tem o perfil antigo
    expect(localStorage.getItem('tcg-ar-perfil-v1')).toBe('{"name":"velho"}');
    const empty = buildBackup({ getItem: () => null }, NOW);
    applyBackup(empty, localStorage);
    expect(localStorage.getItem('tcg-ar-perfil-v1')).toBeNull();
  });

  it('nunca toca numa chave fora de BACKUP_KEYS', () => {
    localStorage.setItem('tcg-ar-dex-names-v1', '[[1,"Bulbasaur"]]');
    const empty = buildBackup({ getItem: () => null }, NOW);
    applyBackup(empty, localStorage);
    expect(localStorage.getItem('tcg-ar-dex-names-v1')).toBe('[[1,"Bulbasaur"]]');
  });

  it('JSON inválido ou formato desconhecido vira um erro claro, nunca lança e nunca inventa dados', () => {
    expect(parseBackup('{isso não é json')).toBe('json-invalido');
    expect(parseBackup('{}')).toBe('formato-desconhecido');
    expect(parseBackup(JSON.stringify({ format: 'outra-coisa', version: 1, data: {} }))).toBe('formato-desconhecido');
  });

  it('ignora chaves desconhecidas dentro do arquivo e descarta valores não-string pras conhecidas', () => {
    const raw = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: NOW,
      data: { 'tcg-ar-trainer-v1': 123, 'tcg-ar-perfil-v1': '{"name":"Ash"}', 'chave-que-nao-existe': 'x' },
    });
    const parsed = parseBackup(raw);
    expect(parsed).not.toBe('json-invalido');
    expect(parsed).not.toBe('formato-desconhecido');
    const f = parsed as Exclude<typeof parsed, string>;
    expect(f.data['tcg-ar-trainer-v1']).toBeNull();
    expect(f.data['tcg-ar-perfil-v1']).toBe('{"name":"Ash"}');
    expect(Object.keys(f.data)).not.toContain('chave-que-nao-existe');
  });
});
