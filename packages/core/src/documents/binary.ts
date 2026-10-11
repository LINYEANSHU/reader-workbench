import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
export const binaryAdapter:DocumentAdapter={supports:()=>true,parse:async(_input,signal)=>{signal.throwIfAborted();return {pages:[],blocks:[],warnings:['此格式没有可用阅读器，仅提供文件信息与下载；正文未解析。']};}};
