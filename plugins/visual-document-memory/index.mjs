import {prepare,prepareLocal} from './reading.mjs';import {select} from './context.mjs';
export default{async activate(context){context.register('documentMemory','visual-document-memory.reader',{promptVersion:'1',supports:record=>record.pageCount>0&&['pdf','image','markdown','text'].includes(record.viewer.kind),prepareLocal,prepare,select});}};
