import {readFile} from 'node:fs/promises';import {join} from 'node:path';
const directory=process.argv[2];if(!directory)throw new Error('Usage: node scripts/http-client.mjs CONFIG_DIR');
const connection=JSON.parse(await readFile(join(directory,'connection.json'),'utf8'));
const response=await fetch(connection.url+'/api/v1/agent-tools/list_workspaces',{method:'POST',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},body:'{}'});
if(!response.ok)throw new Error('Reader HTTP request failed: '+response.status);
const result=await response.json();process.stdout.write(JSON.stringify({transport:'http',workspaceCount:result.workspaces.length,workspaces:result.workspaces})+'\n');
