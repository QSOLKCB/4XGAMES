// SPDX-License-Identifier: Apache-2.0
// One bounded Node admission measurement, not browser or natural-play evidence.
import fs from 'node:fs/promises';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createSaveFixture} from '../tests/save-fixtures.mjs';
import {encodeSaveEnvelope,decodeSaveEnvelope,saveByteLength,MAX_SAVE_BYTES,MAX_STATE_BYTES} from '../js/save-codec.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
const heap=[];const sample=phase=>heap.push({phase,...process.memoryUsage()});
const fixture=await createSaveFixture({maximal:true});global.gc?.();sample('validated fixture');
let start=performance.now();const text=encodeSaveEnvelope(fixture.envelope);const encodeMs=performance.now()-start;sample('encoded');
start=performance.now();const decoded=decodeSaveEnvelope(text);const decodeMs=performance.now()-start;sample('decoded');
start=performance.now();const restored=fixture.engine.migrateState(decoded.state);const cloneAndValidateMs=performance.now()-start;sample('cloned and validated');
const expected=hash(JSON.stringify(fixture.expectedState)),actual=hash(JSON.stringify(restored));if(expected!==actual)throw new Error('Save admission changed state.');
const result={environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,gcExposed:typeof global.gc==='function'},workload:{kind:'synthetic schema boundary, not natural gameplay',systems:64,planets:256,empires:6,facilityTypes:128,ships:360,concurrentRefits:360,queuedShipSnapshots:1280,turnReports:30,completionEntries:30*616,stringWorstCase:'U+0001 escaped to six JSON bytes per character; maximal admitted field lengths',note:'Queue reservations and historical counts deliberately exercise structural save-admission maxima; not claimed reachable through ordinary commands.'},bounds:{stateBytes:MAX_STATE_BYTES,envelopeBytes:MAX_SAVE_BYTES},measured:{stateBytes:saveByteLength(JSON.stringify(restored)),envelopeBytes:saveByteLength(text),encodeMs,decodeMs,cloneAndValidateMs,sampledHeapPeakBytes:Math.max(...heap.map(x=>x.heapUsed)),sampledRssPeakBytes:Math.max(...heap.map(x=>x.rss))},heapSamples:heap,correctness:{stateSha256:actual,exactStateMatch:true},limitations:['Single sequential Node observation; no speedup claim.','Memory is sampled at phase boundaries, not continuous peak or per-operation allocation.','Browser large-save admission and latency require the separate owner-approved browser test.'],stoppingCondition:'One construction, encoding, decoding and clone/validation; exact SHA-256 parity required.'};
const output=process.argv[2]||'docs/evidence/expansion/save-admission-node.json';await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,...result.measured,exactStateMatch:true}));
