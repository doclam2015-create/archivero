import Cocoa
import WebKit
import PDFKit
import UniformTypeIdentifiers
import Network

// Archivero para macOS: ventana nativa con WKWebView. La interfaz (index.html) se sirve por el esquema archivero://localhost
// y los archivos viven en una carpeta real del Mac (por defecto iCloud Drive/Archivero), expuesta en /__fs__/…
// El HTML habla con el Mac por window.webkit.messageHandlers.fs.

let fm = FileManager.default

final class Store {
    static let shared = Store()
    var root: URL

    init() {
        if let saved = UserDefaults.standard.string(forKey: "root") { root = URL(fileURLWithPath: saved) }
        else {
            let icloud = fm.homeDirectoryForCurrentUser.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs")
            let base = fm.fileExists(atPath: icloud.path) ? icloud : fm.homeDirectoryForCurrentUser.appendingPathComponent("Documents")
            root = base.appendingPathComponent("Archivero")
        }
        ensureRoot()
        scanConns()
    }
    func ensureRoot() {
        if !fm.fileExists(atPath: root.path) {
            try? fm.createDirectory(at: root, withIntermediateDirectories: true)
            for f in ["Documentos", "Fotos", "Música", "Descargas"] { try? fm.createDirectory(at: root.appendingPathComponent(f), withIntermediateDirectories: true) }
        }
    }
    var label: String {
        let p = root.path
        if p.contains("com~apple~CloudDocs") { return "iCloud Drive › " + p.components(separatedBy: "com~apple~CloudDocs/").last! }
        return p.replacingOccurrences(of: fm.homeDirectoryForCurrentUser.path, with: "~")
    }
    // conexiones: nubes del Mac, iCloud Drive, discos y servidores montados, carpetas agregadas
    var conns: [[String: Any]] = []
    func scanConns() {
        var out: [[String: Any]] = []
        func add(_ id: String, _ name: String, _ kind: String, _ path: String, custom: Bool = false) {
            let clean = id.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)
            if out.contains(where: { ($0["id"] as! String) == clean }) || !fm.fileExists(atPath: path) { return }
            out.append(["id": clean, "name": name, "kind": kind, "path": path, "custom": custom])
        }
        let home = fm.homeDirectoryForCurrentUser
        let icloud = home.appendingPathComponent("Library/Mobile Documents/com~apple~CloudDocs").path
        add("icloud", "iCloud Drive", "cloud", icloud)
        let cs = home.appendingPathComponent("Library/CloudStorage")
        for d in (try? fm.contentsOfDirectory(atPath: cs.path)) ?? [] where !d.hasPrefix(".") {
            var name = d
            for (k, v) in ["Dropbox": "Dropbox", "GoogleDrive": "Google Drive", "OneDrive": "OneDrive", "Box": "Box"] where d.hasPrefix(k) { name = v + (d.contains("-") && k != "Box" ? " (" + d.split(separator: "-", maxSplits: 1).last! + ")" : "") }
            add(d, name, "cloud", cs.appendingPathComponent(d).path)
        }
        for v in (try? fm.contentsOfDirectory(atPath: "/Volumes")) ?? [] where !v.hasPrefix(".") {
            let u = URL(fileURLWithPath: "/Volumes/" + v)
            let vals = try? u.resourceValues(forKeys: [.volumeIsLocalKey, .volumeIsRootFileSystemKey, .volumeIsBrowsableKey])
            if vals?.volumeIsRootFileSystem == true || vals?.volumeIsBrowsable == false { continue }
            add("vol-" + v, v, vals?.volumeIsLocal == false ? "server" : "disk", u.path)
        }
        for (id, path) in (UserDefaults.standard.dictionary(forKey: "conns") as? [String: String]) ?? [:] {
            add(id, URL(fileURLWithPath: path).lastPathComponent, "folder", path, custom: true)
        }
        conns = out
    }
    func connRoot(_ id: String) -> URL? {
        if conns.isEmpty { scanConns() }
        if let c = conns.first(where: { ($0["id"] as! String) == id }) { return URL(fileURLWithPath: c["path"] as! String) }
        scanConns()
        return conns.first(where: { ($0["id"] as! String) == id }).map { URL(fileURLWithPath: $0["path"] as! String) }
    }
    // ruta virtual "/a/b" (o "/@c/conexión/a/b") → URL real, sin salir de su raíz
    func url(_ v: String) -> URL? {
        var parts = v.split(separator: "/").map(String.init)
        if parts.contains("..") { return nil }
        var base = root
        if parts.first == "@c" {
            guard parts.count >= 2, let r = connRoot(parts[1]) else { return nil }
            base = r; parts.removeFirst(2)
        }
        var u = base
        for p in parts where !p.isEmpty && p != "." { u.appendPathComponent(p) }
        return u.standardizedFileURL.path.hasPrefix(base.standardizedFileURL.path) ? u : nil
    }
    func vpath(_ u: URL) -> String {
        let p = u.standardizedFileURL.path
        var r = root.standardizedFileURL.path, prefix = ""
        if !(p == r || p.hasPrefix(r + "/")) {
            for c in conns { let cp = URL(fileURLWithPath: c["path"] as! String).standardizedFileURL.path
                if p == cp || p.hasPrefix(cp + "/") { r = cp; prefix = "/@c/" + (c["id"] as! String); break } }
        }
        let rel = String(p.dropFirst(r.count))
        let v = prefix + (rel.isEmpty ? "" : (rel.hasPrefix("/") ? rel : "/" + rel))
        return v.isEmpty ? "/" : v
    }
    func info(_ u: URL) -> [String: Any]? {
        guard let a = try? fm.attributesOfItem(atPath: u.path) else { return nil }
        let dir = (a[.type] as? FileAttributeType) == .typeDirectory
        var d: [String: Any] = ["path": vpath(u), "name": u.lastPathComponent, "kind": dir ? "dir" : "file",
                                "mtime": ((a[.modificationDate] as? Date) ?? Date()).timeIntervalSince1970 * 1000,
                                "ctime": ((a[.creationDate] as? Date) ?? Date()).timeIntervalSince1970 * 1000]
        if !dir { d["size"] = (a[.size] as? NSNumber)?.intValue ?? 0 }
        return d
    }
    func unique(_ u: URL) -> URL {
        if !fm.fileExists(atPath: u.path) { return u }
        let ext = u.pathExtension, stem = u.deletingPathExtension().lastPathComponent, dir = u.deletingLastPathComponent()
        var i = 2
        while true {
            let c = dir.appendingPathComponent(stem + " \(i)" + (ext.isEmpty ? "" : "." + ext))
            if !fm.fileExists(atPath: c.path) { return c }
            i += 1
        }
    }
}

// MARK: esquema archivero:// (interfaz + archivos con soporte de rangos para audio y video)
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    let res = Bundle.main.resourceURL!
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path.removingPercentEncoding ?? url.path
        var file: URL?
        if path.hasPrefix("/__fs__") { file = Store.shared.url(String(path.dropFirst(7))) }
        else {
            if path == "/" || path.isEmpty { path = "/index.html" }
            let f = res.appendingPathComponent(String(path.dropFirst()))
            file = f.standardizedFileURL.path.hasPrefix(res.standardizedFileURL.path) ? f : nil
        }
        guard let f = file, let h = try? FileHandle(forReadingFrom: f) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish(); return
        }
        defer { try? h.close() }
        let total = (try? fm.attributesOfItem(atPath: f.path)[.size] as? NSNumber)??.intValue ?? 0
        let mime = UTType(filenameExtension: f.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        var start = 0, end = total - 1, status = 200
        if let r = task.request.value(forHTTPHeaderField: "Range"), r.hasPrefix("bytes="), total > 0 {
            let p = r.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            if let s = Int(p[0]) { start = s; if p.count > 1, let e = Int(p[1]) { end = min(e, total - 1) } }
            else if p.count > 1, let n = Int(p[1]) { start = max(0, total - n) }
            status = 206
        }
        if total == 0 { end = -1 }
        var headers = ["Content-Type": mime, "Content-Length": "\(max(0, end - start + 1))", "Accept-Ranges": "bytes", "Cache-Control": "no-store"]
        if status == 206 { headers["Content-Range"] = "bytes \(start)-\(end)/\(total)" }
        task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!)
        if end >= start {
            try? h.seek(toOffset: UInt64(start))
            var left = end - start + 1
            while left > 0 {
                let chunk = h.readData(ofLength: min(left, 4 << 20))
                if chunk.isEmpty { break }
                task.didReceive(chunk); left -= chunk.count
            }
        }
        task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var S: Store { Store.shared }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: "archivero")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "fs")
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Archivero"
        window.minSize = NSSize(width: 420, height: 520)
        window.contentView = web
        window.center()
        window.setFrameAutosaveName("ArchiveroMain")
        window.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: URL(string: "archivero://localhost/index.html")!))
        buildMenu()
        NSApp.activate(ignoringOtherApps: true)
    }

    // Archivos abiertos desde Finder («Abrir con») o soltados en el Dock
    var pageReady = false, pending: [URL] = []
    func application(_ application: NSApplication, open urls: [URL]) { if pageReady { receive(urls) } else { pending += urls } }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        // autoprueba: ARCHIVERO_SELFTEST=1 ejecuta un recorrido básico, imprime el resultado y cierra
        if let f = ProcessInfo.processInfo.environment["ARCHIVERO_EVAL"], let code = try? String(contentsOfFile: f, encoding: .utf8) {
            web.callAsyncJavaScript(code, arguments: [:], in: nil, in: .page) { r in
                switch r { case .success(let v): print("EVAL", v); case .failure(let e): print("EVAL ERROR", e) }
                exit(0)
            }
        }
        if ProcessInfo.processInfo.environment["ARCHIVERO_SELFTEST"] != nil {
            let js = """
            await new Promise(r => setTimeout(r, 1500));
            const out = {root: VFS.rootLabel(), list: (await VFS.list('/')).map(n => n.name)};
            await VFS.mkdir('/_prueba'); await VFS.write('/_prueba/a.txt', new Blob(['hola mac']));
            out.read = await VFS.text('/_prueba/a.txt');
            await VFS.move('/_prueba/a.txt', '/_prueba/b.txt'); out.moved = await VFS.exists('/_prueba/b.txt');
            await PDFView.plib(); const d = await PDFLib.PDFDocument.create(); d.addPage();
            await VFS.write('/_prueba/x.pdf', new Blob([await d.save()]));
            out.thumb = String(await App.Thumbs.make('/_prueba/x.pdf')).slice(0, 22);
            await KV.set('k', 1); out.idb = await KV.get('k');
            await VFS.remove('/_prueba'); out.gone = !(await VFS.exists('/_prueba'));
            return JSON.stringify(out);
            """
            web.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { r in
                switch r { case .success(let v): print("SELFTEST", v); case .failure(let e): print("SELFTEST ERROR", e) }
                exit(0)
            }
        }
        if !pending.isEmpty { let u = pending; pending = []; DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.receive(u) } }
    }
    func receive(_ urls: [URL]) {
        window.makeKeyAndOrderFront(nil)
        var paths: [String] = []
        let inbox = S.root.appendingPathComponent("Recibidos")
        for u in urls {
            if u.standardizedFileURL.path.hasPrefix(S.root.standardizedFileURL.path) { paths.append(S.vpath(u)); continue }
            try? fm.createDirectory(at: inbox, withIntermediateDirectories: true)
            let dst = S.unique(inbox.appendingPathComponent(u.lastPathComponent))
            if (try? fm.copyItem(at: u, to: dst)) != nil { paths.append(S.vpath(dst)) }
        }
        if let d = try? JSONSerialization.data(withJSONObject: paths), let j = String(data: d, encoding: .utf8) {
            web.evaluateJavaScript("App.nativeImported(\(j))", completionHandler: nil)
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // MARK: puente JS
    func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let b = message.body as? [String: Any], let op = b["op"] as? String else { replyHandler(nil, "mensaje inválido"); return }
        let path = b["path"] as? String ?? "/"
        func fail(_ m: String) { replyHandler(nil, m) }
        func u(_ p: String) -> URL? { S.url(p) }
        switch op {
        case "root": replyHandler(S.label, nil)
        case "stat":
            guard let x = u(path) else { replyHandler(NSNull(), nil); return }
            replyHandler(S.info(x) ?? NSNull(), nil)
        case "list":
            guard let x = u(path), let kids = try? fm.contentsOfDirectory(at: x, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) else { replyHandler([], nil); return }
            replyHandler(kids.compactMap { S.info($0) }, nil)
        case "walk":
            guard let x = u(path) else { replyHandler([], nil); return }
            var out: [[String: Any]] = []
            if let me = S.info(x) { out.append(me) }
            if let e = fm.enumerator(at: x, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles, .skipsPackageDescendants]) {
                for case let f as URL in e { if let i = S.info(f) { out.append(i) } }
            }
            replyHandler(out, nil)
        case "mkdir":
            guard let x = u(path) else { fail("Ruta inválida"); return }
            do { try fm.createDirectory(at: x, withIntermediateDirectories: true); replyHandler(true, nil) } catch { fail(error.localizedDescription) }
        case "write":
            guard let x = u(path), let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let tmp = x.deletingLastPathComponent().appendingPathComponent("." + x.lastPathComponent + ".partial")
            do {
                try fm.createDirectory(at: x.deletingLastPathComponent(), withIntermediateDirectories: true)
                if (b["append"] as? Bool) == true, let h = try? FileHandle(forWritingTo: tmp) { h.seekToEndOfFile(); h.write(data); try? h.close() }
                else { try data.write(to: tmp) }
                replyHandler(true, nil)
            } catch { fail(error.localizedDescription) }
        case "writeEnd":
            guard let x = u(path) else { fail("Ruta inválida"); return }
            let tmp = x.deletingLastPathComponent().appendingPathComponent("." + x.lastPathComponent + ".partial")
            do {
                if fm.fileExists(atPath: x.path) { _ = try fm.replaceItemAt(x, withItemAt: tmp) } else { try fm.moveItem(at: tmp, to: x) }
                replyHandler(true, nil)
            } catch { fail(error.localizedDescription) }
        case "move", "copy":
            guard let s = u(b["src"] as? String ?? ""), let d = u(b["dst"] as? String ?? "") else { fail("Ruta inválida"); return }
            do {
                try fm.createDirectory(at: d.deletingLastPathComponent(), withIntermediateDirectories: true)
                if op == "move" {
                    // cambio solo de mayúsculas: pasar por un nombre temporal
                    if s.path.lowercased() == d.path.lowercased() && s.path != d.path {
                        let t = s.deletingLastPathComponent().appendingPathComponent(UUID().uuidString)
                        try fm.moveItem(at: s, to: t); try fm.moveItem(at: t, to: d)
                    } else { try fm.moveItem(at: s, to: d) }
                } else { try fm.copyItem(at: s, to: d) }
                replyHandler(true, nil)
            } catch { fail(error.localizedDescription) }
        case "trash":
            guard let x = u(path), path != "/" else { fail("Ruta inválida"); return }
            do { try fm.trashItem(at: x, resultingItemURL: nil); replyHandler(true, nil) } catch { fail(error.localizedDescription) }
        case "usage":
            let v = try? S.root.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey])
            var used = 0
            if let e = fm.enumerator(at: S.root, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
                for case let f as URL in e { used += (try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) ?? 0 }
            }
            replyHandler(["used": used, "total": v?.volumeTotalCapacity ?? 0], nil)
        case "reveal":
            if let x = u(path) { NSWorkspace.shared.activateFileViewerSelecting([x]) }
            replyHandler(true, nil)
        case "openExternal":
            if let x = u(path) { NSWorkspace.shared.open(x) }
            replyHandler(true, nil)
        case "openTrash":
            NSWorkspace.shared.open(fm.homeDirectoryForCurrentUser.appendingPathComponent(".Trash"))
            replyHandler(true, nil)
        case "clip":
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(b["text"] as? String ?? "", forType: .string)
            replyHandler(true, nil)
        case "importPanel":
            let dir = u(b["dir"] as? String ?? "/") ?? S.root
            let p = NSOpenPanel()
            p.allowsMultipleSelection = true; p.canChooseDirectories = true; p.canChooseFiles = true
            p.prompt = "Importar"; p.message = "Elige archivos o carpetas para copiar a Archivero"
            p.beginSheetModal(for: window) { r in
                guard r == .OK else { replyHandler(0, nil); return }
                var n = 0
                for src in p.urls { if (try? fm.copyItem(at: src, to: self.S.unique(dir.appendingPathComponent(src.lastPathComponent)))) != nil { n += 1 } }
                replyHandler(n, nil)
            }
        case "chooseRoot":
            let p = NSOpenPanel()
            p.canChooseDirectories = true; p.canChooseFiles = false; p.canCreateDirectories = true
            p.prompt = "Usar esta carpeta"; p.message = "Elige la carpeta donde Archivero guarda tus archivos"
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let d = p.url else { replyHandler(false, nil); return }
                UserDefaults.standard.set(d.path, forKey: "root"); self.S.root = d; self.S.ensureRoot()
                replyHandler(true, nil)
            }
        case "saveAs":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let p = NSSavePanel(); p.nameFieldStringValue = b["name"] as? String ?? "archivo"; p.canCreateDirectories = true
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let d = p.url else { replyHandler(false, nil); return }
                do { try data.write(to: d); replyHandler(true, nil) } catch { fail(error.localizedDescription) }
            }
        case "export":
            guard let x = u(path) else { fail("Ruta inválida"); return }
            let p = NSSavePanel(); p.nameFieldStringValue = x.lastPathComponent; p.canCreateDirectories = true
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let d = p.url else { replyHandler(false, nil); return }
                do { if fm.fileExists(atPath: d.path) { try fm.removeItem(at: d) }; try fm.copyItem(at: x, to: d); replyHandler(true, nil) } catch { fail(error.localizedDescription) }
            }
        case "share":
            let urls = (b["paths"] as? [String] ?? []).compactMap { u($0) }
            var r = NSRect(x: b["x"] as? Double ?? 0, y: b["y"] as? Double ?? 0, width: max(1, b["w"] as? Double ?? 1), height: max(1, b["h"] as? Double ?? 1))
            if !web.isFlipped { r.origin.y = web.bounds.height - r.origin.y - r.height }
            NSSharingServicePicker(items: urls).show(relativeTo: r, of: web, preferredEdge: .minY)
            replyHandler(true, nil)
        case "print":
            guard let x = u(path), let doc = PDFDocument(url: x), let op = doc.printOperation(for: NSPrintInfo.shared, scalingMode: .pageScaleToFit, autoRotate: true) else { fail("No se pudo imprimir"); return }
            op.runModal(for: window, delegate: nil, didRun: nil, contextInfo: nil)
            replyHandler(true, nil)
        case "download":
            guard let s = b["url"] as? String, let src = URL(string: s) else { fail("Enlace inválido"); return }
            let dir = u(b["dir"] as? String ?? "/") ?? S.root
            var req = URLRequest(url: src, timeoutInterval: 120)
            req.setValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15", forHTTPHeaderField: "User-Agent")
            URLSession.shared.downloadTask(with: req) { tmp, resp, err in
                DispatchQueue.main.async {
                    guard let tmp = tmp, err == nil else { fail(err?.localizedDescription ?? "Sin respuesta"); return }
                    if let h = resp as? HTTPURLResponse, h.statusCode >= 400 { fail("El servidor respondió \(h.statusCode)"); return }
                    var name = resp?.suggestedFilename ?? src.lastPathComponent
                    if name.isEmpty { name = "descarga" }
                    let dst = self.S.unique(dir.appendingPathComponent(name))
                    do { try fm.moveItem(at: tmp, to: dst); replyHandler(self.S.vpath(dst), nil) } catch { fail(error.localizedDescription) }
                }
            }.resume()
        case "browse":
            Browser.open(b["url"] as? String ?? "about:blank", priv: (b["private"] as? Bool) == true, main: self)
            replyHandler(true, nil)
        case "pdfLock", "pdfUnlock":
            guard let x = u(path), let d = u(b["dst"] as? String ?? ""), let doc = PDFDocument(url: x) else { fail("No se pudo abrir el PDF"); return }
            let pass = b["pass"] as? String ?? ""
            if op == "pdfUnlock" {
                if doc.isLocked && !doc.unlock(withPassword: pass) { fail("Contraseña incorrecta"); return }
                let out = PDFDocument(); for i in 0..<doc.pageCount { if let pg = doc.page(at: i) { out.insert(pg, at: out.pageCount) } }
                if out.write(to: d) { replyHandler(true, nil) } else { fail("No se pudo guardar") }
            } else {
                let ok = doc.write(to: d, withOptions: [.userPasswordOption: pass, .ownerPasswordOption: pass + "#owner"])
                if ok { replyHandler(true, nil) } else { fail("No se pudo proteger el PDF") }
            }
        case "transferStart":
            do { let r = try Transfer.shared.start(); replyHandler(r, nil) } catch { fail("No se pudo iniciar: \(error.localizedDescription)") }
        case "transferStop":
            Transfer.shared.stop(); replyHandler(true, nil)
        case "connList":
            S.scanConns()
            replyHandler(S.conns.map { ["id": $0["id"]!, "name": $0["name"]!, "kind": $0["kind"]!, "custom": $0["custom"]!] }, nil)
        case "connAdd":
            let p = NSOpenPanel(); p.canChooseDirectories = true; p.canChooseFiles = false; p.prompt = "Conectar"
            p.message = "Elige una carpeta para verla en Archivero (otra nube, un disco externo, una carpeta de red…)"
            p.beginSheetModal(for: window) { r in
                guard r == .OK, let d = p.url else { replyHandler(false, nil); return }
                var c = (UserDefaults.standard.dictionary(forKey: "conns") as? [String: String]) ?? [:]
                c["f-" + d.lastPathComponent] = d.path; UserDefaults.standard.set(c, forKey: "conns")
                replyHandler(true, nil)
            }
        case "connRemove":
            var c = (UserDefaults.standard.dictionary(forKey: "conns") as? [String: String]) ?? [:]
            c.removeValue(forKey: b["id"] as? String ?? ""); UserDefaults.standard.set(c, forKey: "conns")
            replyHandler(true, nil)
        case "connServer":
            let s = (b["url"] as? String ?? "").replacingOccurrences(of: "\"", with: "")
            let pr = Process(); pr.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            pr.arguments = ["-e", "mount volume \"\(s)\""]
            do { try pr.run(); replyHandler(true, nil) } catch { fail(error.localizedDescription) }
        default:
            fail("acción desconocida: \(op)")
        }
    }

    // Enlaces externos en el navegador; diálogos de archivo nativos para <input type=file>
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = a.request.url, let sc = url.scheme, !["archivero", "about", "blob", "data"].contains(sc) {
            NSWorkspace.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = a.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let p = NSOpenPanel(); p.allowsMultipleSelection = parameters.allowsMultipleSelection; p.canChooseDirectories = false
        p.beginSheetModal(for: window) { r in completionHandler(r == .OK ? p.urls : nil) }
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // MARK: menús
    @objc func js(_ sender: NSMenuItem) { if let c = sender.representedObject as? String { web.evaluateJavaScript(c, completionHandler: nil) } }
    func item(_ t: String, _ code: String, _ key: String, _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
        let it = NSMenuItem(title: t, action: #selector(js(_:)), keyEquivalent: key)
        it.keyEquivalentModifierMask = mods; it.representedObject = code; it.target = self
        return it
    }
    func buildMenu() {
        let bar = NSMenu()
        let appItem = NSMenuItem(); bar.addItem(appItem)
        let am = NSMenu()
        am.addItem(withTitle: "Acerca de Archivero", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        am.addItem(.separator())
        am.addItem(item("Ajustes…", "App.go('settings')", ","))
        am.addItem(.separator())
        am.addItem(withTitle: "Ocultar Archivero", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        am.addItem(withTitle: "Ocultar otros", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h").keyEquivalentModifierMask = [.command, .option]
        am.addItem(.separator())
        am.addItem(withTitle: "Salir de Archivero", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = am

        let fItem = NSMenuItem(); bar.addItem(fItem)
        let f = NSMenu(title: "Archivo")
        f.addItem(item("Nueva carpeta", "App.newFolder()", "n", [.command, .shift]))
        f.addItem(item("Importar…", "App.importPick()", "o"))
        f.addItem(item("Escanear documento", "Tools.scan(App.st.cwd)", ""))
        f.addItem(item("Grabar audio", "Tools.record(App.st.cwd)", ""))
        f.addItem(item("Descargar desde enlace…", "Tools.download(App.st.cwd)", "l"))
        f.addItem(.separator())
        f.addItem(item("Mostrar en Finder", "VFS.bridge({op:'reveal',path:App.st.cwd})", "r", [.command, .option]))
        f.addItem(.separator())
        f.addItem(item("Cerrar documento", "Viewers.requestClose()", "w"))
        fItem.submenu = f

        let eItem = NSMenuItem(); bar.addItem(eItem)
        let e = NSMenu(title: "Edición")
        e.addItem(withTitle: "Deshacer", action: Selector(("undo:")), keyEquivalent: "z")
        e.addItem(withTitle: "Rehacer", action: Selector(("redo:")), keyEquivalent: "z").keyEquivalentModifierMask = [.command, .shift]
        e.addItem(.separator())
        e.addItem(withTitle: "Cortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        e.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        e.addItem(withTitle: "Pegar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        e.addItem(withTitle: "Seleccionar todo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        e.addItem(.separator())
        e.addItem(item("Buscar", "document.getElementById('q').focus()", "f"))
        eItem.submenu = e

        let vItem = NSMenuItem(); bar.addItem(vItem)
        let v = NSMenu(title: "Ir")
        v.addItem(item("Mis archivos", "App.go('files');App.cd('/')", "1"))
        v.addItem(item("Recientes", "App.go('recent')", "2"))
        v.addItem(item("Favoritos", "App.go('favs')", "3"))
        v.addItem(item("Fotos y videos", "App.go('media')", "4"))
        v.addItem(item("Documentos", "App.go('docs')", "5"))
        v.addItem(item("Herramientas", "App.go('tools')", "6"))
        v.addItem(.separator())
        v.addItem(item("Carpeta superior", "App.st.cwd!=='/'&&App.cd(VFS.parent(App.st.cwd))", String(Character(UnicodeScalar(NSUpArrowFunctionKey)!))))
        v.addItem(.separator())
        v.addItem(withTitle: "Pantalla completa", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]
        vItem.submenu = v

        let wItem = NSMenuItem(); bar.addItem(wItem)
        let w = NSMenu(title: "Ventana")
        w.addItem(withTitle: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        w.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        wItem.submenu = w
        NSApp.windowsMenu = w
        NSApp.mainMenu = bar
    }
}

// MARK: navegador con pestañas; las descargas van a Archivero/Descargas
final class Browser: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, NSTextFieldDelegate {
    static var all: [Browser] = []
    let win: NSWindow, web: WKWebView, addr = NSTextField(), priv: Bool
    weak var main: AppDelegate?
    static func open(_ s: String, priv: Bool, main: AppDelegate) {
        let b = Browser(priv: priv, main: main)
        if let first = all.first(where: { $0.win.isVisible && $0.priv == priv }) { first.win.addTabbedWindow(b.win, ordered: .above) }
        all.append(b)
        b.win.makeKeyAndOrderFront(nil)
        b.go(s)
    }
    init(priv: Bool, main: AppDelegate) {
        self.priv = priv; self.main = main
        let cfg = WKWebViewConfiguration()
        if priv { cfg.websiteDataStore = .nonPersistent() }
        web = WKWebView(frame: .zero, configuration: cfg)
        web.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"
        web.allowsBackForwardNavigationGestures = true
        win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        super.init()
        win.tabbingMode = .preferred; win.tabbingIdentifier = priv ? "archivero-priv" : "archivero-web"
        win.title = priv ? "Navegación privada" : "Navegador"; win.isReleasedWhenClosed = false
        web.navigationDelegate = self; web.uiDelegate = self
        func btn(_ sym: String, _ tip: String, _ sel: Selector) -> NSButton {
            let b = NSButton(image: NSImage(systemSymbolName: sym, accessibilityDescription: tip)!, target: self, action: sel)
            b.bezelStyle = .texturedRounded; b.toolTip = tip; return b
        }
        addr.placeholderString = "Busca o introduce el sitio web"; addr.delegate = self
        addr.target = self; addr.action = #selector(enter)
        let bar = NSStackView(views: [btn("chevron.left", "Atrás", #selector(back)), btn("chevron.right", "Adelante", #selector(fwd)), btn("arrow.clockwise", "Recargar", #selector(reload)), addr,
                                      btn("plus", "Nueva pestaña", #selector(newTab)), btn("doc.richtext", "Guardar página como PDF", #selector(savePDF)), btn("star", "Guardar enlace en Archivero", #selector(saveLink))])
        bar.edgeInsets = NSEdgeInsets(top: 6, left: 8, bottom: 6, right: 8); bar.spacing = 6
        let stack = NSStackView(views: [bar, web]); stack.orientation = .vertical; stack.spacing = 0
        stack.setHuggingPriority(.defaultLow, for: .horizontal)
        web.translatesAutoresizingMaskIntoConstraints = false
        win.contentView = stack
        win.center()
        NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: win, queue: .main) { [weak self] _ in Browser.all.removeAll { $0 === self } }
    }
    func go(_ s: String) {
        var t = s.trimmingCharacters(in: .whitespaces)
        if !t.contains("://") { t = t.contains(".") && !t.contains(" ") ? "https://" + t : "https://www.google.com/search?q=" + (t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t) }
        if let u = URL(string: t) { web.load(URLRequest(url: u)) }
    }
    @objc func enter() { go(addr.stringValue) }
    @objc func back() { web.goBack() }
    @objc func fwd() { web.goForward() }
    @objc func reload() { web.reload() }
    @objc func newTab() { if let m = main { Browser.open("https://www.google.com", priv: priv, main: m) } }
    func toast(_ s: String) {
        guard let d = try? JSONSerialization.data(withJSONObject: [s]), let j = String(data: d, encoding: .utf8) else { return }
        main?.web.evaluateJavaScript("UI.toast(\(j)[0],3500);App.refresh()", completionHandler: nil)
    }
    var downloads: URL { let d = Store.shared.root.appendingPathComponent("Descargas"); try? fm.createDirectory(at: d, withIntermediateDirectories: true); return d }
    @objc func savePDF() {
        web.createPDF { r in
            guard case .success(let data) = r else { return }
            let name = (self.web.title?.isEmpty == false ? self.web.title! : "Página").replacingOccurrences(of: "/", with: "-")
            let dst = Store.shared.unique(self.downloads.appendingPathComponent(name + ".pdf"))
            try? data.write(to: dst); self.toast("Página guardada en Descargas: " + dst.lastPathComponent)
        }
    }
    @objc func saveLink() {
        guard let u = web.url else { return }
        let name = (web.title?.isEmpty == false ? web.title! : u.host ?? "Enlace").replacingOccurrences(of: "/", with: "-")
        let dst = Store.shared.unique(downloads.appendingPathComponent(name + ".url"))
        try? "[InternetShortcut]\r\nURL=\(u.absoluteString)\r\n".write(to: dst, atomically: true, encoding: .utf8)
        toast("Enlace guardado en Descargas")
    }
    func webView(_ w: WKWebView, didCommit n: WKNavigation!) { addr.stringValue = w.url?.absoluteString ?? "" }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { win.title = w.title?.isEmpty == false ? w.title! : "Navegador"; addr.stringValue = w.url?.absoluteString ?? "" }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url, let m = main { Browser.open(u.absoluteString, priv: priv, main: m) }
        return nil
    }
    func webView(_ w: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disp = (r.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        decisionHandler(r.canShowMIMEType && !disp.lowercased().hasPrefix("attachment") ? .allow : .download)
    }
    func webView(_ w: WKWebView, navigationResponse: WKNavigationResponse, didBecome d: WKDownload) { d.delegate = self }
    func webView(_ w: WKWebView, navigationAction: WKNavigationAction, didBecome d: WKDownload) { d.delegate = self }
    func download(_ d: WKDownload, decideDestinationUsing r: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        completionHandler(Store.shared.unique(downloads.appendingPathComponent(suggestedFilename)))
    }
    func downloadDidFinish(_ d: WKDownload) { toast("Descarga terminada · carpeta Descargas") }
    func download(_ d: WKDownload, didFailWithError e: Error, resumeData: Data?) { toast("La descarga falló: " + e.localizedDescription) }
}

// MARK: transferencia por Wi‑Fi (servidor HTTP mínimo con código)
final class Transfer {
    static let shared = Transfer()
    var listener: NWListener?, code = "", token = UUID().uuidString
    func ip() -> String {
        var addr = "localhost", ifa: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifa) == 0 else { return addr }
        var p = ifa
        while let i = p {
            let f = i.pointee
            if f.ifa_addr.pointee.sa_family == UInt8(AF_INET), let n = String(validatingCString: f.ifa_name), n.hasPrefix("en") {
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                getnameinfo(f.ifa_addr, socklen_t(f.ifa_addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST)
                addr = String(cString: host); if n == "en0" { break }
            }
            p = f.ifa_next
        }
        freeifaddrs(ifa); return addr
    }
    func start() throws -> [String: Any] {
        stop()
        code = String(format: "%04d", Int.random(in: 0...9999)); token = UUID().uuidString
        let l = try NWListener(using: .tcp, on: 8642)
        l.newConnectionHandler = { [weak self] c in self?.serve(c) }
        l.start(queue: .global())
        listener = l
        return ["url": "http://\(ip()):8642", "code": code]
    }
    func stop() { listener?.cancel(); listener = nil }
    func serve(_ c: NWConnection) {
        c.start(queue: .global())
        var buf = Data()
        func read() {
            c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { d, _, done, err in
                if let d = d { buf.append(d) }
                if let r = buf.range(of: Data("\r\n\r\n".utf8)) {
                    let head = String(decoding: buf[..<r.lowerBound], as: UTF8.self)
                    let len = Int(head.lowercased().components(separatedBy: "\r\n").first { $0.hasPrefix("content-length:") }?.dropFirst(15).trimmingCharacters(in: .whitespaces) ?? "0") ?? 0
                    if buf.count - r.upperBound >= len { self.handle(c, head, buf.subdata(in: r.upperBound..<(r.upperBound + len))); return }
                }
                if done || err != nil { c.cancel() } else { read() }
            }
        }
        read()
    }
    func reply(_ c: NWConnection, _ status: String, _ type: String, _ body: Data, _ extra: String = "") {
        var h = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\n" + extra + "\r\n"
        if status.hasPrefix("302") { h = "HTTP/1.1 302 Found\r\nLocation: /\r\nContent-Length: 0\r\nConnection: close\r\n" + extra + "\r\n" }
        c.send(content: Data(h.utf8) + body, completion: .contentProcessed { _ in c.cancel() })
    }
    func esc(_ s: String) -> String { s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: "\"", with: "&quot;") }
    func handle(_ c: NWConnection, _ head: String, _ body: Data) {
        let first = head.components(separatedBy: "\r\n")[0].split(separator: " ")
        guard first.count >= 2 else { c.cancel(); return }
        let method = String(first[0]), comps = URLComponents(string: String(first[1]))
        let path = comps?.path ?? "/", q = Dictionary((comps?.queryItems ?? []).map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
        let authed = head.contains("ak=" + token)
        let style = "<meta name=viewport content='width=device-width,initial-scale=1'><style>body{font:16px -apple-system,sans-serif;max-width:760px;margin:0 auto;padding:18px;background:#F4F2EE;color:#1c1d1f}a{color:#0B7A75;text-decoration:none}.r{display:flex;gap:10px;align-items:center;background:#fff;border-radius:12px;padding:12px 14px;margin:6px 0}.r span{flex:1;word-break:break-word}h1{font-size:24px}input,button{font:inherit;padding:10px 14px;border-radius:10px;border:1px solid #ccc}button{background:#0B7A75;color:#fff;border:0}small{color:#777}</style>"
        if method == "POST" && path == "/login" {
            let sent = String(decoding: body, as: UTF8.self).replacingOccurrences(of: "code=", with: "")
            if sent == code { reply(c, "302", "text/plain", Data(), "Set-Cookie: ak=\(token); Path=/; HttpOnly\r\n") } else { reply(c, "200 OK", "text/html; charset=utf-8", Data((style + "<h1>Código incorrecto</h1><a href='/'>Volver</a>").utf8)) }
            return
        }
        if !authed {
            reply(c, "200 OK", "text/html; charset=utf-8", Data((style + "<h1>Archivero</h1><p>Ingresa el código que aparece en el Mac.</p><form method=post action=/login><input name=code inputmode=numeric maxlength=4 autofocus> <button>Entrar</button></form>").utf8)); return
        }
        let dir = q["d"] ?? "/"
        if method == "GET" && path == "/f", let u = Store.shared.url(q["p"] ?? ""), let d = try? Data(contentsOf: u, options: .mappedIfSafe) {
            let name = u.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "archivo"
            reply(c, "200 OK", UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? "application/octet-stream", d, "Content-Disposition: attachment; filename*=UTF-8''\(name)\r\n"); return
        }
        if method == "PUT" && path == "/up", let d = Store.shared.url(dir) {
            let dst = Store.shared.unique(d.appendingPathComponent((q["n"] ?? "archivo").replacingOccurrences(of: "/", with: "-")))
            try? body.write(to: dst)
            DispatchQueue.main.async { (NSApp.delegate as? AppDelegate)?.web.evaluateJavaScript("App.refresh();UI.toast('Recibido: '+\(String(data: try! JSONSerialization.data(withJSONObject: [dst.lastPathComponent]), encoding: .utf8)!)[0])", completionHandler: nil) }
            reply(c, "200 OK", "text/plain", Data("ok".utf8)); return
        }
        guard let du = Store.shared.url(dir) else { reply(c, "404 Not Found", "text/plain", Data()); return }
        let items = ((try? fm.contentsOfDirectory(at: du, includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey], options: [.skipsHiddenFiles])) ?? []).sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
        var html = style + "<h1>Archivero</h1><p><small>" + esc(dir) + "</small></p>"
        if dir != "/" { let up = (dir as NSString).deletingLastPathComponent; html += "<div class=r><a href='/?d=\(up.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)'>⬆︎ Subir un nivel</a></div>" }
        html += "<div class=r><span><b>Subir archivos aquí</b></span><input type=file id=f multiple><button onclick=up()>Subir</button></div><div id=st></div>"
        for u in items {
            let isDir = (try? u.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false, vp = Store.shared.vpath(u).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
            let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize).flatMap { $0 }.map { ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file) } ?? ""
            html += isDir ? "<div class=r>📁 <span><a href='/?d=\(vp)'>\(esc(u.lastPathComponent))</a></span></div>" : "<div class=r>📄 <span>\(esc(u.lastPathComponent)) <small>\(size)</small></span><a href='/f?p=\(vp)'>Descargar</a></div>"
        }
        html += "<script>function up(){var f=document.getElementById('f').files,s=document.getElementById('st'),i=0;(function n(){if(i>=f.length){location.reload();return}var x=f[i++];s.textContent='Subiendo '+x.name+'…';fetch('/up?d=\(dir.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)&n='+encodeURIComponent(x.name),{method:'PUT',body:x}).then(n)})()}</script>"
        reply(c, "200 OK", "text/html; charset=utf-8", Data(html.utf8))
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
