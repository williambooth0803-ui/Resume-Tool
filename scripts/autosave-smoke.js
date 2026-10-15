import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
const page=await browser.newPage({acceptDownloads:true});
const base=process.env.RESUME_TEST_URL||'http://127.0.0.1:5173';
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const setItem=Storage.prototype.setItem;
 Storage.prototype.setItem=function(key,value){if(window.blockSaving&&key==='resume-studio-v1')throw new DOMException('Storage full','QuotaExceededError');return setItem.call(this,key,value);};
});
async function saved(){await page.locator('#save-state[data-phase="saved"]').waitFor();}
async function snapshot(){return page.evaluate(()=>JSON.parse(localStorage.getItem('resume-studio-v1')));}
try{
 await page.goto(base);
 await page.getByLabel('Name',{exact:true}).fill('Autosaved Person');await saved();
 assert.equal((await snapshot()).profile.name,'Autosaved Person');assert.match(await page.locator('#save-state').innerText(),/Autosaved at/);
 // Clicking navigation saves a draft before replacing its editor.
 await page.getByLabel('Skills',{exact:true}).fill('Navigation flush');
 await page.locator('[data-page="imports"]').first().click();assert.equal((await snapshot()).profile.skills,'Navigation flush');
 await page.locator('#upload').setInputFiles({name:'history.txt',mimeType:'text/plain',buffer:Buffer.from('Imported experience')});
 await page.locator('#notice').filter({hasText:'1 document imported.'}).waitFor();
 await page.locator('#import-text').fill('Reviewed experience');await saved();assert.equal((await snapshot()).imports[0].text,'Reviewed experience');
 await page.getByRole('button',{name:'Append to profile'}).click();assert.equal((await snapshot()).profile.summary,'Reviewed experience');
 await page.locator('[data-page="profile"]').first().click();await page.getByRole('button',{name:'Create a resume',exact:false}).click();
 await page.locator('#version-title').fill('Autosaved role');await page.locator('#job').fill('Target opportunity');
 await page.locator('[data-include="skills"]').uncheck();
 let data=await snapshot();assert.equal(data.versions[0].title,'Autosaved role');assert.equal(data.versions[0].job,'Target opportunity');assert.ok(!data.versions[0].included.includes('skills'));
 // AI response is mocked: check persistence without a real provider or credentials.
 await page.route('**/api/health',route=>route.fulfill({json:{ok:true,aiAvailable:true}}));
 await page.route('**/api/recommend',route=>route.fulfill({json:{advice:'Emphasize your reviewed experience.'}}));
 await page.reload();await page.locator('[data-page="versions"]').first().click();
 await page.getByRole('button',{name:'Get AI recommendations',exact:false}).click();await page.locator('.advice').waitFor();await saved();
 assert.equal((await snapshot()).versions[0].recommendations,'Emphasize your reviewed experience.');
 await page.reload();await page.locator('[data-page="versions"]').first().click();assert.match(await page.locator('.advice').innerText(),/reviewed experience/);
 await page.getByRole('button',{name:'Duplicate',exact:true}).click();assert.equal((await snapshot()).versions.length,2);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Delete',exact:true}).click();assert.equal((await snapshot()).versions.length,1);
 // Failed saves must never be shown as saved when moving between pages.
 await page.evaluate(()=>window.blockSaving=true);
 await page.getByLabel('Name',{exact:true}).fill('Unsaved but recoverable');
 await page.locator('#save-state[data-phase="error"]').waitFor();
 await page.locator('[data-page="profile"]').first().click();assert.equal(await page.locator('#save-state').getAttribute('data-phase'),'error');
 assert.notEqual((await snapshot()).versions[0].profile.name,'Unsaved but recoverable');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download backup'}).click()]);
 const backup=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(backup.versions[0].profile.name,'Unsaved but recoverable');
 // A later action retries once browser storage is available again.
 await page.evaluate(()=>window.blockSaving=false);await page.locator('[data-page="versions"]').first().click();await saved();
 assert.equal((await snapshot()).versions[0].profile.name,'Unsaved but recoverable');assert.equal(await page.locator('#notice').isVisible(),false);
 await page.locator('[data-page="imports"]').first().click();page.once('dialog',d=>d.accept());await page.locator('[data-delete-import]').click();assert.equal((await snapshot()).imports.length,0);
 // Pending typing is saved on page exit even if the debounce has not elapsed.
 await page.locator('[data-page="profile"]').first().click();await page.evaluate(()=>{
   const input=document.querySelector('[data-field="headline"]');input.value='Saved when backgrounded';input.dispatchEvent(new Event('input',{bubbles:true}));
   Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;
 });assert.equal((await snapshot()).profile.headline,'Saved when backgrounded');
 await page.getByLabel('Name',{exact:true}).fill('Saved on reload');
 await page.reload();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Saved on reload');
 assert.deepEqual(errors,[]);console.log('Autosave browser checks passed: typing, navigation, imports/edits, appending, versions/selection, AI advice persistence (mocked), deletion, storage failure status, backup recovery, retry, and page exit.');
}finally{await browser.close();}
