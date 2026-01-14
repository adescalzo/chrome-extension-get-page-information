// Import polyfill for Chrome compatibility
importScripts('browser-polyfill.min.js');

// URL History Management Functions (duplicated from popup.js for background access)
async function getExtractedUrls() {
  const result = await browser.storage.local.get("extractedUrls");
  return result.extractedUrls || [];
}

async function addExtractedUrl(url) {
  const urls = await getExtractedUrls();
  const timestamp = new Date().toISOString();

  const existingIndex = urls.findIndex((item) => item.url === url);
  if (existingIndex !== -1) {
    urls[existingIndex].lastExtracted = timestamp;
    urls[existingIndex].count = (urls[existingIndex].count || 1) + 1;
  } else {
    urls.push({
      url: url,
      firstExtracted: timestamp,
      lastExtracted: timestamp,
      count: 1,
    });
  }

  const maxUrls = 100;
  if (urls.length > maxUrls) {
    urls.sort((a, b) => new Date(b.lastExtracted) - new Date(a.lastExtracted));
    urls.splice(maxUrls);
  }

  await browser.storage.local.set({ extractedUrls: urls });
}

// Background script for handling Gemini API calls
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "improveWithGemini") {
    improveMarkdownWithGemini(
      request.markdown,
      request.apiKey,
      request.images,
      request.model
    )
      .then(sendResponse)
      .catch((error) => sendResponse({ error: error.message }));
    return true; // Will respond asynchronously
  } else if (request.action === "processAndDownload") {
    // Handle background processing with Gemini and download
    processAndDownloadWithGemini(request)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
});

async function improveMarkdownWithGemini(
  markdown,
  apiKey,
  images = [],
  model = "gemini-2.5-pro"
) {
  if (!apiKey) {
    throw new Error("Gemini API key not configured");
  }

  // Enhanced prompt for richer metadata extraction with technologies
  const improvePrompt = `You are a technical content analyzer. Analyze the provided content and extract metadata.

CRITICAL: You MUST format your response EXACTLY as shown below. Do not deviate from this format.

## Metadata
Technologies: [LIST HERE - e.g., ASP.NET Core, Dapper, Entity Framework, SQL Server, PostgreSQL]
Programming_Languages: [LIST HERE - e.g., C#, SQL, JavaScript]
Tags: [LIST HERE - e.g., orm, database, dotnet, web-api, data-access]
Key_Concepts: [LIST HERE - e.g., micro-orm, repository-pattern, dependency-injection]
Code_Examples: [yes or no]
Difficulty_Level: [beginner or intermediate or advanced]
Summary: [Write 4-6 sentences here]

## Content
[Put the improved markdown content here]

IMPORTANT RULES:
1. For Technologies: List ALL technologies, frameworks, libraries, tools mentioned in the article (e.g., ASP.NET Core, Dapper, SQL Server, Docker, Redis, etc.)
2. For Programming_Languages: List ONLY programming languages (C#, Python, JavaScript, SQL, etc.), NOT frameworks
3. For Tags: Use lowercase, hyphenated terms for categorization (max 10)
4. For Key_Concepts: List main technical concepts, patterns, or methodologies discussed (max 8)
5. Never leave any field empty - if nothing found, write "none" 
6. Do NOT use empty brackets []

Example for a Dapper article:
Technologies: [Dapper, ASP.NET Core, SQL Server, .NET 6]
Programming_Languages: [C#, SQL]
Tags: [micro-orm, database, dotnet, performance, data-access]
Key_Concepts: [micro-orm, query-optimization, parameterized-queries, mapping]

Now analyze this content:

${markdown}`;

  try {
    // Use the selected model for both text and vision tasks
    /*
    Available models:
    gemini-2.5-pro
    gemini-2.5-flash
    gemini-2.5-flash-lite
    */

    // Prepare the content parts
    const parts = [{ text: improvePrompt }];

    // Add images if available
    if (images.length > 0) {
      // Add image analysis request to the prompt
      parts[0].text = `${improvePrompt}\n\nAlso, please analyze any images found in the content and add descriptions where appropriate.`;

      // Add image data
      images.forEach((imageData) => {
        parts.push({
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.data,
          },
        });
      });
    }

    const response = await generateContentWithBackoff(model, apiKey, parts);

    // const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     contents: [{
    //       parts: parts
    //     }],
    //     generationConfig: {
    //       temperature: 0.3,
    //       maxOutputTokens: 8192,
    //     }
    //   })
    // });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();

    // Check if the response has the expected structure
    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content ||
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0]
    ) {
      console.error("Unexpected Gemini API response structure:", data);
      throw new Error("Invalid response structure from Gemini API");
    }

    const improvedContent = data.candidates[0].content.parts[0].text;

    // Debug logging
    console.log("===== GEMINI RESPONSE START =====");
    console.log(
      "Full Gemini response (first 1000 chars):",
      improvedContent.substring(0, 1000)
    );
    console.log("===== GEMINI RESPONSE END =====");

    // Parse the enhanced response with metadata
    const metadataMatch = improvedContent.match(
      /## Metadata\n([\s\S]*?)\n\n## Content/
    );
    const contentMatch = improvedContent.match(/## Content\n([\s\S]*)/);

    let technologies = [];
    let programmingLanguages = [];
    let tags = [];
    let keyConcepts = [];
    let codeExamples = false;
    let difficultyLevel = "intermediate";
    let summary = "";

    if (metadataMatch) {
      const metadataText = metadataMatch[1];
      console.log("Extracted metadata text:", metadataText);

      // Extract technologies - handle both with and without spaces after colon
      const techMatch = metadataText.match(/Technologies:\s*\[([^\]]*)\]/i);
      if (techMatch && techMatch[1] && techMatch[1].toLowerCase() !== "none") {
        technologies = techMatch[1]
          .split(",")
          .map((tech) => tech.trim())
          .filter((tech) => tech && tech.toLowerCase() !== "none");
      }
      console.log("Technologies found:", technologies);

      // Extract programming languages - handle both with and without spaces after colon
      const langMatch = metadataText.match(
        /Programming_Languages:\s*\[([^\]]*)\]/i
      );
      if (langMatch && langMatch[1] && langMatch[1].toLowerCase() !== "none") {
        programmingLanguages = langMatch[1]
          .split(",")
          .map((lang) => lang.trim())
          .filter((lang) => lang && lang.toLowerCase() !== "none");
      }
      console.log("Programming languages found:", programmingLanguages);

      // Extract tags - handle both with and without spaces after colon
      const tagsMatch = metadataText.match(/Tags:\s*\[([^\]]*)\]/i);
      if (tagsMatch && tagsMatch[1] && tagsMatch[1].toLowerCase() !== "none") {
        tags = tagsMatch[1]
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag && tag.toLowerCase() !== "none");
      }
      console.log("Tags found:", tags);

      // Extract key concepts - handle both with and without spaces after colon
      const conceptsMatch = metadataText.match(/Key_Concepts:\s*\[([^\]]*)\]/i);
      if (
        conceptsMatch &&
        conceptsMatch[1] &&
        conceptsMatch[1].toLowerCase() !== "none"
      ) {
        keyConcepts = conceptsMatch[1]
          .split(",")
          .map((concept) => concept.trim())
          .filter((concept) => concept && concept.toLowerCase() !== "none");
      }
      console.log("Key concepts found:", keyConcepts);

      // Extract code examples flag
      const codeMatch = metadataText.match(/Code_Examples:\s*(yes|no)/i);
      if (codeMatch) {
        codeExamples = codeMatch[1].toLowerCase() === "yes";
      }

      // Extract difficulty level
      const difficultyMatch = metadataText.match(
        /Difficulty_Level:\s*(beginner|intermediate|advanced)/i
      );
      if (difficultyMatch) {
        difficultyLevel = difficultyMatch[1].toLowerCase();
      }

      // Extract summary
      const summaryMatch = metadataText.match(/Summary:\s*(.*)/s);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
      }
    } else {
      console.log(
        "No metadata match found in response - trying fallback parsing"
      );
      // Try alternative parsing for less structured responses
      // Look for individual fields even without the ## Metadata header
      const fullText = improvedContent;

      // Try to find technologies mentioned anywhere - more flexible patterns
      const techPatterns = [
        /Technologies?:?\s*\[([^\]]*)\]/i,
        /Technologies?:?\s*([^\n]+)/i,
      ];
      for (const pattern of techPatterns) {
        const match = fullText.match(pattern);
        if (match && match[1] && match[1].toLowerCase() !== "none") {
          const items = match[1].includes("[")
            ? match[1].replace(/[\[\]]/g, "").split(",")
            : match[1].split(",");
          technologies = items
            .map((tech) => tech.trim())
            .filter((tech) => tech && tech.toLowerCase() !== "none");
          if (technologies.length > 0) break;
        }
      }

      // Try to find programming languages - more flexible patterns
      const langPatterns = [
        /Programming[_\s]Languages?:?\s*\[([^\]]*)\]/i,
        /Programming[_\s]Languages?:?\s*([^\n]+)/i,
      ];
      for (const pattern of langPatterns) {
        const match = fullText.match(pattern);
        if (match && match[1] && match[1].toLowerCase() !== "none") {
          const items = match[1].includes("[")
            ? match[1].replace(/[\[\]]/g, "").split(",")
            : match[1].split(",");
          programmingLanguages = items
            .map((lang) => lang.trim())
            .filter((lang) => lang && lang.toLowerCase() !== "none");
          if (programmingLanguages.length > 0) break;
        }
      }

      // Try to find tags - more flexible patterns
      const tagsPatterns = [/Tags?:?\s*\[([^\]]*)\]/i, /Tags?:?\s*([^\n]+)/i];
      for (const pattern of tagsPatterns) {
        const match = fullText.match(pattern);
        if (match && match[1] && match[1].toLowerCase() !== "none") {
          const items = match[1].includes("[")
            ? match[1].replace(/[\[\]]/g, "").split(",")
            : match[1].split(",");
          tags = items
            .map((tag) => tag.trim())
            .filter((tag) => tag && tag.toLowerCase() !== "none");
          if (tags.length > 0) break;
        }
      }

      // Try to find key concepts - more flexible patterns
      const conceptPatterns = [
        /Key[_\s]Concepts?:?\s*\[([^\]]*)\]/i,
        /Key[_\s]Concepts?:?\s*([^\n]+)/i,
      ];
      for (const pattern of conceptPatterns) {
        const match = fullText.match(pattern);
        if (match && match[1] && match[1].toLowerCase() !== "none") {
          const items = match[1].includes("[")
            ? match[1].replace(/[\[\]]/g, "").split(",")
            : match[1].split(",");
          keyConcepts = items
            .map((concept) => concept.trim())
            .filter((concept) => concept && concept.toLowerCase() !== "none");
          if (keyConcepts.length > 0) break;
        }
      }

      console.log("Fallback parsing - Technologies:", technologies);
      console.log("Fallback parsing - Languages:", programmingLanguages);
      console.log("Fallback parsing - Tags:", tags);
      console.log("Fallback parsing - Key Concepts:", keyConcepts);
    }

    const improvedMarkdown = contentMatch
      ? contentMatch[1].trim()
      : improvedContent;

    // Return structured data
    const finalMarkdown = {
      technologies,
      programmingLanguages,
      tags,
      keyConcepts,
      codeExamples,
      difficultyLevel,
      summary,
      content: improvedMarkdown,
    };

    return { improvedMarkdown: finalMarkdown };
  } catch (error) {
    console.error("Gemini API error:", error);
    throw error;
  }
}

async function generateContentWithBackoff(model, apiKey, parts) {
  const maxRetries = 8;
  const baseDelay = 2; // in seconds

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // This is your original fetch call
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: parts,
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      // If the request was successful, return the result immediately
      if (response.ok) {
        return response;
      }

      // If we get a 503 error, we should retry
      if (response.status === 503) {
        // If this was the last attempt, throw an error
        if (attempt === maxRetries - 1) {
          return response;
        }

        // Otherwise, wait and continue to the next attempt
        const delay = baseDelay * Math.pow(2, attempt) + Math.random();
        console.log(
          `Model overloaded (503). Retrying in ${delay.toFixed(2)} seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        continue; // Go to the next iteration of the loop
      }

      // For any other non-successful response, throw an error immediately
      console.log(`Request failed with status ${response.status}`);
      return response;
    } catch (error) {
      // Handle network errors or errors from the checks above
      if (attempt === maxRetries - 1) {
        console.error("API call failed after all retries.", error);
        throw error; // Re-throw the final error
      }
      // For network errors, we can also retry
      const delay = baseDelay * Math.pow(2, attempt) + Math.random();
      console.log(
        `Encountered an error. Retrying in ${delay.toFixed(2)} seconds...`,
        error.message
      );
      await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    }
  }
}

// Helper function to create metadata (duplicated from popup.js for background processing)
function createMetadata(pageContent, url, category, geminiData = null) {
  const escapeYaml = (str) => {
    if (!str) return "";
    if (/[:"'|>{}[\]@`!%&*]/.test(str) || str.includes("\n")) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  };

  const formatYamlArray = (arr) => {
    if (!arr || arr.length === 0) return "[]";
    return "[" + arr.map((item) => escapeYaml(item)).join(", ") + "]";
  };

  const technologies = geminiData?.technologies || [];
  const programmingLanguages = geminiData?.programmingLanguages || [];
  const tags = geminiData?.tags || [];
  const keyConcepts = geminiData?.keyConcepts || [];
  const codeExamples = geminiData?.codeExamples || false;
  const difficultyLevel = geminiData?.difficultyLevel || "unknown";
  const summary = geminiData?.summary || "";

  // Format dates
  const publicationDate = pageContent.publicationDate || null;
  const datePublished = publicationDate
    ? new Date(publicationDate).toISOString()
    : null;
  const dateCaptured = new Date().toISOString();

  return `\`\`\`yaml
---
title: ${escapeYaml(pageContent.title)}
source: ${url}
date_published: ${datePublished || "unknown"}
date_captured: ${dateCaptured}
domain: ${new URL(url).hostname}
author: ${escapeYaml(pageContent.author || "Unknown")}
category: ${category}
technologies: ${formatYamlArray(technologies)}
programming_languages: ${formatYamlArray(programmingLanguages)}
tags: ${formatYamlArray(tags)}
key_concepts: ${formatYamlArray(keyConcepts)}
code_examples: ${codeExamples}
difficulty_level: ${difficultyLevel}
summary: |
  ${summary.replace(/\n/g, "\n  ")}
---
\`\`\`

# ${pageContent.title}

`;
}

// Process and download in background (allows popup to close)
async function processAndDownloadWithGemini(request) {
  const { pageContent, url, category, markdown, filename, apiKey, model } =
    request;

  try {
    // Process with Gemini
    const result = await improveMarkdownWithGemini(
      markdown,
      apiKey,
      pageContent.images || [],
      model
    );

    let finalContent;
    if (
      result.improvedMarkdown &&
      typeof result.improvedMarkdown === "object"
    ) {
      const enrichedMetadata = createMetadata(
        pageContent,
        url,
        category,
        result.improvedMarkdown
      );

      // Check if Gemini returned content, otherwise fallback to original markdown
      // This handles cases where Gemini extracts metadata but fails to output the content
      let contentToUse = result.improvedMarkdown.content;
      if (!contentToUse || contentToUse.trim().length === 0) {
        console.warn(
          "Gemini returned empty content, falling back to original markdown"
        );
        contentToUse = markdown;
      }

      finalContent = enrichedMetadata + contentToUse;
    } else {
      // Fallback
      const basicMetadata = createMetadata(pageContent, url, category);
      finalContent = basicMetadata + markdown;
    }

    // Convert content to base64 data URL for download
    // Using TextEncoder for proper UTF-8 encoding instead of deprecated unescape
    const encoder = new TextEncoder();
    const data = encoder.encode(finalContent);

    // Use a chunked approach to avoid stack overflow with String.fromCharCode(...data)
    let binary = "";
    const len = data.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        data.subarray(i, i + chunkSize)
      );
    }

    const base64Content = btoa(binary);
    const dataUrl = `data:text/markdown;charset=utf-8;base64,${base64Content}`;

    // Use Chrome downloads API to download the file
    browser.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true, // Changed to true to prompt user and remember the last used directory
    });

    // Add URL to extracted list
    await addExtractedUrl(url);

    // Show notification that download completed
    browser.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Page Extraction Complete",
      message: `File "${filename}" has been downloaded successfully.`,
    });

    // Notify popup if it's still open
    browser.runtime
      .sendMessage({
        action: "processingComplete",
        success: true,
        filename: filename,
      })
      .catch(() => {
        // Popup might be closed, ignore error
      });
  } catch (error) {
    console.error("Background processing error:", error);

    // Show error notification
    browser.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "Extraction Failed",
      message: `Error: ${error.message}`,
    });

    // Notify popup if it's still open
    browser.runtime
      .sendMessage({
        action: "processingComplete",
        success: false,
        error: error.message,
      })
      .catch(() => {
        // Popup might be closed, ignore error
      });

    throw error;
  }
}
