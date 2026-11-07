import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PerformanceMeter} from '../src/performance-meter';
test('speed uses native emulated ticks against wall time, not UI timer frequency',()=>{
 const meter=new PerformanceMeter();assert.equal(meter.sample(0,10,0n,1000),null);
 assert.equal(meter.sample(500,20,100n,1000),null);
 assert.deepEqual(meter.sample(2000,30,500n,1000),{type:'metrics',fps:10,emulationSpeed:.25});
 assert.equal(meter.sample(3000,0,0n,1000),null);
});
