# Browser Extension - HTML to Markdown Converter

A Chrome/Firefox extension that converts web page content to Markdown format using turndown.js library.

## Features

- Converts HTML content to clean Markdown
- Browser action popup interface for quick conversion
- Options page for customizing Markdown output
- Supports basic styling and elements preservation

## Project Structure

- **manifest.json** - Extension configuration and metadata
- **background.js** - Background service worker handling core operations
- **popup.js** - Popup interface logic and user interaction
- **turndown.js** - Core HTML-to-Markdown conversion library
- **options.html**/**options.js** - Configuration page scripts
- **icons/** - Extension icons in multiple sizes

## Installation

1. Clone this repository
2. Open Chrome/Edge and navigate to `chrome://extensions`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked" and select the extension directory

## Usage

1. Click the extension icon in your browser's toolbar
2. The current page's content will be converted to Markdown
3. Copy the Markdown output from the popup window

## Customization

Modify conversion rules in `options.html` to adjust Markdown output formatting.
