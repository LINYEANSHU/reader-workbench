import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import {LocalSettings} from '../runtime/local-settings.js';
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
 if(model.identity){const value=Math.min(learned.get(model.identity)??Number.POSITIVE_INFINITY,next);learned.set(model.identity,value);persist(model.identity,value);}
 return next;
}
// Learned limits are kept in the private agent settings, so a restart does not meet the same rejection again. Entries
// are keyed by the provider identity (endpoint, model and capabilities) and expire, since providers raise limits.
type SavedLimits=Record<string,{window:number;learnedAt:string}>;
const LIMIT_RETENTION_MS=30*24*60*60*1000;let store:LocalSettings<SavedLimits>|undefined,saving:Promise<unknown>=Promise.resolve();
function current(saved:SavedLimits,now=Date.now()):SavedLimits{return Object.fromEntries(Object.entries(saved).filter(([,entry])=>Number.isSafeInteger(entry?.window)&&entry.window>=MINIMUM_WINDOW&&now-Date.parse(entry.learnedAt)<LIMIT_RETENTION_MS));}
function persist(identity:string,window:number){const target=store;if(!target)return;saving=saving.then(()=>target.update(saved=>({...current(saved),[identity]:{window,learnedAt:new Date().toISOString()}}))).catch(()=>{});}
/** Loads limits learned in earlier runs from the config directory and keeps new ones there. */
export async function attachContextLimitStore(configDir:string){
 const settings=new LocalSettings<SavedLimits>(configDir,'context-limits',()=>({}));store=settings;
 let saved:SavedLimits={};try{saved=current(await settings.get());}catch{}
 for(const [identity,entry] of Object.entries(saved))learned.set(identity,Math.min(learned.get(identity)??Number.POSITIVE_INFINITY,entry.window));
}
/** Resolves when learned limits have been written. */
export function flushContextLimits(){return saving;}
/** Providers word overflow rejections differently and often without a dedicated error code. */
export function isContextOverflow(status:number,code:string,message:string):boolean{
 return code==='context_length_exceeded'||code==='context_window_exceeded'||status===413||/context[ _-]?(?:length|window)|maximum context|max(?:imum)?[ _-]?tokens? (?:exceeded|limit)|too many (?:input )?tokens|token limit|prompt is too long|input is too long|exceeds? (?:the )?(?:model'?s? )?(?:maximum|context|token)|reduce the length/i.test(message);
}
export function resetLearnedContextLimits(){learned.clear();store=undefined;}
