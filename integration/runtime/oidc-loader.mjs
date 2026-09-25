import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hashes=JSON.parse(await readFile(new URL('./dependency-hashes.json',import.meta.url),'utf8'));
const base=new URL('../node_modules/oidc-provider/',import.meta.url).href;
function one(s,old,value){if(s.split(old).length!==2)throw Error('Versione oidc-provider incompatibile');return s.replace(old,value);}
export async function load(url,context,nextLoad){const result=await nextLoad(url,context);if(!url.startsWith(base))return result;
 const name=url.slice(base.length);if(!hashes[name])return result;
 let s=String(result.source);if(createHash('sha256').update(s).digest('hex')!==hashes[name])throw Error('Dipendenza modificata: '+name);
 if(name==='lib/models/id_token.js')s=one(s,"issuer: process.env.DID_ID || 'NOT-AVAILABLE',",'issuer: provider.issuer,');
 else {
  s=one(s,'const oldSessionId = Object.keys(ctx.req.sessionStore.sessions)[0]\n      const oldSession = JSON.parse(ctx.req.sessionStore.sessions[oldSessionId])\n      const customData = oldSession.customData',
   `const account = sub ? await instance(provider).configuration('findAccount')(ctx, sub) : undefined;
      if (sub && !account) throw new Error('Verified account unavailable');
      const customData = scope?.split(' ').includes('trec') ? (await account?.claims('access_token', scope))?.trec : undefined;`);
  s=one(s,"aud: process.env.TREC_ID || 'c_24f7d433899443d68ca84ad4913ec53f',",'aud: aud || clientId,');
 }
 return {...result,source:s};
}
