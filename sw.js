var CACHE='archivero-v3';
var FILES=['./','index.html','manifest.webmanifest','apple-touch-icon.png','icon-192.png','icon-512.png',
  'js/vfs.js','js/ui.js','js/app.js','js/viewers.js','js/pdf.js','js/tools.js','js/extra.js',
  'lib/jszip.min.js','lib/pdf.min.js','lib/pdf.worker.min.js','lib/pdf-lib.min.js','lib/mammoth.browser.min.js','lib/xlsx.full.min.js','lib/jspdf.umd.min.js','lib/lame.min.js','lib/pptxgen.bundle.js','lib/qrcode.js'];
self.addEventListener('install',function(e){ e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); })); self.skipWaiting(); });
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){ return Promise.all(ks.filter(function(k){ return /^archivero-/.test(k) && k!==CACHE; }).map(function(k){ return caches.delete(k); })); }));
  self.clients.claim();
});
// Propios: caché con actualización en segundo plano. OCR (cdn.jsdelivr.net y sus datos): se guardan al primer uso.
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET') return;
  var u=new URL(e.request.url), same=u.origin===location.origin, cdn=/jsdelivr\.net$|tessdata|projectnaptha/.test(u.hostname);
  if(!same && !cdn) return;
  e.respondWith(caches.match(e.request,{ignoreSearch:same}).then(function(hit){
    if(hit && cdn) return hit;
    var net=fetch(e.request).then(function(r){
      if(r && (r.ok || r.type==='opaque')){ var cp=r.clone(); caches.open(CACHE).then(function(c){ c.put(e.request,cp); }); }
      return r;
    }).catch(function(){ return hit; });
    return hit||net;
  }));
});
