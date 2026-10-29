import type {DocumentRecord} from '../../contracts/src/documents.js';
import type {DocumentProcessingProgress} from '../../contracts/src/document-processing.js';
import type {ModelEvent,ModelRequest} from '../../contracts/src/models.js';
import type {ContentBlock} from '../../contracts/src/artifacts.js';
export interface ProcessingPdfBlock {id:string;text:string;rect:[number,number,number,number]}
export interface ProcessingPdfPage {page:number;width:number;height:number;blocks:ProcessingPdfBlock[]}
export interface DocumentProcessingResult {name:string;mime:string;extension:string;bytes:Uint8Array;previewText?:string;warnings:string[]}
/** All reads are pinned to the task's document version. No workspace write or host path is exposed. */
export interface DocumentProcessingHost {readonly document:DocumentRecord;readonly targetLanguage:string;readonly pages:number[];readonly inputBudgetBytes:number;readSource():Promise<Uint8Array>;convertSource(format:'docx'):Promise<Uint8Array>;readResource(name:string):Promise<{bytes:Uint8Array;mime:string}>;readPdfPages():Promise<ProcessingPdfPage[]>;zip:{decode(bytes:Uint8Array):Record<string,Uint8Array>;encode(entries:Record<string,Uint8Array>):Uint8Array};renderPdf(blocks:ContentBlock[]):Promise<Uint8Array>;combinePdf(parts:Array<{page:number;translation:Uint8Array}>):Promise<Uint8Array>;generate(request:ModelRequest,signal:AbortSignal):AsyncIterable<ModelEvent>;progress(progress:DocumentProcessingProgress):void}
export interface DocumentProcessor {label:string;supports(document:DocumentRecord):boolean;process(host:DocumentProcessingHost,signal:AbortSignal):Promise<DocumentProcessingResult>}
