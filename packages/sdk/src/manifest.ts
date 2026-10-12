import {z} from 'zod';
export const SDK_VERSION='1.1.0';
export const manifestSchema=z.object({id:z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/),version:z.string(),sdkRange:z.string(),entry:z.string().min(1),dependencies:z.array(z.string()),settingsSchema:z.unknown(),permissions:z.array(z.string())});
export type PluginManifest=z.infer<typeof manifestSchema>;
