import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {Server} from '@modelcontextprotocol/server';
import {StdioServerTransport} from '@modelcontextprotocol/server/stdio';
import {loadRuntimeConfig} from '../../../packages/core/src/runtime/config.js';
import {ReaderError} from '../../../packages/contracts/src/errors.js';
export async function runStdioBridge(url:string,token:string,signal:AbortSignal){
 const address=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(address.hostname)||address.protocol!=='http:'||address.username||address.password)throw new ReaderError('MCP_ADDRESS_INVALID','stdio 桥只连接本机 Reader 服务');
 const remote=new Client({name:'reader-workbench-stdio-bridge',version:'0.4.0'}),local=new Server({name:'reader-workbench',version:'0.4.0'},{capabilities:{tools:{},resources:{}}});
 const close=async()=>{await Promise.allSettled([local.close(),remote.close()]);};
 try{
  await remote.connect(new StreamableHTTPClientTransport(new URL('/mcp',address),{requestInit:{headers:{authorization:'Bearer '+token}}}));
  local.setRequestHandler('tools/list',request=>remote.listTools(request.params));
  local.setRequestHandler('tools/call',(request,ctx)=>remote.callTool(request.params,{signal:ctx.mcpReq.signal}));
  local.setRequestHandler('resources/list',request=>remote.listResources(request.params));
  local.setRequestHandler('resources/templates/list',request=>remote.listResourceTemplates(request.params));
  local.setRequestHandler('resources/read',(request,ctx)=>remote.readResource(request.params,{signal:ctx.mcpReq.signal}));
  const transport=new StdioServerTransport();let ended:()=>void;const done=new Promise<void>(resolve=>{ended=resolve;});
  local.onclose=()=>ended();signal.addEventListener('abort',()=>void close(),{once:true});process.stdin.once('end',()=>void close());
  await local.connect(transport);if(signal.aborted)await close();await done;
 }finally{await close();}
}
export async function runMcpCommand(args:string[]){
 const options:Record<string,string>={};for(let i=1;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!flag||!['--url','--token-file','--config-dir'].includes(flag)||!value||value.startsWith('--'))throw new ReaderError('INVALID_ARGUMENT','MCP 参数无效');options[flag]=value;}
 const config=await loadRuntimeConfig(options['--config-dir']?['--config-dir',options['--config-dir']]:[]);
 const connection=options['--url']&&options['--token-file']?{url:options['--url'],token:''}:JSON.parse(await readFile(join(config.configDir,'connection.json'),'utf8')) as {url:string;token:string};
 const token=options['--token-file']?(await readFile(options['--token-file'],'utf8')).trim():connection.token;
 if(!token)throw new ReaderError('AUTHENTICATION_REQUIRED','需要受保护的 Reader 连接凭据',401);
 const controller=new AbortController();const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{await runStdioBridge(options['--url']??connection.url,token,controller.signal);}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}

