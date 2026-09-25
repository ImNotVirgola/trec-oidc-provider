const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function read(name) { return fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n'); }
function replaceOne(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))];
  if (matches.length !== 1) throw new Error(label + ': struttura diversa da quella attesa; nessun file applicativo modificato.');
  return source.replace(pattern, replacement);
}
function prepare(index, provider) {
  if (index.includes('createLoginFlow') || provider.includes('PersistentProvider')) {
    if (index.includes('createLoginFlow') && provider.includes('PersistentProvider')) return null;
    throw new Error('Installazione parziale: controllare i backup prima di procedere.');
  }
  provider = replaceOne(provider, /new\s+Provider\s*\(/,
    "new (require('./persistence/provider.cjs').PersistentProvider(Provider))(", 'Costruttore provider');
  index = replaceOne(index, /app\.use\(\s*session\(\s*\{/,
    "app.use(session({\n        store: require('./persistence/session-store.cjs').createStore(session),", 'Sessioni Express');
  index = replaceOne(index, /app\.get\('\/interaction\/:uid',/,
    "const loginFlow = require('./verification/oidc-login.cjs').createLoginFlow({\n" +
    "        agent: app.locals.agent, provider, requestProof: verify.sendProofRequest\n    });\n\n" +
    "    app.get('/interaction/:uid',", 'Inizializzazione login');
  index = replaceOne(index, /const oobId = result\.oob\.id;?/,
    'const oobId = result.oob.id;\n                    await loginFlow.bindInvitation(req, uid, oobId);', 'Associazione invito');
  index = replaceOne(index, /app\.post\('\/interaction\/:uid\/login',[\s\S]*?\n[ \t]*\}\);/,
    "app.post('/interaction/:uid/login', (req, res, next) => {\n" +
    "        loginFlow.start(req, res).catch(next);\n    });", 'Route login');
  index = replaceOne(index, /app\.post\('\/interaction\/:uid\/abort',[\s\S]*?\n[ \t]*\}\);/,
    "app.post('/interaction/:uid/abort', async (req, res, next) => {\n" +
    "        try {\n" +
    "            const details = await provider.interactionDetails(req, res);\n" +
    "            loginFlow.cancel(details.uid, req.sessionID);\n" +
    "            if (req.session.oidcInvitations) delete req.session.oidcInvitations[details.uid];\n" +
    "            await new Promise((resolve, reject) => req.session.save(e => e ? reject(e) : resolve()));\n" +
    "            await provider.interactionFinished(req, res, {\n" +
    "                error: 'access_denied', error_description: 'Login annullato.'\n" +
    "            }, { mergeWithLastSubmission: false });\n" +
    "        } catch (error) { next(error); }\n    });", 'Route annullamento');
  if (/verify\.(setupConnectionListener|setUpProofDoneListener)\(/.test(index)) {
    throw new Error('Altri vecchi listener attivi: nessun file applicativo modificato.');
  }
  return { index, provider };
}

module.exports = {prepare};
