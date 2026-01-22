// DOM Elements
const synthesizeForm = document.getElementById('synthesizeForm');
const voiceSelect = document.getElementById('voiceSelect');
const textInput = document.getElementById('textInput');
const charCount = document.getElementById('charCount');
const synthesizeBtn = document.getElementById('synthesizeBtn');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

// Audio elements
const audioPlayer = document.getElementById('audioPlayer');
const audioDownload = document.getElementById('audioDownload');
const audioInfo = document.getElementById('audioInfo');

// SRT elements
const srtPreview = document.getElementById('srtPreview');
const srtDownload = document.getElementById('srtDownload');
const srtInfo = document.getElementById('srtInfo');

// Stats elements
const durationStat = document.getElementById('durationStat');
const sentencesStat = document.getElementById('sentencesStat');

// Initialize the application
async function init() {
  await loadVoices();
  setupEventListeners();
  checkServerHealth();
}

// Load available voices from the API
async function loadVoices() {
  try {
    const response = await fetch('/api/voices');
    const data = await response.json();
    
    voiceSelect.innerHTML = '';
    
    // Group voices by language
    const voicesByLanguage = {};
    data.voices.forEach(voice => {
      if (!voicesByLanguage[voice.language]) {
        voicesByLanguage[voice.language] = [];
      }
      voicesByLanguage[voice.language].push(voice);
    });

    // Create optgroups for each language
    Object.entries(voicesByLanguage).forEach(([language, voices]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = language;
      
      voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = `${voice.name} (${voice.gender})`;
        optgroup.appendChild(option);
      });
      
      voiceSelect.appendChild(optgroup);
    });

    // Set default voice (French as per the C# example)
    voiceSelect.value = 'fr-FR-EloiseNeural';
  } catch (error) {
    console.error('Failed to load voices:', error);
    voiceSelect.innerHTML = '<option value="fr-FR-EloiseNeural">fr-FR-EloiseNeural (Default)</option>';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Character count
  textInput.addEventListener('input', () => {
    charCount.textContent = textInput.value.length;
  });

  // Form submission
  synthesizeForm.addEventListener('submit', handleSynthesize);
}

// Check server health
async function checkServerHealth() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    
    if (!data.configured) {
      showError('Azure Speech Services is not configured. Please set the AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.');
    }
  } catch (error) {
    showError('Unable to connect to the server. Please make sure the server is running.');
  }
}

// Handle synthesis form submission
async function handleSynthesize(event) {
  event.preventDefault();
  
  const text = textInput.value.trim();
  const voiceName = voiceSelect.value;
  
  if (!text) {
    showError('Please enter some text to synthesize.');
    return;
  }

  // Show loading state
  setLoading(true);
  hideError();
  hideResults();

  try {
    const response = await fetch('/api/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voiceName,
        outputFormat: 'wav',
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Synthesis failed');
    }

    // Display results
    showResults(data);
  } catch (error) {
    console.error('Synthesis error:', error);
    showError(error.message || 'An unexpected error occurred');
  } finally {
    setLoading(false);
  }
}

// Show synthesis results
async function showResults(data) {
  resultSection.hidden = false;
  
  // Audio
  audioPlayer.src = data.audioUrl;
  audioDownload.href = data.audioUrl;
  audioDownload.download = data.audioFilename;
  audioInfo.textContent = `${data.audioFilename} (${formatFileSize(data.audioSize)})`;
  
  // SRT
  srtDownload.href = data.srtUrl;
  srtDownload.download = data.srtFilename;
  srtInfo.textContent = `${data.srtFilename} (${formatFileSize(data.srtSize)})`;
  
  // Load and display SRT preview
  try {
    const srtResponse = await fetch(data.srtUrl);
    const srtContent = await srtResponse.text();
    srtPreview.textContent = srtContent;
  } catch (error) {
    srtPreview.textContent = 'Unable to load SRT preview';
  }

  // Stats
  durationStat.textContent = formatDuration(data.duration);
  sentencesStat.textContent = data.sentenceCount;

  // Scroll to results
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Hide results section
function hideResults() {
  resultSection.hidden = true;
}

// Show error message
function showError(message) {
  errorSection.hidden = false;
  errorMessage.textContent = message;
}

// Hide error section
function hideError() {
  errorSection.hidden = true;
}

// Set loading state
function setLoading(isLoading) {
  synthesizeBtn.disabled = isLoading;
  synthesizeBtn.querySelector('.btn-text').hidden = isLoading;
  synthesizeBtn.querySelector('.btn-loading').hidden = !isLoading;
}

// Format file size
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Format duration in milliseconds to mm:ss
function formatDuration(ms) {
  if (!ms) return '-';
  
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
