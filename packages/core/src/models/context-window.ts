import type {ModelProvider} from '../../../sdk/src/capabilities.js';
import {LocalSettings} from '../runtime/local-settings.js';
import {writePrivateJson} from '../runtime/secure-file.js';
// The configured input limit is an upper bound: a provider may accept less (another model behind the same settings,
// a deployment limit). When it rejects an input as too long, the estimate of that input bounds what it accepts, and
// later requests of this process are built to fit below it instead of failing the same way again.
type SavedLimit={window:number;learnedAt:string};
type SavedLimits=Record<string,SavedLimit>;
const learned=new Map<string,SavedLimit>();
const MINIMUM_WINDOW=4096,SAFETY=0.75;
/** Input limit (estimated tokens) to build requests for: the configured window, lowered by provider rejections. */
export function effectiveContextWindow(model:Pick<ModelProvider,'capabilities'|'identity'>):number{
 const entry=model.identity?learned.get(model.identity):undefined;
 if(entry&&!valid(entry)){learned.delete(model.identity!);}
 return Math.max(MINIMUM_WINDOW,Math.min(model.capabilities.contextWindow,entry&&valid(entry)?entry.window:Number.POSITIVE_INFINITY));
}
/** Records a provider rejection of an input estimated at `estimate`; returns the lowered window. */
export function learnContextLimit(model:Pick<ModelProvider,'capabilities'|'identity'>,estimate:number):number{
 const next=Math.max(MINIMUM_WINDOW,Math.floor(Math.min(estimate,effectiveContextWindow(model))*SAFETY));
 if(model.identity){const value={window:Math.min(learned.get(model.identity)?.window??Number.POSITIVE_INFINITY,next),learnedAt:new Date(Date.now()).toISOString()};learned.set(model.identity,value);persist(model.identity,value);}
 return next;
}
// Learned limits are kept in the private agent settings, so a restart does not meet the same rejection again. Entries
// are keyed by the provider identity (endpoint, model and capabilities) and expire, since providers raise limits.
const LIMIT_RETENTION_MS=30*24*60*60*1000;let store:LocalSettings<SavedLimits>|undefined,saving:Promise<unknown>=Promise.resolve();
function valid(value:unknown,now=Date.now()):value is SavedLimit{const entry=value as SavedLimit|undefined,age=now-Date.parse(entry?.learnedAt??'');return Number.isSafeInteger(entry?.window)&&entry!.window>=MINIMUM_WINDOW&&age>=0&&age<LIMIT_RETENTION_MS;}
function current(saved:unknown,now=Date.now()):SavedLimits{return saved&&typeof saved==='object'&&!Array.isArray(saved)?Object.fromEntries(Object.entries(saved).filter(([,entry])=>valid(entry,now))):{};}
function persist(identity:string,entry:SavedLimit){const target=store;if(!target)return;saving=saving.then(()=>target.update(saved=>({...current(saved),[identity]:entry}))).catch(()=>{});}
/** Loads limits learned in earlier runs from the config directory and keeps new ones there. */
export async function attachContextLimitStore(configDir:string){
 const settings=new LocalSettings<SavedLimits>(configDir,'context-limits',()=>({}));store=settings;
 let saved:SavedLimits={};try{saved=current(await settings.get());}catch(error){
  // This file is a derived cache. Repair invalid JSON so later updates can read and replace it normally.
  if(error instanceof SyntaxError)await writePrivateJson(settings.file,{}).catch(()=>{});
 }
 for(const [identity,entry] of Object.entries(saved)){const existing=learned.get(identity);if(!existing||!valid(existing)||entry.window<existing.window)learned.set(identity,entry);}
}
/** Resolves when learned limits have been written. */
export function flushContextLimits(){return saving;}
/** Providers word overflow rejections differently and often without a dedicated error code. */
export function isContextOverflow(status:number,code:string,message:string):boolean{
 return code==='context_length_exceeded'||code==='context_window_exceeded'||status===413||/context[ _-]?(?:length|window)|maximum context|max(?:imum)?[ _-]?tokens? (?:exceeded|limit)|too many (?:input )?tokens|token limit|prompt is too long|input is too long|exceeds? (?:the )?(?:model'?s? )?(?:maximum|context|token)|reduce the length/i.test(message);
}
export function resetLearnedContextLimits(){learned.clear();store=undefined;}
