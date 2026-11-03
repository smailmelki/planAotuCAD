// عامل الخدمة: يجعل التطبيق يعمل بلا إنترنت بعد أول تحميل ناجح.
const VER='plan-v11';
const CORE=['./','index.html','css/styles.css','js/utils.js','js/geometry.js','js/app.js','manifest.json','icon-192.png','icon-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(VER)
      .then(cache=>cache.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==VER).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin===location.origin){
    event.respondWith(
      caches.match(request,{ignoreSearch:true}).then(cached=>{
        const fresh=fetch(request).then(response=>{
          if(response&&response.ok)caches.open(VER).then(cache=>cache.put(request,response.clone()));
          return response;
        }).catch(()=>cached);
        return cached||fresh;
      })
    );
  }else if(/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)){
    event.respondWith(
      caches.match(request).then(cached=>cached||fetch(request).then(response=>{
        caches.open(VER).then(cache=>cache.put(request,response.clone()));
        return response;
      }).catch(()=>cached))
    );
  }
});
