import type {DatabaseSync} from 'node:sqlite';
export function migrate(database:DatabaseSync){
  database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  database.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ui_state(client_id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records(domain TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(domain,id));
    CREATE VIRTUAL TABLE IF NOT EXISTS document_index USING fts5(document_id UNINDEXED,version UNINDEXED,block_id UNINDEXED,text,anchor UNINDEXED,tokenize='trigram');
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, parent_id TEXT REFERENCES sessions(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_turns(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), run_id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, epoch INTEGER NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_summaries(session_id TEXT PRIMARY KEY REFERENCES sessions(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_tool_state(session_id TEXT PRIMARY KEY REFERENCES sessions(id), data TEXT NOT NULL);
    PRAGMA user_version=3; COMMIT;`);
}
