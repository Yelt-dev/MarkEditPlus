//
//  AppDocumentController.swift
//  MarkEditMac
//
//  Created by cyan on 10/14/24.
//

import AppKit
import AppKitExtensions
import MarkEditCore
import MarkEditKit

/**
 Subclass of `NSDocumentController` to allow customizations.

 NSDocumentController.shared will be an instance of `AppDocumentController` at runtime.
 */
final class AppDocumentController: NSDocumentController {
  static var suggestedTextEncoding: EditorTextEncoding?
  static var suggestedFilename: String?

  override var maximumRecentDocumentCount: Int {
    min(super.maximumRecentDocumentCount, 8)
  }

  override func beginOpenPanel(_ openPanel: NSOpenPanel, forTypes inTypes: [String]?) async -> Int {
    if let defaultDirectory = AppRuntimeConfig.defaultOpenDirectory {
      setOpenPanelDirectory(defaultDirectory)
    }

    if AppRuntimeConfig.disableOpenPanelOptions {
      openPanel.accessoryView = nil
    } else {
      openPanel.accessoryView = EditorSaveOptionsView.wrapper(for: .openPanel) { [weak openPanel] result in
        switch result {
        case .textEncoding(let value):
          Self.suggestedTextEncoding = value
        case .showHiddenFiles(let value):
          openPanel?.showsHiddenFiles = value
        default:
          Logger.assertFail("Invalid change: \(result)")
        }
      }
    }

    Self.suggestedTextEncoding = nil
    openPanel.showsHiddenFiles = AppPreferences.General.showHiddenFiles
    openPanel.relayoutAccessoryView()

    let onBecomeActive = NotificationCenter.default.addObserver(
      forName: NSApplication.didBecomeActiveNotification,
      object: NSApp,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        self?.appearanceDidChange(isAppActive: true)
      }
    }

    let onResignActive = NotificationCenter.default.addObserver(
      forName: NSApplication.didResignActiveNotification,
      object: NSApp,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        self?.appearanceDidChange(isAppActive: false)
      }
    }

    let appearanceObservation = NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
      Task { @MainActor in
        self?.appearanceDidChange()
      }
    }

    defer {
      NotificationCenter.default.removeObserver(onBecomeActive)
      NotificationCenter.default.removeObserver(onResignActive)
      appearanceObservation.invalidate()
      UserDefaults.forcedColorScheme = .system
    }

    appearanceDidChange()
    return await super.beginOpenPanel(openPanel, forTypes: inTypes)
  }

  override func openDocument(
    withContentsOf url: URL,
    display displayDocument: Bool,
    completionHandler: @escaping (NSDocument?, Bool, (any Error)?) -> Void
  ) {
    if url.isBinaryFile {
      // Dead loop prevention
      if Bundle.main.isDefaultApp(toOpen: url) {
        NSWorkspace.shared.activateFileViewerSelecting([url])
      } else {
        NSWorkspace.shared.open(url)
      }

      // Ignore the default opening logic
      return completionHandler(nil, false, nil)
    }

    Task { @MainActor in
      // Ensure the preloader has a fully loaded editor before opening the document
      await EditorPreloader.shared.prepareViewController()

      // If the frontmost window is an empty, untitled document, reuse its place: open the
      // file, move the new window to where the empty one was, then close the empty one.
      // This keeps a single window in the same spot instead of leaving a blank one behind.
      let transientEmpty = self.documents.compactMap { $0 as? EditorDocument }.first {
        $0.fileURL == nil && !$0.isDocumentEdited && $0.stringValue.isEmpty
      }
      let emptyFrame = transientEmpty?.windowControllers.first?.window?.frame

      super.openDocument(withContentsOf: url, display: displayDocument) { document, wasAlreadyOpen, error in
        if let transientEmpty, let document, document !== transientEmpty, !wasAlreadyOpen, error == nil {
          if let emptyFrame, let newWindow = document.windowControllers.first?.window {
            newWindow.setFrame(emptyFrame, display: true)
          }

          transientEmpty.close()
        }

        completionHandler(document, wasAlreadyOpen, error)
      }
    }
  }

  override func saveAllDocuments(_ sender: Any?) {
    // The default implementation doesn't work
    documents.forEach { $0.save(sender) }
  }
}

// MARK: - Private

private extension AppDocumentController {
  func appearanceDidChange(isAppActive: Bool = NSApp.isActive) {
    guard isAppActive else {
      UserDefaults.forcedColorScheme = .system
      return
    }

    switch AppPreferences.General.appearance {
    case .system:
      UserDefaults.forcedColorScheme = .system
    case .light:
      UserDefaults.forcedColorScheme = .light
    case .dark:
      UserDefaults.forcedColorScheme = .dark
    }
  }
}

private extension NSOpenPanel {
  /// Re-layouts the accessory view to work around internal AppKit bugs.
  ///
  /// For example, the animation of opening documents will sometimes be skipped.
  func relayoutAccessoryView() {
    accessoryView?.needsLayout = true
  }
}
