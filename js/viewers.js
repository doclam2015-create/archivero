/* Archivero — visores: imagen, video, audio, texto, Markdown, Word, Excel, PowerPoint, ZIP, EPUB, web */
(function(){
'use strict';
var $ = UI.$, h = UI.h, icon = UI.icon, esc = UI.esc;

/* ---------- carcasa del visor ---------- */
var cur = null; // {el, body, tools, path, cleanup:[]}
function shell(path, opts){
  close();
  opts = opts || {};
  var el = h('div', {id:'viewer', class:opts.dark ? 'dark' : ''});
  var bar = h('div', {class:'vbar'});
  var back = h('button', {class:'tb', title:'Cerrar (Esc)', html:icon('back'), onclick:function(){ requestClose(); }});
  var tt = h('div', {class:'vt ell', html:esc(VFS.base(path)) + (opts.sub ? '<small>' + esc(opts.sub) + '</small>' : '')});
  var acts = h('div', {class:'row', style:'gap:2px'});
  bar.appendChild(back); bar.appendChild(tt); bar.appendChild(acts);
  var body = h('div', {class:'vbody'});
  var tools = h('div', {class:'vtools hidden'});
  el.appendChild(bar); el.appendChild(body); el.appendChild(tools);
  document.body.appendChild(el);
  cur = {el:el, body:body, tools:tools, acts:acts, title:tt, path:path, cleanup:[], dirty:null};
  return cur;
}
function setTitle(path, sub){ if(cur){ cur.path = path; cur.title.innerHTML = esc(VFS.base(path)) + (sub ? '<small>' + esc(sub) + '</small>' : ''); } }
function act(i, t, fn){ var b = h('button', {class:'tb', title:t, html:icon(i), onclick:fn}); cur.acts.appendChild(b); return b; }
function tool(i, t, fn){ cur.tools.classList.remove('hidden'); var b = h('button', {class:'tb', title:t, html:icon(i), onclick:fn}); cur.tools.appendChild(b); return b; }
function sep(){ cur.tools.appendChild(h('span', {class:'sep'})); }
function requestClose(){
  if(cur && cur.dirty && cur.dirty()){
    UI.dialog({title:'¿Guardar cambios?', msg:'Tienes cambios sin guardar en «' + VFS.base(cur.path) + '».', buttons:[{t:'Descartar', v:'no', cls:'danger'}, {t:'Cancelar', v:null}, {t:'Guardar', v:'yes', cls:'primary'}]}).then(function(v){
      if(v === 'no') close();
      else if(v === 'yes' && cur.save) cur.save().then(close);
    });
    return;
  }
  close();
}
function close(){
  if(!cur) return;
  cur.cleanup.forEach(function(f){ try { f(); } catch(e){} });
  cur.el.remove(); cur = null;
  if(window.speechSynthesis) speechSynthesis.cancel();
  App.refresh();
}
document.addEventListener('keydown', function(e){
  if(!cur || document.querySelector('.layer,#lock')) return;
  var typing = /INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
  if(e.key === 'Escape'){ e.preventDefault(); requestClose(); return; }
  if((e.metaKey || e.ctrlKey) && e.key === 's' && cur.save){ e.preventDefault(); cur.save(); return; }
  if((e.metaKey || e.ctrlKey) && e.key === 'w'){ e.preventDefault(); requestClose(); return; }
  if(!typing && cur.key) cur.key(e);
});

/* acciones comunes del archivo */
function commonActs(path, at){
  act('share', 'Compartir', function(e){ App.sharePaths([cur.path], e.currentTarget); });
  act('more', 'Más', function(e){
    var p = cur.path;
    UI.menu([
      {t:VFS.native ? 'Exportar…' : 'Guardar en Archivos / Descargar', i:'download', fn:function(){ App.exportPath(p); }},
      {t:'Renombrar', i:'edit', fn:function(){ var nm = VFS.base(p); UI.prompt('Renombrar', nm, {selectStem:true, ok:'Guardar'}).then(function(n){ if(!n || n === nm || !App.validName(n)) return; var d = VFS.join(VFS.parent(p), n); VFS.move(p, d).then(function(){ setTitle(d); }).catch(UI.fail); }); }},
      {t:'Favorito', i:'star', fn:function(){ Meta.patch(p, {fav:true}).then(function(){ UI.toast('Agregado a Favoritos'); }); }},
      {t:'Etiquetas…', i:'tag', fn:function(){ App.metaMap().then(function(){ App.tagDialog([p]); }); }},
      {t:'Información', i:'info', fn:function(){ VFS.stat(p).then(function(n){ App.metaMap().then(function(){ App.info(n); }); }); }},
      VFS.native ? {t:'Abrir con otra app', i:'finder', fn:function(){ VFS.bridge({op:'openExternal', path:p}); }} : null,
      VFS.native ? {t:VFS.ios ? 'Mostrar en Archivos' : 'Mostrar en Finder', i:'finder', fn:function(){ VFS.bridge({op:'reveal', path:p}); }} : null,
      '-',
      {t:'Eliminar', i:'trash', danger:true, fn:function(){ UI.confirm('¿Eliminar «' + VFS.base(p) + '»?', '', 'Eliminar', true).then(function(ok){ if(ok) VFS.remove(p).then(function(){ UI.toast('Eliminado'); close(); }); }); }}
    ], e.currentTarget, VFS.base(p));
  });
}

/* ---------- despacho ---------- */
function open(path, sibs, opts){
  opts = opts || {};
  var k = UI.kindOf(path).k, e = VFS.ext(path);
  if(k === 'pdf') return PDFView.open(path);
  if(k === 'image') return image(path, (sibs || [path]).filter(function(p){ return UI.kindOf(p).k === 'image'; }));
  if(k === 'video') return video(path, (sibs || [path]).filter(function(p){ return UI.kindOf(p).k === 'video'; }));
  if(k === 'audio') return Player.play(path, (sibs || [path]).filter(function(p){ return UI.kindOf(p).k === 'audio'; }), true);
  if(e === 'csv' || e === 'tsv' || k === 'excel') return sheet(path);
  if(k === 'md') return text(path, {md:true, edit:opts.edit});
  if(k === 'html') return htmlView(path);
  if(k === 'text' || k === 'code') return text(path, {edit:opts.edit});
  if(e === 'docx') return docx(path);
  if(e === 'rtf') return rtf(path);
  if(e === 'pptx') return pptx(path);
  if(k === 'zip') return zip(path);
  if(k === 'epub') return epub(path);
  return unknown(path);
}

/* ---------- imagen ---------- */
function image(path, list){
  var v = shell(path, {dark:true});
  var idx = Math.max(0, list.indexOf(path));
  var stage = h('div', {class:'imgstage'}); v.body.appendChild(stage);
  var img = h('img', {alt:''}); stage.appendChild(img);
  var z = {s:1, x:0, y:0}, url = null, slide = null;
  function apply(){ img.style.transform = img.style.webkitTransform = 'translate(' + z.x + 'px,' + z.y + 'px) scale(' + z.s + ')'; }
  function load(i){
    idx = (i + list.length) % list.length;
    var p = list[idx];
    setTitle(p, list.length > 1 ? (idx + 1) + ' de ' + list.length : '');
    Meta.patch(p, {opened:Date.now()});
    z = {s:1, x:0, y:0}; apply();
    VFS.url(p).then(function(u){ if(url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url); url = u; img.src = u; });
  }
  v.cleanup.push(function(){ if(url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url); clearInterval(slide); });
  if(list.length > 1){
    stage.appendChild(h('button', {class:'navarrow l', html:icon('back'), onclick:function(){ load(idx - 1); }}));
    stage.appendChild(h('button', {class:'navarrow r', html:icon('chev'), onclick:function(){ load(idx + 1); }}));
  }
  // gestos: arrastrar, pellizcar, doble toque, rueda
  var pts = {}, start = null, lastTap = 0;
  stage.addEventListener('pointerdown', function(e){ if(e.target.closest('button')) return; stage.setPointerCapture(e.pointerId); pts[e.pointerId] = {x:e.clientX, y:e.clientY}; start = snap(); });
  stage.addEventListener('pointermove', function(e){
    if(!pts[e.pointerId]) return;
    pts[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(pts);
    if(ids.length === 2 && start.d){
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      z.s = Math.min(8, Math.max(1, start.z.s * d / start.d)); apply();
    } else if(ids.length === 1){
      var p = pts[ids[0]];
      if(z.s > 1){ z.x = start.z.x + p.x - start.p.x; z.y = start.z.y + p.y - start.p.y; apply(); }
    }
  });
  function end(e){
    var ids = Object.keys(pts);
    if(ids.length === 1 && z.s === 1 && start && start.p && list.length > 1){
      var dx = e.clientX - start.p.x;
      if(Math.abs(dx) > 60 && Math.abs(e.clientY - start.p.y) < 80){ load(idx + (dx < 0 ? 1 : -1)); }
    }
    if(ids.length === 1 && start && Math.abs(e.clientX - start.p.x) < 6 && Math.abs(e.clientY - start.p.y) < 6){
      var now = Date.now();
      if(now - lastTap < 300){ if(z.s > 1) z = {s:1, x:0, y:0}; else { z.s = 2.5; } apply(); lastTap = 0; } else lastTap = now;
    }
    delete pts[e.pointerId]; start = snap();
    if(z.s <= 1){ z = {s:1, x:0, y:0}; apply(); }
  }
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  function snap(){ var ids = Object.keys(pts), s = {z:{s:z.s, x:z.x, y:z.y}, p:ids[0] ? pts[ids[0]] : null};
    if(ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]]; s.d = Math.hypot(a.x - b.x, a.y - b.y); } return s; }
  stage.addEventListener('wheel', function(e){ e.preventDefault(); z.s = Math.min(8, Math.max(1, z.s * (e.deltaY < 0 ? 1.12 : 0.89))); if(z.s === 1){ z.x = z.y = 0; } apply(); }, {passive:false});
  v.key = function(e){ if(e.key === 'ArrowRight') load(idx + 1); else if(e.key === 'ArrowLeft') load(idx - 1); };
  commonActs(path);
  tool('rotate', 'Girar 90°', function(){ quickRotate(list[idx]).then(function(){ load(idx); }); });
  tool('sliders', 'Editar', function(){ editImage(list[idx], function(np){ if(np !== list[idx]) list.splice(idx + 1, 0, np); load(list.indexOf(np)); }); });
  tool('pages', 'Convertir a PDF', function(){ Tools.imagesToPdf([list[idx]]); });
  tool('eraser', 'Eliminar objetos', function(){ Extra.eraseObjects(list[idx], function(np){ if(list.indexOf(np) < 0) list.splice(idx + 1, 0, np); load(list.indexOf(np)); }); });
  tool('copy', 'Copiar imagen', function(){
    VFS.read(list[idx]).then(function(b){
      if(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write){
        return toPng(b).then(function(png){ return navigator.clipboard.write([new ClipboardItem({'image/png':png})]); }).then(function(){ UI.toast('Imagen copiada'); });
      }
      UI.toast('No disponible en este dispositivo');
    }).catch(UI.fail);
  });
  if(list.length > 1) tool('play', 'Presentación', function(e){
    if(slide){ clearInterval(slide); slide = null; e.currentTarget.innerHTML = icon('play'); return; }
    e.currentTarget.innerHTML = icon('pause'); slide = setInterval(function(){ load(idx + 1); }, 3500);
  });
  tool('trash', 'Eliminar', function(){
    var p = list[idx];
    UI.confirm('¿Eliminar «' + VFS.base(p) + '»?', '', 'Eliminar', true).then(function(ok){
      if(!ok) return;
      VFS.remove(p).then(function(){ list.splice(idx, 1); if(!list.length) close(); else load(idx); });
    });
  });
  load(idx);
}
function toPng(blob){ return UI.loadImage(URL.createObjectURL(blob)).then(function(i){ var c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return UI.canvasBlob(c, 'image/png'); }); }
function outType(p){ var e = VFS.ext(p); return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg'; }
function quickRotate(p){
  return VFS.read(p).then(function(b){ return UI.loadImage(URL.createObjectURL(b)); }).then(function(i){
    var c = document.createElement('canvas'); c.width = i.naturalHeight; c.height = i.naturalWidth;
    var x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(i, 0, 0);
    var t = outType(p), np = p;
    if(!/^(jpe?g|png|webp)$/.test(VFS.ext(p))) np = VFS.join(VFS.parent(p), VFS.stem(VFS.base(p)) + '.jpg');
    return UI.canvasBlob(c, t, .93).then(function(bl){ return VFS.write(np, bl); });
  }).catch(UI.fail);
}

/* ---------- editor de imagen ---------- */
function editImage(path, done){
  var L, cv, ctx, src, rot = 0, flipH = false, flipV = false, crop = null, adj = {b:0, c:0, s:0, g:false, warm:0}, scale = 100;
  var box = h('div', {class:'dlg wide', style:'height:min(820px,calc(100vh - 30px))'});
  box.appendChild(h('h2', {text:'Editar imagen'}));
  var stageW = h('div', {style:'flex:1;min-height:0;position:relative;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden;margin:8px 0'});
  cv = h('canvas', {style:'max-width:100%;max-height:100%'}); stageW.appendChild(cv);
  box.appendChild(stageW);
  var ctr = h('div', {class:'body', style:'flex:none;padding-top:0'});
  var row1 = h('div', {class:'row', style:'flex-wrap:wrap;justify-content:center'});
  function tb(i, t, fn){ var b = h('button', {class:'tb', title:t, html:icon(i), onclick:fn}); row1.appendChild(b); return b; }
  tb('rotate', 'Girar', function(){ rot = (rot + 90) % 360; crop = null; draw(); });
  tb('flip', 'Voltear horizontal', function(){ flipH = !flipH; draw(); });
  tb('flip', 'Voltear vertical', function(){ flipV = !flipV; draw(); }).style.transform = 'rotate(90deg)';
  var cropBtn = tb('crop', 'Recortar', function(){ cropMode(); });
  tb('wand', 'Mejorar automáticamente', function(){ adj = {b:6, c:14, s:12, g:false, warm:0}; syncSliders(); draw(); });
  tb('undo', 'Restablecer', function(){ rot = 0; flipH = flipV = false; crop = null; adj = {b:0, c:0, s:0, g:false, warm:0}; scale = 100; syncSliders(); draw(); });
  ctr.appendChild(row1);
  var sliders = h('div', {style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:4px 16px;margin-top:6px'});
  var S = {};
  function sl(k, t, min, max){
    var inp = h('input', {type:'range', min:min, max:max, value:adj[k], oninput:function(){ adj[k] = +inp.value; draw(); }});
    S[k] = inp;
    sliders.appendChild(h('label', {style:'font-size:12px;color:var(--muted)'}, [t, inp]));
  }
  sl('b', 'Brillo', -60, 60); sl('c', 'Contraste', -60, 60); sl('s', 'Saturación', -100, 100); sl('warm', 'Calidez', -40, 40);
  var gray = h('button', {class:'chip', text:'Blanco y negro', onclick:function(){ adj.g = !adj.g; gray.classList.toggle('on', adj.g); draw(); }});
  var bw = h('button', {class:'chip', text:'Documento', onclick:function(){ adj = {b:10, c:45, s:-100, g:true, warm:0}; syncSliders(); draw(); }});
  sliders.appendChild(h('div', {class:'row'}, [gray, bw]));
  var sz = h('select', {class:'field', style:'height:34px;font-size:14px'});
  [100, 75, 50, 25].forEach(function(p){ sz.appendChild(h('option', {value:p, text:'Tamaño ' + p + '%'})); });
  sz.onchange = function(){ scale = +sz.value; };
  var fmt = h('select', {class:'field', style:'height:34px;font-size:14px'});
  [['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']].forEach(function(f){ fmt.appendChild(h('option', {value:f[0], text:'Formato ' + f[1]})); });
  fmt.value = outType(path);
  sliders.appendChild(sz); sliders.appendChild(fmt);
  ctr.appendChild(sliders);
  box.appendChild(ctr);
  function syncSliders(){ for(var k in S) S[k].value = adj[k]; gray.classList.toggle('on', adj.g); }
  var bs = h('div', {class:'btns'});
  bs.appendChild(h('button', {text:'Cancelar', onclick:function(){ L.close(); }}));
  bs.appendChild(h('button', {text:'Guardar copia', onclick:function(){ save(true); }}));
  bs.appendChild(h('button', {class:'primary', text:'Guardar', onclick:function(){ save(false); }}));
  box.appendChild(bs);
  L = UI.layer(box, {modal:true});

  VFS.read(path).then(function(b){ return UI.loadImage(URL.createObjectURL(b)); }).then(function(i){ src = i; draw(); }).catch(function(e){ L.close(); UI.fail(e); });

  function render(target, full){
    var w = src.naturalWidth, hh = src.naturalHeight, sw = rot % 180 ? hh : w, sh = rot % 180 ? w : hh;
    var base = document.createElement('canvas'); base.width = sw; base.height = sh;
    var b = base.getContext('2d');
    b.translate(sw / 2, sh / 2); b.rotate(rot * Math.PI / 180); b.scale(flipH ? -1 : 1, flipV ? -1 : 1); b.drawImage(src, -w / 2, -hh / 2);
    var cr = crop || {x:0, y:0, w:1, h:1};
    var cx = Math.round(cr.x * sw), cy = Math.round(cr.y * sh), cw = Math.max(1, Math.round(cr.w * sw)), ch = Math.max(1, Math.round(cr.h * sh));
    var k = full ? scale / 100 : Math.min(1, 1400 / Math.max(cw, ch));
    target.width = Math.max(1, Math.round(cw * k)); target.height = Math.max(1, Math.round(ch * k));
    var t = target.getContext('2d');
    t.drawImage(base, cx, cy, cw, ch, 0, 0, target.width, target.height);
    pixels(t, target.width, target.height);
  }
  function pixels(t, w, hh){
    if(!adj.b && !adj.c && !adj.s && !adj.g && !adj.warm) return;
    var d = t.getImageData(0, 0, w, hh), a = d.data;
    var br = adj.b * 2.55, cf = (259 * (adj.c * 2.55 + 255)) / (255 * (259 - adj.c * 2.55)), sat = 1 + adj.s / 100;
    for(var i = 0; i < a.length; i += 4){
      var r = a[i], g = a[i + 1], bl = a[i + 2];
      r += adj.warm; bl -= adj.warm;
      var l = .299 * r + .587 * g + .114 * bl;
      if(adj.g){ r = g = bl = l; } else { r = l + (r - l) * sat; g = l + (g - l) * sat; bl = l + (bl - l) * sat; }
      r = cf * (r + br - 128) + 128; g = cf * (g + br - 128) + 128; bl = cf * (bl + br - 128) + 128;
      a[i] = r < 0 ? 0 : r > 255 ? 255 : r; a[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; a[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    }
    t.putImageData(d, 0, 0);
  }
  var raf = 0;
  function draw(){ if(!src) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(function(){ render(cv, false); }); }
  function cropMode(){
    // recuadro de recorte sobre la vista previa
    var saved = crop; crop = null; render(cv, false);
    var r = cv.getBoundingClientRect(), wr = stageW.getBoundingClientRect();
    var bx = h('div', {class:'cropbox'}), c = saved || {x:.08, y:.08, w:.84, h:.84};
    ['0% 0%', '100% 0%', '0% 100%', '100% 100%'].forEach(function(p, i){ var k = h('i', {'data-k':i}); var xy = p.split(' '); k.style.left = xy[0]; k.style.top = xy[1]; bx.appendChild(k); });
    stageW.appendChild(bx);
    function place(){ bx.style.left = (r.left - wr.left + c.x * r.width) + 'px'; bx.style.top = (r.top - wr.top + c.y * r.height) + 'px'; bx.style.width = c.w * r.width + 'px'; bx.style.height = c.h * r.height + 'px'; }
    place();
    var drag = null;
    bx.addEventListener('pointerdown', function(e){ bx.setPointerCapture(e.pointerId); drag = {k:e.target.getAttribute('data-k'), x:e.clientX, y:e.clientY, c:{x:c.x, y:c.y, w:c.w, h:c.h}}; e.preventDefault(); });
    bx.addEventListener('pointermove', function(e){
      if(!drag) return;
      var dx = (e.clientX - drag.x) / r.width, dy = (e.clientY - drag.y) / r.height, o = drag.c, m = .05;
      if(drag.k == null){ c.x = Math.min(1 - o.w, Math.max(0, o.x + dx)); c.y = Math.min(1 - o.h, Math.max(0, o.y + dy)); }
      else {
        var k = +drag.k, x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if(k === 0 || k === 2) x1 = Math.min(x2 - m, Math.max(0, x1 + dx)); else x2 = Math.max(x1 + m, Math.min(1, x2 + dx));
        if(k === 0 || k === 1) y1 = Math.min(y2 - m, Math.max(0, y1 + dy)); else y2 = Math.max(y1 + m, Math.min(1, y2 + dy));
        c = {x:x1, y:y1, w:x2 - x1, h:y2 - y1};
      }
      place();
    });
    bx.addEventListener('pointerup', function(){ drag = null; });
    cropBtn.classList.add('on');
    cropBtn.onclick = function(){ crop = c; bx.remove(); cropBtn.classList.remove('on'); cropBtn.onclick = cropMode; draw(); };
    UI.toast('Ajusta el recuadro y toca recortar otra vez');
  }
  function save(copy){
    if(!src) return;
    UI.busy('Guardando…');
    var out = document.createElement('canvas'); render(out, true);
    var t = fmt.value, e = t === 'image/png' ? 'png' : t === 'image/webp' ? 'webp' : 'jpg';
    UI.canvasBlob(out, t, .92).then(function(b){
      if(!b){ t = 'image/jpeg'; e = 'jpg'; return UI.canvasBlob(out, t, .92); }
      return b;
    }).then(function(b){
      var stem = VFS.stem(VFS.base(path)), dir = VFS.parent(path);
      var target = copy ? VFS.uniquePath(VFS.join(dir, stem + ' editada.' + e)) : Promise.resolve(VFS.ext(path) === e || (e === 'jpg' && VFS.ext(path) === 'jpeg') ? path : VFS.join(dir, stem + '.' + e));
      return target.then(function(np){
        return VFS.write(np, b).then(function(){
          if(!copy && np !== path) return VFS.remove(path).then(function(){ return np; });
          return np;
        });
      });
    }).then(function(np){ UI.busy(false); L.close(); UI.toast('Imagen guardada'); App.refresh(); if(done) done(np); }).catch(UI.fail);
  }
}

/* ---------- video ---------- */
function video(path, list){
  var v = shell(path, {dark:true});
  var idx = Math.max(0, list.indexOf(path)), url = null;
  var wrap = h('div', {class:'media'}); v.body.appendChild(wrap);
  var vid = h('video', {controls:true, playsinline:true, autoplay:true, preload:'metadata'}); wrap.appendChild(vid);
  Player.pause();
  function load(i){
    idx = (i + list.length) % list.length;
    var p = list[idx];
    setTitle(p, list.length > 1 ? (idx + 1) + ' de ' + list.length : '');
    Meta.patch(p, {opened:Date.now()});
    VFS.url(p).then(function(u){
      if(url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
      url = u; vid.src = u;
      Meta.get(p).then(function(m){ if(m.pos && m.pos > 5){ vid.addEventListener('loadedmetadata', function f(){ vid.removeEventListener('loadedmetadata', f); if(m.pos < vid.duration - 5){ vid.currentTime = m.pos; UI.toast('Continuando desde ' + UI.dur(m.pos)); } }); } });
      vid.play().catch(function(){});
    });
  }
  var lastSave = 0;
  vid.addEventListener('timeupdate', function(){ if(Date.now() - lastSave > 4000){ lastSave = Date.now(); Meta.patch(list[idx], {pos:vid.currentTime}); } });
  vid.addEventListener('ended', function(){ Meta.patch(list[idx], {pos:null}); if(list.length > 1 && !vid.loop) load(idx + 1); });
  v.cleanup.push(function(){ if(vid.currentTime) Meta.patch(list[idx], {pos:vid.ended ? null : vid.currentTime}); vid.pause(); if(url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url); });
  commonActs(path);
  if(list.length > 1) tool('prev', 'Anterior', function(){ load(idx - 1); });
  tool('undo', 'Retroceder 10 s', function(){ vid.currentTime = Math.max(0, vid.currentTime - 10); });
  tool('redo', 'Adelantar 10 s', function(){ vid.currentTime = vid.currentTime + 10; });
  if(list.length > 1) tool('next', 'Siguiente', function(){ load(idx + 1); });
  sep();
  var speed = h('button', {class:'tb', style:'width:auto;padding:0 10px;font-weight:700', text:'1×', onclick:function(){ var r = [1, 1.25, 1.5, 2, 0.5, 0.75], i = (r.indexOf(vid.playbackRate) + 1) % r.length; vid.playbackRate = r[i]; speed.textContent = String(r[i]).replace('.', ',') + '×'; }});
  v.tools.appendChild(speed);
  var lp = tool('loop', 'Repetir', function(){ vid.loop = !vid.loop; lp.classList.toggle('on', vid.loop); });
  if(document.pictureInPictureEnabled || vid.webkitSupportsPresentationMode) tool('pip', 'Imagen en imagen', function(){
    if(vid.webkitSetPresentationMode) vid.webkitSetPresentationMode(vid.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture');
    else if(document.pictureInPictureElement) document.exitPictureInPicture(); else vid.requestPictureInPicture().catch(function(){});
  });
  tool('camera', 'Capturar fotograma', function(){
    var c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight; c.getContext('2d').drawImage(vid, 0, 0);
    UI.canvasBlob(c, 'image/jpeg', .92).then(function(b){ return VFS.uniquePath(VFS.join(VFS.parent(list[idx]), VFS.stem(VFS.base(list[idx])) + ' ' + UI.dur(vid.currentTime).replace(/:/g, '.') + '.jpg')).then(function(p){ return VFS.write(p, b); }); })
      .then(function(){ UI.toast('Fotograma guardado'); }).catch(UI.fail);
  });
  tool('music', 'Escuchar como audio', function(){ var t = vid.currentTime; close(); Player.play(list[idx], [list[idx]], false, t); });
  v.key = function(e){ if(e.key === ' '){ e.preventDefault(); if(vid.paused) vid.play(); else vid.pause(); } else if(e.key === 'ArrowRight') vid.currentTime += 5; else if(e.key === 'ArrowLeft') vid.currentTime -= 5; };
  load(idx);
}

/* ---------- reproductor de audio (sigue sonando al navegar) ---------- */
var Player = (function(){
  var a = new Audio(), list = [], idx = 0, url = null, shuffle = false, loopOne = false, view = null;
  a.preload = 'metadata';
  function load(i, autoplay, at){
    idx = (i + list.length) % list.length;
    var p = list[idx];
    Meta.patch(p, {opened:Date.now()});
    return VFS.url(p).then(function(u){
      if(url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
      url = u; a.src = u;
      if(at) a.addEventListener('loadedmetadata', function f(){ a.removeEventListener('loadedmetadata', f); a.currentTime = at; });
      if(autoplay !== false) a.play().catch(function(){});
      session(); mini(); paint();
    });
  }
  function session(){
    if(!('mediaSession' in navigator)) return;
    var p = list[idx];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({title:VFS.stem(VFS.base(p)), artist:VFS.base(VFS.parent(p)) || 'Archivero', album:'Archivero', artwork:[{src:'icon-512.png', sizes:'512x512', type:'image/png'}]});
      navigator.mediaSession.setActionHandler('play', function(){ a.play(); });
      navigator.mediaSession.setActionHandler('pause', function(){ a.pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', function(){ prev(); });
      navigator.mediaSession.setActionHandler('nexttrack', function(){ next(); });
      navigator.mediaSession.setActionHandler('seekto', function(d){ a.currentTime = d.seekTime; });
    } catch(e){}
  }
  function next(){ if(shuffle && list.length > 1){ var j; do { j = Math.floor(Math.random() * list.length); } while(j === idx); load(j); } else load(idx + 1); }
  function prev(){ if(a.currentTime > 3) a.currentTime = 0; else load(idx - 1); }
  a.addEventListener('ended', function(){ if(loopOne){ a.currentTime = 0; a.play(); } else if(list.length > 1 && (idx < list.length - 1 || shuffle)) next(); else paint(); });
  ['play', 'pause', 'timeupdate', 'loadedmetadata'].forEach(function(ev){ a.addEventListener(ev, function(){ paint(); }); });
  function mini(){
    var m = $('#mini');
    if(!list.length){ m.classList.add('hidden'); return; }
    m.classList.remove('hidden');
    m.innerHTML = '<div class="art">' + icon('music') + '</div><div class="grow" style="min-width:0;cursor:pointer" id="miniInfo"><div class="ell" style="font-weight:600;font-size:14px"></div><div class="pbar"><i></i></div></div>';
    m.querySelector('.ell').textContent = VFS.stem(VFS.base(list[idx]));
    m.appendChild(h('button', {class:'tb', html:icon('prev'), onclick:prev}));
    m.appendChild(h('button', {class:'tb', id:'miniPP', html:icon(a.paused ? 'play' : 'pause'), onclick:function(){ if(a.paused) a.play(); else a.pause(); }}));
    m.appendChild(h('button', {class:'tb', html:icon('next'), onclick:next}));
    m.appendChild(h('button', {class:'tb', html:icon('x'), onclick:stop}));
    $('#miniInfo').onclick = function(){ show(); };
  }
  function paint(){
    var pp = $('#miniPP'); if(pp) pp.innerHTML = icon(a.paused ? 'play' : 'pause');
    var pb = document.querySelector('#mini .pbar i'); if(pb) pb.style.width = (a.duration ? a.currentTime / a.duration * 100 : 0) + '%';
    if(view && view.isConnected){
      view.querySelector('.ttl').textContent = VFS.stem(VFS.base(list[idx]));
      view.querySelector('.sub').textContent = list.length > 1 ? (idx + 1) + ' de ' + list.length : VFS.base(VFS.parent(list[idx])) || 'Mis archivos';
      var r = view.querySelector('input[type=range]'); if(!r._drag){ r.max = a.duration || 0; r.value = a.currentTime; }
      view.querySelector('.t1').textContent = UI.dur(a.currentTime); view.querySelector('.t2').textContent = '-' + UI.dur((a.duration || 0) - a.currentTime);
      view.querySelector('.big').innerHTML = icon(a.paused ? 'play' : 'pause');
    }
  }
  function stop(){ a.pause(); a.removeAttribute('src'); a.load(); if(url && url.indexOf('blob:') === 0) URL.revokeObjectURL(url); url = null; list = []; mini(); }
  function show(){
    var v = shell(list[idx]);
    setTitle(list[idx], 'Reproduciendo');
    var colors = ['#F76B15', '#8E4EC6', '#0B7A75', '#D6409F', '#2F6FDB'];
    var card = h('div', {class:'audiocard', html:'<div class="cover" style="background:linear-gradient(145deg,' + colors[idx % colors.length] + ',#1c1d1f)">' + icon('music') + '</div><div class="ttl ell" style="font-weight:700;font-size:19px"></div><div class="sub muted" style="margin-bottom:14px"></div>'});
    var rng = h('input', {type:'range', min:0, step:'0.1'});
    rng.addEventListener('input', function(){ rng._drag = true; }); rng.addEventListener('change', function(){ a.currentTime = +rng.value; rng._drag = false; });
    card.appendChild(rng);
    card.appendChild(h('div', {class:'row muted', style:'justify-content:space-between;font-size:12px', html:'<span class="t1"></span><span class="t2"></span>'}));
    var c = h('div', {class:'ctrls'});
    var sh = h('button', {class:'tb' + (shuffle ? ' on' : ''), html:icon('shuffle'), onclick:function(){ shuffle = !shuffle; sh.classList.toggle('on', shuffle); }});
    c.appendChild(sh);
    c.appendChild(h('button', {class:'tb', html:icon('prev'), onclick:prev}));
    c.appendChild(h('button', {class:'big', html:icon('pause'), onclick:function(){ if(a.paused) a.play(); else a.pause(); }}));
    c.appendChild(h('button', {class:'tb', html:icon('next'), onclick:next}));
    var lp = h('button', {class:'tb' + (loopOne ? ' on' : ''), html:icon('loop'), onclick:function(){ loopOne = !loopOne; lp.classList.toggle('on', loopOne); }});
    c.appendChild(lp);
    card.appendChild(c);
    var sp = h('select', {class:'field', style:'height:34px;margin-top:16px;font-size:14px'});
    [0.75, 1, 1.25, 1.5, 2].forEach(function(r){ sp.appendChild(h('option', {value:r, text:'Velocidad ' + String(r).replace('.', ',') + '×'})); });
    sp.value = a.playbackRate; sp.onchange = function(){ a.playbackRate = +sp.value; };
    card.appendChild(sp);
    var timer = h('select', {class:'field', style:'height:34px;margin-top:8px;font-size:14px'});
    [['0', 'Temporizador: apagado'], ['15', 'Detener en 15 min'], ['30', 'Detener en 30 min'], ['60', 'Detener en 1 hora']].forEach(function(o){ timer.appendChild(h('option', {value:o[0], text:o[1]})); });
    timer.onchange = function(){ clearTimeout(Player._t); if(+timer.value){ Player._t = setTimeout(function(){ a.pause(); }, timer.value * 60000); UI.toast('Se detendrá en ' + timer.value + ' min'); } };
    card.appendChild(timer);
    var wrap = h('div', {style:'min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px'}); wrap.appendChild(card);
    if(list.length > 1){
      var ql = h('div', {class:'audiocard', style:'margin-top:16px;padding:10px;text-align:left;max-height:40vh;overflow:auto'});
      list.forEach(function(p, i){ ql.appendChild(h('button', {class:'mi' + (i === idx ? ' on' : ''), html:icon('music') + '<span class="ell grow">' + esc(VFS.stem(VFS.base(p))) + '</span>', onclick:function(){ load(i).then(function(){ UI.$$('.mi', ql).forEach(function(b, j){ b.classList.toggle('on', j === idx); }); }); }})); });
      wrap.appendChild(ql);
    }
    v.body.appendChild(wrap);
    view = card;
    act('sliders', 'Editar audio', function(){ var p = list[idx]; a.pause(); Extra.audioEditor(p); });
    if(VFS.ext(list[idx]) === 'mp3') act('tag', 'Metadatos', function(){ Extra.editTags(list[idx]); });
    commonActs(list[idx]);
    v.key = function(e){ if(e.key === ' '){ e.preventDefault(); if(a.paused) a.play(); else a.pause(); } else if(e.key === 'ArrowRight') a.currentTime += 10; else if(e.key === 'ArrowLeft') a.currentTime -= 10; };
    paint();
  }
  return {
    play:function(p, l, openView, at){ list = l && l.length ? l : [p]; return load(Math.max(0, list.indexOf(p)), true, at).then(function(){ if(openView) show(); }); },
    pause:function(){ a.pause(); }, show:show
  };
}());

/* ---------- texto, código y Markdown ---------- */
function md2html(src){
  var lines = src.replace(/\r\n?/g, '\n').split('\n'), out = [], i = 0;
  function inl(s){
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, function(m, c){ return '<code>' + c + '</code>'; });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, function(m, t, u){ return /^(https?:|mailto:|#)/.test(u) ? '<a href="' + u + '" target="_blank" rel="noopener">' + t + '</a>' : t; });
    s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '<strong>$1$2</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/~~([^~]+)~~/g, '<del>$1</del>').replace(/==([^=]+)==/g, '<mark>$1</mark>');
    s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return s;
  }
  while(i < lines.length){
    var l = lines[i], m;
    if(/^\s*$/.test(l)){ i++; continue; }
    if((m = l.match(/^```(.*)/))){ var code = []; i++; while(i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]); i++; out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); continue; }
    if((m = l.match(/^(#{1,6})\s+(.*)/))){ out.push('<h' + m[1].length + '>' + inl(m[2].replace(/\s#+\s*$/, '')) + '</h' + m[1].length + '>'); i++; continue; }
    if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)){ out.push('<hr>'); i++; continue; }
    if(/^>\s?/.test(l)){ var q = []; while(i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + md2html(q.join('\n')) + '</blockquote>'); continue; }
    if(/^\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\|?\s*:?-+/.test(lines[i + 1])){
      var rows = []; while(i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      var cells = function(r){ return r.trim().replace(/^\||\|$/g, '').split('|').map(function(c){ return c.trim(); }); };
      var t = '<table><thead><tr>' + cells(rows[0]).map(function(c){ return '<th>' + inl(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.slice(2).forEach(function(r){ t += '<tr>' + cells(r).map(function(c){ return '<td>' + inl(c) + '</td>'; }).join('') + '</tr>'; });
      out.push(t + '</tbody></table>'); continue;
    }
    if(/^\s*([-*+]|\d+[.)])\s+/.test(l)){
      var ordered = /^\s*\d/.test(l), items = [];
      while(i < lines.length && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))){
        var it = lines[i++];
        if(/^\s{2,}\S/.test(it) && !/^\s*([-*+]|\d+[.)])\s+/.test(it) && items.length){ items[items.length - 1] += ' ' + it.trim(); continue; }
        items.push(it.replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
      }
      out.push('<' + (ordered ? 'ol' : 'ul') + '>' + items.map(function(x){
        var tk = x.match(/^\[([ xX])\]\s+(.*)/);
        return tk ? '<li style="list-style:none;margin-left:-1.2em"><input type="checkbox" disabled' + (tk[1] !== ' ' ? ' checked' : '') + '> ' + inl(tk[2]) + '</li>' : '<li>' + inl(x) + '</li>';
      }).join('') + '</' + (ordered ? 'ol' : 'ul') + '>');
      continue;
    }
    var para = [];
    while(i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\|)/.test(lines[i])) para.push(lines[i++]);
    if(!para.length) para.push(lines[i++]);
    out.push('<p>' + para.map(inl).join('<br>') + '</p>');
  }
  return out.join('\n');
}
function text(path, opts){
  var v = shell(path);
  var ta = h('textarea', {class:'editor', spellcheck:opts.md ? 'true' : 'false', autocapitalize:'sentences'});
  var prev = h('div', {class:'prose'});
  var mode = opts.md ? (opts.edit ? 'edit' : 'view') : 'edit', orig = '';
  var pane = h('div', {style:'height:100%'});
  v.body.appendChild(pane);
  function layout(){
    pane.innerHTML = '';
    if(mode === 'view'){ prev.innerHTML = md2html(ta.value); pane.appendChild(prev); }
    else if(mode === 'split'){ var s = h('div', {class:'split'}); s.appendChild(ta); var pw = h('div', {style:'border-left:1px solid var(--border);background:var(--surface)'}); pw.appendChild(prev); s.appendChild(pw); prev.innerHTML = md2html(ta.value); pane.appendChild(s); }
    else pane.appendChild(ta);
    UI.$$('.mode', v.acts).forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-m') === mode); });
  }
  ta.addEventListener('input', function(){ if(mode === 'split') prev.innerHTML = md2html(ta.value); count(); });
  ta.addEventListener('keydown', function(e){
    if(e.key === 'Tab'){ e.preventDefault(); var s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); }
  });
  if(opts.md){
    [['view', 'eye', 'Lectura'], ['edit', 'edit', 'Editar']].concat(UI.isPhone() ? [] : [['split', 'pages', 'Dividido']]).forEach(function(m){
      var b = act(m[1], m[2], function(){ mode = m[0]; layout(); }); b.classList.add('mode'); b.setAttribute('data-m', m[0]);
    });
  }
  commonActs(path);
  var info = h('span', {class:'muted', style:'font-size:12px;padding:0 8px;white-space:nowrap'});
  function count(){ var t = ta.value; info.textContent = (t.trim() ? t.trim().split(/\s+/).length : 0).toLocaleString('es-CL') + ' palabras · ' + t.length.toLocaleString('es-CL') + ' caracteres'; }
  var saveBtn = tool('download', 'Guardar (⌘S)', function(){ v.save(); });
  saveBtn.innerHTML = '<b style="font-size:14px">Guardar</b>'; saveBtn.style.width = 'auto'; saveBtn.style.padding = '0 12px';
  tool('search', 'Buscar y reemplazar', function(){ findReplace(ta); });
  tool('zin', 'Letra más grande', function(){ fs(1); });
  tool('zout', 'Letra más pequeña', function(){ fs(-1); });
  tool('speak', 'Leer en voz alta', function(e){ speak(mode === 'view' ? prev.innerText : ta.value, e.currentTarget); });
  tool('copy', 'Copiar todo', function(){ UI.copyText(ta.value).then(function(){ UI.toast('Texto copiado'); }); });
  if(opts.md) tool('print', 'Imprimir o PDF', function(){ printHtml(md2html(ta.value), VFS.stem(VFS.base(path))); });
  else tool('print', 'Imprimir', function(){ printHtml('<pre style="white-space:pre-wrap;font:12px/1.5 Menlo,monospace">' + esc(ta.value) + '</pre>', VFS.base(path)); });
  v.tools.appendChild(info);
  var size = 15;
  try { size = +localStorage.getItem('archivero_fs') || 15; } catch(e){}
  function fs(d){ size = Math.max(11, Math.min(28, size + d)); ta.style.fontSize = size + 'px'; prev.style.fontSize = (size + 1) + 'px'; try { localStorage.setItem('archivero_fs', size); } catch(e){} }
  fs(0);
  v.dirty = function(){ return ta.value !== orig; };
  v.save = function(){
    var p = cur.path;
    return VFS.write(p, new Blob([ta.value], {type:VFS.mimeOf(p)})).then(function(){ orig = ta.value; UI.toast('Guardado'); }).catch(UI.fail);
  };
  var autosave = setInterval(function(){ if(v.dirty() && cur === v) v.save(); }, 30000);
  v.cleanup.push(function(){ clearInterval(autosave); });
  VFS.text(path).then(function(t){ ta.value = orig = t; count(); layout(); if(mode === 'edit' && opts.edit){ ta.focus(); ta.setSelectionRange(t.length, t.length); } }).catch(UI.fail);
}
function findReplace(ta){
  var f = h('input', {class:'field', placeholder:'Buscar'}), r = h('input', {class:'field', placeholder:'Reemplazar por', style:'margin-top:8px'});
  var cs = h('div', {class:'muted', style:'font-size:12.5px;margin-top:8px'});
  f.addEventListener('input', function(){ var q = f.value; cs.textContent = q ? (ta.value.split(q).length - 1) + ' coincidencias' : ''; });
  UI.dialog({title:'Buscar y reemplazar', body:h('div', {}, [f, r, cs]), buttons:[{t:'Cancelar', v:null}, {t:'Siguiente', v:'next'}, {t:'Reemplazar todo', v:'all', cls:'primary'}]}).then(function(v){
    var q = f.value; if(!q) return;
    if(v === 'all'){ var n = ta.value.split(q).length - 1; ta.value = ta.value.split(q).join(r.value); ta.dispatchEvent(new Event('input')); UI.toast(n + ' reemplazos'); }
    else if(v === 'next'){ var i = ta.value.indexOf(q, ta.selectionEnd); if(i < 0) i = ta.value.indexOf(q); if(i >= 0){ ta.focus(); ta.setSelectionRange(i, i + q.length); } else UI.toast('Sin coincidencias'); }
  });
}
function speak(t, btn){
  if(!window.speechSynthesis){ UI.toast('Lectura en voz alta no disponible'); return; }
  if(speechSynthesis.speaking){ speechSynthesis.cancel(); if(btn) btn.classList.remove('on'); return; }
  t = (t || '').trim(); if(!t){ UI.toast('No hay texto para leer'); return; }
  // en trozos: Safari corta enunciados largos
  var parts = t.replace(/\s+/g, ' ').match(/[^.!?;]{1,220}[.!?;]?/g) || [t];
  var voice = speechSynthesis.getVoices().filter(function(v){ return /^es/.test(v.lang); })[0];
  parts.forEach(function(p, i){
    var u = new SpeechSynthesisUtterance(p); u.lang = voice ? voice.lang : 'es-CL'; if(voice) u.voice = voice; u.rate = 1;
    if(i === parts.length - 1) u.onend = function(){ if(btn) btn.classList.remove('on'); };
    speechSynthesis.speak(u);
  });
  if(btn) btn.classList.add('on');
}
function printHtml(html, ttl){
  var w = h('div', {id:'printarea', class:'prose', html:html, style:'position:fixed;left:-99999px;top:0'});
  document.body.appendChild(w);
  var old = document.title; document.title = ttl || old;
  setTimeout(function(){ window.print(); setTimeout(function(){ w.remove(); document.title = old; }, 500); }, 60);
}

/* ---------- web ---------- */
function htmlView(path){
  var v = shell(path);
  var fr = h('iframe', {sandbox:'allow-same-origin', style:'width:100%;height:100%;border:0;background:#fff'});
  v.body.appendChild(fr);
  VFS.text(path).then(function(t){ fr.srcdoc = t.replace(/<script[\s\S]*?<\/script>/gi, ''); });
  act('code', 'Ver código', function(){ close(); text(path, {}); });
  commonActs(path);
}

/* ---------- Word ---------- */
function docx(path){
  var v = shell(path);
  var d = h('div', {class:'prose', html:'<div class="spin"></div>'}); v.body.appendChild(d);
  commonActs(path);
  UI.loadScript('lib/mammoth.browser.min.js').then(function(){ return VFS.read(path); }).then(function(b){ return b.arrayBuffer(); })
    .then(function(ab){ return mammoth.convertToHtml({arrayBuffer:ab}, {convertImage:mammoth.images.imgElement(function(im){ return im.read('base64').then(function(x){ return {src:'data:' + im.contentType + ';base64,' + x}; }); })}); })
    .then(function(r){
      d.innerHTML = r.value || '<p class="muted">Documento vacío</p>';
      tool('speak', 'Leer en voz alta', function(e){ speak(d.innerText, e.currentTarget); });
      tool('print', 'Imprimir o guardar como PDF', function(){ printHtml(d.innerHTML, VFS.stem(VFS.base(path))); });
      tool('md', 'Convertir a Markdown', function(){ saveSibling(path, 'md', htmlToMd(d)); });
      tool('text', 'Convertir a texto', function(){ saveSibling(path, 'txt', d.innerText); });
      tool('copy', 'Copiar texto', function(){ UI.copyText(d.innerText).then(function(){ UI.toast('Texto copiado'); }); });
    }).catch(function(e){ d.innerHTML = '<p class="muted">No se pudo abrir este documento: ' + esc(e.message) + '</p>'; });
}
function rtf(path){
  VFS.text(path).then(function(t){
    // RTF básico: quita grupos de control y deja el texto
    var s = t.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^{}]*\}/g, '').replace(/\\'([0-9a-f]{2})/gi, function(m, x){ return String.fromCharCode(parseInt(x, 16)); }).replace(/\\u(-?\d+)\??/g, function(m, n){ n = +n; return String.fromCharCode(n < 0 ? n + 65536 : n); })
      .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    var v = shell(path);
    v.body.appendChild(h('div', {class:'prose', style:'white-space:pre-wrap', text:s}));
    commonActs(path);
    tool('text', 'Guardar como texto', function(){ saveSibling(path, 'txt', s); });
  }).catch(UI.fail);
}
function htmlToMd(root){
  function walk(n){
    if(n.nodeType === 3) return n.nodeValue.replace(/\s+/g, ' ');
    if(n.nodeType !== 1) return '';
    var t = n.tagName, inner = Array.prototype.map.call(n.childNodes, walk).join('');
    switch(t){
      case 'H1': return '\n# ' + inner.trim() + '\n\n'; case 'H2': return '\n## ' + inner.trim() + '\n\n'; case 'H3': return '\n### ' + inner.trim() + '\n\n'; case 'H4': return '\n#### ' + inner.trim() + '\n\n';
      case 'P': return inner.trim() + '\n\n'; case 'BR': return '\n'; case 'STRONG': case 'B': return inner.trim() ? '**' + inner.trim() + '** ' : ''; case 'EM': case 'I': return inner.trim() ? '*' + inner.trim() + '* ' : '';
      case 'A': return '[' + inner + '](' + (n.getAttribute('href') || '') + ')';
      case 'LI': return (n.parentNode.tagName === 'OL' ? (Array.prototype.indexOf.call(n.parentNode.children, n) + 1) + '. ' : '- ') + inner.trim() + '\n';
      case 'UL': case 'OL': return '\n' + inner + '\n';
      case 'TABLE':
        var rows = Array.prototype.map.call(n.querySelectorAll('tr'), function(r){ return '| ' + Array.prototype.map.call(r.children, function(c){ return c.innerText.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim(); }).join(' | ') + ' |'; });
        if(rows.length) rows.splice(1, 0, rows[0].replace(/[^|]+/g, ' --- '));
        return '\n' + rows.join('\n') + '\n\n';
      case 'IMG': return '';
      default: return inner;
    }
  }
  return walk(root).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function saveSibling(path, e, content){
  VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + '.' + e)).then(function(p){
    return VFS.write(p, new Blob([content], {type:VFS.mimeOf(p)})).then(function(){ UI.toast('Guardado como ' + VFS.base(p)); });
  }).catch(UI.fail);
}

/* ---------- Excel / CSV ---------- */
function sheet(path){
  var v = shell(path);
  var tabs = h('div', {class:'sheettabs'}), area = h('div', {style:'overflow:auto;height:calc(100% - 50px)'});
  v.body.appendChild(tabs); v.body.appendChild(area);
  area.innerHTML = '<div class="spin" style="margin-top:60px"></div>';
  commonActs(path);
  var wb;
  UI.loadScript('lib/xlsx.full.min.js').then(function(){ return VFS.read(path); }).then(function(b){ return b.arrayBuffer(); }).then(function(ab){
    wb = XLSX.read(ab, {type:'array', cellDates:true});
    wb.SheetNames.forEach(function(n, i){ tabs.appendChild(h('button', {class:'chip' + (i ? '' : ' on'), text:n, onclick:function(e){ UI.$$('.chip', tabs).forEach(function(c){ c.classList.remove('on'); }); e.currentTarget.classList.add('on'); show(n); }})); });
    if(wb.SheetNames.length < 2) tabs.style.display = 'none', area.style.height = '100%';
    show(wb.SheetNames[0]);
    tool('search', 'Filtrar filas', function(){ UI.prompt('Filtrar filas', area._q || '', {placeholder:'Texto a buscar'}).then(function(q){ area._q = q || ''; show(area._sheet); }); });
    tool('copy', 'Copiar como texto', function(){ UI.copyText(XLSX.utils.sheet_to_csv(wb.Sheets[area._sheet], {FS:'\t'})).then(function(){ UI.toast('Copiado (se pega en Excel o Numbers)'); }); });
    tool('md', 'Exportar como Markdown', function(){
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[area._sheet], {header:1, defval:''});
      if(!rows.length) return;
      var w = Math.max.apply(null, rows.map(function(r){ return r.length; }));
      var line = function(r){ var a = []; for(var i = 0; i < w; i++) a.push(String(r[i] == null ? '' : r[i]).replace(/\|/g, '\\|').replace(/\n/g, ' ')); return '| ' + a.join(' | ') + ' |'; };
      var md = [line(rows[0]), '|' + new Array(w + 1).join(' --- |')].concat(rows.slice(1).map(line)).join('\n') + '\n';
      saveSibling(path, 'md', md);
    });
    tool('table', 'Exportar como CSV', function(){ saveSibling(path, 'csv', XLSX.utils.sheet_to_csv(wb.Sheets[area._sheet])); });
    if(VFS.ext(path) !== 'xlsx') tool('download', 'Convertir a Excel (.xlsx)', function(){
      var out = XLSX.write(wb, {bookType:'xlsx', type:'array'});
      VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + '.xlsx')).then(function(p){ return VFS.write(p, new Blob([out], {type:VFS.mimeOf(p)})).then(function(){ UI.toast('Creado ' + VFS.base(p)); }); });
    });
  }).catch(function(e){ area.innerHTML = '<div class="empty">No se pudo leer: ' + esc(e.message) + '</div>'; });
  function show(n){
    area._sheet = n;
    var rows = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:'', raw:false});
    var q = (area._q || '').toLowerCase();
    if(q) rows = rows.filter(function(r, i){ return i === 0 || r.join(' ').toLowerCase().indexOf(q) >= 0; });
    var w = rows.reduce(function(m, r){ return Math.max(m, r.length); }, 0), max = 3000;
    var html = '<table class="xl"><thead><tr><th></th>';
    for(var c = 0; c < w; c++) html += '<th>' + XLSX.utils.encode_col(c) + '</th>';
    html += '</tr></thead><tbody>';
    rows.slice(0, max).forEach(function(r, i){ html += '<tr><td class="rh">' + (i + 1) + '</td>'; for(var c = 0; c < w; c++) html += '<td title="' + esc(r[c]) + '">' + esc(r[c]) + '</td>'; html += '</tr>'; });
    html += '</tbody></table>';
    if(rows.length > max) html += '<div class="muted" style="padding:10px">Mostrando ' + max + ' de ' + rows.length + ' filas.</div>';
    if(!rows.length) html = '<div class="empty">Hoja vacía</div>';
    area.innerHTML = html;
  }
}

/* ---------- PowerPoint ---------- */
function pptx(path){
  var v = shell(path);
  var d = h('div', {style:'max-width:900px;margin:0 auto;padding:20px'}); v.body.appendChild(d);
  d.innerHTML = '<div class="spin" style="margin-top:60px"></div>';
  commonActs(path);
  var all = [];
  VFS.read(path).then(JSZip.loadAsync).then(function(z){
    var slides = Object.keys(z.files).filter(function(n){ return /^ppt\/slides\/slide\d+\.xml$/.test(n); }).sort(function(a, b){ return +a.match(/\d+/)[0] - +b.match(/\d+/)[0]; });
    return Promise.all(slides.map(function(n){
      var rel = n.replace('slides/', 'slides/_rels/') + '.rels';
      return Promise.all([z.file(n).async('string'), z.file(rel) ? z.file(rel).async('string') : '']).then(function(x){
        var xml = new DOMParser().parseFromString(x[0], 'application/xml');
        var paras = Array.prototype.map.call(xml.getElementsByTagName('a:p'), function(p){ return Array.prototype.map.call(p.getElementsByTagName('a:t'), function(t){ return t.textContent; }).join(''); }).filter(function(s){ return s.trim(); });
        var imgs = (x[1].match(/Target="\.\.\/media\/[^"]+"/g) || []).map(function(t){ return 'ppt/media/' + t.slice(17, -1); });
        return Promise.all(imgs.filter(function(i){ return z.file(i) && /\.(png|jpe?g|gif)$/i.test(i); }).slice(0, 3).map(function(i){ return z.file(i).async('base64').then(function(b){ return 'data:image/' + (/png$/i.test(i) ? 'png' : /gif$/i.test(i) ? 'gif' : 'jpeg') + ';base64,' + b; }); }))
          .then(function(srcs){ return {p:paras, img:srcs}; });
      });
    }));
  }).then(function(slides){
    d.innerHTML = '';
    if(!slides.length){ d.innerHTML = '<div class="empty">Sin diapositivas</div>'; return; }
    slides.forEach(function(s, i){
      all.push(s.p.join('. '));
      var c = h('div', {style:'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px 28px;margin-bottom:18px;box-shadow:var(--shadow);aspect-ratio:16/9;overflow:auto'});
      c.innerHTML = '<div class="muted" style="font-size:12px;margin-bottom:8px">Diapositiva ' + (i + 1) + '</div>' + (s.p[0] ? '<h2 style="margin:0 0 10px">' + esc(s.p[0]) + '</h2>' : '') + s.p.slice(1).map(function(t){ return '<div style="margin:4px 0">• ' + esc(t) + '</div>'; }).join('') +
        s.img.map(function(src){ return '<img src="' + src + '" style="max-height:200px;max-width:45%;margin:10px 10px 0 0;border-radius:6px">'; }).join('');
      d.appendChild(c);
    });
    tool('speak', 'Leer en voz alta', function(e){ speak(all.join('. '), e.currentTarget); });
    tool('md', 'Exportar texto a Markdown', function(){ saveSibling(path, 'md', slides.map(function(s, i){ return '## Diapositiva ' + (i + 1) + (s.p[0] ? ': ' + s.p[0] : '') + '\n\n' + s.p.slice(1).map(function(t){ return '- ' + t; }).join('\n'); }).join('\n\n') + '\n'); });
  }).catch(function(e){ d.innerHTML = '<div class="empty">No se pudo abrir: ' + esc(e.message) + '</div>'; });
}

/* ---------- ZIP ---------- */
function zip(path){
  var v = shell(path);
  var d = h('div', {style:'max-width:820px;margin:0 auto;padding:16px'}); v.body.appendChild(d);
  commonActs(path);
  tool('archive', 'Descomprimir todo', function(){ App.unzip(path).then(function(dir){ if(dir){ close(); App.cd(dir); } }); });
  VFS.read(path).then(JSZip.loadAsync).then(function(z){
    var names = Object.keys(z.files).filter(function(n){ return !z.files[n].dir && n.indexOf('__MACOSX') !== 0 && !/\.DS_Store$/.test(n); });
    var total = 0;
    names.forEach(function(n){ total += z.files[n]._data ? z.files[n]._data.uncompressedSize || 0 : 0; });
    d.appendChild(h('div', {class:'muted', style:'margin-bottom:10px', text:names.length + ' archivos' + (total ? ' · ' + UI.size(total) + ' sin comprimir' : '')}));
    var list = h('div', {class:'set', style:'max-width:none'});
    names.slice(0, 1000).forEach(function(n){
      var f = z.files[n];
      list.appendChild(h('div', {class:'r', html:UI.fileIcon(n).replace('class="ft"', 'class="ft" style="width:30px;height:38px;font-size:0;padding:0"') + '<div class="grow"><div class="ell">' + esc(n.split('/').pop()) + '</div><small class="ell">' + esc(n) + '</small></div>'}, [
        h('button', {class:'btn sec', style:'padding:6px 10px;font-size:13px', text:'Extraer', onclick:function(){
          f.async('blob').then(function(b){ return VFS.uniquePath(VFS.join(VFS.parent(path), n.split('/').pop())).then(function(p){ return VFS.write(p, new Blob([b], {type:VFS.mimeOf(n)})).then(function(){ UI.toast('Extraído ' + VFS.base(p)); }); }); }).catch(UI.fail);
        }})
      ]));
    });
    d.appendChild(list);
  }).catch(function(e){ d.innerHTML = '<div class="empty">ZIP no válido o protegido: ' + esc(e.message) + '</div>'; });
}

/* ---------- EPUB ---------- */
function epub(path){
  var v = shell(path);
  var d = h('div', {class:'prose', style:'font-family:Georgia,serif'}); v.body.appendChild(d);
  d.innerHTML = '<div class="spin" style="margin-top:60px"></div>';
  commonActs(path);
  var urls = [];
  v.cleanup.push(function(){ urls.forEach(URL.revokeObjectURL); });
  VFS.read(path).then(JSZip.loadAsync).then(function(z){
    return z.file('META-INF/container.xml').async('string').then(function(c){
      var opf = c.match(/full-path="([^"]+)"/)[1], base = opf.indexOf('/') >= 0 ? opf.slice(0, opf.lastIndexOf('/') + 1) : '';
      return z.file(opf).async('string').then(function(o){
        var x = new DOMParser().parseFromString(o, 'application/xml'), man = {};
        Array.prototype.forEach.call(x.getElementsByTagName('item'), function(it){ man[it.getAttribute('id')] = it.getAttribute('href'); });
        var spine = Array.prototype.map.call(x.getElementsByTagName('itemref'), function(r){ return base + decodeURIComponent(man[r.getAttribute('idref')] || ''); });
        return Promise.all(spine.map(function(f){ return z.file(f) ? z.file(f).async('string').then(function(s){ return {f:f, s:s}; }) : null; })).then(function(chs){
          d.innerHTML = '';
          var c = Promise.resolve();
          chs.filter(Boolean).forEach(function(ch){
            c = c.then(function(){
              var doc = new DOMParser().parseFromString(ch.s, 'application/xhtml+xml');
              var body = doc.body || doc.getElementsByTagName('body')[0]; if(!body) return;
              Array.prototype.forEach.call(body.querySelectorAll('script,style,link'), function(n){ n.remove(); });
              var imgs = body.querySelectorAll('img,image'), dir = ch.f.slice(0, ch.f.lastIndexOf('/') + 1);
              return Promise.all(Array.prototype.map.call(imgs, function(im){
                var src = im.getAttribute('src') || im.getAttribute('xlink:href') || im.getAttribute('href') || '';
                var parts = (dir + src).split('/'), out = [];
                parts.forEach(function(p){ if(p === '..') out.pop(); else if(p !== '.') out.push(p); });
                var f = z.file(decodeURIComponent(out.join('/')));
                if(!f) return;
                return f.async('blob').then(function(b){ var u = URL.createObjectURL(b); urls.push(u); var ni = document.createElement('img'); ni.src = u; im.parentNode.replaceChild(ni, im); });
              })).then(function(){
                var sec = h('section'); sec.innerHTML = body.innerHTML.replace(/\son\w+="[^"]*"/g, '');
                d.appendChild(sec); d.appendChild(h('hr'));
              });
            });
          });
          return c;
        });
      });
    });
  }).then(function(){
    Meta.get(path).then(function(m){ if(m.pos) v.body.scrollTop = m.pos; });
    var t = 0; v.body.addEventListener('scroll', function(){ clearTimeout(t); t = setTimeout(function(){ Meta.patch(path, {pos:v.body.scrollTop}); }, 500); });
    tool('zin', 'Letra más grande', function(){ d.style.fontSize = (parseFloat(getComputedStyle(d).fontSize) + 1) + 'px'; });
    tool('zout', 'Letra más pequeña', function(){ d.style.fontSize = (parseFloat(getComputedStyle(d).fontSize) - 1) + 'px'; });
    tool('speak', 'Leer en voz alta', function(e){ speak(d.innerText, e.currentTarget); });
  }).catch(function(e){ d.innerHTML = '<div class="empty">No se pudo abrir el libro: ' + esc(e.message) + '</div>'; });
}

/* ---------- otros ---------- */
function unknown(path){
  var v = shell(path);
  VFS.stat(path).then(function(n){
    var e = h('div', {class:'empty'});
    e.innerHTML = UI.fileIcon(path).replace('class="ft"', 'class="ft" style="margin:0 auto;width:96px;height:120px;font-size:16px"') + '<h3>' + esc(n.name) + '</h3><div>' + esc(UI.size(n.size)) + ' · ' + esc(UI.date(n.mtime, true)) + '</div><div style="margin-top:8px">No hay vista previa para este tipo de archivo.</div>';
    var a = h('div', {class:'actions'});
    a.appendChild(h('button', {class:'btn', html:icon('share') + (VFS.native ? 'Compartir' : 'Abrir en otra app'), onclick:function(ev){ App.sharePaths([path], ev.currentTarget); }}));
    if(VFS.native) a.appendChild(h('button', {class:'btn sec', html:icon('finder') + (VFS.ios ? 'Abrir en otra app' : 'Abrir con app del Mac'), onclick:function(){ VFS.bridge({op:'openExternal', path:path}); }}));
    a.appendChild(h('button', {class:'btn sec', html:icon('text') + 'Ver como texto', onclick:function(){ close(); text(path, {}); }}));
    e.appendChild(a);
    v.body.appendChild(e);
  });
  commonActs(path);
}

window.Viewers = {open:open, close:close, shell:shell, act:act, tool:tool, sep:sep, setTitle:setTitle, commonActs:commonActs, editImage:editImage, speak:speak, md2html:md2html, printHtml:printHtml, current:function(){ return cur; }, requestClose:requestClose};
window.Player = Player;
}());
