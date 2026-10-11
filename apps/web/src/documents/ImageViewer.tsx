import type {DocumentRecord} from '../../../../packages/contracts/src/documents.js';import {documentUrl} from '../api/client.js';
export function ImageViewer({document}:{document:DocumentRecord}){return<div className="image-viewer" data-page="1"><img src={documentUrl(document,'/content')} alt={document.relativePath}/></div>;}
