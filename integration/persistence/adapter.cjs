const db = require('./storage.cjs');
class PersistentAdapter {
  constructor(name) { this.name = name; }
  async upsert(id, payload, expiresIn) {
    if (expiresIn !== undefined && (!Number.isFinite(expiresIn) || expiresIn < 0)) throw new Error('TTL non valido.');
    db.put(this.name, id, payload, expiresIn === undefined ? null : Date.now() + expiresIn * 1000);
  }
  async find(id) { return db.getRecord(this.name, id)?.payload; }
  async findByUid(uid) { return db.scan(r => r.model === this.name && r.payload.uid === uid)[0]?.payload; }
  async findByUserCode(code) { return db.scan(r => r.model === this.name && r.payload.userCode === code)[0]?.payload; }
  async consume(id) {
    const record = db.getRecord(this.name, id);
    if (record) db.put(this.name, id, { ...record.payload, consumed: Math.floor(Date.now() / 1000) }, record.expiresAt);
  }
  async destroy(id) { db.remove(this.name, id); }
  async revokeByGrantId(grantId) {
    for (const record of db.scan(r => r.payload.grantId === grantId)) db.remove(record.model, record.id);
  }
}
module.exports = PersistentAdapter;
