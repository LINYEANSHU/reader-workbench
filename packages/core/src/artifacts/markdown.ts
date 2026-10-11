import type {ArtifactExporter} from '../../../sdk/src/capabilities.js';
export const markdownExporter:ArtifactExporter={formats:['md','txt'],export:async(input,_scope,signal)=>{
 signal.throwIfAborted();const text=input.blocks.map(block=>{
  if(block.kind==='heading')return'#'.repeat(Math.max(1,Math.min(6,block.level)))+' '+block.text;
  if(block.kind==='list')return block.items.map(item=>'- '+item).join('\n');
  if(block.kind==='table'){const rows=block.rows.map(row=>'| '+row.map(cell=>cell.replaceAll('|','\\|').replaceAll('\n',' ')).join(' | ')+' |');rows.splice(1,0,'| '+(block.rows[0]??[]).map(()=>'---').join(' | ')+' |');return rows.join('\n');}
  if(block.kind==='image')return input.format==='txt'?'[图片: '+block.alt+']':'!['+block.alt.replaceAll(']','')+'](data:'+block.mime+';base64,'+Buffer.from(block.data).toString('base64')+')';
  if(block.kind==='formula')return'$$\n'+block.text+'\n$$';return block.text;
 }).join('\n\n')+'\n';return{mime:input.format==='md'?'text/markdown':'text/plain',extension:'.'+input.format,bytes:Buffer.from(text),warnings:input.format==='txt'&&input.blocks.some(b=>b.kind==='image')?['TXT 仅保存图片说明，图像在其他格式中保留。']:[]};
}};
