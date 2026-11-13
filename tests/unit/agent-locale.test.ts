import {describe,expect,it} from 'vitest';
import {agentPresets,composeAgentPrompt,defaultAgentSettings} from '../../packages/contracts/src/agent-settings.js';
import {askRequestSchema} from '../../packages/contracts/src/validation.js';

describe('built-in agent prompt languages',()=>{
 it('loads English defaults and translates saved Chinese built-ins without changing the settings',()=>{
  const saved=defaultAgentSettings(),original=structuredClone(saved);
  expect(defaultAgentSettings('en').systemPrompt).toContain('learning and research assistant');
  for(const preset of Object.keys(agentPresets) as Array<keyof typeof agentPresets>){
   const prompt=composeAgentPrompt({...saved,preset,systemPrompt:agentPresets[preset].prompt},'en');
   expect(prompt).not.toMatch(/[\u3400-\u9fff]/);
   expect(prompt).toContain('Expression preferences');
  }
  expect(saved).toEqual(original);
 });
 it('renders saved English built-ins in Chinese and preserves custom prompt content exactly',()=>{
  expect(composeAgentPrompt(defaultAgentSettings('en'),'zh-CN')).toContain('你是专业可靠的学习与科研助手');
  const systemPrompt='SYSTEM 自定义 $& {locale}\nKeep my wording.',personalPrompt='PERSONAL 原文 stays unchanged';
  const prompt=composeAgentPrompt({...defaultAgentSettings(),systemPrompt,personalPrompt},'en');
  expect(prompt).toContain(systemPrompt);expect(prompt).toContain(personalPrompt);
  expect(prompt).toContain('Personal preferences:');expect(prompt).not.toContain('表达偏好');
 });
 it('accepts only supported optional request locales while retaining the legacy request shape',()=>{
  const request={workspaceId:'w',sessionId:'s',question:'原文',documents:[],attachmentIds:[],providerId:'p',requestId:'r',allowArtifactWrites:false};
  expect(askRequestSchema.parse({...request,locale:'en'})).toMatchObject({locale:'en',question:'原文'});
  expect(askRequestSchema.parse({...request,locale:'zh-CN'})).toHaveProperty('locale','zh-CN');
  expect(askRequestSchema.parse(request)).not.toHaveProperty('locale');
  expect(askRequestSchema.safeParse({...request,locale:'unsupported'}).success).toBe(false);
 });
});
