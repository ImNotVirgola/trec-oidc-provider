const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify({strict=false,root=path.join(__dirname,'..')}={}){const manifest=require(strict?'./upstream-manifest.json':'./compatibility.json');for(const [name,hash] of Object.entries(manifest.files)){
 const file=path.join(root,name);if(!fs.existsSync(file))throw new Error('File originale mancante: '+name);
 let bytes=fs.readFileSync(file);if(!strict&&!name.endsWith('.tgz'))bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('Sorgente non compatibile con il commit supportato: '+name+'. Nessun file originale modificato.');
}return Object.keys(manifest.files).length;}
module.exports={verify};if(require.main===module)console.log('COMPATIBLE_ORIGINAL_FILES='+verify({strict:process.argv.includes('--strict')}));
