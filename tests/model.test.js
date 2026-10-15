import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProfile,createVersion,emptyState,validateState,resumeText} from '../src/model.js';
test('resume versions are independent snapshots of the master profile',()=>{
 const profile={...blankProfile(),name:'Ada Example',experience:'Built reporting tools',skills:'SQL'};
 const version=createVersion(profile,'Data Analyst','v1');
 profile.experience='Changed master';version.profile.skills='Python';
 assert.equal(version.profile.experience,'Built reporting tools');assert.equal(profile.skills,'SQL');
 version.included=version.included.filter(s=>s!=='skills');assert.ok(!resumeText(version).includes('Python'));
 assert.ok(resumeText(version).includes('Built reporting tools'));
});
test('backup validation rejects malformed nested content and accepts complete workspaces',()=>{
 const state=emptyState();state.versions.push(createVersion(state.profile,'Resume','v1'));state.imports.push({id:'d1',name:'old.txt',text:'Experience'});
 assert.deepEqual(validateState(JSON.parse(JSON.stringify(state))),state);
 state.versions[0].recommendations='Use your existing experience';
 assert.equal(validateState(JSON.parse(JSON.stringify(state))).versions[0].recommendations,'Use your existing experience');
 assert.throws(()=>validateState({...state,versions:[{...state.versions[0],recommendations:{text:'Invalid'}}]}));
 assert.throws(()=>validateState({...state,versions:[{...state.versions[0],profile:{name:'Incomplete'}}]}));
 assert.throws(()=>validateState({...state,imports:[{id:'d1',name:'file',text:5}]}));
 assert.throws(()=>validateState({...state,versions:[{...state.versions[0],included:['password']}]}));
});
