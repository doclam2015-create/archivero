import AppKit

// Genera los íconos de Archivero: mac (con margen y sombra) e iOS/web (a sangre)
func render(size: CGFloat, mac: Bool) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let s = size / 1024
    let bgRect = mac ? NSRect(x: 100*s, y: 100*s, width: 824*s, height: 824*s) : NSRect(x: 0, y: 0, width: size, height: size)
    let bgPath = mac ? NSBezierPath(roundedRect: bgRect, xRadius: 185*s, yRadius: 185*s) : NSBezierPath(rect: bgRect)
    if mac {
        NSGraphicsContext.saveGraphicsState()
        let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(0.35); sh.shadowOffset = NSSize(width: 0, height: -12*s); sh.shadowBlurRadius = 28*s; sh.set()
        NSColor.black.setFill(); bgPath.fill()
        NSGraphicsContext.restoreGraphicsState()
    }
    func C(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor { NSColor(srgbRed: r/255, green: g/255, blue: b/255, alpha: a) }
    NSGradient(colors: [C(22, 160, 150), C(8, 92, 88), C(6, 58, 64)])!.draw(in: bgPath, angle: -70)
    NSGradient(colors: [NSColor.white.withAlphaComponent(0.18), NSColor.white.withAlphaComponent(0)])!.draw(in: bgPath, angle: -90)

    let k: CGFloat = mac ? 0.805 : 1.0
    let cx = size/2, cy = size/2
    func P(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: cx + (x-512)*s*k, y: cy - (y-512)*s*k) }
    func R(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> NSBezierPath {
        let a = P(x, y + h), b = P(x + w, y)
        return NSBezierPath(roundedRect: NSRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y), xRadius: r*s*k, yRadius: r*s*k)
    }
    func shadow(_ blur: CGFloat, _ dy: CGFloat, _ a: CGFloat) { let sh = NSShadow(); sh.shadowColor = NSColor.black.withAlphaComponent(a); sh.shadowOffset = NSSize(width: 0, height: -dy*s*k); sh.shadowBlurRadius = blur*s*k; sh.set() }

    // pestaña trasera de la carpeta
    NSGraphicsContext.saveGraphicsState(); shadow(30, 12, 0.25)
    let back = NSBezierPath()
    back.move(to: P(196, 330)); back.line(to: P(196, 286))
    back.appendArc(from: P(196, 250), to: P(232, 250), radius: 36*s*k)
    back.line(to: P(400, 250)); back.line(to: P(450, 300)); back.line(to: P(792, 300))
    back.appendArc(from: P(828, 300), to: P(828, 336), radius: 36*s*k)
    back.line(to: P(828, 400)); back.line(to: P(196, 400)); back.close()
    C(255, 214, 120).setFill(); back.fill()
    NSGraphicsContext.restoreGraphicsState()

    // hojas que asoman
    NSGraphicsContext.saveGraphicsState(); shadow(16, 6, 0.22)
    let sheet2 = R(300, 236, 440, 380, 22); C(232, 240, 238).setFill(); sheet2.fill()
    let sheet = R(262, 280, 440, 380, 22); NSColor.white.setFill(); sheet.fill()
    NSGraphicsContext.restoreGraphicsState()
    C(200, 214, 212).setFill()
    for (i, w) in [300, 240, 270].enumerated() { R(304, CGFloat(322 + i*40), CGFloat(w), 18, 9).fill() }

    // frente de la carpeta
    NSGraphicsContext.saveGraphicsState(); shadow(34, 14, 0.30)
    let front = NSBezierPath()
    front.move(to: P(170, 420))
    front.appendArc(from: P(170, 384), to: P(206, 384), radius: 36*s*k)
    front.line(to: P(818, 384)); front.appendArc(from: P(854, 384), to: P(854, 420), radius: 36*s*k)
    front.line(to: P(830, 760)); front.appendArc(from: P(826, 796), to: P(790, 796), radius: 36*s*k)
    front.line(to: P(234, 796)); front.appendArc(from: P(198, 796), to: P(194, 760), radius: 36*s*k)
    front.close()
    NSGradient(colors: [C(255, 200, 87), C(244, 162, 43)])!.draw(in: front, angle: -90)
    NSGraphicsContext.restoreGraphicsState()
    // brillo del borde superior
    NSColor.white.withAlphaComponent(0.35).setFill(); R(206, 392, 612, 10, 5).fill()
    // asa / etiqueta
    NSGraphicsContext.saveGraphicsState(); shadow(6, 2, 0.18)
    let tag = R(432, 560, 160, 64, 32); C(255, 248, 232).setFill(); tag.fill()
    NSGraphicsContext.restoreGraphicsState()
    C(205, 120, 20).setFill(); R(468, 584, 88, 16, 8).fill()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let out = CommandLine.arguments[1]
try! render(size: 1024, mac: true).write(to: URL(fileURLWithPath: out + "/icon-mac-1024.png"))
try! render(size: 1024, mac: false).write(to: URL(fileURLWithPath: out + "/icon-ios-1024.png"))
