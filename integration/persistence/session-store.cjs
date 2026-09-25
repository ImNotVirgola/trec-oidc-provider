const db = require('./storage.cjs');
const model = 'ExpressSession';
function deadline(value) {
  const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 86400000;
  if (!Number.isFinite(expires)) throw new Error('Scadenza sessione non valida.');
  return expires;
}
function createStore(session) {
  return new class extends session.Store {
    get(id, cb) { try { const value = db.getRecord(model, id)?.payload; cb(null, value || null); } catch (e) { cb(e); } }
    set(id, value, cb = () => {}) { try { db.put(model, id, value, deadline(value)); cb(); } catch (e) { cb(e); } }
    destroy(id, cb = () => {}) { try { db.remove(model, id); cb(); } catch (e) { cb(e); } }
    touch(id, value, cb = () => {}) {
      try {
        const record = db.getRecord(model, id);
        if (record) db.put(model, id, { ...record.payload, cookie: value.cookie }, deadline(value));
        cb();
      } catch (e) { cb(e); }
    }
  }();
}
module.exports = { createStore };
