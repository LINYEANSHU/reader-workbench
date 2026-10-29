import {expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const script=resolve('scripts/prepare-package-bundles.mjs');
const BACKUP_DIR='.reader-runtime',BACKUP=join(BACKUP_DIR,'package-json-before-pack.json');

const run=(args:string[])=>({promise:new Promise<{code:number|null;stdout:string;stderr:string}>((done,reject)=>{const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.once('error',reject);child.once('exit',code=>done({code,stdout,stderr}));}),});

it('restore refuses to overwrite a package.json edited after an interrupted pack',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'reader pack restore ')));
 try{
  await mkdir(join(directory,BACKUP_DIR),{recursive:true});
  // Seeded backup: the pristine source manifest the interrupted pack started from.
  const original='{\n  "name": "reader-workbench",\n  "version": "0.4.0",\n  "private": true\n}\n';
  // Current manifest: still carries the injected bundle state plus a user edit made afterwards.
  const edited='{\n  "name": "reader-workbench",\n  "version": "0.4.1",\n  "private": true,\n  "bundleDependencies": ["katex"],\n  "description": "user edit after the interrupted pack"\n}\n';
  await writeFile(join(directory,BACKUP),original,'utf8');
  await writeFile(join(directory,'package.json'),edited,'utf8');
  const result=await run([script,'restore','--directory',directory]).promise;
  expect(result.code,'restore must reject rather than silently discard the user edit').not.toBe(0);
  expect(result.stderr).toContain('recovery required');
  expect(await readFile(join(directory,'package.json'),'utf8'),'the edited manifest must remain byte-identical').toBe(edited);
  expect(await readFile(join(directory,BACKUP),'utf8'),'the pending backup must remain byte-identical').toBe(original);
 }finally{await rm(directory,{recursive:true,force:true});}
},60000);
