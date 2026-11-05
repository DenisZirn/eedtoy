const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/App.jsx','utf8');
function app(overrides={}) {
 const c={console,Date,Blob:class{},URL:{},DOMParser:class{},isElectron:true,multiBusEnabled:true,writeBusId:'house',connectingWriteGateway:false,disconnectingGateway:false,writingSenders:false,busWritePort:'COM7',expectedWriteBaseId:'FF-AA-00-00',hasRs485Gateway:true,writeGatewayConnection:null,writeConnectRequestRef:{current:0},setTimeout:fn=>fn(),t:(key,args)=>key+JSON.stringify(args||{}),runtimeText:v=>v,...overrides};
 Object.defineProperties(c,{
  writeConnectionKey:{get:()=>`${c.busWritePort}|${c.expectedWriteBaseId}|house`},
  writeGatewayBusy:{get:()=>c.connectingWriteGateway||c.disconnectingGateway},
  busWriteGatewayAvailable:{get:()=>c.hasRs485Gateway&&!!c.busWritePort},
  busWriteGatewayConnected:{get:()=>!!c.writeGatewayConnection&&c.writeGatewayConnection.key===c.writeConnectionKey},
 });
 for(const key of ['WriteBusPort','Ports','ConnectingWriteGateway','DisconnectingGateway','WriteGatewayConnection','WriteSenderSummary','WriteSenderMsg','WriteSenderProgress']) c['set'+key]=value=>{const name=key==='WriteBusPort'?'busWritePort':key[0].toLowerCase()+key.slice(1);c[name]=typeof value==='function'?value(c[name]):value;};
 c.calls=[];c.window={electronAPI:{
  connectWriteGateway:async(args)=>{c.calls.push(args);return {ok:true,baseId:c.expectedWriteBaseId,portPath:c.busWritePort||'COM9'};},
  disconnectGateway:async args=>{c.calls.push(args);return {ok:true};},
  cancelWriteSenderIds:async()=>{c.calls.push('cancel');},
 }};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('const APP_VERSION'),source.indexOf('export default function App()'))+'\n'+source.slice(source.indexOf('  const handleConnectWriteGateway ='),source.indexOf('  const handleWriteSenderIds ='))+'\nthis.actions={handleConnectWriteGateway,handleDisconnectWriteGateway};',c);
 return c;
}
(async()=>{
 const a=app();assert(!a.busWriteGatewayConnected);
 await a.actions.handleConnectWriteGateway();
 assert.equal(a.calls[0].portPath,'COM7');assert.equal(a.calls[0].expectedBaseId,'FF-AA-00-00');
 assert(a.busWriteGatewayConnected);assert(!a.connectingWriteGateway);
 assert(a.writeSenderMsg.startsWith('senderWrite.connected'));
 await a.actions.handleDisconnectWriteGateway();assert(!a.busWriteGatewayConnected);
 assert.equal(a.calls[1].portPath,'COM7');assert(!a.disconnectingGateway);
 for(const reply of [{ok:false,error:'busy'},{ok:true,baseId:'FF-BB-00-00',portPath:'COM7'},{ok:true,baseId:'FF-AA-00-00',portPath:'COM8'}]) {
  const a=app();a.window.electronAPI.connectWriteGateway=async()=>reply;
  await a.actions.handleConnectWriteGateway();assert(!a.busWriteGatewayConnected);assert(!a.connectingWriteGateway);assert(a.writeSenderMsg.startsWith('senderWrite.connectFailed'));
 }
 const tree=require('@babel/parser').parse(source,{sourceType:'module',plugins:['jsx']});
 let disabledSource='';
 function visit(node){if(!node||typeof node!=='object')return;if(node.type==='JSXOpeningElement'&&node.name.name==='button'){
  const click=node.attributes.find(a=>a.name?.name==='onClick')?.value?.expression;
  if(click?.type==='ConditionalExpression'&&click.alternate?.name==='handleConnectWriteGateway'){
   const expression=node.attributes.find(a=>a.name?.name==='disabled').value.expression;
   disabledSource=source.slice(expression.start,expression.end);
  }
 }for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
 visit(tree);assert(disabledSource,'Connect button must exist');
 const emptyPort=app({busWritePort:''});assert.equal(vm.runInContext(disabledSource,emptyPort),false,'Actual JSX button must allow automatic discovery with an empty port');
 emptyPort.hasRs485Gateway=false;assert.equal(vm.runInContext(disabledSource,emptyPort),true);
 const auto=app({busWritePort:''});await auto.actions.handleConnectWriteGateway();
 assert.equal(auto.calls[0].portPath,'');assert.equal(auto.busWritePort,'COM9');assert(auto.busWriteGatewayConnected);
 // Run the actual React invalidation effect after the auto-discovery state update.
 auto.useEffect=fn=>fn();
 const effectStart=source.indexOf('  useEffect(() => {\n    // An automatic discovery');
 const effectEnd=source.indexOf('  }, [writeConnectionKey]);',effectStart)+'  }, [writeConnectionKey]);'.length;
 vm.runInContext(source.slice(effectStart,effectEnd),auto);assert(auto.busWriteGatewayConnected);
 auto.busWritePort='COM12';vm.runInContext(source.slice(effectStart,effectEnd),auto);assert(!auto.busWriteGatewayConnected);
 const thrown=app();thrown.window.electronAPI.connectWriteGateway=async()=>{throw Error('IPC failed');};await thrown.actions.handleConnectWriteGateway();assert(!thrown.connectingWriteGateway&&!thrown.busWriteGatewayConnected);
 const changed=app();await changed.actions.handleConnectWriteGateway();changed.busWritePort='COM9';assert(!changed.busWriteGatewayConnected);changed.busWritePort='COM7';changed.expectedWriteBaseId='FF-BB-00-00';assert(!changed.busWriteGatewayConnected);
 const stale=app();let complete;stale.window.electronAPI.connectWriteGateway=()=>new Promise(resolve=>{complete=resolve;});const pending=stale.actions.handleConnectWriteGateway();stale.writeConnectRequestRef.current++;stale.setConnectingWriteGateway(false);complete({ok:true,baseId:'FF-AA-00-00',portPath:'COM7'});await pending;assert(!stale.busWriteGatewayConnected);
 const failure=app();await failure.actions.handleConnectWriteGateway();failure.window.electronAPI.disconnectGateway=async()=>{throw Error('unplugged');};await failure.actions.handleDisconnectWriteGateway();assert(failure.busWriteGatewayConnected);assert(!failure.disconnectingGateway);assert(failure.writeSenderMsg.startsWith('status.disconnectFailed'));
 const writing=app();await writing.actions.handleConnectWriteGateway();writing.writingSenders=true;await writing.actions.handleDisconnectWriteGateway();assert(writing.calls.includes('cancel'));assert(!writing.busWriteGatewayConnected);
 console.log('Write-step connect/disconnect: success, failures, wrong bus/port, changed selection, stale results and cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
