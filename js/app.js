/* Archivero — navegador de archivos */
(function(){
'use strict';
var $ = UI.$, h = UI.h, icon = UI.icon, esc = UI.esc;

/* ---------- ajustes ---------- */
var DEF = {theme:'auto', accent:'#0B7A75', view:'grid', sort:'name', desc:false, showExt:true, pin:'', lockLeave:true, foldersFirst:true, confirmDelete:true,
  tags:[{n:'Rojo', c:'#E5484D'}, {n:'Naranja', c:'#F76B15'}, {n:'Amarillo', c:'#E8B90C'}, {n:'Verde', c:'#30A46C'}, {n:'Azul', c:'#0091FF'}, {n:'Morado', c:'#8E4EC6'}, {n:'Gris', c:'#8B8D98'}]};
var S = {};
try { S = JSON.parse(localStorage.getItem('archivero_settings') || '{}'); } catch(e){ S = {}; }
for(var k in DEF) if(!(k in S)) S[k] = DEF[k];
function save(){ try { localStorage.setItem('archivero_settings', JSON.stringify(S)); } catch(e){} }

function applyTheme(){
  var dark = S.theme === 'dark' || (S.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var r = document.documentElement.style;
  r.setProperty('--accent', S.accent); r.setProperty('--accent-2', S.accent + '26');
  var mt = document.querySelectorAll('meta[name=theme-color]');
  for(var i = 0; i < mt.length; i++) mt[i].setAttribute('content', dark ? '#16181B' : '#F4F2EE');
}
if(window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addListener(applyTheme);
applyTheme();
if(VFS.native) document.documentElement.classList.add('mac');

/* ---------- estado ---------- */
var st = {sec:'files', cwd:'/', q:'', sel:{}, selMode:false, filter:'all', items:[], meta:{}, last:null, clip:null, history:[]};

function metaMap(){ return Meta.all().then(function(a){ var m = {}; a.forEach(function(x){ m[x.path] = x; }); st.meta = m; return m; }); }
function M(p){ return st.meta[p] || {}; }
function tagColor(n){ for(var i = 0; i < S.tags.length; i++) if(S.tags[i].n === n) return S.tags[i].c; return '#8B8D98'; }

/* ---------- barra lateral ---------- */
var SECS = [
  {id:'files', t:'Mis archivos', i:'folder'},
  {id:'recent', t:'Recientes', i:'clock'},
  {id:'favs', t:'Favoritos', i:'star'},
  {id:'media', t:'Fotos y videos', i:'image'},
  {id:'docs', t:'Documentos', i:'text'},
  {id:'browser', t:'Navegador', i:'globe'},
  {id:'trash', t:'Papelera', i:'trash'}
];
function renderSide(){
  var n = $('#navs'); n.innerHTML = '';
  var hide = S.hideSecs || [];
  SECS.forEach(function(s){
    if(hide.indexOf(s.id) >= 0) return;
    n.appendChild(navBtn(s.id, s.t, icon(s.i)));
    // recientes y favoritos a la vista, como sublista
    if((s.id === 'recent' && hide.indexOf('recentList') < 0) || (s.id === 'favs' && hide.indexOf('favList') < 0)){
      var sub = h('div', {class:'subnav'});
      n.appendChild(sub);
      var list = Object.keys(st.meta).map(function(p){ return st.meta[p]; }).filter(function(m){ return s.id === 'recent' ? m.opened : m.fav; })
        .sort(function(a, b){ return (b.opened || 0) - (a.opened || 0); }).slice(0, 4);
      list.forEach(function(m){
        var nm = VFS.base(m.path), isFile = /\.[^\/]+$/.test(nm);
        sub.appendChild(h('button', {class:'nav mini', title:m.path, html:'<span style="color:' + (isFile ? UI.kindOf(nm).c : 'var(--accent)') + ';display:flex">' + icon(isFile ? UI.kindOf(nm).i : 'folder') + '</span>' + '<span class="ell">' + esc(nm) + '</span>',
          onclick:function(){ closeSide(); VFS.stat(m.path).then(function(x){ if(!x) return UI.toast('Ya no existe'); if(x.kind === 'dir') cd(x.path); else { Meta.patch(x.path, {opened:Date.now()}); Viewers.open(x.path, [x.path]); } }); }}));
      });
    }
  });
  if(hide.indexOf('conns') < 0){
    n.appendChild(h('div', {class:'nav-h', text:'Conexiones'}));
    if(VFS.native) Extra.conns().forEach(function(c){
      var b = h('button', {class:'nav' + (st.sec === 'files' && st.cwd.indexOf('/@c/' + c.id) === 0 ? ' on' : ''), html:icon(c.kind === 'cloud' ? 'cloud' : c.kind === 'server' ? 'hdd' : 'folder') + '<span class="ell">' + esc(c.name) + '</span>', onclick:function(){ closeSide(); cd('/@c/' + c.id); }});
      if(c.custom) UI.onHold(b, function(at){ UI.menu([{t:'Quitar conexión', i:'x', danger:true, fn:function(){ VFS.bridge({op:'connRemove', id:c.id}).then(function(){ Extra.loadConns().then(renderSide); }); }}], at, c.name); });
      n.appendChild(b);
    });
    else n.appendChild(h('button', {class:'nav', html:icon('folder') + '<span class="ell">Archivos (iCloud, Drive…)</span>', onclick:function(){ closeSide(); importPick(); }}));
    n.appendChild(h('button', {class:'nav', html:icon('upload') + '<span class="ell">Transferir archivos</span>', onclick:function(){ closeSide(); Extra.transfer(); }}));
    n.appendChild(h('button', {class:'nav', html:icon('plus') + '<span class="ell">Añadir conexión</span>', onclick:function(){ closeSide(); Extra.addConnection(); }}));
  }
  if(hide.indexOf('tags') < 0){
    n.appendChild(h('div', {class:'nav-h', text:'Etiquetas'}));
    S.tags.forEach(function(t){ n.appendChild(navBtn('tag:' + t.n, t.n, '<span class="tagdot" style="background:' + t.c + ';margin:0 5px"></span>')); });
  }
  n.appendChild(h('div', {class:'nav-h', text:'Más'}));
  n.appendChild(navBtn('tools', 'Herramientas', icon('tools')));
  n.appendChild(navBtn('settings', 'Ajustes', icon('gear')));
  var foot = h('div', {class:'row sidefoot'}, [
    h('button', {class:'tb', title:'Centro de control', html:'<svg class="i" viewBox="0 0 24 24"><circle cx="7" cy="7" r="3" fill="#E5484D" stroke="none"/><circle cx="17" cy="7" r="3" fill="#888" stroke="none"/><circle cx="7" cy="17" r="3" fill="#333" stroke="none"/><circle cx="17" cy="17" r="3" fill="#333" stroke="none"/></svg>', onclick:function(){ closeSide(); Extra.controlCenter(); }}),
    h('span', {class:'grow'}),
    h('button', {class:'tb', title:'Barra compacta', html:icon('pip'), onclick:function(){ S.sideCompact = !S.sideCompact; save(); applySide(); }})]);
  n.appendChild(foot);
  if(Date.now() - (renderSide.t || 0) < 60000) { renderTabs(); return; }
  renderSide.t = Date.now();
  VFS.usage().then(function(u){
    var el = $('#storage');
    var where = VFS.native ? ('Carpeta: ' + VFS.rootLabel()) : 'En este dispositivo';
    el.innerHTML = '<div class="row"><b style="color:var(--text);font-size:12.5px">Almacenamiento</b></div><div class="meter"><i style="width:' + (u.total ? Math.min(100, u.used / u.total * 100) : 0) + '%"></i></div>' +
      esc(UI.size(u.used)) + (u.total ? ' de ' + esc(UI.size(u.total)) : '') + '<br><span style="font-size:11px">' + esc(where) + '</span>';
  }).catch(function(){});
  renderTabs();
}
function applySide(){ document.documentElement.classList.toggle('compact', !!S.sideCompact); }
function navBtn(id, t, ic){
  var on = st.sec === id && !(id === 'files' && st.cwd.indexOf('/@c/') === 0);
  var b = h('button', {class:'nav' + (on ? ' on' : ''), 'data-sec':id, title:t, html:ic + '<span class="ell">' + esc(t) + '</span>', onclick:function(){ go(id); closeSide(); }});
  // soltar archivos sobre favoritos, etiquetas o papelera
  if(id === 'favs' || id === 'trash' || id.indexOf('tag:') === 0 || id === 'files'){
    b.addEventListener('dragover', function(e){ if(dragPaths){ e.preventDefault(); b.classList.add('drop'); } });
    b.addEventListener('dragleave', function(){ b.classList.remove('drop'); });
    b.addEventListener('drop', function(e){
      b.classList.remove('drop'); if(!dragPaths) return; e.preventDefault();
      var ps = dragPaths; dragPaths = null;
      if(id === 'trash') removePaths(ps);
      else if(id === 'favs') Promise.all(ps.map(function(p){ return Meta.patch(p, {fav:true}); })).then(function(){ UI.toast('Agregado a Favoritos'); refresh(); });
      else if(id === 'files') movePaths(ps, '/');
      else { var tg = id.slice(4); Promise.all(ps.map(function(p){ var t = (M(p).tags || []).slice(); if(t.indexOf(tg) < 0) t.push(tg); return Meta.patch(p, {tags:t}); })).then(function(){ UI.toast('Etiqueta «' + tg + '»'); refresh(); }); }
    });
  }
  return b;
}
function renderTabs(){
  var t = $('#tabs'); t.innerHTML = '';
  [['files', 'Archivos', 'folder'], ['recent', 'Recientes', 'clock'], ['browser', 'Navegador', 'globe'], ['tools', 'Herramientas', 'tools'], ['settings', 'Ajustes', 'gear']].forEach(function(x){
    t.appendChild(h('button', {class:st.sec === x[0] ? 'on' : '', html:icon(x[2]) + '<span>' + x[1] + '</span>', onclick:function(){ go(x[0]); }}));
  });
}
function openSide(){ $('#side').classList.add('open'); var s = h('div', {id:'scrim', onclick:closeSide}); document.body.appendChild(s); }
function closeSide(){ $('#side').classList.remove('open'); var s = $('#scrim'); if(s) s.remove(); }

/* ---------- navegación ---------- */
function go(sec){
  st.sec = sec; st.q = ''; $('#q').value = ''; st.filter = 'all';
  exitSel();
  if(sec === 'files' && st.cwd !== '/' && st.lastSec === 'files'){ st.cwd = '/'; }
  st.lastSec = sec;
  renderSide(); render();
  $('#content').scrollTop = 0;
}
function cd(p){
  p = VFS.norm(p);
  var m = M(p);
  var need = m.locked && S.pin && !unlocked[p];
  (need ? askPin('Carpeta protegida').then(function(ok){ if(ok) unlocked[p] = true; return ok; }) : Promise.resolve(true)).then(function(ok){
    if(!ok) return;
    st.sec = 'files'; st.lastSec = 'files'; st.cwd = p; st.q = ''; $('#q').value = ''; exitSel();
    renderSide(); render(); $('#content').scrollTop = 0;
  });
}
var unlocked = {};
function up(){ if(st.sec === 'files' && st.cwd !== '/') cd(VFS.parent(st.cwd)); }

function title(){
  if(st.q) return 'Buscar';
  if(st.sec === 'files'){ if(st.cwd === '/') return 'Mis archivos'; if(/^\/@c\/[^/]+$/.test(st.cwd)) return Extra.connName(st.cwd); return VFS.base(st.cwd); }
  if(st.sec.indexOf('tag:') === 0) return st.sec.slice(4);
  for(var i = 0; i < SECS.length; i++) if(SECS[i].id === st.sec) return SECS[i].t;
  return st.sec === 'tools' ? 'Herramientas' : st.sec === 'settings' ? 'Ajustes' : '';
}
function renderCrumbs(){
  var c = $('#crumbs'); c.innerHTML = '';
  var show = st.sec === 'files' && !st.q && st.cwd !== '/';
  c.classList.toggle('hidden', !show);
  $('#bUp').classList.toggle('hidden', !show);
  if(!show) return;
  var parts = st.cwd.split('/').filter(Boolean), acc = '';
  if(parts[0] === '@c'){ acc = '/@c'; parts.shift(); }
  var root = h('button', {text:'Mis archivos', onclick:function(){ cd('/'); }}); dropTarget(root, '/'); if(!acc) c.appendChild(root);
  parts.forEach(function(p, i){
    acc += '/' + p;
    var path = acc;
    c.insertAdjacentHTML('beforeend', icon('chev'));
    var b = h('button', {class:i === parts.length - 1 ? 'cur' : '', text:i === 0 && path.indexOf('/@c/') === 0 ? Extra.connName(path) : p, onclick:function(){ cd(path); }});
    dropTarget(b, path);
    c.appendChild(b);
  });
  c.scrollLeft = 99999;
}
function renderChips(){
  var c = $('#chips');
  var show = st.sec === 'files' || st.sec === 'recent' || st.sec === 'favs' || st.q || st.sec.indexOf('tag:') === 0;
  c.classList.toggle('hidden', !show);
  if(!show) return;
  c.innerHTML = '';
  [['all', 'Todo'], ['dir', 'Carpetas'], ['pdf', 'PDF'], ['image', 'Imágenes'], ['video', 'Videos'], ['audio', 'Audio'], ['doc', 'Documentos'], ['zip', 'ZIP']].forEach(function(f){
    c.appendChild(h('button', {class:'chip' + (st.filter === f[0] ? ' on' : ''), text:f[1], onclick:function(){ st.filter = f[0]; render(); }}));
  });
}
function passFilter(n){
  var f = st.filter; if(f === 'all') return true;
  if(f === 'dir') return n.kind === 'dir';
  if(n.kind === 'dir') return false;
  var k = UI.kindOf(n.name).k;
  if(f === 'doc') return ['word', 'excel', 'ppt', 'text', 'md', 'code', 'html', 'epub'].indexOf(k) >= 0;
  return k === f;
}

/* ---------- datos por sección ---------- */
function fold(s){ return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function load(){
  return metaMap().then(function(meta){
    if(st.q){
      var q = fold(st.q);
      return VFS.walk('/').then(function(all){
        return all.filter(function(n){
          if(n.path === '/') return false;
          if(fold(n.name).indexOf(q) >= 0) return true;
          var t = (M(n.path).tags || []).join(' ');
          return fold(t).indexOf(q) >= 0 || fold(M(n.path).note || '').indexOf(q) >= 0;
        });
      });
    }
    if(st.sec === 'files') return VFS.list(st.cwd);
    if(st.sec === 'trash') return VFS.trashList();
    if(st.sec === 'media' || st.sec === 'docs'){
      return VFS.walk('/').then(function(all){
        return all.filter(function(n){
          if(n.kind !== 'file') return false;
          var k = UI.kindOf(n.name).k;
          return st.sec === 'media' ? (k === 'image' || k === 'video') : ['pdf', 'word', 'excel', 'ppt', 'text', 'md', 'epub'].indexOf(k) >= 0;
        });
      });
    }
    var paths = [];
    for(var p in meta){
      var m = meta[p];
      if(st.sec === 'recent' && m.opened) paths.push(p);
      else if(st.sec === 'favs' && m.fav) paths.push(p);
      else if(st.sec.indexOf('tag:') === 0 && (m.tags || []).indexOf(st.sec.slice(4)) >= 0) paths.push(p);
    }
    if(st.sec === 'recent') paths.sort(function(a, b){ return meta[b].opened - meta[a].opened; }), paths = paths.slice(0, 60);
    return Promise.all(paths.map(function(p){ return VFS.stat(p).catch(function(){ return null; }); })).then(function(l){ return l.filter(Boolean).filter(function(n){ return n.path.indexOf('/.') < 0; }); });
  });
}
function sortItems(list){
  var by = S.sort, d = S.desc ? -1 : 1;
  if(st.sec === 'recent' && !st.q) return list;
  list.sort(function(a, b){
    if(S.foldersFirst && a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    var r = 0;
    if(by === 'date') r = (a.mtime || 0) - (b.mtime || 0);
    else if(by === 'size') r = (a.size || 0) - (b.size || 0);
    else if(by === 'kind') r = (VFS.ext(a.name)).localeCompare(VFS.ext(b.name));
    if(!r) r = a.name.localeCompare(b.name, 'es', {numeric:true, sensitivity:'base'});
    return r * d;
  });
  if(st.sec === 'trash') list.sort(function(a, b){ return (b.deleted || 0) - (a.deleted || 0); });
  return list;
}

/* ---------- dibujo ---------- */
var renderSeq = 0;
function render(){
  $('#title').textContent = title();
  document.title = title() + ' — Archivero';
  renderCrumbs(); renderChips();
  var bar = st.sec === 'tools' || st.sec === 'settings' || st.sec === 'browser';
  ['#bSelect', '#bView', '#bSort'].forEach(function(s){ $(s).classList.toggle('hidden', bar); });
  $('#bView').innerHTML = icon(S.view === 'grid' ? 'list' : 'grid');
  $('#fab').classList.toggle('hidden', st.sec !== 'files' || st.selMode);
  var C = $('#content'), seq = ++renderSeq;
  if(st.sec === 'tools' && !st.q){ C.innerHTML = ''; Tools.renderTools(C); return; }
  if(st.sec === 'browser' && !st.q){ C.innerHTML = ''; Extra.renderBrowser(C); return; }
  if(st.sec === 'settings' && !st.q){ C.innerHTML = ''; Tools.renderSettings(C); return; }
  var spin = setTimeout(function(){ if(seq === renderSeq) C.innerHTML = '<div class="spin" style="margin-top:80px"></div>'; }, 250);
  load().then(function(list){
    clearTimeout(spin);
    if(seq !== renderSeq) return;
    renderSide();
    list = sortItems(list.filter(passFilter));
    st.items = list;
    draw(list);
  }).catch(UI.fail);
}
function draw(list){
  var C = $('#content'), keep = C.scrollTop;
  C.innerHTML = '';
  C.classList.toggle('selmode', st.selMode);
  if(st.sec === 'trash'){
    var top = h('div', {class:'row', style:'margin:0 0 12px;flex-wrap:wrap'});
    if(VFS.native){
      top.appendChild(h('div', {class:'muted grow', text:'En el Mac, lo que eliminas va a la Papelera del sistema; desde allí puedes recuperarlo.'}));
      top.appendChild(h('button', {class:'btn sec', html:icon('trash') + 'Abrir Papelera del Mac', onclick:function(){ VFS.bridge({op:'openTrash'}); }}));
      C.appendChild(top); return;
    }
    if(list.length){
      top.appendChild(h('div', {class:'muted grow', text:list.length + ' elemento' + (list.length > 1 ? 's' : '') + '. Toca uno para restaurarlo.'}));
      top.appendChild(h('button', {class:'btn sec', style:'color:var(--danger)', html:icon('trash') + 'Vaciar papelera', onclick:function(){
        UI.confirm('¿Vaciar la papelera?', 'Los archivos se borrarán para siempre.', 'Vaciar', true).then(function(ok){ if(ok) VFS.emptyTrash().then(function(){ UI.toast('Papelera vacía'); render(); renderSide(); }); });
      }}));
      C.appendChild(top);
    }
  }
  if(!list.length){ C.appendChild(emptyState()); return; }
  var wrap = h('div', {class:S.view === 'grid' ? 'grid' : 'list'});
  list.forEach(function(n){ wrap.appendChild(card(n)); });
  C.appendChild(wrap);
  C.scrollTop = keep;
  Thumbs.observe(wrap);
}
function emptyState(){
  var e = h('div', {class:'empty'});
  var map = {files:['folder', st.cwd === '/' ? 'Tu archivero está vacío' : 'Carpeta vacía', 'Importa archivos, escanea documentos o arrástralos aquí.'],
    recent:['clock', 'Nada reciente', 'Los archivos que abras aparecerán aquí.'], favs:['star', 'Sin favoritos', 'Mantén presionado un archivo y elige «Favorito».'],
    trash:['trash', 'Papelera vacía', 'Lo que elimines quedará aquí hasta que vacíes la papelera.'], media:['image', 'Sin fotos ni videos', 'Importa desde Fotos o la cámara.'], docs:['text', 'Sin documentos', '']};
  var m = st.q ? ['search', 'Sin resultados', 'Nada coincide con «' + st.q + '».'] : (map[st.sec] || ['tag', 'Sin archivos con esta etiqueta', 'Mantén presionado un archivo y elige «Etiquetas».']);
  e.innerHTML = icon(m[0]) + '<h3>' + esc(m[1]) + '</h3><div>' + esc(m[2]) + '</div>';
  if(st.sec === 'files' && !st.q){
    var a = h('div', {class:'actions'});
    a.appendChild(h('button', {class:'btn', html:icon('upload') + 'Importar', onclick:importPick}));
    a.appendChild(h('button', {class:'btn sec', html:icon('scan') + 'Escanear', onclick:function(){ Tools.scan(st.cwd); }}));
    a.appendChild(h('button', {class:'btn sec', html:icon('folderplus') + 'Carpeta', onclick:newFolder}));
    e.appendChild(a);
  }
  return e;
}
function dispName(n){ if(n.kind === 'dir' || S.showExt) return n.name; return VFS.stem(n.name); }
function card(n){
  var m = M(n.path), isDir = n.kind === 'dir', k = isDir ? null : UI.kindOf(n.name);
  var c = h('div', {class:'card' + (st.sel[n.path] ? ' sel' : ''), 'data-path':n.path, draggable:'ontouchstart' in window ? null : 'true'});
  var th = h('div', {class:'thumb' + (k && (k.k === 'image' || k.k === 'video') ? ' photo' : ''), html:isDir ? UI.folderIcon(m.color) : UI.fileIcon(n.name)});
  if(!isDir && Thumbs.can(n)) th.setAttribute('data-th', n.path + '|' + (n.mtime || 0));
  if(isDir && m.locked) th.insertAdjacentHTML('beforeend', '<span class="badge">' + icon('lock').replace('class="i"', 'class="i" style="width:12px;height:12px"') + '</span>');
  var dots = (m.tags || []).map(function(t){ return '<span class="tagdot" style="background:' + tagColor(t) + '"></span>'; }).join('');
  var sub = st.sec === 'trash' ? 'Eliminado ' + UI.date(n.deleted) :
    (st.q || ['recent', 'favs', 'media', 'docs'].indexOf(st.sec) >= 0 || st.sec.indexOf('tag:') === 0) ? (VFS.parent(n.path) === '/' ? 'Mis archivos' : VFS.base(VFS.parent(n.path))) :
    isDir ? UI.date(n.mtime) : UI.size(n.size);
  var meta = h('div', {class:'meta', html:'<div class="nm">' + esc(dispName(n)) + (dots ? '<span class="dots">' + dots + '</span>' : '') + '</div><div class="sub ell">' + esc(sub) + '</div>'});
  c.appendChild(h('span', {class:'check'}));
  c.appendChild(th);
  c.appendChild(meta);
  if(S.view === 'list'){
    c.appendChild(h('div', {class:'size', text:isDir ? '' : UI.size(n.size)}));
    c.appendChild(h('div', {class:'date', text:UI.date(n.mtime)}));
  }
  if(m.fav) c.appendChild(h('span', {class:'fav', html:icon('star')}));
  var more = h('button', {class:'tb more', html:icon('more'), onclick:function(e){ e.stopPropagation(); itemMenu(n, more); }});
  c.appendChild(more);
  c.addEventListener('click', function(e){
    if(st.selMode || e.metaKey || e.shiftKey){ toggleSel(n.path, e.shiftKey); return; }
    openItem(n);
  });
  UI.onHold(c, function(at){ if(st.selMode) toggleSel(n.path); else itemMenu(n, at); });
  if(c.draggable){
    c.addEventListener('dragstart', function(e){
      dragPaths = st.sel[n.path] ? Object.keys(st.sel) : [n.path];
      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData('text/plain', dragPaths.join('\n'));
    });
    c.addEventListener('dragend', function(){ dragPaths = null; });
  }
  if(isDir) dropTarget(c, n.path);
  return c;
}

/* ---------- arrastrar ---------- */
var dragPaths = null;
function dropTarget(el, dir){
  el.addEventListener('dragover', function(e){ if(dragPaths && dragPaths.indexOf(dir) < 0){ e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); } else if(hasFiles(e)){ e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); } });
  el.addEventListener('dragleave', function(){ el.classList.remove('drop'); });
  el.addEventListener('drop', function(e){
    el.classList.remove('drop'); $('#content').classList.remove('dragover');
    if(dragPaths){ e.preventDefault(); e.stopPropagation(); var ps = dragPaths; dragPaths = null; if(ps.indexOf(dir) < 0) movePaths(ps, dir); return; }
    if(hasFiles(e)){ e.preventDefault(); e.stopPropagation(); importDrop(e.dataTransfer, dir); }
  });
}
function hasFiles(e){ var t = e.dataTransfer && e.dataTransfer.types; return t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
(function(){
  var C = $('#content');
  C.addEventListener('dragover', function(e){ if(hasFiles(e) && st.sec === 'files'){ e.preventDefault(); C.classList.add('dragover'); } });
  C.addEventListener('dragleave', function(e){ if(e.target === C) C.classList.remove('dragover'); });
  C.addEventListener('drop', function(e){ C.classList.remove('dragover'); if(hasFiles(e) && st.sec === 'files'){ e.preventDefault(); importDrop(e.dataTransfer, st.cwd); } });
  document.addEventListener('dragover', function(e){ if(hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', function(e){ if(hasFiles(e)) e.preventDefault(); });
}());

/* ---------- selección ---------- */
function toggleSel(p, range){
  if(range && st.anchor){
    var ps = st.items.map(function(n){ return n.path; }), a = ps.indexOf(st.anchor), b = ps.indexOf(p);
    if(a >= 0 && b >= 0){ for(var i = Math.min(a, b); i <= Math.max(a, b); i++) st.sel[ps[i]] = true; }
  } else if(st.sel[p]) delete st.sel[p]; else st.sel[p] = true;
  st.anchor = p;
  if(!st.selMode) st.selMode = true;
  syncSel();
}
function syncSel(){
  UI.$$('#content .card').forEach(function(c){ c.classList.toggle('sel', !!st.sel[c.getAttribute('data-path')]); });
  $('#content').classList.toggle('selmode', st.selMode);
  $('#fab').classList.toggle('hidden', st.sec !== 'files' || st.selMode);
  $('#bSelect').innerHTML = st.selMode ? '<b style="font-size:15px">OK</b>' : icon('checkc');
  var n = Object.keys(st.sel).length, bar = $('#selbar');
  bar.classList.toggle('hidden', !st.selMode);
  if(!st.selMode) return;
  $('#title').textContent = n ? n + ' seleccionado' + (n > 1 ? 's' : '') : 'Seleccionar';
  var ps = Object.keys(st.sel);
  var allPdf = n > 1 && ps.every(function(p){ return VFS.ext(p) === 'pdf'; });
  var allImg = n > 0 && ps.every(function(p){ return UI.kindOf(p).k === 'image'; });
  bar.innerHTML = '';
  function B(t, i, fn, cls){ bar.appendChild(h('button', {class:cls || '', disabled:!n && t !== 'Todo', html:icon(i) + t, onclick:fn})); }
  B('Todo', 'checkc', function(){ var all = st.items.length === n; st.sel = {}; if(!all) st.items.forEach(function(x){ st.sel[x.path] = true; }); syncSel(); });
  if(st.sec === 'trash'){
    B('Restaurar', 'undo', function(){ restorePaths(ps); });
    B('Borrar', 'trash', function(){ purgePaths(ps); }, 'danger');
    return;
  }
  B('Mover', 'move', function(){ pickFolder('Mover ' + n + ' elemento' + (n > 1 ? 's' : ''), 'Mover aquí').then(function(d){ if(d) movePaths(ps, d); }); });
  B('Copiar', 'copy', function(){ pickFolder('Copiar a…', 'Copiar aquí').then(function(d){ if(d) copyPaths(ps, d); }); });
  B('Compartir', 'share', function(e){ sharePaths(ps, e.currentTarget); });
  B('Comprimir', 'zip', function(){ zipPaths(ps); });
  B('Etiquetas', 'tag', function(){ tagDialog(ps); });
  B('Favorito', 'star', function(){ Promise.all(ps.map(function(p){ return Meta.patch(p, {fav:true}); })).then(function(){ UI.toast('Agregado a Favoritos'); exitSel(); render(); }); });
  if(allPdf) B('Unir PDF', 'merge', function(){ Tools.mergePdfs(ps); });
  if(allImg) B('Crear PDF', 'pages', function(){ Tools.imagesToPdf(ps); });
  B('Eliminar', 'trash', function(){ removePaths(ps); }, 'danger');
}
function exitSel(){ st.selMode = false; st.sel = {}; if($('#selbar')) { syncSel(); $('#title').textContent = title(); } }

/* ---------- abrir ---------- */
function openItem(n){
  if(st.sec === 'trash'){ restoreMenu(n); return; }
  if(n.kind === 'dir'){ cd(n.path); return; }
  Meta.patch(n.path, {opened:Date.now()});
  if(/^(url|webloc)$/.test(VFS.ext(n.name))){ Extra.openLink(n.path); return; }
  var sibs = st.items.filter(function(x){ return x.kind === 'file'; }).map(function(x){ return x.path; });
  Viewers.open(n.path, sibs);
}
function restoreMenu(n){
  UI.menu([{t:'Restaurar', i:'undo', fn:function(){ restorePaths([n.path]); }}, {t:'Borrar definitivamente', i:'trash', danger:true, fn:function(){ purgePaths([n.path]); }}], null, n.name);
}

/* ---------- menú de un elemento ---------- */
function itemMenu(n, at){
  if(st.sec === 'trash'){ restoreMenu(n); return; }
  var m = M(n.path), isDir = n.kind === 'dir', e = VFS.ext(n.name), k = UI.kindOf(n.name).k;
  var items = [
    {t:'Abrir', i:'eye', fn:function(){ openItem(n); }},
    (st.q || st.sec !== 'files') ? {t:'Mostrar en carpeta', i:'folder', fn:function(){ cd(VFS.parent(n.path)); }} : null,
    '-',
    {t:'Renombrar', i:'edit', fn:function(){ rename(n.path); }},
    {t:'Duplicar', i:'dup', fn:function(){ duplicate(n.path); }},
    {t:'Mover…', i:'move', fn:function(){ pickFolder('Mover «' + n.name + '»', 'Mover aquí').then(function(d){ if(d) movePaths([n.path], d); }); }},
    {t:'Copiar a…', i:'copy', fn:function(){ pickFolder('Copiar «' + n.name + '»', 'Copiar aquí').then(function(d){ if(d) copyPaths([n.path], d); }); }},
    {t:'Cortar', i:'copy', k:VFS.native ? '⌘X' : '', fn:function(){ st.clip = {paths:[n.path], cut:true}; UI.toast('Listo para pegar en otra carpeta'); }},
    '-',
    {t:'Compartir', i:'share', fn:function(){ sharePaths([n.path], at); }},
    !isDir ? {t:VFS.native ? 'Exportar…' : 'Guardar en Archivos / Descargar', i:'download', fn:function(){ exportPath(n.path); }} : null,
    isDir || k !== 'zip' ? {t:'Comprimir', i:'zip', fn:function(){ zipPaths([n.path]); }} : {t:'Descomprimir', i:'archive', fn:function(){ unzip(n.path); }},
    !isDir && k === 'pdf' ? {t:'Organizar páginas', i:'pages', fn:function(){ PDFView.pages(n.path); }} : null,
    !isDir && k === 'image' ? {t:'Convertir a PDF', i:'pages', fn:function(){ Tools.imagesToPdf([n.path]); }} : null,
    !isDir && (k === 'image') ? {t:'Editar imagen', i:'sliders', fn:function(){ Viewers.editImage(n.path); }} : null,
    !isDir && (k === 'image') ? {t:'Eliminar objetos', i:'eraser', fn:function(){ Extra.eraseObjects(n.path); }} : null,
    !isDir && k === 'pdf' ? {t:'Convertir PDF…', i:'loop', fn:function(){ pdfConvertMenu(n.path, at); }} : null,
    !isDir && k === 'pdf' ? {t:'Contraseña…', i:'lock', fn:function(){ UI.menu([{t:'Proteger con contraseña', i:'lock', fn:function(){ Extra.pdfPassword(n.path); }}, {t:'Quitar contraseña', i:'undo', fn:function(){ Extra.pdfUnlock(n.path); }}], null, n.name); }} : null,
    !isDir && k === 'audio' ? {t:'Editar audio', i:'sliders', fn:function(){ Extra.audioEditor(n.path); }} : null,
    !isDir && e === 'mp3' ? {t:'Editar metadatos', i:'tag', fn:function(){ Extra.editTags(n.path); }} : null,
    !isDir && (k === 'audio' || k === 'video') ? {t:k === 'video' ? 'Extraer audio (MP3)' : 'Convertir o comprimir audio', i:'music', fn:function(){ Extra.convertAudio([n.path]); }} : null,
    !isDir && k === 'video' ? {t:'Convertir o comprimir video', i:'video', fn:function(){ UI.menu([{t:'Convertir a MP4', i:'loop', fn:function(){ Extra.convertVideo(n.path, false); }}, {t:'Comprimir', i:'zip', fn:function(){ Extra.convertVideo(n.path, true); }}], null, n.name); }} : null,
    '-',
    {t:m.fav ? 'Quitar de Favoritos' : 'Favorito', i:'star', fn:function(){ Meta.patch(n.path, {fav:m.fav ? null : true}).then(render); }},
    {t:'Etiquetas…', i:'tag', fn:function(){ tagDialog([n.path]); }},
    isDir ? {t:'Color de carpeta…', i:'folder', fn:function(){ colorDialog(n.path); }} : null,
    isDir ? {t:m.locked ? 'Quitar protección' : 'Proteger con código', i:'lock', fn:function(){ toggleLock(n.path, m.locked); }} : null,
    {t:'Información', i:'info', fn:function(){ info(n); }},
    VFS.native ? {t:'Mostrar en Finder', i:'finder', fn:function(){ VFS.bridge({op:'reveal', path:n.path}); }} : null,
    '-',
    {t:'Eliminar', i:'trash', danger:true, fn:function(){ removePaths([n.path]); }}
  ];
  UI.menu(items, at, n.name);
}

/* ---------- acciones ---------- */
function validName(s){ return s && !/[\/\\:]/.test(s) && s !== '.' && s !== '..' && s.charAt(0) !== '.'; }
function newFolder(){
  UI.prompt('Nueva carpeta', 'Carpeta nueva', {ok:'Crear'}).then(function(nm){
    if(!nm) return;
    if(!validName(nm)) return UI.toast('Nombre no válido');
    return VFS.uniquePath(VFS.join(st.cwd, nm)).then(function(p){ return VFS.mkdir(p); }).then(function(){ refresh(); });
  }).catch(UI.fail);
}
function rename(p){
  var old = VFS.base(p);
  UI.prompt('Renombrar', old, {ok:'Guardar', selectStem:true}).then(function(nm){
    if(!nm || nm === old) return;
    if(!validName(nm)) return UI.toast('Nombre no válido');
    var dst = VFS.join(VFS.parent(p), nm);
    return VFS.exists(dst).then(function(x){
      if(x && dst.toLowerCase() !== p.toLowerCase()) return UI.toast('Ya existe «' + nm + '»');
      return VFS.move(p, dst).then(refresh);
    });
  }).catch(UI.fail);
}
function duplicate(p){
  var e = VFS.ext(p), s = e ? VFS.stem(VFS.base(p)) : VFS.base(p);
  UI.busy('Duplicando…');
  VFS.uniquePath(VFS.join(VFS.parent(p), s + ' copia' + (e ? '.' + e : ''))).then(function(d){ return VFS.copy(p, d); })
    .then(function(){ UI.busy(false); refresh(); }).catch(UI.fail);
}
function movePaths(ps, dir){
  var c = Promise.resolve(), n = 0;
  ps.forEach(function(p){
    c = c.then(function(){
      if(VFS.parent(p) === dir) return;
      if(VFS.inside(dir, p)) throw new Error('No se puede mover una carpeta dentro de sí misma');
      return VFS.uniquePath(VFS.join(dir, VFS.base(p))).then(function(d){ return VFS.move(p, d); }).then(function(){ n++; });
    });
  });
  return c.then(function(){ exitSel(); if(n) UI.toast(n + ' movido' + (n > 1 ? 's' : '') + ' a ' + (dir === '/' ? 'Mis archivos' : VFS.base(dir))); refresh(); }).catch(UI.fail);
}
function copyPaths(ps, dir){
  UI.busy('Copiando…');
  var c = Promise.resolve();
  ps.forEach(function(p){ c = c.then(function(){ return VFS.uniquePath(VFS.join(dir, VFS.base(p))).then(function(d){ return VFS.copy(p, d); }); }); });
  return c.then(function(){ UI.busy(false); exitSel(); UI.toast('Copiado'); refresh(); }).catch(UI.fail);
}
function removePaths(ps){
  var n = ps.length;
  var go = (S.confirmDelete || VFS.native) ? UI.confirm('¿Eliminar ' + (n > 1 ? n + ' elementos' : '«' + VFS.base(ps[0]) + '»') + '?', VFS.native ? 'Irá a la Papelera del Mac.' : 'Irá a la Papelera; podrás restaurarlo.', 'Eliminar', true) : Promise.resolve(true);
  go.then(function(ok){
    if(!ok) return;
    var c = Promise.resolve();
    ps.forEach(function(p){ c = c.then(function(){ return VFS.remove(p); }); });
    return c.then(function(){ exitSel(); UI.toast(n > 1 ? n + ' elementos eliminados' : 'Eliminado'); refresh(); renderSide(); });
  }).catch(UI.fail);
}
function restorePaths(ps){
  var c = Promise.resolve();
  ps.forEach(function(p){ c = c.then(function(){ return VFS.restore(p); }); });
  c.then(function(){ exitSel(); UI.toast('Restaurado'); refresh(); }).catch(UI.fail);
}
function purgePaths(ps){
  UI.confirm('¿Borrar definitivamente?', 'No se podrá deshacer.', 'Borrar', true).then(function(ok){
    if(!ok) return;
    return Promise.all(ps.map(function(p){ return VFS.purge(p); })).then(function(){ exitSel(); refresh(); renderSide(); });
  }).catch(UI.fail);
}
function filesUnder(ps){
  // [{path, rel}] de todos los archivos bajo las rutas
  var out = [];
  return Promise.all(ps.map(function(p){
    return VFS.stat(p).then(function(s){
      var b = VFS.parent(p);
      if(s.kind === 'file'){ out.push({path:p, rel:p.slice(b === '/' ? 1 : b.length + 1)}); return; }
      return VFS.walk(p).then(function(all){ all.forEach(function(n){ if(n.kind === 'file') out.push({path:n.path, rel:n.path.slice(b === '/' ? 1 : b.length + 1)}); else if(n.path !== p) out.push({dir:true, path:n.path, rel:n.path.slice(b === '/' ? 1 : b.length + 1)}); }); out.push({dir:true, path:p, rel:VFS.base(p)}); });
    });
  })).then(function(){ return out; });
}
function zipPaths(ps){
  UI.busy('Comprimiendo…');
  filesUnder(ps).then(function(list){
    var z = new JSZip(), c = Promise.resolve();
    list.forEach(function(f){
      if(f.dir){ z.folder(f.rel); return; }
      c = c.then(function(){ return VFS.read(f.path).then(function(b){ z.file(f.rel, b); }); });
    });
    return c.then(function(){ return z.generateAsync({type:'blob', compression:'DEFLATE', compressionOptions:{level:6}}, function(m){ UI.busy('Comprimiendo… ' + Math.round(m.percent) + '%'); }); });
  }).then(function(blob){
    var dir = VFS.parent(ps[0]);
    var nm = ps.length === 1 ? VFS.stem(VFS.base(ps[0])) + '.zip' : 'Archivo.zip';
    return VFS.uniquePath(VFS.join(dir, nm)).then(function(p){ return VFS.write(p, new Blob([blob], {type:'application/zip'})).then(function(){ return p; }); });
  }).then(function(p){ UI.busy(false); exitSel(); UI.toast('Creado ' + VFS.base(p)); refresh(); }).catch(UI.fail);
}
function unzip(p, toDir){
  UI.busy('Descomprimiendo…');
  return VFS.read(p).then(function(b){ return JSZip.loadAsync(b); }).then(function(z){
    var names = Object.keys(z.files).filter(function(n){ return n.indexOf('__MACOSX') !== 0 && !/(^|\/)\.DS_Store$/.test(n); });
    // si todo está dentro de una sola carpeta, no se anida otra
    var roots = {}; names.forEach(function(n){ roots[n.split('/')[0]] = 1; });
    var rk = Object.keys(roots), strip = rk.length === 1 && names.some(function(n){ return n.indexOf(rk[0] + '/') === 0; }) ? rk[0] + '/' : '';
    var base = toDir ? Promise.resolve(toDir) : VFS.uniquePath(VFS.join(VFS.parent(p), strip ? rk[0] : VFS.stem(VFS.base(p))));
    return base.then(function(dir){
      var c = VFS.mkdir(dir), i = 0;
      names.forEach(function(n){
        var f = z.files[n];
        c = c.then(function(){
          i++; UI.busy('Descomprimiendo… ' + i + '/' + names.length);
          var rel = n.slice(strip.length); if(!rel) return;
          var dst = VFS.join(dir, rel);
          if(f.dir) return VFS.mkdir(dst);
          return f.async('blob').then(function(bl){ return VFS.write(dst, new Blob([bl], {type:VFS.mimeOf(n)})); });
        });
      });
      return c.then(function(){ return dir; });
    });
  }).then(function(dir){ UI.busy(false); UI.toast('Descomprimido en «' + VFS.base(dir) + '»'); refresh(); return dir; }).catch(UI.fail);
}
function sharePaths(ps, at){
  UI.busy('Preparando…');
  Promise.all(ps.map(function(p){ return VFS.stat(p); })).then(function(stats){
    var hasDir = stats.some(function(s){ return s.kind === 'dir'; });
    if(VFS.native){ UI.busy(false); return UI.shareFiles(ps.map(function(p){ return {path:p}; }), at); }
    if(hasDir){
      // carpetas: se comparten comprimidas
      return filesUnder(ps).then(function(list){
        var z = new JSZip(), c = Promise.resolve();
        list.forEach(function(f){ if(!f.dir) c = c.then(function(){ return VFS.read(f.path).then(function(b){ z.file(f.rel, b); }); }); });
        return c.then(function(){ return z.generateAsync({type:'blob'}); });
      }).then(function(b){ UI.busy(false); return UI.shareFiles([{blob:new Blob([b], {type:'application/zip'}), name:(ps.length === 1 ? VFS.base(ps[0]) : 'Archivos') + '.zip'}]); });
    }
    return Promise.all(ps.map(function(p){ return VFS.read(p).then(function(b){ return {blob:b, name:VFS.base(p)}; }); })).then(function(fs){ UI.busy(false); return UI.shareFiles(fs, at); });
  }).then(function(){ exitSel(); }).catch(UI.fail);
}
function exportPath(p){
  if(VFS.native) return VFS.bridge({op:'export', path:p}).catch(UI.fail);
  VFS.read(p).then(function(b){ return UI.saveBlob(b, VFS.base(p)); }).catch(UI.fail);
}
function info(n){
  var m = M(n.path);
  var body = h('div', {style:'font-size:14px'});
  var rows = [['Nombre', n.name], ['Tipo', n.kind === 'dir' ? 'Carpeta' : (UI.kindOf(n.name).l || VFS.ext(n.name).toUpperCase() || 'Archivo') + ' · ' + (n.mime || VFS.mimeOf(n.name))],
    ['Ubicación', VFS.parent(n.path) === '/' ? 'Mis archivos' : VFS.parent(n.path)], ['Modificado', UI.date(n.mtime, true)], n.ctime ? ['Creado', UI.date(n.ctime, true)] : null, m.opened ? ['Abierto', UI.date(m.opened, true)] : null];
  var tbl = h('div');
  function addRow(r){ if(r) tbl.appendChild(h('div', {class:'row', style:'padding:7px 0;border-bottom:1px solid var(--border);align-items:flex-start', html:'<span class="muted" style="width:96px;flex:none">' + esc(r[0]) + '</span><span class="grow" style="word-break:break-word">' + esc(r[1]) + '</span>'})); }
  rows.forEach(addRow);
  var sizeRow = ['Tamaño', n.kind === 'dir' ? 'Calculando…' : UI.size(n.size) + ' (' + (n.size || 0).toLocaleString('es-CL') + ' bytes)'];
  addRow(sizeRow);
  var sizeEl = tbl.lastChild.lastChild;
  if(n.kind === 'dir') VFS.walk(n.path).then(function(all){ var f = all.filter(function(x){ return x.kind === 'file'; }); sizeEl.textContent = UI.size(f.reduce(function(a, x){ return a + (x.size || 0); }, 0)) + ' · ' + f.length + ' archivo' + (f.length === 1 ? '' : 's'); });
  body.appendChild(tbl);
  body.appendChild(h('label', {class:'lbl', text:'Nota'}));
  var note = h('textarea', {class:'field', rows:3, placeholder:'Agrega una descripción (también se usa en la búsqueda)'}); note.value = m.note || '';
  body.appendChild(note);
  if(n.kind === 'file' && UI.kindOf(n.name).k === 'image'){
    var dim = h('div', {class:'muted', style:'margin-top:10px;font-size:13px'});
    body.appendChild(dim);
    VFS.url(n.path).then(UI.loadImage).then(function(img){ dim.textContent = 'Dimensiones: ' + img.naturalWidth + ' × ' + img.naturalHeight + ' px'; }).catch(function(){});
  }
  UI.dialog({title:'Información', body:body, buttons:[{t:'Cerrar', v:true, cls:'primary'}]}).then(function(){
    if((note.value || '') !== (m.note || '')) Meta.patch(n.path, {note:note.value || null}).then(function(){ metaMap(); });
  });
}
function tagDialog(ps){
  var cur = {};
  ps.forEach(function(p){ (M(p).tags || []).forEach(function(t){ cur[t] = (cur[t] || 0) + 1; }); });
  var body = h('div');
  var state = {};
  S.tags.forEach(function(t){
    state[t.n] = cur[t.n] === ps.length;
    var b = h('button', {class:'mi' + (state[t.n] ? ' on' : ''), html:'<span class="tagdot" style="background:' + t.c + ';width:14px;height:14px"></span><span>' + esc(t.n) + '</span>', onclick:function(){ state[t.n] = !state[t.n]; b.classList.toggle('on', state[t.n]); }});
    body.appendChild(b);
  });
  UI.dialog({title:'Etiquetas', body:body, buttons:[{t:'Cancelar', v:false}, {t:'Aplicar', v:true, cls:'primary'}]}).then(function(ok){
    if(!ok) return;
    return Promise.all(ps.map(function(p){
      var t = (M(p).tags || []).filter(function(x){ return !(x in state); });
      for(var k in state) if(state[k]) t.push(k);
      return Meta.patch(p, {tags:t.length ? t : null});
    })).then(function(){ exitSel(); render(); });
  });
}
function colorDialog(p){
  var body = h('div', {class:'row', style:'flex-wrap:wrap;justify-content:center;gap:10px'}), pick = null;
  Object.keys(UI.FOLDER_COLORS).forEach(function(c){
    var b = h('button', {style:'width:64px', html:UI.folderIcon(c).replace('class="folder"', 'class="folder" style="width:56px;height:46px"'), onclick:function(){ pick = c; rec(); }});
    body.appendChild(b);
  });
  var rec;
  var d = UI.dialog({title:'Color de carpeta', body:body, buttons:[{t:'Cerrar', v:null}]});
  rec = function(){ document.querySelector('.layer:last-child .btns button').click(); };
  d.then(function(){ if(pick !== null) Meta.patch(p, {color:pick || null}).then(render); });
}
function toggleLock(p, locked){
  if(!S.pin){ UI.alert('Primero crea un código', 'Ve a Ajustes → Código de acceso para crear uno.'); return; }
  askPin(locked ? 'Quitar protección' : 'Proteger carpeta').then(function(ok){ if(ok) Meta.patch(p, {locked:locked ? null : true}).then(function(){ UI.toast(locked ? 'Protección quitada' : 'Carpeta protegida'); render(); }); });
}

/* elegir carpeta destino */
function pickFolder(ttl, okLabel, start){
  return new Promise(function(res){
    var cur = start || (st.sec === 'files' ? st.cwd : '/');
    var head = h('div', {class:'row', style:'margin-bottom:8px'});
    var listEl = h('div', {style:'min-height:240px;max-height:46vh;overflow-y:auto;border:1px solid var(--border);border-radius:12px;padding:4px'});
    var body = h('div', {}, [head, listEl]);
    function show(){
      head.innerHTML = '';
      head.appendChild(h('button', {class:'tb', disabled:cur === '/', html:icon('back'), onclick:function(){ cur = VFS.parent(cur); show(); }}));
      head.appendChild(h('b', {class:'grow ell', text:cur === '/' ? 'Mis archivos' : VFS.base(cur)}));
      head.appendChild(h('button', {class:'tb', title:'Nueva carpeta', html:icon('folderplus'), onclick:function(){
        UI.prompt('Nueva carpeta', '', {ok:'Crear'}).then(function(nm){ if(nm && validName(nm)) VFS.mkdir(VFS.join(cur, nm)).then(function(){ cur = VFS.join(cur, nm); show(); }); });
      }}));
      VFS.list(cur).then(function(l){
        listEl.innerHTML = '';
        var dirs = l.filter(function(n){ return n.kind === 'dir'; }).sort(function(a, b){ return a.name.localeCompare(b.name, 'es'); });
        if(!dirs.length) listEl.appendChild(h('div', {class:'muted', style:'padding:30px;text-align:center', text:'Sin subcarpetas'}));
        dirs.forEach(function(d){ listEl.appendChild(h('button', {class:'mi', html:UI.folderIcon(M(d.path).color).replace('class="folder"', 'class="folder" style="width:30px;height:24px"') + '<span class="grow ell">' + esc(d.name) + '</span>' + icon('chev'), onclick:function(){ cur = d.path; show(); }})); });
      });
    }
    show();
    UI.dialog({title:ttl, body:body, buttons:[{t:'Cancelar', v:null}, {t:okLabel || 'Elegir', cls:'primary', v:function(){ return cur; }}]}).then(res);
  });
}

/* ---------- importar ---------- */
function importPick(){
  if(VFS.native){
    var dir = st.sec === 'files' ? st.cwd : '/';
    VFS.bridge({op:'importPanel', dir:dir}).then(function(n){ if(n){ UI.toast(n + ' archivo' + (n > 1 ? 's' : '') + ' importado' + (n > 1 ? 's' : '')); refresh(); } }).catch(UI.fail);
    return;
  }
  var inp = $('#filePick'); inp.value = ''; inp.onchange = function(){ importFiles(inp.files, st.sec === 'files' ? st.cwd : '/'); }; inp.click();
}
function importMedia(){
  var inp = $('#mediaPick'); inp.value = ''; inp.onchange = function(){ importFiles(inp.files, st.sec === 'files' ? st.cwd : '/'); }; inp.click();
}
function importFiles(files, dir, entries){
  files = Array.prototype.slice.call(files || []);
  if(!files.length) return Promise.resolve([]);
  var done = [], c = Promise.resolve(), i = 0, total = files.length;
  files.forEach(function(f){
    c = c.then(function(){
      i++; UI.busy('Importando ' + i + ' de ' + total + '…\n' + f.name);
      var rel = f._rel || f.webkitRelativePath || f.name;
      var nm = f.name && f.name !== 'image.jpg' ? rel : 'Foto ' + new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.') + '.jpg';
      return VFS.uniquePath(VFS.join(dir, nm)).then(function(p){ return VFS.write(p, f).then(function(){ done.push(p); }); });
    });
  });
  return c.then(function(){ UI.busy(false); UI.toast(done.length + ' archivo' + (done.length > 1 ? 's' : '') + ' importado' + (done.length > 1 ? 's' : '')); refresh(); renderSide(); return done; }).catch(UI.fail);
}
function importDrop(dt, dir){
  // admite carpetas arrastradas (webkitGetAsEntry)
  var items = dt.items ? Array.prototype.slice.call(dt.items) : [], entries = [];
  items.forEach(function(it){ var e = it.webkitGetAsEntry && it.webkitGetAsEntry(); if(e) entries.push(e); });
  if(!entries.length || !entries.some(function(e){ return e.isDirectory; })) return importFiles(dt.files, dir);
  var files = [];
  function walk(entry, path){
    return new Promise(function(res){
      if(entry.isFile){ entry.file(function(f){ f._rel = path + f.name; files.push(f); res(); }, function(){ res(); }); return; }
      var r = entry.createReader(), all = [];
      (function more(){ r.readEntries(function(ents){ if(!ents.length){ Promise.all(all.map(function(e){ return walk(e, path + entry.name + '/'); })).then(res); return; } all = all.concat(Array.prototype.slice.call(ents)); more(); }, function(){ res(); }); }());
    });
  }
  Promise.all(entries.map(function(e){ return walk(e, ''); })).then(function(){ importFiles(files, dir); });
}
function addMenu(){
  var dir = st.sec === 'files' ? st.cwd : '/';
  var items = [
    {t:'Carpeta', i:'folderplus', c:'#4FA3E0', fn:newFolder},
    {t:'Importar archivos', i:'upload', c:'#0B7A75', fn:importPick},
    !VFS.native ? {t:'Fotos y videos', i:'image', c:'#8E4EC6', fn:importMedia} : null,
    {t:'Escanear documento', i:'scan', c:'#E5484D', fn:function(){ Tools.scan(dir); }},
    {t:'Nota de texto', i:'text', c:'#5B6472', fn:function(){ newNote(dir, 'txt'); }},
    {t:'Nota Markdown', i:'md', c:'#2B2D31', fn:function(){ newNote(dir, 'md'); }},
    {t:'Grabar audio', i:'mic', c:'#F76B15', fn:function(){ Tools.record(dir); }},
    {t:'Desde enlace', i:'link', c:'#2F6FDB', fn:function(){ Tools.download(dir); }},
    {t:'Imágenes a PDF', i:'pages', c:'#D6409F', fn:function(){ Tools.imagesToPdfPick(dir); }},
    {t:'Tomar foto', i:'camera', c:'#30A46C', fn:function(){ var inp = $('#camPick'); inp.value = ''; inp.onchange = function(){ importFiles(inp.files, dir); }; inp.click(); }},
    st.clip ? {t:'Pegar (' + st.clip.paths.length + ')', i:'copy', c:'#7C7F86', fn:paste} : null
  ].filter(Boolean);
  UI.gridMenu('Agregar a ' + (dir === '/' ? 'Mis archivos' : VFS.base(dir)), items);
}
function pdfConvertMenu(p, at){
  UI.menu([{t:'PDF a Word (.docx)', i:'text', fn:function(){ Extra.pdfTo(p, 'docx'); }}, {t:'PDF a Excel (.xlsx)', i:'table', fn:function(){ Extra.pdfTo(p, 'xlsx'); }},
    {t:'PDF a PowerPoint (.pptx)', i:'slides', fn:function(){ Extra.pdfTo(p, 'pptx'); }}, {t:'PDF a imágenes (JPG)', i:'image', fn:function(){ Extra.pdfTo(p, 'jpg'); }}, {t:'PDF a texto (.txt)', i:'text', fn:function(){ Extra.pdfTo(p, 'txt'); }}], null, 'Convertir ' + VFS.base(p));
}
function newNote(dir, e){
  UI.prompt(e === 'md' ? 'Nueva nota Markdown' : 'Nueva nota', 'Nota ' + new Date().toLocaleDateString('es-CL').replace(/\//g, '-'), {ok:'Crear'}).then(function(nm){
    if(!nm) return;
    if(!validName(nm)) return UI.toast('Nombre no válido');
    return VFS.uniquePath(VFS.join(dir, nm + '.' + e)).then(function(p){
      return VFS.write(p, new Blob([e === 'md' ? '# ' + nm + '\n\n' : ''], {type:e === 'md' ? 'text/markdown' : 'text/plain'})).then(function(){ refresh(); Viewers.open(p, [p], {edit:true}); });
    });
  }).catch(UI.fail);
}
function paste(){
  if(!st.clip) return;
  var c = st.clip; st.clip = c.cut ? null : c;
  (c.cut ? movePaths(c.paths, st.cwd) : copyPaths(c.paths, st.cwd));
}
function refresh(){ render(); }

/* ---------- código de acceso ---------- */
function hashPin(pin){
  var s = 'archivero:' + pin;
  if(window.crypto && crypto.subtle && window.isSecureContext){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function(b){ return Array.prototype.map.call(new Uint8Array(b), function(x){ return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  var h1 = 0x811c9dc5, h2 = 0x1505;
  for(var r = 0; r < 2000; r++) for(var i = 0; i < s.length; i++){ h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = (Math.imul(h2, 33) + s.charCodeAt(i) + r) >>> 0; }
  return Promise.resolve('f' + h1.toString(16) + h2.toString(16));
}
function pinPad(titleTxt, sub, check){
  // check(pin) → Promise<bool>
  return new Promise(function(res){
    var L = h('div', {id:'lock'}), val = '';
    L.innerHTML = '<img src="icon-192.png" alt=""><div style="font-size:19px;font-weight:600">' + esc(titleTxt) + '</div><div class="muted" style="margin-top:-10px;font-size:14px">' + esc(sub || '') + '</div>';
    var dots = h('div', {class:'pin'}); L.appendChild(dots);
    var len = 4;
    function paint(){ dots.innerHTML = ''; for(var i = 0; i < Math.max(len, val.length); i++) dots.appendChild(h('i', {class:i < val.length ? 'f' : ''})); }
    paint();
    var keys = h('div', {class:'keys'});
    function press(d){
      if(d === 'del'){ val = val.slice(0, -1); paint(); return; }
      if(val.length >= len) return;
      val += d; paint();
      if(val.length === len) check(val).then(function(ok){
        if(ok){ cleanup(); L.remove(); res(val); }
        else { dots.classList.add('err'); if(navigator.vibrate) navigator.vibrate(60); setTimeout(function(){ dots.classList.remove('err'); val = ''; paint(); }, 420); }
      });
    }
    '1 2 3 4 5 6 7 8 9'.split(' ').forEach(function(d){ keys.appendChild(h('button', {text:d, onclick:function(){ press(d); }})); });
    keys.appendChild(h('button', {class:'t', text:check.cancel ? 'Cancelar' : '', onclick:function(){ if(check.cancel){ cleanup(); L.remove(); res(null); } }}));
    keys.appendChild(h('button', {text:'0', onclick:function(){ press('0'); }}));
    keys.appendChild(h('button', {class:'t', text:'Borrar', onclick:function(){ press('del'); }}));
    L.appendChild(keys);
    function kd(e){ if(/^[0-9]$/.test(e.key)) press(e.key); else if(e.key === 'Backspace') press('del'); else if(e.key === 'Escape' && check.cancel){ cleanup(); L.remove(); res(null); } e.stopPropagation(); }
    function cleanup(){ document.removeEventListener('keydown', kd, true); }
    document.addEventListener('keydown', kd, true);
    document.body.appendChild(L);
  });
}
function askPin(t, cancelable){
  if(!S.pin) return Promise.resolve(true);
  var chk = function(v){ return hashPin(v).then(function(x){ return x === S.pin; }); };
  chk.cancel = cancelable !== false;
  return pinPad(t || 'Ingresa tu código', '', chk).then(function(v){ return !!v; });
}
function setPin(){
  var first;
  var c1 = function(){ return Promise.resolve(true); }; c1.cancel = true;
  return pinPad('Nuevo código', 'Elige 4 dígitos', c1).then(function(v){
    if(!v) return false;
    first = v;
    var c2 = function(x){ return Promise.resolve(x === first); }; c2.cancel = true;
    return pinPad('Repite el código', '', c2);
  }).then(function(v){
    if(!v) return false;
    return hashPin(v).then(function(hh){ S.pin = hh; save(); UI.toast('Código activado'); return true; });
  });
}
var hiddenAt = 0, locking = false;
function lockNow(){
  if(!S.pin || locking) return;
  locking = true;
  var chk = function(v){ return hashPin(v).then(function(x){ return x === S.pin; }); };
  chk.cancel = false;
  pinPad('Archivero', 'Ingresa tu código', chk).then(function(){ locking = false; });
}
document.addEventListener('visibilitychange', function(){
  if(document.hidden) hiddenAt = Date.now();
  else if(S.pin && S.lockLeave && hiddenAt && Date.now() - hiddenAt > 30000){ unlocked = {}; lockNow(); }
});

/* ---------- eventos de la barra ---------- */
$('#bMenu').onclick = openSide;
$('#bUp').onclick = up;
$('#fab').onclick = addMenu;
$('#bSelect').onclick = function(){ if(st.selMode){ exitSel(); } else { st.selMode = true; st.sel = {}; syncSel(); } };
$('#bView').onclick = function(){ S.view = S.view === 'grid' ? 'list' : 'grid'; save(); render(); };
$('#bMore').onclick = function(e){
  UI.menu([{t:'Seleccionar', i:'checkc', fn:function(){ $('#bSelect').click(); }}, {t:'Crear carpeta', i:'folderplus', fn:newFolder},
    {t:'Vista: ' + (S.view === 'grid' ? 'Cuadrícula' : 'Lista'), i:S.view === 'grid' ? 'grid' : 'list', fn:function(){ $('#bView').click(); }},
    {t:'Ordenar por…', i:'sort', fn:function(){ $('#bSort').click(); }}, '-',
    {t:'Guardar enlace aquí', i:'link', fn:function(){ Extra.saveLink(st.sec === 'files' ? st.cwd : '/'); }},
    {t:'Transferir archivos', i:'upload', fn:Extra.transfer}, {t:'Añadir conexión', i:'cloud', fn:Extra.addConnection},
    VFS.native ? {t:'Mostrar en Finder', i:'finder', fn:function(){ VFS.bridge({op:'reveal', path:st.cwd}); }} : null, '-',
    {t:'Centro de control', i:'tools', fn:Extra.controlCenter}, {t:'Ayuda', i:'info', fn:Extra.help}], e.currentTarget, 'Opciones');
};
$('#bSort').onclick = function(e){
  var it = function(t, v){ return {t:t, on:S.sort === v, fn:function(){ if(S.sort === v) S.desc = !S.desc; else { S.sort = v; S.desc = v === 'date' || v === 'size'; } save(); render(); }}; };
  UI.menu([it('Nombre', 'name'), it('Fecha', 'date'), it('Tamaño', 'size'), it('Tipo', 'kind'), '-',
    {t:S.desc ? 'Descendente' : 'Ascendente', i:'sort', fn:function(){ S.desc = !S.desc; save(); render(); }},
    {t:'Carpetas primero', on:S.foldersFirst, fn:function(){ S.foldersFirst = !S.foldersFirst; save(); render(); }}], e.currentTarget, 'Ordenar por');
};
$('#bSearch').onclick = function(){ var s = $('#searchBox'); var on = !$('#top').classList.contains('searching'); $('#top').classList.toggle('searching', on); s.style.display = on ? 'block' : ''; if(on) $('#q').focus(); else { $('#q').value = ''; st.q = ''; render(); } };
var qT;
$('#q').addEventListener('input', function(){ clearTimeout(qT); qT = setTimeout(function(){ st.q = $('#q').value.trim(); exitSel(); render(); }, 180); });
(function(){ if(UI.isPhone()) $('#searchBox').style.display = 'none'; window.addEventListener('resize', function(){ if(!UI.isPhone()) $('#searchBox').style.display = ''; else if(!$('#top').classList.contains('searching')) $('#searchBox').style.display = 'none'; }); }());

/* atajos de teclado (Mac / iPad con teclado) */
document.addEventListener('keydown', function(e){
  if(document.querySelector('.layer,#viewer,#lock')) return;
  var t = e.target.tagName, typing = t === 'INPUT' || t === 'TEXTAREA' || e.target.isContentEditable;
  var cmd = e.metaKey || e.ctrlKey, sel = Object.keys(st.sel);
  if(cmd && e.key === 'f'){ e.preventDefault(); if(UI.isPhone()) $('#bSearch').click(); else $('#q').focus(); return; }
  if(typing) { if(e.key === 'Escape'){ e.target.blur(); } return; }
  if(cmd && e.key === 'a' && st.items.length){ e.preventDefault(); st.selMode = true; st.items.forEach(function(n){ st.sel[n.path] = true; }); syncSel(); }
  else if(cmd && e.shiftKey && (e.key === 'n' || e.key === 'N')){ e.preventDefault(); newFolder(); }
  else if(cmd && e.key === 'o'){ e.preventDefault(); importPick(); }
  else if(cmd && (e.key === 'c' || e.key === 'x') && sel.length){ e.preventDefault(); st.clip = {paths:sel, cut:e.key === 'x'}; UI.toast(sel.length + (e.key === 'x' ? ' para mover' : ' copiado' + (sel.length > 1 ? 's' : ''))); }
  else if(cmd && e.key === 'v' && st.clip && st.sec === 'files'){ e.preventDefault(); paste(); }
  else if((e.key === 'Backspace' || e.key === 'Delete') && sel.length){ e.preventDefault(); removePaths(sel); }
  else if(cmd && e.key === 'ArrowUp'){ e.preventDefault(); up(); }
  else if(e.key === 'Escape' && st.selMode) exitSel();
  else if((e.key === 'Enter' || e.key === ' ') && sel.length === 1){ e.preventDefault(); var n = st.items.filter(function(x){ return x.path === sel[0]; })[0]; if(n){ if(e.key === 'Enter' && !cmd) rename(n.path); else { exitSel(); openItem(n); } } }
  else if(cmd && e.key === 'Backspace'){ up(); }
});

/* ---------- miniaturas ---------- */
var Thumbs = (function(){
  var q = [], running = 0, io = null, mem = {};
  function can(n){ var k = UI.kindOf(n.name).k; return k === 'image' || k === 'pdf' || k === 'video'; }
  function observe(root){
    var els = UI.$$('[data-th]', root);
    if(!('IntersectionObserver' in window)){ els.forEach(want); return; }
    if(!io) io = new IntersectionObserver(function(ents){ ents.forEach(function(en){ if(en.isIntersecting){ io.unobserve(en.target); want(en.target); } }); }, {root:$('#content'), rootMargin:'300px'});
    els.forEach(function(e){ io.observe(e); });
  }
  function want(el){
    var key = el.getAttribute('data-th');
    if(mem[key]){ put(el, mem[key]); return; }
    KV.get('th:' + key).then(function(d){ if(d){ mem[key] = d; put(el, d); } else { q.push(el); pump(); } });
  }
  function put(el, d){ if(d === 'x') return; var photo = el.classList.contains('photo'); el.innerHTML = '<img src="' + d + '" alt="">'; if(!photo) el.classList.remove('photo'); }
  function pump(){
    while(running < 2 && q.length){
      var el = q.shift(); running++;
      (function(el){
        var key = el.getAttribute('data-th'), p = key.slice(0, key.lastIndexOf('|'));
        make(p).then(function(d){ d = d || 'x'; mem[key] = d; KV.set('th:' + key, d); if(el.isConnected) put(el, d); })
          .catch(function(){ mem[key] = 'x'; KV.set('th:' + key, 'x'); }).then(function(){ running--; pump(); });
      }(el));
    }
  }
  function scaleTo(src, w, h){
    var s = Math.min(1, 280 / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', .78);
  }
  function make(p){
    var k = UI.kindOf(p).k;
    if(k === 'image') return VFS.url(p).then(function(u){ return UI.loadImage(u).then(function(i){ var d = scaleTo(i, i.naturalWidth, i.naturalHeight); if(u.indexOf('blob:') === 0) URL.revokeObjectURL(u); return d; }); });
    if(k === 'pdf') return PDFView.lib().then(function(lib){ return VFS.read(p).then(function(b){ return b.arrayBuffer(); }).then(function(ab){ return lib.getDocument({data:ab}).promise; }).then(function(doc){ return doc.getPage(1).then(function(pg){ var vp = pg.getViewport({scale:1}); var s = 280 / Math.max(vp.width, vp.height); vp = pg.getViewport({scale:s * 1.5}); var c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; return pg.render({canvasContext:c.getContext('2d'), viewport:vp}).promise.then(function(){ doc.destroy(); return c.toDataURL('image/jpeg', .8); }); }); }); });
    if(k === 'video') return VFS.url(p).then(function(u){
      return new Promise(function(res){
        var v = document.createElement('video'), done = false; v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
        function fin(d){ if(done) return; done = true; if(u.indexOf('blob:') === 0) URL.revokeObjectURL(u); v.removeAttribute('src'); v.load(); res(d); }
        v.onloadeddata = function(){ v.currentTime = Math.min(1, (v.duration || 2) / 3); };
        v.onseeked = function(){ try { fin(scaleTo(v, v.videoWidth, v.videoHeight)); } catch(e){ fin(null); } };
        v.onerror = function(){ fin(null); };
        setTimeout(function(){ fin(null); }, 8000);
      });
    });
    return Promise.resolve(null);
  }
  return {can:can, observe:observe, make:make};
}());

/* ---------- arranque ---------- */
function start(){
  applySide();
  VFS.init().then(function(){ return Extra.loadConns(); }).then(function(){
    renderSide(); render(); Extra.runHash();
    if(S.pin) lockNow();
  }).catch(function(e){ UI.fail(e); });
}

window.App = {S:S, save:save, applySide:applySide, newNote:newNote, pdfConvertMenu:pdfConvertMenu, applyTheme:applyTheme, st:st, go:go, cd:cd, refresh:refresh, render:render, renderSide:renderSide, M:M, metaMap:metaMap,
  importFiles:importFiles, importPick:importPick, pickFolder:pickFolder, unzip:unzip, zipPaths:zipPaths, sharePaths:sharePaths, exportPath:exportPath,
  removePaths:removePaths, rename:rename, info:info, tagDialog:tagDialog, itemMenu:itemMenu, askPin:askPin, setPin:setPin, hashPin:hashPin, Thumbs:Thumbs, validName:validName, newFolder:newFolder, filesUnder:filesUnder,
  // llamado por la app de Mac al abrir archivos desde Finder
  nativeImported:function(paths){ refresh(); if(paths && paths.length === 1) Viewers.open(paths[0], paths); }};
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
}());
