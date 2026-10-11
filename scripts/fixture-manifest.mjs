import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const path='tests/fixtures/manifest.json',manifest=JSON.parse(await readFile(path,'utf8'));
for(const[name,expected]of Object.entries(manifest.hashes)){const actual=createHash('sha256').update(await readFile(join('tests/fixtures',name))).digest('hex');if(actual!==expected)throw new Error('Fixture hash mismatch: '+name);}
process.stdout.write('Verified '+Object.keys(manifest.hashes).length+' owned fixture hashes.\n');
