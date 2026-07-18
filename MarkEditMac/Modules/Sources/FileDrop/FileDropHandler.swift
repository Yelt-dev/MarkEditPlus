//
//  FileDropHandler.swift
//
//  Created by cyan on 4/27/26.
//

import Foundation
import MarkEditKit
import TextBundle

public enum FileDropHandler {
  /// Build the Markdown snippet to insert for a single file dropped onto the editor.
  ///
  /// For `.textbundle` documents, the dropped file is copied into the bundle's `assets/`
  /// folder as a side effect; otherwise the file on disk is not touched.
  ///
  /// Returns a `![]()` or `[]()` link.
  public static func handle(
    fileURL: URL,
    documentURL: URL?,
    documentType: String?
  ) -> String {
    let isTextBundle = documentType?.isTextBundle == true
    return handle(fileURL: fileURL, documentURL: documentURL, isTextBundle: isTextBundle)
  }

  /// Copy an image into `<folderURL>/assets/` under a non-colliding name and return the
  /// Markdown image link with the relative path. Used to insert a local image into a plain
  /// Markdown document (drop, paste, or file picker), keeping the document portable.
  ///
  /// If the source already lives inside that `assets/` folder it is linked in place, not
  /// copied again. Throws if the copy fails (e.g. no write access to the folder).
  public static func copyImageToAssets(fileURL: URL, folderURL: URL) throws -> String {
    let assetsURL = folderURL.appending(path: "assets", directoryHint: .isDirectory)
    let target: String

    if fileURL.deletingLastPathComponent().standardizedFileURL == assetsURL.standardizedFileURL {
      target = "assets/\(fileURL.lastPathComponent)"
    } else {
      target = try TextBundleAssets.copy(from: fileURL, into: folderURL)
    }

    return MarkdownLink.formatted(label: fileURL.lastPathComponent, target: target, isImage: true)
  }
}

// MARK: - Private

private extension FileDropHandler {
  static func handle(fileURL: URL, documentURL: URL?, isTextBundle: Bool) -> String {
    // textbundle: copy into assets/. Saved doc: relative path. Untitled: absolute path.
    let target: String = {
      if isTextBundle, let bundleURL = documentURL {
        do {
          return try TextBundleAssets.copy(from: fileURL, into: bundleURL)
        } catch {
          Logger.log(.error, "Failed to copy dropped file into textbundle: \(error)")
          return fileURL.relativePath(from: bundleURL)
        }
      } else if let parentURL = documentURL?.deletingLastPathComponent() {
        return fileURL.relativePath(from: parentURL)
      } else {
        return fileURL.path(percentEncoded: false)
      }
    }()

    return MarkdownLink.formatted(
      label: fileURL.lastPathComponent,
      target: target,
      isImage: fileURL.isImageFile
    )
  }
}
