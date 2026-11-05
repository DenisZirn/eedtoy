const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('electron/main.js','utf8'),handlers=new Map(),calls=[],remembered=[];
const c={listSerialPortsRobust:async()=>({ports:[{path:'COM5',source:'windows-cim'}]}),ipcMain:{handle:(name,handler)=>handlers.set(name,handler)},runPythonDetector:async(...args)=>{calls.push(args);return {ok:true,portPath:'COM5',baseId:'FF-AA-00-00'};},rememberBusConnection:(...args)=>remembered.push(args)};
vm.createContext(c);
const start=source.indexOf("ipcMain.handle('connect-write-gateway'");
vm.runInContext(source.slice(start,source.indexOf("ipcMain.handle('disconnect-gateway'",start)),c);
(async()=>{
 const connect=handlers.get('connect-write-gateway');
 for(const expectedBaseId of ['', 'invalid', '00-00-00-00']) assert.equal((await connect(null,{expectedBaseId})).ok,false);
 assert.equal(calls.length,0);
 await connect(null,{expectedBaseId:'ff-aa-00-00'});
 assert.equal(calls[0][0],'');assert.equal(calls[0][1],'fam14');assert.equal(calls[0][2].expectedBaseId,'FF-AA-00-00');
 assert.equal(remembered[0][0],'COM5');assert.equal(calls[0][2].candidatePorts[0].path,'COM5');
 await connect(null,{expectedBaseId:'FF-AA-00-00',portPath:' COM8 ',strictPort:true});assert.equal(calls[1][0],'COM8');assert.equal(calls[1][2].strictPort,true);assert.equal(calls[0][2].strictPort,false);
 c.runPythonDetector=async()=>{throw Error('detector unavailable');};assert.equal((await connect(null,{expectedBaseId:'FF-AA-00-00'})).ok,false);
 console.log('Write-gateway IPC validates the selected base, preserves automatic/manual port scope and handles failures.');
})().catch(error=>{console.error(error);process.exitCode=1;});
