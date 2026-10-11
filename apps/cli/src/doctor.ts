import { doctor } from '../../../packages/core/src/runtime/doctor.js';
import type { RuntimeConfig } from '../../../packages/contracts/src/runtime.js';
export async function runDoctor(config:RuntimeConfig){const report=await doctor(config);process.stdout.write(JSON.stringify(report,null,2)+'\n');return report;}
