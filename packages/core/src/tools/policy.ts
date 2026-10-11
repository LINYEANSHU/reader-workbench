import type {RunScope} from '../../../contracts/src/ids.js';
import type {SessionRecord} from '../../../contracts/src/sessions.js';
import {ReaderError} from '../../../contracts/src/errors.js';
export function assertToolAllowed(definition:{effect:unknown},scope:RunScope,session:SessionRecord):void{
  const deny=()=>{throw new ReaderError('TOOL_SCOPE_DENIED','TOOL_SCOPE_DENIED: 当前会话没有此工具权限',403);};
  if(session.id!==scope.sessionId||session.workspaceId!==scope.workspaceId)deny();
  const effect=definition.effect;
  if(!['read','write_artifact','write_session','external_write'].includes(String(effect)))deny();
  if(effect==='write_artifact'&&!scope.allowArtifactWrites)deny();
  if(session.kind==='temporary'&&(effect==='write_session'||effect==='external_write'))deny();
}
