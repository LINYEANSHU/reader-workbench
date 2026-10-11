export default {async activate(context){
 const maximum=context.settings.maxCharacters??80;
 context.register('tool','reader-helper.terms',{tools:[{name:'reader_explain_term',description:'简短解释阅读材料中的术语',inputSchema:{type:'object',additionalProperties:false,required:['term'],properties:{term:{type:'string',maxLength:100}}},effect:'read',async execute(input){const known={RI:'RI 是秩指示，用于描述推荐的空间传输层数；它并不等同于天线数量。',CQI:'CQI 是信道质量指示，用于支持调制与编码方案选择。'};return{content:[...(known[input.term]??'请结合文档上下文理解术语：'+input.term)].slice(0,maximum).join('')};}}]});
 context.register('ui','reader-helper.ui',{contributions:[{id:'reader-helper.ask-selection',title:'把选区带到临时提问',kind:'action',actionId:'ask-selection'},{id:'reader-helper.help',title:'术语助手',kind:'view',view:{version:1,moduleKey:'markdown',text:'选择原文，再使用临时对话讨论术语。解释字数可在插件设置中调整。'}}],async invokeAction(_id,scope){return{target:'temporary',selection:scope.selection,message:scope.selection?'请解释这段选中的内容。':'请先在文档中选择文字。'};}});
 }};
