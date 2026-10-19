import readline from 'node:readline';
import {spawn} from 'node:child_process';
for await(const line of readline.createInterface({input:process.stdin})){
 const request=JSON.parse(line);
 if(request.method==='wait')await new Promise(resolve=>setTimeout(resolve,10000));
 if(request.method==='invalid'){process.stdout.write('RW_COGNEE:not-json\n');continue;}
 if(request.method==='echo')process.stdout.write('library diagnostic output\n');
 if(request.method==='tree'){const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});process.stdout.write('RW_COGNEE:'+JSON.stringify({id:request.id,result:{pid:child.pid}})+'\n');continue;}
 process.stdout.write('RW_COGNEE:'+JSON.stringify({id:request.id,result:request.method==='pid'?{pid:process.pid}:request.payload})+'\n');
}
