//
//  EditorViewController+Images.swift
//  MarkEditMac
//
//  Insert local images (IMAGES-001): copy into ./assets and insert Markdown.
//

import AppKit
import UniformTypeIdentifiers
import MarkEditKit
import FileDrop

extension EditorViewController {
  /// Choose an image from Finder and insert it (copied into the document's ./assets folder).
  @IBAction func insertLocalImage(_ sender: Any?) {
    let panel = NSOpenPanel()
    panel.canChooseFiles = true
    panel.canChooseDirectories = false
    panel.allowsMultipleSelection = true
    panel.allowedContentTypes = [.image]

    Task { @MainActor in
      guard await panel.begin() == .OK else {
        return
      }

      await insertLocalImages(panel.urls)
    }
  }

  /// Copy each image into the document's ./assets folder and insert the Markdown at the cursor.
  ///
  /// Shared by drop, paste and the file picker. Requires a saved document so there is a folder
  /// to copy into; if writing fails for want of permission, folder access is requested once and
  /// the copy retried.
  @MainActor
  func insertLocalImages(_ fileURLs: [URL]) async {
    let images = fileURLs.filter { $0.isImageFile }
    guard !images.isEmpty else {
      return
    }

    guard let folderURL = document?.fileURL?.deletingLastPathComponent() else {
      _ = await showAlert(
        title: Localized.Images.saveFirstTitle,
        message: Localized.Images.saveFirstMessage,
        buttons: nil
      )
      return
    }

    var snippets: [String] = []
    for imageURL in images {
      if let snippet = await copyImage(imageURL, into: folderURL) {
        snippets.append(snippet)
      }
    }

    guard !snippets.isEmpty else {
      return
    }

    let lineBreak = document?.stringValue.getLineBreak(
      defaultValue: AppPreferences.General.defaultLineEndings.characters
    ) ?? "\n"

    bridge.core.performTextDrop(text: snippets.joined(separator: lineBreak))
  }

  /// When the pasteboard holds image data (and nothing textual), stage it as a file and insert
  /// it like any other local image. Returns true if it handled the paste, so the caller can
  /// cancel the editor's default paste. Text and file pastes are left untouched.
  @MainActor
  func handlePastedImageIfNeeded() -> Bool {
    let pasteboard = NSPasteboard.general
    guard !pasteboard.hasText, pasteboard.fileURLs?.isEmpty ?? true, let png = Self.pngData(from: pasteboard) else {
      return false
    }

    Task { @MainActor in
      await self.insertPastedImage(png)
    }

    return true
  }

  @MainActor
  private func insertPastedImage(_ png: Data) async {
    let name = "imagen-\(Int(Date().timeIntervalSince1970)).png"
    let tempURL = FileManager.default.temporaryDirectory.appending(path: name)

    do {
      try png.write(to: tempURL)
    } catch {
      return Logger.log(.error, "Failed to stage pasted image: \(error)")
    }

    defer { try? FileManager.default.removeItem(at: tempURL) }
    await insertLocalImages([tempURL])
  }

  /// PNG bytes from the pasteboard, converting from TIFF when that is all it offers.
  private static func pngData(from pasteboard: NSPasteboard) -> Data? {
    if let png = pasteboard.data(forType: .png) {
      return png
    }

    if let tiff = pasteboard.data(forType: .tiff), let rep = NSBitmapImageRep(data: tiff) {
      return rep.representation(using: .png, properties: [:])
    }

    return nil
  }

  @MainActor
  private func copyImage(_ imageURL: URL, into folderURL: URL) async -> String? {
    if let snippet = try? FileDropHandler.copyImageToAssets(fileURL: imageURL, folderURL: folderURL) {
      return snippet
    }

    // The copy likely failed for want of write access; ask for it once, then retry.
    guard await NSApp.appDelegate?.requestFolderAccess(startingAt: folderURL) == true else {
      return nil
    }

    do {
      return try FileDropHandler.copyImageToAssets(fileURL: imageURL, folderURL: folderURL)
    } catch {
      Logger.log(.error, "Failed to copy image into assets: \(error)")
      return nil
    }
  }
}
