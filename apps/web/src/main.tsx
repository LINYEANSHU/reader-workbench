import {createRoot} from 'react-dom/client';import {App} from './App.js';
import {ControlTooltip} from './components/ControlTooltip.js';
import {restoreAppearance} from './appearance/AppearanceSwitch.js';
import {restoreLocale} from './i18n/index.js';
import './styles/tokens.css';import './styles/workbench.css';import './styles/viewers.css';import 'katex/dist/katex.min.css';
restoreAppearance();
restoreLocale();
window.addEventListener('storage',event=>{if(event.key==='reader:locale')restoreLocale();});
createRoot(document.getElementById('root')!).render(<><App/><ControlTooltip/></>);
import './styles/layout.css';
import './styles/controls.css';

import './styles/selection.css';

import './styles/capture.css';
import './styles/plugins.css';
import './styles/voice.css';
