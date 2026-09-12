import AppKit

// An isolated native document app for exercising the real driver without touching personal files.
final class Trial: NSObject, NSApplicationDelegate {
    let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
    var window: NSWindow!
    let text = NSTextField(string: "Draft brief")
    let status = NSTextField(labelWithString: "Editor ready")
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 640, height: 360),
                          styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "Dext computer trial"
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 18
        stack.edgeInsets = NSEdgeInsets(top: 28, left: 28, bottom: 28, right: 28)
        stack.translatesAutoresizingMaskIntoConstraints = false
        text.setAccessibilityLabel("Brief text")
        status.setAccessibilityLabel("Trial status")
        stack.addArrangedSubview(text)
        for (title, selector) in [("Save brief", #selector(save)), ("Show summary", #selector(summary)), ("Open reference", #selector(openReference))] {
            stack.addArrangedSubview(NSButton(title: title, target: self, action: selector))
        }
        stack.addArrangedSubview(status)
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor),
            text.widthAnchor.constraint(equalToConstant: 560)
        ])
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    @objc func save() {
        do { try text.stringValue.write(to: root.appendingPathComponent("brief.txt"), atomically: true, encoding: .utf8); status.stringValue = "Brief saved" }
        catch { status.stringValue = "Save failed" }
    }
    @objc func summary() { status.stringValue = "Summary: document ready for review"; text.stringValue = status.stringValue }
    @objc func openReference() {
        let panel = NSOpenPanel()
        panel.directoryURL = root.appendingPathComponent("reference", isDirectory: true)
        panel.allowsMultipleSelection = false
        panel.beginSheetModal(for: window) { response in
            if response == .OK, let url = panel.url {
                self.status.stringValue = "Opened " + url.lastPathComponent
                self.text.stringValue = self.status.stringValue
                try? url.lastPathComponent.write(to: self.root.appendingPathComponent("opened.txt"), atomically: true, encoding: .utf8)
            }
        }
    }
}
let delegate = Trial()
NSApplication.shared.setActivationPolicy(.regular)
NSApplication.shared.delegate = delegate
NSApplication.shared.run()
