/**
 * Function to be injected into the active tab.
 * This function runs in the context of the web page.
 * We'll grab the body's HTML as it provides the main content.
 * @returns {{html: string, title: string, images: Array}}
 */
async function getPageContent() {
  const title = document.title;
  const hostname = window.location.hostname;
  
  // Extract author information
  const author = document.querySelector('meta[name="author"]')?.content || 
                 document.querySelector('[rel="author"]')?.textContent ||
                 document.querySelector('.author-name')?.textContent ||
                 document.querySelector('[itemprop="author"]')?.textContent ||
                 'Unknown';
  
  // Extract publication date using multiple strategies
  function extractPublicationDate() {
    // Strategy 1: Check meta tags (most reliable)
    const metaDate = document.querySelector('meta[property="article:published_time"]')?.content ||
                     document.querySelector('meta[name="publish_date"]')?.content ||
                     document.querySelector('meta[name="publication_date"]')?.content ||
                     document.querySelector('meta[property="article:published"]')?.content ||
                     document.querySelector('meta[name="date"]')?.content ||
                     document.querySelector('meta[name="DC.date.issued"]')?.content ||
                     document.querySelector('meta[property="og:published_time"]')?.content ||
                     document.querySelector('meta[itemprop="datePublished"]')?.content;
    
    if (metaDate) return metaDate;
    
    // Strategy 2: Check JSON-LD structured data
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.datePublished) return data.datePublished;
        if (data.dateCreated) return data.dateCreated;
        if (data['@graph']) {
          for (const item of data['@graph']) {
            if (item.datePublished) return item.datePublished;
            if (item.dateCreated) return item.dateCreated;
          }
        }
      } catch (e) {
        // Invalid JSON, skip
      }
    }
    
    // Strategy 3: Check common HTML elements with dates
    const dateElement = document.querySelector('time[datetime]')?.getAttribute('datetime') ||
                       document.querySelector('time[pubdate]')?.getAttribute('datetime') ||
                       document.querySelector('[itemprop="datePublished"]')?.getAttribute('datetime') ||
                       document.querySelector('[itemprop="datePublished"]')?.textContent ||
                       document.querySelector('.publish-date')?.textContent ||
                       document.querySelector('.published-date')?.textContent ||
                       document.querySelector('.post-date')?.textContent ||
                       document.querySelector('.entry-date')?.textContent ||
                       document.querySelector('.date-published')?.textContent ||
                       document.querySelector('[class*="publish"][class*="date"]')?.textContent ||
                       document.querySelector('[class*="post"][class*="date"]')?.textContent;
    
    if (dateElement) {
      // Try to parse and validate the date
      const parsed = new Date(dateElement);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    
    // Strategy 4: Look for date patterns in URL
    const urlDateMatch = window.location.pathname.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (urlDateMatch) {
      const [_, year, month, day] = urlDateMatch;
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    
    return null;
  }
  
  const publicationDate = extractPublicationDate();
  
  // Domain-specific content extraction rules
  const domainRules = {
    'milanjovanovic.tech': 'div.flex.flex-col.space-y-10.border-r-gray-100.md\\:pr-10.lg\\:border-r-\\[0\\.1rem\\]',
    'devblogs.microsoft.com': 'div[class*="container-evo mt-56"]'
  };
  
  let mainContent = null;
  
  // Check if current domain has specific extraction rules
  if (domainRules[hostname]) {
    mainContent = document.querySelector(domainRules[hostname]);
  }
  
  // Fallback to generic content extraction
  if (!mainContent) {
    mainContent = document.querySelector('main, article, [role="main"]');
  }
  
  const contentElement = mainContent || document.body;
  const html = contentElement.innerHTML;
  
  // Extract images for analysis (limit to first 5 significant images)
  const images = [];
  const imgElements = contentElement.querySelectorAll('img');
  let imageCount = 0;
  
  for (const img of imgElements) {
    if (imageCount >= 5) break; // Limit to 5 images to avoid API limits
    
    // Skip small images (likely icons)
    if (img.width < 100 || img.height < 100) continue;
    
    try {
      // Try to get image data
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      
      // Create a new image to ensure it's loaded
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      
      // Promise to handle async image loading
      const imageDataPromise = new Promise((resolve) => {
        tempImg.onload = () => {
          ctx.drawImage(tempImg, 0, 0);
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64Data = dataUrl.split(',')[1];
            resolve({
              data: base64Data,
              mimeType: 'image/jpeg',
              alt: img.alt || '',
              src: img.src
            });
          } catch (e) {
            // CORS prevents access to cross-origin images
            console.warn('Cannot access image data due to CORS:', img.src);
            resolve(null);
          }
        };
        tempImg.onerror = () => resolve(null);
        tempImg.src = img.src;
      });
      
      const imageData = await imageDataPromise;
      if (imageData) {
        images.push(imageData);
        imageCount++;
      }
    } catch (e) {
      // Skip images that can't be processed
      console.log('Skipping image:', e);
    }
  }
  
  return { title, html, images, author: author.trim(), publicationDate };
}

/**
 * Detects category based on title and URL patterns
 * @param {string} title - Page title
 * @param {string} url - Page URL
 * @returns {string} - Detected category
 */
function detectCategory(title, url) {
  const titleLower = title.toLowerCase();
  const urlLower = url.toLowerCase();
  
  // Category detection patterns
  const patterns = {
    'architecture': ['architecture', 'microservice', 'design pattern', 'system design', 'scalability'],
    'testing': ['test', 'testing', 'tdd', 'unit test', 'integration', 'e2e'],
    'security': ['security', 'authentication', 'authorization', 'oauth', 'jwt', 'encryption'],
    'performance': ['performance', 'optimization', 'speed', 'cache', 'profiling'],
    'database': ['database', 'sql', 'nosql', 'mongodb', 'postgres', 'redis'],
    'devops': ['devops', 'docker', 'kubernetes', 'ci/cd', 'deployment', 'aws', 'azure'],
    'frontend': ['react', 'vue', 'angular', 'frontend', 'css', 'ui', 'ux'],
    'backend': ['backend', 'api', 'rest', 'graphql', 'server', 'node', 'express'],
    'mobile': ['mobile', 'ios', 'android', 'react native', 'flutter'],
    'ai_ml': ['machine learning', 'ai', 'neural', 'tensorflow', 'data science'],
    'programming': ['typescript', 'javascript', 'python', 'java', 'c#', 'rust', 'go', 'programming']
  };
  
  for (const [category, keywords] of Object.entries(patterns)) {
    for (const keyword of keywords) {
      if (titleLower.includes(keyword) || urlLower.includes(keyword)) {
        return category;
      }
    }
  }
  
  return 'general';
}

/**
 * Creates and triggers a download for a text file using Chrome Downloads API.
 * @param {string} filename - The desired name of the file.
 * @param {string} content - The text content of the file.
 */
function downloadFile(filename, content) {
  // Convert content to base64 data URL for Chrome downloads API
  // Using TextEncoder for proper UTF-8 encoding instead of deprecated unescape
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const base64Content = btoa(String.fromCharCode(...data));
  const dataUrl = `data:text/markdown;charset=utf-8;base64,${base64Content}`;
  
  // Use Chrome downloads API with saveAs: true to remember the path
  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true  // This prompts the user and remembers the last used directory
  });
}

const extractBtn = document.getElementById('extractBtn');
const statusEl = document.getElementById('status');

/**
 * URL History Management Functions
 */

// Get the list of extracted URLs from storage
async function getExtractedUrls() {
  const result = await chrome.storage.local.get('extractedUrls');
  return result.extractedUrls || [];
}

// Add a URL to the extracted list
async function addExtractedUrl(url) {
  const urls = await getExtractedUrls();
  const timestamp = new Date().toISOString();
  
  // Check if URL already exists and update it
  const existingIndex = urls.findIndex(item => item.url === url);
  if (existingIndex !== -1) {
    urls[existingIndex].lastExtracted = timestamp;
    urls[existingIndex].count = (urls[existingIndex].count || 1) + 1;
  } else {
    urls.push({
      url: url,
      firstExtracted: timestamp,
      lastExtracted: timestamp,
      count: 1
    });
  }
  
  // Keep only the last 100 URLs (configurable)
  const maxUrls = 100;
  if (urls.length > maxUrls) {
    // Sort by lastExtracted date and keep the most recent
    urls.sort((a, b) => new Date(b.lastExtracted) - new Date(a.lastExtracted));
    urls.splice(maxUrls);
  }
  
  await chrome.storage.local.set({ extractedUrls: urls });
}

// Check if a URL has been extracted before
async function isUrlExtracted(url) {
  const urls = await getExtractedUrls();
  return urls.some(item => item.url === url);
}

// Clear all extracted URLs
async function clearExtractedUrls() {
  await chrome.storage.local.set({ extractedUrls: [] });
}

// Keep only the last N URLs
async function keepLastNUrls(n = 100) {
  const urls = await getExtractedUrls();
  if (urls.length > n) {
    urls.sort((a, b) => new Date(b.lastExtracted) - new Date(a.lastExtracted));
    urls.splice(n);
    await chrome.storage.local.set({ extractedUrls: urls });
  }
}

// Initialize Turndown Service once with preferred options.
// Note: 'atx' is the desired heading style (e.g., # Heading).
// The provided Turndown library version defaults to 'setext' for H1/H2.
// Setting headingStyle to anything other than 'setext' forces 'atx' style for all headings.
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '*',
  codeBlockStyle: 'fenced',
});

// Add rule for better code block handling with language detection
turndownService.addRule('enhancedCodeBlock', {
  filter: function(node) {
    return node.nodeName === 'PRE' && node.querySelector('code');
  },
  replacement: function(content, node) {
    const codeEl = node.querySelector('code');
    if (!codeEl) return '\n```\n' + content + '\n```\n';
    
    // Extract language from class name
    let lang = '';
    const className = codeEl.className || '';
    const langMatch = className.match(/(?:lang|language)-(\w+)/);
    if (langMatch) {
      lang = langMatch[1];
    }
    
    // Get the actual code content
    const code = codeEl.textContent || content;
    
    return '\n```' + lang + '\n' + code.trim() + '\n```\n';
  }
});

// Add options link handler
document.getElementById('optionsLink').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

/**
 * Validates if the tab can be processed
 * @param {chrome.tabs.Tab} tab - The tab to validate
 * @throws {Error} if tab is invalid
 */
function validateTab(tab) {
  if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('about:')) {
    throw new Error('Cannot extract content from browser-internal pages.');
  }

  if (!tab?.id) {
    throw new Error(`Could not find active tab. Current URL: ${tab?.url || 'unknown'}`);
  }

  if (typeof tab.id !== 'number') {
    throw new Error('Invalid tab ID received');
  }
}

/**
 * Generates filename from page content
 * @param {Object} pageContent - The extracted page content
 * @param {string} url - The page URL
 * @returns {string} The generated filename
 */
function generateFilename(pageContent, url) {
  const safeTitle = pageContent.title.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
  
  // Use publication date if available, otherwise use current date
  let dateStr;
  if (pageContent.publicationDate) {
    const pubDate = new Date(pageContent.publicationDate);
    if (!isNaN(pubDate.getTime())) {
      dateStr = `${pubDate.getFullYear()}-${String(pubDate.getMonth() + 1).padStart(2, '0')}-${String(pubDate.getDate()).padStart(2, '0')}`;
    }
  }
  
  // Fallback to current date if no valid publication date
  if (!dateStr) {
    const date = new Date();
    dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  
  const category = detectCategory(pageContent.title, url);
  return `${dateStr}_${category}_${safeTitle || 'document'}.md`;
}

/**
 * Creates metadata header for the markdown file using YAML frontmatter
 * @param {Object} pageContent - The extracted page content
 * @param {string} url - The page URL
 * @param {string} category - The detected category
 * @param {Object} geminiData - Optional enriched data from Gemini
 * @returns {string} The YAML frontmatter header
 */
function createMetadata(pageContent, url, category, geminiData = null) {
  // Escape YAML special characters in title and author
  const escapeYaml = (str) => {
    if (!str) return '';
    // If string contains special characters, quote it
    if (/[:"'|>{}[\]@`!%&*]/.test(str) || str.includes('\n')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  };

  // Format array for YAML
  const formatYamlArray = (arr) => {
    if (!arr || arr.length === 0) return '[]';
    return '[' + arr.map(item => escapeYaml(item)).join(', ') + ']';
  };

  // Use Gemini data if available, otherwise defaults
  const technologies = geminiData?.technologies || [];
  const programmingLanguages = geminiData?.programmingLanguages || [];
  const tags = geminiData?.tags || [];
  const keyConcepts = geminiData?.keyConcepts || [];
  const codeExamples = geminiData?.codeExamples || false;
  const difficultyLevel = geminiData?.difficultyLevel || 'unknown';
  const summary = geminiData?.summary || '';
  
  // Format dates
  const publicationDate = pageContent.publicationDate || null;
  const datePublished = publicationDate ? new Date(publicationDate).toISOString() : null;
  const dateCaptured = new Date().toISOString();

  return `\`\`\`yaml
---
title: ${escapeYaml(pageContent.title)}
source: ${url}
date_published: ${datePublished || 'unknown'}
date_captured: ${dateCaptured}
domain: ${new URL(url).hostname}
author: ${escapeYaml(pageContent.author || 'Unknown')}
category: ${category}
technologies: ${formatYamlArray(technologies)}
programming_languages: ${formatYamlArray(programmingLanguages)}
tags: ${formatYamlArray(tags)}
key_concepts: ${formatYamlArray(keyConcepts)}
code_examples: ${codeExamples}
difficulty_level: ${difficultyLevel}
summary: |
  ${summary.replace(/\n/g, '\n  ')}
---
\`\`\`

# ${pageContent.title}

`;
}

/**
 * Improves markdown content using Gemini if enabled
 * @param {Object} pageContent - The extracted page content
 * @param {string} url - The page URL  
 * @param {string} category - The detected category
 * @param {string} markdown - The markdown content
 * @param {Array} images - Images extracted from the page
 * @returns {Promise<string>} The improved markdown with enhanced metadata
 */
async function improveWithGeminiIfEnabled(pageContent, url, category, markdown, images) {
  const { useGemini, geminiApiKey, geminiModel } = await chrome.storage.sync.get(['useGemini', 'geminiApiKey', 'geminiModel']);

  if (!useGemini || !geminiApiKey) {
    // Create basic metadata without Gemini enhancement
    const metadata = createMetadata(pageContent, url, category);
    return metadata + markdown;
  }

  if (statusEl) statusEl.textContent = 'Improving with Gemini...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'improveWithGemini',
      markdown: markdown,
      apiKey: geminiApiKey,
      model: geminiModel || 'gemini-2.5-pro', // Default fallback
      images: images || []
    });
    
    if (response.improvedMarkdown) {
      const result = response.improvedMarkdown;
      // If we got back structured data with tags, concepts, summary, and content
      if (typeof result === 'object' && result.content) {
        // Create enriched metadata with Gemini data
        const enrichedMetadata = createMetadata(pageContent, url, category, result);
        return enrichedMetadata + result.content;
      }
      // Fallback if format is different
      const basicMetadata = createMetadata(pageContent, url, category);
      return basicMetadata + result;
    } else if (response.error) {
      console.error('Gemini error:', response.error);
    }
  } catch (error) {
    console.error('Failed to improve with Gemini:', error);
  }
  
  // Return original with basic metadata if Gemini fails
  const metadata = createMetadata(pageContent, url, category);
  return metadata + markdown;
}

// Check if current URL has been extracted before
async function checkIfCurrentUrlExtracted() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const isExtracted = await isUrlExtracted(tab.url);
      if (isExtracted) {
        // Add visual indicator
        if (!document.getElementById('extractedIndicator')) {
          const indicator = document.createElement('div');
          indicator.id = 'extractedIndicator';
          indicator.style.cssText = 'color: #4CAF50; font-size: 11px; margin-top: 5px; font-weight: bold;';
          indicator.textContent = '✓ Already extracted';
          extractBtn.parentNode.insertBefore(indicator, extractBtn.nextSibling);
        }
        // Update button text
        if (!extractBtn.disabled) {
          extractBtn.textContent = 'Re-extract Page as Markdown';
        }
      } else {
        // Remove indicator if exists
        const indicator = document.getElementById('extractedIndicator');
        if (indicator) {
          indicator.remove();
        }
        // Reset button text
        if (!extractBtn.disabled) {
          extractBtn.textContent = 'Extract Page as Markdown';
        }
      }
    }
  } catch (error) {
    console.error('Error checking URL extraction status:', error);
  }
}

// Check on popup load
document.addEventListener('DOMContentLoaded', () => {
  checkIfCurrentUrlExtracted();
});

extractBtn.addEventListener('click', async () => {
  extractBtn.disabled = true;
  extractBtn.textContent = 'Extracting...';
  if (statusEl) statusEl.textContent = ''; // Clear previous status

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    validateTab(tab);

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getPageContent,
    });

    const pageContent = results[0].result;
    if (!pageContent?.html) {
      throw new Error('Could not extract content from the page.');
    }

    const filename = generateFilename(pageContent, tab.url);
    const category = detectCategory(pageContent.title, tab.url);
    
    let markdown = turndownService.turndown(pageContent.html);

    // Check if using Gemini (which takes longer)
    const { useGemini, geminiApiKey, geminiModel } = await chrome.storage.sync.get(['useGemini', 'geminiApiKey', 'geminiModel']);

    if (useGemini && geminiApiKey) {
      // Show notification that processing continues in background
      if (statusEl) {
        statusEl.textContent = 'Processing with Gemini... (popup can be closed)';
        statusEl.style.color = '#1976d2';
      }

      // Send to background for processing
      chrome.runtime.sendMessage({
        action: 'processAndDownload',
        pageContent,
        url: tab.url,
        category,
        markdown,
        filename,
        apiKey: geminiApiKey,
        model: geminiModel || 'gemini-2.5-pro' // Default fallback
      });
      
      // Keep button disabled while processing
      // The background script will send a message when done
      chrome.runtime.onMessage.addListener(function listener(message) {
        if (message.action === 'processingComplete') {
          extractBtn.disabled = false;
          extractBtn.textContent = 'Extract Page as Markdown';
          if (statusEl) {
            statusEl.textContent = message.success ? 'File downloaded successfully!' : 'Processing failed';
            statusEl.style.color = message.success ? 'green' : 'red';
          }
          chrome.runtime.onMessage.removeListener(listener);
        }
      });
      
      // Show processing message
      setTimeout(() => {
        if (statusEl) {
          statusEl.textContent = 'Processing in background. File will download when ready.';
          statusEl.style.color = '#1976d2';
        }
      }, 1000);
      
    } else {
      // Quick operation without Gemini - do it directly
      const metadata = createMetadata(pageContent, tab.url, category);
      const markdownContent = metadata + markdown;
      downloadFile(filename, markdownContent);
      
      // Add URL to extracted list
      await addExtractedUrl(tab.url);
      
      // Re-enable button after short delay for non-Gemini extraction
      setTimeout(() => {
        extractBtn.disabled = false;
        extractBtn.textContent = 'Extract Page as Markdown';
        if (statusEl) {
          statusEl.textContent = 'File downloaded successfully!';
          statusEl.style.color = 'green';
        }
        // Update indicator for already extracted
        checkIfCurrentUrlExtracted();
      }, 500);
    }
  } catch (error) {
    console.error(`Failed to run extraction: ${error}`);
    const errorMessage = `Error: ${error.message}`;
    if (statusEl) {
      statusEl.textContent = errorMessage;
      statusEl.style.color = 'red';
    }
    extractBtn.disabled = false;
    extractBtn.textContent = 'Extract Page as Markdown';
  }
});
