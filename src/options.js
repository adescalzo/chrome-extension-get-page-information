// Default models that come with the extension
const DEFAULT_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite'
];

// Saves options to browser.storage
function saveOptions() {
  const geminiApiKey = document.getElementById('geminiApiKey').value;
  const useGemini = document.getElementById('useGemini').checked;
  const geminiModel = document.getElementById('geminiModel').value;

  browser.storage.sync.set({
    geminiApiKey: geminiApiKey,
    useGemini: useGemini,
    geminiModel: geminiModel
  }, function() {
    // Update status to let user know options were saved
    const status = document.getElementById('status');
    status.textContent = 'Options saved successfully!';
    status.className = 'success';
    setTimeout(function() {
      status.textContent = '';
      status.className = '';
    }, 3000);
  });
}

// Restores options from browser.storage
function restoreOptions() {
  browser.storage.sync.get({
    geminiApiKey: '',
    useGemini: false,
    geminiModel: 'gemini-2.5-pro', // Default model
    customModels: [] // Custom models array
  }, function(items) {
    document.getElementById('geminiApiKey').value = items.geminiApiKey;
    document.getElementById('useGemini').checked = items.useGemini;

    // Populate the dropdown with default and custom models
    populateModelDropdown(items.customModels);
    document.getElementById('geminiModel').value = items.geminiModel;

    // Display custom models list
    displayCustomModels(items.customModels);
  });
}

// Custom Models Management Functions
function populateModelDropdown(customModels) {
  const select = document.getElementById('geminiModel');

  // Clear existing options
  select.innerHTML = '';

  // Add default models
  DEFAULT_MODELS.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model + (model === 'gemini-2.5-pro' ? ' (Default)' : '');
    select.appendChild(option);
  });

  // Add custom models
  if (customModels.length > 0) {
    // Add separator
    const separator = document.createElement('option');
    separator.disabled = true;
    separator.textContent = '--- Custom Models ---';
    select.appendChild(separator);

    customModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model + ' (Custom)';
      select.appendChild(option);
    });
  }
}

function displayCustomModels(customModels) {
  const container = document.getElementById('customModelsList');
  container.innerHTML = '';

  if (customModels.length === 0) {
    container.innerHTML = '<p style="color: #666; font-size: 12px; margin: 10px 0;">No custom models added yet.</p>';
    return;
  }

  customModels.forEach(model => {
    const item = document.createElement('div');
    item.className = 'custom-model-item';
    item.innerHTML = `
      <span>${model}</span>
      <button class="remove-model" data-model="${model}">Remove</button>
    `;
    container.appendChild(item);
  });

  // Add event listeners for remove buttons
  container.querySelectorAll('.remove-model').forEach(button => {
    button.addEventListener('click', removeCustomModel);
  });
}

async function addCustomModel() {
  const input = document.getElementById('customModelInput');
  const modelName = input.value.trim();

  if (!modelName) {
    showStatus('Please enter a model name', 'error');
    return;
  }

  // Basic validation for model name format
  if (!modelName.startsWith('gemini-')) {
    showStatus('Model name should start with "gemini-"', 'error');
    return;
  }

  // Get current custom models
  const result = await browser.storage.sync.get(['customModels']);
  const customModels = result.customModels || [];

  // Check if model already exists (in default or custom)
  if (DEFAULT_MODELS.includes(modelName) || customModels.includes(modelName)) {
    showStatus('This model already exists', 'error');
    return;
  }

  // Add the new model
  customModels.push(modelName);

  // Save to storage
  await browser.storage.sync.set({ customModels: customModels });

  // Update UI
  populateModelDropdown(customModels);
  displayCustomModels(customModels);

  // Clear input and show success
  input.value = '';
  showStatus('Custom model added successfully!', 'success');
}

async function removeCustomModel(event) {
  const modelName = event.target.dataset.model;

  if (confirm(`Are you sure you want to remove the model "${modelName}"?`)) {
    // Get current custom models
    const result = await browser.storage.sync.get(['customModels']);
    const customModels = result.customModels || [];

    // Remove the model
    const updatedModels = customModels.filter(model => model !== modelName);

    // Save to storage
    await browser.storage.sync.set({ customModels: updatedModels });

    // Update UI
    populateModelDropdown(updatedModels);
    displayCustomModels(updatedModels);

    showStatus('Custom model removed', 'success');

    // If the removed model was selected, reset to default
    const currentSelection = document.getElementById('geminiModel').value;
    if (currentSelection === modelName) {
      document.getElementById('geminiModel').value = 'gemini-2.5-pro';
      showStatus('Selection reset to default model', 'info');
    }
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.display = 'block';

  if (type === 'success') {
    status.className = 'success';
  } else if (type === 'error') {
    status.className = 'error';
  } else {
    status.className = 'info';
    status.style.backgroundColor = '#d1ecf1';
    status.style.color = '#0c5460';
  }

  setTimeout(() => {
    status.style.display = 'none';
    status.className = '';
  }, 3000);
}

// URL History Management Functions
async function getExtractedUrls() {
  const result = await browser.storage.local.get('extractedUrls');
  return result.extractedUrls || [];
}

async function updateUrlCount() {
  const urls = await getExtractedUrls();
  const countElement = document.getElementById('urlCount');
  countElement.textContent = `Total extracted URLs: ${urls.length}`;
}

async function clearAllHistory() {
  if (confirm('Are you sure you want to clear all extraction history? This cannot be undone.')) {
    await browser.storage.local.set({ extractedUrls: [] });
    updateUrlCount();
    showHistoryStatus('All history cleared!', 'success');
  }
}

async function keepLast100() {
  const urls = await getExtractedUrls();
  if (urls.length > 100) {
    urls.sort((a, b) => new Date(b.lastExtracted) - new Date(a.lastExtracted));
    urls.splice(100);
    await browser.storage.local.set({ extractedUrls: urls });
    updateUrlCount();
    showHistoryStatus(`Kept last 100 URLs, removed ${urls.length - 100} older entries.`, 'success');
  } else {
    showHistoryStatus('Already have 100 or fewer URLs in history.', 'info');
  }
}

async function exportHistory() {
  const urls = await getExtractedUrls();
  if (urls.length === 0) {
    showHistoryStatus('No history to export.', 'error');
    return;
  }
  
  // Create CSV content
  const csvContent = 'URL,First Extracted,Last Extracted,Extract Count\n' +
    urls.map(item => 
      `"${item.url}","${item.firstExtracted}","${item.lastExtracted}",${item.count || 1}`
    ).join('\n');
  
  // Download as CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `extraction_history_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showHistoryStatus('History exported successfully!', 'success');
}

function showHistoryStatus(message, type) {
  const status = document.getElementById('historyStatus');
  status.textContent = message;
  status.style.display = 'block';
  status.style.padding = '10px';
  status.style.borderRadius = '4px';
  
  if (type === 'success') {
    status.style.backgroundColor = '#d4edda';
    status.style.color = '#155724';
  } else if (type === 'error') {
    status.style.backgroundColor = '#f8d7da';
    status.style.color = '#721c24';
  } else {
    status.style.backgroundColor = '#d1ecf1';
    status.style.color = '#0c5460';
  }
  
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  updateUrlCount();
});

document.getElementById('save').addEventListener('click', saveOptions);
document.getElementById('addCustomModel').addEventListener('click', addCustomModel);
document.getElementById('clearHistory').addEventListener('click', clearAllHistory);
document.getElementById('keepLast100').addEventListener('click', keepLast100);
document.getElementById('exportHistory').addEventListener('click', exportHistory);

// Allow Enter key to add custom model
document.getElementById('customModelInput').addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    addCustomModel();
  }
});