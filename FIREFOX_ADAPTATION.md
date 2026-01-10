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

## 2. Proposal: Unified Source with Build Automation

To meet the requirement of "separate directories for output, single directory for source," I propose the following architecture.

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
│   └── ... (html, libs)
├── dist/                    # [GENERATED] Do not edit files here
│   ├── chrome/              # Ready to load in Chrome
│   └── firefox/             # Ready to load in Firefox
├── manifest-firefox.json    # Firefox-specific configuration
└── build.js                 # Script to generate 'dist' from 'src'
```

### 2.2 Implementation Strategy

#### A. JavaScript Adaptation (The "Universal API")
Instead of maintaining two JS files, we will modify the existing files in `src/` to detect the environment dynamically.

**Change:** Add a namespace helper at the top of `background.js`, `popup.js`, and `options.js`.
```javascript
// Cross-browser API namespace
// Chrome uses 'chrome', Firefox uses 'browser'
const api = (typeof browser !== 'undefined') ? browser : chrome;

// Usage (works in both):
await api.storage.local.get(...);
```

#### B. Message Listener Abstraction
We must handle the difference in `onMessage` listeners.

**Change:** Refactor `background.js` to separate the logic from the listener.
```javascript
// Logic function returns a Promise
function handleMessage(request) {
  if (request.action === 'improve') return improveWithGemini(...);
}

// Listener handles the browser difference
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const responsePromise = handleMessage(request);
  
  // Firefox: Return the promise
  if (typeof browser !== 'undefined') return responsePromise;
  
  // Chrome: Use sendResponse and return true
  responsePromise.then(sendResponse);
  return true; 
});
```

#### C. Build Process
We will use a simple Node.js script (`build.js`) to automate the generation of the extensions.

1.  **Clean**: Remove old `dist/` folder.
2.  **Copy Shared**: Copy everything from `src/` to `dist/chrome/` and `dist/firefox/`.
3.  **Configure Chrome**: Keep `src/manifest.json` in `dist/chrome/`.
4.  **Configure Firefox**: Overwrite `dist/firefox/manifest.json` with `manifest-firefox.json` (which contains the required Gecko ID).

### 2.3 Benefits
1.  **Single Source of Truth**: You only edit files in `src/`.
2.  **No Validation Warnings**: Chrome gets a clean manifest; Firefox gets its required ID.
3.  **Automated**: Running `node build.js` instantly prepares both versions for release.

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

### 3.3 Code Modifications

#### Current State Assessment
Your existing code uses `chrome.*` API throughout:
- `background.js` lines 3, 30, 34
- `options.js` (likely throughout)
- `popup.js` (likely throughout)

#### Required Changes

**Step 1:** Add the cross-browser API helper to the top of **each** of these files:
- `background.js`
- `popup.js`
- `options.js`

```javascript
// Cross-browser API compatibility
const api = (typeof browser !== 'undefined') ? browser : chrome;
```

**Step 2:** Replace all instances of `chrome.` with `api.` in these files:

Example for `background.js`:
```javascript
// OLD:
const result = await chrome.storage.local.get("extractedUrls");
await chrome.storage.local.set({ extractedUrls: urls });
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

// NEW:
const result = await api.storage.local.get("extractedUrls");
await api.storage.local.set({ extractedUrls: urls });
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
```

**Step 3:** Update the message listener in `background.js` to handle both browsers:

```javascript
// Cross-browser message handler
function handleMessage(request) {
  if (request.action === "improveWithGemini") {
    return improveMarkdownWithGemini(
      request.markdown,
      request.apiKey,
      request.images,
      request.model
    );
  } else if (request.action === "processAndDownload") {
    return processAndDownloadWithGemini(request);
  }
  return Promise.reject(new Error("Unknown action"));
}

// Listener that works in both browsers
api.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const responsePromise = handleMessage(request)
    .then(result => ({ ...result, success: true }))
    .catch(error => ({ error: error.message }));

  // Firefox: Return the promise directly
  if (typeof browser !== 'undefined') {
    return responsePromise;
  }

  // Chrome: Use sendResponse callback
  responsePromise.then(sendResponse);
  return true; // Keep channel open for async response
});
```

### 3.4 Migration Checklist

- [ ] Create `src/` directory and move all current files into it
- [ ] Create `manifest-firefox.json` in project root
- [ ] Create `build.js` in project root
- [ ] Install fs-extra: `npm install --save-dev fs-extra`
- [ ] Add cross-browser API helper to `background.js`, `popup.js`, `options.js`
- [ ] Replace all `chrome.` with `api.` in those three files
- [ ] Refactor `background.js` message listener for cross-browser support
- [ ] Add `dist/` to `.gitignore`
- [ ] Run `node build.js` to generate both distributions
- [ ] Test Chrome version from `dist/chrome/`
- [ ] Test Firefox version from `dist/firefox/`

## 4. Alternative Approach: Using webextension-polyfill

The manual approach above works, but Mozilla provides an **official polyfill** that handles all browser API differences automatically.

### 4.1 What is webextension-polyfill?

[webextension-polyfill](https://github.com/mozilla/webextension-polyfill) is Mozilla's official library that:
- Wraps all `chrome.*` APIs to return Promises (matching Firefox's `browser.*` behavior)
- Works in both Chrome and Firefox
- Eliminates the need for manual `typeof browser` checks
- Provides TypeScript definitions

### 4.2 Implementation with Polyfill

**Step 1:** Download the polyfill
```bash
curl -o src/browser-polyfill.min.js https://unpkg.com/webextension-polyfill@latest/dist/browser-polyfill.min.js
```

**Step 2:** Add it to your manifest (in `src/manifest.json`):
```json
{
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["browser-polyfill.min.js"]
  }]
}
```

**For popup and options pages**, add to the HTML:
```html
<script src="browser-polyfill.min.js"></script>
<script src="popup.js"></script>
```

**Step 3:** Replace all `chrome.` with `browser.` in your code:
```javascript
// Now works in both browsers!
const result = await browser.storage.local.get("extractedUrls");
await browser.storage.local.set({ extractedUrls: urls });

browser.runtime.onMessage.addListener(async (request, sender) => {
  if (request.action === "improveWithGemini") {
    return await improveMarkdownWithGemini(request.markdown, request.apiKey);
  }
  // Return promise directly - polyfill handles the rest!
});
```

### 4.3 Comparison: Manual vs Polyfill

| Aspect | Manual Approach | webextension-polyfill |
| :--- | :--- | :--- |
| **Setup Complexity** | Low (just add helper code) | Low (download one file) |
| **Code Changes** | `chrome.` → `api.` + listener logic | `chrome.` → `browser.` |
| **Bundle Size** | ~0 KB (just your code) | ~30 KB (minified polyfill) |
| **Maintenance** | You maintain compatibility layer | Mozilla maintains polyfill |
| **TypeScript** | Manual types needed | Official types available |
| **Edge Cases** | You must handle each API difference | Polyfill handles automatically |
| **Recommended For** | Small extensions, learning | Production extensions |

**Recommendation:** For this extension, the **manual approach** is sufficient since you only have three JS files with straightforward API usage. Use the polyfill if the extension grows significantly or if you want official Mozilla support.

## 5. Testing & Validation

### 5.1 Manual Testing Procedure

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

### 5.2 Debugging Tips

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
| `browser is not defined` | ✅ Works | ❌ Error | Add `const api = typeof browser !== 'undefined' ? browser : chrome;` |
| Promise not returned from listener | ✅ Works | ❌ Warning | Ensure listener returns Promise in Firefox |
| Service worker inactive | ⚠️ Normal | ⚠️ Strict | Firefox terminates workers aggressively; ensure no persistent state |
| Storage not persisting | Check quota | Check quota | Verify `storage` permission in manifest |

### 5.3 Automated Testing (Future Enhancement)

Consider adding automated tests for critical functionality:

```javascript
// Example: test/api-compatibility.test.js
describe('Cross-browser API', () => {
  it('should use correct namespace', () => {
    const api = (typeof browser !== 'undefined') ? browser : chrome;
    expect(api).toBeDefined();
    expect(api.storage).toBeDefined();
  });
});
```

**Tools to consider:**
- [web-ext](https://github.com/mozilla/web-ext) - Official Firefox extension CLI tool
- [Selenium WebDriver](https://www.selenium.dev/) - Browser automation for E2E tests
- [Chrome Extension Testing Library](https://github.com/extend-chrome/testing-library)

## 6. Deployment & Distribution

### 6.1 Chrome Web Store Submission

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

### 6.2 Firefox Add-ons (AMO) Submission

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

### 6.3 Version Management Strategy

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

### 6.4 Post-Release Monitoring

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

## 7. Troubleshooting & Known Issues

### 7.1 Common Migration Issues

**Issue 1: `Uncaught ReferenceError: browser is not defined` (Chrome)**

**Cause:** Using `browser.*` API in Chrome without polyfill.

**Solution:** Use the cross-browser helper:
```javascript
const api = (typeof browser !== 'undefined') ? browser : chrome;
```

---

**Issue 2: `Error: Could not establish connection. Receiving end does not exist.`**

**Cause:** Message listener not returning `true` or Promise.

**Solution (Chrome):**
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  asyncFunction().then(sendResponse);
  return true; // CRITICAL: Keep channel open
});
```

**Solution (Firefox):**
```javascript
browser.runtime.onMessage.addListener(async (request, sender) => {
  return await asyncFunction(); // Return Promise directly
});
```

---

**Issue 3: Service worker keeps going inactive**

**Cause:** Normal browser behavior; service workers are designed to terminate.

**Solution:** Don't store state in global variables. Always use:
- `chrome.storage.local` for persistent data
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

### 7.2 Browser-Specific Quirks

| Quirk | Impact | Workaround |
| :--- | :--- | :--- |
| **Chrome:** Service worker must be single file | Can't use ES modules easily | Bundle with webpack/rollup or use IIFE |
| **Firefox:** Strict CSP for extension pages | Inline scripts/styles blocked | Use external files only |
| **Firefox:** MV3 background uses persistent script | Different lifecycle than Chrome | Code works in both but behaves differently |
| **Chrome:** Promises on `chrome.*` newer feature | Older Chrome needs callbacks | Use `return true` + `sendResponse` pattern |

### 7.3 Getting Help

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

## 8. Summary & Next Steps

This document provides two paths for Firefox adaptation:

### Path A: Manual Approach (Recommended for this project)
1. ✅ Minimal code changes
2. ✅ No external dependencies
3. ✅ Full control over compatibility layer
4. ⚠️ Requires testing each API difference

### Path B: webextension-polyfill
1. ✅ Official Mozilla solution
2. ✅ Handles all API differences automatically
3. ⚠️ Adds 30KB to bundle
4. ⚠️ Requires updating all API calls

### Immediate Next Steps

**Phase 1: Project Restructuring**
1. Create `src/` directory
2. Move all files to `src/`
3. Create `manifest-firefox.json`
4. Create `build.js`
5. Update `.gitignore` to exclude `dist/`

**Phase 2: Code Adaptation**
1. Add cross-browser API helper to `background.js`, `popup.js`, `options.js`
2. Replace `chrome.` with `api.` in those files
3. Refactor message listeners in `background.js`

**Phase 3: Testing**
1. Build both versions: `node build.js`
2. Test in Chrome from `dist/chrome/`
3. Test in Firefox from `dist/firefox/`
4. Verify all features work in both browsers

**Phase 4: Distribution**
1. Create store listings
2. Prepare screenshots and descriptions
3. Submit to Chrome Web Store
4. Submit to Firefox Add-ons (AMO)

---

**Document Version:** 2.0
**Last Updated:** 2026-01-10
**Author:** Claude (based on project analysis)