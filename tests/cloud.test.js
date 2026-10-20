const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../cloud.js','utf8').replace(/^import .*;\n/gm,'');
const garage=id=>({vehicles:[{id}],records:[]});
function harness({exists=true,accept=true}={}){
 const nodes={},storage=new Map(),writes=[],timers=new Map();let next=0,snapshot,authChanged,release;
 const ctx={Blob,console,state:garage('local'),selected:'local',render(){},
  setTimeout(fn){timers.set(++next,fn);return next},clearTimeout(id){timers.delete(id)},
  localStorage:{setItem(k,v){storage.set(k,v)}},
  window:{confirm(){return accept},addEventListener(){}},
  document:{getElementById(id){return nodes[id]??={style:{},addEventListener(){}}}},
  initializeApp(){return{}},getAuth(){return{}},getFirestore(){return{}},doc(...args){return args.join('/')},
  getDoc:async()=>({exists:()=>exists,data:()=>({payload:JSON.stringify(garage('remote'))})}),
  setDoc:async(ref,data)=>{writes.push({ref,raw:data.payload});if(ctx.hold){ctx.hold=false;await new Promise(r=>release=r)}},
  onSnapshot(ref,fn){snapshot=fn;return()=>{}},onAuthStateChanged(auth,fn){authChanged=fn},
  createUserWithEmailAndPassword(){},signInWithEmailAndPassword(){},signOut(){},
  pushSyncs:0,schedulePushSync(){ctx.pushSyncs++}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,storage,writes,enter:()=>ctx.enter({uid:'u',email:'test@example.com'}),release:()=>release(),
  remote(data){snapshot({exists:()=>true,data:()=>({payload:JSON.stringify(data)})})},
  logout:()=>authChanged(null),flush:async()=>{const tasks=[...timers.values()];timers.clear();for(const fn of tasks)await fn()}};
}
test('first login imports local garage only after confirmation and keeps a backup',async()=>{
 const h=harness({exists:false});await h.enter();assert.equal(JSON.parse(h.writes[0].raw).vehicles[0].id,'local');
 assert.equal(JSON.parse(h.storage.get('drivebook-cloud-backup')).vehicles[0].id,'local');assert.equal(h.ctx.state.vehicles.length,1);
 const declined=harness({exists:false,accept:false});await declined.enter();assert.equal(declined.writes.length,0);assert.equal(declined.ctx.state.vehicles[0].id,'local');
});
test('edits made during an upload are drained after the in-flight request',async()=>{
 const h=harness();await h.enter();h.ctx.hold=true;const upload=h.ctx.upload();
 h.ctx.state.vehicles.push({id:'new'});h.ctx.window.drivebookCloudChanged();await h.flush();h.release();await upload;
 assert.equal(h.writes.length,2);assert.equal(JSON.parse(h.writes[1].raw).vehicles.length,2);
});
test('a remote snapshot cannot overwrite a pending local edit',async()=>{
 const h=harness();await h.enter();h.ctx.state.vehicles.push({id:'unsaved'});h.ctx.window.drivebookCloudChanged();h.remote(garage('other-phone'));
 assert.equal(h.ctx.state.vehicles[1].id,'unsaved');await h.flush();assert.equal(JSON.parse(h.writes.at(-1).raw).vehicles.length,2);
});
test('remote changes update push terms and preserve the previous garage',async()=>{
 const h=harness();await h.enter();const before=h.ctx.pushSyncs;h.remote(garage('other-phone'));
 assert.equal(h.ctx.pushSyncs,before+1);assert.equal(h.ctx.state.vehicles[0].id,'other-phone');
 assert.equal(JSON.parse(h.storage.get('drivebook-cloud-backup')).vehicles[0].id,'remote');
});
test('backup storage failure prevents replacement of the local garage',async()=>{
 const h=harness();h.ctx.localStorage.setItem=()=>{throw Error('QuotaExceededError')};await h.enter();assert.equal(h.ctx.state.vehicles[0].id,'local');assert.equal(h.writes.length,0);
});
test('logout while a write is in flight prevents queued writes to the old account',async()=>{
 const h=harness();await h.enter();h.ctx.hold=true;const upload=h.ctx.upload();h.ctx.state.vehicles.push({id:'new'});h.ctx.window.drivebookCloudChanged();await h.logout();h.release();await upload;await h.flush();assert.equal(h.writes.length,1);
});
