// A hosted Windows rerun exceeded the 15-second budget for real host tests,
// which include private workspace/plugin initialization and HTTP shutdown.
// Keep this budget out of protocol-only tests, and retain cancellation checks.
export const serverIntegrationTimeout=process.platform==='win32'?60000:15000;
export function serverIntegrationStages(test:string){
 const started=performance.now();
 return async<T>(phase:string,operation:()=>Promise<T>):Promise<T>=>{
  const tracing=Boolean(process.env.CI||process.env.READER_TEST_TIMINGS),entered=performance.now();
  if(tracing)console.info(`[integration:${test}] ${phase}: enter (+${Math.round(entered-started)}ms)`);
  try{return await operation();}
  finally{if(tracing)console.info(`[integration:${test}] ${phase}: exit (${Math.round(performance.now()-entered)}ms)`);}
 };
}
