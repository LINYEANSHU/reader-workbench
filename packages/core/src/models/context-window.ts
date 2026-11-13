import type {ModelProvider} from '../../../sdk/src/capabilities.js';
// The configured input limit is an upper bound: a provider may accept less (another model behind the same settings,
// a deployment limit). When it rejects an input as too long, the estimate of that input bounds what it accepts, and
// later requests of this process are built to fit below it instead of failing the same way again.
const learned=new Map<string,number>();
const MINIMUM_WINDOW=4096,SAFETY=0.75;
/** Input limit (estimated tokens) to build requests for: the configured window, lowered by provider rejections. */
export function effectiveContextWindow(model:Pick<ModelProvider,'capabilities'|'identity'>):number{
 const value=model.identity?learned.get(model.identity):undefined;return Math.max(MINIMUM_WINDOW,Math.min(model.capabilities.contextWindow,value??Number.POSITIVE_INFINITY));
}
/** Records a provider rejection of an input estimated at `estimate`; returns the lowered window. */
export function learnContextLimit(model:Pick<ModelProvider,'capabilities'|'identity'>,estimate:number):number{
 const next=Math.max(MINIMUM_WINDOW,Math.floor(Math.min(estimate,effectiveContextWindow(model))*SAFETY));
 if(model.identity)learned.set(model.identity,Math.min(learned.get(model.identity)??Number.POSITIVE_INFINITY,next));
 return next;
}
/** Providers word overflow rejections differently and often without a dedicated error code. */
export function isContextOverflow(status:number,code:string,message:string):boolean{
 return code==='context_length_exceeded'||code==='context_window_exceeded'||status===413||/context[ _-]?(?:length|window)|maximum context|max(?:imum)?[ _-]?tokens? (?:exceeded|limit)|too many (?:input )?tokens|token limit|prompt is too long|input is too long|exceeds? (?:the )?(?:model'?s? )?(?:maximum|context|token)|reduce the length/i.test(message);
}
export function resetLearnedContextLimits(){learned.clear();}
