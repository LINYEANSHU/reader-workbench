export function documentProtocolResponse(data:{messages?:Array<{role:string;content:unknown}>}):string|undefined{
 const instruction=String(data.messages?.[0]?.content??'');
 if(instruction.includes('DOCUMENT_TRANSLATION_BLOCKS')){
  const payload=JSON.parse(String(data.messages?.at(-1)?.content??'{}'));
  return JSON.stringify({translations:payload.blocks.map((block:{id:string;text:string})=>({id:block.id,text:'译文：'+block.text}))});
 }
 if(instruction.includes('VISUAL_DOCUMENT_MEMORY_PAGES')){
  const entries=(data.messages??[]).flatMap(message=>Array.isArray(message.content)?message.content.filter(item=>item.type==='text'):[]);
  return JSON.stringify({pages:entries.map((item:{text:string})=>({page:Number(/文档页 (\d+)/.exec(item.text)?.[1]),item})).filter(({page})=>page>0).map(({page,item})=>({page,summary:page===7?'LAST PAGE FACT':'Page '+page,transcription:item.text.split('\n').slice(1).join('\n'),figures:[],formulas:[],terms:[],uncertainties:[],crossPageRelations:[]}))});
 }
 if(instruction.includes('VISUAL_DOCUMENT_MEMORY_OVERVIEW'))return '所选页面阅读概览；LAST PAGE FACT 位于已提供的第7页时可回查该页。';
 return undefined;
}
