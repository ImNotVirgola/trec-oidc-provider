const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function verify(){const manifest=require('./upstream-manifest.json');for(const [name,hash] of Object.entries(manifest.files)){
 const file=path.join(__dirname,'..',name);if(!fs.existsSync(file)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==hash)throw new Error('File originale modificato: '+name);
}return Object.keys(manifest.files).length;}
module.exports={verify};if(require.main===module)console.log('ORIGINAL_FILES_UNCHANGED='+verify());
