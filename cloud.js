import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,onSnapshot} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const config={apiKey:'AIzaSyCU6GPTurQIuAokJWnqhg_lfGIqP69Upx4',authDomain:'drivebook-e6a51.firebaseapp.com',projectId:'drivebook-e6a51',storageBucket:'drivebook-e6a51.firebasestorage.app',messagingSenderId:'906244548293',appId:'1:906244548293:web:4c9d08972b7d095cdab2ac'};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const login=document.getElementById('db-cloud-login'),status=document.getElementById('db-cloud-status'),msg=document.getElementById('db-login-msg'),logout=document.getElementById('db-logout');
let current=null,ref=null,unsub=null,timer=null,ready=false,lastData='',session=null;
function tell(t){status.textContent=t}
function err(e){const m=String(e?.code||e?.message||e);if(m.includes('permission-denied'))return 'Firestore zamítl přístup. Je nutné publikovat bezpečnostní pravidla.';if(m.includes('auth/invalid-credential'))return 'Nesprávný e-mail nebo heslo.';if(m.includes('auth/email-already-in-use'))return 'Tento e-mail už má účet. Přihlas se.';if(m.includes('auth/weak-password'))return 'Heslo musí mít alespoň 6 znaků.';return m}
function applyRemote(remote){
 if(!remote||!Array.isArray(remote.vehicles)||!Array.isArray(remote.records))throw Error('Neplatný formát dat');
 const raw=JSON.stringify(remote),previous=JSON.stringify(state);
 // Preserve a recovery copy before replacing any local garage. Abort if storage is full.
 if(raw!==previous)localStorage.setItem('drivebook-cloud-backup',previous);
 localStorage.setItem('drivebook-v1',raw);
 window.drivebookCloudChanged=null;
 try{state=remote;selected=state.selected||state.vehicles[0]?.id;render()}finally{window.drivebookCloudChanged=changed}
 if(typeof schedulePushSync==='function')schedulePushSync();
}
async function upload(){
 const active=session;
 if(!ready||!current||!active)return;
 if(active.writing){active.pending=true;return}
 active.writing=true;
 try{
  do{
   active.pending=false;
   const raw=JSON.stringify(state);
   if(new Blob([raw]).size>850000)throw Error('Příliš velká data pro Firestore – zmenši fotografie a doklady');
   tell('Ukládám do cloudu…');
   await setDoc(active.ref,{payload:raw,updatedAt:Date.now()});
   if(session!==active)return;
   lastData=raw;
   // A new edit can arrive while the network request is in flight.
   if(JSON.stringify(state)!==raw)active.pending=true;
  }while(active.pending);
  tell('Synchronizováno · '+current.email);
 }catch(e){if(session===active){active.pending=true;tell('Chyba synchronizace: '+err(e))}}
 finally{active.writing=false}
}
function changed(){if(!ready||!session)return;session.pending=true;clearTimeout(timer);tell('Čeká na synchronizaci…');timer=setTimeout(upload,700)}
window.drivebookCloudChanged=changed;
async function enter(user){
 ready=false;current=user;ref=doc(db,'users',user.uid,'data','garage');
 const active=session={ref,writing:false,pending:false};
 login.hidden=true;login.style.display='none';logout.hidden=false;tell('Načítám garáž…');
 try{
  const snap=await getDoc(active.ref);
  if(session!==active)return;
  if(snap.exists()){
   const remote=JSON.parse(snap.data().payload);applyRemote(remote);lastData=JSON.stringify(remote);
  }else{
   const hasLocal=state.vehicles.length>0||state.records.length>0;
   if(hasLocal&&!window.confirm('Účet zatím nemá garáž. Převést do něj vozidla a záznamy uložené v tomto zařízení?')){
    tell('Převod zrušen. Místní garáž zůstala zachovaná.');return;
   }
   const raw=JSON.stringify(state);
   if(new Blob([raw]).size>850000)throw Error('Příliš velká data pro Firestore – zmenši fotografie a doklady');
   localStorage.setItem('drivebook-cloud-backup',raw);
   await setDoc(active.ref,{payload:raw,updatedAt:Date.now()});
   if(session!==active)return;
   lastData=raw;
   if(typeof schedulePushSync==='function')schedulePushSync();
  }
  ready=true;tell('Synchronizováno · '+user.email);
  // Preserve edits made while the initial write was in flight, too.
  if(JSON.stringify(state)!==lastData)changed();
  unsub=onSnapshot(active.ref,snap=>{
   if(session!==active||!ready||!snap.exists()||active.writing||active.pending)return;
   try{
    const raw=snap.data().payload;
    if(raw&&raw!==lastData){applyRemote(JSON.parse(raw));lastData=raw;tell('Aktualizováno z cloudu · '+user.email)}
   }catch(e){tell('Chyba čtení: '+err(e))}
  },e=>{if(session===active)tell('Chyba spojení: '+err(e))});
 }catch(e){
  if(session!==active)return;
  ready=false;tell('Cloud není připraven: '+err(e));msg.textContent=err(e);login.hidden=false;login.style.display='grid';
 }
}
onAuthStateChanged(auth,async user=>{
 if(unsub){unsub();unsub=null}clearTimeout(timer);ready=false;current=null;session=null;
 if(user)await enter(user);else{logout.hidden=true;login.hidden=false;login.style.display='grid';tell('Nepřihlášeno')}
});
window.addEventListener('online',()=>{if(ready&&session?.pending)upload()});
const form=document.getElementById('db-login-form');async function submit(register){msg.textContent='Připojuji…';const email=form.elements.email.value.trim(),password=form.elements.password.value;try{if(register)await createUserWithEmailAndPassword(auth,email,password);else await signInWithEmailAndPassword(auth,email,password);msg.textContent=''}catch(e){msg.textContent=err(e)}}
form.addEventListener('submit',e=>{e.preventDefault();submit(false)});document.getElementById('db-signup').addEventListener('click',()=>submit(true));logout.addEventListener('click',()=>signOut(auth));
