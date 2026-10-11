import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import type {ArtifactExporter} from '../../../sdk/src/capabilities.js';import type {DocumentId,DocumentVersion} from '../../../contracts/src/ids.js';import type {WorkspaceService} from '../workspaces/service.js';
import {docxExporter} from './docx.js';import {safeCacheDirectory} from '../documents/versions.js';import {convertOffice} from '../documents/office.js';
export function pdfExporter(workspaces:WorkspaceService):ArtifactExporter{return{formats:['pdf'],export:async(input,scope,signal)=>{
 const docx=await docxExporter.export({...input,format:'docx'},scope,signal),documentId=('export-'+randomUUID()) as DocumentId,version=createHash('sha256').update(docx.bytes).digest('hex') as DocumentVersion;
 const cacheDir=await safeCacheDirectory(workspaces,scope.workspaceId,['cache',documentId,version]),path=join(cacheDir,'source.docx');await writeFile(path,docx.bytes,{flag:'wx',signal});
 const pdf=await convertOffice({workspaceId:scope.workspaceId,documentId,version,path,cacheDir,extension:'.docx',mime:docx.mime,relativePath:''},signal);signal.throwIfAborted();return{bytes:await readFile(pdf,{signal}),mime:'application/pdf',extension:'.pdf',warnings:[...docx.warnings??[],'PDF 由 LibreOffice 转换，字体替换可能影响版式。']};
}};}
