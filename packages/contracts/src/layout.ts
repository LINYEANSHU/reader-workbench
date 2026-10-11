export type PaneId='document'|'main'|'temporary';
export type LayoutNode={kind:'pane';pane:PaneId}|{kind:'split';id:string;direction:'horizontal'|'vertical';ratio:number;first:LayoutNode;second:LayoutNode};
export interface PaneState {zoomPercent:number;collapsed:boolean}
export type PaneStates=Record<PaneId,PaneState>;
export function validateLayout(input:unknown):input is LayoutNode{
 const seen=new Set<unknown>(),panes=new Set<string>(),ids=new Set<string>();let count=0;
 const walk=(value:unknown):boolean=>{if(!value||typeof value!=='object'||seen.has(value)||++count>5)return false;seen.add(value);const node=value as Record<string,unknown>;
  if(node.kind==='pane'){if(!['document','main','temporary'].includes(String(node.pane))||panes.has(String(node.pane)))return false;panes.add(String(node.pane));return true;}
  if(node.kind!=='split'||typeof node.id!=='string'||!node.id||node.id.length>128||ids.has(node.id)||!['horizontal','vertical'].includes(String(node.direction))||typeof node.ratio!=='number'||!Number.isFinite(node.ratio)||node.ratio<.1||node.ratio>.9)return false;ids.add(node.id);return walk(node.first)&&walk(node.second);
 };return walk(input)&&panes.size===3;
}
export interface LayoutPreset {id:string;title:string;tree:LayoutNode}
export interface HotkeyBinding {id:string;binding:string}
export interface HotkeyRegistration {dispose():void}
export interface HotkeyValidation {valid:boolean;error?:string}
export interface SafeViewDescriptor {version:1;moduleKey:'markdown'|'plain-text';text:string}
export interface UiContribution {id:string;title:string;kind:'action'|'settings'|'view';actionId?:string;settingsSchema?:unknown;view?:SafeViewDescriptor}
