const http=require('node:http');
async function port(){const s=http.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
function browser(){const jars=new Map();return async(url,options={})=>{
  const origin=new URL(url).origin,jar=jars.get(origin)||new Map();jars.set(origin,jar);
  const response=await fetch(url,{...options,redirect:'manual',headers:{...options.headers,cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')}});
  for(const raw of response.headers.getSetCookie()){const item=raw.split(';')[0],i=item.indexOf('=');jar.set(item.slice(0,i),item.slice(i+1));}return response;
};}
async function reachLogin(b,url){for(let n=0;n<12;n++){const r=await b(url);if(r.status===200&&new URL(url).pathname.startsWith('/interaction/'))return{url,html:await r.text(),uid:new URL(url).pathname.split('/')[2]};const location=r.headers.get('location');if(!location)throw Error('Authorization did not reach QR page: '+r.status);url=new URL(location,url).href;}throw Error('Redirect loop');}
async function resume(b,response,url,redirectUri){for(let n=0;n<12;n++){const location=response.headers.get('location');if(!location)throw Error('Authorization did not return a code: '+response.status);url=new URL(location,url).href;if(url.startsWith(redirectUri+'?'))return url;response=await b(url);}throw Error('Redirect loop');}
function csrf(html){const value=html.match(/name="csrf" value="([^"]+)"/);if(!value)throw Error('Missing CSRF');return value[1];}
async function close(server){if(!server)return;server.closeAllConnections();await new Promise(r=>server.close(r));}
module.exports={port,browser,reachLogin,resume,csrf,close};
