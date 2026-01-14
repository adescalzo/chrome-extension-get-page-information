# Project Adaptation Document: Firefox Compatibility

## 1. Requirements Analysis
The objective is to adapt the "Page to Markdown Extractor" Chrome Extension (Manifest V3) to support Mozilla Firefox while maintaining a single codebase to minimize maintenance overhead.

### 1.1 Functional Requirements
*   **Core Extraction**: The DOM extraction and `TurndownService` logic must function identically in Firefox's rendering engine.
*   **Gemini Integration**: The background service worker must handle API calls and message passing reliably in both browsers.
*   **Storage & Options**: Settings (API keys, models) and History must persist across sessions in both environments.
*   **Downloads**: The file download mechanism must trigger the "Save As" dialog in both browsers.

### 1.2 Technical Constraints & Differences
| Feature | Chrome (MV3) | Firefox (MV3) | Challenge |
| :--- | :--- | :--- | :--- |
| **API Namespace** | `chrome.*` | `browser.*` (preferred) or `chrome.*` | Chrome supports Promises on `chrome.*`. Firefox supports Promises on `browser.*` but callbacks on `chrome.*`. |
| **Manifest** | Standard MV3 | MV3 + **Mandatory ID** | Firefox requires `browser_specific_settings.gecko.id` to run/sign. Chrome may warn if this key is present. |
| **Async Messaging** | `return true` + `sendResponse` | Returns a `Promise` | `runtime.onMessage` behavior differs for async operations. |
| **Service Worker** | Native support | Supported (strict) | Firefox is stricter about service worker termination and event handling. |

## 2. Proposal: Unified Source with webextension-polyfill

To achieve cross-browser compatibility, we'll use Mozilla's official **webextension-polyfill** library. This is the industry-standard approach that wraps Chrome's callback-based APIs to work with Promises in both browsers.

### 2.1 Project Structure
We will restructure the project to separate the **Source** (editable code) from the **Distribution** (browser-ready code).

```text
project-root/
├── src/                     # [NEW] All your current files go here
│   ├── icons/
│   ├── background.js
│   ├── popup.js
│   ├── options.js
│   ├── manifest.json        # Base manifest (Chrome)
│   ├── browser-polyfill.min.js  # [NEW] Polyfill library
│   └── ... (html, libs)
├── dist/                    # [GENERATED] Do not edit files here
│   ├── chrome/              # Ready to load in Chrome
│   └── firefox/             # Ready to load in Firefox
├── manifest-firefox.json    # Firefox-specific configuration
└── build.js                 # Script to generate 'dist' from 'src'
```

### 2.2 Implementation Strategy

#### A. webextension-polyfill Integration
The polyfill allows you to use the `browser.*` namespace in both Chrome and Firefox with Promise-based APIs.

**Benefits:**
- Clean, consistent API across browsers
- Mozilla maintains compatibility layer
- Handles all browser differences automatically
- No conditional code needed

#### B. Code Changes Required
Simply replace all `chrome.*` calls with `browser.*`:

```javascript
// OLD (Chrome-only):
const result = await chrome.storage.local.get("key");

// NEW (works in both):
const result = await browser.storage.local.get("key");
```

Message listeners become simpler:
```javascript
// Just return a Promise directly - polyfill handles everything
browser.runtime.onMessage.addListener(async (request, sender) => {
  if (request.action === 'improveWithGemini') {
    return await improveMarkdownWithGemini(request.markdown, request.apiKey);
  }
});
```

#### C. Build Process
The build script will:
1.  **Clean**: Remove old `dist/` folder
2.  **Copy Shared**: Copy everything from `src/` to `dist/chrome/` and `dist/firefox/`
3.  **Configure Chrome**: Keep `src/manifest.json` in `dist/chrome/`
4.  **Configure Firefox**: Replace with `manifest-firefox.json` (includes Gecko ID)

### 2.3 Benefits
1.  **Industry Standard**: Mozilla's official cross-browser solution
2.  **Single Source**: You only edit files in `src/`
3.  **Cleaner Code**: No browser detection, just use `browser.*` everywhere
4.  **Future-Proof**: Automatically handles new browser API changes
5.  **Automated Build**: Running `node build.js` prepares both versions

## 3. Implementation Details

### 3.1 Build Script (`build.js`)

Create a `build.js` file in the project root:

```javascript
const fs = require('fs-extra');
const path = require('path');

const SRC_DIR = 'src';
const DIST_DIR = 'dist';
const CHROME_DIR = path.join(DIST_DIR, 'chrome');
const FIREFOX_DIR = path.join(DIST_DIR, 'firefox');

async function build() {
  console.log('🧹 Cleaning dist directory...');
  await fs.remove(DIST_DIR);

  console.log('📦 Building Chrome extension...');
  await fs.copy(SRC_DIR, CHROME_DIR);
  console.log('✅ Chrome build complete at:', CHROME_DIR);

  console.log('📦 Building Firefox extension...');
  await fs.copy(SRC_DIR, FIREFOX_DIR);

  // Read Firefox-specific manifest
  const firefoxManifest = await fs.readJson('manifest-firefox.json');
  await fs.writeJson(
    path.join(FIREFOX_DIR, 'manifest.json'),
    firefoxManifest,
    { spaces: 2 }
  );
  console.log('✅ Firefox build complete at:', FIREFOX_DIR);

  console.log('\n🎉 Build complete! Extension packages ready in dist/');
  console.log('   Chrome:  ', CHROME_DIR);
  console.log('   Firefox: ', FIREFOX_DIR);
}

build().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
```

**Installation:**
```bash
npm install --save-dev fs-extra
```

**Usage:**
```bash
node build.js
```

### 3.2 Firefox Manifest (`manifest-firefox.json`)

Create a `manifest-firefox.json` file in the project root:

```json
{
  "manifest_version": 3,
  "name": "Page to Markdown Extractor",
  "version": "1.0",
  "description": "Extracts the HTML of the current page into a Markdown file.",
  "browser_specific_settings": {
    "gecko": {
      "id": "page-to-markdown@yourdomain.com",
      "strict_min_version": "109.0"
    }
  },
  "icons": {
    "48": "icons/icon48.png",
    "64": "icons/icon64.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "48": "icons/icon48.png",
      "64": "icons/icon64.png",
      "128": "icons/icon128.png"
    }
  },
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "downloads",
    "notifications"
  ],
  "background": {
    "scripts": ["background.js"]
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "host_permissions": [
    "https://generativelanguage.googleapis.com/*"
  ]
}
```

**Key Differences from Chrome Manifest:**
- **`browser_specific_settings.gecko.id`**: Required for Firefox (choose a unique email-style ID)
- **`browser_specific_settings.gecko.strict_min_version`**: Specifies minimum Firefox version (109+ for MV3)
- **`background.scripts`**: Firefox MV3 uses `scripts` array instead of `service_worker`
- **`options_ui`**: Firefox uses `options_ui` instead of `options_page` (though both work)

### 3.3 webextension-polyfill Setup

#### Step 1: Download the Polyfill

First, download the latest version of webextension-polyfill:

```bash
curl -o browser-polyfill.min.js https://unpkg.com/webextension-polyfill@latest/dist/browser-polyfill.min.js
```

This file will be moved to `src/` during project restructuring.

#### Step 2: Update HTML Files

Add the polyfill script **before** your other scripts in `popup.html` and `options.html`:

**popup.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <!-- existing head content -->
</head>
<body>
  <!-- existing body content -->

  <!-- ADD THIS FIRST -->
  <script src="browser-polyfill.min.js"></script>

  <!-- Then your existing scripts -->
  <script src="turndown.js"></script>
  <script src="popup.js"></script>
</body>
</html>
```

**options.html:**
```html
<!DOCTYPE html>
<html>
<head>
  <!-- existing head content -->
</head>
<body>
  <!-- existing body content -->

  <!-- ADD THIS FIRST -->
  <script src="browser-polyfill.min.js"></script>

  <!-- Then your existing script -->
  <script src="options.js"></script>
</body>
</html>
```

**Note:** `background.js` doesn't need the script tag since it will be imported in the manifest.

#### Step 3: Update Chrome Manifest

In `src/manifest.json`, update the background section to include the polyfill:

```json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

Actually, for service workers with polyfill, use:
```json
{
  "background": {
    "scripts": ["browser-polyfill.min.js", "background.js"]
  }
}
```

**Note:** Chrome MV3 prefers `service_worker`, but using `scripts` array works in both and is simpler for polyfill integration.

#### Step 4: Replace chrome.* with browser.*

Your existing code uses `chrome.*` API throughout:
- `background.js` (storage, runtime, downloads, etc.)
- `options.js` (storage)
- `popup.js` (tabs, scripting, storage, runtime)

**Global find-replace in all three files:**
- Find: `chrome.`
- Replace: `browser.`

**Example changes in background.js:**
```javascript
// OLD:
const result = await chrome.storage.local.get("extractedUrls");
await chrome.storage.local.set({ extractedUrls: urls });
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  improveMarkdownWithGemini(...)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});

// NEW:
const result = await browser.storage.local.get("extractedUrls");
await browser.storage.local.set({ extractedUrls: urls });
browser.runtime.onMessage.addListener(async (request, sender) => {
  if (request.action === "improveWithGemini") {
    try {
      const result = await improveMarkdownWithGemini(...);
      return result;
    } catch (error) {
      return { error: error.message };
    }
  }
});
```

The polyfill makes the code **cleaner** - no need for `return true` or complex `sendResponse` logic.

### 3.4 Migration Checklist

- [ ] Download `browser-polyfill.min.js`
- [ ] Create `src/` directory and move all current files into it
- [ ] Move `browser-polyfill.min.js` to `src/`
- [ ] Update `src/popup.html` to include polyfill script
- [ ] Update `src/options.html` to include polyfill script
- [ ] Update `src/manifest.json` background section
- [ ] Create `manifest-firefox.json` in project root
- [ ] Create `build.js` in project root
- [ ] Install fs-extra: `npm install --save-dev fs-extra`
- [ ] Replace all `chrome.` with `browser.` in `background.js`
- [ ] Replace all `chrome.` with `browser.` in `popup.js`
- [ ] Replace all `chrome.` with `browser.` in `options.js`
- [ ] Simplify message listeners to return Promises directly
- [ ] Add `dist/` to `.gitignore`
- [ ] Run `node build.js` to generate both distributions
- [ ] Test Chrome version from `dist/chrome/`
- [ ] Test Firefox version from `dist/firefox/`

## 4. Testing & Validation

### 4.1 Manual Testing Procedure

#### Chrome Testing
1. Build the extension: `node build.js`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select `dist/chrome/` folder
6. Test all features:
   - [ ] Extract page to Markdown
   - [ ] Improve with Gemini (if API key configured)
   - [ ] Download file
   - [ ] View extraction history
   - [ ] Configure options (API key, model)
   - [ ] Check storage persistence (close/reopen browser)

#### Firefox Testing
1. Build the extension: `node build.js`
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Navigate to `dist/firefox/` and select `manifest.json`
5. Test the same feature checklist as Chrome
6. **Additional Firefox checks:**
   - [ ] Check browser console for Promise rejection warnings
   - [ ] Test with strict content security policy
   - [ ] Verify downloads trigger "Save As" dialog

### 4.2 Debugging Tips

**Chrome DevTools:**
- Background script: `chrome://extensions/` → "Inspect views: service worker"
- Popup: Right-click popup → "Inspect"
- Console errors show up in both locations

**Firefox DevTools:**
- Background script: `about:debugging` → Extension → "Inspect"
- Popup: Right-click popup → "Inspect Element"
- Check Browser Console (`Ctrl+Shift+J`) for global errors

**Common Issues:**

| Issue | Chrome | Firefox | Solution |
| :--- | :--- | :--- | :--- |
| `browser is not defined` | ❌ Error | ✅ Native | Ensure polyfill is loaded first in HTML and manifest |
| Promise not returned from listener | ✅ Works | ✅ Works | Polyfill handles both - just return Promise |
| Service worker inactive | ⚠️ Normal | ⚠️ Strict | Firefox terminates workers aggressively; ensure no persistent state |
| Storage not persisting | Check quota | Check quota | Verify `storage` permission in manifest |

### 4.3 Automated Testing (Future Enhancement)

Consider adding automated tests for critical functionality:

```javascript
// Example: test/api-compatibility.test.js
describe('Cross-browser API with polyfill', () => {
  it('should have browser namespace available', () => {
    expect(browser).toBeDefined();
    expect(browser.storage).toBeDefined();
  });

  it('should support Promise-based APIs', async () => {
    const result = await browser.storage.local.get('test');
    expect(result).toBeDefined();
  });
});
```

**Tools to consider:**
- [web-ext](https://github.com/mozilla/web-ext) - Official Firefox extension CLI tool
- [Selenium WebDriver](https://www.selenium.dev/) - Browser automation for E2E tests
- [Chrome Extension Testing Library](https://github.com/extend-chrome/testing-library)

## 5. Deployment & Distribution

### 5.1 Chrome Web Store Submission

**Requirements:**
- Developer account ($5 one-time fee)
- Extension must pass automated review
- Privacy policy (if handling user data)
- Icons in required sizes (128x128 minimum)

**Steps:**
1. Zip the `dist/chrome/` directory:
   ```bash
   cd dist/chrome && zip -r ../../page-to-markdown-chrome.zip . && cd ../..
   ```
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
3. Click "New Item" and upload `page-to-markdown-chrome.zip`
4. Fill in store listing details (description, screenshots, category)
5. Submit for review (typically 1-3 days)

**Important:** Chrome manifest must NOT contain `browser_specific_settings` (our build script handles this).

### 5.2 Firefox Add-ons (AMO) Submission

**Requirements:**
- Firefox account (free)
- Extension must pass automated + manual review
- Unique `gecko.id` in manifest
- Source code submission if using obfuscated/minified libraries

**Steps:**
1. Zip the `dist/firefox/` directory:
   ```bash
   cd dist/firefox && zip -r ../../page-to-markdown-firefox.zip . && cd ../..
   ```
2. Go to [Firefox Add-on Developer Hub](https://addons.mozilla.org/developers/)
3. Click "Submit a New Add-on"
4. Upload `page-to-markdown-firefox.zip`
5. Choose distribution channel:
   - **"On this site"** (AMO listing - recommended)
   - **"On your own"** (self-distribution)
6. Fill in listing details
7. Submit for review (typically 1-7 days for full review)

**Note:** Firefox requires the `browser_specific_settings.gecko.id` field, which our Firefox manifest includes.

### 5.3 Version Management Strategy

Use semantic versioning in both manifests:

```json
{
  "version": "1.0.0"
}
```

**Update workflow:**
1. Update version in `src/manifest.json` AND `manifest-firefox.json`
2. Run `node build.js`
3. Create git tag: `git tag v1.0.0 && git push --tags`
4. Build zip files for both stores
5. Upload to Chrome Web Store and Firefox AMO

**Automation tip:** Add to `package.json`:
```json
{
  "scripts": {
    "build": "node build.js",
    "package": "npm run build && cd dist/chrome && zip -r ../../chrome.zip . && cd ../firefox && zip -r ../../firefox.zip . && cd ../..",
    "version": "npm run package"
  }
}
```

Then run: `npm version patch` (auto-bumps version, builds, and packages).

### 5.4 Post-Release Monitoring

**Chrome:**
- Monitor [Developer Dashboard](https://chrome.google.com/webstore/devconsole/) for:
  - Crash reports
  - User reviews and ratings
  - Usage statistics

**Firefox:**
- Monitor [AMO Developer Hub](https://addons.mozilla.org/developers/) for:
  - Review feedback
  - User reviews
  - Compatibility reports across Firefox versions

## 6. Troubleshooting & Known Issues

### 6.1 Common Migration Issues

**Issue 1: `Uncaught ReferenceError: browser is not defined`**

**Cause:** Polyfill not loaded before your extension code runs.

**Solution:** Ensure `browser-polyfill.min.js` is loaded first:
- In HTML files: `<script src="browser-polyfill.min.js"></script>` must come **before** your scripts
- In manifest: `"scripts": ["browser-polyfill.min.js", "background.js"]` - polyfill must be first

---

**Issue 2: `Error: Could not establish connection. Receiving end does not exist.`**

**Cause:** Message listener not returning a Promise.

**Solution (with polyfill):**
```javascript
browser.runtime.onMessage.addListener(async (request, sender) => {
  // Return Promise directly - polyfill handles both browsers
  return await asyncFunction();

  // Or handle errors explicitly
  try {
    const result = await asyncFunction();
    return result;
  } catch (error) {
    return { error: error.message };
  }
});
```

---

**Issue 3: Service worker keeps going inactive**

**Cause:** Normal browser behavior; service workers are designed to terminate.

**Solution:** Don't store state in global variables. Always use:
- `browser.storage.local` for persistent data
- Message passing for communication
- Event listeners that re-initialize quickly

---

**Issue 4: Downloads not working in Firefox**

**Cause:** Different download API behavior or missing permissions.

**Solutions:**
- Ensure `downloads` permission in manifest
- Use `browser.downloads.download()` with Promise-based approach
- Check if filename sanitization is needed (Firefox is stricter)

---

**Issue 5: Manifest validation errors in Firefox**

**Cause:** Firefox has stricter manifest validation.

**Common problems:**
- Missing `gecko.id` → Add to `browser_specific_settings`
- Invalid version format → Use `"1.0"` or `"1.0.0"`
- Background service worker → Use `"scripts": ["background.js"]` instead

---

### 6.2 Browser-Specific Quirks

| Quirk | Impact | Workaround |
| :--- | :--- | :--- |
| **Chrome:** Service worker must be single file | Can't use ES modules easily | Bundle with webpack/rollup or use IIFE |
| **Firefox:** Strict CSP for extension pages | Inline scripts/styles blocked | Use external files only |
| **Firefox:** MV3 background uses persistent script | Different lifecycle than Chrome | Code works in both but behaves differently |
| **Chrome:** Promises on `chrome.*` newer feature | Older Chrome needs callbacks | Use `return true` + `sendResponse` pattern |

### 6.3 Getting Help

**Official Documentation:**
- Chrome: [developer.chrome.com/docs/extensions](https://developer.chrome.com/docs/extensions/mv3/)
- Firefox: [extensionworkshop.com](https://extensionworkshop.com/)

**Community:**
- Chrome: [Chromium Extensions Google Group](https://groups.google.com/a/chromium.org/g/chromium-extensions)
- Firefox: [Mozilla Add-ons Discourse](https://discourse.mozilla.org/c/add-ons/35)
- Stack Overflow: Tag `google-chrome-extension` or `firefox-addon`

**Issue Reporting:**
- Chrome bugs: [crbug.com/new](https://crbug.com/new)
- Firefox bugs: [bugzilla.mozilla.org](https://bugzilla.mozilla.org/)

---

## 7. Summary & Next Steps

This document provides a standard, industry-recommended approach for Firefox adaptation using **webextension-polyfill**.

### Why webextension-polyfill?
1. ✅ Mozilla's official cross-browser solution
2. ✅ Industry standard for web extensions
3. ✅ Handles all browser API differences automatically
4. ✅ Promise-based APIs work consistently in both browsers
5. ✅ Mozilla maintains compatibility layer
6. ✅ Cleaner code without browser detection

### Implementation Overview

The migration involves:
- Using Mozilla's webextension-polyfill library
- Replacing `chrome.*` with `browser.*` throughout your code
- Simplifying async message handlers (no more `return true` workarounds)
- Building separate distributions for Chrome and Firefox with appropriate manifests

### Immediate Next Steps

**Phase 1: Setup & Project Restructuring**
1. Download `browser-polyfill.min.js`
2. Create `src/` directory
3. Move all files to `src/`
4. Move polyfill to `src/`
5. Create `manifest-firefox.json`
6. Create `build.js`
7. Install fs-extra: `npm install --save-dev fs-extra`
8. Update `.gitignore` to exclude `dist/`

**Phase 2: Code Adaptation**
1. Update `popup.html` to include polyfill script
2. Update `options.html` to include polyfill script
3. Update `src/manifest.json` background section
4. Replace all `chrome.` with `browser.` in `background.js`
5. Replace all `chrome.` with `browser.` in `popup.js`
6. Replace all `chrome.` with `browser.` in `options.js`
7. Simplify message listeners to return Promises directly

**Phase 3: Testing**
1. Build both versions: `node build.js`
2. Test in Chrome from `dist/chrome/`
3. Test in Firefox from `dist/firefox/`
4. Verify all features work in both browsers
5. Check console for any polyfill warnings

**Phase 4: Distribution (Optional - for personal use)**
1. Use locally in both browsers via developer mode
2. Or submit to Chrome Web Store and Firefox Add-ons (AMO)

---

**Document Version:** 2.1 (webextension-polyfill standard approach)
**Last Updated:** 2026-01-10
**Author:** Claude (based on project analysis)