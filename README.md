# ScrapeX

ScrapeX is a Manifest V3 Chrome extension for extracting page assets, previewing them in a curated UI, and downloading them in batches with optional format conversion.

It supports images (`img` and CSS backgrounds) and inline SVG icons, with filtering, sorting, favorites, metadata export, and queue tracking.

## Highlights

- Image and icon scan modes
- Batch download with format output (`original`, `png`, `jpeg`, `webp`)
- Queue progress and failed-download retry
- Metadata-driven filters (type, minimum width/height, new-since-last-scan, favorites)
- Persistent settings with `chrome.storage.local`
- Favorites system
- SVG copy and JSX copy helpers
- JSON metadata export
- Keyboard shortcuts for power users

## Project Structure

```text
ScrapeX/
  manifest.json
  popup.html
  popup.js
  styles.css
  background.js
  scripts/
    scraper.js
    dom.js
    download.js
    utils.js
  icons/
```

## Architecture

### 1) Data Extraction Layer

`scripts/scraper.js`

- Injects a script into the active tab via `chrome.scripting.executeScript`
- Collects:
  - `<img>` sources
  - CSS `background-image` URLs
  - Inline `<svg>` markup
- Adds metadata per asset:
  - type
  - source
  - width/height
  - flags (`isSvg`, `isGif`)

### 2) UI State + Orchestration

`popup.js`

- Controls scan mode (`images` / `icons`)
- Maintains state for:
  - all scanned items
  - filtered visible items
  - selection set
  - favorites set
  - failed downloads
  - previous scan snapshot
- Persists settings and favorites in `chrome.storage.local`
- Applies filters, sorting, dedupe, and mode-specific rendering

### 3) View Rendering + Interaction Binding

`scripts/dom.js`

- Renders asset cards, preview containers, metadata rows, badges, and action buttons
- Binds UI interactions:
  - select/unselect
  - per-card download
  - favorite toggle
  - copy SVG
  - copy JSX

### 4) Download + Conversion Pipeline

`scripts/download.js`

- Uses `chrome.downloads.download` for original asset download
- Converts raster images through canvas when non-original formats are selected
- Returns success/failure to support queue tracking and retry flows

### 5) Shared Utility Functions

`scripts/utils.js`

- filename sanitation
- extension parsing
- canvas conversion helper
- SVG-to-JSX attribute conversion helper

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (`ScrapeX`)

## Permissions

Defined in `manifest.json`:

- `activeTab`: scan current tab content
- `scripting`: run extraction script in page context
- `downloads`: save files to the user's downloads
- `storage`: persist settings/favorites
- `host_permissions: <all_urls>`: allow scanning on any site

## Usage

1. Open a webpage with assets
2. Open ScrapeX popup
3. Choose **Images** or **Icons**
4. Configure controls in the left rail:
   - format
   - filters
   - sorting
   - dedupe / new / favorites toggles
5. Select assets and run:
   - `Download Selected`
   - `Download All`
6. Use `Retry Failed` if needed
7. Export metadata via `Export JSON Metadata`

## Keyboard Shortcuts

- `Ctrl/Cmd + A`: select all visible items (image mode)
- `Ctrl/Cmd + D`: download selected
- `Ctrl/Cmd + R`: rescan current mode

## Design Notes

The popup UI uses a two-zone senior layout:

- **Control Rail**: scan mode, export settings, filters, queue actions
- **Results Workspace**: responsive card grid with metadata and card-level actions

Styling goals:

- no gradients
- explicit active/inactive tab states
- high information density without clutter
- adaptive grid/card sizing for different popup dimensions

## Troubleshooting

### Some assets do not convert

- Conversion requires fetching the source image.
- Some hosts block CORS access, so conversion can fail.
- In those cases, downloading the original URL may still work.

### Empty scan results

- Some pages lazy-load content after interaction/scroll.
- Try rescanning (`Ctrl/Cmd + R`) after the page fully renders.

### Download failures

- Use `Retry Failed`.
- Check Chrome download restrictions and site-level access.

## Known Constraints

- Inline SVGs are extracted from current DOM state only.
- Metadata width/height may be `0` when source data is unavailable.
- Conversion is raster-only and uses canvas (SVG conversion path is separate).

## Development

No build step is required.

- Edit files directly
- Reload the extension from `chrome://extensions/`
- Reopen popup and test

## Recommended Next Enhancements

- True ZIP packaging for selected assets
- Drag-selection rectangle in grid
- Preview panel with full-size modal and metadata details
- Better background-image parsing for multiple URLs in one CSS declaration
