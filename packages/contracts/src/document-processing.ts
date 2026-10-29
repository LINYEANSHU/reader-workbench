import type {Actor,SessionId} from './ids.js';
import type {DocumentRef} from './documents.js';
import type {ArtifactRecord} from './artifacts.js';
export interface DocumentProcessingRequest {document:DocumentRef;providerId:string;sessionId:SessionId;processorId:string;targetLanguage?:string;pages?:number[]}
export interface DocumentProcessingProgress {completed:number;total:number;label:string}
export interface DocumentProcessingTask {id:string;document:DocumentRef;sessionId:SessionId;providerId:string;processorId:string;targetLanguage:string;pages:number[];status:'queued'|'running'|'ready'|'cancelled'|'failed'|'saved';progress:DocumentProcessingProgress;warnings:string[];error?:{code:string;message:string};preview?:{name:string;mime:string;extension:string;byteLength:number};previewText?:string;artifact?:ArtifactRecord}
export interface DocumentProcessorDescriptor {id:string;label:string}
export type DocumentProcessingActor=Actor;
