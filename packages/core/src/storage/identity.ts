import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
/** Inspect before opening a copied database for writes. Older databases can be identified by their records. */
export function databaseWorkspaceId(file:string):WorkspaceId|null{
 if(!existsSync(file))return null;const database=new DatabaseSync(file,{readOnly:true});
 try{
  const tables=new Set((database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(row=>row.name));
  if(tables.has('records')){const identity=database.prepare("SELECT data FROM records WHERE domain='workspace' AND id='identity'").get() as {data:string}|undefined;if(identity)return JSON.parse(identity.data).workspaceId as WorkspaceId;}
  for(const table of ['sessions','runs','artifacts','ui_state'])if(tables.has(table)){const row=database.prepare('SELECT data FROM '+table+' LIMIT 1').get() as {data:string}|undefined;const id=row?JSON.parse(row.data).workspaceId:undefined;if(id)return id as WorkspaceId;}
  if(tables.has('records')){const row=database.prepare("SELECT data FROM records WHERE domain='documents' LIMIT 1").get() as {data:string}|undefined;const id=row?JSON.parse(row.data).record?.workspaceId:undefined;if(id)return id as WorkspaceId;}
  return null;
 }finally{database.close();}
}
