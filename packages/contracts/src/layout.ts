export type PaneId='document'|'main'|'temporary';
export type LayoutNode={kind:'pane';pane:PaneId}|{kind:'split';id:string;direction:'horizontal'|'vertical';ratio:number;first:LayoutNode;second:LayoutNode};
export interface PaneState {zoomPercent:number;collapsed:boolean}
export interface LayoutPreset {id:string;title:string;tree:LayoutNode}
export interface HotkeyBinding {id:string;binding:string}
export interface HotkeyRegistration {dispose():void}
export interface HotkeyValidation {valid:boolean;error?:string}
export interface SafeViewDescriptor {version:1;moduleKey:'markdown'|'plain-text';text:string}
export interface UiContribution {id:string;title:string;kind:'action'|'settings'|'view';actionId?:string;settingsSchema?:unknown;view?:SafeViewDescriptor}
