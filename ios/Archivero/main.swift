import UIKit
import WebKit
import PDFKit
import SafariServices
import UniformTypeIdentifiers
import Network

// Archivero para iPhone/iPad: la misma interfaz web (index.html) dentro de un WKWebView, servida por archivero://localhost.
// Los archivos viven en una carpeta real: por defecto «En mi iPhone › Archivero» (visible en la app Archivos),
// o la carpeta que elijas en iCloud Drive u otra nube (se recuerda con un marcador de seguridad).
// El HTML habla con iOS por window.webkit.messageHandlers.fs (mismo puente que la app de Mac).

let fm = FileManager.default
weak var mainWeb: WKWebView?

func jsString(_ s: String) -> String {
    let d = try! JSONSerialization.data(withJSONObject: [s])
    return String(data: d, encoding: .utf8)! + "[0]"
}

final class Store {
    static let shared = Store()
    let docs = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
    var root: URL
    var scoped: [URL] = []

    init() {
        root = docs
        if let d = UserDefaults.standard.data(forKey: "rootBookmark"), let u = resolve(d) { root = u }
        ensureRoot()
    }
    func resolve(_ data: Data) -> URL? {
        var stale = false
        guard let u = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        if u.startAccessingSecurityScopedResource() { scoped.append(u) }
        return u
    }
    func bookmark(_ u: URL) -> Data? {
        _ = u.startAccessingSecurityScopedResource()
        return try? u.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
    }
    func ensureRoot() {
        let kids = (try? fm.contentsOfDirectory(atPath: root.path))?.filter { !$0.hasPrefix(".") } ?? []
        if kids.isEmpty {
            for f in ["Documentos", "Fotos", "Música", "Descargas"] { try? fm.createDirectory(at: root.appendingPathComponent(f), withIntermediateDirectories: true) }
        }
    }
    var label: String {
        if root == docs { return "En mi " + (UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone") + " › Archivero" }
        let p = root.path
        if p.contains("com~apple~CloudDocs") { return "iCloud Drive › " + p.components(separatedBy: "com~apple~CloudDocs/").last! }
        return root.lastPathComponent
    }
    // conexiones: carpetas agregadas con el selector (otras nubes, discos, servidores) + el almacenamiento local si la raíz está en otro lado
    var conns: [[String: Any]] = []
    func scanConns() {
        var out: [[String: Any]] = []
        if root != docs { out.append(["id": "local", "name": label.hasPrefix("En mi") ? "Archivero" : "En mi " + (UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"), "kind": "disk", "path": docs.path, "custom": false]) }
        for (id, data) in (UserDefaults.standard.dictionary(forKey: "connBookmarks") as? [String: Data]) ?? [:] {
            guard let u = resolve(data) else { continue }
            let kind = u.path.contains("CloudDocs") || u.path.contains("CloudStorage") || u.path.contains("FileProvider") ? "cloud" : "folder"
            out.append(["id": id, "name": u.lastPathComponent, "kind": kind, "path": u.path, "custom": true])
        }
        conns = out
    }
    func connRoot(_ id: String) -> URL? {
        if conns.isEmpty { scanConns() }
        return conns.first(where: { ($0["id"] as! String) == id }).map { URL(fileURLWithPath: $0["path"] as! String) }
    }
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
    // iCloud aún no descargado aparece como «.nombre.icloud»: se muestra con su nombre real y se pide la descarga
    func info(_ u0: URL) -> [String: Any]? {
        var u = u0
        let n = u.lastPathComponent
        if n.hasPrefix(".") && n.hasSuffix(".icloud") {
            u = u.deletingLastPathComponent().appendingPathComponent(String(n.dropFirst().dropLast(7)))
            try? fm.startDownloadingUbiquitousItem(at: u)
        } else if n.hasPrefix(".") { return nil }
        let a = (try? fm.attributesOfItem(atPath: u.path)) ?? (try? fm.attributesOfItem(atPath: u0.path))
        guard let a = a else { return nil }
        let dir = (a[.type] as? FileAttributeType) == .typeDirectory
        var d: [String: Any] = ["path": vpath(u), "name": u.lastPathComponent, "kind": dir ? "dir" : "file",
                                "mtime": ((a[.modificationDate] as? Date) ?? Date()).timeIntervalSince1970 * 1000,
                                "ctime": ((a[.creationDate] as? Date) ?? Date()).timeIntervalSince1970 * 1000]
        if !dir { d["size"] = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? (a[.size] as? NSNumber)?.intValue ?? 0 }
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

// MARK: esquema archivero:// (interfaz + archivos con rangos para audio y video)
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    let res = Bundle.main.resourceURL!
    var stopped = Set<ObjectIdentifier>()
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        var path = url.path.removingPercentEncoding ?? url.path
        let range = task.request.value(forHTTPHeaderField: "Range")
        var file: URL?
        let isFS = path.hasPrefix("/__fs__")
        if isFS { file = Store.shared.url(String(path.dropFirst(7))) }
        else {
            if path == "/" || path.isEmpty { path = "/index.html" }
            let f = res.appendingPathComponent(String(path.dropFirst()))
            file = f.standardizedFileURL.path.hasPrefix(res.standardizedFileURL.path) ? f : nil
        }
        let id = ObjectIdentifier(task)
        DispatchQueue.global(qos: .userInitiated).async {
            // la coordinación descarga desde iCloud si hace falta
            var target = file
            if isFS, let f = file {
                var err: NSError?
                NSFileCoordinator().coordinate(readingItemAt: f, options: [], error: &err) { target = $0 }
            }
            DispatchQueue.main.async { self.serve(task, id, url, target, range) }
        }
    }
    func serve(_ task: WKURLSchemeTask, _ id: ObjectIdentifier, _ url: URL, _ file: URL?, _ range: String?) {
        if stopped.remove(id) != nil { return }
        guard let f = file, let h = try? FileHandle(forReadingFrom: f) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish(); return
        }
        defer { try? h.close() }
        let total = (try? fm.attributesOfItem(atPath: f.path)[.size] as? NSNumber)??.intValue ?? 0
        let mime = UTType(filenameExtension: f.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        var start = 0, end = total - 1, status = 200
        if let r = range, r.hasPrefix("bytes="), total > 0 {
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
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) { stopped.insert(ObjectIdentifier(task)) }
}

// Selector de documentos con cierre (se retiene hasta que el usuario elige o cancela)
final class Picker: NSObject, UIDocumentPickerDelegate {
    static var live: [Picker] = []
    let done: ([URL]) -> Void
    init(_ done: @escaping ([URL]) -> Void) { self.done = done }
    func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls); Picker.live.removeAll { $0 === self } }
    func documentPickerWasCancelled(_ c: UIDocumentPickerViewController) { done([]); Picker.live.removeAll { $0 === self } }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    let vc = WebVC()
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
        guard let ws = scene as? UIWindowScene else { return }
        let w = UIWindow(windowScene: ws)
        w.rootViewController = vc
        w.makeKeyAndVisible()
        window = w
        vc.pending += options.urlContexts.map { $0.url }
    }
    func scene(_ scene: UIScene, openURLContexts c: Set<UIOpenURLContext>) { vc.receive(c.map { $0.url }) }
}

final class WebVC: UIViewController, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    var web: WKWebView!
    var S: Store { Store.shared }
    var pageReady = false, pending: [URL] = []

    override func loadView() {
        let cfg = WKWebViewConfiguration()
        cfg.setURLSchemeHandler(SchemeHandler(), forURLScheme: "archivero")
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "fs")
        cfg.userContentController.addUserScript(WKUserScript(source: "window.ARCHIVERO_IOS=true", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = .systemBackground
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isInspectable = true
        mainWeb = web
        view = web
        web.load(URLRequest(url: URL(string: "archivero://localhost/index.html")!))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageReady = true
        // prueba automática en el simulador: ARCHIVERO_EVAL=archivo.js ejecuta ese código e imprime el resultado
        if let f = ProcessInfo.processInfo.environment["ARCHIVERO_EVAL"], let code = try? String(contentsOfFile: f, encoding: .utf8) {
            web.callAsyncJavaScript(code, arguments: [:], in: nil, in: .page) { r in
                switch r { case .success(let v): print("EVAL", v); case .failure(let e): print("EVAL ERROR", e) }
                fflush(stdout)
            }
        }
        if !pending.isEmpty { let u = pending; pending = []; DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.receive(u) } }
    }
    // Archivos abiertos desde otras apps («Compartir › Archivero») o desde Archivos
    func receive(_ urls: [URL]) {
        if !pageReady { pending += urls; return }
        var paths: [String] = []
        let inbox = S.root.appendingPathComponent("Recibidos")
        for u in urls where u.isFileURL {
            let sc = u.startAccessingSecurityScopedResource()
            defer { if sc { u.stopAccessingSecurityScopedResource() } }
            if u.standardizedFileURL.path.hasPrefix(S.root.standardizedFileURL.path) { paths.append(S.vpath(u)); continue }
            try? fm.createDirectory(at: inbox, withIntermediateDirectories: true)
            let dst = S.unique(inbox.appendingPathComponent(u.lastPathComponent))
            if (try? fm.copyItem(at: u, to: dst)) != nil { paths.append(S.vpath(dst)) }
            // lo que llega por «Compartir» queda en Documents/Inbox; limpiarlo
            if u.path.contains("/Documents/Inbox/") { try? fm.removeItem(at: u) }
        }
        try? fm.removeItem(at: S.docs.appendingPathComponent("Inbox"))
        if let d = try? JSONSerialization.data(withJSONObject: paths), let j = String(data: d, encoding: .utf8) {
            web.evaluateJavaScript("App.nativeImported(\(j))", completionHandler: nil)
        }
    }

    func present(_ c: UIViewController, at r: CGRect? = nil) {
        if let p = c.popoverPresentationController {
            p.sourceView = web
            p.sourceRect = r ?? CGRect(x: web.bounds.midX, y: web.bounds.midY, width: 1, height: 1)
            if r == nil { p.permittedArrowDirections = [] }
        }
        var top: UIViewController = self
        while let p = top.presentedViewController { top = p }
        top.present(c, animated: true)
    }
    func pick(_ c: UIDocumentPickerViewController, _ done: @escaping ([URL]) -> Void) {
        let p = Picker(done); Picker.live.append(p)
        c.delegate = p
        present(c)
    }
    func shareSheet(_ items: [Any], at r: CGRect? = nil) { present(UIActivityViewController(activityItems: items, applicationActivities: nil), at: r) }

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
            if !fm.fileExists(atPath: x.path) {
                let ph = x.deletingLastPathComponent().appendingPathComponent("." + x.lastPathComponent + ".icloud")
                replyHandler(fm.fileExists(atPath: ph.path) ? (S.info(ph) ?? NSNull()) : NSNull(), nil); return
            }
            replyHandler(S.info(x) ?? NSNull(), nil)
        case "list":
            guard let x = u(path), let kids = try? fm.contentsOfDirectory(at: x, includingPropertiesForKeys: nil, options: []) else { replyHandler([], nil); return }
            replyHandler(kids.compactMap { S.info($0) }, nil)
        case "walk":
            guard let x = u(path) else { replyHandler([], nil); return }
            var out: [[String: Any]] = []
            if let me = S.info(x) { out.append(me) }
            if let e = fm.enumerator(at: x, includingPropertiesForKeys: nil, options: [.skipsPackageDescendants]) {
                for case let f as URL in e {
                    if f.lastPathComponent.hasPrefix(".") && !f.lastPathComponent.hasSuffix(".icloud") { e.skipDescendants(); continue }
                    if let i = S.info(f) { out.append(i) }
                }
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
                    if s.path.lowercased() == d.path.lowercased() && s.path != d.path {
                        let t = s.deletingLastPathComponent().appendingPathComponent(UUID().uuidString)
                        try fm.moveItem(at: s, to: t); try fm.moveItem(at: t, to: d)
                    } else { try fm.moveItem(at: s, to: d) }
                } else { try fm.copyItem(at: s, to: d) }
                replyHandler(true, nil)
            } catch { fail(error.localizedDescription) }
        case "trash":
            guard let x = u(path), path != "/" else { fail("Ruta inválida"); return }
            // Papelera del sistema si el proveedor la tiene (iCloud Drive); si no, carpeta oculta .Papelera en la raíz
            if (try? fm.trashItem(at: x, resultingItemURL: nil)) != nil { replyHandler(true, nil); return }
            let bin = S.root.appendingPathComponent(".Papelera")
            do {
                try fm.createDirectory(at: bin, withIntermediateDirectories: true)
                try fm.moveItem(at: x, to: S.unique(bin.appendingPathComponent(x.lastPathComponent)))
                replyHandler(true, nil)
            } catch { fail(error.localizedDescription) }
        case "usage":
            let v = try? S.root.resourceValues(forKeys: [.volumeTotalCapacityKey])
            var used = 0
            if let e = fm.enumerator(at: S.root, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles]) {
                for case let f as URL in e { used += (try? f.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) ?? 0 }
            }
            replyHandler(["used": used, "total": v?.volumeTotalCapacity ?? 0], nil)
        case "reveal":
            // abre la app Archivos en esa carpeta
            if let x = u(path) {
                let dir = (try? x.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true ? x : x.deletingLastPathComponent()
                if let link = URL(string: "shareddocuments://" + (dir.path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? dir.path)) { UIApplication.shared.open(link) }
            }
            replyHandler(true, nil)
        case "openExternal":
            if let x = u(path) { shareSheet([x]) }
            replyHandler(true, nil)
        case "openTrash":
            replyHandler(true, nil)
        case "clip":
            UIPasteboard.general.string = b["text"] as? String ?? ""
            replyHandler(true, nil)
        case "importPanel":
            let dir = u(b["dir"] as? String ?? "/") ?? S.root
            let c = UIDocumentPickerViewController(forOpeningContentTypes: [.item, .folder], asCopy: true)
            c.allowsMultipleSelection = true
            pick(c) { urls in
                var n = 0
                for src in urls {
                    let sc = src.startAccessingSecurityScopedResource()
                    if (try? fm.copyItem(at: src, to: self.S.unique(dir.appendingPathComponent(src.lastPathComponent)))) != nil { n += 1 }
                    if sc { src.stopAccessingSecurityScopedResource() }
                }
                replyHandler(n, nil)
            }
        case "chooseRoot":
            let c = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
            c.directoryURL = URL(fileURLWithPath: "/private/var/mobile/Library/Mobile Documents/com~apple~CloudDocs")
            pick(c) { urls in
                guard let d = urls.first, let bm = self.S.bookmark(d) else { replyHandler(false, nil); return }
                UserDefaults.standard.set(bm, forKey: "rootBookmark")
                self.S.root = d; self.S.ensureRoot(); self.S.scanConns()
                replyHandler(true, nil)
            }
        case "saveAs":
            guard let s = b["data"] as? String, let data = Data(base64Encoded: s) else { fail("Datos inválidos"); return }
            let tmp = fm.temporaryDirectory.appendingPathComponent((b["name"] as? String ?? "archivo").replacingOccurrences(of: "/", with: "-"))
            do { try data.write(to: tmp) } catch { fail(error.localizedDescription); return }
            pick(UIDocumentPickerViewController(forExporting: [tmp], asCopy: true)) { urls in replyHandler(!urls.isEmpty, nil) }
        case "export":
            guard let x = u(path) else { fail("Ruta inválida"); return }
            pick(UIDocumentPickerViewController(forExporting: [x], asCopy: true)) { urls in replyHandler(!urls.isEmpty, nil) }
        case "share":
            let urls = (b["paths"] as? [String] ?? []).compactMap { u($0) }
            let r = CGRect(x: b["x"] as? Double ?? 0, y: b["y"] as? Double ?? 0, width: max(1, b["w"] as? Double ?? 1), height: max(1, b["h"] as? Double ?? 1))
            shareSheet(urls, at: (b["x"] == nil) ? nil : r)
            replyHandler(true, nil)
        case "print":
            guard let x = u(path) else { fail("No se pudo imprimir"); return }
            let p = UIPrintInteractionController.shared
            p.printingItem = x
            p.present(animated: true)
            replyHandler(true, nil)
        case "download":
            guard let s = b["url"] as? String, let src = URL(string: s) else { fail("Enlace inválido"); return }
            let dir = u(b["dir"] as? String ?? "/") ?? S.root
            var req = URLRequest(url: src, timeoutInterval: 120)
            req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
            URLSession.shared.downloadTask(with: req) { tmp, resp, err in
                var dst: URL?, problem: String?
                if let tmp = tmp, err == nil {
                    if let h = resp as? HTTPURLResponse, h.statusCode >= 400 { problem = "El servidor respondió \(h.statusCode)" }
                    else {
                        var name = resp?.suggestedFilename ?? src.lastPathComponent
                        if name.isEmpty { name = "descarga" }
                        let d = self.S.unique(dir.appendingPathComponent(name))
                        do { try fm.moveItem(at: tmp, to: d); dst = d } catch { problem = error.localizedDescription }
                    }
                } else { problem = err?.localizedDescription ?? "Sin respuesta" }
                DispatchQueue.main.async { if let d = dst { replyHandler(self.S.vpath(d), nil) } else { fail(problem ?? "Error") } }
            }.resume()
        case "browse":
            var t = (b["url"] as? String ?? "").trimmingCharacters(in: .whitespaces)
            if !t.contains("://") { t = t.contains(".") && !t.contains(" ") ? "https://" + t : "https://www.google.com/search?q=" + (t.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? t) }
            if let url = URL(string: t), ["http", "https"].contains(url.scheme?.lowercased() ?? "") { present(SFSafariViewController(url: url)) }
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
            pick(UIDocumentPickerViewController(forOpeningContentTypes: [.folder])) { urls in
                guard let d = urls.first, let bm = self.S.bookmark(d) else { replyHandler(false, nil); return }
                var c = (UserDefaults.standard.dictionary(forKey: "connBookmarks") as? [String: Data]) ?? [:]
                c["f-" + d.lastPathComponent.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "-", options: .regularExpression)] = bm
                UserDefaults.standard.set(c, forKey: "connBookmarks")
                replyHandler(true, nil)
            }
        case "connRemove":
            var c = (UserDefaults.standard.dictionary(forKey: "connBookmarks") as? [String: Data]) ?? [:]
            c.removeValue(forKey: b["id"] as? String ?? ""); UserDefaults.standard.set(c, forKey: "connBookmarks")
            replyHandler(true, nil)
        case "connServer":
            fail("En iPhone/iPad conecta el servidor en la app Archivos (… › Conectarse al servidor) y luego agrégalo aquí con «Agregar carpeta».")
        default:
            fail("acción desconocida: \(op)")
        }
    }

    // Enlaces externos en Safari
    func webView(_ webView: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = a.request.url, let sc = url.scheme, !["archivero", "about", "blob", "data"].contains(sc) {
            UIApplication.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = a.request.url { UIApplication.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: m, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(a)
    }
}

// MARK: transferencia por Wi‑Fi (servidor HTTP mínimo con código; funciona mientras Archivero está abierto)
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
        UIApplication.shared.isIdleTimerDisabled = true
        return ["url": "http://\(ip()):8642", "code": code]
    }
    func stop() { listener?.cancel(); listener = nil; DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false } }
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
            reply(c, "200 OK", "text/html; charset=utf-8", Data((style + "<h1>Archivero</h1><p>Ingresa el código que aparece en Archivero.</p><form method=post action=/login><input name=code inputmode=numeric maxlength=4 autofocus> <button>Entrar</button></form>").utf8)); return
        }
        let dir = q["d"] ?? "/"
        if method == "GET" && path == "/f", let u = Store.shared.url(q["p"] ?? ""), let d = try? Data(contentsOf: u, options: .mappedIfSafe) {
            let name = u.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "archivo"
            reply(c, "200 OK", UTType(filenameExtension: u.pathExtension)?.preferredMIMEType ?? "application/octet-stream", d, "Content-Disposition: attachment; filename*=UTF-8''\(name)\r\n"); return
        }
        if method == "PUT" && path == "/up", let d = Store.shared.url(dir) {
            let dst = Store.shared.unique(d.appendingPathComponent((q["n"] ?? "archivo").replacingOccurrences(of: "/", with: "-")))
            try? body.write(to: dst)
            DispatchQueue.main.async { mainWeb?.evaluateJavaScript("App.refresh();UI.toast('Recibido: '+\(jsString(dst.lastPathComponent)))", completionHandler: nil) }
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

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
