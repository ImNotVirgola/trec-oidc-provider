const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.env.TREC_DATA_DIR || path.resolve(__dirname, '..', '.oidc-data');
let key;
function init() {
  if (key) return;
  const value = process.env.OIDC_STORAGE_KEY;
  if (!/^[a-f0-9]{64}$/i.test(value || '')) throw new Error('OIDC_STORAGE_KEY mancante o non valida.');
  key = Buffer.from(value, 'hex');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
}
function file(model, id) {
  init();
  const name = crypto.createHash('sha256').update(JSON.stringify([model, id])).digest('hex');
  return path.join(root, name + '.json');
}
function decode(filename) {
  const box = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'hex'));
  decipher.setAAD(Buffer.from(path.basename(filename)));
  decipher.setAuthTag(Buffer.from(box.tag, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString());
}
function put(model, id, payload, expiresAt = null) {
  const target = file(model, id);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(path.basename(target)));
  const data = Buffer.concat([cipher.update(JSON.stringify({ model, id, payload, expiresAt })), cipher.final()]);
  const tmp = target + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') }));
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(tmp, target);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
function remove(model, id) {
  try { fs.unlinkSync(file(model, id)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
function getRecord(model, id) {
  const target = file(model, id);
  let record;
  try { record = decode(target); } catch (e) { if (e.code === 'ENOENT') return undefined; throw e; }
  if (record.model !== model || record.id !== id) throw new Error('Record archivio non coerente.');
  if (record.expiresAt !== null && record.expiresAt <= Date.now()) { remove(model, id); return undefined; }
  return record;
}
function scan(predicate) {
  init();
  const found = [];
  for (const name of fs.readdirSync(root)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const record = decode(path.join(root, name));
    if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
      remove(record.model, record.id);
    } else if (predicate(record)) found.push(record);
  }
  return found;
}
module.exports = { put, remove, getRecord, scan };
