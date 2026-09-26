const fs = require('node:fs');
const path = require('node:path');
const { attributeNames, DEFAULT_DIRECTORY } = require('../setup/config.cjs');
function forIssuer(env, directory = DEFAULT_DIRECTORY) {
  const values = JSON.parse(fs.readFileSync(path.join(directory, 'credential-attributes.json'), 'utf8'));
  const attrs = { ...values, issuerDid: env.DID_ID, holderDid: env.HOLDER_DID_ID };
  for (const name of attributeNames) if (typeof attrs[name] !== 'string' || !attrs[name].trim()) throw Error('Attributo mancante o non valido: ' + name);
  return attributeNames.map(name => ({ name, value: attrs[name] }));
}
module.exports = { forIssuer };
