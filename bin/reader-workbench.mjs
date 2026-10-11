#!/usr/bin/env node
import { main } from '../dist/cli.mjs';
main().catch(error=>{process.stderr.write((error.code??'START_FAILED')+': '+error.message+'\n');process.exitCode=1;});
