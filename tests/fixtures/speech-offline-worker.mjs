// Test-only Node API network guard; this is not an OS firewall claim.
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
const denied=()=>{throw new Error('speech test: outgoing Node network access blocked');};
net.Socket.prototype.connect=denied;
net.connect=net.createConnection=tls.connect=http.request=http.get=https.request=https.get=denied;
globalThis.fetch=async()=>denied();
syncBuiltinESMExports();
try{net.createConnection({host:'fixture.invalid',port:443});throw new Error('guard missing');}catch(error){if(!error.message.includes('blocked'))throw error;}
await import('../../packages/core/src/speech/worker.mjs');
