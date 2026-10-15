import { spawn } from 'node:child_process';
const children=[spawn(process.execPath,['server/index.js'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'})];
let closing=false;
function stop(code=0){if(closing)return;closing=true;children.forEach(c=>c.kill('SIGTERM'));process.exitCode=code;}
children.forEach(c=>{c.on('error',e=>{console.error(e);stop(1)});c.on('exit',code=>stop(code??1));});
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
