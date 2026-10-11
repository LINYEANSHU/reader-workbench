export const frame=(delta:unknown,finish_reason:string|null=null)=>({choices:[{index:0,delta,finish_reason}]});
export const textFrames=[frame({content:'中文'}),frame({content:'回答'}),frame({},'stop'),{usage:{prompt_tokens:12,completion_tokens:4},choices:[]}];
export const toolFrames=[
 frame({tool_calls:[{index:0,id:'c0',function:{name:'read',arguments:'{"a":'}},{index:1,id:'c1',function:{name:'search',arguments:'{"q":"'}}]}),
 frame({reasoning_content:'模型返回的思考片段',tool_calls:[{index:1,function:{arguments:'中文"}'}},{index:0,function:{arguments:'1}'}}]}),frame({},'tool_calls')
];
