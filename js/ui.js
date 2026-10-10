/* Archivero — utilidades de interfaz: iconos, avisos, diálogos, menús */
(function(){
'use strict';

function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function h(tag, attrs, kids){
  var e = document.createElement(tag);
  if(attrs) for(var k in attrs){
    var v = attrs[k];
    if(v == null || v === false) continue;
    if(k === 'class') e.className = v;
    else if(k === 'html') e.innerHTML = v;
    else if(k === 'text') e.textContent = v;
    else if(k === 'style') e.style.cssText = v;
    else if(k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  (kids || []).forEach(function(c){ if(c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}
function icon(name, cls){ return '<svg class="i' + (cls ? ' ' + cls : '') + '"><use href="#i-' + name + '"/></svg>'; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

function size(n){
  if(n == null) return '';
  if(n < 1024) return n + ' B';
  var u = ['KB', 'MB', 'GB', 'TB'], i = -1;
  do { n /= 1024; i++; } while(n >= 1024 && i < u.length - 1);
  return (n >= 100 ? Math.round(n) : n.toFixed(1).replace('.', ',')) + ' ' + u[i];
}
function date(t, long){
  if(!t) return '';
  var d = new Date(t), now = new Date();
  var hm = d.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit'});
  if(!long){
    if(d.toDateString() === now.toDateString()) return 'Hoy ' + hm;
    var y = new Date(now); y.setDate(now.getDate() - 1);
    if(d.toDateString() === y.toDateString()) return 'Ayer ' + hm;
  }
  return d.toLocaleDateString('es-CL', {day:'numeric', month:'short', year:'numeric'}) + (long ? ', ' + hm : '');
}
function dur(s){ s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), hh = Math.floor(m / 60); s = s % 60; m = m % 60; return (hh ? hh + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s; }

/* tipos de archivo */
var KINDS = {
  pdf:{c:'#E5484D', l:'PDF', i:'file', k:'pdf'},
  image:{c:'#8E4EC6', l:'IMG', i:'image', k:'image'},
  video:{c:'#D6409F', l:'VID', i:'video', k:'video'},
  audio:{c:'#F76B15', l:'AUD', i:'music', k:'audio'},
  word:{c:'#2F6FDB', l:'DOC', i:'text', k:'word'},
  excel:{c:'#1F9D55', l:'XLS', i:'table', k:'excel'},
  ppt:{c:'#E2662B', l:'PPT', i:'slides', k:'ppt'},
  zip:{c:'#7C7F86', l:'ZIP', i:'archive', k:'zip'},
  md:{c:'#2B2D31', l:'MD', i:'md', k:'md'},
  text:{c:'#5B6472', l:'TXT', i:'text', k:'text'},
  code:{c:'#0E8A7E', l:'CODE', i:'code', k:'code'},
  html:{c:'#C2410C', l:'WEB', i:'globe', k:'html'},
  epub:{c:'#A15C2E', l:'EPUB', i:'book', k:'epub'},
  link:{c:'#3A7BD5', l:'LINK', i:'link', k:'link'},
  other:{c:'#9AA0A6', l:'', i:'file', k:'other'}
};
var EXT = {};
function map(list, k){ list.split(' ').forEach(function(e){ EXT[e] = k; }); }
map('pdf', 'pdf');
map('jpg jpeg png gif webp heic heif bmp svg tif tiff avif ico', 'image');
map('mp4 m4v mov webm mkv avi 3gp', 'video');
map('mp3 m4a aac wav ogg oga flac opus aif aiff caf amr', 'audio');
map('doc docx rtf odt pages', 'word');
map('xls xlsx xlsb xlsm csv tsv ods numbers', 'excel');
map('ppt pptx odp key', 'ppt');
map('zip', 'zip');
map('md markdown', 'md');
map('txt log text', 'text');
map('js ts jsx tsx json css scss py rb java c h cpp swift kt go rs php sh zsh yml yaml toml ini xml sql r m tex srt vtt ipynb', 'code');
map('html htm', 'html');
map('epub', 'epub');
map('url webloc', 'link');
function kindOf(name){ return KINDS[EXT[VFS.ext(name)] || 'other']; }
function isText(name){ var k = kindOf(name).k; return k === 'text' || k === 'code' || k === 'md' || VFS.ext(name) === 'csv' || VFS.ext(name) === 'tsv' || k === 'html'; }

function fileIcon(name){
  var k = kindOf(name), e = VFS.ext(name);
  var lab = k.l || (e ? e.slice(0, 4).toUpperCase() : '');
  return '<div class="ft" style="background:linear-gradient(160deg,' + k.c + 'dd,' + k.c + ')">' + icon(k.i) + '<span>' + esc(lab) + '</span></div>';
}
var FOLDER_COLORS = {'':['#4FA3E0', '#6BBBF0'], red:['#D9534F', '#EE7470'], orange:['#E8862A', '#F6A24E'], yellow:['#D9AE19', '#F2C93C'], green:['#3A9D5D', '#5BBE7C'], teal:['#13897F', '#2FA99E'], purple:['#7F56C9', '#9C77E0'], pink:['#D34D8C', '#E970A8'], gray:['#7D828A', '#9CA1A8']};
function folderIcon(color){
  var c = FOLDER_COLORS[color || ''] || FOLDER_COLORS[''];
  return '<div class="folder" style="--fb:' + c[0] + ';--ff:' + c[1] + '"><svg viewBox="0 0 96 78"><use href="#foldr"/></svg></div>';
}

/* avisos */
var toastT;
function toast(msg, ms){
  var t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove('show'); }, ms || 2200);
}
var busyEl = null;
function busy(msg){
  if(msg === false || msg == null){ if(busyEl){ busyEl.remove(); busyEl = null; } return; }
  if(!busyEl){ busyEl = h('div', {id:'busy', html:'<div class="box"><div class="spin"></div><div class="bm"></div></div>'}); document.body.appendChild(busyEl); }
  busyEl.querySelector('.bm').textContent = msg;
}
function fail(e){ busy(false); console.error(e); toast((e && e.message) || String(e) || 'Ocurrió un error', 3500); }

/* capas */
var stack = [];
function layer(content, opts){
  opts = opts || {};
  var L = h('div', {class:'layer'});
  if(opts.bare) L.style.background = 'transparent';
  L.appendChild(content);
  L.addEventListener('mousedown', function(e){ if(e.target === L && !opts.modal) close(); });
  L.addEventListener('touchstart', function(e){ if(e.target === L && !opts.modal){ e.preventDefault(); close(); } }, {passive:false});
  function close(v){ if(!L.parentNode) return; L.remove(); stack.splice(stack.indexOf(rec), 1); if(opts.onclose) opts.onclose(v); }
  var rec = {close:close, el:L};
  stack.push(rec);
  document.body.appendChild(L);
  return rec;
}
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && stack.length){ e.preventDefault(); e.stopPropagation(); stack[stack.length - 1].close(); }
}, true);

function dialog(o){
  // o: {title, msg, body(el), buttons:[{t, v, cls}], wide}
  return new Promise(function(res){
    var d = h('div', {class:'dlg' + (o.wide ? ' wide' : '')});
    if(o.title) d.appendChild(h('h2', {text:o.title}));
    if(o.msg) d.appendChild(h('div', {class:'msg', text:o.msg}));
    if(o.body){ var b = h('div', {class:'body'}); b.appendChild(o.body); d.appendChild(b); }
    var bs = h('div', {class:'btns'});
    var rec;
    (o.buttons || [{t:'Aceptar', v:true, cls:'primary'}]).forEach(function(bt){
      bs.appendChild(h('button', {class:bt.cls || '', text:bt.t, onclick:function(){
        if(bt.check && bt.check() === false) return;
        rec.close(typeof bt.v === 'function' ? bt.v() : bt.v);
      }}));
    });
    d.appendChild(bs);
    rec = layer(d, {modal:o.modal, onclose:function(v){ res(v); }});
    var f = d.querySelector('input,textarea,select');
    if(f) setTimeout(function(){ f.focus(); if(f.select && o.selectStem){ var v = f.value, i = v.lastIndexOf('.'); f.setSelectionRange(0, i > 0 ? i : v.length); } else if(f.select) f.select(); }, 60);
    d.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && e.target.tagName === 'INPUT'){ e.preventDefault(); bs.lastChild.click(); }
    });
  });
}
function confirm(title, msg, ok, danger){
  return dialog({title:title, msg:msg, buttons:[{t:'Cancelar', v:false}, {t:ok || 'Aceptar', v:true, cls:danger ? 'danger primary' : 'primary'}]});
}
function alert(title, msg){ return dialog({title:title, msg:msg, buttons:[{t:'OK', v:true, cls:'primary'}]}); }
function prompt(title, value, opts){
  opts = opts || {};
  var inp = h('input', {class:'field', value:value || '', placeholder:opts.placeholder || '', type:opts.type || 'text', autocomplete:'off', autocapitalize:opts.caps || 'sentences', spellcheck:'false', inputmode:opts.inputmode || null});
  var wrap = h('div', {}, [opts.msg ? h('div', {class:'muted', style:'font-size:13px;margin-bottom:8px', text:opts.msg}) : null, inp]);
  return dialog({title:title, body:wrap, selectStem:opts.selectStem, buttons:[{t:'Cancelar', v:null}, {t:opts.ok || 'Aceptar', cls:'primary', v:function(){ return inp.value.trim(); }}]})
    .then(function(v){ return v ? v : null; });
}

/* menús: en teléfono hoja inferior, en pantalla grande menú contextual */
function isPhone(){ return window.innerWidth <= 760; }
function menu(items, at, title){
  // items: [{t, i, fn, danger, k, on}] | '-'
  return new Promise(function(res){
    var phone = isPhone() || !at;
    var box = h('div', {class:phone ? 'sheet' : 'menu'});
    if(phone){ box.appendChild(h('div', {class:'grip'})); if(title) box.appendChild(h('h3', {text:title})); }
    var rec;
    items.forEach(function(it){
      if(!it) return;
      if(it === '-'){ box.appendChild(h('div', {class:'msep'})); return; }
      box.appendChild(h('button', {class:'mi' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''), html:(it.i ? icon(it.i) : '<span style="width:19px"></span>') + '<span>' + esc(it.t) + '</span>' + (it.k ? '<span class="k">' + esc(it.k) + '</span>' : ''),
        onclick:function(){ rec.close(); res(it); if(it.fn) setTimeout(it.fn, 10); }}));
    });
    if(phone){
      var L = h('div', {class:'layer', style:'align-items:flex-end'});
      L.appendChild(box);
      document.body.appendChild(L);
      rec = {close:function(){ L.remove(); stack.splice(stack.indexOf(rec), 1); }};
      stack.push(rec);
      L.addEventListener('click', function(e){ if(e.target === L){ rec.close(); res(null); } });
      return;
    }
    rec = layer(box, {bare:true, onclose:function(){ res(null); }});
    var r = at.getBoundingClientRect ? at.getBoundingClientRect() : {left:at.x, right:at.x, top:at.y, bottom:at.y};
    var bw = box.offsetWidth, bh = box.offsetHeight;
    var x = Math.min(r.left, window.innerWidth - bw - 8), y = r.bottom + 4;
    if(y + bh > window.innerHeight - 8) y = Math.max(8, r.top - bh - 4);
    box.style.left = Math.max(8, x) + 'px'; box.style.top = y + 'px';
  });
}
function gridMenu(title, items){
  var box = h('div', {class:'sheet', style:isPhone() ? '' : 'left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%);-webkit-transform:translate(-50%,-50%);border-radius:20px;width:520px;animation:pop .2s both'});
  box.appendChild(h('div', {class:'grip'}));
  if(title) box.appendChild(h('h3', {text:title}));
  var g = h('div', {class:'mgrid'}); box.appendChild(g);
  var L = h('div', {class:'layer', style:'align-items:flex-end'}); L.appendChild(box);
  var rec = {close:function(){ L.remove(); stack.splice(stack.indexOf(rec), 1); }};
  items.forEach(function(it){
    g.appendChild(h('button', {html:'<span class="ic" style="background:' + it.c + '">' + icon(it.i) + '</span><span>' + esc(it.t) + '</span>', onclick:function(){ rec.close(); setTimeout(it.fn, 10); }}));
  });
  L.addEventListener('click', function(e){ if(e.target === L) rec.close(); });
  stack.push(rec);
  document.body.appendChild(L);
}

/* pulsación larga + clic derecho */
function onHold(el, fn){
  var t, sx, sy, fired = false;
  el.addEventListener('touchstart', function(e){
    fired = false; var p = e.touches[0]; sx = p.clientX; sy = p.clientY;
    t = setTimeout(function(){ fired = true; if(navigator.vibrate) navigator.vibrate(10); fn({x:sx, y:sy, getBoundingClientRect:function(){ return {left:sx, right:sx, top:sy, bottom:sy}; }}); }, 480);
  }, {passive:true});
  el.addEventListener('touchmove', function(e){ var p = e.touches[0]; if(Math.abs(p.clientX - sx) > 8 || Math.abs(p.clientY - sy) > 8) clearTimeout(t); }, {passive:true});
  el.addEventListener('touchend', function(e){ clearTimeout(t); if(fired){ e.preventDefault(); } });
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); if(!('ontouchstart' in window) || !fired) fn({x:e.clientX, y:e.clientY, getBoundingClientRect:function(){ return {left:e.clientX, right:e.clientX, top:e.clientY, bottom:e.clientY}; }}); });
}

/* archivos: descargar / compartir */
function saveBlob(blob, name){
  if(VFS.native){
    return blobB64(blob).then(function(d){ return VFS.bridge({op:'saveAs', name:name, data:d}); });
  }
  var a = h('a', {href:URL.createObjectURL(blob), download:name});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 30000);
  return Promise.resolve(true);
}
function blobB64(blob){ return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ var s = r.result; res(s.slice(s.indexOf(',') + 1)); }; r.onerror = rej; r.readAsDataURL(blob); }); }
function shareFiles(files, at){
  // files: [{blob, name}] o rutas (Mac)
  if(VFS.native){
    var r = at && at.getBoundingClientRect ? at.getBoundingClientRect() : {left:innerWidth / 2, top:60, width:1, height:1};
    return VFS.bridge({op:'share', paths:files.map(function(f){ return f.path; }), x:r.left, y:r.top, w:r.width || 1, h:r.height || 1});
  }
  var list = files.map(function(f){ return new File([f.blob], f.name, {type:f.blob.type || VFS.mimeOf(f.name)}); });
  if(navigator.canShare && navigator.canShare({files:list})){
    return navigator.share({files:list}).catch(function(e){ if(e && e.name !== 'AbortError') throw e; });
  }
  // sin hoja de compartir: descargar
  var c = Promise.resolve();
  files.forEach(function(f){ c = c.then(function(){ return saveBlob(f.blob, f.name); }); });
  return c;
}
function copyText(t){
  if(VFS.native) return VFS.bridge({op:'clip', text:t});
  if(navigator.clipboard) return navigator.clipboard.writeText(t);
  var ta = h('textarea', {style:'position:fixed;opacity:0'}); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  return Promise.resolve();
}
function loadScript(src){
  return new Promise(function(res, rej){
    if(document.querySelector('script[src="' + src + '"]')){ res(); return; }
    var s = h('script', {src:src}); s.onload = res; s.onerror = function(){ rej(new Error('No se pudo cargar ' + src.split('/').pop() + '. ¿Hay conexión?')); };
    document.head.appendChild(s);
  });
}
function canvasBlob(c, type, q){ return new Promise(function(res){ c.toBlob(res, type || 'image/png', q || .92); }); }
function loadImage(src){ return new Promise(function(res, rej){ var i = new Image(); i.onload = function(){ res(i); }; i.onerror = function(){ rej(new Error('Imagen no compatible')); }; i.src = src; }); }

window.UI = {$:$, $$:$$, h:h, icon:icon, esc:esc, size:size, date:date, dur:dur, kindOf:kindOf, isText:isText, fileIcon:fileIcon, folderIcon:folderIcon, FOLDER_COLORS:FOLDER_COLORS,
  toast:toast, busy:busy, fail:fail, layer:layer, dialog:dialog, confirm:confirm, alert:alert, prompt:prompt, menu:menu, gridMenu:gridMenu, onHold:onHold, isPhone:isPhone,
  saveBlob:saveBlob, shareFiles:shareFiles, copyText:copyText, loadScript:loadScript, canvasBlob:canvasBlob, loadImage:loadImage, blobB64:blobB64};
}());
