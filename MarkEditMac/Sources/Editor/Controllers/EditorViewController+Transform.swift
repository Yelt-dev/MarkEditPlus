//
//  EditorViewController+Transform.swift
//  MarkEditMac
//
//  Deterministic document transforms.
//

import AppKit
import MarkEditKit

extension EditorViewController {
  /// Normalize the Markdown with deterministic rules.
  @IBAction func formatDocument(_ sender: Any?) {
    performTransform("markEditFormatDocument", title: Localized.Transform.formatDocument)
  }

  /// Strip the packaging an AI chat wraps around a document, then format it.
  @IBAction func cleanMarkdown(_ sender: Any?) {
    performTransform("markEditCleanMarkdown", title: Localized.Transform.cleanMarkdown)
  }

  /// Insert or refresh a table of contents built from the document's headings.
  /// A configuration dialog collects the level range, list style and heading first.
  @IBAction func generateTableOfContents(_ sender: Any?) {
    Task { @MainActor in
      guard let optionsJSON = await promptTableOfContentsOptions() else {
        return // cancelled
      }

      performTransform(
        "markEditGenerateTableOfContents",
        title: Localized.Transform.tableOfContents,
        optionsArg: optionsJSON
      )
    }
  }
}

// MARK: - Private

private struct TransformSummary: Decodable {
  struct Rule: Decodable {
    let id: String
    let count: Int
  }

  let changed: Bool
  let rules: [Rule]
}

private extension EditorViewController {
  /// Summarize the transform, let the user confirm, and only then apply it.
  ///
  /// The summary and the application are two separate passes over the document. That is safe
  /// because the rules are deterministic: recomputing on confirmation yields exactly what was
  /// previewed, so there is no pending edit to keep alive in between.
  ///
  /// `optionsArg` (optional) is a JSON string forwarded as the transform's second argument,
  /// used by the table of contents to carry the chosen options.
  func performTransform(_ function: String, title: String, optionsArg: String? = nil) {
    Task { @MainActor in
      guard let summary = await evaluateTransform(function, apply: false, optionsArg: optionsArg) else {
        return Logger.log(.error, "Failed to compute transform: \(function)")
      }

      guard summary.changed else {
        _ = await showAlert(title: title, message: Localized.Transform.noChanges, buttons: nil)
        return
      }

      let changes = summary.rules
        .map { "• \(Localized.Transform.ruleName($0.id)) (\($0.count))" }
        .joined(separator: "\n")

      let response = await showAlert(
        title: title,
        message: "\(Localized.Transform.summaryHeader)\n\n\(changes)",
        buttons: [Localized.Transform.apply, Localized.General.cancel]
      )

      guard response == .alertFirstButtonReturn else {
        return
      }

      _ = await evaluateTransform(function, apply: true, optionsArg: optionsArg)
    }
  }

  func evaluateTransform(_ function: String, apply: Bool, optionsArg: String? = nil) async -> TransformSummary? {
    let arguments: String
    if let optionsArg {
      arguments = "\(apply), \(jsStringLiteral(optionsArg))"
    } else {
      arguments = "\(apply)"
    }

    guard let result = try? await webView.evaluateJavaScript("window.\(function) && window.\(function)(\(arguments))"),
          let json = result as? String else {
      return nil
    }

    return try? JSONDecoder().decode(TransformSummary.self, from: Data(json.utf8))
  }

  /// Encode a Swift string as a JavaScript string literal (quoted and escaped), so it can be
  /// spliced straight into an `evaluateJavaScript` call without breaking on quotes or newlines.
  func jsStringLiteral(_ string: String) -> String {
    guard let data = try? JSONEncoder().encode(string),
          let literal = String(data: data, encoding: .utf8) else {
      return "\"\""
    }

    return literal
  }

  /// Collect the table of contents options. Returns a JSON string, or nil if cancelled.
  func promptTableOfContentsOptions() async -> String? {
    func levelPopup(selected: Int) -> NSPopUpButton {
      let popup = NSPopUpButton(frame: .zero, pullsDown: false)
      popup.addItems(withTitles: (1...6).map { "\($0)" })
      popup.selectItem(at: selected - 1)
      return popup
    }

    let minPopup = levelPopup(selected: 2)
    let maxPopup = levelPopup(selected: 6)

    let orderedCheck = NSButton(checkboxWithTitle: Localized.TableOfContents.ordered, target: nil, action: nil)
    orderedCheck.state = .off

    let includeTitleCheck = NSButton(checkboxWithTitle: Localized.TableOfContents.includeTitle, target: nil, action: nil)
    includeTitleCheck.state = .on

    let titleField = NSTextField(string: "Tabla de contenido")
    titleField.placeholderString = Localized.TableOfContents.titleText
    titleField.widthAnchor.constraint(equalToConstant: 200).isActive = true

    func labeledRow(_ text: String, _ control: NSView) -> NSStackView {
      let label = NSTextField(labelWithString: text)
      let row = NSStackView(views: [label, control])
      row.orientation = .horizontal
      row.spacing = 8
      return row
    }

    let container = NSStackView(views: [
      labeledRow(Localized.TableOfContents.minLevel, minPopup),
      labeledRow(Localized.TableOfContents.maxLevel, maxPopup),
      orderedCheck,
      includeTitleCheck,
      labeledRow(Localized.TableOfContents.titleText, titleField),
    ])
    container.orientation = .vertical
    container.alignment = .leading
    container.spacing = 10
    container.setFrameSize(container.fittingSize)

    let alert = NSAlert()
    alert.messageText = Localized.TableOfContents.configTitle
    alert.addButton(withTitle: Localized.Transform.apply)
    alert.addButton(withTitle: Localized.General.cancel)
    alert.accessoryView = container

    guard await presentSheetModal(alert) == .alertFirstButtonReturn else {
      return nil
    }

    let minLevel = minPopup.indexOfSelectedItem + 1
    let maxLevel = maxPopup.indexOfSelectedItem + 1
    let includeTitle = includeTitleCheck.state == .on

    let options: [String: Any] = [
      "minLevel": min(minLevel, maxLevel),
      "maxLevel": max(minLevel, maxLevel),
      "ordered": orderedCheck.state == .on,
      "title": includeTitle ? titleField.stringValue : "",
    ]

    guard let data = try? JSONSerialization.data(withJSONObject: options),
          let json = String(data: data, encoding: .utf8) else {
      return "{}"
    }

    return json
  }
}
