//
//  EditorViewController+Menu.swift
//  MarkEditMac
//
//  Created by cyan on 12/15/22.
//

import AppKit
import WebKit
import PDFKit
import UniformTypeIdentifiers
import MarkEditKit
import FontPicker

// MARK: - NSMenu Creation

extension EditorViewController {
  var searchActionsMenuItem: NSMenuItem? {
    guard findPanel.mode != .hidden else {
      return nil
    }

    let menu = NSMenu()
    menu.autoenablesItems = false

    let canSelect = findPanel.numberOfItems > 0
    let canReplace = canSelect && findPanel.mode == .replace

    menu.addItem(withTitle: Localized.Search.selectAll) { [weak self] in
      self?.performSearchOperation(.selectAll)
    }.isEnabled = canSelect

    menu.addItem(withTitle: Localized.Search.selectAllInSelection) { [weak self] in
      self?.performSearchOperation(.selectAllInSelection)
    }.isEnabled = canSelect

    menu.addItem(withTitle: Localized.Search.replaceAll) { [weak self] in
      self?.performSearchOperation(.replaceAll)
    }.isEnabled = canReplace

    menu.addItem(withTitle: Localized.Search.replaceAllInSelection) { [weak self] in
      self?.performSearchOperation(.replaceAllInSelection)
    }.isEnabled = canReplace

    let item = NSMenuItem(title: Localized.Search.searchActions)
    item.tag = WKContextMenuItemTag.searchMenu.rawValue
    item.submenu = menu
    return item
  }
}

// MARK: - NSMenuDelegate

extension EditorViewController: NSMenuDelegate {
  func menuNeedsUpdate(_ menu: NSMenu) {
    updateToolbarItemMenus(menu)
    updateUserDefinedMenus(menu)
  }

  func menuWillOpen(_ menu: NSMenu) {
    presentedMenu = menu
  }

  func menuDidClose(_ menu: NSMenu) {
    DispatchQueue.main.async {
      self.presentedMenu = nil
    }

    // Reflect state changes earlier
    updateUserDefinedMenus(menu)
  }
}

// MARK: - NSMenuItemValidation

extension EditorViewController: NSMenuItemValidation {
  /// Actions that require the existence of a file.
  private static let fileActions = [
    #selector(copyFilePath(_:)),
    #selector(copyFolderPath(_:)),
    #selector(copyPandocCommand(_:)),
    #selector(revealInFinder(_:)),
    #selector(deleteVersionsByDate(_:)),
    #selector(deleteVersionsByCapacity(_:)),
  ]

  func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
    // Preview menu items reflect the current state with a checkmark
    switch menuItem.action {
    case #selector(setPreviewModeEditorOnly(_:)):
      menuItem.state = AppPreferences.Preview.viewMode == "editor" ? .on : .off
      return true
    case #selector(setPreviewModeSplit(_:)):
      menuItem.state = AppPreferences.Preview.viewMode == "split" ? .on : .off
      return true
    case #selector(setPreviewModePreviewOnly(_:)):
      menuItem.state = AppPreferences.Preview.viewMode == "preview" ? .on : .off
      return true
    case #selector(toggleScrollSync(_:)):
      menuItem.state = AppPreferences.Preview.syncScroll ? .on : .off
      // Scroll sync only matters in split view
      return AppPreferences.Preview.viewMode == "split"
    default:
      break
    }

    // Disable most edit actions for read-only mode
    if isReadOnlyMode {
      guard let menu = menuItem.menu, let delegate = NSApp.appDelegate else {
        return false
      }

      // Enable a few menus and items for "Read Only Mode", mostly navigation related
      if isReadOnlyMode {
        // Table of Contents, Font, Find
        let menus = [delegate.editTableOfContentsMenu, delegate.editFontMenu, delegate.editFindMenu]
        if (menus.contains { menu.isDescendantOf(menu: $0) }) {
          return true
        }

        // Goto to Line, Read Only Mode, Statistics
        let items = [delegate.editGotoLineItem, delegate.editReadOnlyItem, delegate.editStatisticsItem]
        if items.contains(menuItem) {
          return true
        }
      }

      return [
        delegate.mainEditMenu,
        delegate.reopenFileMenu,
        delegate.lineEndingsMenu,
        delegate.textFormatMenu,
      ].allSatisfy { !menu.isDescendantOf(menu: $0) }
    }

    // When webView is not the firstResponder, disable some menus entirely
    if NSApp.keyWindow?.firstResponder != webView {
      let disabledMenus = [
        NSApp.appDelegate?.textFormatMenu,
        NSApp.appDelegate?.editCommandsMenu,
      ]

      if (disabledMenus.contains { menuItem.menu?.isDescendantOf(menu: $0) == true }) {
        return false
      }
    }

    if let action = menuItem.action, Self.fileActions.contains(action) {
      return document?.fileURL != nil
    }

    switch menuItem.action {
    case #selector(resetFontSize(_:)):
      return abs(AppPreferences.Editor.fontSize - FontPicker.defaultFontSize) > .ulpOfOne
    case #selector(makeFontBigger(_:)):
      return AppPreferences.Editor.fontSize < FontPicker.maximumFontSize
    case #selector(makeFontSmaller(_:)):
      return AppPreferences.Editor.fontSize > FontPicker.minimumFontSize
    case #selector(actualSize(_:)):
      return abs(webView.magnification - 1.0) > .ulpOfOne
    case #selector(zoomIn(_:)):
      return webView.magnification < Constants.maximumZoomLevel
    case #selector(zoomOut(_:)):
      return webView.magnification > Constants.minimumZoomLevel
    case #selector(toggleWindowFloating(_:)):
      return view.window?.isKeyWindow == true
    default:
      return true
    }
  }
}

// MARK: - Application

extension EditorViewController {
  @IBAction func terminate(_ sender: Any?) {
    // Window restoration is enabled, handle unsaved drafts to prevent data loss
    if AppPreferences.General.quitAlwaysKeepsWindows, let unsavedDraft {
      return unsavedDraft.runModalSavePanel(
        for: .saveOperation,
        delegate: self,
        didSave: #selector(handleDraftSave(_:didSave:)),
        contextInfo: nil
      )
    }

    performTerminate(sender)
  }

  // MARK: - Window Restoration

  var unsavedDraft: NSDocument? {
    NSDocumentController.shared.editorDocuments.first {
      $0.fileURL == nil && ($0.isOutdated || $0.hasUnautosavedChanges)
    }
  }

  @objc private func handleDraftSave(_ document: NSDocument, didSave: Bool) {
    guard didSave else {
      return
    }

    if unsavedDraft == nil {
      performTerminate(nil)
    } else {
      document.close()
    }
  }

  private func performTerminate(_ sender: Any?) {
    NSDocumentController.shared.editorDocuments.forEach {
      $0.isTerminating = true
    }

    NSApp.terminate(sender)
  }
}

// MARK: - Developer

extension EditorViewController {
  @IBAction func inspectElement(_ sender: Any?) {
    webView.showInspector()
  }
}

// MARK: - Formatting

extension EditorViewController {

  // MARK: - Headers

  @IBAction func toggleH1(_ sender: Any?) {
    bridge.format.toggleHeading(level: 1)
  }

  @IBAction func toggleH2(_ sender: Any?) {
    bridge.format.toggleHeading(level: 2)
  }

  @IBAction func toggleH3(_ sender: Any?) {
    bridge.format.toggleHeading(level: 3)
  }

  @IBAction func toggleH4(_ sender: Any?) {
    bridge.format.toggleHeading(level: 4)
  }

  @IBAction func toggleH5(_ sender: Any?) {
    bridge.format.toggleHeading(level: 5)
  }

  @IBAction func toggleH6(_ sender: Any?) {
    bridge.format.toggleHeading(level: 6)
  }

  // MARK: - Text Styles

  @IBAction func toggleBold(_ sender: Any?) {
    bridge.format.toggleBold()
  }

  @IBAction func toggleItalic(_ sender: Any?) {
    bridge.format.toggleItalic()
  }

  @IBAction func toggleStrikethrough(_ sender: Any?) {
    bridge.format.toggleStrikethrough()
  }

  // MARK: - Preview

  @IBAction func setPreviewModeEditorOnly(_ sender: Any?) {
    setPreviewMode("editor")
  }

  @IBAction func setPreviewModeSplit(_ sender: Any?) {
    setPreviewMode("split")
  }

  @IBAction func setPreviewModePreviewOnly(_ sender: Any?) {
    setPreviewMode("preview")
  }

  @IBAction func toggleScrollSync(_ sender: Any?) {
    let enabled = !AppPreferences.Preview.syncScroll
    AppPreferences.Preview.syncScroll = enabled
    webView.evaluateJavaScript("window.markEditSetScrollSync && window.markEditSetScrollSync(\(enabled))")
  }

  private func setPreviewMode(_ mode: String) {
    AppPreferences.Preview.viewMode = mode
    invokePreviewMode(mode)

    if mode != "editor" {
      offerFolderAccessIfNeeded()
    }
  }

  /// Push the persisted preview state to the editor (used on launch/reset and when switching).
  func applyPreviewMode() {
    invokePreviewMode(AppPreferences.Preview.viewMode)
    webView.evaluateJavaScript("window.markEditSetScrollSync && window.markEditSetScrollSync(\(AppPreferences.Preview.syncScroll))")
  }

  private func invokePreviewMode(_ mode: String) {
    webView.evaluateJavaScript("window.markEditSetPreviewMode && window.markEditSetPreviewMode('\(mode)')")
  }

  // MARK: - Local image access

  /// Folders we already offered access to this session, to avoid repeated prompts.
  private static var foldersOfferedImageAccess = Set<String>()

  /// When a document references local images the sandbox can't read yet, offer to
  /// grant access to its folder so the preview can display them.
  func offerFolderAccessIfNeeded() {
    guard AppPreferences.Preview.viewMode != "editor" else {
      return
    }

    guard let document, let folderURL = document.folderURL else {
      return
    }

    let path = folderURL.path
    guard !Self.foldersOfferedImageAccess.contains(path) else {
      return
    }

    guard documentReferencesLocalImages(document.stringValue) else {
      return
    }

    // Already readable (e.g., a previously granted folder)? Nothing to do.
    guard (try? FileManager.default.contentsOfDirectory(atPath: path)) == nil else {
      return
    }

    Self.foldersOfferedImageAccess.insert(path)

    Task { @MainActor in
      let response = await showAlert(
        title: Localized.General.grantImageAccessTitle,
        message: Localized.General.grantImageAccessMessage,
        buttons: [Localized.General.grantAccess, Localized.Updater.notNow]
      )

      guard response == .alertFirstButtonReturn else {
        return
      }

      if await NSApp.appDelegate?.requestFolderAccess(startingAt: folderURL) == true {
        _ = try? await webView.evaluateJavaScript("window.markEditRenderPreview && window.markEditRenderPreview()")
      }
    }
  }

  private func documentReferencesLocalImages(_ text: String) -> Bool {
    let pattern = #"!\[[^\]]*\]\(\s*(?![a-zA-Z][a-zA-Z0-9+.\-]*:)(?!#)[^)\s]+"#
    return text.range(of: pattern, options: .regularExpression) != nil
  }

  // MARK: - Export

  /// Export the document as a self-contained HTML file (Minimal template), no external tools.
  @IBAction func exportHTML(_ sender: Any?) {
    Task { @MainActor in
      guard let result = try? await webView.evaluateJavaScript("window.markEditGetExportHTML && window.markEditGetExportHTML()"),
            let html = result as? String else {
        return Logger.log(.error, "Failed to build export HTML")
      }

      let document = embedLocalImages(in: html)
      let name = (self.document?.fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled") + ".html"
      _ = await showSavePanel(data: Data(document.utf8), fileName: name)
    }
  }

  /// Export the document as a paginated PDF, no external tools.
  /// Renders through WebKit (identical to the preview) and paginates with PDFKit,
  /// breaking at element boundaries so content isn't cut across pages.
  @IBAction func exportPDF(_ sender: Any?) {
    Task { @MainActor in
      guard let result = try? await webView.evaluateJavaScript("window.markEditGetExportHTML && window.markEditGetExportHTML()"),
            let html = result as? String else {
        return Logger.log(.error, "Failed to build export HTML")
      }

      guard let pdfData = await PDFExporter().export(html: embedLocalImages(in: html)) else {
        return Logger.log(.error, "Failed to render PDF")
      }

      let name = (self.document?.fileURL?.deletingPathExtension().lastPathComponent ?? "Untitled") + ".pdf"
      _ = await showSavePanel(data: pdfData, fileName: name)
    }
  }

  /// Replace image-loader URLs with base64 data URIs so the exported file is self-contained.
  private func embedLocalImages(in html: String) -> String {
    guard let folderURL = document?.folderURL,
          let regex = try? NSRegularExpression(pattern: "image-loader://([^\"']+)") else {
      return html
    }

    var result = html
    let matches = regex.matches(in: html, range: NSRange(html.startIndex..., in: html)).reversed()
    for match in matches {
      guard let fullRange = Range(match.range, in: result),
            let pathRange = Range(match.range(at: 1), in: result) else {
        continue
      }

      let path = String(result[pathRange])
      let fileURL = folderURL.appending(path: path.removingPercentEncoding ?? path, directoryHint: .notDirectory)
      guard let data = try? Data(contentsOf: fileURL) else {
        continue
      }

      let mime = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
      result.replaceSubrange(fullRange, with: "data:\(mime);base64,\(data.base64EncodedString())")
    }

    return result
  }

  // MARK: - Hyper Link

  @IBAction func insertLink(_ sender: Any?) {
    insertHyperLink(prefix: nil)
  }

  @IBAction func insertImage(_ sender: Any?) {
    insertHyperLink(prefix: "!")
  }

  // MARK: - List

  @IBAction func toggleBullet(_ sender: Any?) {
    bridge.format.toggleBullet()
  }

  @IBAction func toggleNumbering(_ sender: Any?) {
    bridge.format.toggleNumbering()
  }

  @IBAction func toggleTodo(_ sender: Any?) {
    bridge.format.toggleTodo()
  }

  // MARK: - Others

  @IBAction func toggleBlockquote(_ sender: Any?) {
    bridge.format.toggleBlockquote()
  }

  @IBAction func toggleInlineCode(_ sender: Any?) {
    bridge.format.toggleInlineCode()
  }

  @IBAction func toggleInlineMath(_ sender: Any?) {
    bridge.format.toggleInlineMath()
  }

  @IBAction func insertCodeBlock(_ sender: Any?) {
    bridge.format.insertCodeBlock()
  }

  @IBAction func insertMathBlock(_ sender: Any?) {
    bridge.format.insertMathBlock()
  }

  @IBAction func insertHorizontalRule(_ sender: Any?) {
    bridge.format.insertHorizontalRule()
  }

  @IBAction func insertTable(_ sender: Any?) {
    bridge.format.insertTable(
      columnName: Localized.Editor.tableColumnName,
      itemName: Localized.Editor.tableItemName
    )
  }
}

// MARK: - Text Find

extension EditorViewController {
  @IBAction func startFind(_ sender: Any?) {
    updateTextFinderMode(.find)
  }

  @IBAction func startReplace(_ sender: Any?) {
    updateTextFinderMode(.replace)
  }

  @IBAction func findSelection(_ sender: Any?) {
    findSelectionInTextFinder()
  }

  @IBAction func findNextMatch(_ sender: Any?) {
    findNextInTextFinder()
  }

  @IBAction func findPreviousMatch(_ sender: Any?) {
    findPreviousInTextFinder()
  }

  @IBAction func selectAllOccurrences(_ sender: Any?) {
    selectAllOccurrences()
  }

  @IBAction func selectNextOccurrence(_ sender: Any?) {
    selectNextOccurrence()
  }

  @IBAction func scrollToSelection(_ sender: Any?) {
    bridge.selection.scrollToSelection()
  }
}

// MARK: - Document

private extension EditorViewController {
  @IBAction func performClose(_ sender: Any?) {
    view.window?.performClose(sender)
  }

  @IBAction func createNewTab(_ sender: Any?) {
    let window = view.window
    let tabbingMode = window?.tabbingMode

    // Force tabbing without mutating the persisted preference
    EditorWindow.forcedTabbing = true
    window?.tabbingMode = .preferred
    NSDocumentController.shared.newDocument(sender)

    DispatchQueue.main.async {
      EditorWindow.forcedTabbing = false
      if let tabbingMode {
        window?.tabbingMode = tabbingMode
      }
    }
  }

  @IBAction func revealInFinder(_ sender: Any?) {
    guard let fileURL = document?.fileURL else { return }
    NSWorkspace.shared.activateFileViewerSelecting([fileURL])
  }

  @IBAction func copyFilePath(_ sender: Any?) {
    guard let fileURL = document?.fileURL else { return }
    NSPasteboard.general.overwrite(string: fileURL.path)
  }

  @IBAction func copyFolderPath(_ sender: Any?) {
    guard let folderURL = document?.folderURL else { return }
    NSPasteboard.general.overwrite(string: folderURL.path)
  }

  @IBAction func copyPandocCommand(_ sender: Any?) {
    guard let document, let format = (sender as? NSMenuItem)?.identifier?.rawValue else {
      Logger.log(.error, "Failed to copy pandoc command")
      return
    }

    copyPandocCommand(document: document, format: format)
  }

  @IBAction func learnPandoc(_ sender: Any?) {
    NSWorkspace.shared.safelyOpenURL(string: "https://github.com/MarkEdit-app/MarkEdit/wiki/Manual#pandoc")
  }

  @IBAction func deleteVersionsByDate(_ sender: Any?) {
    guard let document, let days = (sender as? NSMenuItem)?.tag else {
      Logger.log(.error, "Failed to delete versions by: \(String(describing: sender))")
      return
    }

    Task {
      await deleteFileVersions(document.otherVersions(olderThanDays: days))
    }
  }

  @IBAction func deleteVersionsByCapacity(_ sender: Any?) {
    guard let document, let maxLength = (sender as? NSMenuItem)?.tag else {
      Logger.log(.error, "Failed to delete versions by: \(String(describing: sender))")
      return
    }

    Task {
      await deleteFileVersions(document.otherVersions(olderThanMaxLength: maxLength))
    }
  }
}

// MARK: - Edit

private extension EditorViewController {
  @IBAction func undo(_ sender: Any?) {
    if let currentInput {
      currentInput.performTextAction(.undo, sender: sender)
    } else {
      NSApp.sendAction(#selector(undo(_:)), to: nil, from: sender)
    }
  }

  @IBAction func redo(_ sender: Any?) {
    if let currentInput {
      currentInput.performTextAction(.redo, sender: sender)
    } else {
      NSApp.sendAction(#selector(redo(_:)), to: nil, from: sender)
    }
  }

  @IBAction func selectWholeDocument(_ sender: Any?) {
    // The default implementation "selectAll" only selects the viewport
    if let currentInput {
      currentInput.performTextAction(.selectAll, sender: sender)
    } else {
      NSApp.sendAction(#selector(selectAll(_:)), to: nil, from: sender)
    }
  }

  @IBAction func gotoLine(_ sender: Any?) {
    showGotoLineWindow(sender)
  }

  @IBAction func openTableOfContents(_ sender: Any?) {
    if let presentedMenu {
      return presentedMenu.cancelTracking()
    }

    // [macOS 14] +enableWindowReuse crash, DispatchQueue would not work
    RunLoop.main.perform {
      Task { @MainActor in
        self.showTableOfContentsMenu()
      }
    }
  }

  @IBAction func selectPreviousSection(_ sender: Any?) {
    startTextEditing()
    bridge.toc.selectPreviousSection()
  }

  @IBAction func selectNextSection(_ sender: Any?) {
    startTextEditing()
    bridge.toc.selectNextSection()
  }

  @IBAction func navigateGoBack(_ sender: Any?) {
    bridge.selection.navigateGoBack()
  }

  @IBAction func resetFontSize(_ sender: Any?) {
    AppPreferences.Editor.fontSize = FontPicker.defaultFontSize
    notifyFontSizeChanged()
  }

  @IBAction func makeFontBigger(_ sender: Any?) {
    AppPreferences.Editor.fontSize = min(FontPicker.maximumFontSize, AppPreferences.Editor.fontSize + 1)
    notifyFontSizeChanged()
  }

  @IBAction func makeFontSmaller(_ sender: Any?) {
    AppPreferences.Editor.fontSize = max(FontPicker.minimumFontSize, AppPreferences.Editor.fontSize - 1)
    notifyFontSizeChanged()
  }

  @IBAction func performEditCommand(_ sender: Any?) {
    guard let identifier = (sender as? NSMenuItem)?.identifier?.rawValue else {
      Logger.log(.error, "Missing identifier to performCommand")
      return
    }

    guard let command = EditCommand(rawValue: identifier) else {
      Logger.log(.error, "Missing command to performCommand")
      return
    }

    bridge.format.performEditCommand(command: command)
  }

  @IBAction func toggleReadOnlyMode(_ sender: Any?) {
    (sender as? NSMenuItem)?.toggle()
    isReadOnlyMode.toggle()
    bridge.config.setReadOnlyMode(enabled: isReadOnlyMode)
  }

  @IBAction func toggleStatistics(_ sender: Any?) {
    // To wait for the menu to reset its state
    DispatchQueue.main.async {
      self.toggleStatisticsPopover(sourceView: self.statisticsSourceView)
    }
  }

  @IBAction func toggleTypewriterMode(_ sender: Any?) {
    AppPreferences.Editor.typewriterMode.toggle()
    setTypewriterMode(enabled: AppPreferences.Editor.typewriterMode)
  }
}

// MARK: - View

private extension EditorViewController {
  @IBAction func actualSize(_ sender: Any?) {
    webView.magnification = 1.0
  }

  @IBAction func zoomIn(_ sender: Any?) {
    webView.magnification = min(Constants.maximumZoomLevel, webView.magnification + 0.1)
  }

  @IBAction func zoomOut(_ sender: Any?) {
    webView.magnification = max(Constants.minimumZoomLevel, webView.magnification - 0.1)
  }
}

// MARK: - Window

private extension EditorViewController {
  @IBAction func toggleWindowFloating(_ sender: Any?) {
    view.window?.level = view.window?.level == .floating ? .normal : .floating
  }
}

// MARK: - Private

private extension EditorViewController {
  enum Constants {
    static let minimumZoomLevel: Double = 1.0
    static let maximumZoomLevel: Double = 3.0
  }

  var currentInput: EditorTextInput? {
    guard view.window?.isKeyWindow == true else {
      return nil
    }

    let textInput = view.window?.firstResponder as? EditorTextInput
    if textInput == nil {
      Logger.log(.info, "The firstResponder is not EditorTextInput")
    }

    return textInput
  }

  func notifyFontSizeChanged() {
    NotificationCenter.default.post(
      name: .fontSizeChanged,
      object: AppPreferences.Editor.fontSize
    )
  }
}

// MARK: - PDF Export

/// Renders HTML to a paginated PDF that matches the preview exactly: WebKit produces a single
/// tall PDF (which is reliable, unlike headless print), then PDFKit slices it into pages,
/// breaking at element boundaries (measured in the DOM) so content isn't cut mid-block.
@MainActor
private final class PDFExporter: NSObject, WKNavigationDelegate {
  private struct Metrics: Decodable {
    let total: Double
    let breaks: [Double]
  }

  // A4 in points, with page margins
  private let pageWidth: CGFloat = 595
  private let pageHeight: CGFloat = 842
  private let verticalMargin: CGFloat = 48

  private var webView: WKWebView?
  private var continuation: CheckedContinuation<Data?, Never>?
  private var didComplete = false

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
