import type {CapabilityRegistry} from './registry.js';
import type {WorkspaceId} from '../../../contracts/src/ids.js';
import type {ActionScope,ActionResult} from '../../../contracts/src/tools.js';
import type {SelectionContext} from '../../../contracts/src/documents.js';
import type {UiContribution} from '../../../contracts/src/layout.js';
import type {SessionRepository} from '../sessions/repository.js';
import type {SelectionService} from '../selection/service.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export class UiBridge{
 constructor(private registry:CapabilityRegistry,private sessions:SessionRepository,private selections:SelectionService){}
 listUiContributions(workspaceId:WorkspaceId):UiContribution[]{
  const items=this.registry.list(workspaceId,'ui').flatMap(id=>this.registry.get(workspaceId,'ui',id).contributions.map(item=>structuredClone(item)));
  if(items.length>100||new Set(items.map(item=>item.id)).size!==items.length)throw new ReaderError('UI_CONTRIBUTION_INVALID','插件界面贡献数量或名称无效');
  for(const item of items)if(!item.id||!item.title||!['action','settings','view'].includes(item.kind)||item.kind==='view'&&(!item.view||item.view.version!==1||!['markdown','plain-text'].includes(item.view.moduleKey)||typeof item.view.text!=='string'||item.view.text.length>100000))throw new ReaderError('UI_CONTRIBUTION_INVALID','插件界面描述无效');return items;
 }
 async invokeUiAction(id:string,scope:ActionScope,selection?:SelectionContext):Promise<ActionResult>{
  const session=await this.sessions.getSession(scope.workspaceId,scope.sessionId);if(session.kind!=='temporary'||session.callerId!==scope.actor.callerId)throw new ReaderError('TOOL_SCOPE_DENIED','界面动作只能进入所属临时会话',403);
  const checked=selection?(await this.selections.invoke('core.explain',selection,scope)).selection:undefined;
  for(const provider of this.registry.list(scope.workspaceId,'ui')){
   const lease=this.registry.acquire(scope.workspaceId,'ui',provider);try{const contribution=lease.value.contributions.find(item=>item.id===id&&item.kind==='action');if(!contribution)continue;
    const result=await lease.value.invokeAction(contribution.actionId??id,structuredClone({...scope,selection:checked}));
    if(result.target&&result.target!=='temporary')throw new ReaderError('TOOL_SCOPE_DENIED','界面动作不能回写主会话',403);
    if(result.selection){const allowed=new Set(checked?.anchors.map(anchor=>anchor.documentId+'/'+anchor.version));if(result.selection.anchors.some(anchor=>!allowed.has(anchor.documentId+'/'+anchor.version)))throw new ReaderError('TOOL_SCOPE_DENIED','界面动作改变了来源版本',403);await this.selections.invoke('core.explain',result.selection,scope);}
    return result;
   }finally{lease.release();}
  }throw new ReaderError('UI_ACTION_UNAVAILABLE','界面动作不存在或已停用',404);
 }
}
