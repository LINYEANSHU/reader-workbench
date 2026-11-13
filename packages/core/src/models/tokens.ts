import type {ModelMessage} from '../../../contracts/src/models.js';
export function estimateTokens(text:string):number{return Buffer.byteLength(text,'utf8');}
export function messageTokens(messages:ReadonlyArray<ModelMessage>,imageTokens=1024):number{
 return messages.reduce((total,message)=>total+24+(typeof message.content==='string'?estimateTokens(message.content):message.content.reduce((sum,item)=>sum+(item.type==='text'?estimateTokens(item.text):imageTokens),0))+(message.tool_calls?estimateTokens(JSON.stringify(message.tool_calls)):0)+(message.reasoning_content?estimateTokens(message.reasoning_content):0),0);
}
/** The text cut to about `limit` estimated tokens including the note that says it was cut. */
export function clipTokens(text:string,limit:number,note:string):string{const room=limit-estimateTokens(note);if(estimateTokens(text)<=limit)return text;let used=0,end=0;for(const character of text){const size=estimateTokens(character);if(used+size>room)break;used+=size;end+=character.length;}return text.slice(0,end)+note;}
/** Head and tail of a text kept within about `limit` estimated tokens, with a note where the middle was left out. */
export function clipMiddle(text:string,limit:number,note:string):string{if(estimateTokens(text)<=limit)return text;const half=Math.max(0,Math.floor((limit-estimateTokens(note))/2));let head=0,used=0;for(const character of text){const size=estimateTokens(character);if(used+size>half)break;used+=size;head+=character.length;}let tail=text.length;used=0;for(const character of [...text].reverse()){const size=estimateTokens(character);if(used+size>half||tail-character.length<head)break;used+=size;tail-=character.length;}return text.slice(0,head)+note+text.slice(tail);}
