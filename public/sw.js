const CACHE='zyvorax-shell-v1';
const APP_SHELL=['/','/index.html','/manifest.webmanifest','/icons/icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  if(new URL(req.url).origin!==self.location.origin) return;
  event.respondWith(fetch(req).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}
    return res;
  }).catch(()=>caches.match(req).then(cached=>cached||caches.match('/index.html'))));
});
