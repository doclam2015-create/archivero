/* Archivero — navegador, enlaces, conversiones de PDF, contraseña, multimedia, borrador de objetos,
   centro de control, transferencia por Wi‑Fi, conexiones y atajos */
(function(){
'use strict';
var $ = UI.$, h = UI.h, icon = UI.icon, esc = UI.esc;
var S = App.S;
function stamp(){ var d = new Date(), p = function(n){ return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes()); }
function dirNow(){ return App.st.sec === 'files' ? App.st.cwd : '/'; }
function writeNew(dir, name, blob){ return VFS.uniquePath(VFS.join(dir, name)).then(function(p){ return VFS.write(p, blob).then(function(){ return p; }); }); }
function ls(k, d){ try { var v = JSON.parse(localStorage.getItem('archivero_' + k)); return v == null ? d : v; } catch(e){ return d; } }
function lsSet(k, v){ try { localStorage.setItem('archivero_' + k, JSON.stringify(v)); } catch(e){} }

/* ================= NAVEGADOR ================= */
var ENGINES = {google:['Google', 'https://www.google.com/search?q=', '#4285F4'], bing:['Bing', 'https://www.bing.com/search?q=', '#0C8484'], duck:['DuckDuckGo', 'https://duckduckgo.com/?q=', '#DE5833'],
  yahoo:['Yahoo!', 'https://search.yahoo.com/search?p=', '#6001D2'], ecosia:['Ecosia', 'https://www.ecosia.org/search?q=', '#36A26D'], baidu:['Baidu', 'https://www.baidu.com/s?wd=', '#2932E1']};
var DIAL = [['Google', 'https://www.google.com', '#4285F4', 'G'], ['YouTube', 'https://www.youtube.com', '#FF0000', '▶'], ['Wikipedia', 'https://es.wikipedia.org', 'var(--text)', 'W'],
  ['Gmail', 'https://mail.google.com', '#EA4335', 'M'], ['Drive', 'https://drive.google.com', '#1FA463', 'D'], ['Apple', 'https://www.apple.com/cl/', 'var(--text)', ''], ['Reddit', 'https://www.reddit.com', '#FF4500', 'r'], ['Facebook', 'https://www.facebook.com', '#1877F2', 'f']];
function toUrl(q){
  q = q.trim();
  if(/^[a-z]+:\/\//i.test(q)) return q;
  if(/^[^\s]+\.[a-z]{2,}(\/|$|:|\?)/i.test(q)) return 'https://' + q;
  var e = ENGINES[S.engine || 'google'] || ENGINES.google;
  return e[1] + encodeURIComponent(q);
}
function browse(url, priv){
  url = toUrl(url);
  if(!priv){ var hst = ls('hist', []); hst = hst.filter(function(x){ return x.u !== url; }); hst.unshift({u:url, t:Date.now()}); lsSet('hist', hst.slice(0, 200)); }
  if(VFS.native){ VFS.bridge({op:'browse', url:url, private:!!priv}).catch(UI.fail); return; }
  var w = window.open(url, '_blank', priv ? 'noopener,noreferrer' : 'noopener');
  if(!w) location.href = url;
}
function renderBrowser(C){
  var wrap = h('div', {style:'max-width:900px;margin:0 auto'});
  var bar = h('div', {class:'row', style:'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:6px 6px 6px 8px;margin:6px 0 16px;box-shadow:var(--shadow)'});
  var eng = ENGINES[S.engine || 'google'];
  var eb = h('button', {class:'tb', title:'Motor de búsqueda', html:'<b style="color:' + eng[2] + ';font-size:17px">' + eng[0].charAt(0) + '</b>'});
  eb.onclick = function(e){ UI.menu(Object.keys(ENGINES).map(function(k){ return {t:ENGINES[k][0], on:(S.engine || 'google') === k, fn:function(){ S.engine = k; App.save(); App.render(); }}; }), e.currentTarget, 'Motores de búsqueda'); };
  var inp = h('input', {class:'grow', style:'border:0;outline:none;background:none;font-size:16px;height:36px', placeholder:'Busca o introduce el sitio web', autocapitalize:'none', autocorrect:'off', spellcheck:'false', type:'url', inputmode:'url'});
  var priv = h('button', {class:'tb', title:'Pestaña privada (no guarda historial)', html:icon('eye')});
  var isPriv = false;
  priv.onclick = function(){ isPriv = !isPriv; priv.classList.toggle('on', isPriv); UI.toast(isPriv ? 'Navegación privada activada' : 'Navegación privada desactivada'); };
  inp.addEventListener('keydown', function(e){ if(e.key === 'Enter' && inp.value.trim()){ browse(inp.value, isPriv); inp.value = ''; } });
  bar.appendChild(eb); bar.appendChild(inp); bar.appendChild(priv);
  bar.appendChild(h('button', {class:'tb solid', html:icon('chev'), onclick:function(){ if(inp.value.trim()){ browse(inp.value, isPriv); inp.value = ''; } }}));
  wrap.appendChild(bar);
  if(!VFS.native) wrap.appendChild(h('div', {class:'muted', style:'font-size:12.5px;margin:-8px 4px 14px', text:'En iPhone y iPad las páginas se abren en Safari. Para guardar un archivo usa «Descargar enlace» o comparte desde Safari a Archivero con «Guardar en Archivos». En el Mac se abren dentro de Archivero y las descargas llegan a la carpeta Descargas.'}));
  var dial = h('div', {style:'display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:14px;margin-bottom:22px'});
  function tile(t, u, c, l){
    var b = h('button', {style:'display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12.5px', html:'<span style="width:58px;height:58px;border-radius:15px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;font:700 24px -apple-system;color:' + c + '">' + (l || esc(t.charAt(0))) + '</span><span class="ell" style="max-width:86px">' + esc(t) + '</span>', onclick:function(){ browse(u, isPriv); }});
    return b;
  }
  var bmBtn = h('button', {style:'display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12.5px', html:'<span style="width:58px;height:58px;border-radius:15px;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;color:var(--accent)">' + icon('book') + '</span><span>Marcadores</span>', onclick:bookmarks});
  dial.appendChild(bmBtn);
  DIAL.forEach(function(d){ dial.appendChild(tile(d[0], d[1], d[2], d[3] || (d[0] === 'Apple' ? '' : null))); });
  (S.bookmarks || []).slice(0, 12).forEach(function(b){ dial.appendChild(tile(b.t, b.u, S.accent)); });
  wrap.appendChild(dial);
  var hst = ls('hist', []);
  var hd = h('div', {class:'row'}, [h('div', {class:'sec-h grow', text:'Historial'})]);
  if(hst.length) hd.appendChild(h('button', {class:'btn sec', style:'padding:5px 10px;font-size:12.5px', text:'Borrar historial', onclick:function(){ lsSet('hist', []); App.render(); }}));
  wrap.appendChild(hd);
  var set = h('div', {class:'set', style:'max-width:none'});
  if(!hst.length) set.appendChild(h('div', {class:'r muted', text:'Aún no has visitado páginas.'}));
  hst.slice(0, 25).forEach(function(x){
    var host = x.u.replace(/^https?:\/\//, '').split('/')[0];
    var r = h('div', {class:'r', style:'cursor:pointer', html:icon('globe') + '<div class="grow" style="min-width:0"><div class="ell">' + esc(decodeURIComponent(x.u.replace(/^https?:\/\//, '')).slice(0, 140)) + '</div><small>' + esc(host) + ' · ' + esc(UI.date(x.t)) + '</small></div>', onclick:function(){ browse(x.u); }});
    r.appendChild(h('button', {class:'tb', title:'Más', html:icon('more'), onclick:function(e){ e.stopPropagation(); UI.menu([
      {t:'Abrir', i:'globe', fn:function(){ browse(x.u); }}, {t:'Añadir a marcadores', i:'book', fn:function(){ addBookmark(x.u); }},
      {t:'Guardar enlace en Archivero', i:'link', fn:function(){ saveLink(dirNow(), x.u); }}, {t:'Descargar archivo', i:'download', fn:function(){ Tools.download(dirNow(), x.u); }},
      {t:'Copiar enlace', i:'copy', fn:function(){ UI.copyText(x.u).then(function(){ UI.toast('Enlace copiado'); }); }}], e.currentTarget, host); }}));
    set.appendChild(r);
  });
  wrap.appendChild(set);
  C.appendChild(wrap);
}
function addBookmark(u, t){
  UI.prompt('Nombre del marcador', t || u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], {ok:'Guardar'}).then(function(n){
    if(!n) return; S.bookmarks = (S.bookmarks || []).filter(function(b){ return b.u !== u; }); S.bookmarks.unshift({t:n, u:u}); App.save(); UI.toast('Marcador guardado'); App.render();
  });
}
function bookmarks(){
  var body = h('div', {style:'max-height:55vh;overflow:auto'});
  function draw(){
    body.innerHTML = '';
    if(!(S.bookmarks || []).length) body.appendChild(h('div', {class:'muted', style:'padding:20px;text-align:center', text:'Sin marcadores. Agrégalos desde el historial o con «Nuevo».'}));
    (S.bookmarks || []).forEach(function(b, i){
      body.appendChild(h('div', {class:'row', style:'border-bottom:1px solid var(--border);padding:4px 0'}, [
        h('button', {class:'mi grow', html:icon('book') + '<span class="ell">' + esc(b.t) + '</span>', onclick:function(){ browse(b.u); }}),
        h('button', {class:'tb', style:'color:var(--danger)', html:icon('trash'), onclick:function(){ S.bookmarks.splice(i, 1); App.save(); draw(); }})]));
    });
  }
  draw();
  UI.dialog({title:'Marcadores', body:body, buttons:[{t:'Cerrar', v:null}, {t:'Nuevo', v:'new', cls:'primary'}]}).then(function(v){
    if(v === 'new') UI.prompt('Dirección', 'https://', {type:'url', caps:'none'}).then(function(u){ if(u) addBookmark(toUrl(u)); });
    else App.render();
  });
}

/* ================= ENLACES GUARDADOS ================= */
function saveLink(dir, url, title){
  (url ? Promise.resolve(url) : UI.prompt('Guardar enlace', '', {type:'url', caps:'none', placeholder:'https://…', ok:'Siguiente', msg:'Pega un enlace (YouTube, artículo, documento web). Se guarda como acceso directo en la carpeta.'})).then(function(u){
    if(!u) return;
    u = toUrl(u);
    var def = title || u.replace(/^https?:\/\/(www\.)?/, '').replace(/[\/?#].*$/, '');
    return UI.prompt('Nombre', def, {ok:'Guardar'}).then(function(n){
      if(!n) return;
      return writeNew(dir, n.replace(/[\/\\:]/g, '-') + '.url', new Blob(['[InternetShortcut]\r\nURL=' + u + '\r\n'], {type:'text/plain'})).then(function(){ UI.toast('Enlace guardado'); App.refresh(); });
    });
  }).catch(UI.fail);
}
function linkOf(path){
  return VFS.text(path).then(function(t){
    var m = t.match(/URL=(\S+)/) || t.match(/<string>(https?:[^<]+)<\/string>/) || t.match(/https?:\/\/\S+/);
    return m ? (m[1] || m[0]).replace(/&amp;/g, '&') : null;
  });
}
function openLink(path){
  linkOf(path).then(function(u){
    if(!u) return UI.toast('Enlace no válido');
    UI.menu([{t:'Abrir', i:'globe', fn:function(){ browse(u); }}, {t:'Copiar enlace', i:'copy', fn:function(){ UI.copyText(u).then(function(){ UI.toast('Enlace copiado'); }); }},
      {t:'Descargar el archivo del enlace', i:'download', fn:function(){ Tools.download(VFS.parent(path), u); }}, {t:'Añadir a marcadores', i:'book', fn:function(){ addBookmark(u, VFS.stem(VFS.base(path))); }}], null, u);
  });
}

/* ================= PDF → otros formatos ================= */
function pdfLines(path){
  return PDFView.bytes(path).then(function(ab){ return PDFView.loadDoc(ab, VFS.base(path)); }).then(function(doc){
    var pages = [], c = Promise.resolve();
    for(var i = 1; i <= doc.numPages; i++) (function(i){ c = c.then(function(){
      UI.busy('Leyendo página ' + i + ' de ' + doc.numPages);
      return doc.getPage(i).then(function(p){ return p.getTextContent().then(function(tc){
        // agrupa por línea (misma altura) y separa celdas por espacios grandes
        var rows = [];
        tc.items.forEach(function(it){
          if(!it.str || !it.str.trim()) return;
          var y = it.transform[5], x = it.transform[4], hgt = Math.abs(it.transform[3]) || 10, r = null;
          for(var k = 0; k < rows.length; k++) if(Math.abs(rows[k].y - y) < hgt * .45){ r = rows[k]; break; }
          if(!r){ r = {y:y, h:hgt, items:[]}; rows.push(r); }
          r.items.push({x:x, w:it.width, s:it.str});
        });
        rows.sort(function(a, b){ return b.y - a.y; });
        rows.forEach(function(r){
          r.items.sort(function(a, b){ return a.x - b.x; });
          var cells = [], cur = null, end = 0;
          r.items.forEach(function(it){
            if(cur && it.x - end < r.h * 1.2){ cur.s += (it.x - end > r.h * .15 ? ' ' : '') + it.s; }
            else { cur = {x:it.x, s:it.s}; cells.push(cur); }
            end = it.x + it.w;
          });
          r.cells = cells; r.text = cells.map(function(c){ return c.s; }).join('   ');
        });
        pages.push({rows:rows, w:p.getViewport({scale:1}).width});
      }); });
    }); }(i));
    return c.then(function(){ return {doc:doc, pages:pages}; });
  });
}
function xmlEsc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
function pdfTo(path, fmt){
  var base = VFS.stem(VFS.base(path)), dir = VFS.parent(path);
  UI.busy('Convirtiendo…');
  var job;
  if(fmt === 'txt' || fmt === 'docx' || fmt === 'xlsx'){
    job = pdfLines(path).then(function(r){
      var empty = r.pages.every(function(p){ return !p.rows.length; });
      if(empty) throw new Error('El PDF no tiene texto (parece escaneado). Usa «Reconocer texto (OCR)» primero.');
      if(fmt === 'txt') return writeNew(dir, base + '.txt', new Blob([r.pages.map(function(p){ return p.rows.map(function(x){ return x.text; }).join('\n'); }).join('\n\n')], {type:'text/plain'}));
      if(fmt === 'xlsx') return UI.loadScript('lib/xlsx.full.min.js').then(function(){
        var wb = XLSX.utils.book_new();
        r.pages.forEach(function(p, i){
          // columnas: posiciones x de las celdas agrupadas
          var xs = [];
          p.rows.forEach(function(row){ row.cells.forEach(function(c){ if(!xs.some(function(x){ return Math.abs(x - c.x) < 12; })) xs.push(c.x); }); });
          xs.sort(function(a, b){ return a - b; });
          var aoa = p.rows.map(function(row){
            var line = [];
            row.cells.forEach(function(c){ var k = 0, bd = 1e9; xs.forEach(function(x, j){ var d = Math.abs(x - c.x); if(d < bd){ bd = d; k = j; } }); while(line[k] != null) k++; var n = c.s.replace(/\./g, '').replace(',', '.'); line[k] = /^-?\d+(\.\d+)?$/.test(n.trim()) && c.s.trim().length < 16 ? +n : c.s; });
            for(var q = 0; q < line.length; q++) if(line[q] == null) line[q] = '';
            return line;
          });
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.length ? aoa : [['']]), ('Página ' + (i + 1)).slice(0, 31));
        });
        return writeNew(dir, base + '.xlsx', new Blob([XLSX.write(wb, {bookType:'xlsx', type:'array'})], {type:VFS.mimeOf('a.xlsx')}));
      });
      // Word: párrafos por línea, salto de página entre páginas, títulos por tamaño de letra
      var maxH = 0; r.pages.forEach(function(p){ p.rows.forEach(function(x){ maxH = Math.max(maxH, x.h); }); });
      var body = r.pages.map(function(p, i){
        var avg = p.rows.reduce(function(a, x){ return a + x.h; }, 0) / Math.max(1, p.rows.length);
        return p.rows.map(function(x){
          var big = x.h > avg * 1.35, sz = Math.round(Math.min(48, Math.max(16, x.h * 2)));
          return '<w:p>' + (big ? '<w:pPr><w:pStyle w:val="Heading2"/></w:pPr>' : '') + '<w:r><w:rPr>' + (big ? '<w:b/>' : '') + '<w:sz w:val="' + sz + '"/></w:rPr><w:t xml:space="preserve">' + xmlEsc(x.text.replace(/ {3}/g, '\t')) + '</w:t></w:r></w:p>';
        }).join('') + (i < r.pages.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '');
      }).join('');
      var z = new JSZip();
      z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
      z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
      z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>');
      return z.generateAsync({type:'blob'}).then(function(b){ return writeNew(dir, base + '.docx', new Blob([b], {type:VFS.mimeOf('a.docx')})); });
    });
  } else if(fmt === 'pptx' || fmt === 'jpg'){
    job = PDFView.bytes(path).then(function(ab){ return PDFView.loadDoc(ab, VFS.base(path)); }).then(function(doc){
      var imgs = [], c = Promise.resolve();
      for(var i = 1; i <= doc.numPages; i++) (function(i){ c = c.then(function(){
        UI.busy('Página ' + i + ' de ' + doc.numPages);
        return doc.getPage(i).then(function(p){ var vp = p.getViewport({scale:2}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
          return p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){ imgs.push({c:cv, w:vp.width, h:vp.height}); }); });
      }); }(i));
      return c.then(function(){
        if(fmt === 'jpg'){
          return VFS.uniquePath(VFS.join(dir, base + ' (imágenes)')).then(function(d){
            var cc = VFS.mkdir(d);
            imgs.forEach(function(im, k){ cc = cc.then(function(){ return UI.canvasBlob(im.c, 'image/jpeg', .9).then(function(b){ return VFS.write(VFS.join(d, 'Página ' + (k + 1) + '.jpg'), b); }); }); });
            return cc.then(function(){ return d; });
          });
        }
        return UI.loadScript('lib/pptxgen.bundle.js').then(function(){
          var pp = new PptxGenJS(), W = 10, H = W * imgs[0].h / imgs[0].w;
          pp.defineLayout({name:'PDF', width:W, height:H}); pp.layout = 'PDF';
          imgs.forEach(function(im){ var s = pp.addSlide(); var hh = W * im.h / im.w, w = W; if(hh > H){ w = W * H / hh; hh = H; } s.addImage({data:im.c.toDataURL('image/jpeg', .88), x:(W - w) / 2, y:(H - hh) / 2, w:w, h:hh}); });
          return pp.write({outputType:'blob'});
        }).then(function(b){ return writeNew(dir, base + '.pptx', new Blob([b], {type:VFS.mimeOf('a.pptx')})); });
      });
    });
  }
  return job.then(function(p){ UI.busy(false); UI.toast('Creado ' + VFS.base(p)); App.refresh(); return p; }).catch(UI.fail);
}

/* ================= CONTRASEÑA DE PDF ================= */
function pdfPassword(path){
  var a = h('input', {class:'field', type:'password', placeholder:'Contraseña'}), b = h('input', {class:'field', type:'password', placeholder:'Repite la contraseña', style:'margin-top:8px'});
  var note = VFS.native ? 'Se crea una copia protegida (cifrado AES). El texto sigue seleccionable.' : 'Se crea una copia protegida. En iPhone/iPad las páginas se guardan como imagen; en el Mac se conserva el texto.';
  UI.dialog({title:'Proteger PDF con contraseña', body:h('div', {}, [a, b, h('div', {class:'muted', style:'font-size:12.5px;margin-top:10px', text:note})]),
    buttons:[{t:'Cancelar', v:null}, {t:'Proteger', cls:'primary', v:true, check:function(){ if(a.value.length < 4){ UI.toast('Mínimo 4 caracteres'); return false; } if(a.value !== b.value){ UI.toast('Las contraseñas no coinciden'); return false; } }}]}).then(function(ok){
    if(!ok) return;
    var pass = a.value, dst;
    UI.busy('Protegiendo…');
    return VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)) + ' (protegido).pdf')).then(function(d){
      dst = d;
      if(VFS.native) return VFS.bridge({op:'pdfLock', path:path, dst:d, pass:pass});
      return pdfImages(path, 1.6).then(function(imgs){
        return UI.loadScript('lib/jspdf.umd.min.js').then(function(){
          var J = window.jspdf.jsPDF, first = imgs[0];
          var pdf = new J({unit:'pt', format:[first.w, first.h], orientation:first.w > first.h ? 'l' : 'p', encryption:{userPassword:pass, ownerPassword:pass + '#owner', userPermissions:['print', 'copy']}});
          imgs.forEach(function(im, i){ if(i) pdf.addPage([im.w, im.h], im.w > im.h ? 'l' : 'p'); pdf.addImage(im.data, 'JPEG', 0, 0, im.w, im.h); });
          return VFS.write(d, pdf.output('blob'));
        });
      });
    }).then(function(){ UI.busy(false); UI.toast('Creado ' + VFS.base(dst)); App.refresh(); });
  }).catch(UI.fail);
}
function pdfUnlock(path){
  UI.prompt('Quitar contraseña', '', {type:'password', msg:'Escribe la contraseña actual de «' + VFS.base(path) + '». Se crea una copia sin protección.', ok:'Quitar'}).then(function(pass){
    if(!pass) return;
    UI.busy('Quitando contraseña…');
    var dst;
    return VFS.uniquePath(VFS.join(VFS.parent(path), VFS.stem(VFS.base(path)).replace(/ \(protegido\)$/, '') + ' (sin clave).pdf')).then(function(d){
      dst = d;
      if(VFS.native) return VFS.bridge({op:'pdfUnlock', path:path, dst:d, pass:pass});
      return pdfImages(path, 1.6, pass).then(function(imgs){
        return PDFView.plib().then(function(P){ return P.PDFDocument.create().then(function(pdf){
          var c = Promise.resolve();
          imgs.forEach(function(im){ c = c.then(function(){ return fetch(im.data).then(function(r){ return r.arrayBuffer(); }).then(function(ab){ return pdf.embedJpg(ab); }).then(function(img){ pdf.addPage([im.w, im.h]).drawImage(img, {x:0, y:0, width:im.w, height:im.h}); }); }); });
          return c.then(function(){ return pdf.save(); });
        }); });
      }).then(function(out){ return VFS.write(d, new Blob([out], {type:'application/pdf'})); });
    }).then(function(){ UI.busy(false); UI.toast('Creado ' + VFS.base(dst)); App.refresh(); });
  }).catch(UI.fail);
}
function pdfImages(path, scale, pass){
  return PDFView.lib().then(function(L){ return PDFView.bytes(path).then(function(ab){ return L.getDocument({data:new Uint8Array(ab), password:pass || undefined}).promise; }); }).then(function(doc){
    var out = [], c = Promise.resolve();
    for(var i = 1; i <= doc.numPages; i++) (function(i){ c = c.then(function(){
      UI.busy('Página ' + i + ' de ' + doc.numPages);
      return doc.getPage(i).then(function(p){ var v1 = p.getViewport({scale:1}), vp = p.getViewport({scale:scale}), cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
        return p.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise.then(function(){ out.push({data:cv.toDataURL('image/jpeg', .85), w:v1.width, h:v1.height}); }); });
    }); }(i));
    return c.then(function(){ return out; });
  }).catch(function(e){ if(e && e.name === 'PasswordException') throw new Error('Contraseña incorrecta'); throw e; });
}

/* ================= AUDIO ================= */
var actx = null;
function ctx(){ if(!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function decode(blob){ return blob.arrayBuffer().then(function(ab){ return new Promise(function(res, rej){ var p = ctx().decodeAudioData(ab, res, function(){ rej(new Error('No se pudo leer el audio de este archivo')); }); if(p && p.then) p.then(res, function(){ rej(new Error('No se pudo leer el audio de este archivo')); }); }); }); }
function slice(buf, a, b){ // copia [a,b) en segundos
  var sr = buf.sampleRate, s = Math.max(0, Math.floor(a * sr)), e = Math.min(buf.length, Math.floor(b * sr)), n = Math.max(1, e - s);
  var out = ctx().createBuffer(buf.numberOfChannels, n, sr);
  for(var c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(s, s + n));
  return out;
}
function concat(list){
  var sr = list[0].sampleRate, ch = list[0].numberOfChannels, n = list.reduce(function(a, b){ return a + b.length; }, 0), out = ctx().createBuffer(ch, Math.max(1, n), sr), off = 0;
  list.forEach(function(b){ for(var c = 0; c < ch; c++) out.getChannelData(c).set(b.getChannelData(Math.min(c, b.numberOfChannels - 1)), off); off += b.length; });
  return out;
}
function removeSilence(buf, thrDb, minSec){
  var sr = buf.sampleRate, win = Math.floor(sr * .02), thr = Math.pow(10, thrDb / 20), keep = [], n = buf.length, d0 = buf.getChannelData(0), d1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : d0;
  var silentRun = 0, segStart = 0, inSil = false, silStart = 0;
  for(var i = 0; i < n; i += win){
    var m = 0; for(var j = i; j < Math.min(n, i + win); j++){ var v = Math.max(Math.abs(d0[j]), Math.abs(d1[j])); if(v > m) m = v; }
    if(m < thr){ if(!inSil){ inSil = true; silStart = i; } }
    else if(inSil){ inSil = false; if((i - silStart) / sr >= minSec){ keep.push([segStart, silStart + win * 5]); segStart = i - win * 5; } }
  }
  if(inSil && (n - silStart) / sr >= minSec) keep.push([segStart, silStart + win * 5]); else keep.push([segStart, n]);
  return concat(keep.filter(function(k){ return k[1] > k[0]; }).map(function(k){ return slice(buf, Math.max(0, k[0]) / sr, Math.min(n, k[1]) / sr); }));
}
function normalize(buf){
  var m = 0; for(var c = 0; c < buf.numberOfChannels; c++){ var d = buf.getChannelData(c); for(var i = 0; i < d.length; i++){ var v = Math.abs(d[i]); if(v > m) m = v; } }
  if(m < .001) return buf; var k = .98 / m;
  for(var c2 = 0; c2 < buf.numberOfChannels; c2++){ var d2 = buf.getChannelData(c2); for(var i2 = 0; i2 < d2.length; i2++) d2[i2] *= k; }
  return buf;
}
function toWav(buf){
  var ch = Math.min(2, buf.numberOfChannels), sr = buf.sampleRate, n = buf.length, b = new ArrayBuffer(44 + n * ch * 2), v = new DataView(b);
  function w(o, s){ for(var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  var data = []; for(var c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  var o = 44; for(var i = 0; i < n; i++) for(var c2 = 0; c2 < ch; c2++){ var s = Math.max(-1, Math.min(1, data[c2][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
  return new Blob([b], {type:'audio/wav'});
}
function toMp3(buf, kbps, mono, tags){
  return UI.loadScript('lib/lame.min.js').then(function(){
    var sr = buf.sampleRate;
    if([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].indexOf(sr) < 0){ throw new Error('Frecuencia no compatible con MP3: ' + sr); }
    var ch = mono || buf.numberOfChannels < 2 ? 1 : 2, enc = new lamejs.Mp3Encoder(ch, sr, kbps || 128), out = [];
    function i16(f){ var o = new Int16Array(f.length); for(var i = 0; i < f.length; i++){ var s = Math.max(-1, Math.min(1, f[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; } return o; }
    var L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
    if(ch === 1 && buf.numberOfChannels > 1){ var M = new Float32Array(L.length); for(var k = 0; k < L.length; k++) M[k] = (L[k] + R[k]) / 2; L = M; }
    var l16 = i16(L), r16 = ch === 2 ? i16(R) : null, B = 1152 * 20;
    for(var i = 0; i < l16.length; i += B){ var m = ch === 2 ? enc.encodeBuffer(l16.subarray(i, i + B), r16.subarray(i, i + B)) : enc.encodeBuffer(l16.subarray(i, i + B)); if(m.length) out.push(new Uint8Array(m)); }
    var f = enc.flush(); if(f.length) out.push(new Uint8Array(f));
    if(tags) out.unshift(id3(tags));
    return new Blob(out, {type:'audio/mpeg'});
  });
}
/* ID3v2.3 */
function id3(t){
  var frames = [];
  function fr(id, s){ if(!s) return; var enc = new Uint8Array(1 + s.length * 2 + 2), dv; enc[0] = 1; enc[1] = 0xFF; enc[2] = 0xFE; for(var i = 0; i < s.length; i++){ enc[3 + i * 2] = s.charCodeAt(i) & 255; enc[4 + i * 2] = s.charCodeAt(i) >> 8; } enc = enc.subarray(0, 3 + s.length * 2);
    var f = new Uint8Array(10 + enc.length); for(var k = 0; k < 4; k++) f[k] = id.charCodeAt(k); dv = new DataView(f.buffer); dv.setUint32(4, enc.length); f.set(enc, 10); frames.push(f); }
  fr('TIT2', t.title); fr('TPE1', t.artist); fr('TALB', t.album); fr('TYER', t.year); fr('TCON', t.genre); fr('COMM', null);
  var size = frames.reduce(function(a, f){ return a + f.length; }, 0), head = new Uint8Array(10 + size);
  head.set([73, 68, 51, 3, 0, 0, (size >> 21) & 127, (size >> 14) & 127, (size >> 7) & 127, size & 127]);
  var o = 10; frames.forEach(function(f){ head.set(f, o); o += f.length; });
  return head;
}
function readId3(u8){
  var t = {};
  if(u8[0] !== 73 || u8[1] !== 68 || u8[2] !== 51) return {tags:t, skip:0};
  var size = (u8[6] << 21) | (u8[7] << 14) | (u8[8] << 7) | u8[9], ver = u8[3], o = 10, end = 10 + size;
  var map = {TIT2:'title', TPE1:'artist', TALB:'album', TYER:'year', TDRC:'year', TCON:'genre'};
  while(o + 10 < end){
    var id = String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    var fs = ver === 4 ? ((u8[o + 4] << 21) | (u8[o + 5] << 14) | (u8[o + 6] << 7) | u8[o + 7]) : ((u8[o + 4] << 24) | (u8[o + 5] << 16) | (u8[o + 6] << 8) | u8[o + 7]);
    if(!/^[A-Z0-9]{4}$/.test(id) || fs <= 0) break;
    if(map[id]){
      var d = u8.subarray(o + 11, o + 10 + fs), e = u8[o + 10], s = '';
      if(e === 1 || e === 2){ var st = (d[0] === 0xFF || d[0] === 0xFE) ? 2 : 0, le = d[0] === 0xFF; for(var i = st; i + 1 < d.length; i += 2){ var c = le || e === 1 && d[0] !== 0xFE ? d[i] | (d[i + 1] << 8) : (d[i] << 8) | d[i + 1]; if(c) s += String.fromCharCode(c); } }
      else s = new TextDecoder(e === 3 ? 'utf-8' : 'latin1').decode(d).replace(/\0/g, '');
      t[map[id]] = s.trim();
    }
    o += 10 + fs;
  }
  return {tags:t, skip:end};
}
function editTags(path){
  VFS.read(path).then(function(b){ return b.arrayBuffer(); }).then(function(ab){
    var u8 = new Uint8Array(ab), r = readId3(u8), t = r.tags;
    if(VFS.ext(path) !== 'mp3'){ UI.alert('Solo MP3', 'Los metadatos se editan en archivos MP3. Convierte el audio a MP3 primero (Editor de audio → Guardar como MP3).'); return; }
    var f = {}, body = h('div');
    [['title', 'Título'], ['artist', 'Artista'], ['album', 'Álbum'], ['year', 'Año'], ['genre', 'Género']].forEach(function(x){ body.appendChild(h('label', {class:'lbl', text:x[1]})); f[x[0]] = h('input', {class:'field', value:t[x[0]] || ''}); body.appendChild(f[x[0]]); });
    return UI.dialog({title:'Editar metadatos', body:body, buttons:[{t:'Cancelar', v:null}, {t:'Guardar', cls:'primary', v:true}]}).then(function(ok){
      if(!ok) return;
      var nt = {}; for(var k in f) nt[k] = f[k].value.trim();
      return VFS.write(path, new Blob([id3(nt), u8.subarray(r.skip)], {type:'audio/mpeg'})).then(function(){ UI.toast('Metadatos guardados'); });
    });
  }).catch(UI.fail);
}
function audioEditor(path){
  var v = Viewers.shell(path, {sub:'Editor de audio'});
  var wrap = h('div', {style:'max-width:1000px;margin:0 auto;padding:20px'});
  var cv = h('canvas', {style:'width:100%;height:200px;background:var(--surface);border:1px solid var(--border);border-radius:14px;touch-action:none;cursor:crosshair'});
  var info = h('div', {class:'row muted', style:'justify-content:space-between;font-size:13px;margin:8px 2px'});
  var hint = h('div', {class:'muted', style:'font-size:13px;margin-top:4px', text:'Arrastra sobre la onda para seleccionar un tramo. Luego recórtalo (conservar) o córtalo (eliminar).'});
  wrap.appendChild(cv); wrap.appendChild(info); wrap.appendChild(hint);
  v.body.appendChild(wrap);
  var buf = null, hist = [], sel = null, src = null, playStart = 0, raf = 0, t0 = 0, playing = false;
  v.cleanup.push(function(){ stop(); });
  decode(null || new Blob()).catch(function(){});
  VFS.read(path).then(decode).then(function(b){ buf = b; draw(); bar(); }).catch(function(e){ wrap.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  function draw(){
    var r = cv.getBoundingClientRect(), W = cv.width = r.width * 2, H = cv.height = r.height * 2, x = cv.getContext('2d');
    x.clearRect(0, 0, W, H);
    if(!buf) return;
    var d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / W));
    if(sel){ x.fillStyle = S.accent + '33'; x.fillRect(sel[0] / buf.duration * W, 0, (sel[1] - sel[0]) / buf.duration * W, H); }
    x.fillStyle = S.accent;
    for(var i = 0; i < W; i++){ var m = 0, mn = 0; for(var j = i * step; j < Math.min(d.length, (i + 1) * step); j += Math.max(1, step >> 4)){ if(d[j] > m) m = d[j]; if(d[j] < mn) mn = d[j]; } x.fillRect(i, H / 2 - m * H / 2, 1, Math.max(1, (m - mn) * H / 2)); }
    if(playing){ var pos = playStart + (ctx().currentTime - t0); x.fillStyle = '#E5484D'; x.fillRect(pos / buf.duration * W, 0, 3, H); }
    info.innerHTML = '<span>Duración ' + UI.dur(buf.duration) + ' · ' + buf.sampleRate + ' Hz · ' + (buf.numberOfChannels > 1 ? 'estéreo' : 'mono') + '</span><span>' + (sel ? 'Selección ' + UI.dur(sel[0]) + ' – ' + UI.dur(sel[1]) + ' (' + (sel[1] - sel[0]).toFixed(1).replace('.', ',') + ' s)' : '') + '</span>';
  }
  var drag = null;
  cv.addEventListener('pointerdown', function(e){ if(!buf) return; cv.setPointerCapture(e.pointerId); var r = cv.getBoundingClientRect(); drag = (e.clientX - r.left) / r.width * buf.duration; sel = null; draw(); });
  cv.addEventListener('pointermove', function(e){ if(drag == null) return; var r = cv.getBoundingClientRect(), t = Math.max(0, Math.min(buf.duration, (e.clientX - r.left) / r.width * buf.duration)); sel = [Math.min(drag, t), Math.max(drag, t)]; draw(); });
  cv.addEventListener('pointerup', function(){ if(sel && sel[1] - sel[0] < .05) sel = null; drag = null; draw(); });
  function stop(){ if(src){ try { src.stop(); } catch(e){} src = null; } playing = false; cancelAnimationFrame(raf); draw(); }
  function play(){
    if(playing){ stop(); return; }
    var a = sel ? sel[0] : 0, b = sel ? sel[1] : buf.duration;
    src = ctx().createBufferSource(); src.buffer = buf; src.connect(ctx().destination);
    if(ctx().state === 'suspended') ctx().resume();
    src.start(0, a, b - a); playStart = a; t0 = ctx().currentTime; playing = true;
    src.onended = function(){ playing = false; draw(); };
    (function loop(){ draw(); if(playing) raf = requestAnimationFrame(loop); }());
  }
  function change(nb, msg){ stop(); hist.push(buf); buf = nb; sel = null; draw(); UI.toast(msg); v.dirty = function(){ return true; }; }
  function bar(){
    Viewers.tool('play', 'Reproducir (selección o todo)', play);
    Viewers.tool('crop', 'Recortar: conservar selección', function(){ if(!sel) return UI.toast('Selecciona un tramo'); change(slice(buf, sel[0], sel[1]), 'Recortado'); });
    Viewers.tool('x', 'Cortar: eliminar selección', function(){ if(!sel) return UI.toast('Selecciona un tramo'); change(concat([slice(buf, 0, sel[0]), slice(buf, sel[1], buf.duration)]), 'Tramo eliminado'); });
    Viewers.tool('speak', 'Eliminar silencios', function(){
      var th = h('select', {class:'field'}); [['-45', 'Silencio absoluto (−45 dB)'], ['-38', 'Normal (−38 dB)'], ['-30', 'Agresivo (−30 dB)']].forEach(function(o){ th.appendChild(h('option', {value:o[0], text:o[1]})); }); th.value = '-38';
      var mn = h('select', {class:'field', style:'margin-top:8px'}); [['0.4', 'Pausas de más de 0,4 s'], ['0.8', 'Pausas de más de 0,8 s'], ['1.5', 'Pausas de más de 1,5 s']].forEach(function(o){ mn.appendChild(h('option', {value:o[0], text:o[1]})); }); mn.value = '0.8';
      UI.dialog({title:'Eliminar silencios', body:h('div', {}, [th, mn]), buttons:[{t:'Cancelar', v:null}, {t:'Eliminar', cls:'primary', v:true}]}).then(function(ok){
        if(!ok) return; var before = buf.duration, nb = removeSilence(buf, +th.value, +mn.value);
        change(nb, 'Quitados ' + (before - nb.duration).toFixed(1).replace('.', ',') + ' s de silencio');
      });
    });
    Viewers.tool('sliders', 'Normalizar volumen', function(){ var c = slice(buf, 0, buf.duration); change(normalize(c), 'Volumen normalizado'); });
    Viewers.tool('undo', 'Deshacer', function(){ if(!hist.length) return; stop(); buf = hist.pop(); sel = null; draw(); });
    Viewers.tool('tag', 'Metadatos (MP3)', function(){ editTags(path); });
    v.tools.appendChild(h('button', {class:'btn', style:'margin-left:8px;padding:8px 14px', text:'Guardar…', onclick:saveAs}));
  }
  function saveAs(){
    var fmt = h('select', {class:'field'}); [['mp3-192', 'MP3 alta calidad (192 kbps)'], ['mp3-128', 'MP3 (128 kbps)'], ['mp3-64', 'MP3 liviano (64 kbps, mono)'], ['wav', 'WAV sin pérdida']].forEach(function(o){ fmt.appendChild(h('option', {value:o[0], text:o[1]})); }); fmt.value = 'mp3-128';
    var name = h('input', {class:'field', value:VFS.stem(VFS.base(path)) + ' editado'});
    UI.dialog({title:'Guardar audio', body:h('div', {}, [h('label', {class:'lbl', text:'Nombre'}), name, h('label', {class:'lbl', text:'Formato'}), fmt]), buttons:[{t:'Cancelar', v:null}, {t:'Guardar', cls:'primary', v:true}]}).then(function(ok){
      if(!ok) return;
      UI.busy('Codificando…');
      var f = fmt.value, job = f === 'wav' ? Promise.resolve(toWav(buf)) : toMp3(buf, +f.split('-')[1], f === 'mp3-64');
      return job.then(function(b){ return writeNew(VFS.parent(path), (name.value.trim() || 'Audio') + (f === 'wav' ? '.wav' : '.mp3'), b); })
        .then(function(p){ UI.busy(false); v.dirty = null; UI.toast('Guardado ' + VFS.base(p)); });
    }).catch(UI.fail);
  }
}
function convertAudio(paths, preset){
  var fmt = h('select', {class:'field'}); [['mp3-192', 'MP3 alta calidad (192 kbps)'], ['mp3-128', 'MP3 (128 kbps)'], ['mp3-64', 'MP3 comprimido (64 kbps, mono)'], ['mp3-32', 'MP3 voz (32 kbps, mono)'], ['wav', 'WAV sin pérdida']].forEach(function(o){ fmt.appendChild(h('option', {value:o[0], text:o[1]})); });
  fmt.value = preset || 'mp3-128';
  UI.dialog({title:(preset ? 'Comprimir' : 'Convertir') + ' ' + paths.length + ' archivo' + (paths.length > 1 ? 's' : ''), body:h('div', {}, [fmt, h('div', {class:'muted', style:'font-size:12.5px;margin-top:10px', text:'Acepta audio y video (extrae la pista de sonido). Se crean copias junto a los originales.'})]), buttons:[{t:'Cancelar', v:null}, {t:'Convertir', cls:'primary', v:true}]}).then(function(ok){
    if(!ok) return;
    var f = fmt.value, c = Promise.resolve(), before = 0, after = 0;
    paths.forEach(function(p, i){ c = c.then(function(){
      UI.busy('Procesando ' + (i + 1) + ' de ' + paths.length + '…');
      return VFS.read(p).then(function(b){ before += b.size; return decode(b); }).then(function(buf){ return f === 'wav' ? toWav(buf) : toMp3(buf, +f.split('-')[1], +f.split('-')[1] <= 64); })
        .then(function(b){ after += b.size; return writeNew(VFS.parent(p), VFS.stem(VFS.base(p)) + (f === 'wav' ? '.wav' : '.mp3'), b); });
    }); });
    return c.then(function(){ UI.busy(false); UI.toast(UI.size(before) + ' → ' + UI.size(after), 3500); App.refresh(); });
  }).catch(UI.fail);
}

/* ================= VIDEO (recodificar en tiempo real) ================= */
function convertVideo(path, compress){
  var res = h('select', {class:'field'}); [['0', 'Resolución original'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']].forEach(function(o){ res.appendChild(h('option', {value:o[0], text:o[1]})); }); res.value = compress ? '720' : '0';
  var br = h('select', {class:'field', style:'margin-top:8px'}); [['8', 'Alta calidad (8 Mbps)'], ['4', 'Normal (4 Mbps)'], ['1.5', 'Liviano (1,5 Mbps)'], ['0.7', 'Muy liviano (0,7 Mbps)']].forEach(function(o){ br.appendChild(h('option', {value:o[0], text:o[1]})); }); br.value = compress ? '1.5' : '4';
  UI.dialog({title:compress ? 'Comprimir video' : 'Convertir video', body:h('div', {}, [res, br, h('div', {class:'muted', style:'font-size:12.5px;margin-top:10px', text:'El video se reproduce y se vuelve a grabar, así que tarda lo mismo que su duración. Mantén la app abierta. Formato de salida: MP4 cuando el dispositivo lo permite (si no, WebM).'})]), buttons:[{t:'Cancelar', v:null}, {t:'Empezar', cls:'primary', v:true}]}).then(function(ok){
    if(!ok) return;
    if(!window.MediaRecorder) throw new Error('Este dispositivo no permite recodificar video');
    return VFS.url(path).then(function(u){
      return new Promise(function(resolve, reject){
        var vid = document.createElement('video'); vid.src = u; vid.playsInline = true; vid.muted = false; vid.crossOrigin = 'anonymous';
        vid.onloadedmetadata = function(){
          var tH = +res.value || vid.videoHeight, k = Math.min(1, tH / vid.videoHeight), W = Math.round(vid.videoWidth * k / 2) * 2, H = Math.round(vid.videoHeight * k / 2) * 2;
          var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d');
          var stream = cv.captureStream(30), ac = ctx(), srcN = ac.createMediaElementSource(vid), dest = ac.createMediaStreamDestination();
          srcN.connect(dest); dest.stream.getAudioTracks().forEach(function(t){ stream.addTrack(t); });
          var type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].filter(function(t){ return MediaRecorder.isTypeSupported(t); })[0] || '';
          var rec = new MediaRecorder(stream, {mimeType:type, videoBitsPerSecond:+br.value * 1e6, audioBitsPerSecond:128000}), chunks = [], cancel = false;
          rec.ondataavailable = function(e){ if(e.data.size) chunks.push(e.data); };
          rec.onstop = function(){
            if(cancel){ reject(new Error('Cancelado')); return; }
            var blob = new Blob(chunks, {type:type.split(';')[0] || 'video/webm'}), e = /mp4/.test(type) ? 'mp4' : 'webm';
            writeNew(VFS.parent(path), VFS.stem(VFS.base(path)) + (compress ? ' (comprimido)' : ' (convertido)') + '.' + e, blob).then(resolve, reject);
          };
          var box = h('div', {class:'dlg'}), pr = h('div', {class:'meter', style:'height:8px'}, [h('i')]), lab = h('div', {class:'muted', style:'font-size:13px;margin-top:6px'});
          box.appendChild(h('h2', {text:'Procesando video'})); var bd = h('div', {class:'body'}, [cv, pr, lab]); cv.style.cssText = 'width:100%;border-radius:10px;background:#000'; box.appendChild(bd);
          var L = UI.layer(box, {modal:true});
          box.appendChild(h('div', {class:'btns'}, [h('button', {class:'danger', text:'Cancelar', onclick:function(){ cancel = true; vid.pause(); rec.stop(); L.close(); }})]));
          function frame(){ if(vid.ended || vid.paused && vid.currentTime > 0) return; x.drawImage(vid, 0, 0, W, H); pr.firstChild.style.width = (vid.currentTime / vid.duration * 100) + '%'; lab.textContent = UI.dur(vid.currentTime) + ' de ' + UI.dur(vid.duration); requestAnimationFrame(frame); }
          vid.onended = function(){ setTimeout(function(){ rec.stop(); L.close(); }, 300); };
          if(ac.state === 'suspended') ac.resume();
          rec.start(1000); vid.play().then(frame).catch(function(e){ L.close(); reject(e); });
        };
        vid.onerror = function(){ reject(new Error('Video no compatible')); };
      });
    }).then(function(p){ UI.toast('Creado ' + VFS.base(p)); App.refresh(); });
  }).catch(function(e){ if(e && e.message !== 'Cancelado') UI.fail(e); });
}

/* ================= ELIMINAR OBJETOS DE FOTOS ================= */
function eraseObjects(path, done){
  var box = h('div', {class:'dlg wide', style:'height:min(860px,calc(100vh - 24px))'});
  box.appendChild(h('h2', {text:'Eliminar objetos'}));
  box.appendChild(h('div', {class:'msg', text:'Pinta sobre lo que quieras borrar y toca «Borrar». Funciona mejor sobre fondos simples.'}));
  var stage = h('div', {style:'flex:1;min-height:0;position:relative;background:#111;margin:6px 0;display:flex;align-items:center;justify-content:center;touch-action:none'});
  var cv = h('canvas', {style:'max-width:100%;max-height:100%'}), mk = h('canvas', {style:'position:absolute;pointer-events:none;opacity:.5'});
  stage.appendChild(cv); stage.appendChild(mk); box.appendChild(stage);
  var size = h('input', {type:'range', min:8, max:120, value:40, style:'width:160px'});
  var row = h('div', {class:'row', style:'justify-content:center;padding:0 10px 10px;flex-wrap:wrap'}, [h('span', {class:'muted', style:'font-size:13px', text:'Pincel'}), size]);
  var undoStack = [];
  row.appendChild(h('button', {class:'btn sec', style:'padding:6px 12px', text:'Limpiar trazo', onclick:function(){ mx.clearRect(0, 0, mk.width, mk.height); }}));
  row.appendChild(h('button', {class:'btn sec', style:'padding:6px 12px', html:icon('undo'), onclick:function(){ var u = undoStack.pop(); if(u) cx.putImageData(u, 0, 0); }}));
  row.appendChild(h('button', {class:'btn', style:'padding:6px 14px', html:icon('wand') + 'Borrar', onclick:inpaint}));
  box.appendChild(row);
  var bs = h('div', {class:'btns'}), L;
  bs.appendChild(h('button', {text:'Cancelar', onclick:function(){ L.close(); }}));
  bs.appendChild(h('button', {text:'Guardar copia', onclick:function(){ save(true); }}));
  bs.appendChild(h('button', {class:'primary', text:'Guardar', onclick:function(){ save(false); }}));
  box.appendChild(bs);
  L = UI.layer(box, {modal:true});
  var cx, mx;
  VFS.read(path).then(function(b){ return UI.loadImage(URL.createObjectURL(b)); }).then(function(im){
    var s = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
    cv.width = mk.width = Math.round(im.naturalWidth * s); cv.height = mk.height = Math.round(im.naturalHeight * s);
    cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, cv.width, cv.height); mx = mk.getContext('2d');
    setTimeout(place, 30);
  }).catch(function(e){ L.close(); UI.fail(e); });
  function place(){ var r = cv.getBoundingClientRect(), R = stage.getBoundingClientRect(); mk.style.left = (r.left - R.left) + 'px'; mk.style.top = (r.top - R.top) + 'px'; mk.style.width = r.width + 'px'; mk.style.height = r.height + 'px'; }
  var down = false, last = null;
  function pt(e){ var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height, cv.width / r.width]; }
  stage.addEventListener('pointerdown', function(e){ if(!mx) return; stage.setPointerCapture(e.pointerId); down = true; last = pt(e); paint(last); });
  stage.addEventListener('pointermove', function(e){ if(!down) return; var p = pt(e); paint(p, last); last = p; });
  stage.addEventListener('pointerup', function(){ down = false; });
  function paint(p, q){ mx.strokeStyle = mx.fillStyle = '#ff2d55'; mx.lineCap = 'round'; mx.lineWidth = size.value * p[2]; mx.beginPath(); mx.moveTo((q || p)[0], (q || p)[1]); mx.lineTo(p[0], p[1]); mx.stroke(); }
  function inpaint(){
    var W = cv.width, H = cv.height, md = mx.getImageData(0, 0, W, H).data, img = cx.getImageData(0, 0, W, H), d = img.data;
    var mask = new Uint8Array(W * H), n = 0;
    for(var i = 0; i < W * H; i++) if(md[i * 4 + 3] > 20){ mask[i] = 1; n++; }
    if(!n) return UI.toast('Pinta primero lo que quieres borrar');
    undoStack.push(cx.getImageData(0, 0, W, H));
    UI.busy('Rellenando…');
    setTimeout(function(){
      // relleno por capas desde el borde hacia adentro, promediando vecinos conocidos (radio 2)
      var front = [], guard = 0;
      for(var y = 0; y < H; y++) for(var x = 0; x < W; x++){ var k = y * W + x; if(mask[k] && ((x > 0 && !mask[k - 1]) || (x < W - 1 && !mask[k + 1]) || (y > 0 && !mask[k - W]) || (y < H - 1 && !mask[k + W]))) front.push(k); }
      while(front.length && guard++ < 4000){
        var next = [], done2 = [];
        front.forEach(function(k){
          var x = k % W, y = (k / W) | 0, r = 0, g = 0, b = 0, w = 0;
          for(var dy = -3; dy <= 3; dy++) for(var dx = -3; dx <= 3; dx++){
            var xx = x + dx, yy = y + dy; if(xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            var kk = yy * W + xx; if(mask[kk]) continue;
            var ww = 1 / (dx * dx + dy * dy + .5); r += d[kk * 4] * ww; g += d[kk * 4 + 1] * ww; b += d[kk * 4 + 2] * ww; w += ww;
          }
          if(w){ var jit = (Math.random() - .5) * 6; d[k * 4] = r / w + jit; d[k * 4 + 1] = g / w + jit; d[k * 4 + 2] = b / w + jit; done2.push(k); }
        });
        done2.forEach(function(k){ mask[k] = 0; });
        done2.forEach(function(k){ var x = k % W, y = (k / W) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function(o){ var xx = x + o[0], yy = y + o[1]; if(xx < 0 || yy < 0 || xx >= W || yy >= H) return; var kk = yy * W + xx; if(mask[kk] === 1){ mask[kk] = 2; next.push(kk); } }); });
        next.forEach(function(k){ mask[k] = 1; });
        front = next;
      }
      // suavizado ligero sobre la zona rellenada
      var orig = new Uint8ClampedArray(d);
      for(var j = 0; j < W * H; j++){ if(md[j * 4 + 3] <= 20) continue; var x2 = j % W, y2 = (j / W) | 0; if(x2 < 1 || y2 < 1 || x2 >= W - 1 || y2 >= H - 1) continue;
        for(var c = 0; c < 3; c++) d[j * 4 + c] = (orig[j * 4 + c] * 4 + orig[(j - 1) * 4 + c] + orig[(j + 1) * 4 + c] + orig[(j - W) * 4 + c] + orig[(j + W) * 4 + c]) / 8; }
      cx.putImageData(img, 0, 0); mx.clearRect(0, 0, W, H); UI.busy(false);
    }, 30);
  }
  function save(copy){
    var e = VFS.ext(path) === 'png' ? 'png' : 'jpg';
    UI.canvasBlob(cv, e === 'png' ? 'image/png' : 'image/jpeg', .93).then(function(b){
      return copy ? writeNew(VFS.parent(path), VFS.stem(VFS.base(path)) + ' retocada.' + e, b) : (/^(jpe?g|png)$/.test(VFS.ext(path)) ? VFS.write(path, b).then(function(){ return path; }) : writeNew(VFS.parent(path), VFS.stem(VFS.base(path)) + '.' + e, b));
    }).then(function(p){ L.close(); UI.toast('Imagen guardada'); App.refresh(); if(done) done(p); }).catch(UI.fail);
  }
}

/* ================= TRANSFERIR ARCHIVOS (Wi‑Fi) ================= */
function transfer(){
  if(!VFS.native){
    UI.alert('Transferir archivos', 'Para pasar archivos entre este dispositivo y un computador:\n\n• Desde el Mac: abre Archivero en el Mac → Transferir archivos, y en este dispositivo abre en Safari la dirección que muestre.\n• AirDrop o «Guardar en Archivos» desde cualquier app, y luego «Importar archivos».\n• Respaldo completo (Herramientas) para mover todo tu archivero.');
    return;
  }
  VFS.bridge({op:'transferStart'}).then(function(r){
    var body = h('div', {style:'text-align:center'});
    body.appendChild(h('div', {class:'muted', style:'font-size:13.5px', text:'En el iPhone, iPad u otro computador conectado a la misma red Wi‑Fi, abre en el navegador:'}));
    body.appendChild(h('div', {style:'font:700 20px ui-monospace,Menlo,monospace;margin:12px 0;user-select:text;-webkit-user-select:text', text:r.url}));
    var qrBox = h('div', {style:'display:flex;justify-content:center;margin:6px 0 10px'});
    body.appendChild(qrBox);
    UI.loadScript('lib/qrcode.js').then(function(){ var q = qrcode(0, 'M'); q.addData(r.url); q.make(); qrBox.innerHTML = q.createSvgTag({cellSize:5, margin:2}); qrBox.firstChild.style.background = '#fff'; qrBox.firstChild.style.borderRadius = '10px'; });
    body.appendChild(h('div', {class:'muted', style:'font-size:13.5px', text:'e ingresa este código:'}));
    var code = h('div', {style:'display:flex;gap:8px;justify-content:center;margin:10px 0'});
    String(r.code).split('').forEach(function(d){ code.appendChild(h('span', {style:'width:46px;height:58px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);font:600 32px -apple-system;display:flex;align-items:center;justify-content:center', text:d})); });
    body.appendChild(code);
    body.appendChild(h('div', {class:'muted', style:'font-size:12.5px', text:'Podrás descargar y subir archivos a tu carpeta Archivero. El servidor se apaga al cerrar este cuadro.'}));
    UI.dialog({title:'Transferir archivos', body:body, buttons:[{t:'Detener', v:true, cls:'primary'}], modal:true}).then(function(){ VFS.bridge({op:'transferStop'}); App.refresh(); });
  }).catch(UI.fail);
}

/* ================= CONEXIONES ================= */
var conns = [];
function loadConns(){
  if(!VFS.native) return Promise.resolve([]);
  return VFS.bridge({op:'connList'}).then(function(l){ conns = l || []; return conns; }).catch(function(){ return []; });
}
function connName(path){ var m = path.match(/^\/@c\/([^/]+)/); if(!m) return null; for(var i = 0; i < conns.length; i++) if(conns[i].id === m[1]) return conns[i].name; return m[1]; }
function addConnection(){
  if(!VFS.native){
    UI.gridMenu('Añadir conexión', [
      {t:'Archivos de iOS', i:'folder', c:'#2F6FDB', fn:App.importPick},
      {t:'iCloud Drive', i:'cloud', c:'#3A9BDC', fn:App.importPick},
      {t:'Google Drive', i:'cloud', c:'#1FA463', fn:App.importPick},
      {t:'Dropbox', i:'cloud', c:'#0061FF', fn:App.importPick},
      {t:'OneDrive', i:'cloud', c:'#0078D4', fn:App.importPick},
      {t:'Desde enlace', i:'link', c:'#7C7F86', fn:function(){ Tools.download(dirNow()); }}
    ]);
    UI.toast('En iPhone/iPad, las nubes se abren desde el selector de Archivos (instala su app primero)', 4000);
    return;
  }
  UI.gridMenu('Añadir conexión', [
    {t:'Carpeta del Mac', i:'folderplus', c:'#4FA3E0', fn:function(){ VFS.bridge({op:'connAdd'}).then(afterConn); }},
    {t:'Servidor SMB (Windows)', i:'hdd', c:'#0078D4', fn:function(){ server('smb://'); }},
    {t:'Servidor FTP', i:'hdd', c:'#7C7F86', fn:function(){ server('ftp://'); }},
    {t:'Servidor WebDAV', i:'hdd', c:'#13897F', fn:function(){ server('https://'); }},
    {t:'Servidor SFTP / AFP', i:'hdd', c:'#5B4BD6', fn:function(){ server('afp://'); }},
    {t:'Dropbox · Drive · OneDrive · Box', i:'cloud', c:'#0061FF', fn:function(){ UI.alert('Nubes', 'Instala la app de escritorio de Dropbox, Google Drive, OneDrive o Box en el Mac. Archivero las detecta automáticamente y aparecen en «Conexiones».'); }}
  ]);
}
function server(pre){
  UI.prompt('Conectar a servidor', pre, {type:'url', caps:'none', msg:'Ej.: smb://192.168.1.10/compartido · ftp://servidor.cl · https://nube.cl/remote.php/dav/files/usuario. macOS pedirá usuario y contraseña; luego aparece en Conexiones.', ok:'Conectar'}).then(function(u){
    if(!u) return;
    return VFS.bridge({op:'connServer', url:u}).then(function(){ UI.toast('Conectando… aparecerá en Conexiones', 3500); setTimeout(function(){ afterConn(); }, 6000); });
  }).catch(UI.fail);
}
function afterConn(){ loadConns().then(function(){ App.renderSide(); }); }

/* ================= CENTRO DE CONTROL ================= */
function controlCenter(){
  var box = h('div', {class:'dlg', style:'width:min(460px,calc(100vw - 32px))'});
  box.appendChild(h('div', {class:'row', style:'padding:14px 16px 4px'}, [h('b', {class:'grow', style:'text-align:center;font-size:17px;padding-left:38px', text:'Centro de control'}), h('button', {class:'tb', html:icon('x'), onclick:function(){ L.close(); }})]));
  var quick = h('div', {style:'display:flex;gap:10px;overflow-x:auto;padding:10px 16px 14px'});
  [['Convertir multimedia', 'loop', '#30A46C', function(){ pickMedia(false); }], ['Comprimir multimedia', 'zip', '#2F6FDB', function(){ pickMedia(true); }], ['Guardar enlaces', 'link', '#13897F', function(){ saveLink(dirNow()); }],
   ['Eliminar objetos', 'eraser', '#0E8A7E', function(){ Tools.pickFiles('Elige una foto', function(n){ return UI.kindOf(n.name).k === 'image'; }, false).then(function(p){ if(p) eraseObjects(p[0]); }); }],
   ['Navegador', 'globe', '#8E4EC6', function(){ App.go('browser'); }], ['Transferir', 'upload', '#F76B15', transfer]].forEach(function(q){
    quick.appendChild(h('button', {style:'display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11.5px;width:74px;flex:none;text-align:center;line-height:1.2', html:'<span style="width:54px;height:54px;border-radius:50%;background:' + q[2] + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px ' + q[2] + '44">' + icon(q[1]) + '</span>' + esc(q[0]), onclick:function(){ L.close(); q[3](); }}));
  });
  box.appendChild(quick);
  var list = h('div', {style:'padding:0 12px 14px;overflow-y:auto'});
  function group(items){ var g = h('div', {class:'set', style:'margin-bottom:10px'}); items.forEach(function(it){ g.appendChild(h('div', {class:'r', style:'cursor:pointer;min-height:44px', html:'<span style="width:28px;height:28px;border-radius:8px;background:' + it[2] + ';color:#fff;display:flex;align-items:center;justify-content:center">' + icon(it[1]).replace('class="i"', 'class="i" style="width:16px;height:16px"') + '</span><span class="grow">' + esc(it[0]) + '</span>' + icon('chev').replace('class="i"', 'class="i" style="color:var(--faint);width:16px"'), onclick:function(){ L.close(); it[3](); }})); }); list.appendChild(g); }
  group([['Configuración', 'gear', '#5B6472', function(){ App.go('settings'); }], ['Apariencia', 'sun', '#13897F', function(){ App.go('settings'); }], ['Seguridad', 'lock', '#2F6FDB', function(){ App.go('settings'); setTimeout(function(){ var e = UI.$$('.sec-h').filter(function(x){ return x.textContent === 'Privacidad'; })[0]; if(e) e.scrollIntoView(); }, 50); }],
    ['Barra lateral', 'list', '#5B4BD6', sidebarCustomize], ['Atajos (Siri y Atajos)', 'wand', '#D34D8C', shortcutsHelp]]);
  group([['Integraciones y nubes', 'cloud', '#3A9BDC', addConnection], ['Transferir archivos', 'upload', '#13897F', transfer]]);
  group([['Borrados recientes', 'trash', '#7D828A', function(){ App.go('trash'); }], ['Ayuda', 'info', '#E5484D', help]]);
  box.appendChild(list);
  var L = UI.layer(box);
}
function pickMedia(compress){
  Tools.pickFiles(compress ? 'Elige audio, video o imágenes' : 'Elige audio o video', function(n){ var k = UI.kindOf(n.name).k; return k === 'audio' || k === 'video' || (compress && k === 'image'); }, true).then(function(ps){
    if(!ps) return;
    var k = UI.kindOf(ps[0]).k;
    if(k === 'video' && ps.length === 1) return UI.menu([{t:compress ? 'Comprimir video' : 'Convertir video (MP4)', i:'video', fn:function(){ convertVideo(ps[0], compress); }}, {t:'Extraer audio (MP3)', i:'music', fn:function(){ convertAudio(ps, compress ? 'mp3-64' : 'mp3-192'); }}], null, VFS.base(ps[0]));
    if(k === 'image') return Tools.convertImages ? Tools.convertImages(ps) : null;
    convertAudio(ps, compress ? 'mp3-64' : null);
  });
}
function sidebarCustomize(){
  var opts = [['recent', 'Recientes'], ['favs', 'Favoritos'], ['media', 'Fotos y videos'], ['docs', 'Documentos'], ['browser', 'Navegador'], ['trash', 'Papelera'], ['tags', 'Etiquetas'], ['conns', 'Conexiones'], ['recentList', 'Lista de recientes'], ['favList', 'Lista de favoritos']];
  var hide = S.hideSecs || [], body = h('div');
  opts.forEach(function(o){ var on = hide.indexOf(o[0]) < 0; var sw = h('button', {class:'sw' + (on ? ' on' : ''), onclick:function(){ sw.classList.toggle('on'); }}); sw._k = o[0]; body.appendChild(h('div', {class:'row', style:'padding:8px 0;border-bottom:1px solid var(--border)'}, [h('span', {class:'grow', text:o[1]}), sw])); });
  var cmp = h('button', {class:'sw' + (S.sideCompact ? ' on' : ''), onclick:function(){ cmp.classList.toggle('on'); }});
  body.appendChild(h('div', {class:'row', style:'padding:12px 0 4px'}, [h('span', {class:'grow', html:'Barra compacta<br><small class="muted">Solo íconos</small>'}), cmp]));
  UI.dialog({title:'Barra lateral', body:body, buttons:[{t:'Cancelar', v:null}, {t:'Guardar', cls:'primary', v:true}]}).then(function(ok){
    if(!ok) return;
    S.hideSecs = UI.$$('.sw', body).filter(function(s){ return s._k && !s.classList.contains('on'); }).map(function(s){ return s._k; });
    S.sideCompact = cmp.classList.contains('on'); App.save(); App.applySide(); App.renderSide();
  });
}

/* ================= ATAJOS (Siri / app Atajos) ================= */
var BASE = location.href.split('#')[0];
function shortcutsHelp(){
  var rows = [['Escanear documento', '#escanear'], ['Grabar audio', '#grabar'], ['Nueva nota', '#nota'], ['Importar archivos', '#importar'], ['Navegador', '#navegador'], ['Buscar «informe»', '#buscar=informe'], ['Abrir carpeta Documentos', '#carpeta=/Documentos']];
  var body = h('div', {style:'font-size:13.5px'});
  body.appendChild(h('div', {class:'muted', style:'margin-bottom:10px', text:VFS.native ? 'En el Mac puedes usar estos enlaces en la app Atajos con la acción «Abrir URL» (abren Archivero en el navegador). En iPhone/iPad úsalos con la app instalada en la pantalla de inicio.' : 'En la app Atajos crea un atajo con la acción «Abrir URL» y pega uno de estos enlaces. Luego puedes decir «Oye Siri» y el nombre del atajo.'}));
  rows.forEach(function(r){
    var u = (VFS.native ? 'https://doclam2015-create.github.io/archivero/' : BASE) + r[1];
    body.appendChild(h('div', {class:'row', style:'padding:6px 0;border-bottom:1px solid var(--border)'}, [h('div', {class:'grow', style:'min-width:0', html:'<b>' + esc(r[0]) + '</b><br><small class="muted ell" style="display:block">' + esc(u) + '</small>'}), h('button', {class:'tb', html:icon('copy'), onclick:function(){ UI.copyText(u).then(function(){ UI.toast('Enlace copiado'); }); }})]));
  });
  UI.dialog({title:'Atajos y Siri', body:body, buttons:[{t:'Cerrar', v:1, cls:'primary'}]});
}
function runHash(){
  var hsh = decodeURIComponent(location.hash.slice(1)); if(!hsh) return;
  history.replaceState(null, '', location.pathname + location.search);
  var kv = hsh.split('='), k = kv[0], val = kv.slice(1).join('=');
  setTimeout(function(){
    if(k === 'escanear') Tools.scan('/');
    else if(k === 'grabar') Tools.record('/');
    else if(k === 'nota') App.newNote('/', 'md');
    else if(k === 'importar') App.importPick();
    else if(k === 'navegador') App.go('browser');
    else if(k === 'buscar'){ var q = $('#q'); q.value = val; q.dispatchEvent(new Event('input')); }
    else if(k === 'carpeta') App.cd(val || '/');
    else if(k === 'url' || k === 'navegar') browse(val);
  }, 400);
}
window.addEventListener('hashchange', runHash);

function help(){
  UI.alert('Ayuda', 'Toca un archivo para abrirlo. Mantén presionado (o clic derecho) para ver todas sus acciones. Arrastra archivos a carpetas, a Favoritos, a una etiqueta o a la Papelera. El botón + agrega carpetas, notas, escaneos, grabaciones y enlaces. En Herramientas encuentras conversiones de PDF, editor de audio, compresión y más. Tus archivos nunca salen de tu dispositivo.');
}

window.Extra = {renderBrowser:renderBrowser, browse:browse, saveLink:saveLink, openLink:openLink, linkOf:linkOf, pdfTo:pdfTo, pdfPassword:pdfPassword, pdfUnlock:pdfUnlock, audioEditor:audioEditor, editTags:editTags,
  convertAudio:convertAudio, convertVideo:convertVideo, eraseObjects:eraseObjects, transfer:transfer, loadConns:loadConns, conns:function(){ return conns; }, connName:connName, addConnection:addConnection,
  controlCenter:controlCenter, sidebarCustomize:sidebarCustomize, shortcutsHelp:shortcutsHelp, runHash:runHash, pickMedia:pickMedia, help:help};
}());
