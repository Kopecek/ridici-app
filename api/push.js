const c=require('../server/core');
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
 if(req.method==='GET'){const missing=c.missing();let database='not-configured',databaseError='';if(!missing.length){try{await c.redis('PING');database='connected';}catch(e){database='error';databaseError=e.code||'DATABASE_CONNECTION_ERROR';}}return res.status(200).json({ready:!missing.length&&database!=='error',missing,publicKey:missing.length?'':process.env.VAPID_PUBLIC_KEY,database,databaseError});}
 if(req.method!=='POST')return res.status(405).json({error:'Použij POST.'});
 if(c.missing().length)return res.status(503).json({error:'Push služba není kompletně nastavená. Ověř sedm proměnných prostředí.'});
 if(req.headers.origin&&req.headers.origin!=='https://'+req.headers.host&&req.headers.origin!=='http://'+req.headers.host)return res.status(403).json({error:'Nepovolený původ.'});
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'Neplatný klíč zařízení.'});
 const id=c.hash(token),key=c.PREFIX+'device:'+id,body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(JSON.stringify(body).length>180000)return res.status(413).json({error:'Příliš mnoho údajů.'});
 const raw=await c.redis('GET',key),existing=raw?JSON.parse(raw):null;
 if(body.action==='subscribe'){
  if(!c.same(body.setupCode,process.env.PUSH_SETUP_CODE))return res.status(403).json({error:'Nesprávný aktivační kód.'});
  const ip=c.hash(req.headers['x-forwarded-for']||'unknown'),rate=c.PREFIX+'register:'+ip;const count=await c.redis('INCR',rate);if(count===1)await c.redis('EXPIRE',rate,3600);if(count>15)return res.status(429).json({error:'Zkus to později.'});
  const subscription=c.safeSubscription(body.subscription),plan=c.cleanPlan(body.plan||{});await c.redis('SET',key,JSON.stringify({subscription,plan,updatedAt:new Date().toISOString()}));await c.redis('SADD',c.PREFIX+'devices',id);return res.json({ok:true});
 }
 if(!existing)return res.status(404).json({error:'Zařízení není přihlášené. Zapni oznámení znovu.'});
 if(body.action==='unsubscribe'){await c.removeDevice(id);return res.json({ok:true});}
 if(body.action==='sync'){existing.plan=c.cleanPlan(body.plan||{});existing.updatedAt=new Date().toISOString();await c.redis('SET',key,JSON.stringify(existing));return res.json({ok:true,syncedAt:existing.updatedAt});}
 if(body.action==='test'){if(!await c.redis('SET',c.PREFIX+'test:'+id,'1','NX','EX',60))return res.status(429).json({error:'Další test můžeš odeslat za minutu.'});try{await c.send(existing.subscription,{title:'Drivebook – zkušební oznámení',body:'Push doručení funguje. Ověř i oznámení při zavřené aplikaci.',url:'/',tag:'drivebook-test'});}catch(e){if([404,410].includes(e.statusCode))await c.removeDevice(id);throw e;}return res.json({ok:true});}
 return res.status(400).json({error:'Neznámá akce.'});
}catch(e){const code=e.code||((e.name==='TimeoutError'||e.name==='AbortError')?'UPSTASH_TIMEOUT':e.name==='TypeError'?'NETWORK_ERROR':'PUSH_INTERNAL');console.error('[Drivebook push]',code,e.message);return res.status(502).json({error:'Push server: '+code+'. '+(code.startsWith('UPSTASH')?'Zkontroluj URL a REST token databáze Upstash ve Vercelu.':'Ověř nastavení push služby.')});}};
