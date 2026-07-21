import {spawn} from 'node:child_process';

const children=[
  spawn(process.execPath,['server.mjs'],{stdio:'inherit'}),
  spawn(process.platform==='win32'?'npm.cmd':'npm',['run','dev:web'],{stdio:'inherit'})
];
const stop=()=>children.forEach(child=>{if(!child.killed)child.kill('SIGTERM')});
process.on('SIGINT',()=>{stop();process.exit(0)});
process.on('SIGTERM',()=>{stop();process.exit(0)});
children.forEach(child=>child.on('exit',code=>{if(code){stop();process.exit(code)}}));
