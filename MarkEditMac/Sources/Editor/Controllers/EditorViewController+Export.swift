//
//  EditorViewController+Export.swift
//  MarkEditMac
//
//  Export pipeline: page setup, PDF rendering/pagination, and the export-preview dialog.
//

import AppKit
import WebKit
import PDFKit
import MarkEditKit

// MARK: - PDF Export

/// The JSON returned by `window.markEditGetExportOptions()`.
struct ExportOptions: Decodable {
  let pageSize: String
  let orientation: String
}

/// A paper size in PDF points (72 per inch), already oriented.
struct PDFPageSetup {
  let width: CGFloat
  let height: CGFloat

  static let a4 = Self(width: 595, height: 842)

  /// Build a setup from the normalized `page_size` / `orientation` strings the web side emits.
  /// Unknown sizes fall back to A4; "landscape" swaps width and height.
  init(pageSize: String, orientation: String) {
    let portrait: (width: CGFloat, height: CGFloat)
    switch pageSize {
    case "letter": portrait = (612, 792)
    case "legal": portrait = (612, 1008)
    default: portrait = (595, 842) // a4
    }

    if orientation == "landscape" {
      self.width = portrait.height
      self.height = portrait.width
    } else {
      self.width = portrait.width
      self.height = portrait.height
    }
  }

  private init(width: CGFloat, height: CGFloat) {
    self.width = width
    self.height = height
  }
}

/// Renders HTML to a paginated PDF that matches the preview exactly: WebKit produces a single
/// tall PDF (which is reliable, unlike headless print), then PDFKit slices it into pages,
/// breaking at element boundaries (measured in the DOM) so content isn't cut mid-block.
@MainActor
final class PDFExporter: NSObject, WKNavigationDelegate {
  private struct Metrics: Decodable {
    let total: Double
    let breaks: [Double]
  }

  // Paper size in points (from the document frontmatter), with page margins.
  private let pageWidth: CGFloat
  private let pageHeight: CGFloat
  private let verticalMargin: CGFloat = 48

  private var webView: WKWebView?
  private var continuation: CheckedContinuation<Data?, Never>?
  private var didComplete = false

  init(pageSetup: PDFPageSetup) {
    self.pageWidth = pageSetup.width
    self.pageHeight = pageSetup.height
  }

  func export(html: String) async -> Data? {
    await withCheckedContinuation { continuation in
      self.continuation = continuation

      let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight))
      webView.navigationDelegate = self
      self.webView = webView
      webView.loadHTMLString(html, baseURL: nil)

      // Safety net so the caller never waits forever
      DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
        self?.finish(nil)
      }
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
    // Let layout and images settle before capturing
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
      self?.render(webView)
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
    finish(nil)
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
    finish(nil)
  }

  private func render(_ webView: WKWebView) {
    // Measure safe page-break positions (bottom of each top-level block)
    let script = """
    (() => {
      const body = document.body;
      const breaks = [];
      for (const el of body.children) { breaks.push(el.offsetTop + el.offsetHeight); }
      return JSON.stringify({ total: body.scrollHeight, breaks });
    })()
    """

    webView.evaluateJavaScript(script) { [weak self] result, _ in
      guard let self else { return }

      let metrics = (result as? String)
        .flatMap { $0.data(using: .utf8) }
        .flatMap { try? JSONDecoder().decode(Metrics.self, from: $0) }

      webView.createPDF(configuration: WKPDFConfiguration()) { pdfResult in
        switch pdfResult {
        case .success(let data): self.paginate(tallPDF: data, metrics: metrics)
        case .failure(let error):
          Logger.log(.error, "createPDF failed: \(error.localizedDescription)")
          self.finish(nil)
        }
      }
    }
  }

  private func paginate(tallPDF: Data, metrics: Metrics?) {
    guard let document = PDFDocument(data: tallPDF), let page = document.page(at: 0) else {
      return finish(nil)
    }

    let bounds = page.bounds(for: .mediaBox)
    let contentHeight = bounds.height
    let width = bounds.width

    // Map DOM pixel break points to PDF points (createPDF may not be exactly 1:1)
    let breaks: [CGFloat] = {
      guard let metrics, metrics.total > 0 else {
        return []
      }

      let scale = contentHeight / CGFloat(metrics.total)
      return metrics.breaks.map { CGFloat($0) * scale }.sorted()
    }()

    // Stop at the bottom of the last content block, ignoring trailing body padding,
    // otherwise that empty space spills onto an extra blank page.
    let contentEnd = breaks.last ?? contentHeight
    let usableHeight = pageHeight - 2 * verticalMargin
    var slices: [(top: CGFloat, bottom: CGFloat)] = []
    var start: CGFloat = 0
    while start < contentEnd - 0.5 {
      let limit = start + usableHeight
      let candidate = breaks.last { $0 > start + 1 && $0 <= limit }
      let end = candidate ?? min(limit, contentEnd)
      slices.append((start, end))
      start = end
    }

    let output = NSMutableData()
    var mediaBox = CGRect(x: 0, y: 0, width: width, height: pageHeight)
    guard let consumer = CGDataConsumer(data: output as CFMutableData),
          let context = CGContext(consumer: consumer, mediaBox: &mediaBox, nil) else {
      return finish(nil)
    }

    for slice in slices {
      context.beginPDFPage(nil)
      context.saveGState()
      // Keep the slice inside the top/bottom margins
      context.clip(to: CGRect(x: 0, y: verticalMargin, width: width, height: usableHeight))
      // Align the slice's top with the top of the page's content area
      context.translateBy(x: 0, y: (pageHeight - verticalMargin) - (contentHeight - slice.top))
      page.draw(with: .mediaBox, to: context)
      context.restoreGState()
      context.endPDFPage()
    }

    context.closePDF()
    finish(output as Data)
  }

  private func finish(_ data: Data?) {
    guard !didComplete else {
      return
    }

    didComplete = true
    webView = nil
    continuation?.resume(returning: data)
    continuation = nil
  }
}

// MARK: - Export Preview (EXPORT-003)

extension EditorViewController {
  /// Open a dialog to review the document with a chosen template, page size and orientation,
  /// then export it to PDF or HTML from the same place.
  @IBAction func showExportPreview(_ sender: Any?) {
    Task { @MainActor in
      let options = await currentExportOptions()
      let controller = ExportPreviewWindowController(
        editor: self,
        pageSize: options.pageSize,
        orientation: options.orientation
      )
      controller.present(from: view.window)
    }
  }
}

/// A standalone window that renders the export HTML (identical pipeline to the real export) and
/// lets the user pick template, paper size and orientation before saving a PDF or HTML file.
/// Page-break guides are an approximate on-screen aid; the actual PDF still breaks at block
/// boundaries during pagination.
@MainActor
final class ExportPreviewWindowController: NSWindowController, NSWindowDelegate {
  private weak var editor: EditorViewController?
  private var pageSizeId: String
  private var orientationId: String

  private let previewWebView = WKWebView()
  private let templatePopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let pageSizePopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let orientationPopup = NSPopUpButton(frame: .zero, pullsDown: false)
  private let pageBreaksCheck = NSButton(checkboxWithTitle: Localized.Export.showPageBreaks, target: nil, action: nil)

  private let templateIds = ["minimal", "technical", "business", "academic"]
  private let pageSizeIds = ["a4", "letter", "legal"]
  private let orientationIds = ["portrait", "landscape"]

  // Keep the controller alive while its window is on screen (nothing else retains it).
  private var retainedSelf: ExportPreviewWindowController?

  init(editor: EditorViewController, pageSize: String, orientation: String) {
    self.editor = editor
    self.pageSizeId = pageSizeIds.contains(pageSize) ? pageSize : "a4"
    self.orientationId = orientationIds.contains(orientation) ? orientation : "portrait"

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 720, height: 820),
      styleMask: [.titled, .closable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = Localized.Export.previewTitle
    window.minSize = NSSize(width: 480, height: 480)

    super.init(window: window)
    window.delegate = self
    buildLayout()
    configureControls()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func present(from parent: NSWindow?) {
    retainedSelf = self
    window?.center()
    showWindow(nil)
    reload()
  }

  func windowWillClose(_ notification: Notification) {
    retainedSelf = nil
  }

  // MARK: - Layout

  private func buildLayout() {
    guard let contentView = window?.contentView else {
      return
    }

    let controls = NSStackView(views: [
      labeled(Localized.Export.template, templatePopup),
      labeled(Localized.Export.pageSize, pageSizePopup),
      labeled(Localized.Export.orientation, orientationPopup),
      pageBreaksCheck,
    ])
    controls.orientation = .horizontal
    controls.spacing = 12
    controls.translatesAutoresizingMaskIntoConstraints = false

    previewWebView.translatesAutoresizingMaskIntoConstraints = false
    previewWebView.wantsLayer = true

    let closeButton = NSButton(title: Localized.Export.close, target: self, action: #selector(closeTapped))
    closeButton.keyEquivalent = "\u{1b}" // Esc
    let htmlButton = NSButton(title: Localized.Export.exportHTML, target: self, action: #selector(exportHTMLTapped))
    let pdfButton = NSButton(title: Localized.Export.exportPDF, target: self, action: #selector(exportPDFTapped))
    pdfButton.keyEquivalent = "\r"

    let buttons = NSStackView(views: [NSView(), closeButton, htmlButton, pdfButton])
    buttons.orientation = .horizontal
    buttons.spacing = 10
    buttons.translatesAutoresizingMaskIntoConstraints = false

    contentView.addSubview(controls)
    contentView.addSubview(previewWebView)
    contentView.addSubview(buttons)

    NSLayoutConstraint.activate([
      controls.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 14),
      controls.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
      controls.trailingAnchor.constraint(lessThanOrEqualTo: contentView.trailingAnchor, constant: -16),

      previewWebView.topAnchor.constraint(equalTo: controls.bottomAnchor, constant: 12),
      previewWebView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
      previewWebView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),

      buttons.topAnchor.constraint(equalTo: previewWebView.bottomAnchor, constant: 10),
      buttons.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 16),
      buttons.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -16),
      buttons.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -14),
    ])
  }

  private func labeled(_ text: String, _ control: NSView) -> NSStackView {
    let label = NSTextField(labelWithString: text)
    let row = NSStackView(views: [label, control])
    row.orientation = .horizontal
    row.spacing = 6
    return row
  }

  private func configureControls() {
    templatePopup.addItems(withTitles: templateIds.map { Localized.Export.templateName($0) })
    templatePopup.target = self
    templatePopup.action = #selector(templateChanged)
    if let index = templateIds.firstIndex(of: AppPreferences.Preview.template) {
      templatePopup.selectItem(at: index)
    }

    pageSizePopup.addItems(withTitles: ["A4", "Letter", "Legal"])
    pageSizePopup.target = self
    pageSizePopup.action = #selector(pageSetupChanged)
    if let index = pageSizeIds.firstIndex(of: pageSizeId) {
      pageSizePopup.selectItem(at: index)
    }

    orientationPopup.addItems(withTitles: [Localized.Export.portrait, Localized.Export.landscape])
    orientationPopup.target = self
    orientationPopup.action = #selector(pageSetupChanged)
    if let index = orientationIds.firstIndex(of: orientationId) {
      orientationPopup.selectItem(at: index)
    }

    pageBreaksCheck.target = self
    pageBreaksCheck.action = #selector(pageSetupChanged)
  }

  // MARK: - Actions

  @objc private func templateChanged() {
    let id = templateIds[templatePopup.indexOfSelectedItem]
    AppPreferences.Preview.template = id
    editor?.webView.evaluateJavaScript("window.markEditSetTemplate && window.markEditSetTemplate('\(id)')")
    reload()
  }

  @objc private func pageSetupChanged() {
    pageSizeId = pageSizeIds[pageSizePopup.indexOfSelectedItem]
    orientationId = orientationIds[orientationPopup.indexOfSelectedItem]
    reload()
  }

  @objc private func closeTapped() {
    close()
  }

  @objc private func exportPDFTapped() {
    let setup = PDFPageSetup(pageSize: pageSizeId, orientation: orientationId)
    let editor = self.editor
    close()
    Task { @MainActor in
      await editor?.runPDFExport(pageSetup: setup)
    }
  }

  @objc private func exportHTMLTapped() {
    let editor = self.editor
    close()
    Task { @MainActor in
      await editor?.runHTMLExport()
    }
  }

  // MARK: - Rendering

  private func reload() {
    Task { @MainActor in
      guard let editor, var html = await editor.fetchExportHTML() else {
        return
      }

      if pageBreaksCheck.state == .on {
        html = injectPageBreakGuides(into: html)
      }

      previewWebView.loadHTMLString(html, baseURL: nil)
    }
  }

  /// Overlay approximate page-break guide lines by drawing a repeating gradient behind the body,
  /// spaced by the selected paper's usable height. This is a visual aid, not the real pagination.
  private func injectPageBreakGuides(into html: String) -> String {
    let setup = PDFPageSetup(pageSize: pageSizeId, orientation: orientationId)
    let scale: CGFloat = 96.0 / 72.0 // CSS pixels per PDF point
    let bodyWidth = Int(setup.width * scale)
    let pageHeight = max(Int((setup.height - 96) * scale), 120) // 48pt top + bottom margins

    let style = """
    <style id="me-export-guides">
    body { max-width: \(bodyWidth)px !important; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent \(pageHeight - 2)px, rgba(214, 69, 69, 0.45) \(pageHeight - 2)px, rgba(214, 69, 69, 0.45) \(pageHeight)px) !important; }
    </style>
    """

    if let range = html.range(of: "</head>") {
      return html.replacingCharacters(in: range, with: "\(style)</head>")
    }

    return html + style
  }
}
