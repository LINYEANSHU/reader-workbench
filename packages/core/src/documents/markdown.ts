import {readFile} from 'node:fs/promises';
import type {DocumentAdapter} from '../../../sdk/src/capabilities.js';
import {textParsed} from './text.js';
export const markdownAdapter:DocumentAdapter={supports:mime=>mime==='text/markdown',parse:async(input,signal)=>textParsed(input,await readFile(input.path,{encoding:'utf8',signal}),true)};
