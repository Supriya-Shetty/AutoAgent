/**
 * AutoAgent - Frontend JavaScript
 * Optimized for Composio Tool Router and App Management
 */

// ========================================
// Configuration
// ========================================

const CONFIG = {
  CHAT_ENDPOINT: "/chat",
};

// ========================================
// Icons (Lucide SVG)
// ========================================

const ICONS = {
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  bot: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  send: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 19V5"/></svg>`,
  loader: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
  tool: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
};

// ========================================
// State
// ========================================

const state = {
  sessionId: localStorage.getItem("autoagent_session_id") || null,
  isStreaming: false,
  messages: [],
  sidebarOpen: true,
  auth: null,
  updateTimeout: null,
  allApps: [],
  activeView: 'chat'
};

// ========================================
// DOM Elements
// ========================================

const elements = {
  // Views
  chatView: document.getElementById("chatView"),
  appsView: document.getElementById("appsView"),
  appDetailView: document.getElementById("appDetailView"),
  
  // Containers
  messagesContainer: document.getElementById("messagesContainer"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  sessionsList: document.getElementById("sessionsList"),
  appsGrid: document.getElementById("appsGrid"),
  appDetailContainer: document.getElementById("appDetailContainer"),
  
  // Forms & Inputs
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  appSearchInput: document.getElementById("appSearchInput"),
  
  // Buttons
  sendBtn: document.getElementById("sendBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  appsBtn: document.getElementById("appsBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),
  backToAppsBtn: document.getElementById("backToAppsBtn"),
  
  // Sidebar
  sidebar: document.getElementById("sidebar"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  appsSidebarToggleBtn: document.getElementById("appsSidebarToggleBtn"),
  sidebarCloseBtn: document.getElementById("sidebarCloseBtn"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  
  // User
  welcomeUserName: document.getElementById("welcomeUserName")
};

// ========================================
// Initialization
// ========================================

async function initFirebase() {
  try {
    const response = await fetch("/firebase-config");
    const firebaseConfig = await response.json();

    if (!firebaseConfig.apiKey) throw new Error("Firebase configuration not found.");

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "/login";
      } else {
        if (elements.welcomeUserName) {
          elements.welcomeUserName.textContent = user.displayName?.split(" ")[0] || user.email.split("@")[0];
        }
        
        const profilePic = document.getElementById("userProfilePic");
        if (profilePic && user.photoURL) {
            profilePic.src = user.photoURL;
        }

        if (state.sessionId) await loadHistory(state.sessionId);
        await fetchSessions();
        if (state.activeView === 'apps') loadApps();
      }
    });

    return auth;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    if (window.location.pathname !== "/login") window.location.href = "/login";
  }
}

// ========================================
// Markdown Rendering
// ========================================

const renderer = new marked.Renderer();
renderer.link = function (href, title, text) {
  if (typeof href === "object") {
    const token = href;
    href = token.href || "";
    title = token.title || "";
    text = token.text || "";
  }
  const isAuth = text.toLowerCase().includes("connect") || href.includes("composio.dev/link") || href.includes("auth");
  const className = isAuth ? "auth-button" : "";
  const titleAttr = title ? ` title="${title}"` : "";
  let displayText = text || (href.includes("gmail") ? "Connect to Gmail" : href.includes("outlook") ? "Connect to Outlook" : "Open Link");
  
  displayText = displayText.replace(/\*\*/g, "").replace(/\[|\]/g, "").trim();

  if (isAuth) {
    return `<div style="margin: 16px 0;"><a href="${href}"${titleAttr} class="${className}" target="_blank" rel="noopener noreferrer">${displayText}</a></div>`;
  }
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${displayText}</a>`;
};

marked.setOptions({ breaks: true, gfm: true, renderer: renderer });

function parseMarkdown(text) {
  try {
    if (!text) return "";
    
    // Normalize newlines
    let normalized = text.replace(/\r\n|\r/g, "\n");
    
    // Fix squashed markdown: add double newline before numbered lists if preceded by a letter/punctuation/asterisk/colon
    normalized = normalized.replace(/([a-zA-Z\.!?:*])(\n*)(\d+\.\s+[A-Za-z*])/g, '$1\n\n$3');
    
    // Fix squashed headers: add double newline before headers if preceded by a letter/punctuation/asterisk/colon
    normalized = normalized.replace(/([a-zA-Z\.!?:*])(\n*)(#{1,6}\s+)/g, '$1\n\n$3');

    // Fix squashed bold lists: add double newline before bold item if preceded by letter/punctuation/asterisk/colon
    normalized = normalized.replace(/([a-zA-Z\.!?:]|\*\*)(\s*)(\*\*\d+\.\s+[A-Za-z*])/g, '$1\n\n$3');
    
    // Remove arbitrary single newlines in paragraphs that break rendering
    normalized = normalized.replace(/(?<!\n)\n(?!\n)(?!-|\*|#|>|\d+\.)/g, ' ');

    // Surgical fix for common split words
    const commonWords = [["G mail", "Gmail"], ["O utlook", "Outlook"], ["connec t", "connect"], ["e mail", "email"]];
    commonWords.forEach(([bad, good]) => {
      normalized = normalized.replace(new RegExp(bad, "gi"), good);
    });
    
    return marked.parse(normalized);
  } catch (e) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }
}

// ========================================
// View Management
// ========================================

function switchView(viewName) {
  state.activeView = viewName;
  
  // Update UI classes
  elements.newChatBtn.classList.toggle('active', viewName === 'chat');
  elements.appsBtn.classList.toggle('active', viewName === 'apps' || viewName === 'appDetail');
  
  elements.chatView.classList.toggle('active', viewName === 'chat');
  elements.appsView.classList.toggle('active', viewName === 'apps');
  elements.appDetailView.classList.toggle('active', viewName === 'appDetail');

  if (viewName === 'apps') loadApps();
  if (window.innerWidth <= 768) closeSidebar();
}

// ========================================
// App Management
// ========================================

async function loadApps() {
  const user = state.auth.currentUser;
  if (!user) return;

  elements.appsGrid.innerHTML = `
    <div class="loading-apps" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; gap: 1rem; color: var(--text-muted);">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bulb-spinner"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
      <span>Loading apps from Composio...</span>
    </div>`;

  try {
    const token = await user.getIdToken();
    const response = await fetch("/toolkits", {
      headers: { Authorization: `Bearer ${token}` },
    });
    state.allApps = await response.json();
    renderApps(state.allApps);
  } catch (error) {
    console.error("Error loading apps:", error);
    elements.appsGrid.innerHTML = `<div class="loading-apps">Failed to load apps. Please check your connection.</div>`;
  }
}

function renderApps(apps) {
  if (apps.length === 0) {
    elements.appsGrid.innerHTML = `<div class="loading-apps">No apps found matching your criteria.</div>`;
    return;
  }

  elements.appsGrid.innerHTML = apps.map(app => {
    let authBadge = '';
    if (app.auth_type === 'OAUTH2') authBadge = '<span class="auth-badge oauth">OAuth</span>';
    else if (app.auth_type === 'API_KEY') authBadge = '<span class="auth-badge apikey">API Key</span>';
    else if (app.auth_type === 'NO_AUTH') authBadge = '<span class="auth-badge noauth">Free</span>';
    else if (app.auth_type && app.auth_type !== 'UNKNOWN') authBadge = `<span class="auth-badge apikey">${app.auth_type}</span>`;
    
    return `
    <div class="app-card" onclick="showAppDetails('${app.slug}')">
        <div class="app-card-header">
            <img src="${app.logo || 'https://via.placeholder.com/40'}" alt="${app.name}" class="app-logo" onerror="this.src='https://via.placeholder.com/40?text=App'">
            <div class="app-info">
                <div class="app-name">${app.name}</div>
                <div>
                    <span class="app-status ${app.is_connected ? 'status-connected' : 'status-disconnected'}">
                        ${app.is_connected ? 'Connected' : 'Disconnected'}
                    </span>
                    ${authBadge}
                </div>
            </div>
        </div>
        <div class="app-description">${app.description || 'Access ' + app.name + ' tools and automation.'}</div>
        <div class="app-card-footer">
            ${app.categories.slice(0, 2).map(cat => `<span class="app-category">${cat}</span>`).join('')}
        </div>
    </div>
  `}).join("");
}

window.showAppDetails = async (slug) => {
  const app = state.allApps.find(a => a.slug === slug);
  if (!app) return;

  elements.appDetailContainer.innerHTML = `
    <div class="app-detail-wrapper" style="min-height: 50vh; display: flex; align-items: center; justify-content: center;">
        <div class="loading-apps" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; color: var(--text-muted);">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bulb-spinner"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
            <span>Loading app details...</span>
        </div>
    </div>
  `;
  switchView('appDetail');

  try {
    const user = state.auth.currentUser;
    const token = await user.getIdToken();
    const response = await fetch(`/toolkits/${slug}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const detailedApp = await response.json();

    let authBadge = '';
    if (detailedApp.auth_type === 'OAUTH2') authBadge = '<span class="auth-hero-badge oauth">OAuth</span>';
    else if (detailedApp.auth_type === 'API_KEY') authBadge = '<span class="auth-hero-badge apikey">API Key</span>';
    else if (detailedApp.auth_type === 'NO_AUTH') authBadge = '<span class="auth-hero-badge noauth">Free</span>';
    else if (detailedApp.auth_type && detailedApp.auth_type !== 'UNKNOWN') authBadge = `<span class="auth-hero-badge apikey">${detailedApp.auth_type}</span>`;

    let toolsHtml = '';
    if (detailedApp.tools && detailedApp.tools.length > 0) {
        toolsHtml = `
            <div class="app-tools-section" style="margin-bottom: 48px;">
                <h3 class="app-section-title">Tools <span class="count">${detailedApp.tools.length}</span></h3>
                <div class="tool-grid">
                    ${detailedApp.tools.map(t => `
                        <div class="tool-card">
                            <div class="tool-name">${t.name}</div>
                            <div class="tool-desc">${t.description}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let triggersHtml = '';
    if (detailedApp.triggers && detailedApp.triggers.length > 0) {
        triggersHtml = `
            <div class="app-tools-section" style="margin-bottom: 48px;">
                <h3 class="app-section-title">Triggers <span class="count">${detailedApp.triggers.length}</span></h3>
                <div class="tool-grid">
                    ${detailedApp.triggers.map(t => `
                        <div class="tool-card">
                            <div class="tool-name">${t.name}</div>
                            <div class="tool-desc">${t.description}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    elements.appDetailContainer.innerHTML = `
      <div class="app-detail-wrapper" style="animation: fadeIn 0.4s ease;">
          <div class="app-hero">
              <img src="${detailedApp.logo || 'https://via.placeholder.com/96'}" alt="${detailedApp.name}" class="app-hero-logo" onerror="this.src='https://via.placeholder.com/96?text=App'">
              <div class="app-hero-info">
                  <div class="app-hero-title-row">
                      <h2 class="app-hero-title">${detailedApp.name}</h2>
                      <span class="app-status ${detailedApp.is_connected ? 'status-connected' : 'status-disconnected'}">
                          ${detailedApp.is_connected ? 'Connected' : 'Disconnected'}
                      </span>
                  </div>
                  <div class="app-hero-meta">
                      ${authBadge}
                      ${detailedApp.categories && detailedApp.categories.length ? `<span class="app-hero-category">${detailedApp.categories[0]}</span>` : ''}
                  </div>
                  <p class="app-hero-desc">${detailedApp.description || 'Integrate ' + detailedApp.name + ' with AutoAgent to automate your workflows.'}</p>
                  
                  <div class="app-hero-actions">
                      ${detailedApp.is_connected 
                        ? `<button class="detail-btn btn-danger" onclick="disconnectApp('${detailedApp.slug}')">Disconnect</button>` 
                        : `<button class="detail-btn btn-primary" onclick="connectApp('${detailedApp.slug}')">Connect Account</button>`
                      }
                  </div>
              </div>
          </div>
          
          <div class="app-features-wrapper">
            ${triggersHtml}
            ${toolsHtml}
          </div>
      </div>
    `;
  } catch (error) {
    elements.appDetailContainer.innerHTML = `
      <div class="app-detail-wrapper" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 40vh; gap: 16px;">
          <div style="color: var(--text-muted);">Failed to load details.</div>
          <button class="detail-btn btn-secondary" onclick="switchView('apps')">Back to Library</button>
      </div>
    `;
  }
};

window.connectApp = async (slug) => {
  const user = state.auth.currentUser;
  const token = await user.getIdToken();
  const btn = document.querySelector(".btn-primary");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Generating Link...";
  }

  try {
    const response = await fetch(`/toolkits/${slug}/connect`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (data.redirectUrl) {
      window.open(data.redirectUrl, "_blank");
      switchView('apps');
      
      const pollInterval = 3000;
      const maxDuration = 5 * 60 * 1000;
      const startTime = Date.now();
      
      const pollTimer = setInterval(async () => {
        if (Date.now() - startTime > maxDuration) {
          clearInterval(pollTimer);
          return;
        }
        try {
          const freshToken = await state.auth.currentUser.getIdToken();
          const res = await fetch(`/toolkits/${slug}`, {
            headers: { Authorization: `Bearer ${freshToken}` }
          });
          if (res.ok) {
            const tkData = await res.json();
            if (tkData.is_connected) {
              clearInterval(pollTimer);
              loadApps();
              if (state.activeView === 'appDetail' && elements.appDetailContent.innerHTML.includes(slug)) {
                window.showAppDetails(slug);
              }
            }
          }
        } catch (e) {
          console.error("Polling error", e);
        }
      }, pollInterval);
    }
  } catch (error) {
    alert("Connection failed. Please try again.");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Connect Account";
    }
  }
};

window.disconnectApp = async (slug) => {
  if (!confirm(`Are you sure you want to disconnect ${slug}?`)) return;
  const user = state.auth.currentUser;
  const token = await user.getIdToken();
  try {
    await fetch(`/toolkits/${slug}/disconnect`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    switchView('apps');
  } catch (error) {
    alert("Failed to disconnect.");
  }
};

// ========================================
// Sidebar & Navigation
// ========================================

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  updateSidebarState();
}

function closeSidebar() {
  state.sidebarOpen = false;
  updateSidebarState();
}

function updateSidebarState() {
  elements.sidebar.classList.toggle("collapsed", !state.sidebarOpen);
  elements.sidebarOverlay.classList.toggle("visible", state.sidebarOpen && window.innerWidth <= 768);
}

// ========================================
// Chat Functions
// ========================================

function generateId() { return "msg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9); }
function escapeHtml(text) { const div = document.createElement("div"); div.textContent = text; return div.innerHTML; }
function scrollToBottom() { elements.messagesContainer.scrollTo({ top: elements.messagesContainer.scrollHeight, behavior: "smooth" }); }

function clearChat() {
  state.messages = [];
  state.sessionId = null;
  localStorage.removeItem("autoagent_session_id");
  const messages = elements.messagesContainer.querySelectorAll(".message");
  messages.forEach((msg) => msg.remove());
  if (elements.welcomeScreen) elements.welcomeScreen.classList.remove("hidden");
  if (elements.chatView) elements.chatView.classList.remove("chat-started");
  switchView('chat');
  fetchSessions();
}

function createUserMessage(text) {
  return `<div class="message user"><div class="message-content">${escapeHtml(text)}</div></div>`;
}

function createAssistantMessage(id) {
  return `
    <div class="message assistant" id="${id}">
      <div class="assistant-header">
        <div class="message-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
        </div>
        <span class="assistant-name" style="font-family: var(--font-serif); font-size: 20px;">AutoAgent</span>
        <span class="badge">Lite</span>
      </div>
      <div class="message-content">
        <div class="message-text">
          <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
        <div class="tool-calls-container"></div>
        <div class="message-actions hidden">
          <button class="action-btn copy-btn" title="Copy text" onclick="copyMessage('${id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
          <button class="action-btn download-btn" title="Download as PDF" onclick="downloadMessagePDF('${id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>Download</span>
          </button>
        </div>
      </div>
    </div>`;
}

function addMessage(html) {
  if (elements.welcomeScreen) elements.welcomeScreen.classList.add("hidden");
  if (elements.chatView) elements.chatView.classList.add("chat-started");
  elements.messagesContainer.insertAdjacentHTML("beforeend", html);
  scrollToBottom();
}

function formatToolName(name) {
  const clean = name.replace("COMPOSIO_", "").replace(/_/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

function updateAssistantMessage(messageId, content, toolCalls = [], isFinal = false) {
  const messageEl = document.getElementById(messageId);
  if (!messageEl) return;
  const textEl = messageEl.querySelector(".message-text");
  const toolsEl = messageEl.querySelector(".tool-calls-container");
  const actionsEl = messageEl.querySelector(".message-actions");
  
  if (textEl) {
    if (content) {
      textEl.innerHTML = parseMarkdown(content.trim());
      // Store the raw text on the DOM element for easy copying
      textEl.dataset.raw = content.trim();
      
      if (isFinal) {
        textEl.querySelectorAll("pre code").forEach(block => hljs.highlightElement(block));
        if (actionsEl) {
          actionsEl.classList.remove("hidden");
        }
      }
    } else {
      textEl.innerHTML = content === "" && toolCalls.length > 0 ? "" : '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    }
  }

  if (toolsEl) {
    if (toolCalls.length > 0) {
      toolsEl.innerHTML = toolCalls.map(t => {
        if (t.status === "pending") {
           return `
            <div class="tool-call-pill loading">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon" style="color: var(--accent);"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <span>${formatToolName(t.name)}</span>
            </div>
          `;
        }
        return `
          <div class="tool-call-pill completed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #10b981;"><polyline points="20 6 9 17 4 12"/></svg>
            <span>${formatToolName(t.name)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5; margin-left: 4px;"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
        `;
      }).join('');
    } else {
      toolsEl.innerHTML = '';
    }
  }

  scrollToBottom();
}

async function sendMessage(text) {
  if (state.isStreaming || !text.trim()) return;
  state.isStreaming = true;
  updateUIState();
  addMessage(createUserMessage(text));
  const assistantId = generateId();
  addMessage(createAssistantMessage(assistantId));

  let fullResponse = "";
  let toolCalls = [];
  try {
    const user = state.auth.currentUser;
    const token = await user.getIdToken();
    const response = await fetch(CONFIG.CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, session_id: state.sessionId }),
    });

    const newSessionId = response.headers.get("X-Session-Id");
    if (newSessionId && state.sessionId !== newSessionId) {
      state.sessionId = newSessionId;
      localStorage.setItem("autoagent_session_id", newSessionId);
      fetchSessions();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "message";
    let eventData = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (let line of lines) {
        line = line.replace(/\r$/, "");
        
        if (line.startsWith("event:")) {
          currentEvent = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          eventData.push(line.substring(5).replace(/^ /, ""));
        } else if (line === "") {
          if (eventData.length > 0) {
            const dataStr = eventData.join("\n");
            
            if (currentEvent === "message") {
              if (toolCalls.length > 0 && toolCalls[toolCalls.length - 1].status === "pending") {
                toolCalls[toolCalls.length - 1].status = "completed";
              }
              fullResponse += dataStr;
              updateAssistantMessage(assistantId, fullResponse, toolCalls, false);
            } else if (currentEvent === "tool_call") {
              if (toolCalls.length > 0 && toolCalls[toolCalls.length - 1].status === "pending") {
                toolCalls[toolCalls.length - 1].status = "completed";
              }
              toolCalls.push({ name: dataStr, status: "pending" });
              updateAssistantMessage(assistantId, fullResponse, toolCalls, false);
            } else if (currentEvent === "error") {
              fullResponse += "\n\n**Error:** " + dataStr;
              updateAssistantMessage(assistantId, fullResponse, toolCalls, false);
            }
            eventData = [];
          }
          currentEvent = "message";
        }
      }
    }
    
    // Mark all remaining tool calls as completed when stream ends
    toolCalls.forEach(t => t.status = "completed");
    updateAssistantMessage(assistantId, fullResponse, toolCalls, true);
    state.messages.push({ role: "user", content: text }, { role: "assistant", content: fullResponse });
  } catch (error) {
    updateAssistantMessage(assistantId, "**Error:** " + error.message, toolCalls, true);
  } finally {
    state.isStreaming = false;
    updateUIState();
  }
}

function updateUIState() {
  elements.sendBtn.disabled = state.isStreaming || !elements.messageInput.value.trim();
  elements.sendBtn.innerHTML = state.isStreaming ? ICONS.loader : ICONS.send;
  elements.sendBtn.style.animation = state.isStreaming ? "spin 1s linear infinite" : "";
}

// ========================================
// Message Actions (Copy / PDF)
// ========================================

window.copyMessage = function(id) {
  const msgEl = document.getElementById(id);
  if (!msgEl) return;
  const textEl = msgEl.querySelector(".message-text");
  if (textEl && textEl.dataset.raw) {
    navigator.clipboard.writeText(textEl.dataset.raw).then(() => {
      const btn = msgEl.querySelector(".copy-btn");
      const originalHTML = btn.innerHTML;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Copied</span>`;
      btn.style.color = "#10b981";
      btn.style.borderColor = "#10b981";
      setTimeout(() => {
        btn.innerHTML = originalHTML;
        btn.style.color = "";
        btn.style.borderColor = "";
      }, 2000);
    });
  }
};

window.downloadMessagePDF = function(id) {
  const msgEl = document.getElementById(id);
  if (!msgEl) return;
  
  const textEl = msgEl.querySelector(".message-text");
  if (!textEl || !textEl.dataset.raw) return;
  
  const btn = msgEl.querySelector(".download-btn");
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Downloading...</span>`;
  
  const rawMarkdown = textEl.dataset.raw;
  const htmlContent = marked.parse(rawMarkdown);
  
  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  
  // Apply a clean, light-mode style suitable for PDF print
  container.style.padding = '40px';
  container.style.color = '#000000';
  container.style.backgroundColor = '#ffffff';
  container.style.fontFamily = 'Arial, sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.6';
  container.style.width = '100%';
  
  // Standardize elements for print
  container.querySelectorAll('p').forEach(p => p.style.marginBottom = '16px');
  container.querySelectorAll('h1, h2, h3, h4, h5').forEach(h => { 
    h.style.marginTop = '24px'; 
    h.style.marginBottom = '12px'; 
    h.style.fontWeight = '600'; 
    h.style.color = '#000000';
  });
  container.querySelectorAll('li').forEach(li => li.style.marginBottom = '8px');
  
  container.querySelectorAll('pre').forEach(pre => {
    pre.style.backgroundColor = '#f3f4f6';
    pre.style.padding = '16px';
    pre.style.borderRadius = '8px';
    pre.style.overflowX = 'hidden';
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.border = '1px solid #e5e7eb';
  });
  
  container.querySelectorAll('code').forEach(code => {
    code.style.fontFamily = 'monospace';
    code.style.color = '#111827';
    if (!code.parentElement || code.parentElement.tagName.toLowerCase() !== 'pre') {
      code.style.backgroundColor = '#f3f4f6';
      code.style.padding = '2px 4px';
      code.style.borderRadius = '4px';
    }
  });

  container.querySelectorAll('a').forEach(a => {
    a.style.color = '#2563eb';
    a.style.textDecoration = 'none';
  });
  
  const opt = {
    margin:       0.5,
    filename:     `autoagent-message-${Date.now()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, backgroundColor: '#ffffff', windowWidth: 800 },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  
  html2pdf().set(opt).from(container).save().then(() => {
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Saved</span>`;
    btn.style.color = "#10b981";
    btn.style.borderColor = "#10b981";
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.color = "";
      btn.style.borderColor = "";
    }, 2000);
  });
};

// ========================================
// Sessions Management
// ========================================

const TASK_ICONS = [
  `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
  `<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>`,
  `<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>`,
  `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>`,
  `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`
];

function getTaskIcon(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TASK_ICONS[Math.abs(hash) % TASK_ICONS.length]}</svg>`;
}

async function fetchSessions() {
  const user = state.auth.currentUser;
  if (!user) return;
  const token = await user.getIdToken();
  const response = await fetch("/sessions", { headers: { Authorization: `Bearer ${token}` } });
  if (response.ok) renderSessions(await response.json());
}

function renderSessions(sessions) {
  elements.sessionsList.innerHTML = sessions.length === 0 ? '<div class="nav-item disabled">No recent chats</div>' : "";
  sessions.forEach(session => {
    const wrapper = document.createElement("div");
    wrapper.className = "session-wrapper";
    wrapper.innerHTML = `
      <button class="session-item ${state.sessionId === session.session_id ? 'active' : ''}">
        ${getTaskIcon(session.session_id)}
        <span>${escapeHtml(session.title || "Untitled Chat")}</span>
      </button>
      <button class="delete-session-btn" title="Delete Chat"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
    `;
    wrapper.querySelector('.session-item').onclick = () => {
      state.sessionId = session.session_id;
      localStorage.setItem("autoagent_session_id", session.session_id);
      loadHistory(session.session_id);
      switchView('chat');
    };
    wrapper.querySelector('.delete-session-btn').onclick = (e) => {
      e.stopPropagation();
      if (confirm("Delete this chat?")) deleteSession(session.session_id);
    };
    elements.sessionsList.appendChild(wrapper);
  });
}

async function deleteSession(id) {
  const token = await state.auth.currentUser.getIdToken();
  await fetch(`/sessions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (state.sessionId === id) clearChat(); else fetchSessions();
}

async function loadHistory(id) {
  const token = await state.auth.currentUser.getIdToken();
  const response = await fetch(`/sessions/${id}/history`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.ok) {
    const history = await response.json();
    const messages = elements.messagesContainer.querySelectorAll(".message");
    messages.forEach((msg) => msg.remove());
    if (elements.welcomeScreen) elements.welcomeScreen.classList.add("hidden");
    if (elements.chatView) elements.chatView.classList.add("chat-started");
    history.forEach(msg => {
      const mid = generateId();
      if (msg.role === 'user') addMessage(createUserMessage(msg.content));
      else { addMessage(createAssistantMessage(mid)); updateAssistantMessage(mid, msg.content, [], true); }
    });
    scrollToBottom();
  }
}

// ========================================
// Event Listeners
// ========================================

function initEventListeners() {
  elements.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const msg = elements.messageInput.value.trim();
    if (msg && !state.isStreaming) { elements.messageInput.value = ""; sendMessage(msg); }
  });

  elements.messageInput.addEventListener("keydown", (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const msg = elements.messageInput.value.trim();
      if (msg && !state.isStreaming) { 
        elements.messageInput.value = ""; 
        sendMessage(msg); 
      }
    }
  });

  elements.messageInput.addEventListener("input", updateUIState);
  elements.sidebarToggleBtn.addEventListener("click", toggleSidebar);
  elements.appsSidebarToggleBtn.addEventListener("click", toggleSidebar);
  elements.sidebarCloseBtn.addEventListener("click", closeSidebar);
  elements.sidebarOverlay.addEventListener("click", closeSidebar);
  elements.newChatBtn.addEventListener("click", clearChat);
  elements.appsBtn.addEventListener("click", () => switchView('apps'));
  if (elements.clearChatBtn) elements.clearChatBtn.addEventListener("click", clearChat);
  
  elements.backToAppsBtn.addEventListener("click", () => switchView('apps'));

  const profileMenuToggle = document.getElementById("profileMenuToggle");
  const profileDropdown = document.getElementById("profileDropdown");
  const logoutBtn = document.getElementById("logoutBtn");

  if (profileMenuToggle && profileDropdown) {
    profileMenuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle("hidden");
    });
    
    document.addEventListener("click", (e) => {
      if (!profileDropdown.contains(e.target) && !profileMenuToggle.contains(e.target)) {
        profileDropdown.classList.add("hidden");
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await state.auth.signOut();
        window.location.href = "/login";
      } catch (error) {
        console.error("Logout failed:", error);
      }
    });
  }

  // App Tabs Filtering
  let currentAppFilter = 'all';
  
  const filterAndRenderApps = () => {
    const query = elements.appSearchInput.value.toLowerCase();
    let filtered = state.allApps.filter(a => 
      a.name.toLowerCase().includes(query) || a.slug.toLowerCase().includes(query)
    );
    if (currentAppFilter === 'connected') {
        filtered = filtered.filter(a => a.is_connected);
    }
    renderApps(filtered);
  };

  document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
          document.querySelectorAll(".tab-btn").forEach(b => {
              b.classList.remove("active");
              b.style.background = "transparent";
              b.style.color = "var(--text-secondary)";
          });
          e.target.classList.add("active");
          e.target.style.background = "rgba(255, 255, 255, 0.1)";
          e.target.style.color = "var(--text-primary)";
          currentAppFilter = e.target.dataset.tab;
          filterAndRenderApps();
      });
  });
  
  elements.appSearchInput.addEventListener("input", filterAndRenderApps);
  
  document.querySelectorAll(".suggestion-card").forEach(card => {
    card.onclick = () => { elements.messageInput.value = card.dataset.prompt; sendMessage(card.dataset.prompt); };
  });
}

// ========================================
// App Start
// ========================================

document.addEventListener("DOMContentLoaded", async () => {
  state.auth = await initFirebase();
  initEventListeners();
  updateUIState();
});
