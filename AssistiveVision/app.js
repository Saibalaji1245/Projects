const API_URL = 'http://localhost:3000/api';
let activePage = 'login';
let currentAudio = null; // Global reference to the currently playing audio

// --- SPEECH & SOUND HELPERS ---

/**
 * Speaks text using the browser's speech synthesis.
 * @param {string} text - The text to speak.
 * @param {object} [opts={}] - Options (lang, rate).
 * @param {function} [onEndCallback=null] - Callback to run when speech finishes.
 */
function speak(text, opts = {}, onEndCallback = null) {
  if (!('speechSynthesis' in window)) {
    console.warn("Speech synthesis not supported.");
    if (onEndCallback) onEndCallback();
    return;
  }
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const u = new SpeechSynthesisUtterance(text);
  // Voice navigation commands are now always English
  u.lang = opts.lang || 'en-IN';
  u.rate = opts.rate || 1;
  
  if (onEndCallback) {
    u.onend = onEndCallback;
  }
  
  window.speechSynthesis.speak(u);
}

/**
 * Plays a simple beep sound.
 * @param {number} [frequency=880] - Beep frequency.
 * @param {number} [duration=200] - Beep duration in ms.
 * @param {function} [callback=null] - Callback to run after beep.
 */
function playBeep(frequency = 880, duration = 200, callback = null) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
    if (callback) {
      setTimeout(callback, duration + 50);
    }
  } catch (e) {
    console.warn("Could not play beep", e);
    if (callback) {
      callback();
    }
  }
}

/**
 * Listens for a single voice command.
 * @param {function} callback - Function to call with the transcribed text.
 */
function listenOnce(callback) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    speak("Sorry, your browser does not support speech recognition.");
    return;
  }
  
  const r = new SR();
  r.lang = 'en-IN'; 
  r.interimResults = false;
  r.maxAlternatives = 1;
  let didFinish = false;
  r.onresult = (ev) => {
    didFinish = true;
    const t = ev.results[0][0].transcript.trim().toLowerCase();
    callback(t);
  };
  r.onerror = (ev) => {
    console.warn('SR error', ev.error);
    if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
      speak("Sorry, I had trouble with the microphone. Please try again.");
    }
    if (!didFinish) {
        didFinish = true;
        callback('');
    }
  };  
  r.onend = () => {
    if (!didFinish) callback('');
  };
  try {
    r.start();
  } catch (e) {
    console.warn('Could not start recognition', e);
  }
}

// --- THEME MANAGEMENT ---
const themes = {
  classic: {
    'primary-color': '#0EA5A4',    // teal - buttons/active elements
    'secondary-color': '#2563EB',  // blue - links/highlights
    'accent-color': '#22C55E',     // green - alerts/important info
    'warning-color': '#EF4444',    // red - obstacle alerts
    'text-color': '#1F2937',       // dark gray - readability
    'bg-color': '#F8FAFC',         // soft white - reduces glare
    'card-color': '#ffffff',       // white cards
    'overlay-color': 'rgba(255, 255, 255, 0.35)', // light overlay
    'hover-bg-color': 'rgba(255, 255, 255, 0.7)' // light hover
  },
  modern: {
    'primary-color': '#2DD4BF',    // bright teal
    'secondary-color': '#3B82F6',  // soft blue
    'accent-color': '#4ADE80',     // light green
    'warning-color': '#F87171',    // light red
    'text-color': '#E5E7EB',       // light gray text
    'bg-color': '#0F172A',         // soft dark background
    'card-color': '#1E293B',       // dark cards
    'overlay-color': 'rgba(0, 0, 0, 0.3)', // dark overlay
    'hover-bg-color': 'rgba(30, 41, 59, 0.7)' // dark hover
  }
};

function applyTheme(name) {
  const t = themes[name];
  if (!t) return;
  Object.keys(t).forEach(key => {
    document.documentElement.style.setProperty(`--${key}`, t[key]);
  });
  localStorage.setItem('theme', name);
  updateThemeButton();
}

function updateThemeButton() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const current = localStorage.getItem('theme') || 'classic';
  if (current === 'classic') {
    btn.innerHTML = '<span aria-hidden="true" class="mr-1">🌙</span> Dark';
    btn.title = 'Switch to dark/modern theme';
  } else {
    btn.innerHTML = '<span aria-hidden="true" class="mr-1">☀️</span> Classic';
    btn.title = 'Switch to classic theme';
  }
}

function toggleTheme() {
  const current = localStorage.getItem('theme') || 'classic';
  const next = current === 'classic' ? 'modern' : 'classic';
  applyTheme(next);
  const names = { classic: 'classic', modern: 'dark' };
  speak(`Switched to ${names[next]} theme.`);
}

// --- AUTHENTICATION & API ---
/**
 * Decodes a JWT token to get payload.
 * @param {string} token - The JWT token.
 * @returns {object|null} The decoded payload or null.
 */
function decodeToken(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to decode token", e);
        return null;
    }
}

/**
 * Handles user registration.
 * @param {string} username
 * @param {string} password
 * @param {string} language - e.g., 'en-IN', 'hi-IN'
 * @returns {boolean} True on success.
 */
async function handleRegistration(username, password, language) {
  try {
    const response = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, language }), // Send language
    });
    const data = await response.json();
    if (!response.ok) {
      speak(data.message || 'Registration failed.');
      return false;
    }
    speak(data.message + ' Please login now.');
    return true;
  } catch (error) {
    console.error('Network or server error:', error);
    speak('Could not connect to the registration server.');
    return false;
  }
}

/**
 * Handles user login.
 * @param {string} username
 * @param {string} password
 * @returns {boolean} True on success.
 */
async function handleLogin(username, password) {
  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      speak(data.message || 'Login failed.');
      return false;
    }
    
    // Store token and user info from decoded token
    localStorage.setItem('authToken', data.token);
    const payload = decodeToken(data.token);
    if (payload) {
        // We still store the language for the *python script*
        localStorage.setItem('userLang', payload.language); 
        localStorage.setItem('username', payload.username);
        speak(`Welcome back, ${payload.username}.`);
    } else {
         speak(data.message);
    }
    
    return true;
  } catch (error) {
    console.error('Network or server error:', error);
    speak('Could not connect to the login server.');
    return false;
  }
}

/**
 * Logs the user out.
 */
function logoutUser() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('userLang');
  localStorage.removeItem('username');
  speak("You have been logged out.");
}

function isLoggedIn() {
  return localStorage.getItem('authToken') !== null;
}

// --- UI & PAGE MANAGEMENT ---

const pages = {
  home: document.getElementById('home-page'),
  project: document.getElementById('project-page'),
  login: document.getElementById('login-page'),
  register: document.getElementById('register-page'),
  upload: document.getElementById('upload-page'),
  history: document.getElementById('history-page'),
};

const navButtons = {
  home: document.getElementById('nav-home'),
  project: document.getElementById('nav-project'),
  upload: document.getElementById('nav-upload'),
  history: document.getElementById('nav-history'),
  login: document.getElementById('nav-login'),
  register: document.getElementById('nav-register'),
  logout: document.getElementById('nav-logout'),
};

const voiceNavBtn = document.getElementById('voice-nav-btn');
const logoLink = document.getElementById('logo-home-link');

/**
 * Updates the navigation bar based on login state.
 */
function updateNavUI() {
  const loggedIn = isLoggedIn();
  navButtons.home.classList.toggle('hidden', !loggedIn);
  navButtons.project.classList.toggle('hidden', !loggedIn);
  navButtons.upload.classList.toggle('hidden', !loggedIn);
  navButtons.history.classList.toggle('hidden', !loggedIn);
  navButtons.logout.classList.toggle('hidden', !loggedIn);
  navButtons.login.classList.toggle('hidden', loggedIn);
  navButtons.register.classList.toggle('hidden', loggedIn);
  
  // Show/hide voice nav button
  voiceNavBtn.classList.toggle('hidden', !loggedIn);
}

/**
 * Hides all pages and shows the one with the specified name.
 * @param {string} name - The key of the page to show.
 */
function showPage(name) {
  if (!pages[name]) {
    console.error(`Page "${name}" not found.`);
    return;
  }
  
  // Stop any currently playing media
  stopCurrentAudio();
  
  activePage = name;
  Object.keys(pages).forEach((k) => pages[k].classList.add('hidden'));
  pages[name].classList.remove('hidden');
  pages[name].setAttribute('tabindex', '-1');
  pages[name].focus();
  
  updateNavUI();
  
  // Clear old results
  if (name !== 'upload' && name !== 'history') {
    clearResults();
  }
  
  // Load history if navigating to that page
  if (name === 'history' && isLoggedIn()) {
      loadHistory();
  }
  
  playBeep(600, 150);
  
  // Speak in English
  const navHint = " Say 'help' for commands.";
  let pageTitle = `${name.charAt(0).toUpperCase() + name.slice(1)} page.`;
  if (name === 'project') pageTitle = 'About page.';
  
  speak(pageTitle + navHint);
}


// --- VOICE COMMANDS & TRANSLATIONS ---

/**
 * Speaks the help message in English.
 * --- UPDATED: Now page-aware ---
 */
function speakHelpMessage() {
  const loggedIn = isLoggedIn();
  let helpText = [
      "Global commands are:",
      "'Read page', 'Help', and 'Switch theme'."
  ];
  
  if (loggedIn) {
    helpText.push("'Go to home', 'go to upload', 'go to about', 'go to history', or 'logout'.");
  } else {
    helpText.push("'Go to login' or 'go to register'.");
  }

  // --- NEW: Page-specific help ---
  helpText.push("For the current page:");
  switch (activePage) {
    case 'login':
      helpText.push("You can say: 'fill username', 'fill password', or 'submit'.");
      break;
    case 'register':
      helpText.push("You can say: 'fill username', 'fill password', 'fill confirm password', or 'submit'.");
      break;
    case 'upload':
      helpText.push("You can say: 'choose file', 'upload and detect', or 'try demo'.");
      break;
    default:
      helpText.push("There are no special commands for this page.");
      break;
  }
  // --- END NEW ---

  speak(helpText.join(' '));
}

/**
 * Handles the main voice command logic.
 * @param {string} command - The transcribed command.
 */
function handleVoiceCommand(command) {
  console.log("DEBUG: Voice command heard ->", command);
  if (!command) { return; }

  const c = command.toLowerCase();
  
  // All keywords are now English-only
  if (c.includes('help')) { speakHelpMessage(); return; }
  if (c.includes('read page')) { readCurrentPageElements(); return; }
  if (c.includes('logout') && isLoggedIn()) { navButtons.logout.click(); return; }

  // theme toggle via voice: 'theme', 'dark mode', 'classic', etc.
  if (c.includes('theme') || c.includes('dark mode') || c.includes('classic mode')) {
    toggleTheme();
    return;
  }

  if (c.startsWith('go to') || c.startsWith('navigate')) {
    let pageNameFound = null;
    if (c.includes('home')) pageNameFound = 'home';
    else if (c.includes('about') || c.includes('project')) pageNameFound = 'project';
    else if (c.includes('upload')) pageNameFound = 'upload';
    else if (c.includes('history')) pageNameFound = 'history';
    else if (c.includes('login')) pageNameFound = 'login';
    else if (c.includes('register')) pageNameFound = 'register';
        
    console.log("DEBUG: Page found in command ->", pageNameFound);
    if (pageNameFound) {
      const isAuthPage = pageNameFound === 'login' || pageNameFound === 'register';
      if (isLoggedIn() && !isAuthPage) {
        speak(`Navigating to ${pageNameFound}.`);
        showPage(pageNameFound);
      } else if (!isLoggedIn() && isAuthPage) {
        speak(`Navigating to ${pageNameFound}.`);
        showPage(pageNameFound);
      } else if (isLoggedIn() && isAuthPage) {
        speak("You are already logged in.");
      } else {
        speak("You must be logged in to access that page.");
      }
    } else {
      speak("Sorry, I could not find a valid page in that command.");
    }
    return;
  }

  // Page-specific commands
  let commandHandled = false;
  
  switch (activePage) {
    case 'login':
      if (c.includes('username')) { commandHandled = true; triggerMicFor('login-username'); }
      else if (c.includes('password')) { commandHandled = true; triggerMicFor('login-password'); }
      else if (c.includes('register')) { commandHandled = true; document.getElementById('to-register').click(); }
      else if (c.includes('login') || c.includes('log in')) { commandHandled = true; document.querySelector('#login-form button[type="submit"]').click(); }
      break;
    case 'register':
      if (c.includes('username')) { commandHandled = true; triggerMicFor('reg-username'); }
      else if (c.includes('confirm')) { commandHandled = true; triggerMicFor('reg-confirm-password'); }
      else if (c.includes('password')) { commandHandled = true; triggerMicFor('reg-password'); }
      else if (c.includes('login')) { commandHandled = true; document.getElementById('to-login').click(); }
      else if (c.includes('create account')) { commandHandled = true; document.querySelector('#register-form button[type="submit"]').click(); }
      break;
    case 'upload':
      // --- NEW COMMANDS ---
      if (c.includes('choose file') || c.includes('select file')) {
        commandHandled = true;
        document.getElementById('video-input').click();
      }
      // --- UPDATED COMMAND ---
      else if (c.includes('upload and detect')) {
        commandHandled = true;
        document.getElementById('upload-btn').click();
      }
      else if (c.includes('demo')) {
        commandHandled = true;
        document.getElementById('demo-btn').click();
      }
      break;
  }
  if (!commandHandled) {
    speak("Sorry, that command was not recognized.");
  }
}

/**
 * Starts the main voice navigation listener.
 */
function startVoiceNavigation() {
  console.log("Starting voice navigation listener...");
  speak("Listening.", {}, () => {
    playBeep(880, 200, () => listenOnce(handleVoiceCommand));
  });
}

/**
 * Triggers the microphone for a specific form field.
 * @param {string} fieldId - The ID of the input field.
 */
function triggerMicFor(fieldId) {
  const micBtn = document.querySelector(`button[data-target="${fieldId}"]`);
  const input = document.getElementById(fieldId);
  if (!input) return;

  let label = document.querySelector(`label[for="${fieldId}"]`);
  let fieldName = label ? label.textContent : "this field";

  speak(`Please say the value for ${fieldName}`, {}, () => {
    playBeep(880, 200, () => {
      listenOnce((text) => {
        if (!text) {
          speak("I did not hear anything.");
          return;
        }

        // --- THIS IS THE FIX ---
        // If the text ends with a period, remove it.
        if (text.endsWith(".")) {
          text = text.substring(0, text.length - 1);
        }
        // --- END FIX ---

        if (input.type === "password" || input.type === "email") {
          text = text.replace(/\s/g, ""); // Remove spaces
        }
        input.value = text;
        speak("The value has been set.");
        input.focus();
      });
    });
  });
}

/**
 * Reads all interactive elements on the current page.
 */
function readCurrentPageElements() {
  const activePageElement = pages[activePage];
  if (!activePageElement) return;
  const interactables = activePageElement.querySelectorAll('button:not([aria-hidden="true"]):not(:disabled), a, input[type="text"], input[type="password"], input[type="file"], select');
  if (interactables.length === 0) { speak("There are no interactive elements on this page."); return; }
  
  let announcements = [`On this page, you have ${interactables.length} items:`];
  interactables.forEach((el) => {
    let text = el.getAttribute('aria-label') || el.title || el.textContent || el.name;
    let label = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
    if (label) text = label.textContent;
    
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      announcements.push(`A form field for ${text}.`);
    } else { announcements.push(`A button for ${text}.`); }
  });
  speak(announcements.join(' '));
}

/**
 * Binds click events to all microphone buttons.
 */
function bindMicButtons() {
  document.querySelectorAll('.mic-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      
      let label = document.querySelector(`label[for="${targetId}"]`);
      let fieldName = label ? label.textContent : 'this field';
      
      speak(`Please say the value for ${fieldName}`, {}, () => {
        playBeep(880, 200, () => {
          listenOnce((text) => {
            if (!text) { speak('I did not hear anything.'); return; }
            if (input.type === 'password') text = text.replace(/\s/g, '');
            input.value = text;
            speak('The value has been set.');
            input.focus();
          });
        });
      });
    });
  });
}

// --- UPLOAD & RESULTS LOGIC ---

/**
 * Stops the currently playing audio, if any.
 */
function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = ''; // Detach source
        currentAudio = null;
    }
}

/**
 * Clears the results and players from the upload page.
 */
function clearResults() {
    document.getElementById('detection-results').innerHTML = '';
    document.getElementById('video-player-container').innerHTML = '';
    document.getElementById('audio-player-container').innerHTML = '';
}

/**
 * Creates and plays the audio/video results.
 * @param {string} job_id - The ID of the processing job.
 * @param {string} announcement - The text to speak.
 */
function playAudioFeedback(job_id, announcement) {
    stopCurrentAudio(); // Stop any previous media
    clearResults();

    const videoContainer = document.getElementById('video-player-container');
    const audioContainer = document.getElementById('audio-player-container');
    
    // --- Create Video Player ---
    const videoUrl = `${API_URL}/results/${job_id}/final_video.mp4`;
    videoContainer.innerHTML = `
        <h3 class="text-lg font-bold text-teal-700 mb-2">Processed Video</h3>
        <video controls muted playsinline class="w-full rounded-lg shadow-md bg-gray-100" src="${videoUrl}" aria-label="Processed video with object detections">
            Your browser does not support the video tag.
        </video>
    `;

    // --- Create Audio Player ---
    const audioUrl = `${API_URL}/results/${job_id}/final_audio.mp3`;
    audioContainer.innerHTML = `
        <h3 class="text-lg font-bold text-teal-700 mb-2">Audio Description</h3>
        <audio controls class="w-full" src="${audioUrl}" aria-label="Audio description of detections">
            Your browser does not support the audio tag.
        </audio>
    `;
    
    const audio = audioContainer.querySelector('audio');
    currentAudio = audio; // Store reference

    // --- FIX: Play audio only AFTER announcement ---
    speak(announcement, {}, () => {
        // This callback runs after 'speak' is finished
        if (currentAudio) {
            currentAudio.play().catch(e => console.warn("Audio play failed:", e));
        }
    });
}

/**
 * Handles the video upload process.
 */
async function handleVideoUpload() {
  const videoInput = document.getElementById('video-input');
  const resultsDiv = document.getElementById('detection-results');
  
  if (videoInput.files.length === 0) {
    speak("Please select a video file first.");
    return;
  }
  
  const file = videoInput.files[0];
  const token = localStorage.getItem('authToken');
  const formData = new FormData();
  formData.append('video', file);
  
  speak("Uploading and processing... This may take a moment.");
  resultsDiv.textContent = 'Uploading and processing... This may take a moment.';

  try {
    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      handleAuthError(data);
      speak(data.message || "Upload failed.");
      resultsDiv.textContent = `Error: ${data.message || 'Unknown error'}`;
      return;
    }
    
    // Success
    resultsDiv.textContent = ''; // Clear processing message
    
    // --- THIS IS THE FIX ---
    // Check if we are still on the upload page before playing
    if (activePage === 'upload') {
        playAudioFeedback(data.job_id, "Processing complete. Playing results.");
    } else {
        // If the user navigated away, just log to console.
        console.log("Upload finished, but user has navigated away. Results are in History.");
    }

  } catch (error) {
    console.error('Upload failed:', error);
    speak("Upload failed.");
    resultsDiv.textContent = 'Upload failed. Could not connect to the server.';
  }
}

/**
 * Plays the demo audio.
 */
function playDemo() {
    stopCurrentAudio();
    clearResults();
    
    // --- NEW SIMPLE LOGIC ---
    const resultsDiv = document.getElementById('detection-results');
    resultsDiv.textContent = 'This is a demo. Playing a sample alert...';
    
    // Speak a sample alert instead of playing a file
    speak("Demo alert: Warning, car right in front of you. Red light detected, do not cross.", {}, () => {
        // After speaking, clear the message
        setTimeout(() => {
            if (activePage === 'upload') { // Only clear if still on the page
                resultsDiv.textContent = '';
            }
        }, 3000); // Clear after 3 seconds
    });
}

// --- HISTORY LOGIC ---

function handleAuthError(data) {
  if (!data || !data.message) return;
  const msg = data.message.toLowerCase();
  if (msg.includes('token')) {
    // invalid or expired token, clear session and prompt login
    speak('Your session has expired or is invalid. Please log in again.');
    logoutUser();
    updateNavUI();
    showPage('login');
  }
}

/**
 * Fetches and displays the user's upload history.
 */
async function loadHistory() {
    const historyList = document.getElementById('history-list');
    const token = localStorage.getItem('authToken');
    historyList.innerHTML = '<li>Loading history...</li>';

    try {
        const response = await fetch(`${API_URL}/history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            const data = await response.json();
            handleAuthError(data);
            throw new Error(data.message || 'Failed to fetch history');
        }
        
        const historyItems = await response.json();
        
        if (historyItems.length === 0) {
            historyList.innerHTML = `<li>Your history is empty.</li>`;
            speak('Your history is empty.');
            return;
        }
        
        historyList.innerHTML = ''; // Clear loading message
        historyItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center';
            
            const textDiv = document.createElement('div');
            const fileName = document.createElement('span');
            fileName.className = 'font-bold text-teal-800';
            fileName.textContent = item.originalName;
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'block text-sm text-gray-600';
            dateSpan.textContent = new Date(item.timestamp).toLocaleString();
            
            textDiv.appendChild(fileName);
            textDiv.appendChild(dateSpan);
            
            const playButton = document.createElement('button');
            playButton.className = 'bg-teal-600 text-white py-2 px-4 rounded-full font-bold hover:bg-teal-700 transition-all';
            playButton.textContent = 'Play Audio';
            playButton.setAttribute('aria-label', `Play results for ${item.originalName}`);
            playButton.onclick = () => {
                speak(`Loading and playing results for ${item.originalName}`);
                showPage('upload');
                // Pass the announcement to be spoken *before* playing
                playAudioFeedback(item.job_id, "Processing complete. Playing results.");
            };
            
            li.appendChild(textDiv);
            li.appendChild(playButton);
            historyList.appendChild(li);
        });
        speak("History loaded.");

    } catch (error) {
        console.error('History load failed:', error);
        historyList.innerHTML = `<li>Could not load history.</li>`;
        speak("Could not load history.");
    }
}


// --- INITIALIZATION ---

window.addEventListener('load', () => {
  // apply previously selected theme (or default)
  const savedTheme = localStorage.getItem('theme') || 'classic';
  applyTheme(savedTheme);

  bindMicButtons();

  // theme toggle button
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // --- Form Listeners ---
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = e.target.username.value.trim();
    const pass = e.target.password.value;
    if (await handleLogin(user, pass)) {
      setTimeout(() => showPage('home'), 1000);
    }
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = e.target.username.value.trim();
    const pass = e.target.password.value;
    const confirm = e.target['confirm-password'].value;
    const lang = e.target.language.value; // Get language
    
    if (pass !== confirm) { speak('Passwords do not match.'); return; }
    
    if (await handleRegistration(user, pass, lang)) { // Send language
      setTimeout(() => showPage('login'), 1500);
    }
  });

  // --- Navigation Listeners ---
  document.getElementById('to-register').addEventListener('click', () => showPage('register'));
  document.getElementById('to-login').addEventListener('click', () => showPage('login'));
  
  Object.keys(navButtons).forEach(key => {
    const button = navButtons[key];
    if (!button) return; 

    if (key === 'logout') {
      button.addEventListener('click', () => {
        logoutUser();
        showPage('login');
      });
    } else {
      button.addEventListener('click', () => showPage(key));
    }
  });

  logoLink.addEventListener('click', () => {
    if (isLoggedIn()) showPage('home');
    else showPage('login');
  });

  // --- Voice & Upload Listeners ---
  voiceNavBtn.addEventListener('click', startVoiceNavigation);
  
  document.getElementById('upload-btn').addEventListener('click', handleVideoUpload);
  document.getElementById('demo-btn').addEventListener('click', playDemo);
  
  document.body.addEventListener('keydown', (e) => {
    // --- THIS IS THE FIX ---
    // Allow 'V' and 'R' keys even when logged out
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key.toLowerCase() === 'v') startVoiceNavigation();
    if (e.key.toLowerCase() === 'r') readCurrentPageElements();
    if (e.key.toLowerCase() === 't') toggleTheme();
  });
  
  // --- Initial Page Load ---
  if (isLoggedIn()) {
    // Manually set stored lang/name for this session
    const lang = localStorage.getItem('userLang');
    const user = localStorage.getItem('username');
    if(lang && user) {
        speak(`Welcome back, ${user}.`);
    } else {
        // Fallback if local storage is weird
        speak("Welcome back.");
    }
    showPage('home');
  } else {
    updateNavUI(); // Hide buttons
    showPage('login');
  }
});

  