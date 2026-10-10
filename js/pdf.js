/* Archivero — PDF: lector, búsqueda, índice, anotaciones, firmas, formularios y organizador de páginas */
(function(){
'use strict';
var $ = UI.$, h = UI.h, icon = UI.icon, esc = UI.esc;

var libP = null, plibP = null;
function lib(){
  if(!libP) libP = UI.loadScript('lib/pdf.min.js').then(function(){
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    return pdfjsLib;
  });
  return libP;
}
function plib(){ if(!plibP) plibP = UI.loadScript('lib/pdf-lib.min.js').then(function(){ return PDFLib; }); return plibP; }
function bytes(path){ return VFS.read(path).then(function(b){ return b.arrayBuffer(); }); }
function loadDoc(ab, name){
  return lib().then(function(L){
    var task = L.getDocument({data:new Uint8Array(ab.slice(0)), isEvalSupported:false});
    task.onPassword = function(update, reason){
      UI.prompt(reason === 2 ? 'Contraseña incorrecta' : 'PDF protegido', '', {type:'password', msg:'«' + (name || 'Documento') + '» necesita contraseña', ok:'Abrir'}).then(function(p){ if(p == null){ task.destroy(); } else update(p); });
    };
    return task.promise;
  });
}

/* firmas guardadas */
function sigs(){ try { return JSON.parse(localStorage.getItem('archivero_sigs') || '[]'); } catch(e){ return []; } }
function saveSigs(a){ try { localStorage.setItem('archivero_sigs', JSON.stringify(a)); } catch(e){ UI.toast('No se pudo guardar la firma'); } }
function signaturePad(){
  return new Promise(function(res){
    var c = h('canvas', {style:'width:100%;height:200px;background:#fff;border:1px dashed var(--border);border-radius:12px;touch-action:none'});
    var col = '#1a2b6d', strokes = [], curS = null;
    var colors = h('div', {class:'row', style:'margin-top:10px'});
    ['#1a2b6d', '#111111', '#0B7A75', '#B42318'].forEach(function(k){ var b = h('button', {class:'swatch' + (k === col ? ' on' : ''), style:'background:' + k, onclick:function(){ col = k; UI.$$('.swatch', colors).forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on'); }}); colors.appendChild(b); });
    colors.appendChild(h('span', {class:'grow'}));
    colors.appendChild(h('button', {class:'btn sec', style:'padding:6px 12px', text:'Borrar', onclick:function(){ strokes = []; paint(); }}));
    var body = h('div', {}, [h('div', {class:'muted', style:'font-size:13px;margin-bottom:8px', text:'Firma con el dedo, el Apple Pencil o el trackpad.'}), c, colors]);
    var x;
    function setup(){ var r = c.getBoundingClientRect(); c.width = r.width * 2; c.height = r.height * 2; x = c.getContext('2d'); paint(); }
    function paint(){ if(!x) return; x.clearRect(0, 0, c.width, c.height); strokes.forEach(function(s){ x.strokeStyle = s.c; x.lineWidth = 5; x.lineCap = x.lineJoin = 'round'; x.beginPath(); s.p.forEach(function(p, i){ if(i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.stroke(); }); }
    function pos(e){ var r = c.getBoundingClientRect(); return [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; }
    c.addEventListener('pointerdown', function(e){ c.setPointerCapture(e.pointerId); curS = {c:col, p:[pos(e)]}; strokes.push(curS); });
    c.addEventListener('pointermove', function(e){ if(curS){ curS.p.push(pos(e)); paint(); } });
    c.addEventListener('pointerup', function(){ curS = null; });
    setTimeout(setup, 80);
    UI.dialog({title:'Nueva firma', body:body, wide:true, buttons:[{t:'Cancelar', v:null}, {t:'Guardar firma', cls:'primary', v:function(){
      if(!strokes.length) return null;
      // recorta a la tinta
      var mx = 1e9, my = 1e9, Mx = 0, My = 0;
      strokes.forEach(function(s){ s.p.forEach(function(p){ mx = Math.min(mx, p[0]); my = Math.min(my, p[1]); Mx = Math.max(Mx, p[0]); My = Math.max(My, p[1]); }); });
      var pad = 8, o = document.createElement('canvas'); o.width = Mx - mx + pad * 2; o.height = My - my + pad * 2;
      o.getContext('2d').drawImage(c, mx - pad, my - pad, o.width, o.height, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    }}]}).then(function(d){ if(d){ var a = sigs(); a.unshift(d); saveSigs(a.slice(0, 6)); } res(d); });
  });
}
function chooseSignature(){
  var list = sigs();
  if(!list.length) return signaturePad();
  return new Promise(function(res){
    var body = h('div');
    var rec;
    list.forEach(function(s, i){
      var row = h('div', {class:'row', style:'border:1px solid var(--border);border-radius:12px;padding:8px;margin-bottom:8px;background:#fff'});
      row.appendChild(h('button', {class:'grow', style:'text-align:left', html:'<img src="' + s + '" style="max-height:70px;max-width:100%">', onclick:function(){ res(s); done(); }}));
      row.appendChild(h('button', {class:'tb', style:'color:var(--danger)', html:icon('trash'), onclick:function(){ list.splice(i, 1); saveSigs(list); row.remove(); }}));
      body.appendChild(row);
    });
    function done(){ var b = document.querySelector('.layer:last-child .btns button'); if(b) b.click(); }
    UI.dialog({title:'Elige una firma', body:body, buttons:[{t:'Cancelar', v:'x'}, {t:'Nueva firma', v:'new', cls:'primary'}]}).then(function(v){ if(v === 'new') signaturePad().then(res); else if(v === 'x') res(null); });
  });
}

/* ---------- lector ---------- */
function open(path, opts){
  var v = Viewers.shell(path);
  var st = {doc:null, ab:null, scale:1, fit:true, pages:[], ann:{}, undo:[], redo:[], tool:null, color:'#E5484D', width:3, night:false, dirty:false, texts:{}, hits:[], hi:-1};
  var wrap = h('div', {class:'pdfwrap'});
  var thumbs = h('div', {class:'pdfthumbs'});
  var pagesEl = h('div', {class:'pdfpages'});
  var right = h('div', {style:'flex:1;min-width:0;display:flex;flex-direction:column;position:relative'});
  var findbar = h('div', {class:'findbar hidden'});
  right.appendChild(findbar); right.appendChild(pagesEl);
  var pgnum = h('div', {class:'pgnum hidden'}); right.appendChild(pgnum);
  wrap.appendChild(thumbs); wrap.appendChild(right);
  v.body.style.overflow = 'hidden';
  v.body.appendChild(wrap);
  pagesEl.innerHTML = '<div class="spin" style="margin-top:80px"></div>';
  try { if(localStorage.getItem('archivero_pdfthumbs') === '0') thumbs.style.display = 'none'; } catch(e){}

  bytes(path).then(function(ab){ st.ab = ab; return loadDoc(ab, VFS.base(path)); }).then(function(doc){
    st.doc = doc;
    Viewers.setTitle(path, doc.numPages + ' página' + (doc.numPages > 1 ? 's' : ''));
    return Promise.all(Array.from({length:doc.numPages}, function(_, i){ return doc.getPage(i + 1).then(function(p){ return p; }); }));
  }).then(function(pgs){
    st.pages = pgs.map(function(p){ var vp = p.getViewport({scale:1}); return {p:p, w:vp.width, h:vp.height, el:null, rendered:0}; });
    build();
    if(opts && opts.tool){ enterAnnotate(true); setTool(opts.tool); UI.toast(opts.tool === 'redact' ? 'Arrastra sobre lo que quieras censurar; al guardar se borra de verdad' : 'Tapa en blanco lo que quieras cambiar y escribe encima con «Texto»', 4500); }
    Meta.get(path).then(function(m){ if(m.pos && m.pos > 1 && m.pos <= st.pages.length){ goPage(m.pos, true); UI.toast('Página ' + m.pos); } });
  }).catch(function(e){ pagesEl.innerHTML = '<div class="empty" style="color:#fff">No se pudo abrir el PDF: ' + esc(e.message || e) + '</div>'; });

  function fitScale(){ var w = pagesEl.clientWidth - (UI.isPhone() ? 12 : 48); var mw = Math.max.apply(null, st.pages.map(function(p){ return p.w; })); return Math.min(3, w / mw); }
  var io;
  function build(){
    pagesEl.innerHTML = '';
    if(st.fit) st.scale = fitScale();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    io = new IntersectionObserver(function(ents){ ents.forEach(function(en){ var i = +en.target.getAttribute('data-i'); if(en.isIntersecting) renderPage(i); }); }, {root:pagesEl, rootMargin:'600px 0px'});
    st.pages.forEach(function(pg, i){
      var el = h('div', {class:'pg' + (st.night ? ' night' : ''), 'data-i':i, style:'width:' + pg.w * st.scale + 'px;height:' + pg.h * st.scale + 'px'});
      var c = h('canvas'), tl = h('div', {class:'tl'}), an = h('canvas', {class:'ann'});
      el.appendChild(c); el.appendChild(tl); el.appendChild(an);
      el.appendChild(h('div', {class:'num', text:i + 1}));
      pg.el = el; pg.c = c; pg.tl = tl; pg.an = an; pg.rendered = 0;
      pagesEl.appendChild(el);
      io.observe(el);
      bindDraw(pg, i);
    });
    buildThumbs();
  }
  var renderTasks = {};
  function renderPage(i){
    var pg = st.pages[i]; if(!pg || pg.rendered === st.scale) return;
    pg.rendered = st.scale;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), vp = pg.p.getViewport({scale:st.scale * dpr});
    if(renderTasks[i]) renderTasks[i].cancel();
    var c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    var t = pg.p.render({canvasContext:c.getContext('2d'), viewport:vp});
    renderTasks[i] = t;
    t.promise.then(function(){ delete renderTasks[i]; pg.el.replaceChild(c, pg.c); pg.c = c; }).catch(function(){});
    pg.an.width = pg.w * st.scale * dpr; pg.an.height = pg.h * st.scale * dpr;
    paintAnn(i);
    textLayer(i);
  }
  function textLayer(i){
    var pg = st.pages[i];
    getText(i).then(function(tc){
      var vp = pg.p.getViewport({scale:st.scale}), frag = document.createDocumentFragment();
      pg.tl.innerHTML = '';
      tc.items.forEach(function(it, k){
        if(!it.str) return;
        var tx = pdfjsLib.Util.transform(vp.transform, it.transform);
        var fh = Math.hypot(tx[2], tx[3]);
        var s = document.createElement('span');
        s.textContent = it.str; s.setAttribute('data-k', k);
        s.style.left = tx[4] + 'px'; s.style.top = (tx[5] - fh) + 'px'; s.style.fontSize = fh + 'px'; s.style.fontFamily = 'sans-serif';
        if(it.width){ s._w = it.width * st.scale; }
        frag.appendChild(s);
      });
      pg.tl.appendChild(frag);
      // ajustar ancho de cada trozo para que la selección coincida
      Array.prototype.forEach.call(pg.tl.children, function(s){ if(s._w && s.offsetWidth){ var k = s._w / s.offsetWidth; s.style.transform = 'scaleX(' + k + ')'; } });
      markHits(i);
    });
  }
  function getText(i){ if(!st.texts[i]) st.texts[i] = st.pages[i].p.getTextContent(); return st.texts[i]; }
  function rezoom(s, keep){
    var top = pagesEl.scrollTop / Math.max(1, pagesEl.scrollHeight);
    st.fit = false; st.scale = Math.max(0.3, Math.min(5, s));
    st.pages.forEach(function(pg){ pg.el.style.width = pg.w * st.scale + 'px'; pg.el.style.height = pg.h * st.scale + 'px'; pg.rendered = 0; pg.tl.innerHTML = ''; });
    pagesEl.scrollTop = top * pagesEl.scrollHeight;
    // reobservar para dibujar las visibles
    st.pages.forEach(function(pg){ io.unobserve(pg.el); io.observe(pg.el); });
  }
  function curPage(){
    var mid = pagesEl.scrollTop + pagesEl.clientHeight / 3, n = 1;
    for(var i = 0; i < st.pages.length; i++){ if(st.pages[i].el.offsetTop <= mid) n = i + 1; else break; }
    return n;
  }
  function goPage(n, instant){ var pg = st.pages[n - 1]; if(pg) pagesEl.scrollTo({top:pg.el.offsetTop - 10, behavior:instant ? 'auto' : 'smooth'}); }
  var hideT, posT;
  pagesEl.addEventListener('scroll', function(){
    if(!st.pages.length) return;
    var n = curPage();
    pgnum.textContent = n + ' / ' + st.pages.length; pgnum.classList.remove('hidden');
    clearTimeout(hideT); hideT = setTimeout(function(){ pgnum.classList.add('hidden'); }, 1200);
    clearTimeout(posT); posT = setTimeout(function(){ Meta.patch(path, {pos:n}); markThumb(n); }, 300);
  });
  pagesEl.addEventListener('wheel', function(e){ if(e.ctrlKey || e.metaKey){ e.preventDefault(); rezoom(st.scale * (e.deltaY < 0 ? 1.08 : 0.93)); } }, {passive:false});
  // pellizcar en iPhone/iPad (eventos de gesto de Safari)
  var g0 = 1;
  pagesEl.addEventListener('gesturestart', function(e){ e.preventDefault(); g0 = st.scale; });
  pagesEl.addEventListener('gesturechange', function(e){ e.preventDefault(); pagesEl.style.transformOrigin = 'center top'; pagesEl.style.transform = 'scale(' + e.scale + ')'; });
  pagesEl.addEventListener('gestureend', function(e){ e.preventDefault(); pagesEl.style.transform = ''; rezoom(g0 * e.scale); });
  var rT; window.addEventListener('resize', onResize);
  function onResize(){ clearTimeout(rT); rT = setTimeout(function(){ if(st.fit && st.pages.length){ st.scale = fitScale(); rezoom(st.scale); st.fit = true; } }, 200); }
  v.cleanup.push(function(){ window.removeEventListener('resize', onResize); if(st.doc) st.doc.destroy(); });

  /* miniaturas */
  function buildThumbs(){
    thumbs.innerHTML = '';
    var tio = new IntersectionObserver(function(ents){ ents.forEach(function(en){ if(!en.isIntersecting) return; tio.unobserve(en.target); var i = +en.target.getAttribute('data-i'), pg = st.pages[i];
      var vp = pg.p.getViewport({scale:200 / pg.w}), c = en.target.querySelector('canvas'); c.width = vp.width; c.height = vp.height; pg.p.render({canvasContext:c.getContext('2d'), viewport:vp}); }); }, {root:thumbs, rootMargin:'400px'});
    st.pages.forEach(function(pg, i){
      var t = h('div', {class:'pt' + (i ? '' : ' cur'), 'data-i':i, onclick:function(){ goPage(i + 1); }});
      t.appendChild(h('canvas', {style:'aspect-ratio:' + pg.w + '/' + pg.h})); t.appendChild(h('div', {text:i + 1}));
      thumbs.appendChild(t); tio.observe(t);
    });
  }
  function markThumb(n){ UI.$$('.pt', thumbs).forEach(function(t, i){ t.classList.toggle('cur', i === n - 1); }); var c = thumbs.children[n - 1]; if(c && thumbs.offsetParent){ var r = c.getBoundingClientRect(), R = thumbs.getBoundingClientRect(); if(r.top < R.top || r.bottom > R.bottom) c.scrollIntoView({block:'center'}); } }

  /* búsqueda */
  var fq = h('input', {class:'field grow', style:'height:34px', placeholder:'Buscar en el documento', type:'search'});
  var fcount = h('span', {class:'muted', style:'font-size:12.5px;white-space:nowrap'});
  findbar.appendChild(fq); findbar.appendChild(fcount);
  findbar.appendChild(h('button', {class:'tb', html:icon('back'), style:'transform:rotate(90deg)', onclick:function(){ stepHit(-1); }}));
  findbar.appendChild(h('button', {class:'tb', html:icon('chev'), style:'transform:rotate(90deg)', onclick:function(){ stepHit(1); }}));
  findbar.appendChild(h('button', {class:'tb', html:icon('x'), onclick:function(){ findbar.classList.add('hidden'); st.q = ''; st.hits = []; st.pages.forEach(function(p, i){ markHits(i); }); }}));
  var fT;
  fq.addEventListener('input', function(){ clearTimeout(fT); fT = setTimeout(doFind, 250); });
  fq.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); stepHit(e.shiftKey ? -1 : 1); } });
  function norm(s){ return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function doFind(){
    var q = norm(fq.value.trim()); st.q = q; st.hits = []; st.hi = -1;
    if(!q){ fcount.textContent = ''; st.pages.forEach(function(p, i){ markHits(i); }); return; }
    fcount.textContent = 'Buscando…';
    Promise.all(st.pages.map(function(p, i){ return getText(i); })).then(function(all){
      all.forEach(function(tc, i){ tc.items.forEach(function(it, k){ if(it.str && norm(it.str).indexOf(q) >= 0) st.hits.push({i:i, k:k}); }); });
      fcount.textContent = st.hits.length ? st.hits.length + ' resultados' : 'Sin resultados';
      st.pages.forEach(function(p, i){ markHits(i); });
      if(st.hits.length) stepHit(1);
    });
  }
  function markHits(i){
    var pg = st.pages[i]; if(!pg || !pg.tl) return;
    var set = {}; st.hits.forEach(function(x, j){ if(x.i === i) set[x.k] = j; });
    Array.prototype.forEach.call(pg.tl.children, function(s){ var k = s.getAttribute('data-k'); s.classList.toggle('hit', k in set); s.classList.toggle('cur', k in set && set[k] === st.hi); });
  }
  function stepHit(d){
    if(!st.hits.length) return;
    var prev = st.hits[st.hi];
    st.hi = (st.hi + d + st.hits.length) % st.hits.length;
    var x = st.hits[st.hi];
    fcount.textContent = (st.hi + 1) + ' de ' + st.hits.length;
    if(prev) markHits(prev.i);
    var pg = st.pages[x.i];
    renderPage(x.i);
    setTimeout(function(){
      markHits(x.i);
      var s = pg.tl.querySelector('[data-k="' + x.k + '"]');
      pagesEl.scrollTo({top:pg.el.offsetTop + (s ? s.offsetTop : 0) - pagesEl.clientHeight / 3, behavior:'smooth'});
    }, 120);
  }

  /* anotaciones */
  function A(i){ return st.ann[i] || (st.ann[i] = []); }
  function paintAnn(i){
    var pg = st.pages[i], c = pg.an, x = c.getContext('2d'), W = c.width, H = c.height;
    x.clearRect(0, 0, W, H);
    drawAnn(x, A(i), W, H);
  }
  var imgCache = {};
  function drawAnn(x, list, W, H){
    list.forEach(function(o){
      x.save();
      if(o.t === 'pen' || o.t === 'hl'){
        x.strokeStyle = o.c; x.lineWidth = o.w * W; x.lineCap = x.lineJoin = o.t === 'hl' ? 'butt' : 'round';
        if(o.t === 'hl'){ x.globalAlpha = .35; x.globalCompositeOperation = 'multiply'; }
        x.beginPath(); o.pts.forEach(function(p, k){ if(k) x.lineTo(p[0] * W, p[1] * H); else x.moveTo(p[0] * W, p[1] * H); }); x.stroke();
      } else if(o.t === 'redact' || o.t === 'white'){
        x.fillStyle = o.t === 'redact' ? '#000' : '#fff';
        x.fillRect(Math.min(o.x, o.x + o.dx) * W, Math.min(o.y, o.y + o.dy) * H, Math.abs(o.dx) * W, Math.abs(o.dy) * H);
      } else if(o.t === 'rect' || o.t === 'oval' || o.t === 'arrow' || o.t === 'line'){
        x.strokeStyle = o.c; x.lineWidth = o.w * W; x.lineCap = 'round';
        var X = o.x * W, Y = o.y * H, X2 = (o.x + o.dx) * W, Y2 = (o.y + o.dy) * H;
        x.beginPath();
        if(o.t === 'rect') x.rect(X, Y, X2 - X, Y2 - Y);
        else if(o.t === 'oval') x.ellipse((X + X2) / 2, (Y + Y2) / 2, Math.abs(X2 - X) / 2, Math.abs(Y2 - Y) / 2, 0, 0, Math.PI * 2);
        else { x.moveTo(X, Y); x.lineTo(X2, Y2); if(o.t === 'arrow'){ var a = Math.atan2(Y2 - Y, X2 - X), L = Math.max(10, o.w * W * 5); x.moveTo(X2, Y2); x.lineTo(X2 - L * Math.cos(a - .45), Y2 - L * Math.sin(a - .45)); x.moveTo(X2, Y2); x.lineTo(X2 - L * Math.cos(a + .45), Y2 - L * Math.sin(a + .45)); } }
        x.stroke();
      } else if(o.t === 'text'){
        x.fillStyle = o.c; x.font = (o.size * W) + 'px -apple-system,Helvetica,Arial,sans-serif'; x.textBaseline = 'top';
        o.s.split('\n').forEach(function(line, k){ x.fillText(line, o.x * W, o.y * H + k * o.size * W * 1.25); });
      } else if(o.t === 'note'){
        var s = 0.035 * W; x.fillStyle = '#F5C518'; x.strokeStyle = '#a07c00'; x.lineWidth = 1;
        x.fillRect(o.x * W, o.y * H, s, s); x.strokeRect(o.x * W, o.y * H, s, s);
        x.fillStyle = '#5a4500'; x.font = 'bold ' + (s * .7) + 'px sans-serif'; x.textBaseline = 'middle'; x.fillText('✎', o.x * W + s * .15, o.y * H + s * .55);
      } else if(o.t === 'img'){
        var im = imgCache[o.src];
        if(!im){ im = imgCache[o.src] = new Image(); im.onload = function(){ st.pages.forEach(function(p, i){ if(p.rendered) paintAnn(i); }); }; im.src = o.src; }
        if(im.complete) x.drawImage(im, o.x * W, o.y * H, o.w2 * W, o.h2 * H);
      }
      x.restore();
    });
  }
  function hitTest(i, px, py){
    var list = A(i), pg = st.pages[i], ar = pg.h / pg.w;
    for(var k = list.length - 1; k >= 0; k--){
      var o = list[k], tol = 0.015;
      if(o.pts){ for(var j = 0; j < o.pts.length; j++){ if(Math.abs(o.pts[j][0] - px) < tol + o.w && Math.abs(o.pts[j][1] - py) < (tol + o.w) / ar) return k; } }
      else if(o.t === 'img'){ if(px >= o.x && px <= o.x + o.w2 && py >= o.y && py <= o.y + o.h2) return k; }
      else if(o.t === 'text'){ var lines = o.s.split('\n'); if(px >= o.x - tol && px <= o.x + o.size * Math.max.apply(null, lines.map(function(l){ return l.length; })) * .6 && py >= o.y - tol && py <= o.y + o.size * lines.length * 1.25 / ar) return k; }
      else if(o.t === 'note'){ if(px >= o.x && px <= o.x + .035 && py >= o.y && py <= o.y + .035 / ar) return k; }
      else if('dx' in o){ var x1 = Math.min(o.x, o.x + o.dx) - tol, x2 = Math.max(o.x, o.x + o.dx) + tol, y1 = Math.min(o.y, o.y + o.dy) - tol, y2 = Math.max(o.y, o.y + o.dy) + tol; if(px >= x1 && px <= x2 && py >= y1 && py <= y2) return k; }
    }
    return -1;
  }
  function push(i, o){ A(i).push(o); st.undo.push({i:i, add:o}); st.redo = []; st.dirty = true; paintAnn(i); syncUndo(); }
  function bindDraw(pg, i){
    var an = pg.an, curO = null, start = null, moving = null;
    function pos(e){ var r = an.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    an.addEventListener('pointerdown', function(e){
      if(!st.tool) return;
      if(e.pointerType === 'touch' && st.pencilOnly) return;
      e.preventDefault(); an.setPointerCapture(e.pointerId);
      var p = pos(e), t = st.tool;
      if(t === 'eraser'){ var k = hitTest(i, p[0], p[1]); if(k >= 0){ var o = A(i).splice(k, 1)[0]; st.undo.push({i:i, del:o, at:k}); st.redo = []; st.dirty = true; paintAnn(i); syncUndo(); } return; }
      if(t === 'move'){ var k2 = hitTest(i, p[0], p[1]); if(k2 >= 0){ moving = {o:A(i)[k2], p:p, orig:JSON.stringify(A(i)[k2])}; } return; }
      if(t === 'text') return addText(i, p);
      if(t === 'note') return addNote(i, p);
      if(t === 'sign') return addSign(i, p);
      var w = st.width / 1000 * (t === 'hl' ? 6 : 1);
      if(t === 'pen' || t === 'hl'){ curO = {t:t, c:t === 'hl' ? st.hlColor || '#FFE500' : st.color, w:w, pts:[p]}; A(i).push(curO); }
      else { curO = {t:t, c:st.color, w:w, x:p[0], y:p[1], dx:0, dy:0}; A(i).push(curO); }
      start = p;
    });
    an.addEventListener('pointermove', function(e){
      if(moving){ var p = pos(e), o = moving.o, dx = p[0] - moving.p[0], dy = p[1] - moving.p[1]; moving.p = p;
        if(o.pts) o.pts = o.pts.map(function(q){ return [q[0] + dx, q[1] + dy]; }); else { o.x += dx; o.y += dy; } paintAnn(i); return; }
      if(!curO) return;
      var p2 = pos(e);
      if(curO.pts){
        if(curO.t === 'hl' && curO.pts.length > 1 && !e.shiftKey){ curO.pts = [curO.pts[0], [p2[0], curO.pts[0][1] + (Math.abs(p2[1] - curO.pts[0][1]) > .02 ? p2[1] - curO.pts[0][1] : 0)]]; }
        else curO.pts.push(p2);
      } else { curO.dx = p2[0] - start[0]; curO.dy = p2[1] - start[1]; }
      paintAnn(i);
    });
    function up(){
      if(moving){ if(JSON.stringify(moving.o) !== moving.orig){ st.undo.push({i:i, moved:moving.o, from:JSON.parse(moving.orig)}); st.dirty = true; syncUndo(); } moving = null; return; }
      if(!curO) return;
      A(i).pop();
      if((curO.pts && curO.pts.length > 1) || (!curO.pts && (Math.abs(curO.dx) > .005 || Math.abs(curO.dy) > .005))) push(i, curO);
      else if(curO.pts && curO.pts.length === 1){ curO.pts.push([curO.pts[0][0] + .001, curO.pts[0][1]]); push(i, curO); }
      curO = null; paintAnn(i);
    }
    an.addEventListener('pointerup', up); an.addEventListener('pointercancel', up);
  }
  function addText(i, p){
    var ta = h('textarea', {class:'field', rows:3, placeholder:'Escribe el texto'});
    var sz = h('select', {class:'field', style:'margin-top:8px'}); [['0.016', 'Pequeño'], ['0.022', 'Normal'], ['0.032', 'Grande'], ['0.045', 'Muy grande']].forEach(function(o){ sz.appendChild(h('option', {value:o[0], text:o[1]})); }); sz.value = '0.022';
    UI.dialog({title:'Texto', body:h('div', {}, [ta, sz]), buttons:[{t:'Cancelar', v:null}, {t:'Agregar', cls:'primary', v:function(){ return ta.value; }}]}).then(function(s){
      if(s && s.trim()) push(i, {t:'text', x:p[0], y:p[1], s:s, c:st.color, size:+sz.value});
    });
  }
  function addNote(i, p){
    UI.prompt('Nota', '', {placeholder:'Comentario'}).then(function(s){ if(s) push(i, {t:'note', x:p[0], y:p[1], s:s}); });
  }
  function addSign(i, p){
    chooseSignature().then(function(src){
      if(!src) return;
      UI.loadImage(src).then(function(im){
        var pg = st.pages[i], w = 0.28, hh = w * (im.naturalHeight / im.naturalWidth) * (pg.w / pg.h);
        push(i, {t:'img', src:src, x:Math.min(1 - w, p[0]), y:Math.min(1 - hh, p[1]), w2:w, h2:hh});
        setTool('move'); UI.toast('Arrastra la firma para ubicarla');
      });
    });
  }
  // tocar una nota la muestra
  pagesEl.addEventListener('click', function(e){
    if(st.tool) return;
    var el = e.target.closest('.pg'); if(!el) return;
    var i = +el.getAttribute('data-i'), r = el.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    var k = hitTest(i, px, py), o = k >= 0 ? A(i)[k] : null;
    if(o && o.t === 'note') UI.alert('Nota', o.s);
  });

  /* barras */
  var undoB, redoB, drawTools = [], toolBtns = {};
  function syncUndo(){ if(undoB){ undoB.disabled = !st.undo.length; redoB.disabled = !st.redo.length; } }
  function doUndo(){
    var u = st.undo.pop(); if(!u) return;
    if(u.add){ var l = A(u.i); l.splice(l.lastIndexOf(u.add), 1); }
    else if(u.del) A(u.i).splice(u.at, 0, u.del);
    else if(u.moved){ var cur2 = JSON.stringify(u.moved); for(var k in u.from) u.moved[k] = u.from[k]; u.from = JSON.parse(cur2); }
    st.redo.push(u); st.dirty = true; paintAnn(u.i); syncUndo();
  }
  function doRedo(){
    var u = st.redo.pop(); if(!u) return;
    if(u.add) A(u.i).push(u.add);
    else if(u.del){ var l = A(u.i); l.splice(l.indexOf(u.del), 1); }
    else if(u.moved){ var cur2 = JSON.stringify(u.moved); for(var k in u.from) u.moved[k] = u.from[k]; u.from = JSON.parse(cur2); }
    st.undo.push(u); paintAnn(u.i); syncUndo();
  }
  function setTool(t){
    st.tool = st.tool === t ? null : t;
    for(var k in toolBtns) toolBtns[k].classList.toggle('on', k === st.tool);
    v.body.classList.toggle('drawing', !!st.tool);
    pagesEl.style.touchAction = st.tool && st.tool !== 'move' ? 'none' : '';
  }
  var annMode = false, readTools = [];
  function enterAnnotate(on){
    annMode = on;
    v.tools.innerHTML = '';
    if(!on){ setTool(null); readBar(); return; }
    v.tools.classList.remove('hidden');
    [['pen', 'pen', 'Lápiz'], ['hl', 'hl', 'Resaltador'], ['text', 'type', 'Texto'], ['note', 'note', 'Nota'], ['rect', 'rect', 'Rectángulo'], ['oval', 'checkc', 'Óvalo'], ['arrow', 'arrow', 'Flecha'], ['sign', 'sign', 'Firma'], ['white', 'edit', 'Corrector (tapar en blanco)'], ['redact', 'lock', 'Censurar (tapar en negro)'], ['eraser', 'eraser', 'Borrador'], ['move', 'move', 'Mover']].forEach(function(t){
      toolBtns[t[0]] = Viewers.tool(t[1], t[2], function(){ setTool(t[0]); });
    });
    Viewers.sep();
    var cols = ['#E5484D', '#F76B15', '#E8B90C', '#30A46C', '#0091FF', '#8E4EC6', '#111111', '#FFFFFF'];
    cols.forEach(function(c){ var b = h('button', {class:'swatch' + (c === st.color ? ' on' : ''), style:'background:' + c, title:'Color', onclick:function(){ st.color = c; st.hlColor = c === '#111111' || c === '#FFFFFF' ? '#FFE500' : c; UI.$$('.swatch', v.tools).forEach(function(x){ x.classList.remove('on'); }); b.classList.add('on'); }}); v.tools.appendChild(b); });
    var wsel = h('select', {class:'field', style:'height:32px;width:auto;font-size:13px;margin-left:6px'});
    [[1.5, 'Fino'], [3, 'Medio'], [6, 'Grueso']].forEach(function(o){ wsel.appendChild(h('option', {value:o[0], text:o[1]})); });
    wsel.value = st.width; wsel.onchange = function(){ st.width = +wsel.value; };
    v.tools.appendChild(wsel);
    Viewers.sep();
    undoB = Viewers.tool('undo', 'Deshacer', doUndo); redoB = Viewers.tool('redo', 'Rehacer', doRedo); syncUndo();
    var done = h('button', {class:'btn', style:'margin-left:8px;padding:8px 14px', text:'Listo', onclick:function(){ enterAnnotate(false); }});
    v.tools.appendChild(done);
    setTool('pen');
  }
  function readBar(){
    v.tools.innerHTML = '';
    Viewers.tool('pen', 'Anotar y firmar', function(){ enterAnnotate(true); });
    Viewers.tool('search', 'Buscar', function(){ findbar.classList.remove('hidden'); fq.focus(); });
    Viewers.tool('zout', 'Alejar', function(){ rezoom(st.scale / 1.2); });
    Viewers.tool('zin', 'Acercar', function(){ rezoom(st.scale * 1.2); });
    Viewers.tool('pages', 'Ajustar al ancho', function(){ st.fit = true; rezoom(fitScale()); st.fit = true; });
    Viewers.sep();
    Viewers.tool('book', 'Índice', outline);
    Viewers.tool('moon', 'Modo noche', function(e){ st.night = !st.night; e.currentTarget.classList.toggle('on', st.night); st.pages.forEach(function(p){ p.el.classList.toggle('night', st.night); }); });
    Viewers.tool('speak', 'Leer en voz alta', function(e){ var b = e.currentTarget; if(window.speechSynthesis && speechSynthesis.speaking){ Viewers.speak('', b); return; } var n = curPage() - 1; Promise.all(st.pages.slice(n, n + 15).map(function(p, k){ return getText(n + k); })).then(function(all){ Viewers.speak(all.map(function(tc){ return tc.items.map(function(it){ return it.str; }).join(' '); }).join(' '), b); }); });
    Viewers.tool('grid', 'Organizar páginas', function(){ saveIfDirty().then(function(){ Viewers.close(); pages(path); }); });
    if(!UI.isPhone()) Viewers.tool('list', 'Miniaturas', function(){ var on = thumbs.style.display === 'none'; thumbs.style.display = on ? '' : 'none'; try { localStorage.setItem('archivero_pdfthumbs', on ? '1' : '0'); } catch(e){} onResize(); });
  }
  Viewers.act('search', 'Buscar', function(){ findbar.classList.remove('hidden'); fq.focus(); });
  Viewers.act('more', 'Más', function(e){
    UI.menu([
      {t:'Ir a la página…', i:'pages', fn:function(){ UI.prompt('Ir a la página', '' + curPage(), {inputmode:'numeric', msg:'1 a ' + st.pages.length}).then(function(n){ if(n) goPage(Math.max(1, Math.min(st.pages.length, +n || 1))); }); }},
      {t:'Rellenar formulario', i:'edit', fn:function(){ saveIfDirty().then(function(){ fillForm(path); }); }},
      {t:'Guardar anotaciones', i:'download', fn:function(){ save(false); }},
      {t:'Guardar como copia', i:'dup', fn:function(){ save(true); }},
      {t:'Extraer texto', i:'text', fn:extractText},
      {t:'Exportar páginas como imágenes', i:'image', fn:exportImages},
      {t:'Reducir tamaño', i:'zip', fn:function(){ Tools.compressPdf(path); }},
      {t:'Imprimir', i:'print', fn:printPdf},
      '-',
      {t:'Compartir', i:'share', fn:function(){ saveIfDirty().then(function(){ App.sharePaths([path]); }); }},
      {t:VFS.native ? 'Exportar…' : 'Guardar en Archivos / Descargar', i:'download', fn:function(){ saveIfDirty().then(function(){ App.exportPath(path); }); }},
      {t:'Información', i:'info', fn:docInfo},
      VFS.native ? {t:'Abrir en Vista Previa', i:'finder', fn:function(){ VFS.bridge({op:'openExternal', path:path}); }} : null
    ], e.currentTarget, VFS.base(path));
  });
  readBar();
  v.dirty = function(){ return st.dirty; };
  v.save = function(){ return save(false); };
  v.key = function(e){
    if(annMode && (e.metaKey || e.ctrlKey) && e.key === 'z'){ e.preventDefault(); if(e.shiftKey) doRedo(); else doUndo(); return; }
    if(e.key === 'ArrowRight' || e.key === 'PageDown'){ goPage(curPage() + 1); } else if(e.key === 'ArrowLeft' || e.key === 'PageUp'){ goPage(curPage() - 1); }
    else if((e.metaKey || e.ctrlKey) && e.key === 'f'){ e.preventDefault(); findbar.classList.remove('hidden'); fq.focus(); }
    else if((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')){ e.preventDefault(); rezoom(st.scale * 1.2); }
    else if((e.metaKey || e.ctrlKey) && e.key === '-'){ e.preventDefault(); rezoom(st.scale / 1.2); }
  };

  function saveIfDirty(){ return st.dirty ? save(false) : Promise.resolve(); }
  function save(copy){
    UI.busy('Guardando PDF…');
    return plib().then(function(P){ return P.PDFDocument.load(st.ab, {ignoreEncryption:true}); }).then(function(pdf){
      var pages = pdf.getPages(), c = Promise.resolve();
      Object.keys(st.ann).forEach(function(k){
        var list = st.ann[k]; if(!list || !list.length) return;
        var i = +k, pg = st.pages[i], P = pages[i];
        if(list.some(function(o){ return o.t === 'redact'; })){
          // censura segura: la página se reemplaza por una imagen, así el texto tapado deja de existir
          c = c.then(function(){
            var vp = pg.p.getViewport({scale:2.2}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
            return pg.p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){
              drawAnn(cv.getContext('2d'), list.filter(function(o){ return o.t !== 'note'; }), cv.width, cv.height);
              return UI.canvasBlob(cv, 'image/jpeg', .9);
            }).then(function(b){ return b.arrayBuffer(); }).then(function(jpg){ return pdf.embedJpg(jpg); }).then(function(img){
              pdf.removePage(i); var np = pdf.insertPage(i, [pg.w, pg.h]); np.drawImage(img, {x:0, y:0, width:pg.w, height:pg.h});
            });
          });
          return;
        }
        c = c.then(function(){
          var S = 2.5, cv = document.createElement('canvas'); cv.width = Math.round(pg.w * S); cv.height = Math.round(pg.h * S);
          return Promise.all(list.filter(function(o){ return o.t === 'img'; }).map(function(o){ return imgCache[o.src] && imgCache[o.src].complete ? null : UI.loadImage(o.src).then(function(im){ imgCache[o.src] = im; }); })).then(function(){
            drawAnn(cv.getContext('2d'), list.filter(function(o){ return o.t !== 'note'; }), cv.width, cv.height);
            return UI.canvasBlob(cv, 'image/png');
          }).then(function(b){ return b.arrayBuffer(); }).then(function(png){ return pdf.embedPng(png); }).then(function(img){
            var rot = ((P.getRotation().angle % 360) + 360) % 360, box = P.getCropBox ? P.getCropBox() : P.getMediaBox(), W = box.width, H = box.height, ox = box.x, oy = box.y;
            var o = {width:rot % 180 ? H : W, height:rot % 180 ? W : H, rotate:PDFLib.degrees(rot)};
            if(rot === 0){ o.x = ox; o.y = oy; } else if(rot === 90){ o.x = ox + W; o.y = oy; } else if(rot === 180){ o.x = ox + W; o.y = oy + H; } else { o.x = ox; o.y = oy + H; }
            P.drawImage(img, o);
          });
        });
      });
      return c.then(function(){ return pdf.save(); });
    }).then(function(out){
      var dst = copy ? VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' anotado.pdf')) : Promise.resolve(path);
      return dst.then(function(p){ return VFS.write(p, new Blob([out], {type:'application/pdf'})).then(function(){ return p; }); });
    }).then(function(p){
      UI.busy(false); UI.toast(copy ? 'Guardado como ' + VFS.base(p) : 'PDF guardado');
      if(!copy){ st.dirty = false; Viewers.close(); open(path); }
      else st.dirty = false;
    }).catch(UI.fail);
  }
  function outline(){
    st.doc.getOutline().then(function(o){
      if(!o || !o.length){ UI.toast('Este PDF no tiene índice'); return; }
      var body = h('div', {style:'max-height:60vh;overflow:auto'});
      function add(items, lvl){ items.forEach(function(it){
        body.appendChild(h('button', {class:'mi', style:'padding-left:' + (12 + lvl * 16) + 'px', html:'<span class="ell">' + esc(it.title) + '</span>', onclick:function(){
          var d = typeof it.dest === 'string' ? st.doc.getDestination(it.dest) : Promise.resolve(it.dest);
          d.then(function(dest){ if(!dest) return; return st.doc.getPageIndex(dest[0]); }).then(function(ix){ if(ix != null){ goPage(ix + 1); document.querySelector('.layer:last-child .btns button').click(); } }).catch(function(){});
        }}));
        if(it.items && it.items.length) add(it.items, lvl + 1);
      }); }
      add(o, 0);
      UI.dialog({title:'Índice', body:body, buttons:[{t:'Cerrar', v:true}]});
    });
  }
  function extractText(){
    UI.busy('Extrayendo texto…');
    Promise.all(st.pages.map(function(p, i){ return getText(i); })).then(function(all){
      var t = all.map(function(tc, i){
        var out = '', lastY = null;
        tc.items.forEach(function(it){ var y = it.transform[5]; if(lastY != null && Math.abs(y - lastY) > 2) out += '\n'; else if(out && !/\s$/.test(out)) out += ' '; out += it.str; lastY = y; });
        return out.trim();
      }).join('\n\n');
      UI.busy(false);
      if(!t.trim()){ UI.confirm('Sin texto', 'Este PDF parece escaneado. ¿Quieres reconocer el texto con OCR?', 'Usar OCR').then(function(ok){ if(ok) Tools.ocrPdf(path); }); return; }
      return VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + '.txt')).then(function(p){ return VFS.write(p, new Blob([t], {type:'text/plain'})).then(function(){ UI.toast('Guardado ' + VFS.base(p)); }); });
    }).catch(UI.fail);
  }
  function exportImages(){
    UI.busy('Exportando…');
    var dir;
    VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' (imágenes)')).then(function(d){ dir = d; return VFS.mkdir(d); }).then(function(){
      var c = Promise.resolve();
      st.pages.forEach(function(pg, i){ c = c.then(function(){
        UI.busy('Exportando página ' + (i + 1) + ' de ' + st.pages.length);
        var vp = pg.p.getViewport({scale:2}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        return pg.p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){ var x = cv.getContext('2d'); drawAnn(x, A(i), cv.width, cv.height); return UI.canvasBlob(cv, 'image/jpeg', .9); })
          .then(function(b){ return VFS.write(VFS.join(dir, 'Página ' + (i + 1) + '.jpg'), b); });
      }); });
      return c;
    }).then(function(){ UI.busy(false); UI.toast('Imágenes en «' + VFS.base(dir) + '»'); }).catch(UI.fail);
  }
  function printPdf(){
    if(VFS.native){ VFS.bridge({op:'print', path:path}); return; }
    UI.busy('Preparando impresión…');
    var area = h('div', {id:'printarea', style:'position:fixed;left:-99999px'});
    var c = Promise.resolve();
    st.pages.forEach(function(pg, i){ c = c.then(function(){
      var vp = pg.p.getViewport({scale:1.6}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      return pg.p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){ drawAnn(cv.getContext('2d'), A(i), cv.width, cv.height); var im = h('img', {src:cv.toDataURL('image/jpeg', .9), style:'width:100%;page-break-after:always;display:block'}); area.appendChild(im); });
    }); });
    c.then(function(){ UI.busy(false); document.body.appendChild(area); setTimeout(function(){ window.print(); setTimeout(function(){ area.remove(); }, 800); }, 200); }).catch(UI.fail);
  }
  function docInfo(){
    st.doc.getMetadata().then(function(m){
      var i = m.info || {}, rows = [['Título', i.Title], ['Autor', i.Author], ['Asunto', i.Subject], ['Creado con', i.Creator], ['Productor', i.Producer], ['Versión PDF', i.PDFFormatVersion], ['Páginas', st.pages.length], ['Tamaño de página', Math.round(st.pages[0].w / 72 * 25.4) + ' × ' + Math.round(st.pages[0].h / 72 * 25.4) + ' mm']];
      var b = h('div', {style:'font-size:14px'});
      rows.forEach(function(r){ if(r[1]) b.appendChild(h('div', {class:'row', style:'padding:6px 0;border-bottom:1px solid var(--border)', html:'<span class="muted" style="width:120px;flex:none">' + esc(r[0]) + '</span><span class="grow">' + esc(r[1]) + '</span>'})); });
      UI.dialog({title:'Información del PDF', body:b, buttons:[{t:'Cerrar', v:1, cls:'primary'}]});
    });
  }
}

/* ---------- formularios ---------- */
function fillForm(path){
  UI.busy('Leyendo formulario…');
  var pdf;
  plib().then(function(P){ return bytes(path).then(function(ab){ return P.PDFDocument.load(ab, {ignoreEncryption:true}); }); }).then(function(d){
    pdf = d; UI.busy(false);
    var form = pdf.getForm(), fields = form.getFields();
    if(!fields.length){ UI.alert('Sin campos', 'Este PDF no tiene campos de formulario. Usa «Anotar y firmar» para escribir sobre él.'); return; }
    var body = h('div'), getters = [];
    fields.forEach(function(f){
      var n = f.getName(), type = f.constructor.name, lbl = h('label', {class:'lbl', text:n.replace(/[_.]/g, ' ')});
      if(/TextField/.test(type)){
        var inp = h(f.isMultiline && f.isMultiline() ? 'textarea' : 'input', {class:'field'}); inp.value = f.getText() || ''; body.appendChild(lbl); body.appendChild(inp);
        getters.push(function(){ try { f.setText(inp.value); } catch(e){} });
      } else if(/CheckBox/.test(type)){
        var sw = h('button', {class:'sw' + (f.isChecked() ? ' on' : ''), onclick:function(){ sw.classList.toggle('on'); }});
        body.appendChild(h('div', {class:'row', style:'margin-top:10px'}, [h('span', {class:'grow', text:n}), sw]));
        getters.push(function(){ if(sw.classList.contains('on')) f.check(); else f.uncheck(); });
      } else if(/Dropdown|OptionList|RadioGroup/.test(type)){
        var sel = h('select', {class:'field'}); sel.appendChild(h('option', {value:'', text:'—'}));
        f.getOptions().forEach(function(o){ sel.appendChild(h('option', {value:o, text:o})); });
        var curV = /Radio/.test(type) ? f.getSelected() : (f.getSelected() || [])[0]; if(curV) sel.value = curV;
        body.appendChild(lbl); body.appendChild(sel);
        getters.push(function(){ if(sel.value) f.select(sel.value); });
      }
    });
    return UI.dialog({title:'Rellenar formulario', wide:true, body:body, buttons:[{t:'Cancelar', v:null}, {t:'Guardar', v:true, cls:'primary'}]}).then(function(ok){
      if(!ok) return;
      UI.busy('Guardando…');
      getters.forEach(function(g){ g(); });
      return pdf.save().then(function(out){ return VFS.write(path, new Blob([out], {type:'application/pdf'})); }).then(function(){ UI.busy(false); UI.toast('Formulario guardado'); Viewers.close(); open(path); });
    });
  }).catch(UI.fail);
}

/* ---------- organizador de páginas ---------- */
function pages(path){
  var v = Viewers.shell(path, {sub:'Organizar páginas'});
  var grid = h('div', {style:'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;padding:20px'});
  v.body.appendChild(grid);
  grid.innerHTML = '<div class="spin" style="margin-top:60px"></div>';
  var items = [], doc = null, ab, sel = {};
  // items: {src:'orig'|'blank'|'ext', i, rot, ext?:{ab, i}}
  bytes(path).then(function(b){ ab = b; return loadDoc(b, VFS.base(path)); }).then(function(d){
    doc = d;
    for(var i = 0; i < d.numPages; i++) items.push({src:'orig', i:i, rot:0, id:Math.random()});
    draw();
  }).catch(UI.fail);
  var thumbCache = {};
  function thumb(it){
    var key = it.src + ':' + it.i + ':' + (it.ext ? it.ext.key : '');
    if(thumbCache[key]) return Promise.resolve(thumbCache[key]);
    if(it.src === 'blank') return Promise.resolve(thumbCache[key] = 'blank');
    var d = it.src === 'ext' ? it.ext.doc : doc;
    return d.getPage(it.i + 1).then(function(p){ var vp = p.getViewport({scale:1}); vp = p.getViewport({scale:260 / Math.max(vp.width, vp.height)}); var c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; return p.render({canvasContext:c.getContext('2d'), viewport:vp}).promise.then(function(){ return thumbCache[key] = c.toDataURL('image/jpeg', .8); }); });
  }
  var dragI = null;
  function draw(){
    grid.innerHTML = '';
    items.forEach(function(it, k){
      var card = h('div', {class:'card' + (sel[it.id] ? ' sel' : ''), draggable:'true', style:'padding:10px'});
      var box = h('div', {style:'height:180px;display:flex;align-items:center;justify-content:center'});
      var img = h('img', {style:'max-width:100%;max-height:170px;box-shadow:0 2px 8px rgba(0,0,0,.25);background:#fff;transform:rotate(' + it.rot + 'deg);transition:transform .2s'});
      box.appendChild(img);
      thumb(it).then(function(s){ if(s === 'blank'){ img.style.width = '120px'; img.style.height = '160px'; img.removeAttribute('src'); } else img.src = s; });
      card.appendChild(h('span', {class:'check', style:'display:block'}));
      card.appendChild(box);
      card.appendChild(h('div', {class:'sub', text:'Página ' + (k + 1) + (it.src === 'blank' ? ' (en blanco)' : it.src === 'ext' ? ' (insertada)' : '')}));
      card.onclick = function(){ if(sel[it.id]) delete sel[it.id]; else sel[it.id] = true; card.classList.toggle('sel', !!sel[it.id]); bar(); };
      card.addEventListener('dragstart', function(){ dragI = k; });
      card.addEventListener('dragover', function(e){ e.preventDefault(); card.classList.add('drop'); });
      card.addEventListener('dragleave', function(){ card.classList.remove('drop'); });
      card.addEventListener('drop', function(e){ e.preventDefault(); if(dragI == null || dragI === k) return; var m = items.splice(dragI, 1)[0]; items.splice(k, 0, m); dragI = null; dirty = true; draw(); });
      grid.appendChild(card);
    });
    bar();
  }
  var dirty = false;
  function selIdx(){ var r = []; items.forEach(function(it, k){ if(sel[it.id]) r.push(k); }); return r; }
  function bar(){
    v.tools.innerHTML = ''; v.tools.classList.remove('hidden');
    var n = selIdx().length;
    var info = h('span', {class:'muted', style:'font-size:13px;padding:0 8px;white-space:nowrap', text:n ? n + ' seleccionada' + (n > 1 ? 's' : '') : items.length + ' páginas'});
    v.tools.appendChild(info);
    Viewers.tool('checkc', 'Seleccionar todo', function(){ var all = n === items.length; sel = {}; if(!all) items.forEach(function(it){ sel[it.id] = true; }); draw(); });
    Viewers.tool('rotate', 'Girar a la derecha', function(){ each(function(it){ it.rot = (it.rot + 90) % 360; }); });
    Viewers.tool('undo', 'Girar a la izquierda', function(){ each(function(it){ it.rot = (it.rot + 270) % 360; }); });
    Viewers.tool('back', 'Mover antes', function(){ move(-1); });
    Viewers.tool('chev', 'Mover después', function(){ move(1); });
    Viewers.tool('dup', 'Duplicar', function(){ var ix = selIdx(); if(!ix.length) return hint(); ix.reverse().forEach(function(k){ var c = JSON.parse(JSON.stringify({src:items[k].src, i:items[k].i, rot:items[k].rot})); c.ext = items[k].ext; c.id = Math.random(); items.splice(k + 1, 0, c); }); dirty = true; draw(); });
    Viewers.tool('trash', 'Eliminar páginas', function(){ var ix = selIdx(); if(!ix.length) return hint(); if(ix.length === items.length) return UI.toast('Debe quedar al menos una página'); items = items.filter(function(it){ return !sel[it.id]; }); sel = {}; dirty = true; draw(); });
    Viewers.sep();
    Viewers.tool('plus', 'Insertar página en blanco', function(){ var ix = selIdx(), at = ix.length ? ix[ix.length - 1] + 1 : items.length; items.splice(at, 0, {src:'blank', i:0, rot:0, id:Math.random()}); dirty = true; draw(); });
    Viewers.tool('merge', 'Insertar desde otro PDF', insertPdf);
    Viewers.tool('upload', 'Extraer selección a nuevo PDF', function(){ var ix = selIdx(); if(!ix.length) return hint(); build(ix.map(function(k){ return items[k]; })).then(function(out){ return VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' (páginas).pdf')).then(function(p){ return VFS.write(p, new Blob([out], {type:'application/pdf'})).then(function(){ UI.toast('Creado ' + VFS.base(p)); }); }); }).catch(UI.fail); });
    Viewers.tool('pages', 'Dividir en un PDF por página', splitAll);
    var sv = h('button', {class:'btn', style:'margin-left:8px;padding:8px 14px', text:'Guardar', onclick:function(){ save(); }});
    v.tools.appendChild(sv);
  }
  function hint(){ UI.toast('Toca páginas para seleccionarlas'); }
  function each(fn){ var ix = selIdx(); if(!ix.length) return hint(); ix.forEach(function(k){ fn(items[k]); }); dirty = true; draw(); }
  function move(d){
    var ix = selIdx(); if(!ix.length) return hint();
    if(d < 0){ if(ix[0] === 0) return; ix.forEach(function(k){ var t = items[k - 1]; items[k - 1] = items[k]; items[k] = t; }); }
    else { if(ix[ix.length - 1] === items.length - 1) return; ix.reverse().forEach(function(k){ var t = items[k + 1]; items[k + 1] = items[k]; items[k] = t; }); }
    dirty = true; draw();
  }
  function insertPdf(){
    pickPdf().then(function(p){
      if(!p) return;
      return bytes(p).then(function(b){ return loadDoc(b, VFS.base(p)).then(function(d){
        var ext = {ab:b, doc:d, key:p}, ix = selIdx(), at = ix.length ? ix[ix.length - 1] + 1 : items.length;
        var add = []; for(var i = 0; i < d.numPages; i++) add.push({src:'ext', i:i, rot:0, ext:ext, id:Math.random()});
        items.splice.apply(items, [at, 0].concat(add)); dirty = true; draw(); UI.toast(d.numPages + ' páginas insertadas');
      }); });
    }).catch(UI.fail);
  }
  function build(list){
    return plib().then(function(P){
      var src, exts = {};
      return P.PDFDocument.load(ab, {ignoreEncryption:true}).then(function(s){
        src = s;
        var need = {}; list.forEach(function(it){ if(it.ext) need[it.ext.key] = it.ext; });
        return Promise.all(Object.keys(need).map(function(k){ return P.PDFDocument.load(need[k].ab, {ignoreEncryption:true}).then(function(d){ exts[k] = d; }); }));
      }).then(function(){ return P.PDFDocument.create(); }).then(function(out){
        var c = Promise.resolve(), size = src.getPages()[0].getSize();
        list.forEach(function(it){
          c = c.then(function(){
            if(it.src === 'blank'){ var bp = out.addPage([size.width, size.height]); if(it.rot) bp.setRotation(P.degrees(it.rot)); return; }
            var from = it.src === 'ext' ? exts[it.ext.key] : src;
            return out.copyPages(from, [it.i]).then(function(cp){ var pg = cp[0]; pg.setRotation(P.degrees((pg.getRotation().angle + it.rot) % 360)); out.addPage(pg); });
          });
        });
        return c.then(function(){ return out.save(); });
      });
    });
  }
  function save(){
    UI.busy('Guardando…');
    build(items).then(function(out){ return VFS.write(path, new Blob([out], {type:'application/pdf'})); }).then(function(){ UI.busy(false); dirty = false; UI.toast('PDF guardado'); Viewers.close(); open(path); }).catch(UI.fail);
  }
  function splitAll(){
    UI.busy('Dividiendo…');
    var dir;
    VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' (páginas)')).then(function(d){ dir = d; return VFS.mkdir(d); }).then(function(){
      var c = Promise.resolve();
      items.forEach(function(it, k){ c = c.then(function(){ UI.busy('Página ' + (k + 1) + ' de ' + items.length); return build([it]).then(function(out){ return VFS.write(VFS.join(dir, VFS.stem(VFS.base(path)) + ' - p' + (k + 1) + '.pdf'), new Blob([out], {type:'application/pdf'})); }); }); });
      return c;
    }).then(function(){ UI.busy(false); UI.toast(items.length + ' PDF en «' + VFS.base(dir) + '»'); }).catch(UI.fail);
  }
  v.dirty = function(){ return dirty; };
  v.save = function(){ save(); return Promise.resolve(); };
  Viewers.commonActs(path);
}
function pickPdf(){
  return VFS.walk('/').then(function(all){
    var pdfs = all.filter(function(n){ return n.kind === 'file' && VFS.ext(n.name) === 'pdf'; }).sort(function(a, b){ return b.mtime - a.mtime; });
    if(!pdfs.length){ UI.toast('No hay otros PDF'); return null; }
    return new Promise(function(res){
      var body = h('div', {style:'max-height:55vh;overflow:auto'}), chosen = null;
      pdfs.forEach(function(n){ body.appendChild(h('button', {class:'mi', html:icon('file') + '<span class="grow ell">' + esc(n.name) + '</span><span class="k">' + esc(UI.size(n.size)) + '</span>', onclick:function(){ chosen = n.path; document.querySelector('.layer:last-child .btns button').click(); }})); });
      UI.dialog({title:'Elige un PDF', body:body, buttons:[{t:'Cancelar', v:null}]}).then(function(){ res(chosen); });
    });
  });
}

window.PDFView = {open:open, lib:lib, plib:plib, pages:pages, fillForm:fillForm, loadDoc:loadDoc, bytes:bytes, signaturePad:signaturePad, sigs:sigs, saveSigs:saveSigs, pickPdf:pickPdf};
}());
