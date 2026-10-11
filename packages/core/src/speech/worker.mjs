import {createRequire} from 'node:module';import {performance} from 'node:perf_hooks';
let recognizer;
process.on('message',message=>{if(!message||typeof message.id!=='string')return;try{
 if(message.kind==='init'){const {OfflineRecognizer}=createRequire(import.meta.url)('sherpa-onnx-node');recognizer=new OfflineRecognizer({featConfig:{sampleRate:16000,featureDim:80},modelConfig:{senseVoice:{model:message.model,language:message.language,useInverseTextNormalization:1},tokens:message.tokens,numThreads:2,provider:'cpu',debug:0},decodingMethod:'greedy_search'});process.send?.({id:message.id,ready:true});return;}
 if(message.kind==='transcribe'&&recognizer){const started=performance.now(),stream=recognizer.createStream();stream.acceptWaveform({samples:message.samples,sampleRate:16000});process.send?.({id:message.id,stage:'decoding'});recognizer.decode(stream);const result=recognizer.getResult(stream);message.samples.fill(0);process.send?.({id:message.id,text:result.text.replace(/<\|[^|]+\|>/g,'').trim(),inferenceSeconds:(performance.now()-started)/1000});return;}
 throw new Error('invalid request');
 }catch{process.send?.({id:message.id,error:'SPEECH_ENGINE_FAILED'});}});
process.once('disconnect',()=>process.exit(0));process.once('SIGTERM',()=>process.exit(0));process.once('SIGINT',()=>process.exit(0));
