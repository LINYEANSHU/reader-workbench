import type {DocumentRef} from '../../../../packages/contracts/src/documents.js';
import {api} from './client.js';

export interface DocumentReadingPlan{pages:number[];pageCount:number;mode:'visual'|'text';configured:boolean}
const path=(document:DocumentRef)=>'/workspaces/'+document.workspaceId+'/documents/'+document.documentId+'/'+document.version+'/reading-plan';
export const readingPlans={
 get:(document:DocumentRef,signal?:AbortSignal)=>api.request<DocumentReadingPlan>(path(document),{signal}),
 save:(document:DocumentRef,pages:number[]|null)=>api.request<DocumentReadingPlan>(path(document),{method:'PUT',body:{pages}})
};
