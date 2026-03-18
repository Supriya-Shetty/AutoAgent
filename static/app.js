/**
 * OneChat - Composio Agent Web UI
 * Frontend JavaScript
 */

// ========================================
// Configuration
// ========================================

const CONFIG = {
  CHAT_ENDPOINT: "/chat",
};

// Function to initialize Firebase dynamically
async function initFirebase() {
  try {
    const response = await fetch("/firebase-config");
    const firebaseConfig = await response.json();

    if (!firebaseConfig.apiKey) {
      throw new Error("Firebase configuration not found.");
    }

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // Authentication Guard
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "/login";
      } else {
        const welcomeUserName = document.getElementById("welcomeUserName");
        if (welcomeUserName) {
          welcomeUserName.textContent =
            user.displayName?.split(" ")[0] || user.email.split("@")[0];
        }

        // Remove backend branding if it exists
        const poweredBy = document.querySelector(".sidebar-footer .powered-by");
        if (poweredBy) poweredBy.remove();

        // Load history and sessions once user is available
        if (state.sessionId) {
          await loadHistory(state.sessionId);
        }
        await fetchSessions();
      }
    });

    return auth;
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
}

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
  updateTimeout: null, // For debounced message updates
};

// ========================================
// DOM Elements
// ========================================

const elements = {
  messagesContainer: document.getElementById("messagesContainer"),
  welcomeScreen: document.getElementById("welcomeScreen"),
  chatForm: document.getElementById("chatForm"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  newChatBtn: document.getElementById("newChatBtn"),
  clearChatBtn: document.getElementById("clearChatBtn"),
  sidebar: document.getElementById("sidebar"),
  sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
  sidebarCloseBtn: document.getElementById("sidebarCloseBtn"),
  sidebarOverlay: document.getElementById("sidebarOverlay"),
  discoverPromptsLink: document.getElementById("discoverPromptsLink"),
  sessionsList: document.getElementById("sessionsList"),
};

// ========================================
// Markdown
// ========================================

// Custom renderer to open links in new tab and style auth buttons
const renderer = new marked.Renderer();

// Override link renderer to handle both old and new marked.js API
renderer.link = function (href, title, text) {
  // Handle object-style arguments (newer marked.js versions)
  if (typeof href === "object") {
    const token = href;
    href = token.href || "";
    title = token.title || "";
    text = token.text || "";
  }

  // Auth button detection
  const isAuth =
    text.toLowerCase().includes("connect") ||
    href.includes("composio.dev/link") ||
    href.includes("auth") ||
    href.includes("token");

  const className = isAuth ? "auth-button" : "";
  const titleAttr = title ? ` title="${title}"` : "";

  // If text is empty, use a default based on the URL
  let displayText = text;
  if (!displayText || displayText.trim() === "") {
    if (href.includes("gmail")) {
      displayText = "Connect to Gmail";
    } else if (href.includes("outlook")) {
      displayText = "Connect to Outlook";
    } else if (href.includes("composio.dev/link")) {
      displayText = "Connect Account";
    } else {
      displayText = href; // Fallback to showing the URL
    }
  }

  // Clean up any markdown syntax from the display text (like **bold** markers)
  displayText = displayText.replace(/\*\*/g, "").trim();

  // Additional cleanup: remove any remaining markdown artifacts
  displayText = displayText.replace(/\[|\]/g, "").trim();

  // Final fallback if text is still empty after cleanup
  if (!displayText || displayText.length < 2) {
    if (href.includes("gmail")) {
      displayText = "Connect to Gmail";
    } else if (href.includes("outlook")) {
      displayText = "Connect to Outlook";
    } else if (href.includes("composio.dev/link")) {
      displayText = "Connect Account";
    } else {
      displayText = "Open Link";
    }
  }

  // Auth buttons should be on their own line with proper spacing
  if (isAuth) {
    return `<div style="margin: 16px 0;"><a href="${href}"${titleAttr}${className ? ` class="${className}"` : ""} target="_blank" rel="noopener noreferrer">${displayText}</a></div>`;
  }

  return `<a href="${href}"${titleAttr}${className ? ` class="${className}"` : ""} target="_blank" rel="noopener noreferrer">${displayText}</a>`;
};

// Cleanly ignore redundant table separator rows during HTML rendering instead of raw text mutation
renderer.tablerow = function (token) {
  let content = "";
  if (typeof token === "object" && token.text) {
    content = token.text;
  } else if (typeof token === "string") {
    content = token;
  }
  
  // If this row contains only cells with hyphens, skip rendering it
  if (/^(?:\s*<td[^>]*>\s*-+\s*<\/td>\s*)+$/i.test(content)) {
    return "";
  }
  return `<tr>\n${content}</tr>\n`;
};

marked.setOptions({
  breaks: false,
  gfm: true,
  renderer: renderer,
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) {}
    }
    return code;
  },
});

// ========================================
// Utilities
// ========================================

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function parseMarkdown(text) {
  try {
    if (!text) return "";

    // Normalize newlines
    let normalizedText = text.replace(/\r\n/g, "\n");

    // ========================================
    // CRITICAL: Fix common spacing issues from LLM output
    // ========================================

    // Fix spaces within common words that get split
    const commonWords = [
      ["G mail", "Gmail"],
      ["O utlook", "Outlook"],
      ["Outook", "Outlook"],
      ["a uthentication", "authentication"],
      ["a uthorize", "authorize"],
      ["Author ize", "Authorize"],
      ["connec t", "connect"],
      ["connec tion", "connection"],
      ["connec tions", "connections"],
      ["e mail", "email"],
      ["to ken", "token"],
      ["auth orize", "authorize"],
      ["Com posio", "Composio"],
      ["Un read", "Unread"],
      ["devipras adshetty", "deviprasadshetty"],
    ];
    for (const [bad, good] of commonWords) {
      const regex = new RegExp(bad, "gi");
      normalizedText = normalizedText.replace(regex, good);
    }

    // Fix: Remove spaces inadvertently injected before @ in email addresses
    normalizedText = normalizedText.replace(/\s+@([a-zA-Z0-9.-]+)/g, "@$1");

    // Fix: Separate missing newlines after ---
    normalizedText = normalizedText.replace(/---\*\*/g, "---\n\n**");

    // Fix: Separate adjacent bold blocks that were combined
    normalizedText = normalizedText.replace(/\*\*\*\*/g, "**\n**");

    // Fix: Separate trailing text connected directly to new **Bold
    normalizedText = normalizedText.replace(
      /([a-z0-9)\]>])\*\*([A-Z])/gi,
      "$1\n**$2",
    );

    // Fix: Separate merged labels (e.g. comDate:** -> com\n**Date:**)
    normalizedText = normalizedText.replace(
      /([a-z0-9])([A-Z][a-z]+:\*\*)/g,
      "$1\n**$2",
    );

    // CRITICAL FIX: Fix empty markdown links []()
    // Pattern: [](url) -> [Connect Account](url) for auth links
    normalizedText = normalizedText.replace(
      /\[\]\((https?:\/\/[^\s)]+)\)/g,
      (match, url) => {
        if (url.includes("gmail")) {
          return "[Connect to Gmail](" + url + ")";
        } else if (url.includes("outlook")) {
          return "[Connect to Outlook](" + url + ")";
        } else if (url.includes("composio.dev/link")) {
          return "[Connect Account](" + url + ")";
        }
        return "[Link](" + url + ")";
      },
    );

    // Fix: Ensure headers have preceding newlines ONLY when missing
    normalizedText = normalizedText.replace(
      /([a-zA-Z0-9])(#{1,6}\s)/g,
      "$1\n\n$2",
    );

    // Fix: Ensure lists have preceding newlines when missing
    normalizedText = normalizedText.replace(
      /([.:a-zA-Z0-9])([ \t]+)([•\-\*]\s)/g,
      "$1\n$3",
    );

    // Fix: Fix broken bold formatting (spaces inside bold markers)
    // E.g., "**Option 1: Gmail **" -> "**Option 1: Gmail**"
    normalizedText = normalizedText.replace(/\*\*\s+/g, "**");
    normalizedText = normalizedText.replace(/\s+\*\*/g, "**");

    // Fix: Ensure code blocks have proper newlines (critical for streaming)
    normalizedText = normalizedText.replace(/([a-zA-Z0-9])(```)/g, "$1\n$2");
    normalizedText = normalizedText.replace(/(```)\n?([a-zA-Z])/g, "$1\n\n$2");

    // CRITICAL FIX: Clean up corrupted URLs (remove spaces and newlines within markdown links)
    // Pattern: [text]( url with spaces/newlines ) -> [text](url-without-spaces)
    normalizedText = normalizedText.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (match, text, url) => {
        return `[${text}](${url.replace(/\s+/g, "")})`;
      },
    );

    // Fix: Clean up spaces in bare URLs (not in markdown links)
    normalizedText = normalizedText.replace(
      /(https?:\/\/[^\s<]+)\s+([^\s<)]+)/g,
      "$1$2",
    );

    // Fix: Handle incomplete markdown links during streaming
    // Pattern: [text](url without closing paren at the end of stream
    normalizedText = normalizedText.replace(/(\[[^\]]+\]\([^)]+)$/g, "$1)");

    // Fix: Handle incomplete bold/italic markers during streaming
    // Count ** markers - if odd, add one more to complete
    const boldMarkers = (normalizedText.match(/\*\*/g) || []).length;
    if (boldMarkers % 2 === 1) {
      normalizedText += "**";
    }

    // Ensure there's a newline before a table starts if it's connected to text.
    normalizedText = normalizedText.replace(/([^\n])\n(\s*\|.*\|)/g, (match, prev, tableLine) => {
      if (prev === "|") return match; // Already part of a table
      return prev + "\n\n" + tableLine; // Add a blank line before the table
    });

    return marked.parse(normalizedText);
  } catch (e) {
    console.error("Markdown parse error:", e);
    return escapeHtml(text).replace(/\n/g, "<br>");
  }
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
}

function scrollToBottom() {
  elements.messagesContainer.scrollTo({
    top: elements.messagesContainer.scrollHeight,
    behavior: "smooth",
  });
}

function generateId() {
  return "msg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
}

// ========================================
// Sidebar
// ========================================

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  updateSidebarState();
}

function openSidebar() {
  state.sidebarOpen = true;
  updateSidebarState();
}

function closeSidebar() {
  state.sidebarOpen = false;
  updateSidebarState();
}

function updateSidebarState() {
  if (state.sidebarOpen) {
    elements.sidebar.classList.remove("collapsed");
    elements.sidebarOverlay.classList.remove("visible");
  } else {
    elements.sidebar.classList.add("collapsed");
    elements.sidebarOverlay.classList.remove("visible");
  }

  // Manage active state of navigation items
  if (!state.sessionId) {
    elements.newChatBtn.classList.add("active");
  } else {
    elements.newChatBtn.classList.remove("active");
  }
}

// ========================================
// Message Rendering
// ========================================

function createUserMessage(text) {
  return `
        <div class="message user">
            <div class="message-avatar">${ICONS.user}</div>
            <div class="message-content">${escapeHtml(text)}</div>
        </div>
    `;
}

function createAssistantMessage(id) {
  return `
        <div class="message assistant" id="${id}">
            <div class="message-avatar">${ICONS.bot}</div>
            <div class="message-content">
                <div class="message-text">
                    <div class="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                <div class="tool-calls-container"></div>
            </div>
        </div>
    `;
}

function createToolCallIndicator(toolName, isActive = true) {
  const cleanName = toolName.replace(/^[^\w\s]+\s*/, "");
  const activeClass = isActive ? " active" : "";
  const spinnerIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  const checkIcon = ICONS.tool;
  const icon = isActive ? spinnerIcon : checkIcon;
  return `<div class="tool-call${activeClass}" data-tool="${escapeHtml(cleanName)}">${icon}<span>${escapeHtml(cleanName)}</span></div>`;
}

function addMessage(html) {
  if (
    elements.welcomeScreen &&
    !elements.welcomeScreen.classList.contains("hidden")
  ) {
    elements.welcomeScreen.classList.add("hidden");
  }
  elements.messagesContainer.insertAdjacentHTML("beforeend", html);
  scrollToBottom();
}

function updateAssistantMessage(messageId, content) {
  const messageEl = document.getElementById(messageId);
  if (messageEl) {
    const textEl = messageEl.querySelector(".message-text");
    if (textEl) {
      // Remove typing indicator if present
      const typingIndicator = textEl.querySelector(".typing-indicator");
      if (typingIndicator) typingIndicator.remove();

      // Parse and update content
      textEl.innerHTML = parseMarkdown(content);

      // Highlight all code blocks
      const codeBlocks = textEl.querySelectorAll("pre code");
      codeBlocks.forEach((block) => {
        hljs.highlightElement(block);
      });
      scrollToBottom();
    }
  }
}

// Debounced version for streaming updates
let pendingUpdate = null;
function updateAssistantMessageDebounced(messageId, content) {
  // Clear pending update
  if (state.updateTimeout) {
    clearTimeout(state.updateTimeout);
  }

  // Schedule new update with small delay to batch chunks
  state.updateTimeout = setTimeout(() => {
    updateAssistantMessage(messageId, content);
    pendingUpdate = null;
  }, 16); // ~60fps

  // Store pending update
  pendingUpdate = { messageId, content };
}

function addToolCallToMessage(messageId, toolName) {
  const messageEl = document.getElementById(messageId);
  if (messageEl) {
    const toolContainer = messageEl.querySelector(".tool-calls-container");
    const textEl = messageEl.querySelector(".message-text");
    if (toolContainer) {
      // Remove typing indicator from text if it's still there
      if (textEl) {
        const typingIndicator = textEl.querySelector(".typing-indicator");
        if (typingIndicator) typingIndicator.remove();
      }

      toolContainer.insertAdjacentHTML(
        "beforeend",
        createToolCallIndicator(toolName),
      );
      scrollToBottom();
    }
  }
}

function completeToolCalls(messageId) {
  const messageEl = document.getElementById(messageId);
  if (messageEl) {
    const activeToolCalls = messageEl.querySelectorAll(".tool-call.active");
    activeToolCalls.forEach((toolCall) => {
      toolCall.classList.remove("active");
      // Replace spinner with check icon
      const svg = toolCall.querySelector("svg");
      if (svg) {
        svg.outerHTML = ICONS.tool;
      }
    });
  }

  // Flush any pending message update
  if (state.updateTimeout) {
    clearTimeout(state.updateTimeout);
    state.updateTimeout = null;
  }
  if (pendingUpdate) {
    updateAssistantMessage(pendingUpdate.messageId, pendingUpdate.content);
    pendingUpdate = null;
  }
}

// ========================================
// Chat
// ========================================

async function sendMessage(text) {
  if (state.isStreaming || !text.trim()) return;

  state.isStreaming = true;
  updateUIState();

  addMessage(createUserMessage(text));

  const assistantMessageId = generateId();
  addMessage(createAssistantMessage(assistantMessageId));

  let fullResponse = "";

  try {
    const user = state.auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const token = await user.getIdToken();
    const response = await fetch(CONFIG.CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: text,
        session_id: state.sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const newSessionId = response.headers.get("X-Session-Id");
    if (newSessionId && state.sessionId !== newSessionId) {
      state.sessionId = newSessionId;
      localStorage.setItem("autoagent_session_id", newSessionId);
      fetchSessions(); // Refresh session list
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventName = "message";
    let currentEventData = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer) {
            const lines = buffer.split("\n");
            for (let line of lines) {
                line = line.replace(/\r$/, "");
                if (line.startsWith("data:")) {
                    let data = line.substring(5);
                    if (data.startsWith(" ")) data = data.substring(1);
                    currentEventData.push(data);
                }
            }
            if (currentEventData.length > 0 && currentEventName === "message") {
                fullResponse += currentEventData.join("\n");
                updateAssistantMessageDebounced(assistantMessageId, fullResponse);
            }
        }
        break;
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Split by complete SSE messages (double newline or single newline patterns)
      const lines = buffer.split("\n");
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || "";

      for (let line of lines) {
        // Clean up any trailing carriage returns from chunk parsing
        line = line.replace(/\r$/, "");

        // Skip empty lines (SSE message separator)
        if (line === "") {
          if (currentEventData.length > 0) {
            const eventDataStr = currentEventData.join("\n");
            if (currentEventName === "message") {
              fullResponse += eventDataStr;
              updateAssistantMessageDebounced(assistantMessageId, fullResponse);
            } else if (currentEventName === "tool_call") {
              addToolCallToMessage(assistantMessageId, eventDataStr);
            } else if (currentEventName === "done") {
              state.sessionId = eventDataStr;
              localStorage.setItem("autoagent_session_id", eventDataStr);
            }
            currentEventData = [];
          }
          currentEventName = "message";
          continue;
        }

        if (line.startsWith("event:")) {
          currentEventName = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          // Extract data - SSE spec: everything after "data: "
          let data = line.substring(5);
          // Remove single leading space if present (per SSE spec)
          if (data.startsWith(" ")) {
            data = data.substring(1);
          }
          currentEventData.push(data);
        }
      }
    }

    // Mark all tool calls as complete
    completeToolCalls(assistantMessageId);

    state.messages.push({ role: "user", content: text });
    state.messages.push({ role: "assistant", content: fullResponse });
  } catch (error) {
    console.error("Chat error:", error);
    completeToolCalls(assistantMessageId);
    updateAssistantMessage(
      assistantMessageId,
      `**Error:** ${error.message}\n\nPlease try again.`,
    );
  } finally {
    state.isStreaming = false;
    updateUIState();
  }
}

function clearChat() {
  state.messages = [];
  state.sessionId = null;
  localStorage.removeItem("autoagent_session_id");

  const messages = elements.messagesContainer.querySelectorAll(".message");
  messages.forEach((msg) => msg.remove());

  if (elements.welcomeScreen) {
    elements.welcomeScreen.classList.remove("hidden");
  }

  updateSidebarState(); // Ensure "New Chat" is highlighted
  fetchSessions(); // Refresh list to show no active session
}

function updateUIState() {
  elements.sendBtn.disabled =
    state.isStreaming || !elements.messageInput.value.trim();
  elements.messageInput.disabled = state.isStreaming;

  if (state.isStreaming) {
    elements.sendBtn.innerHTML = ICONS.loader;
    elements.sendBtn.style.animation = "spin 1s linear infinite";
  } else {
    elements.sendBtn.innerHTML = ICONS.send;
    elements.sendBtn.style.animation = "";
  }
}

// Spin animation
const style = document.createElement("style");
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ========================================
// Event Listeners
// ========================================

async function initEventListeners() {
  // Event listeners that don't depend on auth

  // Form submit
  elements.chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = elements.messageInput.value.trim();
    if (message) {
      elements.messageInput.value = "";
      autoResize(elements.messageInput);
      sendMessage(message);
    }
  });

  // Input changes
  elements.messageInput.addEventListener("input", () => {
    autoResize(elements.messageInput);
    elements.sendBtn.disabled =
      !elements.messageInput.value.trim() || state.isStreaming;
  });

  // Enter to send
  elements.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      elements.chatForm.dispatchEvent(new Event("submit"));
    }
  });

  // Sidebar toggle
  elements.sidebarToggleBtn.addEventListener("click", toggleSidebar);
  elements.sidebarCloseBtn.addEventListener("click", closeSidebar);
  elements.sidebarOverlay.addEventListener("click", closeSidebar);

  // New/Clear chat
  elements.newChatBtn.addEventListener("click", clearChat);
  elements.clearChatBtn.addEventListener("click", clearChat);

  // Logout
  const sidebarFooter = document.querySelector(".sidebar-footer");
  if (sidebarFooter) {
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "nav-item";
    logoutBtn.style.marginTop = "10px";
    logoutBtn.style.color = "var(--text-secondary)";
    logoutBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Logout</span>
        `;
    logoutBtn.onclick = () => state.auth.signOut();
    sidebarFooter.prepend(logoutBtn);
  }

  // Suggestion cards
  document.querySelectorAll(".suggestion-card").forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.dataset.prompt;
      if (prompt) {
        elements.messageInput.value = prompt;
        sendMessage(prompt);
      }
    });
  });
}

async function fetchSessions() {
  try {
    const user = state.auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const response = await fetch("/sessions", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return;

    const sessions = await response.json();
    renderSessions(sessions);
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
  }
}

function renderSessions(sessions) {
  if (!elements.sessionsList) return;

  elements.sessionsList.innerHTML = "";

  if (sessions.length === 0) {
    elements.sessionsList.innerHTML =
      '<div class="nav-item disabled">No recent chats</div>';
    return;
  }

  sessions.forEach((session) => {
    const sessionWrapper = document.createElement("div");
    sessionWrapper.className = "session-wrapper";

    const btn = document.createElement("button");
    btn.className = `session-item ${state.sessionId === session.session_id ? "active" : ""}`;
    btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15 a 2 2 0 0 1 -2 2 H 7 l -4 4 V 5 a 2 2 0 0 1 2 -2 h 14 a 2 2 0 0 1 2 2 z"/></svg>
            <span>${escapeHtml(session.title || "Untitled Chat")}</span>
        `;

    btn.onclick = () => {
      if (state.sessionId === session.session_id) return;
      state.sessionId = session.session_id;
      localStorage.setItem("autoagent_session_id", session.session_id);
      loadHistory(session.session_id);
      updateSidebarState();
      renderSessions(sessions);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-session-btn";
    deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    deleteBtn.title = "Delete Chat";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm("Are you sure you want to delete this chat?")) {
        deleteSession(session.session_id);
      }
    };

    sessionWrapper.appendChild(btn);
    sessionWrapper.appendChild(deleteBtn);
    elements.sessionsList.appendChild(sessionWrapper);
  });
}

async function deleteSession(sessionId) {
  try {
    const user = state.auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const response = await fetch(`/sessions/${sessionId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      if (state.sessionId === sessionId) {
        clearChat();
      } else {
        fetchSessions();
      }
    }
  } catch (error) {
    console.error("Failed to delete session:", error);
  }
}

async function loadHistory(sessionId) {
  if (!sessionId) return;

  try {
    const user = state.auth.currentUser;
    if (!user) return;

    const token = await user.getIdToken();
    const response = await fetch(`/sessions/${sessionId}/history`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return;

    const history = await response.json();
    if (history && history.length > 0) {
      // Clear current view
      elements.messagesContainer.innerHTML = "";
      state.messages = [];

      history.forEach((msg) => {
        const messageId = generateId();
        if (msg.role === "user") {
          addMessage(createUserMessage(msg.content, messageId));
        } else {
          addMessage(createAssistantMessage(messageId));
          updateAssistantMessage(messageId, msg.content);
        }
        state.messages.push({ role: msg.role, content: msg.content });
      });

      // Hide welcome screen
      if (elements.welcomeScreen) {
        elements.welcomeScreen.classList.add("hidden");
      }

      scrollToBottom();
    }
  } catch (error) {
    console.error("Failed to load history:", error);
  }
}

// ========================================
// Initialization
// ========================================

document.addEventListener("DOMContentLoaded", async () => {
  console.log("AutoAgent initialized");
  state.auth = await initFirebase();
  // Don't overwrite if setup by fetchSessions or loadHistory
  const savedSessionId = localStorage.getItem("autoagent_session_id");
  if (savedSessionId) state.sessionId = savedSessionId;

  await initEventListeners();
  updateUIState();
  updateSidebarState();
});
