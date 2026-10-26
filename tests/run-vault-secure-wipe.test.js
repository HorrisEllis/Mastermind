'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { t, summary, assert } = require('./harness');

const electron = require('electron');
const { app, ipcMain } = electron;
app._paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-userdata-securewipe-'));

require('../main.js');

async function run() {
  console.log('\n== vault secure wipe ==');

  await t('wipes a real vault file: content overwritten, then deleted', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-vault-'));
    const vaultPath = path.join(dir, 'mastermind.vault');
    const original = Buffer.from('{"secret":"this is the plaintext-adjacent ciphertext blob"}'.repeat(50));
    fs.writeFileSync(vaultPath, original);

    const res = await ipcMain.invoke('vault:secureWipe', vaultPath);
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.deepStrictEqual(res.wiped, [vaultPath]);
    assert.strictEqual(fs.existsSync(vaultPath), false, 'vault file must be gone after secure wipe');
  });

  await t('also wipes backup snapshots sitting next to the vault, not just the vault itself', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-vault-'));
    const vaultPath = path.join(dir, 'mastermind.vault');
    fs.writeFileSync(vaultPath, 'current vault content');
    const backup1 = path.join(dir, 'mastermind.vault.backup.1000.json');
    const backup2 = path.join(dir, 'mastermind.vault.backup.2000.json');
    fs.writeFileSync(backup1, 'older backup content');
    fs.writeFileSync(backup2, 'newer backup content');
    // Something else in the same dir that must NOT be touched
    const unrelated = path.join(dir, 'not-a-vault-file.txt');
    fs.writeFileSync(unrelated, 'leave me alone');

    const res = await ipcMain.invoke('vault:secureWipe', vaultPath);
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.strictEqual(res.wiped.length, 3, 'expected vault + 2 backups wiped, got: ' + JSON.stringify(res.wiped));
    assert.strictEqual(fs.existsSync(vaultPath), false);
    assert.strictEqual(fs.existsSync(backup1), false);
    assert.strictEqual(fs.existsSync(backup2), false);
    assert.strictEqual(fs.existsSync(unrelated), true, 'unrelated files in the same directory must survive');
  });

  await t('nonexistent vault path fails honestly instead of reporting success', async () => {
    const res = await ipcMain.invoke('vault:secureWipe', '/definitely/does/not/exist/mastermind.vault');
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'NOT_FOUND');
  });

  await t('empty path is rejected explicitly, not passed through to the filesystem', async () => {
    const res = await ipcMain.invoke('vault:secureWipe', '');
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'NO_PATH');
  });

  await t('regular vault:delete (the non-secure wipe path) still works unchanged', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-vault-'));
    const vaultPath = path.join(dir, 'mastermind.vault');
    fs.writeFileSync(vaultPath, 'content');
    const ok = await ipcMain.invoke('vault:delete', vaultPath);
    assert.strictEqual(ok, true);
    assert.strictEqual(fs.existsSync(vaultPath), false);
  });

  await t('end-to-end: a backup created via the real vault:backup handler is found and wiped too', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-vault-'));
    const vaultPath = path.join(dir, 'mastermind.vault');
    fs.writeFileSync(vaultPath, 'v1');
    const backupRes = await ipcMain.invoke('vault:backup', vaultPath);
    assert.strictEqual(backupRes.ok, true, JSON.stringify(backupRes));
    assert.strictEqual(fs.existsSync(backupRes.backupPath), true, 'precondition: backup must actually exist');

    const res = await ipcMain.invoke('vault:secureWipe', vaultPath);
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.strictEqual(res.wiped.length, 2, 'expected vault + its real backup, got: ' + JSON.stringify(res.wiped));
    assert.strictEqual(fs.existsSync(vaultPath), false);
    assert.strictEqual(fs.existsSync(backupRes.backupPath), false);
  });

  const fails = summary('vault secure wipe');
  process.exitCode = fails ? 1 : 0;
}

run();
