import type {LayoutNode,PaneStates,HotkeyBinding} from './layout.js';
export interface AgentUiPreferences {providers:Record<string,string>;efforts:Record<string,string>;captureBinding:string}
export interface UiState {sidebarCollapsed?:boolean;layout?:LayoutNode;panes?:PaneStates;readingPositions?:Record<string,number>;hotkeys?:HotkeyBinding[];[key:string]:unknown}
