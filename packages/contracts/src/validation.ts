import {z} from 'zod';
export const readerId=z.string().min(1).max(200);
export const documentRefSchema=z.object({workspaceId:readerId,documentId:readerId,version:readerId}).strict();
export const sourceLocationSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('page'),page:z.number().int().min(1),rect:z.tuple([z.number(),z.number(),z.number(),z.number()]).optional()}),
 z.object({kind:z.literal('block'),blockId:readerId,start:z.number().int().min(0),end:z.number().int().min(0)})
]);
export const askRequestSchema=z.object({workspaceId:readerId,sessionId:readerId,question:z.string().min(1).max(1000000),documents:z.array(documentRefSchema).max(100),selection:z.object({text:z.string().max(1000000),anchors:z.array(documentRefSchema.extend({location:sourceLocationSchema})).max(100)}).optional(),attachmentIds:z.array(readerId).max(4),providerId:readerId,requestId:readerId,allowArtifactWrites:z.boolean(),reasoningEffort:z.string().max(32).optional()}).strict();
