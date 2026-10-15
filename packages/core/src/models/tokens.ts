import type {ModelMessage} from '../../../contracts/src/models.js';
export function estimateTokens(text:string):number{return Buffer.byteLength(text,'utf8');}
export function messageTokens(messages:ReadonlyArray<ModelMessage>,imageTokens=1024):number{
 return messages.reduce((total,message)=>total+24+(typeof message.content==='string'?estimateTokens(message.content):message.content.reduce((sum,item)=>sum+(item.type==='text'?estimateTokens(item.text):imageTokens),0))+(message.tool_calls?estimateTokens(JSON.stringify(message.tool_calls)):0)+(message.reasoning_content?estimateTokens(message.reasoning_content):0),0);
}
