import { randomBytes,timingSafeEqual } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import { ReaderError } from '../../../packages/contracts/src/errors.js';
import type { Actor } from '../../../packages/contracts/src/ids.js';
export class Authentication {
  readonly token=randomBytes(32).toString('base64url');
  readonly code=randomBytes(32).toString('base64url');
  private codeAvailable=true;
  private codeExpires=Date.now()+5*60*1000;
  private cookies=new Map<string,number>();
  url='';
  private equal(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
  actor(request:FastifyRequest):Actor{
    const authorization=request.headers.authorization??'';
    if(authorization.startsWith('Bearer ')&&this.equal(authorization.slice(7),this.token))return {callerId:'local-owner',transport:'http'};
    const cookie=request.headers.cookie?.split(';').map(part=>part.trim()).find(part=>part.startsWith('reader_session='))?.slice('reader_session='.length);
    if(cookie&&(this.cookies.get(cookie)??0)>Date.now())return {callerId:'local-owner',transport:'web'};
    throw new ReaderError('AUTHENTICATION_REQUIRED','请通过本机启动地址连接工作台',401);
  }
  attach(app:FastifyInstance){
    app.addHook('onRequest',async(request)=>{
      const expected=new URL(this.url);
      if(request.headers.host!==expected.host)throw new ReaderError('HOST_DENIED','请求 Host 不匹配',403);
      if(request.headers.origin&&request.headers.origin!==expected.origin)throw new ReaderError('ORIGIN_DENIED','请求来源不匹配',403);
      if(request.headers['sec-fetch-site']==='cross-site')throw new ReaderError('ORIGIN_DENIED','不接受跨站请求',403);
      if(request.url.startsWith('/api/')||request.url.startsWith('/mcp')){
        if(request.url.split('?')[0]==='/api/v1/auth/bootstrap')return;
        const actor=this.actor(request);
        if(actor.transport==='web'&&!['GET','HEAD','OPTIONS'].includes(request.method)&&request.headers.origin!==expected.origin)throw new ReaderError('ORIGIN_DENIED','浏览器写请求需要同源 Origin',403);
      }
    });
    app.post('/api/v1/auth/bootstrap',async(request,reply)=>{
      if(request.headers.origin!==this.url)throw new ReaderError('ORIGIN_DENIED','引导请求需要同源 Origin',403);
      const code=(request.body as {code?:unknown}|null)?.code;
      if(!this.codeAvailable||Date.now()>this.codeExpires||typeof code!=='string'||!this.equal(code,this.code))throw new ReaderError('BOOTSTRAP_EXPIRED','启动链接已过期或已使用，请重新连接',401);
      this.codeAvailable=false;const cookie=randomBytes(32).toString('base64url');this.cookies.set(cookie,Date.now()+12*3600*1000);
      reply.header('set-cookie','reader_session='+cookie+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200');
      return {redirect:'/'};
    });
  }
}
