import type {ModelProvider} from '../../../sdk/src/capabilities.js';
export const demoProvider:ModelProvider={capabilities:{vision:false,tools:false,contextWindow:32000,maxOutputTokens:1000},async*generate(request,signal){
 signal.throwIfAborted();const question=String(request.messages.at(-1)?.content??'');yield{kind:'delta',text:'【演示模式，未调用真实 LLM】\n已收到：'+question.slice(0,120)+'\n配置 API 后可进行真实文档问答。'};yield{kind:'done'};
}};
