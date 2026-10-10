/* Archivero — herramientas y ajustes */
(function(){
'use strict';
var $ = UI.$, h = UI.h, icon = UI.icon, esc = UI.esc;

function stamp(){ var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes()); }
function bodyOf(){ var v = Viewers.current(); return v; }

/* elegir archivos de la biblioteca */
function pickFiles(ttl, filter, multi){
  return VFS.walk('/').then(function(all){
    var list = all.filter(function(n){ return n.kind === 'file' && filter(n); }).sort(function(a, b){ return b.mtime - a.mtime; });
    return new Promise(function(res){
      var chosen = [], body = h('div');
      var q = h('input', {class:'field', placeholder:'Filtrar por nombre', type:'search', style:'margin-bottom:8px'});
      var box = h('div', {style:'max-height:50vh;overflow:auto'});
      body.appendChild(q); body.appendChild(box);
      function draw(){
        box.innerHTML = '';
        var f = q.value.toLowerCase();
        var l = list.filter(function(n){ return !f || n.name.toLowerCase().indexOf(f) >= 0; });
        if(!l.length) box.appendChild(h('div', {class:'muted', style:'padding:24px;text-align:center', text:'No hay archivos de este tipo. Impórtalos primero.'}));
        l.slice(0, 400).forEach(function(n){
          var b = h('button', {class:'mi' + (chosen.indexOf(n.path) >= 0 ? ' on' : ''), html:UI.fileIcon(n.name).replace('class="ft"', 'class="ft" style="width:26px;height:32px;font-size:0;padding:0;flex:none"') + '<span class="grow" style="min-width:0"><span class="ell" style="display:block">' + esc(n.name) + '</span><small class="muted">' + esc(VFS.parent(n.path) === '/' ? 'Mis archivos' : VFS.parent(n.path).slice(1)) + ' · ' + esc(UI.size(n.size)) + '</small></span>', onclick:function(){
            var i = chosen.indexOf(n.path);
            if(!multi){ chosen = [n.path]; document.querySelector('.layer:last-child .btns button:last-child').click(); return; }
            if(i >= 0) chosen.splice(i, 1); else chosen.push(n.path);
            b.classList.toggle('on', i < 0);
          }});
          box.appendChild(b);
        });
      }
      q.oninput = draw; draw();
      UI.dialog({title:ttl, body:body, buttons:multi ? [{t:'Cancelar', v:null}, {t:'Continuar', cls:'primary', v:function(){ return chosen.slice(); }}] : [{t:'Cancelar', v:null}, {t:'', v:function(){ return chosen; }}]}).then(function(v){ res(v && v.length ? v : null); });
      if(!multi){ var bs = document.querySelectorAll('.layer:last-child .btns button'); if(bs[1]) bs[1].style.display = 'none'; }
    });
  });
}
function isImg(n){ return UI.kindOf(n.name || n).k === 'image'; }
function isPdf(n){ return VFS.ext(n.name || n) === 'pdf'; }

/* imagen → JPEG normalizado (para PDF) */
function toJpeg(blob, maxSide, q){
  var u = URL.createObjectURL(blob);
  return UI.loadImage(u).then(function(i){
    var s = Math.min(1, (maxSide || 3000) / Math.max(i.naturalWidth, i.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.round(i.naturalWidth * s); c.height = Math.round(i.naturalHeight * s);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(i, 0, 0, c.width, c.height);
    URL.revokeObjectURL(u);
    return UI.canvasBlob(c, 'image/jpeg', q || .9).then(function(b){ return b.arrayBuffer(); }).then(function(ab){ return {ab:ab, w:c.width, h:c.height}; });
  });
}
function imagesPdf(blobs, opts){
  opts = opts || {};
  return PDFView.plib().then(function(P){
    return P.PDFDocument.create().then(function(pdf){
      var c = Promise.resolve();
      blobs.forEach(function(b, k){
        c = c.then(function(){
          if(opts.progress) opts.progress(k);
          return toJpeg(b, opts.max, opts.q).then(function(j){
            return pdf.embedJpg(j.ab).then(function(img){
              var A4 = [595.28, 841.89], m = opts.margin || 0, pw, ph;
              if(opts.size === 'a4' || opts.size === 'letter'){
                var base = opts.size === 'a4' ? A4 : [612, 792];
                var land = j.w > j.h; pw = land ? base[1] : base[0]; ph = land ? base[0] : base[1];
              } else { pw = j.w * .75; ph = j.h * .75; var r = Math.min(1, 1700 / Math.max(pw, ph)); pw *= r; ph *= r; }
              var page = pdf.addPage([pw, ph]);
              var aw = pw - m * 2, ah = ph - m * 2, s = Math.min(aw / j.w, ah / j.h), w = j.w * s, hh = j.h * s;
              page.drawImage(img, {x:(pw - w) / 2, y:(ph - hh) / 2, width:w, height:hh});
            });
          });
        });
      });
      return c.then(function(){ pdf.setCreator('Archivero'); pdf.setProducer('Archivero'); return pdf.save(); });
    });
  });
}
function imagesToPdf(paths){
  var size = h('select', {class:'field'}); [['fit', 'Tamaño de la imagen'], ['a4', 'A4'], ['letter', 'Carta']].forEach(function(o){ size.appendChild(h('option', {value:o[0], text:o[1]})); });
  var marg = h('select', {class:'field'}); [['0', 'Sin margen'], ['18', 'Margen pequeño'], ['36', 'Margen normal']].forEach(function(o){ marg.appendChild(h('option', {value:o[0], text:o[1]})); });
  var name = h('input', {class:'field', value:paths.length === 1 ? VFS.stem(VFS.base(paths[0])) : 'Imágenes ' + stamp()});
  var body = h('div', {}, [h('div', {class:'muted', style:'font-size:13px', text:paths.length + ' imagen' + (paths.length > 1 ? 'es' : '') + ', en el orden elegido.'}), h('label', {class:'lbl', text:'Nombre'}), name, h('label', {class:'lbl', text:'Página'}), size, h('label', {class:'lbl', text:'Márgenes'}), marg]);
  UI.dialog({title:'Crear PDF', body:body, buttons:[{t:'Cancelar', v:null}, {t:'Crear', cls:'primary', v:true}]}).then(function(ok){
    if(!ok) return;
    UI.busy('Creando PDF…');
    return Promise.all(paths.map(function(p){ return VFS.read(p); })).then(function(bl){
      return imagesPdf(bl, {size:size.value, margin:+marg.value, progress:function(k){ UI.busy('Página ' + (k + 1) + ' de ' + bl.length); }});
    }).then(function(out){
      return VFS.uniquePath(VFS.join(VFS.parent(paths[0]), (name.value.trim() || 'Imágenes') + '.pdf')).then(function(p){ return VFS.write(p, new Blob([out], {type:'application/pdf'})).then(function(){ return p; }); });
    }).then(function(p){ UI.busy(false); UI.toast('Creado ' + VFS.base(p)); App.refresh(); });
  }).catch(UI.fail);
}
function imagesToPdfPick(dir){
  pickFiles('Elige imágenes (en orden)', isImg, true).then(function(ps){ if(ps) imagesToPdf(ps); });
}
function mergePdfs(paths){
  var order = paths.slice();
  var listEl = h('div');
  var name = h('input', {class:'field', value:'Unido ' + stamp()});
  function draw(){
    listEl.innerHTML = '';
    order.forEach(function(p, i){
      listEl.appendChild(h('div', {class:'row', style:'padding:6px 0;border-bottom:1px solid var(--border)'}, [
        h('span', {class:'muted', style:'width:22px', text:i + 1}), h('span', {class:'grow ell', text:VFS.base(p)}),
        h('button', {class:'tb', disabled:!i, html:icon('back'), style:'transform:rotate(90deg)', onclick:function(){ var t = order[i - 1]; order[i - 1] = order[i]; order[i] = t; draw(); }}),
        h('button', {class:'tb', disabled:i === order.length - 1, html:icon('chev'), style:'transform:rotate(90deg)', onclick:function(){ var t = order[i + 1]; order[i + 1] = order[i]; order[i] = t; draw(); }})
      ]));
    });
  }
  draw();
  var add = h('button', {class:'btn sec', style:'margin-top:10px', html:icon('plus') + 'Agregar PDF', onclick:function(){ pickFiles('Agregar PDF', isPdf, true).then(function(ps){ if(ps){ order = order.concat(ps); draw(); } }); }});
  UI.dialog({title:'Unir PDF', body:h('div', {}, [listEl, add, h('label', {class:'lbl', text:'Nombre del nuevo PDF'}), name]), buttons:[{t:'Cancelar', v:null}, {t:'Unir', cls:'primary', v:true}]}).then(function(ok){
    if(!ok || order.length < 1) return;
    UI.busy('Uniendo…');
    return PDFView.plib().then(function(P){
      return P.PDFDocument.create().then(function(out){
        var c = Promise.resolve();
        order.forEach(function(p, k){ c = c.then(function(){ UI.busy('Uniendo ' + (k + 1) + ' de ' + order.length); return PDFView.bytes(p).then(function(ab){ return P.PDFDocument.load(ab, {ignoreEncryption:true}); }).then(function(src){ return out.copyPages(src, src.getPageIndices()); }).then(function(pgs){ pgs.forEach(function(pg){ out.addPage(pg); }); }); }); });
        return c.then(function(){ return out.save(); });
      });
    }).then(function(bytes){
      return VFS.uniquePath(VFS.join(VFS.parent(order[0]), (name.value.trim() || 'Unido') + '.pdf')).then(function(p){ return VFS.write(p, new Blob([bytes], {type:'application/pdf'})).then(function(){ return p; }); });
    }).then(function(p){ UI.busy(false); UI.toast('Creado ' + VFS.base(p)); App.refresh(); });
  }).catch(UI.fail);
}
function compressPdf(path){
  var q = h('select', {class:'field'}); [['low', 'Máxima reducción (pantalla)'], ['mid', 'Equilibrado'], ['high', 'Alta calidad']].forEach(function(o){ q.appendChild(h('option', {value:o[0], text:o[1]})); }); q.value = 'mid';
  UI.dialog({title:'Reducir tamaño de PDF', body:h('div', {}, [h('div', {class:'muted', style:'font-size:13px;margin-bottom:8px', text:'Convierte cada página en imagen comprimida. Útil para PDF escaneados o con fotos; el texto deja de ser seleccionable. Se crea una copia.'}), q]), buttons:[{t:'Cancelar', v:null}, {t:'Reducir', cls:'primary', v:true}]}).then(function(ok){
    if(!ok) return;
    var cfg = {low:[1.1, .5], mid:[1.5, .65], high:[2, .8]}[q.value], before = 0;
    UI.busy('Reduciendo…');
    return VFS.stat(path).then(function(s){ before = s.size; return PDFView.bytes(path); }).then(function(ab){ return PDFView.loadDoc(ab, VFS.base(path)); }).then(function(doc){
      var blobs = [], c = Promise.resolve();
      for(var i = 1; i <= doc.numPages; i++) (function(i){ c = c.then(function(){
        UI.busy('Página ' + i + ' de ' + doc.numPages);
        return doc.getPage(i).then(function(p){ var vp = p.getViewport({scale:cfg[0]}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; return p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){ return UI.canvasBlob(cv, 'image/jpeg', cfg[1]); }).then(function(b){ blobs.push({b:b, w:vp.width / cfg[0], h:vp.height / cfg[0]}); }); });
      }); }(i));
      return c.then(function(){ return blobs; });
    }).then(function(blobs){
      return PDFView.plib().then(function(P){ return P.PDFDocument.create().then(function(pdf){
        var c = Promise.resolve();
        blobs.forEach(function(x){ c = c.then(function(){ return x.b.arrayBuffer().then(function(ab){ return pdf.embedJpg(ab); }).then(function(img){ var pg = pdf.addPage([x.w, x.h]); pg.drawImage(img, {x:0, y:0, width:x.w, height:x.h}); }); }); });
        return c.then(function(){ return pdf.save(); });
      }); });
    }).then(function(out){
      return VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' (reducido).pdf')).then(function(p){ return VFS.write(p, new Blob([out], {type:'application/pdf'})).then(function(){ return [p, out.length]; }); });
    }).then(function(r){ UI.busy(false); UI.alert('PDF reducido', UI.size(before) + ' → ' + UI.size(r[1]) + (r[1] < before ? ' (' + Math.round((1 - r[1] / before) * 100) + '% menos)' : '. El original ya estaba optimizado.') + '\nGuardado como «' + VFS.base(r[0]) + '».'); App.refresh(); });
  }).catch(UI.fail);
}

/* OCR (Tesseract, se descarga al primer uso) */
var ocrP = null;
function ocrWorker(){
  if(!ocrP) ocrP = UI.loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js').then(function(){
    return Tesseract.createWorker(['spa', 'eng'], 1, {logger:function(m){ if(m.status === 'recognizing text') UI.busy('Reconociendo texto… ' + Math.round(m.progress * 100) + '%'); else if(m.status) UI.busy('Preparando OCR: ' + m.status.replace('loading', 'cargando').replace('language traineddata', 'idioma') + '…'); }});
  }).catch(function(e){ ocrP = null; throw e; });
  return ocrP;
}
function ocrImages(sources){
  // sources: [Blob | canvas]
  return ocrWorker().then(function(w){
    var out = [], c = Promise.resolve();
    sources.forEach(function(s){ c = c.then(function(){ return w.recognize(s).then(function(r){ out.push(r.data.text.trim()); }); }); });
    return c.then(function(){ return out.join('\n\n'); });
  });
}
function ocrPath(path){
  UI.busy('Preparando OCR…');
  var k = UI.kindOf(path).k;
  var src = k === 'pdf' ? pdfCanvases(path) : VFS.read(path).then(function(b){ return [b]; });
  src.then(ocrImages).then(function(t){
    UI.busy(false);
    if(!t.trim()){ UI.alert('Sin texto', 'No se reconoció texto en este archivo.'); return; }
    return VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' (texto).txt')).then(function(p){ return VFS.write(p, new Blob([t], {type:'text/plain'})).then(function(){ UI.toast('Texto guardado en ' + VFS.base(p)); App.refresh(); Viewers.open(p, [p]); }); });
  }).catch(UI.fail);
}
function pdfCanvases(path){
  return PDFView.bytes(path).then(function(ab){ return PDFView.loadDoc(ab, VFS.base(path)); }).then(function(doc){
    var out = [], c = Promise.resolve();
    for(var i = 1; i <= Math.min(doc.numPages, 60); i++) (function(i){ c = c.then(function(){ return doc.getPage(i).then(function(p){ var vp = p.getViewport({scale:2}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; return p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){ out.push(cv); }); }); }); }(i));
    return c.then(function(){ return out; });
  });
}

/* ---------- escáner de documentos ---------- */
function scan(dir){
  var v = Viewers.shell(VFS.join(dir, 'Escaneo'), {dark:true, sub:'Escanear documento'});
  Viewers.setTitle(VFS.join(dir, 'Escanear documento'), 'Encuadra la hoja y toca el obturador');
  var pages = []; // {src: canvas original, quad:[[x,y]x4] normalizado, filter}
  var stage = h('div', {class:'camwrap'}); v.body.appendChild(stage);
  var video = h('video', {autoplay:true, playsinline:true, muted:true}); stage.appendChild(video);
  var shots = h('div', {class:'shots', style:'position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.4)'}); stage.appendChild(shots);
  var stream = null;
  v.cleanup.push(function(){ if(stream) stream.getTracks().forEach(function(t){ t.stop(); }); });
  function startCam(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ fallback(); return; }
    navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}, width:{ideal:3840}, height:{ideal:2160}}, audio:false}).then(function(s){ stream = s; video.srcObject = s; video.play().catch(function(){}); }).catch(function(){ fallback(); });
  }
  function fallback(){
    stage.innerHTML = '';
    var e = h('div', {class:'empty', style:'color:#ddd'}); e.innerHTML = icon('camera') + '<h3 style="color:#fff">Cámara no disponible</h3><div>Toma o elige fotos de la hoja.</div>';
    var a = h('div', {class:'actions'});
    a.appendChild(h('button', {class:'btn', html:icon('camera') + 'Tomar foto', onclick:function(){ var i = $('#camPick'); i.value = ''; i.onchange = function(){ addFiles(i.files); }; i.click(); }}));
    a.appendChild(h('button', {class:'btn sec', html:icon('image') + 'Elegir imágenes', onclick:function(){ var i = h('input', {type:'file', accept:'image/*', multiple:true}); i.onchange = function(){ addFiles(i.files); }; i.click(); }}));
    e.appendChild(a); stage.appendChild(e); stage.appendChild(shots);
  }
  function addFiles(fl){
    Array.prototype.forEach.call(fl, function(f){ UI.loadImage(URL.createObjectURL(f)).then(function(im){ var c = document.createElement('canvas'), s = Math.min(1, 3000 / Math.max(im.naturalWidth, im.naturalHeight)); c.width = im.naturalWidth * s; c.height = im.naturalHeight * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); addPage(c); }); });
  }
  function shoot(){
    if(!video.videoWidth) return;
    var c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
    stage.style.opacity = .4; setTimeout(function(){ stage.style.opacity = 1; }, 120);
    addPage(c);
  }
  function addPage(c){
    var pg = {src:c, quad:detect(c), filter:'doc'};
    pages.push(pg); paintShots();
    adjust(pg);
  }
  function paintShots(){
    shots.innerHTML = '';
    pages.forEach(function(pg, i){
      var s = h('div', {class:'s'});
      var im = h('img', {src:warp(pg, 220).toDataURL('image/jpeg', .7), onclick:function(){ adjust(pg); }});
      s.appendChild(im);
      s.appendChild(h('button', {class:'x', text:'×', onclick:function(){ pages.splice(i, 1); paintShots(); }}));
      shots.appendChild(s);
    });
    save.disabled = !pages.length;
    save.textContent = pages.length ? 'Guardar (' + pages.length + ')' : 'Guardar';
  }
  // búsqueda simple de bordes: zona clara (papel) sobre fondo más oscuro
  function detect(c){
    var W = 160, H = Math.round(160 * c.height / c.width), t = document.createElement('canvas'); t.width = W; t.height = H;
    var x = t.getContext('2d'); x.drawImage(c, 0, 0, W, H);
    var d = x.getImageData(0, 0, W, H).data, lum = new Float32Array(W * H), sum = 0;
    for(var i = 0; i < W * H; i++){ lum[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11; sum += lum[i]; }
    var mean = sum / (W * H), thr = mean + 12;
    var best = [[W, H], [0, H], [0, 0], [W, 0]], sc = [1e9, -1e9, -1e9, 1e9], n = 0;
    // esquinas extremas de los píxeles claros: tl min(x+y), tr max(x-y), br max(x+y), bl min(x-y)
    var pts = [null, null, null, null], v0 = [1e9, -1e9, -1e9, 1e9];
    for(var yy = 2; yy < H - 2; yy++) for(var xx = 2; xx < W - 2; xx++){
      if(lum[yy * W + xx] < thr) continue; n++;
      var a = xx + yy, b = xx - yy;
      if(a < v0[0]){ v0[0] = a; pts[0] = [xx, yy]; } if(b > v0[1]){ v0[1] = b; pts[1] = [xx, yy]; }
      if(a > v0[2]){ v0[2] = a; pts[2] = [xx, yy]; } if(b < v0[3]){ v0[3] = b; pts[3] = [xx, yy]; }
    }
    if(n < W * H * .12 || n > W * H * .97 || pts.some(function(p){ return !p; })) return [[.04, .04], [.96, .04], [.96, .96], [.04, .96]];
    var q = pts.map(function(p){ return [p[0] / W, p[1] / H]; });
    var area = Math.abs((q[2][0] - q[0][0]) * (q[3][1] - q[1][1]) - (q[3][0] - q[1][0]) * (q[2][1] - q[0][1])) / 2;
    if(area < .15) return [[.04, .04], [.96, .04], [.96, .96], [.04, .96]];
    return q;
  }
  // corrección de perspectiva (homografía) + filtro
  function homography(src, dst){
    var A = [], B = [];
    for(var i = 0; i < 4; i++){
      var x = dst[i][0], y = dst[i][1], u = src[i][0], w = src[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
      A.push([0, 0, 0, x, y, 1, -w * x, -w * y]); B.push(w);
    }
    // eliminación gaussiana
    for(var c = 0; c < 8; c++){
      var mx = c; for(var r = c + 1; r < 8; r++) if(Math.abs(A[r][c]) > Math.abs(A[mx][c])) mx = r;
      var t = A[c]; A[c] = A[mx]; A[mx] = t; t = B[c]; B[c] = B[mx]; B[mx] = t;
      for(var r2 = c + 1; r2 < 8; r2++){ var f = A[r2][c] / A[c][c]; for(var k = c; k < 8; k++) A[r2][k] -= f * A[c][k]; B[r2] -= f * B[c]; }
    }
    var X = new Array(8);
    for(var r3 = 7; r3 >= 0; r3--){ var s = B[r3]; for(var k2 = r3 + 1; k2 < 8; k2++) s -= A[r3][k2] * X[k2]; X[r3] = s / A[r3][r3]; }
    return X;
  }
  function warp(pg, maxSide){
    var c = pg.src, W = c.width, H = c.height, q = pg.quad.map(function(p){ return [p[0] * W, p[1] * H]; });
    var dist = function(a, b){ return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    var ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
    var s = Math.min(1, (maxSide || 2400) / Math.max(ow, oh)); ow = Math.round(ow * s); oh = Math.round(oh * s);
    var Hm = homography(q, [[0, 0], [ow, 0], [ow, oh], [0, oh]]);
    var sd = c.getContext('2d').getImageData(0, 0, W, H).data;
    var out = document.createElement('canvas'); out.width = ow; out.height = oh;
    var ox = out.getContext('2d'), od = ox.createImageData(ow, oh), o = od.data;
    for(var y = 0; y < oh; y++) for(var x = 0; x < ow; x++){
      var den = Hm[6] * x + Hm[7] * y + 1, u = (Hm[0] * x + Hm[1] * y + Hm[2]) / den, w = (Hm[3] * x + Hm[4] * y + Hm[5]) / den;
      var ui = u | 0, wi = w | 0, di = (y * ow + x) * 4;
      if(ui < 0 || wi < 0 || ui >= W || wi >= H){ o[di] = o[di + 1] = o[di + 2] = 255; o[di + 3] = 255; continue; }
      var si = (wi * W + ui) * 4; o[di] = sd[si]; o[di + 1] = sd[si + 1]; o[di + 2] = sd[si + 2]; o[di + 3] = 255;
    }
    filter(o, pg.filter);
    ox.putImageData(od, 0, 0);
    return out;
  }
  function filter(o, f){
    if(f === 'color') return;
    if(f === 'enhance'){ for(var i = 0; i < o.length; i += 4){ for(var k = 0; k < 3; k++){ var v = (o[i + k] - 128) * 1.25 + 140; o[i + k] = v < 0 ? 0 : v > 255 ? 255 : v; } } return; }
    // gris / documento: normaliza el fondo hacia blanco
    var hist = new Uint32Array(256), n = o.length / 4;
    for(var j = 0; j < o.length; j += 4){ var l = (o[j] * .3 + o[j + 1] * .59 + o[j + 2] * .11) | 0; o[j] = l; hist[l]++; }
    var acc = 0, white = 255; for(var t = 255; t >= 0; t--){ acc += hist[t]; if(acc > n * .35){ white = t; break; } }
    acc = 0; var black = 0; for(var t2 = 0; t2 < 256; t2++){ acc += hist[t2]; if(acc > n * .02){ black = t2; break; } }
    var range = Math.max(30, white - black);
    for(var m = 0; m < o.length; m += 4){
      var g = (o[m] - black) / range * 255;
      if(f === 'doc') g = g > 200 ? 255 : g < 90 ? g * .55 : g;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      o[m] = o[m + 1] = o[m + 2] = g;
    }
  }
  function adjust(pg){
    var box = h('div', {class:'dlg wide', style:'height:min(860px,calc(100vh - 24px))'});
    box.appendChild(h('h2', {text:'Ajustar bordes'}));
    var wrapEl = h('div', {style:'flex:1;min-height:0;position:relative;background:#111;margin:8px 0;touch-action:none'});
    var cv = h('canvas', {style:'position:absolute;top:0;left:0'}); wrapEl.appendChild(cv);
    box.appendChild(wrapEl);
    var segs = h('div', {class:'row', style:'justify-content:center;padding:4px 10px 10px;flex-wrap:wrap'});
    var seg = h('div', {class:'seg'});
    [['color', 'Color'], ['enhance', 'Mejorada'], ['gray', 'Gris'], ['doc', 'Documento']].forEach(function(f){
      seg.appendChild(h('button', {class:pg.filter === f[0] ? 'on' : '', text:f[1], onclick:function(e){ pg.filter = f[0]; UI.$$('button', seg).forEach(function(b){ b.classList.remove('on'); }); e.currentTarget.classList.add('on'); }}));
    });
    segs.appendChild(seg);
    segs.appendChild(h('button', {class:'btn sec', style:'padding:6px 12px', text:'Hoja completa', onclick:function(){ pg.quad = [[0, 0], [1, 0], [1, 1], [0, 1]]; paint(); }}));
    segs.appendChild(h('button', {class:'btn sec', style:'padding:6px 12px', html:icon('rotate'), title:'Girar', onclick:function(){
      var s = pg.src, r = document.createElement('canvas'); r.width = s.height; r.height = s.width; var x = r.getContext('2d'); x.translate(r.width, 0); x.rotate(Math.PI / 2); x.drawImage(s, 0, 0); pg.src = r;
      pg.quad = pg.quad.map(function(p){ return [1 - p[1], p[0]]; }); pg.quad = [pg.quad[3], pg.quad[0], pg.quad[1], pg.quad[2]]; layout();
    }}));
    box.appendChild(segs);
    var bs = h('div', {class:'btns'});
    var L;
    bs.appendChild(h('button', {text:'Repetir foto', onclick:function(){ pages.splice(pages.indexOf(pg), 1); paintShots(); L.close(); }}));
    bs.appendChild(h('button', {class:'primary', text:'Usar', onclick:function(){ L.close(); paintShots(); }}));
    box.appendChild(bs);
    L = UI.layer(box, {modal:true});
    var r, k, drag = -1;
    function layout(){
      var R = wrapEl.getBoundingClientRect(); k = Math.min(R.width / pg.src.width, R.height / pg.src.height);
      cv.width = pg.src.width * k; cv.height = pg.src.height * k; cv.style.left = (R.width - cv.width) / 2 + 'px'; cv.style.top = (R.height - cv.height) / 2 + 'px';
      paint();
    }
    function paint(){
      var x = cv.getContext('2d'); x.drawImage(pg.src, 0, 0, cv.width, cv.height);
      var q = pg.quad.map(function(p){ return [p[0] * cv.width, p[1] * cv.height]; });
      x.fillStyle = 'rgba(11,122,117,.18)'; x.strokeStyle = '#2FE0C8'; x.lineWidth = 2.5;
      x.beginPath(); q.forEach(function(p, i){ if(i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.closePath(); x.fill(); x.stroke();
      q.forEach(function(p){ x.beginPath(); x.arc(p[0], p[1], 13, 0, Math.PI * 2); x.fillStyle = '#fff'; x.fill(); x.strokeStyle = '#0B7A75'; x.stroke(); });
    }
    cv.addEventListener('pointerdown', function(e){
      var R = cv.getBoundingClientRect(), px = (e.clientX - R.left) / R.width, py = (e.clientY - R.top) / R.height, bd = 1e9;
      pg.quad.forEach(function(p, i){ var d = Math.hypot((p[0] - px) * R.width, (p[1] - py) * R.height); if(d < bd){ bd = d; drag = i; } });
      if(bd > 60) drag = -1; else cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', function(e){ if(drag < 0) return; var R = cv.getBoundingClientRect(); pg.quad[drag] = [Math.max(0, Math.min(1, (e.clientX - R.left) / R.width)), Math.max(0, Math.min(1, (e.clientY - R.top) / R.height))]; paint(); });
    cv.addEventListener('pointerup', function(){ drag = -1; });
    setTimeout(layout, 50);
  }
  var save = h('button', {class:'btn', style:'margin-left:8px;padding:8px 14px', text:'Guardar', disabled:true, onclick:function(){ finish(); }});
  v.tools.classList.remove('hidden');
  var shutter = h('button', {style:'width:64px;height:64px;border-radius:50%;background:#fff;border:4px solid var(--accent);margin:0 18px;box-shadow:0 0 0 3px #fff', title:'Capturar', onclick:shoot});
  Viewers.tool('image', 'Elegir imágenes', function(){ var i = h('input', {type:'file', accept:'image/*', multiple:true}); i.onchange = function(){ addFiles(i.files); }; i.click(); });
  v.tools.appendChild(shutter);
  v.tools.appendChild(save);
  v.key = function(e){ if(e.key === ' '){ e.preventDefault(); shoot(); } };
  function finish(){
    var name = h('input', {class:'field', value:'Escaneo ' + stamp()});
    var fmt = h('select', {class:'field'}); [['pdf', 'PDF'], ['jpg', 'Imágenes JPG']].forEach(function(o){ fmt.appendChild(h('option', {value:o[0], text:o[1]})); });
    var ocr = h('button', {class:'sw'}); ocr.onclick = function(){ ocr.classList.toggle('on'); };
    var body = h('div', {}, [h('label', {class:'lbl', text:'Nombre'}), name, h('label', {class:'lbl', text:'Formato'}), fmt,
      h('div', {class:'row', style:'margin-top:14px'}, [h('div', {class:'grow', html:'Reconocer texto (OCR)<br><small class="muted">Guarda también un .txt con el texto. Requiere conexión la primera vez.</small>'}), ocr])]);
    UI.dialog({title:'Guardar escaneo', body:body, buttons:[{t:'Cancelar', v:null}, {t:'Guardar', cls:'primary', v:true}]}).then(function(ok){
      if(!ok) return;
      UI.busy('Procesando páginas…');
      var canv = pages.map(function(pg){ return warp(pg, 2600); });
      var nm = name.value.trim() || 'Escaneo ' + stamp(), saved;
      return Promise.all(canv.map(function(c){ return UI.canvasBlob(c, 'image/jpeg', .88); })).then(function(blobs){
        if(fmt.value === 'pdf') return imagesPdf(blobs, {size:'a4', max:2600, q:.85}).then(function(out){ return VFS.uniquePath(VFS.join(dir, nm + '.pdf')).then(function(p){ saved = p; return VFS.write(p, new Blob([out], {type:'application/pdf'})); }); });
        var c = Promise.resolve();
        blobs.forEach(function(b, i){ c = c.then(function(){ return VFS.uniquePath(VFS.join(dir, nm + (blobs.length > 1 ? ' ' + (i + 1) : '') + '.jpg')).then(function(p){ if(!saved) saved = p; return VFS.write(p, b); }); }); });
        return c;
      }).then(function(){
        if(!ocr.classList.contains('on')) return;
        return ocrImages(canv).then(function(t){ return VFS.uniquePath(VFS.join(dir, nm + '.txt')).then(function(p){ return VFS.write(p, new Blob([t], {type:'text/plain'})); }); });
      }).then(function(){ UI.busy(false); UI.toast('Escaneo guardado'); Viewers.close(); App.cd(dir); });
    }).catch(UI.fail);
  }
  startCam();
}

/* ---------- grabadora ---------- */
function record(dir){
  var v = Viewers.shell(VFS.join(dir, 'Grabadora'), {sub:'Nueva grabación'});
  var card = h('div', {class:'audiocard', style:'margin:40px auto'});
  var time = h('div', {style:'font-size:56px;font-weight:200;font-variant-numeric:tabular-nums;letter-spacing:-1px', text:'0:00'});
  var meter = h('canvas', {width:600, height:90, style:'width:100%;height:90px;margin:14px 0'});
  var status = h('div', {class:'muted', text:'Toca el botón para grabar'});
  var c = h('div', {class:'ctrls'});
  var rec = h('button', {class:'big', style:'background:#E5484D;width:76px;height:76px', html:icon('mic')});
  var pauseB = h('button', {class:'tb', disabled:true, html:icon('pause')});
  var stopB = h('button', {class:'tb', disabled:true, html:'<span style="width:18px;height:18px;background:currentColor;border-radius:3px;display:block"></span>'});
  c.appendChild(pauseB); c.appendChild(rec); c.appendChild(stopB);
  card.appendChild(time); card.appendChild(meter); card.appendChild(status); card.appendChild(c);
  v.body.appendChild(card);
  var mr = null, chunks = [], stream = null, t0 = 0, acc = 0, timer = null, raf = 0, an = null, actx = null, levels = [];
  v.cleanup.push(function(){ if(mr && mr.state !== 'inactive'){ mr.onstop = null; mr.stop(); } if(stream) stream.getTracks().forEach(function(t){ t.stop(); }); clearInterval(timer); cancelAnimationFrame(raf); if(actx) actx.close(); });
  v.dirty = function(){ return !!(mr && mr.state !== 'inactive'); };
  function tick(){ var s = acc + (mr && mr.state === 'recording' ? (Date.now() - t0) / 1000 : 0); time.textContent = UI.dur(s); }
  function draw(){
    raf = requestAnimationFrame(draw);
    if(!an) return;
    var d = new Uint8Array(an.fftSize); an.getByteTimeDomainData(d);
    var m = 0; for(var i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i] - 128));
    levels.push(mr && mr.state === 'recording' ? m / 128 : 0); if(levels.length > 120) levels.shift();
    var x = meter.getContext('2d'); x.clearRect(0, 0, 600, 90); x.fillStyle = App.S.accent;
    levels.forEach(function(l, k){ var hh = Math.max(2, l * 86); x.fillRect(k * 5, 45 - hh / 2, 3, hh); });
  }
  rec.onclick = function(){
    if(mr && mr.state === 'recording') return;
    if(!window.MediaRecorder || !navigator.mediaDevices){ UI.alert('No disponible', 'Este dispositivo no permite grabar desde la app.'); return; }
    navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}).then(function(s){
      stream = s;
      var type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].filter(function(t){ return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0];
      mr = new MediaRecorder(s, type ? {mimeType:type, audioBitsPerSecond:128000} : undefined);
      mr.ondataavailable = function(e){ if(e.data.size) chunks.push(e.data); };
      mr.onstop = saveRec;
      mr.start(1000); t0 = Date.now(); acc = 0;
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); an = actx.createAnalyser(); an.fftSize = 1024; actx.createMediaStreamSource(s).connect(an); } catch(e){}
      timer = setInterval(tick, 250); draw();
      rec.style.opacity = .5; pauseB.disabled = false; stopB.disabled = false; status.textContent = 'Grabando…';
    }).catch(function(){ UI.alert('Micrófono bloqueado', 'Permite el acceso al micrófono para grabar.'); });
  };
  pauseB.onclick = function(){
    if(!mr) return;
    if(mr.state === 'recording'){ mr.pause(); acc += (Date.now() - t0) / 1000; pauseB.innerHTML = icon('play'); status.textContent = 'En pausa'; }
    else if(mr.state === 'paused'){ mr.resume(); t0 = Date.now(); pauseB.innerHTML = icon('pause'); status.textContent = 'Grabando…'; }
  };
  stopB.onclick = function(){ if(mr && mr.state !== 'inactive') mr.stop(); };
  function saveRec(){
    if(stream) stream.getTracks().forEach(function(t){ t.stop(); });
    clearInterval(timer);
    var type = mr.mimeType || 'audio/mp4', e = /webm/.test(type) ? 'webm' : 'm4a';
    var blob = new Blob(chunks, {type:type});
    UI.prompt('Guardar grabación', 'Grabación ' + stamp(), {ok:'Guardar'}).then(function(nm){
      if(!nm){ return UI.confirm('¿Descartar grabación?', '', 'Descartar', true).then(function(ok){ if(!ok) return saveRecName('Grabación ' + stamp()); Viewers.close(); }); }
      return saveRecName(nm);
    });
    function saveRecName(nm){
      return VFS.uniquePath(VFS.join(dir, nm + '.' + e)).then(function(p){ return VFS.write(p, blob).then(function(){ UI.toast('Grabación guardada'); Viewers.close(); App.cd(dir); }); }).catch(UI.fail);
    }
  }
}

/* ---------- descargar desde enlace ---------- */
function download(dir, preset){
  UI.prompt('Descargar desde enlace', preset || '', {placeholder:'https://…', type:'url', caps:'none', ok:'Descargar', msg:'Pega el enlace directo a un archivo (PDF, imagen, video, ZIP…). Los enlaces de Google Drive y Dropbox compartidos también funcionan.'}).then(function(u){
    if(!u) return;
    if(!/^https?:\/\//i.test(u)) u = 'https://' + u;
    // enlaces compartidos comunes → descarga directa
    var m = u.match(/drive\.google\.com\/file\/d\/([^/]+)/); if(m) u = 'https://drive.google.com/uc?export=download&id=' + m[1];
    if(/dropbox\.com/.test(u)) u = u.replace(/[?&]dl=0/, '').replace(/\?$/, '') + (u.indexOf('?') >= 0 ? '&' : '?') + 'dl=1';
    UI.busy('Descargando…');
    if(VFS.native){
      return VFS.bridge({op:'download', url:u, dir:dir}).then(function(p){ UI.busy(false); UI.toast('Descargado ' + VFS.base(p)); App.refresh(); });
    }
    return fetch(u).then(function(r){
      if(!r.ok) throw new Error('El servidor respondió ' + r.status);
      var cd = r.headers.get('content-disposition') || '', nm = (cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i) || [])[1];
      nm = nm ? decodeURIComponent(nm) : decodeURIComponent(u.split('?')[0].split('/').pop() || 'descarga');
      var type = (r.headers.get('content-type') || '').split(';')[0];
      if(!VFS.ext(nm)){ var map = {'application/pdf':'pdf', 'image/jpeg':'jpg', 'image/png':'png', 'text/html':'html', 'video/mp4':'mp4', 'audio/mpeg':'mp3', 'application/zip':'zip', 'text/plain':'txt'}; if(map[type]) nm += '.' + map[type]; }
      var total = +r.headers.get('content-length') || 0, got = 0, reader = r.body && r.body.getReader ? r.body.getReader() : null, parts = [];
      if(!reader) return r.blob().then(function(b){ return [nm, b]; });
      function pump(){ return reader.read().then(function(x){ if(x.done) return [nm, new Blob(parts, {type:type})]; parts.push(x.value); got += x.value.length; UI.busy('Descargando… ' + UI.size(got) + (total ? ' de ' + UI.size(total) : '')); return pump(); }); }
      return pump();
    }).then(function(x){
      return VFS.uniquePath(VFS.join(dir, x[0].replace(/[\/\\:]/g, '-'))).then(function(p){ return VFS.write(p, x[1]).then(function(){ UI.busy(false); UI.toast('Descargado ' + VFS.base(p)); App.refresh(); }); });
    }).catch(function(e){
      UI.busy(false);
      UI.alert('No se pudo descargar', (e && e.message && !/Failed to fetch|Load failed|NetworkError/.test(e.message) ? e.message + '. ' : '') + 'El sitio no permite descargas directas desde apps web. Abre el enlace en Safari, descarga el archivo y luego impórtalo aquí con «Importar archivos».');
    });
  });
}

/* ---------- convertir imágenes en lote ---------- */
function convertImages(pre){
  (pre && pre.length ? Promise.resolve(pre) : pickFiles('Elige imágenes', isImg, true)).then(function(ps){
    if(!ps) return;
    var fmt = h('select', {class:'field'}); [['image/jpeg', 'JPG'], ['image/png', 'PNG'], ['image/webp', 'WebP']].forEach(function(o){ fmt.appendChild(h('option', {value:o[0], text:o[1]})); });
    var max = h('select', {class:'field'}); [['0', 'Tamaño original'], ['3000', 'Máximo 3000 px'], ['2048', 'Máximo 2048 px'], ['1280', 'Máximo 1280 px'], ['800', 'Máximo 800 px']].forEach(function(o){ max.appendChild(h('option', {value:o[0], text:o[1]})); });
    var q = h('select', {class:'field'}); [['.92', 'Calidad alta'], ['.8', 'Calidad media'], ['.6', 'Archivo liviano']].forEach(function(o){ q.appendChild(h('option', {value:o[0], text:o[1]})); });
    UI.dialog({title:'Convertir ' + ps.length + ' imagen' + (ps.length > 1 ? 'es' : ''), body:h('div', {}, [h('label', {class:'lbl', text:'Formato'}), fmt, h('label', {class:'lbl', text:'Tamaño'}), max, h('label', {class:'lbl', text:'Calidad'}), q, h('div', {class:'muted', style:'font-size:12.5px;margin-top:10px', text:'Se crean copias junto a los originales. También sirve para convertir fotos HEIC del iPhone a JPG.'})]), buttons:[{t:'Cancelar', v:null}, {t:'Convertir', cls:'primary', v:true}]}).then(function(ok){
      if(!ok) return;
      var e = fmt.value === 'image/png' ? 'png' : fmt.value === 'image/webp' ? 'webp' : 'jpg', c = Promise.resolve(), saved = 0, before = 0, after = 0;
      ps.forEach(function(p, i){ c = c.then(function(){
        UI.busy('Convirtiendo ' + (i + 1) + ' de ' + ps.length);
        return VFS.read(p).then(function(b){ before += b.size; return UI.loadImage(URL.createObjectURL(b)); }).then(function(im){
          var m = +max.value, s = m ? Math.min(1, m / Math.max(im.naturalWidth, im.naturalHeight)) : 1, cv = document.createElement('canvas');
          cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
          var x = cv.getContext('2d'); if(e === 'jpg'){ x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); } x.drawImage(im, 0, 0, cv.width, cv.height);
          return UI.canvasBlob(cv, fmt.value, +q.value);
        }).then(function(b){ after += b.size; return VFS.uniquePath(VFS.join(VFS.parent(p), VFS.stem(VFS.base(p)) + '.' + e)).then(function(np){ return VFS.write(np, b); }); }).then(function(){ saved++; });
      }); });
      return c.then(function(){ UI.busy(false); UI.toast(saved + ' convertidas · ' + UI.size(before) + ' → ' + UI.size(after), 3500); App.refresh(); });
    }).catch(UI.fail);
  });
}

/* ---------- renombrar en lote ---------- */
function batchRename(){
  pickFiles('Elige archivos para renombrar', function(){ return true; }, true).then(function(ps){
    if(!ps) return;
    var base = h('input', {class:'field', value:'Documento'});
    var start = h('input', {class:'field', value:'1', inputmode:'numeric'});
    var mode = h('select', {class:'field'}); [['seq', 'Nombre + número'], ['date', 'Nombre + fecha'], ['replace', 'Buscar y reemplazar en el nombre']].forEach(function(o){ mode.appendChild(h('option', {value:o[0], text:o[1]})); });
    var rep = h('input', {class:'field', placeholder:'Reemplazar por'});
    var prev = h('div', {class:'muted', style:'font-size:12.5px;margin-top:10px;max-height:140px;overflow:auto'});
    function names(){
      return ps.map(function(p, i){
        var e = VFS.ext(p), st = VFS.stem(VFS.base(p));
        if(mode.value === 'replace') return (base.value ? st.split(base.value).join(rep.value) : st) + (e ? '.' + e : '');
        if(mode.value === 'date') return base.value + ' ' + stamp().slice(0, 10) + (ps.length > 1 ? ' ' + (i + 1) : '') + (e ? '.' + e : '');
        var n = (+start.value || 1) + i, w = String((+start.value || 1) + ps.length - 1).length;
        return base.value + ' ' + ('000000' + n).slice(-Math.max(2, w)) + (e ? '.' + e : '');
      });
    }
    function upd(){ rep.style.display = mode.value === 'replace' ? '' : 'none'; start.style.display = mode.value === 'seq' ? '' : 'none'; base.placeholder = mode.value === 'replace' ? 'Buscar' : 'Nombre'; prev.innerHTML = names().slice(0, 8).map(esc).join('<br>') + (ps.length > 8 ? '<br>…' : ''); }
    [base, start, rep].forEach(function(i){ i.oninput = upd; }); mode.onchange = upd; upd();
    UI.dialog({title:'Renombrar ' + ps.length + ' archivos', body:h('div', {}, [mode, h('label', {class:'lbl', text:'Texto'}), base, rep, start, prev]), buttons:[{t:'Cancelar', v:null}, {t:'Renombrar', cls:'primary', v:true}]}).then(function(ok){
      if(!ok) return;
      var nn = names(), c = Promise.resolve();
      ps.forEach(function(p, i){ c = c.then(function(){ if(!App.validName(nn[i]) || nn[i] === VFS.base(p)) return; return VFS.uniquePath(VFS.join(VFS.parent(p), nn[i])).then(function(d){ return VFS.move(p, d); }); }); });
      return c.then(function(){ UI.toast('Archivos renombrados'); App.refresh(); });
    }).catch(UI.fail);
  });
}

/* ---------- duplicados ---------- */
function duplicates(){
  UI.busy('Buscando duplicados…');
  VFS.walk('/').then(function(all){
    var files = all.filter(function(n){ return n.kind === 'file' && n.size > 0; }), bySize = {};
    files.forEach(function(f){ (bySize[f.size] = bySize[f.size] || []).push(f); });
    var cands = []; for(var s in bySize) if(bySize[s].length > 1) cands = cands.concat(bySize[s]);
    var hashes = {}, c = Promise.resolve(), i = 0;
    cands.forEach(function(f){ c = c.then(function(){
      i++; UI.busy('Comparando ' + i + ' de ' + cands.length);
      return VFS.read(f.path).then(function(b){ return b.slice(0, 4 * 1024 * 1024).arrayBuffer(); }).then(function(ab){
        return (window.crypto && crypto.subtle ? crypto.subtle.digest('SHA-1', ab).then(function(d){ return Array.prototype.map.call(new Uint8Array(d), function(x){ return ('0' + x.toString(16)).slice(-2); }).join(''); }) : Promise.resolve(String(new Uint8Array(ab).reduce(function(a, x){ return (a * 31 + x) >>> 0; }, 7))));
      }).then(function(hh){ var k = f.size + ':' + hh; (hashes[k] = hashes[k] || []).push(f); });
    }); });
    return c.then(function(){
      UI.busy(false);
      var groups = Object.keys(hashes).map(function(k){ return hashes[k]; }).filter(function(g){ return g.length > 1; });
      if(!groups.length){ UI.alert('Sin duplicados', 'No se encontraron archivos repetidos.'); return; }
      var waste = groups.reduce(function(a, g){ return a + g[0].size * (g.length - 1); }, 0);
      var body = h('div', {style:'max-height:55vh;overflow:auto'}), del = {};
      body.appendChild(h('div', {class:'muted', style:'font-size:13px;margin-bottom:8px', text:groups.length + ' grupos · ' + UI.size(waste) + ' recuperables. Se marcaron las copias más nuevas; revisa antes de eliminar.'}));
      groups.forEach(function(g){
        g.sort(function(a, b){ return a.mtime - b.mtime; });
        var box = h('div', {style:'border:1px solid var(--border);border-radius:12px;padding:6px;margin-bottom:10px'});
        g.forEach(function(f, k){
          if(k) del[f.path] = true;
          var b = h('button', {class:'mi' + (k ? ' on' : ''), html:'<span class="grow" style="min-width:0"><span class="ell" style="display:block">' + esc(f.name) + '</span><small class="muted">' + esc(f.path) + ' · ' + esc(UI.size(f.size)) + '</small></span>', onclick:function(){ if(del[f.path]) delete del[f.path]; else del[f.path] = true; b.classList.toggle('on', !!del[f.path]); }});
          box.appendChild(b);
        });
        body.appendChild(box);
      });
      return UI.dialog({title:'Duplicados', wide:true, body:body, buttons:[{t:'Cerrar', v:null}, {t:'Eliminar marcados', cls:'danger primary', v:true}]}).then(function(ok){ if(ok && Object.keys(del).length) App.removePaths(Object.keys(del)); });
    });
  }).catch(UI.fail);
}

/* ---------- estadísticas ---------- */
function stats(C){
  var box = h('div', {class:'set', style:'padding:16px'});
  box.innerHTML = '<div class="spin"></div>';
  C.appendChild(box);
  VFS.walk('/').then(function(all){
    var files = all.filter(function(n){ return n.kind === 'file'; }), groups = {}, total = 0;
    files.forEach(function(f){ var k = UI.kindOf(f.name); var g = groups[k.k] = groups[k.k] || {n:0, s:0, c:k.c}; g.n++; g.s += f.size || 0; total += f.size || 0; });
    var names = {pdf:'PDF', image:'Imágenes', video:'Videos', audio:'Audio', word:'Word', excel:'Hojas de cálculo', ppt:'Presentaciones', zip:'ZIP', md:'Markdown', text:'Texto', code:'Código', html:'Web', epub:'Libros', other:'Otros'};
    var keys = Object.keys(groups).sort(function(a, b){ return groups[b].s - groups[a].s; });
    var big = files.slice().sort(function(a, b){ return b.size - a.size; }).slice(0, 8);
    box.innerHTML = '<div style="font-size:28px;font-weight:700">' + esc(UI.size(total)) + '</div><div class="muted">' + files.length + ' archivos · ' + all.filter(function(n){ return n.kind === 'dir' && n.path !== '/'; }).length + ' carpetas</div>';
    var bars = h('div', {class:'bars', style:'margin-top:14px'});
    keys.forEach(function(k){ var g = groups[k]; bars.appendChild(h('div', {class:'b', html:'<span class="t">' + esc(names[k] || k) + ' <small class="muted">' + g.n + '</small></span><span class="m"><i style="width:' + (total ? Math.max(1, g.s / total * 100) : 0) + '%;background:' + g.c + '"></i></span><span class="v">' + esc(UI.size(g.s)) + '</span>'})); });
    box.appendChild(bars);
    if(big.length){
      box.appendChild(h('div', {class:'sec-h', style:'margin-top:18px', text:'Archivos más grandes'}));
      big.forEach(function(f){ box.appendChild(h('button', {class:'mi', html:'<span class="grow ell">' + esc(f.name) + '</span><span class="k">' + esc(UI.size(f.size)) + '</span>', onclick:function(){ App.cd(VFS.parent(f.path)); }})); });
    }
  }).catch(UI.fail);
}

/* ---------- respaldo ---------- */
function backup(){
  UI.busy('Creando respaldo…');
  Promise.all([VFS.walk('/'), Meta.all()]).then(function(r){
    var all = r[0], z = new JSZip(), c = Promise.resolve(), files = all.filter(function(n){ return n.kind === 'file'; }), i = 0;
    all.forEach(function(n){ if(n.kind === 'dir' && n.path !== '/') z.folder('Archivero' + n.path); });
    files.forEach(function(f){ c = c.then(function(){ i++; UI.busy('Respaldando ' + i + ' de ' + files.length); return VFS.read(f.path).then(function(b){ z.file('Archivero' + f.path, b, {date:new Date(f.mtime || Date.now())}); }); }); });
    return c.then(function(){
      var settings = JSON.parse(JSON.stringify(App.S)); delete settings.pin;
      z.file('archivero-datos.json', JSON.stringify({v:1, meta:r[1], settings:settings, sigs:PDFView.sigs()}));
      return z.generateAsync({type:'blob', compression:'STORE'}, function(m){ UI.busy('Empaquetando… ' + Math.round(m.percent) + '%'); });
    });
  }).then(function(b){
    UI.busy(false);
    var name = 'Respaldo Archivero ' + stamp() + '.zip';
    var blob = new Blob([b], {type:'application/zip'});
    if(!VFS.native && navigator.canShare && navigator.canShare({files:[new File([blob], name)]})) return UI.shareFiles([{blob:blob, name:name}]);
    return UI.saveBlob(blob, name);
  }).catch(UI.fail);
}
function restore(){
  var inp = h('input', {type:'file', accept:'.zip,application/zip'});
  inp.onchange = function(){
    var f = inp.files[0]; if(!f) return;
    UI.confirm('Restaurar respaldo', 'Los archivos del respaldo se agregarán a tu archivero. Si un archivo ya existe, se guardará una copia.', 'Restaurar').then(function(ok){
      if(!ok) return;
      UI.busy('Leyendo respaldo…');
      return JSZip.loadAsync(f).then(function(z){
        var names = Object.keys(z.files).filter(function(n){ return n.indexOf('Archivero/') === 0 && n !== 'Archivero/'; }), c = Promise.resolve(), i = 0;
        names.forEach(function(n){ var e = z.files[n]; c = c.then(function(){
          i++; UI.busy('Restaurando ' + i + ' de ' + names.length);
          var p = VFS.norm(n.slice('Archivero'.length));
          if(e.dir) return VFS.mkdir(p);
          return VFS.exists(p).then(function(x){ return x ? VFS.uniquePath(p) : p; }).then(function(dst){ return e.async('blob').then(function(b){ return VFS.write(dst, new Blob([b], {type:VFS.mimeOf(n)})); }); });
        }); });
        return c.then(function(){
          var d = z.file('archivero-datos.json'); if(!d) return;
          return d.async('string').then(function(s){
            var j = JSON.parse(s);
            if(j.sigs && j.sigs.length) PDFView.saveSigs(j.sigs.concat(PDFView.sigs()).slice(0, 6));
            if(j.settings && j.settings.tags) { App.S.tags = j.settings.tags; App.save(); }
            return Promise.all((j.meta || []).map(function(m){ var p = m.path; delete m.path; delete m.opened; return Meta.patch(p, m); }));
          });
        });
      }).then(function(){ UI.busy(false); UI.toast('Respaldo restaurado'); App.renderSide(); App.go('files'); });
    }).catch(UI.fail);
  };
  inp.click();
}

/* ---------- pantalla Herramientas ---------- */
function renderTools(C){
  var groups = [
    ['Documentos', [
      ['scan', '#E5484D', 'Escanear documento', 'Cámara → PDF con bordes corregidos', function(){ scan(App.st.cwd || '/'); }],
      ['merge', '#2F6FDB', 'Unir PDF', 'Combina varios PDF en uno', function(){ pickFiles('Elige los PDF a unir', isPdf, true).then(function(ps){ if(ps) mergePdfs(ps); }); }],
      ['pages', '#8E4EC6', 'Organizar páginas', 'Ordenar, girar, borrar, dividir', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) PDFView.pages(ps[0]); }); }],
      ['sign', '#0B7A75', 'Firmar o anotar PDF', 'Firma, resalta, escribe', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) PDFView.open(ps[0]); }); }],
      ['edit', '#F76B15', 'Rellenar formulario', 'Completa campos de un PDF', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) PDFView.fillForm(ps[0]); }); }],
      ['image', '#D6409F', 'Imágenes a PDF', 'Fotos o capturas → un PDF', function(){ imagesToPdfPick(App.st.cwd || '/'); }],
      ['zip', '#7C7F86', 'Reducir PDF', 'Achica PDF pesados para enviar', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) compressPdf(ps[0]); }); }],
      ['text', '#5B6472', 'Reconocer texto (OCR)', 'Texto desde fotos o PDF escaneados', function(){ pickFiles('Elige imagen o PDF', function(n){ return isImg(n) || isPdf(n); }, false).then(function(ps){ if(ps) ocrPath(ps[0]); }); }],
      ['lock', '#2F6FDB', 'Contraseña de PDF', 'Proteger o quitar contraseña', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) UI.menu([{t:'Proteger con contraseña', i:'lock', fn:function(){ Extra.pdfPassword(ps[0]); }}, {t:'Quitar contraseña', i:'undo', fn:function(){ Extra.pdfUnlock(ps[0]); }}], null, VFS.base(ps[0])); }); }],
      ['rect', '#111', 'Censurar PDF', 'Tapa datos en negro de forma segura', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps){ PDFView.open(ps[0], {tool:'redact'}); } }); }],
      ['type', '#D9AE19', 'Editar PDF', 'Corrector blanco + texto nuevo', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps){ PDFView.open(ps[0], {tool:'white'}); } }); }]
    ]],
    ['Convertir desde PDF', [
      ['text', '#2F6FDB', 'PDF a Word', 'Texto editable en .docx', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) Extra.pdfTo(ps[0], 'docx'); }); }],
      ['table', '#1F9D55', 'PDF a Excel', 'Tablas a hoja de cálculo', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) Extra.pdfTo(ps[0], 'xlsx'); }); }],
      ['slides', '#E2662B', 'PDF a PowerPoint', 'Una diapositiva por página', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) Extra.pdfTo(ps[0], 'pptx'); }); }],
      ['image', '#8E4EC6', 'PDF a imagen', 'Cada página como JPG', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) Extra.pdfTo(ps[0], 'jpg'); }); }],
      ['text', '#5B6472', 'PDF a texto', 'Extrae todo el texto', function(){ pickFiles('Elige un PDF', isPdf, false).then(function(ps){ if(ps) Extra.pdfTo(ps[0], 'txt'); }); }]
    ]],
    ['Multimedia', [
      ['music', '#F76B15', 'Convertir audio', 'MP3 o WAV; también desde video', function(){ pickFiles('Elige audio o video', function(n){ var k = UI.kindOf(n.name).k; return k === 'audio' || k === 'video'; }, true).then(function(ps){ if(ps) Extra.convertAudio(ps); }); }],
      ['video', '#D6409F', 'Convertir video', 'A MP4, cambiar resolución', function(){ pickFiles('Elige un video', function(n){ return UI.kindOf(n.name).k === 'video'; }, false).then(function(ps){ if(ps) Extra.convertVideo(ps[0], false); }); }],
      ['zip', '#2F6FDB', 'Comprimir audio', 'MP3 liviano para enviar', function(){ pickFiles('Elige audio', function(n){ var k = UI.kindOf(n.name).k; return k === 'audio' || k === 'video'; }, true).then(function(ps){ if(ps) Extra.convertAudio(ps, 'mp3-64'); }); }],
      ['zip', '#8E4EC6', 'Comprimir video', 'Menos peso, misma duración', function(){ pickFiles('Elige un video', function(n){ return UI.kindOf(n.name).k === 'video'; }, false).then(function(ps){ if(ps) Extra.convertVideo(ps[0], true); }); }],
      ['crop', '#0B7A75', 'Recortar o cortar pista', 'Editor de audio con onda', function(){ pickFiles('Elige audio', function(n){ return UI.kindOf(n.name).k === 'audio'; }, false).then(function(ps){ if(ps) Extra.audioEditor(ps[0]); }); }],
      ['speak', '#5B4BD6', 'Eliminar silencio', 'Quita pausas largas', function(){ pickFiles('Elige audio', function(n){ return UI.kindOf(n.name).k === 'audio'; }, false).then(function(ps){ if(ps) Extra.audioEditor(ps[0]); }); }],
      ['tag', '#D34D8C', 'Editar metadatos', 'Título, artista y álbum (MP3)', function(){ pickFiles('Elige un MP3', function(n){ return VFS.ext(n.name) === 'mp3'; }, false).then(function(ps){ if(ps) Extra.editTags(ps[0]); }); }],
      ['eraser', '#13897F', 'Eliminar objetos', 'Borra elementos de una foto', function(){ pickFiles('Elige una foto', isImg, false).then(function(ps){ if(ps) Extra.eraseObjects(ps[0]); }); }]
    ]],
    ['Archivos', [
      ['upload', '#0B7A75', 'Importar archivos', 'Desde Archivos, iCloud, Drive…', App.importPick],
      ['link', '#2F6FDB', 'Descargar enlace', 'Guarda un archivo desde una URL', function(){ download(App.st.cwd || '/'); }],
      ['globe', '#13897F', 'Guardar enlace', 'Acceso directo a una página', function(){ Extra.saveLink(App.st.cwd || '/'); }],
      ['upload', '#F76B15', 'Transferir por Wi‑Fi', 'Entre el Mac y otros equipos', function(){ Extra.transfer(); }],
      ['cloud', '#3A9BDC', 'Añadir conexión', 'Nubes, SMB, FTP, WebDAV', function(){ Extra.addConnection(); }],
      ['mic', '#F76B15', 'Grabadora de voz', 'Graba audio en el archivero', function(){ record(App.st.cwd || '/'); }],
      ['image', '#30A46C', 'Convertir imágenes', 'HEIC → JPG, cambiar tamaño, comprimir', convertImages],
      ['edit', '#8E4EC6', 'Renombrar en lote', 'Numera o reemplaza nombres', batchRename],
      ['dup', '#E5484D', 'Buscar duplicados', 'Libera espacio', duplicates],
      ['archive', '#D9AE19', 'Respaldo completo', 'Todo tu archivero en un ZIP', backup],
      ['undo', '#5B6472', 'Restaurar respaldo', 'Desde un ZIP de Archivero', restore]
    ]]
  ];
  var wrap = h('div', {style:'max-width:1100px'});
  groups.forEach(function(g){
    wrap.appendChild(h('div', {class:'sec-h', text:g[0]}));
    var t = h('div', {class:'tiles'});
    g[1].forEach(function(x){ t.appendChild(h('button', {class:'tile', html:'<span class="ic" style="background:' + x[1] + '">' + icon(x[0]) + '</span><span><b>' + esc(x[2]) + '</b><span>' + esc(x[3]) + '</span></span>', onclick:x[4]})); });
    wrap.appendChild(t);
  });
  wrap.appendChild(h('div', {class:'sec-h', text:'Almacenamiento'}));
  C.appendChild(wrap);
  stats(wrap);
}

/* ---------- pantalla Ajustes ---------- */
function renderSettings(C){
  var S = App.S;
  function save(){ App.save(); App.applyTheme(); }
  var wrap = h('div', {style:'max-width:720px'});
  function section(t){ wrap.appendChild(h('div', {class:'sec-h', text:t})); var s = h('div', {class:'set'}); wrap.appendChild(s); return s; }
  function row(s, title, sub, right, onclick){ var r = h('div', {class:'r', style:onclick ? 'cursor:pointer' : '', onclick:onclick}); r.appendChild(h('div', {class:'grow', html:esc(title) + (sub ? '<small>' + esc(sub) + '</small>' : '')})); if(right) r.appendChild(typeof right === 'string' ? h('span', {style:'color:var(--accent);display:flex', html:right}) : right); s.appendChild(r); return r; }
  function sw(on, fn){ var b = h('button', {class:'sw' + (on ? ' on' : '')}); b.onclick = function(e){ e.stopPropagation(); b.classList.toggle('on'); fn(b.classList.contains('on')); }; return b; }

  var a = section('Apariencia');
  var seg = h('div', {class:'seg'});
  [['auto', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']].forEach(function(o){ seg.appendChild(h('button', {class:S.theme === o[0] ? 'on' : '', text:o[1], onclick:function(e){ S.theme = o[0]; save(); UI.$$('button', seg).forEach(function(b){ b.classList.remove('on'); }); e.currentTarget.classList.add('on'); }})); });
  row(a, 'Tema', '', seg);
  var acc = h('div', {class:'row', style:'flex-wrap:wrap;gap:4px'});
  ['#0B7A75', '#2F6FDB', '#5B4BD6', '#C2185B', '#E8590C', '#2E8B57', '#3D4451'].forEach(function(c){ acc.appendChild(h('button', {class:'swatch' + (S.accent === c ? ' on' : ''), style:'background:' + c, onclick:function(e){ S.accent = c; save(); UI.$$('.swatch', acc).forEach(function(b){ b.classList.remove('on'); }); e.currentTarget.classList.add('on'); }})); });
  row(a, 'Color de acento', '', acc);
  row(a, 'Mostrar extensiones', 'Ej.: informe.pdf', sw(S.showExt, function(v){ S.showExt = v; save(); }));
  row(a, 'Carpetas primero', '', sw(S.foldersFirst, function(v){ S.foldersFirst = v; save(); }));

  var p = section('Privacidad');
  row(p, 'Código de acceso', S.pin ? 'Activado · protege la app y las carpetas que elijas' : 'Protege la app con 4 dígitos', h('span', {class:'muted', text:S.pin ? 'Cambiar' : 'Activar'}), function(){
    (S.pin ? App.askPin('Código actual') : Promise.resolve(true)).then(function(ok){ if(ok) App.setPin().then(function(){ App.render(); }); });
  });
  if(S.pin){
    row(p, 'Bloquear al salir', 'Pide el código si la app estuvo en segundo plano más de 30 s', sw(S.lockLeave, function(v){ S.lockLeave = v; save(); }));
    row(p, 'Quitar código', '', h('span', {style:'color:var(--danger)', text:'Quitar'}), function(){ App.askPin('Código actual').then(function(ok){ if(ok){ S.pin = ''; save(); UI.toast('Código desactivado'); App.render(); } }); });
  }
  row(p, 'Confirmar antes de eliminar', '', sw(S.confirmDelete, function(v){ S.confirmDelete = v; save(); }));

  var t = section('Etiquetas');
  S.tags.forEach(function(tg, i){
    var r = row(t, tg.n, '', h('span', {class:'muted', text:'Editar'}), function(){
      UI.prompt('Nombre de la etiqueta', tg.n, {ok:'Guardar'}).then(function(n){
        if(!n || n === tg.n) return;
        var old = tg.n; tg.n = n; save();
        Meta.all().then(function(all){ return Promise.all(all.filter(function(m){ return (m.tags || []).indexOf(old) >= 0; }).map(function(m){ return Meta.patch(m.path, {tags:m.tags.map(function(x){ return x === old ? n : x; })}); })); }).then(function(){ App.renderSide(); App.render(); });
      });
    });
    r.insertBefore(h('span', {class:'tagdot', style:'background:' + tg.c + ';width:14px;height:14px'}), r.firstChild);
  });

  var f = section('Firmas');
  row(f, 'Firmas guardadas', PDFView.sigs().length + ' firma(s) para usar en PDF', h('span', {class:'muted', text:'Nueva'}), function(){ PDFView.signaturePad().then(function(){ App.render(); }); });
  if(PDFView.sigs().length) row(f, 'Borrar firmas', '', h('span', {style:'color:var(--danger)', text:'Borrar'}), function(){ UI.confirm('¿Borrar todas las firmas?', '', 'Borrar', true).then(function(ok){ if(ok){ PDFView.saveSigs([]); App.render(); } }); });

  var d = section('Almacenamiento');
  if(VFS.native){
    row(d, 'Carpeta de Archivero', VFS.rootLabel(), h('span', {class:'muted', text:'Cambiar'}), function(){ VFS.bridge({op:'chooseRoot'}).then(function(r){ if(r){ location.reload(); } }); });
    row(d, 'Mostrar en Finder', '', icon('finder'), function(){ VFS.bridge({op:'reveal', path:'/'}); });
  } else {
    row(d, 'Archivos en este dispositivo', 'Se guardan dentro de la app, sin conexión. Usa «Respaldo completo» para pasarlos a otro equipo.', null);
  }
  row(d, 'Respaldo completo', 'Exporta todo como ZIP', icon('archive'), backup);
  row(d, 'Restaurar respaldo', '', icon('undo'), restore);
  row(d, 'Borrar miniaturas', 'Se regeneran al ver las carpetas', null, function(){
    KV.get('x').then(function(){ return new Promise(function(res){ indexedDB.open('archivero').onsuccess = function(e){ var db = e.target.result, tx = db.transaction('kv', 'readwrite'), s = tx.objectStore('kv'); s.openCursor().onsuccess = function(ev){ var c = ev.target.result; if(!c) return; if(String(c.key).indexOf('th:') === 0) c.delete(); c.continue(); }; tx.oncomplete = res; }; }); }).then(function(){ UI.toast('Miniaturas borradas'); });
  });

  if(!VFS.native){
    var i = section('Instalar');
    var standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    row(i, standalone ? 'Archivero está instalada' : 'Agregar a la pantalla de inicio', standalone ? 'Funciona sin conexión como app' : 'En Safari: Compartir → «Agregar a inicio». Funciona sin conexión.', null);
  }
  var ab = section('Acerca de');
  row(ab, 'Archivero 1.0', 'Gestor de archivos, lector de PDF y reproductor. Gratis y sin publicidad. Tus archivos nunca salen de tu dispositivo.', h('img', {src:'icon-192.png', style:'width:40px;height:40px;border-radius:10px'}));
  row(ab, 'Atajos de teclado', '⌘F buscar · ⌘O importar · ⇧⌘N carpeta · ⌘C/⌘X/⌘V copiar y mover · ⌫ eliminar · ↩ renombrar · espacio abrir', null);
  C.appendChild(wrap);
}

window.Tools = {convertImages:convertImages, renderTools:renderTools, renderSettings:renderSettings, scan:scan, record:record, download:download, imagesToPdf:imagesToPdf, imagesToPdfPick:imagesToPdfPick, mergePdfs:mergePdfs, compressPdf:compressPdf, ocrPdf:ocrPath, ocrPath:ocrPath, pickFiles:pickFiles, backup:backup, restore:restore};
}());
