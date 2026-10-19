self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('push',e=>{let payload={};try{payload=e.data?.json()||{}}catch{}e.waitUntil(self.registration.showNotification(payload.title||'Drivebook',{body:payload.body||'Otevři garáž a zkontroluj termíny.',icon:'/app-icon.png',badge:'/app-icon.png',tag:payload.tag||'drivebook',data:{url:'/'}}));});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const w of windows)if(new URL(w.url).origin===self.location.origin){await w.focus();return}return self.clients.openWindow('/');})());});
