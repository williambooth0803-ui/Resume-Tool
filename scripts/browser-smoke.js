import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import mammoth from 'mammoth';
const browser=await chromium.launch({headless:true,...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
const page=await browser.newPage({acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.RESUME_TEST_URL||'http://127.0.0.1:5173');
 await page.getByLabel('Name',{exact:true}).fill('Ada Example');
 await page.getByLabel('Experience',{exact:true}).fill('Built reporting tools at Example Company.');
 await page.getByLabel('Skills',{exact:true}).fill('SQL, Python');
 await page.reload();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Ada Example');
 await page.getByRole('button',{name:'Create a resume',exact:false}).click();
 await page.getByLabel('Name',{exact:true}).fill('Ada Tailored');
 await page.locator('[data-include="skills"]').uncheck();
 assert.ok(!(await page.locator('.paper').innerText()).includes('SQL, Python'));
 const [docDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download Word'}).click()]);
 const docBuffer=await readFile(await docDownload.path());const extracted=(await mammoth.extractRawText({buffer:docBuffer})).value;
 assert.ok(extracted.includes('Ada Tailored'));assert.ok(extracted.includes('Built reporting tools'));assert.ok(!extracted.includes('SQL, Python'));
 await page.getByRole('button',{name:'Duplicate',exact:true}).click();assert.equal(await page.locator('.version-tabs button').count(),2);
 assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Ada Tailored');
 await page.getByRole('button',{name:'Master profile',exact:false}).click();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Ada Example');
 await page.getByRole('button',{name:'Resume library',exact:false}).click();
 const pdfPage=await browser.newPage();await pdfPage.setContent('<h1>PDF Experience</h1><p>Designed accessible products.</p>');const pdfBuffer=await pdfPage.pdf();await pdfPage.close();
 await page.locator('#upload').setInputFiles([{name:'previous.txt',mimeType:'text/plain',buffer:Buffer.from('Coordinated a volunteer team.')},{name:'previous.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:docBuffer},{name:'previous.pdf',mimeType:'application/pdf',buffer:pdfBuffer}]);
 await page.getByRole('status').filter({hasText:'3 documents imported.'}).waitFor();
 assert.ok((await page.locator('#import-text').inputValue()).includes('Designed accessible products'));
 await page.locator('[data-import]').filter({hasText:'previous.txt'}).click();
 await page.locator('#source-details summary').click();await page.locator('#import-section').selectOption('experience');await page.getByRole('button',{name:'Append to profile'}).click();
 await page.getByRole('button',{name:'Master profile',exact:false}).click();assert.ok((await page.getByLabel('Experience',{exact:true}).inputValue()).includes('Coordinated a volunteer team.'));
 const [backup]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download backup'}).click()]);
 const backupBytes=await readFile(await backup.path());const snapshot=JSON.parse(backupBytes.toString());assert.equal(snapshot.versions.length,2);assert.equal(snapshot.imports.length,3);
 await page.getByLabel('Name',{exact:true}).fill('Temporary edit');
 page.once('dialog',dialog=>dialog.accept());await page.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backupBytes});
 await page.getByRole('status').filter({hasText:'Backup restored.'}).waitFor();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Ada Example');
 await page.locator('#restore').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"profile":null}')});
 await page.getByRole('status').filter({hasText:'Invalid backup file.'}).waitFor();assert.equal(await page.getByLabel('Name',{exact:true}).inputValue(),'Ada Example');
 const health=await(await page.request.get(new URL('/api/health',page.url()).href)).json();assert.equal(health.ok,true);
 if(!health.aiAvailable){const response=await page.request.post(new URL('/api/recommend',page.url()).href,{data:{profile:snapshot.profile,job:'Analyst'}});assert.equal(response.status(),503);}

 await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('button',{name:'Download backup'}).isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/resume-studio-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/resume-studio-desktop.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('Browser checks passed: profile persistence, independent versions, selection, Word export contents, duplication, TXT/DOCX/PDF imports, profile append, backup/restore, invalid backup rejection, API fallback, mobile layout.');
}catch(e){console.log(await page.locator('body').innerText());console.log('Page errors:',errors);await page.screenshot({path:'/tmp/resume-error.png',fullPage:true});throw e;}finally{await browser.close();}
