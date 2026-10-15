import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutosave} from '../src/autosave.js';
function fixture(t, options={}) {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  let state={profile:{name:''}},writes=[];
  const autosave=createAutosave({getState:()=>state,persist:value=>writes.push(JSON.parse(JSON.stringify(value))),...options});
  return {autosave,writes,state};
}
test('typing coalesces writes and saves the latest draft after a pause',t=>{
 const {autosave,writes,state}=fixture(t);
 state.profile.name='A';autosave.changed({defer:true});t.mock.timers.tick(300);
 state.profile.name='Ada';autosave.changed({defer:true});t.mock.timers.tick(399);assert.equal(writes.length,0);
 t.mock.timers.tick(1);assert.equal(writes.length,1);assert.equal(writes[0].profile.name,'Ada');
 assert.equal(autosave.getStatus().phase,'saved');assert.equal(autosave.getStatus().savedAt,writes[0].savedAt);
 t.mock.timers.tick(3000);assert.equal(writes.length,1);
});
test('continuous typing saves at the maximum interval',t=>{
 const {autosave,writes,state}=fixture(t);
 for(let i=0;i<10;i++){state.profile.name=String(i);autosave.changed({defer:true});t.mock.timers.tick(200);}
 assert.equal(writes.length,1);assert.equal(writes[0].profile.name,'9');
});
test('an action or lifecycle flush saves immediately and cancels pending writes',t=>{
 const {autosave,writes,state}=fixture(t);
 state.profile.name='Ada';autosave.changed({defer:true});assert.equal(autosave.flush(),true);
 assert.equal(writes.length,1);t.mock.timers.tick(3000);assert.equal(writes.length,1);
 state.profile.name='Grace';autosave.changed();assert.equal(writes.length,2);
 autosave.flush();assert.equal(writes.length,2);
});
test('failed writes remain dirty and preserve the last successful timestamp until retry',t=>{
 let blocked=true;const writes=[];
 const {autosave}=fixture(t,{savedAt:'2026-01-01T00:00:00.000Z',persist:value=>{if(blocked)throw Error('Quota');writes.push(value);}});
 assert.equal(autosave.changed(),false);assert.deepEqual(autosave.getStatus(),{phase:'error',dirty:true,savedAt:'2026-01-01T00:00:00.000Z'});
 blocked=false;assert.equal(autosave.flush(),true);assert.equal(writes.length,1);assert.equal(autosave.getStatus().dirty,false);
});
test('restoring a backup cancels an older pending draft',t=>{
 const {autosave,writes}=fixture(t);autosave.changed({defer:true});
 autosave.reset('2026-10-15T12:00:00.000Z');t.mock.timers.tick(3000);
 assert.equal(writes.length,0);assert.equal(autosave.getStatus().savedAt,'2026-10-15T12:00:00.000Z');
});
