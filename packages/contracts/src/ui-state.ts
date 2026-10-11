import type {LayoutNode,PaneStates,HotkeyBinding} from './layout.js';
export interface UiState {sidebarCollapsed?:boolean;layout?:LayoutNode;panes?:PaneStates;readingPositions?:Record<string,number>;hotkeys?:HotkeyBinding[];[key:string]:unknown}
