# MASTERMIND v3.0.5

## Quick Start

### Option A — Run Instantly (No Build)
1. Install [Node.js LTS](https://nodejs.org)
2. Double-click **BUILD_DEV.bat**
3. Done. App opens with DevTools.

### Option B — Build Windows Installer
1. Install [Node.js LTS](https://nodejs.org)
2. Double-click **BUILD.bat**
3. Find installer at `dist/MASTERMIND-Setup-3.0.5.exe`

---

## File Layout

```
index-browser.html        Main UI (HTML + CSS)
nexus-engine.js           Application engine (~9,700 lines)
mastermind-siso-jaa.js    SISO + JAA runtime (load FIRST)
mastermind-foundation.js  Foundation layer (MM Registry, Vault, Tags)
mastermind-theme.css      Theme system
main.js                   Electron main process
preload.js                Electron context bridge (NXAPI)
package.json              npm config
BUILD_DEV.bat             Dev launcher (no build needed)
BUILD.bat                 Production installer builder
MASTERMIND_DOCS.html      Living documentation
```

## Load Order (critical)
```html
<script src="mastermind-siso-jaa.js"></script>   ← FIRST
<script src="mastermind-foundation.js"></script>  ← SECOND
<script src="nexus-engine.js"></script>           ← THIRD
```

## Requirements
- Windows 10/11 x64
- Node.js 18+ (for building)
- Internet on first run (downloads Electron ~120MB)

## Vault Storage
MASTERMIND stores all data in a real encrypted vault file on disk.
**Browser mode is disabled** — the desktop app is required.

Default vault location: `~/Documents/MASTERMIND/mastermind.vault`

Encryption: AES-256-GCM · PBKDF2-SHA256 · 310,000 iterations
