import {DatabaseSync} from 'node:sqlite';
import {migrate} from './migrations.js';
export function openDatabase(file:string){const database=new DatabaseSync(file);migrate(database);return database;}
