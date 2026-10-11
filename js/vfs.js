/* Archivero — sistema de archivos.
   Web (iPhone/iPad/navegador): IndexedDB.  Mac: carpeta real en disco a través del puente nativo.
   API por rutas ("/Carpeta/archivo.pdf"); todo devuelve Promesas. */
(function(){
'use strict';

var NATIVE = !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.fs);
var TRASH = '/.Papelera';

function norm(p){ p = ('/' + (p || '')).replace(/\/+/g, '/'); if(p.length > 1 && p.slice(-1) === '/') p = p.slice(0, -1); return p; }
function parent(p){ p = norm(p); var i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
function base(p){ p = norm(p); return p.slice(p.lastIndexOf('/') + 1); }
function join(a, b){ return norm(a + '/' + b); }
function ext(n){ var i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; }
function stem(n){ var i = n.lastIndexOf('.'); return i > 0 ? n.slice(0, i) : n; }
function inside(p, dir){ return p === dir || p.indexOf(dir === '/' ? '/' : dir + '/') === 0; }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

var MIME = {pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',heic:'image/heic',heif:'image/heif',svg:'image/svg+xml',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',
  mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac',opus:'audio/ogg',
  txt:'text/plain',md:'text/markdown',csv:'text/csv',html:'text/html',htm:'text/html',json:'application/json',xml:'application/xml',zip:'application/zip',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc:'application/msword',xls:'application/vnd.ms-excel',ppt:'application/vnd.ms-powerpoint',rtf:'application/rtf',epub:'application/epub+zip'};
function mimeOf(n){ return MIME[ext(n)] || 'application/octet-stream'; }

/* ---------- IndexedDB ---------- */
var dbp = null;
function db(){
  if(dbp) return dbp;
  dbp = new Promise(function(res, rej){
    var r = indexedDB.open('archivero', 1);
    r.onupgradeneeded = function(){
      var d = r.result;
      d.createObjectStore('nodes', {keyPath:'path'});
      d.createObjectStore('blobs');
      d.createObjectStore('meta', {keyPath:'path'});
      d.createObjectStore('kv');
    };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ rej(r.error); };
  });
  return dbp;
}
function tx(stores, mode, fn){
  return db().then(function(d){
    return new Promise(function(res, rej){
      var t = d.transaction(stores, mode), out;
      t.oncomplete = function(){ res(out); };
      t.onerror = t.onabort = function(){ rej(t.error || new Error('Error de almacenamiento')); };
      out = undefined;
      fn(t, function(v){ out = v; });
    });
  });
}
function reqP(r){ return new Promise(function(res, rej){ r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; }); }
function allUnder(store, dir){
  // todas las entradas cuya clave empieza por dir + '/'
  var pre = dir === '/' ? '/' : dir + '/';
  return tx([store], 'readonly', function(t, set){
    var out = [];
    t.objectStore(store).openCursor(IDBKeyRange.bound(pre, pre + '￿')).onsuccess = function(e){
      var c = e.target.result; if(c){ out.push(c.value); c.continue(); } else set(out);
    };
  });
}

/* ---------- kv y metadatos (ambas plataformas) ---------- */
var KV = {
  get: function(k){ return tx(['kv'], 'readonly', function(t, set){ t.objectStore('kv').get(k).onsuccess = function(e){ set(e.target.result); }; }); },
  set: function(k, v){ return tx(['kv'], 'readwrite', function(t){ t.objectStore('kv').put(v, k); }); },
  del: function(k){ return tx(['kv'], 'readwrite', function(t){ t.objectStore('kv').delete(k); }); }
};
var Meta = {
  get: function(p){ return tx(['meta'], 'readonly', function(t, set){ t.objectStore('meta').get(norm(p)).onsuccess = function(e){ set(e.target.result || {path:norm(p)}); }; }); },
  all: function(){ return tx(['meta'], 'readonly', function(t, set){ t.objectStore('meta').getAll().onsuccess = function(e){ set(e.target.result || []); }; }); },
  patch: function(p, obj){
    p = norm(p);
    return tx(['meta'], 'readwrite', function(t, set){
      var s = t.objectStore('meta');
      s.get(p).onsuccess = function(e){
        var m = e.target.result || {path:p};
        for(var k in obj){ if(obj[k] === null) delete m[k]; else m[k] = obj[k]; }
        s.put(m); set(m);
      };
    });
  },
  // al mover/renombrar, las etiquetas y favoritos viajan con el archivo
  rekey: function(src, dst){
    return tx(['meta'], 'readwrite', function(t){
      var s = t.objectStore('meta');
      s.openCursor().onsuccess = function(e){
        var c = e.target.result; if(!c) return;
        var m = c.value;
        if(inside(m.path, src)){ var np = dst + m.path.slice(src.length); c.delete(); m.path = np; s.put(m); }
        c.continue();
      };
    });
  },
  drop: function(p){
    return tx(['meta'], 'readwrite', function(t){
      var s = t.objectStore('meta');
      s.openCursor().onsuccess = function(e){ var c = e.target.result; if(!c) return; if(inside(c.value.path, p)) c.delete(); c.continue(); };
    });
  },
  copyTo: function(src, dst){
    return Meta.all().then(function(all){
      return tx(['meta'], 'readwrite', function(t){
        var s = t.objectStore('meta');
        all.forEach(function(m){ if(inside(m.path, src)){ var c = JSON.parse(JSON.stringify(m)); c.path = dst + m.path.slice(src.length); delete c.opened; s.put(c); } });
      });
    });
  }
};

/* ---------- backend web ---------- */
var Web = {
  init: function(){
    if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){});
    return Web.stat('/').then(function(s){
      if(s) return;
      var now = Date.now();
      return tx(['nodes'], 'readwrite', function(t){
        var n = t.objectStore('nodes');
        n.put({path:'/', name:'', kind:'dir', mtime:now, ctime:now});
        ['Documentos', 'Fotos', 'Música', 'Descargas'].forEach(function(f){ n.put({path:'/' + f, name:f, kind:'dir', mtime:now, ctime:now}); });
        n.put({path:TRASH, name:'.Papelera', kind:'dir', mtime:now, ctime:now});
      });
    });
  },
  stat: function(p){ p = norm(p); return tx(['nodes'], 'readonly', function(t, set){ t.objectStore('nodes').get(p).onsuccess = function(e){ set(e.target.result || null); }; }); },
  list: function(dir){
    dir = norm(dir);
    return allUnder('nodes', dir).then(function(all){
      var depth = dir === '/' ? 1 : dir.split('/').length;
      return all.filter(function(n){ return n.path.split('/').length - 1 === depth && n.path !== dir; });
    });
  },
  walk: function(dir){ return allUnder('nodes', norm(dir)); },
  read: function(p){
    return Web.stat(p).then(function(n){
      if(!n || n.kind !== 'file') throw new Error('No existe ' + base(p));
      return tx(['blobs'], 'readonly', function(t, set){ t.objectStore('blobs').get(n.id).onsuccess = function(e){ set(e.target.result); }; })
        .then(function(b){ if(!b) throw new Error('Contenido no encontrado'); return b.type ? b : new Blob([b], {type:mimeOf(n.name)}); });
    });
  },
  url: function(p){ return Web.read(p).then(function(b){ return URL.createObjectURL(b); }); },
  ensureDir: function(p){
    p = norm(p); if(p === '/') return Promise.resolve();
    return Web.stat(p).then(function(n){
      if(n) return;
      return Web.ensureDir(parent(p)).then(function(){ var now = Date.now(); return tx(['nodes'], 'readwrite', function(t){ t.objectStore('nodes').put({path:p, name:base(p), kind:'dir', mtime:now, ctime:now}); }); });
    });
  },
  write: function(p, blob){
    p = norm(p);
    if(!(blob instanceof Blob)) blob = new Blob([blob], {type:mimeOf(p)});
    return Web.ensureDir(parent(p)).then(function(){ return Web.stat(p); }).then(function(old){
      var now = Date.now(), id = old && old.id || uid();
      return tx(['nodes', 'blobs'], 'readwrite', function(t){
        t.objectStore('blobs').put(blob, id);
        t.objectStore('nodes').put({path:p, name:base(p), kind:'file', id:id, size:blob.size, mime:blob.type || mimeOf(p), mtime:now, ctime:old ? old.ctime : now});
      });
    });
  },
  mkdir: function(p){ return Web.ensureDir(p); },
  move: function(src, dst){
    src = norm(src); dst = norm(dst);
    return Web.stat(src).then(function(n){
      if(!n) throw new Error('No existe ' + base(src));
      return (n.kind === 'dir' ? Web.walk(src) : Promise.resolve([])).then(function(kids){
        return tx(['nodes'], 'readwrite', function(t){
          var s = t.objectStore('nodes');
          [n].concat(kids).forEach(function(k){
            s.delete(k.path);
            var c = JSON.parse(JSON.stringify(k)); c.path = dst + k.path.slice(src.length); c.name = base(c.path);
            if(k === n){ c.mtime = Date.now(); }
            s.put(c);
          });
        });
      });
    });
  },
  copy: function(src, dst){
    src = norm(src); dst = norm(dst);
    return Web.stat(src).then(function(n){
      if(!n) throw new Error('No existe ' + base(src));
      return (n.kind === 'dir' ? Web.walk(src) : Promise.resolve([])).then(function(kids){
        var list = [n].concat(kids), chain = Promise.resolve();
        list.forEach(function(k){
          var np = dst + k.path.slice(src.length);
          chain = chain.then(function(){ return k.kind === 'dir' ? Web.ensureDir(np) : Web.read(k.path).then(function(b){ return Web.write(np, b); }); });
        });
        return chain;
      });
    });
  },
  purgeRaw: function(p){
    p = norm(p);
    return Web.stat(p).then(function(n){
      if(!n) return;
      return (n.kind === 'dir' ? Web.walk(p) : Promise.resolve([])).then(function(kids){
        return tx(['nodes', 'blobs'], 'readwrite', function(t){
          [n].concat(kids).forEach(function(k){ t.objectStore('nodes').delete(k.path); if(k.id) t.objectStore('blobs').delete(k.id); });
        });
      });
    });
  },
  remove: function(p){
    p = norm(p);
    var tp = TRASH + '/' + uid();
    return Web.ensureDir(TRASH).then(function(){ return Web.move(p, tp); }).then(function(){
      return tx(['nodes'], 'readwrite', function(t){
        var s = t.objectStore('nodes');
        s.get(tp).onsuccess = function(e){ var n = e.target.result; n.orig = p; n.deleted = Date.now(); n.name = base(p); s.put(n); };
      });
    });
  },
  trashList: function(){ return Web.list(TRASH); },
  restore: function(tp){
    return Web.stat(tp).then(function(n){
      return uniquePath(n.orig || ('/' + n.name)).then(function(dst){
        return Web.ensureDir(parent(dst)).then(function(){ return Web.move(tp, dst); }).then(function(){
          return tx(['nodes'], 'readwrite', function(t){ var s = t.objectStore('nodes'); s.get(dst).onsuccess = function(e){ var m = e.target.result; delete m.orig; delete m.deleted; m.name = base(dst); s.put(m); }; });
        }).then(function(){ return dst; });
      });
    });
  },
  purge: function(tp){ return Web.purgeRaw(tp); },
  emptyTrash: function(){ return Web.trashList().then(function(l){ return Promise.all(l.map(function(n){ return Web.purgeRaw(n.path); })); }); },
  usage: function(){
    return (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({})).then(function(e){ return {used:e.usage || 0, total:e.quota || 0}; });
  }
};

/* ---------- backend Mac (puente nativo) ---------- */
function bridge(msg){ return window.webkit.messageHandlers.fs.postMessage(msg); }
function b64(blob){
  return new Promise(function(res, rej){
    var r = new FileReader();
    r.onload = function(){ var s = r.result; res(s.slice(s.indexOf(',') + 1)); };
    r.onerror = function(){ rej(r.error); };
    r.readAsDataURL(blob);
  });
}
var Mac = {
  init: function(){ return bridge({op:'root'}).then(function(r){ Mac.rootLabel = r; }); },
  stat: function(p){ return bridge({op:'stat', path:norm(p)}); },
  list: function(d){ return bridge({op:'list', path:norm(d)}); },
  walk: function(d){ return bridge({op:'walk', path:norm(d)}); },
  url: function(p){ return Promise.resolve('/__fs__' + norm(p).split('/').map(encodeURIComponent).join('/') + '?t=' + Date.now()); },
  read: function(p){
    return Mac.url(p).then(function(u){ return fetch(u); }).then(function(r){
      if(!r.ok) throw new Error('No se pudo leer ' + base(p));
      return r.blob();
    }).then(function(b){ return b.type ? b : new Blob([b], {type:mimeOf(p)}); });
  },
  write: function(p, blob){
    p = norm(p);
    if(!(blob instanceof Blob)) blob = new Blob([blob]);
    var CH = 4 * 1024 * 1024, off = 0, first = true;
    function step(){
      if(off >= blob.size && !first) return bridge({op:'writeEnd', path:p});
      var part = blob.slice(off, off + CH); off += CH;
      var f = first; first = false;
      return b64(part).then(function(d){ return bridge({op:'write', path:p, data:d, append:!f}); }).then(step);
    }
    return step();
  },
  mkdir: function(p){ return bridge({op:'mkdir', path:norm(p)}); },
  move: function(s, d){ return bridge({op:'move', src:norm(s), dst:norm(d)}); },
  copy: function(s, d){ return bridge({op:'copy', src:norm(s), dst:norm(d)}); },
  remove: function(p){ return bridge({op:'trash', path:norm(p)}); },
  trashList: function(){ return Promise.resolve([]); },
  restore: function(){ return Promise.reject(new Error('Restaura desde la Papelera del Mac')); },
  purge: function(){ return Promise.resolve(); },
  emptyTrash: function(){ return Promise.resolve(); },
  usage: function(){ return bridge({op:'usage'}); }
};

var B = NATIVE ? Mac : Web;

function exists(p){ return B.stat(p).then(function(s){ return !!s; }, function(){ return false; }); }
function uniquePath(p){
  p = norm(p);
  var dir = parent(p), name = base(p), e = ext(name), s = e ? stem(name) : name, i = 1;
  function tryP(cand){ return exists(cand).then(function(x){ if(!x) return cand; i++; return tryP(join(dir, s + ' ' + i + (e ? '.' + e : ''))); }); }
  return tryP(p);
}

window.VFS = {
  native: NATIVE, ios: NATIVE && !!window.ARCHIVERO_IOS, TRASH: TRASH,
  norm: norm, parent: parent, base: base, join: join, ext: ext, stem: stem, inside: inside, mimeOf: mimeOf,
  init: function(){ return B.init(); },
  stat: function(p){ return B.stat(p); },
  list: function(d){ return B.list(d).then(function(l){ return l.filter(function(n){ return n.name.charAt(0) !== '.'; }); }); },
  walk: function(d){ return B.walk(d || '/').then(function(l){ return l.filter(function(n){ return n.path.indexOf('/.') < 0; }); }); },
  read: function(p){ return B.read(p); },
  url: function(p){ return B.url(p); },
  text: function(p){ return B.read(p).then(function(b){ return b.text ? b.text() : new Response(b).text(); }); },
  write: function(p, blob){ return B.write(p, blob); },
  mkdir: function(p){ return B.mkdir(p); },
  exists: exists, uniquePath: uniquePath,
  move: function(s, d){
    s = norm(s); d = norm(d);
    if(s === d) return Promise.resolve(d);
    if(inside(d, s)) return Promise.reject(new Error('No se puede mover una carpeta dentro de sí misma'));
    return B.move(s, d).then(function(){ return Meta.rekey(s, d); }).then(function(){ return d; });
  },
  copy: function(s, d){ return B.copy(norm(s), norm(d)).then(function(){ return Meta.copyTo(norm(s), norm(d)); }).then(function(){ return d; }); },
  remove: function(p){ return B.remove(p).then(function(){ return NATIVE ? Meta.drop(norm(p)) : null; }); },
  trashList: function(){ return B.trashList(); },
  restore: function(p){ return B.restore(p); },
  purge: function(p){ return B.purge(p); },
  emptyTrash: function(){ return B.emptyTrash(); },
  usage: function(){ return B.usage(); },
  bridge: NATIVE ? bridge : null,
  rootLabel: function(){ return Mac.rootLabel || ''; }
};
window.Meta = Meta;
window.KV = KV;
}());
