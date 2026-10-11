import type {PublicError} from './errors.js';
export interface SpeechProgress{phase:'checking'|'downloading'|'loading'|'ready';file?:string;completedBytes:number;totalBytes:number}
export interface SpeechAudio{samples:Float32Array;sampleRate:16000;seconds:number}
export interface SpeechResult{text:string;audioSeconds:number;inferenceSeconds:number}
export interface SpeechEngine{id:string;processingLocation:'local';languages:string[]}
export interface SpeechJob{id:string;providerId:string;kind:'prepare'|'transcribe';status:'queued'|'running'|'completed'|'cancelled'|'failed';progress?:SpeechProgress;result?:SpeechResult;error?:PublicError}
