export class KeyedQueue{
 private tails=new Map<string,Promise<unknown>>();
 enqueue<T>(key:string,perform:()=>Promise<T>):Promise<T>{
  const task=(this.tails.get(key)??Promise.resolve()).catch(()=>{}).then(perform);
  this.tails.set(key,task);void task.finally(()=>{if(this.tails.get(key)===task)this.tails.delete(key);}).catch(()=>{});return task;
 }
 async idle(){await Promise.allSettled([...this.tails.values()]);}
}
