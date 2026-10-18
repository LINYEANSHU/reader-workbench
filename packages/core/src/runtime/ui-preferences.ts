import {z} from 'zod';
import type {AgentUiPreferences} from '../../../contracts/src/ui-state.js';
import {ReaderError} from '../../../contracts/src/errors.js';
import {LocalSettings} from './local-settings.js';
const selections=z.object({main:z.string().max(64).optional(),temporary:z.string().max(64).optional()}).strict();
const schema=z.object({providers:selections.optional(),efforts:selections.optional(),captureBinding:z.string().min(1).max(80).regex(/^[A-Za-z0-9+]+$/).optional()}).strict();
export class UiPreferencesService{
 private settings:LocalSettings<AgentUiPreferences|null>;
 constructor(configDir:string){this.settings=new LocalSettings(configDir,'ui-preferences',()=>null);}
 get(){return this.settings.get();}
 async save(input:unknown){
  const result=schema.safeParse(input);if(!result.success)throw new ReaderError('INVALID_PREFERENCES','模型选择或快捷键设置无效');
  return this.settings.update(current=>({providers:{...current?.providers,...result.data.providers},efforts:{...current?.efforts,...result.data.efforts},captureBinding:result.data.captureBinding??current?.captureBinding??'Mod+Shift+X'}));
 }
}
