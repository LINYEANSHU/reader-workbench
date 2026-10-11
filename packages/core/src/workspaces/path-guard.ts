import path from 'node:path';
import {realpath,lstat} from 'node:fs/promises';
import {ReaderError} from '../../../contracts/src/errors.js';
export function isWithin(root:string,target:string,flavor:typeof path=path):boolean{
  const relative=flavor.relative(flavor.resolve(root),flavor.resolve(target));
  return relative===''||(!relative.startsWith('..'+flavor.sep)&&relative!=='..'&&!flavor.isAbsolute(relative));
}
export async function resolveScopedPath(root:string,input:string,mode:'read'|'create',protectedPaths:string[]=[]):Promise<string>{
  const deny=()=>new ReaderError('PATH_OUTSIDE_WORKSPACE','路径越过工作区或指向受保护的内部文件',403);
  if(typeof input!=='string'||input.includes('\0')||path.isAbsolute(input)||path.win32.isAbsolute(input)||/^[a-z]:/i.test(input)||input.split(/[\\/]/).some(part=>part==='..'||part.toLowerCase()==='.reader-workbench'))throw deny();
  const candidate=path.resolve(root,input);
  if(!isWithin(root,candidate)||protectedPaths.some(p=>isWithin(p,candidate)))throw deny();
  let existing=candidate;let suffix:string[]=[];
  for(;;){
    try{await lstat(existing);break;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'||mode==='read')throw new ReaderError('FILE_UNAVAILABLE','文件不存在或不可访问',404);
      const parent=path.dirname(existing);if(parent===existing)throw deny();suffix.unshift(path.basename(existing));existing=parent;}
  }
  const actual=path.resolve(await realpath(existing),...suffix);
  if(!isWithin(root,actual)||isWithin(path.join(root,'.reader-workbench'),actual)||protectedPaths.some(p=>isWithin(p,actual)))throw deny();
  return actual;
}
