import {createRoot} from 'react-dom/client';import {App} from './App.js';
import {restoreAppearance} from './appearance/AppearanceSwitch.js';
import './styles/tokens.css';import './styles/workbench.css';import './styles/viewers.css';import 'katex/dist/katex.min.css';
restoreAppearance();
createRoot(document.getElementById('root')!).render(<App/>);
import './styles/layout.css';

import './styles/selection.css';

import './styles/capture.css';
import './styles/plugins.css';
import './styles/voice.css';
