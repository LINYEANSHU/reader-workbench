import type {DatabaseSync} from 'node:sqlite';
export function migrate(database:DatabaseSync){
  database.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  database.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS ui_state(client_id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS records(domain TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(domain,id));
    PRAGMA user_version=1; COMMIT;`);
}
