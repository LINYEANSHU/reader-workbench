import {translateDocument,supportsDocument} from './translation.mjs';
export default {activate(context){context.register('documentProcessor','document-translation.translate',{label:'文档翻译',supports:supportsDocument,process:translateDocument});}};
