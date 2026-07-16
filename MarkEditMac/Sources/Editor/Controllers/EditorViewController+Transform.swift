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
  func performTransform(_ function: String, title: String) {
    Task { @MainActor in
      guard let summary = await evaluateTransform(function, apply: false) else {
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

      _ = await evaluateTransform(function, apply: true)
    }
  }

  func evaluateTransform(_ function: String, apply: Bool) async -> TransformSummary? {
    guard let result = try? await webView.evaluateJavaScript("window.\(function) && window.\(function)(\(apply))"),
          let json = result as? String else {
      return nil
    }

    return try? JSONDecoder().decode(TransformSummary.self, from: Data(json.utf8))
  }
}
