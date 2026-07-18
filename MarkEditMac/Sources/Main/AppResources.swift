//
//  AppResources.swift
//  MarkEditMac
//
//  Created by cyan on 12/31/22.
//

import Foundation
import MarkEditCore

/**
 To make localization work, always use `String(localized:comment:)` directly and add to this file.

 Besides, we use `string catalogs` to do the translation work:
 https://developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog

 The only exception to not using this file for localization is the app intents,
 where we rely on `LocalizedStringResource` instead.
 */
enum Localized {
  enum General {
    static let done = String(localized: "Done", comment: "Button title, confirm an action")
    static let cancel = String(localized: "Cancel", comment: "Button title, cancel an action")
    static let delete = String(localized: "Delete", comment: "Button title, confirm the deletion")
    static let previous = String(localized: "Previous", comment: "Button title, move to the previous item")
    static let next = String(localized: "Next", comment: "Button title, move to the next item")
    static let all = String(localized: "All", comment: "Button title, perform actions to all items")
    static let selected = String(localized: "Selected", comment: "General title that indicates something is selected")
    static let grantAccess = String(localized: "Grant Access", comment: "Open panel prompt, used for granting access for the selected folder")
    static let grantImageAccessTitle = String(localized: "Show local images?", comment: "Alert title asking to grant folder access to display local images")
    static let grantImageAccessMessage = String(localized: "This document uses images from its folder. Grant access to the folder to show them in the preview.", comment: "Alert message asking to grant folder access to display local images")
    static let insertTab = String(localized: "Insert Tab", comment: "Insert a tab into the current editor")
    static let insertLineBreak = String(localized: "Insert Line Break", comment: "Insert a line break into the current editor")
  }

  enum Transform {
    static let formatDocument = String(localized: "Format Document", comment: "Alert title, formatting the document with deterministic rules")
    static let cleanMarkdown = String(localized: "Clean Markdown", comment: "Alert title, removing AI chat packaging from the document")
    static let tableOfContents = String(localized: "Generate Table of Contents", comment: "Alert title, inserting or refreshing the table of contents")
    static let apply = String(localized: "Apply", comment: "Button title, apply the previewed transform to the document")
    static let noChanges = String(localized: "This document is already formatted, nothing to change.", comment: "Alert message shown when a transform would not change anything")
    static let summaryHeader = String(localized: "The following changes will be applied:", comment: "Alert message header, followed by the list of transform rules that matched")
  }

  enum Images {
    static let saveFirstTitle = String(localized: "Save the document first", comment: "Alert title, image insertion needs a saved document")
    static let saveFirstMessage = String(localized: "Save the document so images can be copied to a folder next to it.", comment: "Alert message, image insertion needs a saved document")
  }

  enum Export {
    static let previewTitle = String(localized: "Export Preview", comment: "Window title for the export preview dialog")
    static let template = String(localized: "Template", comment: "Label for the template selector in the export preview")
    static let pageSize = String(localized: "Page Size", comment: "Label for the page size selector in the export preview")
    static let orientation = String(localized: "Orientation", comment: "Label for the orientation selector in the export preview")
    static let portrait = String(localized: "Portrait", comment: "Page orientation option, vertical")
    static let landscape = String(localized: "Landscape", comment: "Page orientation option, horizontal")
    static let showPageBreaks = String(localized: "Show page breaks", comment: "Toggle to overlay page break guides in the export preview")
    static let exportPDF = String(localized: "Export PDF…", comment: "Button, export the preview as a PDF file")
    static let exportHTML = String(localized: "Export HTML…", comment: "Button, export the preview as an HTML file")
    static let close = String(localized: "Close", comment: "Button, close the export preview dialog")

    static func templateName(_ id: String) -> String {
      switch id {
      case "technical": return String(localized: "Technical", comment: "Visual template name")
      case "business": return String(localized: "Business", comment: "Visual template name")
      case "academic": return String(localized: "Academic", comment: "Visual template name")
      default: return String(localized: "Minimal", comment: "Visual template name")
      }
    }
  }

  enum TableOfContents {
    static let configTitle = String(localized: "Table of Contents Options", comment: "Dialog title for configuring the table of contents")
    static let minLevel = String(localized: "Minimum level", comment: "TOC option, shallowest heading level to include")
    static let maxLevel = String(localized: "Maximum level", comment: "TOC option, deepest heading level to include")
    static let ordered = String(localized: "Numbered list", comment: "TOC option, use an ordered (numbered) list")
    static let includeTitle = String(localized: "Include a heading", comment: "TOC option, add a heading above the list")
    static let titleText = String(localized: "Heading text", comment: "TOC option, the heading text above the list")
  }

  enum Editor {
    static let controlCharacter = String(localized: "Control Character", comment: "Phrase used in CodeMirror to indicate control character")
    static let foldedLines = String(localized: "Folded Lines", comment: "Phrase used in CodeMirror to indicate folded lines")
    static let unfoldedLines = String(localized: "Unfolded Lines", comment: "Phrase used in CodeMirror to indicate unfolded lines")
    static let foldedCode = String(localized: "Folded Code", comment: "Phrase used in CodeMirror to indicated folded code")
    static let unfold = String(localized: "Unfold", comment: "Phrase used in CodeMirror to unfold a piece of text")
    static let foldLine = String(localized: "Fold Line", comment: "Phrase used in CodeMirror fold a line")
    static let unfoldLine = String(localized: "Unfold Line", comment: "Phrase used in CodeMirror to unfold a line")
    static let defaultLinkTitle = String(localized: "title", comment: "Default title used for link insertion")
    static let previewButtonTitle = String(localized: "Preview", comment: "Button title for code preview")
    static let cmdClickToFollow = String(localized: "⌘-click to follow", comment: "Tooltip for links")
    static let cmdClickToToggleTodo = String(localized: "⌘-click to toggle todo", comment: "Tooltip for tasks")
    static let tableColumnName = String(localized: "Column", comment: "Column name for table creation")
    static let tableItemName = String(localized: "Item", comment: "Item name for table creation")
  }

  enum Toolbar {
    static let tableOfContents = String(localized: "Table of Contents", comment: "Toolbar item to show table of contents")
    static let formatHeaders = String(localized: "Headers", comment: "Toolbar item to toggle heading levels")
    static let toggleBold = String(localized: "Bold", comment: "Toolbar item to toggle bold")
    static let toggleItalic = String(localized: "Italic", comment: "Toolbar item to toggle italic")
    static let toggleStrikethrough = String(localized: "Strikethrough", comment: "Toolbar item to toggle strikethrough")
    static let insertLink = String(localized: "Insert Link", comment: "Toolbar item to insert link")
    static let insertImage = String(localized: "Insert Image", comment: "Toolbar item to insert image")
    static let toggleList = String(localized: "Toggle List", comment: "Toolbar item to toggle bullet list")
    static let toggleBlockquote = String(localized: "Quote", comment: "Toolbar item to toggle blockquote")
    static let horizontalRule = String(localized: "Horizontal Rule", comment: "Toolbar item to insert horizontal rule")
    static let insertTable = String(localized: "Table", comment: "Toolbar item to insert table")
    static let insertCode = String(localized: "Insert Code", comment: "Toolbar item to insert code")
    static let textFormat = String(localized: "Text Format", comment: "Toolbar item to use text format menu")
    static let statistics = String(localized: "Statistics", comment: "Toolbar item to show statistics")
    static let shareDocument = String(localized: "Share this document", comment: "Toolbar item to share the document")
    static let copyPandocCommand = String(localized: "Copy Pandoc Command", comment: "Toolbar item to copy pandoc command")
  }

  enum Search {
    static let find = String(localized: "Find", comment: "Find mode in search menu")
    static let replace = String(localized: "Replace", comment: "Replace mode in search menu")
    static let caseSensitive = String(localized: "Case Sensitive", comment: "Toggle case sensitive search")
    static let diacriticInsensitive = String(localized: "Diacritic Insensitive", comment: "Toggle diacritic insensitive search")
    static let wholeWord = String(localized: "Whole Word", comment: "Toggle whole word search")
    static let literalSearch = String(localized: "Literal Search", comment: "Toggle literal search")
    static let regularExpression = String(localized: "Regular Expression", comment: "Toggle regular expression for search")
    static let searchActions = String(localized: "Search Actions", comment: "Search actions, like select all, select all in selection")
    static let selectAll = String(localized: "Select All", comment: "Select all occurrences")
    static let selectAllInSelection = String(localized: "Select All in Selection", comment: "Select all occurrences in selection")
    static let replaceAll = String(localized: "Replace All", comment: "Replace all occurrences")
    static let replaceAllInSelection = String(localized: "Replace All in Selection", comment: "Replace all occurrences in selection")
    static let recentSearches = String(localized: "Recent Searches", comment: "Menu item: recent searches")
    static let clearRecents = String(localized: "Clear Recents", comment: "Menu item: clear recents")
    static let findSelection = String(localized: "Find Selection", comment: "Menu item: use selection to find")
    static let selectAllOccurrences = String(localized: "Select All Occurrences", comment: "Menu item: select all occurrences")
    static let indexOfMatches = String(localized: "%d of %d", comment: "Index of matches, such as 1 of 3")
  }

  enum Document {
    static let openDocument = String(localized: "Open Document", comment: "Menu item: open an existing document")
    static let newDocument = String(localized: "New Document", comment: "Menu item: create a new document")
    static let gotoLineLabel = String(localized: "Go to Line", comment: "Placeholder text for goto line window")
    static let gotoLineHelp = String(localized: "Enter the line number and hit return", comment: "Help text for goto line window")
    static let fileExtension = String(localized: "File Extension:", comment: "Label for save panel accessory view (shorter than 'Filename Extension' to avoid save panel layout issues)")
    static let textEncoding = String(localized: "Text Encoding:", comment: "Label for save panel accessory view")
    static let showHiddenFiles = String(localized: "Show Hidden Files", comment: "Label for save panel accessory view")
  }

  enum Statistics {
    static let selection = String(localized: "Selection", comment: "Statistics mode: selection")
    static let document = String(localized: "Document", comment: "Statistics mode: full document")
    static let characters = String(localized: "Characters", comment: "Statistics label: count characters")
    static let words = String(localized: "Words", comment: "Statistics label: count words")
    static let sentences = String(localized: "Sentences", comment: "Statistics label: count sentences")
    static let paragraphs = String(localized: "Paragraphs", comment: "Statistics label: count paragraphs")
    static let comments = String(localized: "Comments", comment: "Statistics label: count comments")
    static let readTime = String(localized: "Read Time", comment: "Statistics label: count read time")
    static let fileSize = String(localized: "File Size", comment: "Statistics label: count file size")
  }

  enum WritingTools {
    static let featureName = String(localized: "Writing Tools", comment: "Writing Tools")
    static let menuItemTitle = String(localized: "Show Writing Tools", comment: "Show Writing Tools")
  }

  enum Settings {
    // Editor
    static let editor = String(localized: "Editor", comment: "Window title for editor settings")
    static let font = String(localized: "Font:", comment: "Label for font settings")
    static let selectFont = String(localized: "Select…", comment: "Menu label for selecting fonts")
    static let systemDefault = String(localized: "System Default", comment: "System default font name")
    static let systemMono = String(localized: "System Mono", comment: "System mono font name")
    static let systemRounded = String(localized: "System Rounded", comment: "System rounded font name")
    static let systemSerif = String(localized: "System Serif", comment: "System serif font name")
    static let recentlyUsed = String(localized: "Recently Used", comment: "Menu item to show recently used fonts")
    static let moreFonts = String(localized: "More Fonts", comment: "Menu item to browse all fonts")
    static let openFontPanel = String(localized: "Open Font Panel…", comment: "Menu item for selecting custom fonts")
    static let lightTheme = String(localized: "Light Theme:", comment: "Light theme for the editor")
    static let darkTheme = String(localized: "Dark Theme:", comment: "Dark theme for the editor")
    static let getCustomThemes = String(localized: "Get Custom Themes…", comment: "Get custom themes from the GitHub")
    static let displayOptions = String(localized: "Show:", comment: "Label for display options")
    static let lineNumbers = String(localized: "Line numbers", comment: "Option to show line numbers")
    static let activeLineIndicator = String(localized: "Active line indicator", comment: "Option to show active line indicator")
    static let selectionStatus = String(localized: "Selection status", comment: "Option to show selection status")
    static let renderInvisibles = String(localized: "Render Invisibles:", comment: "Label for invisibles behavior setting")
    static let never = String(localized: "Never", comment: "Never show invisibles")
    static let selection = String(localized: "Selection", comment: "Show invisibles for selected ranges")
    static let trailing = String(localized: "Trailing", comment: "Show trailing invisibles")
    static let always = String(localized: "Always", comment: "Always show invisibles")
    static let editBehavior = String(localized: "Edit Behavior:", comment: "Editor behavior like focus mode and typewriter mode")
    static let typewriterModeTitle = String(localized: "Keep caret in the middle", comment: "Explanation for typewriter mode")
    static let focusModeTitle = String(localized: "Dim inactive lines", comment: "Explanation for focus mode")
    static let lineWrappingLabel = String(localized: "Line Wrapping:", comment: "Label for line wrapping option")
    static let lineWrappingDescription = String(localized: "Wrap lines to editor width", comment: "Explanation for line wrapping option")
    static let lineHeight = String(localized: "Line Height:", comment: "Label for line height option")
    static let tightHeight = String(localized: "Tight", comment: "Tight line spacing")
    static let normalHeight = String(localized: "Normal", comment: "Normal line spacing")
    static let relaxedHeight = String(localized: "Relaxed", comment: "Relaxed line spacing")
    static let tabKeyBehavior = String(localized: "Tab Key:", comment: "Label for tab key behavior settings")
    static let insertsTab = String(localized: "Inserts tab character", comment: "Default tab key behavior")
    static let insertsTwoSpaces = String(localized: "Inserts 2 spaces", comment: "Press tab key to insert 2 spaces")
    static let insertsFourSpaces = String(localized: "Inserts 4 spaces", comment: "Press tab key to insert 4 spaces")
    static let indentsMore = String(localized: "Indents more", comment: "Press tab key to indent more")
    static let indentUnit = String(localized: "Prefer Indent Using:", comment: "Label for indent unit settings")
    static let twoSpaces = String(localized: "2 spaces", comment: "Use 2 spaces as the indent unit")
    static let fourSpaces = String(localized: "4 spaces", comment: "Use 4 spaces as the indent unit")
    static let oneTab = String(localized: "1 tab", comment: "Use 1 tab as the indent unit")
    static let twoTabs = String(localized: "2 tabs", comment: "Use 2 tabs as the indent unit")

    // Assistant
    static let assistant = String(localized: "Assistant", comment: "Window title for assistant settings")
    static let formatFiles = String(localized: "Format Files:", comment: "Label for file formatting options")
    static let insertFinalNewline = String(localized: "Insert final newline", comment: "Option for inserting newline at end of file")
    static let trimTrailingWhitespace = String(localized: "Trim trailing whitespace", comment: "Option for trimming trailing whitespaces")
    static let fileFormattingHint = String(localized: "Format when saving files.", comment: "Hint for format files on save")
    static let completion = String(localized: "Completion:", comment: "Label for word completion options")
    static let wordsInDocument = String(localized: "Words in document", comment: "Option for words in documents suggestion")
    static let standardWords = String(localized: "Standard words", comment: "Option for standard words suggestion")
    static let guessedWords = String(localized: "Guessed words", comment: "Option for guessed words suggestion")
    static let completionHint = String(localized: "Press ⌥ ⎋ to show the panel.", comment: "Hint for using word completion")
    static let autocomplete = String(localized: "Autocomplete:", comment: "Label for autocomplete options")
    static let inlinePredictions = String(localized: "Inline Predictions", comment: "Whether to allow inline predictions")
    static let suggestWhileTyping = String(localized: "Suggest while typing", comment: "Whether to suggest while typing")

    // General
    static let general = String(localized: "General", comment: "Window title for general settings")
    static let appearance = String(localized: "Appearance:", comment: "Appearance for the app")
    static let system = String(localized: "System", comment: "Follow the system appearance")
    static let light = String(localized: "Light", comment: "Always use light mode for the app")
    static let dark = String(localized: "Dark", comment: "Always use dark mode for the app")
    static let newWindowBehavior = String(localized: "New Window Behavior:", comment: "Behavior when creating new windows")
    static let windowRestoration = String(localized: "Window Restoration:", comment: "Label for window restoration options")
    static let quitAlwaysKeepsWindows = String(localized: "Quit always keeps windows", comment: "Whether to keep windows when quit the app")
    static let newFilenameExtension = String(localized: "New Filename Extension:", comment: "Filename extension for new files")
    static let defaultTextEncoding = String(localized: "Default Text Encoding:", comment: "Text encoding for opening and saving files")
    static let defaultLineEndings = String(localized: "Default Line Endings:", comment: "Line endings for creating new files")
    static let macOSLineEndings = String(localized: "macOS / Unix (LF)", comment: "Line endings used on macOS and Unix")
    static let windowsLineEndings = String(localized: "Windows (CRLF)", comment: "Line endings used on Windows")
    static let classicMacLineEndings = String(localized: "Classic Mac OS (CR)", comment: "Line endings used on Classic Mac OS")

    // Window
    static let window = String(localized: "Window", comment: "Window title for window settings")
    static let toolbarMode = String(localized: "Toolbar Mode:", comment: "Label for window toolbar mode")
    static let normalMode = String(localized: "Normal", comment: "Normal mode for window toolbar")
    static let compactMode = String(localized: "Compact", comment: "Compact mode for window toolbar")
    static let hiddenMode = String(localized: "Hidden", comment: "Hidden mode for window toolbar")
    static let tabbingMode = String(localized: "Tabbing Mode:", comment: "Label for window tabbing mode settings")
    static let automatic = String(localized: "Automatic", comment: "Automatic window tabbing mode")
    static let preferred = String(localized: "Preferred", comment: "Preferred window tabbing mode")
    static let disallowed = String(localized: "Disallowed", comment: "Disallowed window tabbing mode")
    static let reduceTransparencyLabel = String(localized: "Reduce Transparency:", comment: "Label for the option to reduce window transparency")
    static let reduceTransparencyDescription = String(localized: "Remove the toolbar blur", comment: "Explanation for the option to reduce window transparency")
  }

  enum FileVersion {
    static let revertTitle = String(localized: "Revert to This Version", comment: "Title for button to select a file version")
    static let modeTitles = [
      String(localized: "Diff Lines", comment: "Diff by lines"),
      String(localized: "Diff Words", comment: "Diff by words"),
      String(localized: "Diff Chars", comment: "Diff by characters"),
    ]
    static let noVersionsTitle = String(localized: "No versions match the specified condition.", comment: "Alert title for no versions found")
    static let foundVersionsFormat = String(localized: "Found %lld versions, would you like to delete them?", comment: "Alert title (format) for number of versions found")
    static let cannotBeUndone = String(localized: "This action cannot be undone.", comment: "Alert message for cannot undo")
  }

  enum Scripting {
    static let missingCommandErrorMessage = String(localized: "Couldn’t find a command to handle incoming Apple Event.", comment: "Script error when MarkEdit has no command to handle the incoming Apple Event")
    static let missingArgumentErrorMessage = String(localized: "Argument “%@” not found in event descriptor, the descriptor is likely malformed.", comment: "Script error when a command argument is missing due to a corrupted Apple Event")
    static let editorNotFoundErrorMessage = String(localized: "No editor for document “%@” found.", comment: "Script error when MarkEdit cannot find the editor view to run document commands in")
    static let jsEvaluationErrorMessage = String(localized: "JavaScript evaluation failed at line %d, column %d: %@", comment: "Script error when JavaScript evaluation raises a detailed error")
    static let unknownJSErrorMessage = String(localized: "JavaScript evaluation failed for an unknown reason.", comment: "Script error when JavaScript evaluation raises an error with no details")
    static let invalidDestinationErrorMessage = String(localized: "Cannot export files with extension “%@”, supported extensions: %@.", comment: "Script error when attempting to save files with an unsupported extension")
    static let extensionMismatchErrorMessage = String(localized: "Wrong file extension for type “%@”, use “.%@” instead.", comment: "Script save error when the path extension does not match the output type")
  }

  enum Updater {
    static let upToDateTitle = String(localized: "You’re up-to-date!", comment: "Title for the up-to-date info")
    static let upToDateMessage = String(localized: "MarkEdit %@ is currently the latest version.", comment: "Message for the up-to-date info")
    static let newVersionAvailable = String(localized: "MarkEdit %@ is available!", comment: "Title for new version available")
    static let updateFailedTitle = String(localized: "Failed to get the update.", comment: "Title for failed to get the update")
    static let updateFailedMessage = String(localized: "Please check your network connection or get the latest release from the version history.", comment: "Message for failed to get the update")
    static let needsOSUpdateMessage = String(localized: "This release requires macOS %@ or later and cannot be installed without upgrading your operating system.", comment: "Message for minimum required OS version")
    static let newVersionOut = String(localized: "🎉 %@ is out", comment: "Title format for new version is out")
    static let viewReleasePage = String(localized: "View Release Page", comment: "Title for the \"View Release Page\" button")
    static let notNow = String(localized: "Not Now", comment: "Title for the \"Not Now\" button")
    static let remindMeLater = String(localized: "Remind Me Later", comment: "Title for the \"Remind Me Later\" button")
    static let skipThisVersion = String(localized: "Skip This Version", comment: "Title for the \"Skip This Version\" button")
    static let disableUpdateChecks = String(localized: "Disable Update Checks", comment: "Title for the \"Disable Update Checks\" button")
    static let checkVersionHistory = String(localized: "Check Version History", comment: "Title for the \"Check Version History\" button")
  }
}

// Icon set used in the app: https://developer.apple.com/sf-symbols/
//
// Note: double check availability and deployment target before adding new icons
enum Icons {
  static let appleTerminal = "apple.terminal"
  static let arrowUturnBackwardCircle = "arrow.uturn.backward.circle"
  static let bold = "bold"
  static let characterCursorIbeam = "character.cursor.ibeam"
  static let chartPie = "chart.pie"
  static let curlybracesSquare = "curlybraces.square"
  static let ellipsisCircle = "ellipsis.circle"
  static let exclamationmarkBubbleFill = "exclamationmark.bubble.fill"
  static let gearshape = "gearshape"
  static let italic = "italic"

  static let interfaceWindow = if #available(macOS 27.0, *) {
    "interface.window"
  } else {
    "macwindow"
  }

  static let interfaceWindowOnRectangle = if #available(macOS 27.0, *) {
    "interface.window.on.rectangle"
  } else {
    "macwindow.on.rectangle"
  }

  static let link = "link"
  static let listBullet = "list.bullet"
  static let listBulletRectangle = "list.bullet.rectangle"

  static let numberSign = if #available(macOS 27.0, *) {
    "number.sign"
  } else {
    "number"
  }

  static let paintpalette = "paintpalette"
  static let photo = "photo"
  static let puzzlepieceExtension = "puzzlepiece.extension"
  static let shippingbox = "shippingbox"
  static let sparkles = "sparkles"
  static let squareAndArrowUp = "square.and.arrow.up"
  static let squareSplit1x2 = "square.split.1x2"
  static let strikethrough = "strikethrough"
  static let tablecells = "tablecells"
  static let textQuote = "text.quote"
  static let textformat = "textformat"
  static let wandAndSparkles = "wand.and.sparkles"
  static let wifiSlash = "wifi.slash"
}

extension EditorLocalizable {
  static var main: Self {
    EditorLocalizable(
      controlCharacter: Localized.Editor.controlCharacter,
      foldedLines: Localized.Editor.foldedLines,
      unfoldedLines: Localized.Editor.unfoldedLines,
      foldedCode: Localized.Editor.foldedCode,
      unfold: Localized.Editor.unfold,
      foldLine: Localized.Editor.foldLine,
      unfoldLine: Localized.Editor.unfoldLine,
      previewButtonTitle: Localized.Editor.previewButtonTitle,
      cmdClickToFollow: Localized.Editor.cmdClickToFollow,
      cmdClickToToggleTodo: Localized.Editor.cmdClickToToggleTodo
    )
  }
}

extension Localized.Transform {
  /// Human-readable name for a transform rule reported by the editor.
  static func ruleName(_ id: String) -> String {
    switch id {
    case "trailing-whitespace":
      return String(localized: "Trailing spaces removed", comment: "Transform rule summary")
    case "blank-lines":
      return String(localized: "Blank lines normalized", comment: "Transform rule summary")
    case "heading-space":
      return String(localized: "Space added after #", comment: "Transform rule summary")
    case "list-markers":
      return String(localized: "List markers unified", comment: "Transform rule summary")
    case "checklists":
      return String(localized: "Checklists normalized", comment: "Transform rule summary")
    case "fences":
      return String(localized: "Code fences unified", comment: "Transform rule summary")
    case "separators":
      return String(localized: "Separators unified", comment: "Transform rule summary")
    case "tables":
      return String(localized: "Tables aligned", comment: "Transform rule summary")
    case "final-newline":
      return String(localized: "Final newline added", comment: "Transform rule summary")
    case "outer-fence":
      return String(localized: "Surrounding code fence removed", comment: "Transform rule summary")
    case "preamble":
      return String(localized: "Introduction line removed", comment: "Transform rule summary")
    case "stray-language-tag":
      return String(localized: "Stray language tag removed", comment: "Transform rule summary")
    case "unclosed-fence":
      return String(localized: "Unclosed code block closed", comment: "Transform rule summary")
    case "duplicate-separators":
      return String(localized: "Duplicate separators removed", comment: "Transform rule summary")
    case "toc-inserted":
      return String(localized: "Table of contents inserted", comment: "Transform rule summary; the count is the number of entries")
    case "toc-updated":
      return String(localized: "Table of contents updated", comment: "Transform rule summary; the count is the number of entries")
    default:
      return id
    }
  }
}
