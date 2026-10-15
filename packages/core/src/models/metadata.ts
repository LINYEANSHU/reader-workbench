export function metadataContextWindow(item:Record<string,unknown>):number|undefined{
 for(const value of [item.context_length,item.context_window,item.max_context_length])if(Number.isSafeInteger(value)&&(value as number)>=1024&&(value as number)<=4000000)return value as number;
 return undefined;
}
