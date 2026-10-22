import {t} from '../i18n/index.js';
import {validateHotkey as validateBinding} from '../../../../packages/contracts/src/hotkeys.js';
export {matchesHotkey} from '../../../../packages/contracts/src/hotkeys.js';
const hotkeyMessages=[
 ['使用修饰键和一个字母或数字，例如 Mod+Shift+X','Use a modifier and one letter or number, for example Mod+Shift+X'],
 ['快捷键需要 Ctrl、Command 或 Alt','The shortcut needs Ctrl, Command or Alt'],
 ['此快捷键由浏览器或系统使用','This shortcut is reserved by the browser or operating system'],
 ['此快捷键已被其他动作使用','Another action already uses this shortcut']
] as const;
export function localizeHotkeyError(error:string){const pair=hotkeyMessages.find(([zh,en])=>error===zh||error===en);return pair?t(pair[0],pair[1]):error;}
export function validateHotkey(...args:Parameters<typeof validateBinding>){const result=validateBinding(...args);return result.error?{...result,error:localizeHotkeyError(result.error)}:result;}
