# Installation Guide - Page to Markdown Extractor

This guide explains how to install the Page to Markdown Extractor extension in both Chrome and Firefox browsers.

## Prerequisites

Before installing, make sure you have built the extension:

```bash
npm install
node build.js
```

This will create two folders:
- `dist/chrome/` - Chrome version
- `dist/firefox/` - Firefox version

---

## Installing in Chrome

### Step 1: Open Extensions Page

Open Chrome and navigate to:
```
chrome://extensions/
```

Or click: **Menu (⋮)** → **Extensions** → **Manage Extensions**

### Step 2: Enable Developer Mode

Toggle the **Developer mode** switch in the top-right corner.

### Step 3: Load the Extension

1. Click the **Load unpacked** button
2. Navigate to your project folder
3. Select the `dist/chrome/` folder
4. Click **Select Folder** (or **Open**)

### Step 4: Verify Installation

You should see "Page to Markdown Extractor" in your extensions list with:
- Extension name and version
- Toggle to enable/disable
- Details, Remove, and Errors buttons

### Step 5: Pin the Extension (Optional)

1. Click the extensions icon (puzzle piece) in the Chrome toolbar
2. Find "Page to Markdown Extractor"
3. Click the pin icon to keep it visible in the toolbar

**Done!** The extension is now ready to use in Chrome.

---

## Installing in Firefox

### Step 1: Open Debugging Page

Open Firefox and navigate to:
```
about:debugging#/runtime/this-firefox
```

Or manually:
1. Type `about:debugging` in the address bar
2. Click **This Firefox** in the left sidebar

### Step 2: Load Temporary Add-on

1. Click the **Load Temporary Add-on...** button
2. Navigate to your project folder
3. Go into the `dist/firefox/` folder
4. Select the `manifest.json` file
5. Click **Open**

### Step 3: Verify Installation

You should see "Page to Markdown Extractor" in the temporary extensions list with:
- Extension name and ID
- Internal UUID
- Manifest URL
- Debugging controls

### Step 4: Grant Permissions (If Prompted)

Firefox may ask you to grant permissions for:
- Accessing active tab data
- Downloading files
- Storing data locally
- Accessing generativelanguage.googleapis.com

Click **Allow** or **Accept** to grant these permissions.

**Important:** Firefox temporary add-ons are removed when you close the browser. You'll need to reload it each time you restart Firefox.

---

## Using the Extension

Once installed in either browser:

### Basic Usage

1. **Navigate** to any web page you want to extract
2. **Click** the extension icon in the toolbar
3. **Click** "Extract Page as Markdown"
4. **Save** the downloaded `.md` file when prompted

### Optional: Configure Gemini API

For enhanced markdown quality with AI processing:

1. Click the extension icon
2. Click **⚙️ Options**
3. Enter your **Gemini API Key** (get one from [Google AI Studio](https://makersuite.google.com/app/apikey))
4. Select your preferred **Gemini Model**
5. Check **"Use Gemini to improve markdown quality"**
6. Click **Save Options**

---

## Troubleshooting

### Chrome Issues

**Extension not appearing:**
- Make sure Developer mode is enabled
- Verify you selected the `dist/chrome/` folder
- Check for errors in the Extensions page

**"Manifest file is missing or unreadable" error:**
- Run `node build.js` to rebuild the extension
- Make sure you're selecting the `dist/chrome/` folder, not `src/`

### Firefox Issues

**"There was an error during installation" error:**
- Make sure you selected `manifest.json` inside `dist/firefox/`
- Run `node build.js` to rebuild the extension
- Check Firefox console (`Ctrl+Shift+J`) for specific errors

**Extension disappeared after restart:**
- This is normal for temporary add-ons in Firefox
- You need to reload it using the same steps each time

**"This extension is not compatible" error:**
- Make sure you're using Firefox 109 or later
- Update Firefox to the latest version

### Both Browsers

**Downloads not working:**
- Check browser download settings
- Make sure downloads are not blocked
- Verify the extension has "downloads" permission

**Gemini features not working:**
- Verify you entered a valid API key in Options
- Check that "Use Gemini" is enabled
- Ensure you have internet connectivity

---

## Uninstalling

### Chrome

1. Go to `chrome://extensions/`
2. Find "Page to Markdown Extractor"
3. Click **Remove**
4. Confirm removal

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Find "Page to Markdown Extractor" in Temporary Extensions
3. Click **Remove**

Or use the Add-ons Manager:
1. Go to `about:addons`
2. Find the extension
3. Click the **⋯** menu
4. Select **Remove**

---

## Development Workflow

If you're making changes to the extension:

1. **Edit** files in the `src/` folder
2. **Rebuild** by running `node build.js`
3. **Reload** the extension:
   - **Chrome:** Go to `chrome://extensions/` and click the refresh icon
   - **Firefox:** Remove and reload the temporary add-on

---

## Building for Production

To package the extension for distribution:

### Chrome (.zip)

```bash
cd dist/chrome
zip -r ../../page-to-markdown-chrome.zip .
cd ../..
```

### Firefox (.zip)

```bash
cd dist/firefox
zip -r ../../page-to-markdown-firefox.zip .
cd ../..
```

The `.zip` files can be uploaded to:
- **Chrome Web Store** (for Chrome)
- **Firefox Add-ons (AMO)** (for Firefox)

---

## Need Help?

If you encounter issues not covered here:

1. Check the browser console for errors
2. Review the extension's error logs in the extensions page
3. Verify all build steps completed successfully
4. Try rebuilding: `rm -rf dist && node build.js`

For Gemini API issues, consult [Google AI Studio documentation](https://ai.google.dev/docs).
