# IrukaDark Development Guidelines

## UI Design Rules

### Dialog / Popup Design Standard

All dialogs, popups, and in-window overlays must follow the **compact mini-menu design pattern**.

#### Required CSS Variables

```css
/* Size constraints */
min-width: var(--popup-min-width); /* 200px */
max-width: var(--popup-max-width); /* 240px */

/* Visual styling */
background: var(--popup-bg-dark); /* Dark theme */
background: var(--popup-bg-light); /* Light theme */
border: 1px solid var(--popup-border-dark); /* Dark theme */
border: 1px solid var(--popup-border-light); /* Light theme */
border-radius: var(--radius-lg); /* 12px */
box-shadow: var(--popup-shadow);
backdrop-filter: blur(var(--popup-blur)); /* 8px */
z-index: var(--popup-z-index); /* 10001 */
```

#### Spacing Guidelines

- **Padding**: 10-16px (never exceed 16px)
- **Gap between elements**: 6-8px
- **Margin between sections**: 10-12px

#### Typography

- **Header/Title**: `var(--font-size-sm)` with `font-weight: 600`
- **Body/Description**: `var(--font-size-xs)`
- **Colors**: Use `var(--text-primary-dark)`, `var(--text-muted)`, etc.

#### Button Styling

```css
padding: 5px 12px;
border-radius: var(--radius-md);
font-size: var(--font-size-xs);
```

#### Reference Components

- `shortcut-change-popup` - Shortcut change mini-menu
- `snippet-import-options-dialog` - Import options dialog
- `snippet-progress-dialog` - Progress indicator dialog

### Example Implementation

```css
.my-new-dialog {
  background: var(--popup-bg-dark);
  border: 1px solid var(--popup-border-dark);
  border-radius: var(--radius-lg);
  min-width: var(--popup-min-width);
  max-width: var(--popup-max-width);
  box-shadow: var(--popup-shadow);
  backdrop-filter: blur(var(--popup-blur));
  padding: 12px;
}

html:not(.theme-dark) .my-new-dialog {
  background: var(--popup-bg-light);
  border-color: var(--popup-border-light);
}
```

### File Selection / Attachment Dialog Standard

All file selection features must follow the **Chat tab attachment pattern** for consistency.

#### Native File Dialog (Electron)

Use `dialog.showOpenDialog` with consistent options:

```javascript
// Standard file selection pattern
const result = await dialog.showOpenDialog(focusedWindow, {
  properties: ['openFile'], // or ['openFile', 'multiSelections'] for multiple files
  filters: [{ name: 'Descriptive Name', extensions: ['ext1', 'ext2'] }],
});
```

#### Image Selection

```javascript
filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }];
```

#### Archive Selection

```javascript
filters: [{ name: 'ZIP Archive', extensions: ['zip'] }];
```

#### Attachment Display (In-App)

When displaying attached files, use the compact thumbnail style:

```css
/* Attachment thumbnail */
width: 20px;
height: 20px;
border-radius: 4px;
background: rgba(255, 255, 255, 0.05); /* dark */
border: 1px solid rgba(255, 255, 255, 0.1);

/* File type badge */
font-size: 8-10px;
font-weight: 600;
```

#### Reference Components

- `attachment-item` - Input area file thumbnail
- `message-attachment-item` - Chat history file thumbnail
- `attachment-remove` - Remove button (14px circle)

### Custom File Picker UI (If Needed)

If creating a custom file picker overlay (not native dialog), follow the mini-menu pattern:

```css
.file-picker-dialog {
  /* Same as popup standard */
  min-width: var(--popup-min-width);
  max-width: var(--popup-max-width);
  background: var(--popup-bg-dark);
  /* ... other popup styles ... */
}

.file-picker-item {
  padding: 8px;
  gap: 8px;
  border-radius: var(--radius-md);
}
```

## Code Style

### CSS

- Use existing CSS variables whenever possible
- Support both dark and light themes
- Keep dialogs compact - avoid large padding/margins
- Use semantic color variables instead of hardcoded values

### JavaScript

- Use native `dialog.showOpenDialog` for file selection (consistent UX)
- Show progress dialogs only after file selection completes (not before)
- Always pass parent window to `dialog.showOpenDialog/showSaveDialog` for proper z-index

### Global Variables (window.\*)

UI instances that need cross-module access should be exposed on `window`:

- `window.clipboardUI` - Clipboard/Snippet UI instance
- `window.settingsUI` - Settings UI instance
- `window.app` - Main chat application instance

This allows features like snippet import to refresh the snippet list after completion.
