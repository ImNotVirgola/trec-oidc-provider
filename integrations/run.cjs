console.log('AVVIO: caricamento configurazione');
const {loadConfig}=require('./runtime/config.cjs');
async function main() {
  const mode=process.argv[2];if(!['server','client'].includes(mode))throw Error('Uso: node integrations/run.cjs server|client');
  const config=loadConfig();
  console.log('AVVIO: configurazione caricata');
  if(mode==='client') {
    const server=await require('./local-client/client.cjs').createClient(config);
    const url=new URL(config.clientOrigin);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(url.port||80),config.clientBindHost,resolve);});
    console.log('CLIENT_READY='+config.clientOrigin);return;
  }
  const verifier=await require('./server/verifier.cjs').createVerifier(config,console.log);
  try {
    console.log('AVVIO: creazione server OIDC');
    const app=await require('./server/app.cjs').createServer({config,...verifier});
    console.log('AVVIO: apertura porta HTTP');
    const url=new URL(config.issuer);await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(Number(url.port||80),config.bindHost,resolve);});
    console.log('OIDC_SERVER_READY='+config.issuer);
    let stopping=false;
    async function stop(){if(stopping)return;stopping=true;app.server.closeAllConnections();await new Promise(r=>app.server.close(r));await verifier.close();}
    process.once('SIGINT',()=>void stop().catch(()=>process.exit(1)));process.once('SIGTERM',()=>void stop().catch(()=>process.exit(1)));
  }catch(e){await verifier.close().catch(()=>{});throw e;}
}
main().catch(error=>{console.error('AVVIO_FALLITO: '+(/Configurare|Verifier non avviato|Uso:|non valid|non valida|incoerente/.test(error.message)?error.message:'controllare configurazione, dipendenze e porte. Nessun segreto mostrato.'));process.exitCode=1;});
