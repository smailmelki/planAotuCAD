// عامل الخدمة: يجعل التطبيق يعمل بلا إنترنت.
// عند تحديث index.html غيّر رقم النسخة أدناه (v1 ← v2) ليتحدّث التطبيق عند المستخدم.
const VER='plan-v3',CORE=['./','index.html','manifest.json','icon-192.png','icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(VER).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url),same=u.origin===location.origin;
  if(same){
    // ملفات التطبيق: من الذاكرة فورًا مع تحديثها في الخلفية
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>{
      const net=fetch(r).then(res=>{if(res&&res.ok)caches.open(VER).then(c=>c.put(r,res.clone()));return res}).catch(()=>hit);
      return hit||net;
    }));
  }else if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){
    // الخط العربي: يُحفظ عند أول تحميل ثم يعمل بلا إنترنت
    e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{caches.open(VER).then(c=>c.put(r,res.clone()));return res}).catch(()=>hit)));
  }
});
