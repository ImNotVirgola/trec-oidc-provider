const config = require('./setup/config.cjs');
try {
  const source = process.argv[2];
  if (!source) throw Error('Uso: node integrations/configure.cjs /percorso/progetto-esistente');
  require('./verify-originals.cjs').verify();
  config.importExisting(source);
  console.log('CONFIG_IMPORTED: ID e chiavi personali mantenuti. Nuovi segreti per il client locale.');
  console.log('Nessun wallet creato e nessuna transazione inviata. Esegui node integrations/setup.cjs status.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
