/**
 * OneChat - Composio Agent Web UI
 * Frontend JavaScript
 */

// ========================================
// Configuration
// ========================================

const CONFIG = {
    CHAT_ENDPOINT: '/chat',
};

// Function to initialize Firebase dynamically
async function initFirebase() {
    try {
        const response = await fetch('/firebase-config');
        const firebaseConfig = await response.json();

        if (!firebaseConfig.apiKey) {
            throw new Error('Firebase configuration not found.');
        }

        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth();

        // Authentication Guard
        auth.onAuthStateChanged(async user => {
            if (!user) {
                window.location.href = '/login';
            } else {
                const welcomeUserName = document.getElementById('welcomeUserName');
                if (welcomeUserName) {
                    welcomeUserName.textContent = user.displayName?.split(' ')[0] || user.email.split('@')[0];
                }

                // Remove backend branding if it exists
                const poweredBy = document.querySelector('.sidebar-footer .powered-by');
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
        console.error('Failed to initialize Firebase:', error);
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
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
    sessionId: localStorage.getItem('autoagent_session_id') || null,
    isStreaming: false,
    messages: [],
    sidebarOpen: true,
    auth: null,
};

// ========================================
// DOM Elements
// ========================================

const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    chatForm: document.getElementById('chatForm'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    clearChatBtn: document.getElementById('clearChatBtn'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
    sidebarOverlay: document.getElementById('sidebarOverlay'),
    discoverPromptsLink: document.getElementById('discoverPromptsLink'),
    sessionsList: document.getElementById('sessionsList'),
};

// ========================================
// Markdown
// ========================================

// Custom renderer to open links in new tab
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link.bind(renderer);
renderer.link = function (token) {
    // Handle both old API (href, title, text) and new API (token object)
    let href, title, text;
    if (typeof token === 'object' && token !== null) {
        href = token.href || '';
        title = token.title || '';
        text = token.text || '';
    } else {
        // Fallback for older API
        href = arguments[0] || '';
        title = arguments[1] || '';
        text = arguments[2] || '';
    }
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.setOptions({
    breaks: true,
    gfm: true,
    renderer: renderer,
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (e) { }
        }
        return code;
    }
});

// ========================================
// Utilities
// ========================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseMarkdown(text) {
    try {
        if (!text) return '';

        // Normalize newlines
        let normalizedText = text.replace(/\r\n/g, '\n');

        // Ensure headers and lists have a newline before them if they are concatenated
        // This fixes the "dump" look when agent misses newlines
        normalizedText = normalizedText
            .replace(/([^\n])(#{1,6}\s)/g, '$1\n$2')           // Headers
            .replace(/([^\n])(\n|\s)*(--+|==+)(\s|\n|$)/g, '$1\n$3\n') // HRs
            .replace(/([^|\n])([•\-\*]\s)/g, '$1\n$2');       // Lists (avoid if after a pipe)

        // Fix missing table separators (|---|---)
        // If we see a line with multiple pipes followed by a line with multiple pipes but no separator
        const lines = normalizedText.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
            const current = lines[i].trim();
            const next = lines[i + 1].trim();

            // If current line looks like a header (contains pipes) and next line is a row (contains pipes)
            // and neither is already a separator
            if (current.includes('|') && next.includes('|') &&
                !current.includes('---') && !next.includes('---')) {

                // Count pipes to guess columns
                const columns = (current.match(/\|/g) || []).length;
                if (columns >= 1) {
                    const separator = '|' + '---|'.repeat(columns > 1 ? columns - 1 : 1);
                    lines.splice(i + 1, 0, separator);
                    i++; // skip the new line
                }
            }
        }
        normalizedText = lines.join('\n');

        return marked.parse(normalizedText);
    } catch (e) {
        console.error('Markdown parse error:', e);
        return escapeHtml(text).replace(/\n/g, '<br>');
    }
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function scrollToBottom() {
    elements.messagesContainer.scrollTo({
        top: elements.messagesContainer.scrollHeight,
        behavior: 'smooth'
    });
}

function generateId() {
    return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
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
        elements.sidebar.classList.remove('collapsed');
        elements.sidebarOverlay.classList.remove('visible');
    } else {
        elements.sidebar.classList.add('collapsed');
        elements.sidebarOverlay.classList.remove('visible');
    }

    // Manage active state of navigation items
    if (!state.sessionId) {
        elements.newChatBtn.classList.add('active');
    } else {
        elements.newChatBtn.classList.remove('active');
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
    const cleanName = toolName.replace(/^[^\w\s]+\s*/, '');
    const activeClass = isActive ? ' active' : '';
    const spinnerIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
    const checkIcon = ICONS.tool;
    const icon = isActive ? spinnerIcon : checkIcon;
    return `<div class="tool-call${activeClass}" data-tool="${escapeHtml(cleanName)}">${icon}<span>${escapeHtml(cleanName)}</span></div>`;
}

function addMessage(html) {
    if (elements.welcomeScreen && !elements.welcomeScreen.classList.contains('hidden')) {
        elements.welcomeScreen.classList.add('hidden');
    }
    elements.messagesContainer.insertAdjacentHTML('beforeend', html);
    scrollToBottom();
}

function updateAssistantMessage(messageId, content) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
        const textEl = messageEl.querySelector('.message-text');
        if (textEl) {
            // Remove typing indicator if present
            const typingIndicator = textEl.querySelector('.typing-indicator');
            if (typingIndicator) typingIndicator.remove();

            textEl.innerHTML = parseMarkdown(content);
            textEl.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            scrollToBottom();
        }
    }
}

function addToolCallToMessage(messageId, toolName) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
        const toolContainer = messageEl.querySelector('.tool-calls-container');
        const textEl = messageEl.querySelector('.message-text');
        if (toolContainer) {
            // Remove typing indicator from text if it's still there
            if (textEl) {
                const typingIndicator = textEl.querySelector('.typing-indicator');
                if (typingIndicator) typingIndicator.remove();
            }

            toolContainer.insertAdjacentHTML('beforeend', createToolCallIndicator(toolName));
            scrollToBottom();
        }
    }
}

function completeToolCalls(messageId) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
        const activeToolCalls = messageEl.querySelectorAll('.tool-call.active');
        activeToolCalls.forEach(toolCall => {
            toolCall.classList.remove('active');
            // Replace spinner with check icon
            const svg = toolCall.querySelector('svg');
            if (svg) {
                svg.outerHTML = ICONS.tool;
            }
        });
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

    let fullResponse = '';

    try {
        const user = state.auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        const token = await user.getIdToken();
        const response = await fetch(CONFIG.CHAT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                message: text,
                session_id: state.sessionId,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const newSessionId = response.headers.get('X-Session-Id');
        if (newSessionId && state.sessionId !== newSessionId) {
            state.sessionId = newSessionId;
            localStorage.setItem('autoagent_session_id', newSessionId);
            fetchSessions(); // Refresh session list
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = 'message';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine && !line) continue;

                if (line.startsWith('event:')) {
                    currentEvent = line.substring(6).trim();
                } else if (line.startsWith('data:')) {
                    // Extract data without trimming essential whitespace
                    let data = line.substring(5);
                    // SSE spec: if data prefixed with space, remove it
                    if (data.startsWith(' ')) {
                        data = data.substring(1);
                    }

                    if (currentEvent === 'message') {
                        if (data.includes('-') && data.length > 30 && data.split('-').length >= 4) {
                            state.sessionId = data;
                            localStorage.setItem('autoagent_session_id', data);
                            fetchSessions();
                            continue;
                        }

                        fullResponse += data;
                        updateAssistantMessage(assistantMessageId, fullResponse);
                    } else if (currentEvent === 'tool_call') {
                        addToolCallToMessage(assistantMessageId, data);
                    } else if (currentEvent === 'done') {
                        state.sessionId = data;
                        localStorage.setItem('autoagent_session_id', data);
                    }
                }
            }
        }

        // Mark all tool calls as complete
        completeToolCalls(assistantMessageId);

        state.messages.push({ role: 'user', content: text });
        state.messages.push({ role: 'assistant', content: fullResponse });

    } catch (error) {
        console.error('Chat error:', error);
        completeToolCalls(assistantMessageId);
        updateAssistantMessage(
            assistantMessageId,
            `**Error:** ${error.message}\n\nPlease try again.`
        );
    } finally {
        state.isStreaming = false;
        updateUIState();
    }
}

function clearChat() {
    state.messages = [];
    state.sessionId = null;
    localStorage.removeItem('autoagent_session_id');

    const messages = elements.messagesContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());

    if (elements.welcomeScreen) {
        elements.welcomeScreen.classList.remove('hidden');
    }

    updateSidebarState(); // Ensure "New Chat" is highlighted
    fetchSessions(); // Refresh list to show no active session
}

function updateUIState() {
    elements.sendBtn.disabled = state.isStreaming || !elements.messageInput.value.trim();
    elements.messageInput.disabled = state.isStreaming;

    if (state.isStreaming) {
        elements.sendBtn.innerHTML = ICONS.loader;
        elements.sendBtn.style.animation = 'spin 1s linear infinite';
    } else {
        elements.sendBtn.innerHTML = ICONS.send;
        elements.sendBtn.style.animation = '';
    }
}

// Spin animation
const style = document.createElement('style');
style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ========================================
// Event Listeners
// ========================================

async function initEventListeners() {
    // Event listeners that don't depend on auth

    // Form submit
    elements.chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = elements.messageInput.value.trim();
        if (message) {
            elements.messageInput.value = '';
            autoResize(elements.messageInput);
            sendMessage(message);
        }
    });

    // Input changes
    elements.messageInput.addEventListener('input', () => {
        autoResize(elements.messageInput);
        elements.sendBtn.disabled = !elements.messageInput.value.trim() || state.isStreaming;
    });

    // Enter to send
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            elements.chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Sidebar toggle
    elements.sidebarToggleBtn.addEventListener('click', toggleSidebar);
    elements.sidebarCloseBtn.addEventListener('click', closeSidebar);
    elements.sidebarOverlay.addEventListener('click', closeSidebar);

    // New/Clear chat
    elements.newChatBtn.addEventListener('click', clearChat);
    elements.clearChatBtn.addEventListener('click', clearChat);

    // Logout
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'nav-item';
        logoutBtn.style.marginTop = '10px';
        logoutBtn.style.color = 'var(--text-secondary)';
        logoutBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Logout</span>
        `;
        logoutBtn.onclick = () => state.auth.signOut();
        sidebarFooter.prepend(logoutBtn);
    }

    // Suggestion cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
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
        const response = await fetch('/sessions', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const sessions = await response.json();
        renderSessions(sessions);
    } catch (error) {
        console.error('Failed to fetch sessions:', error);
    }
}

function renderSessions(sessions) {
    if (!elements.sessionsList) return;

    elements.sessionsList.innerHTML = '';

    if (sessions.length === 0) {
        elements.sessionsList.innerHTML = '<div class="nav-item disabled">No recent chats</div>';
        return;
    }

    sessions.forEach(session => {
        const sessionWrapper = document.createElement('div');
        sessionWrapper.className = 'session-wrapper';

        const btn = document.createElement('button');
        btn.className = `session-item ${state.sessionId === session.session_id ? 'active' : ''}`;
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15 a 2 2 0 0 1 -2 2 H 7 l -4 4 V 5 a 2 2 0 0 1 2 -2 h 14 a 2 2 0 0 1 2 2 z"/></svg>
            <span>${escapeHtml(session.title || 'Untitled Chat')}</span>
        `;

        btn.onclick = () => {
            if (state.sessionId === session.session_id) return;
            state.sessionId = session.session_id;
            localStorage.setItem('autoagent_session_id', session.session_id);
            loadHistory(session.session_id);
            updateSidebarState();
            renderSessions(sessions);
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-session-btn';
        deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
        deleteBtn.title = 'Delete Chat';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Are you sure you want to delete this chat?')) {
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
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            if (state.sessionId === sessionId) {
                clearChat();
            } else {
                fetchSessions();
            }
        }
    } catch (error) {
        console.error('Failed to delete session:', error);
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
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) return;

        const history = await response.json();
        if (history && history.length > 0) {
            // Clear current view
            elements.messagesContainer.innerHTML = '';
            state.messages = [];

            history.forEach(msg => {
                const messageId = generateId();
                if (msg.role === 'user') {
                    addMessage(createUserMessage(msg.content, messageId));
                } else {
                    addMessage(createAssistantMessage(messageId));
                    updateAssistantMessage(messageId, msg.content);
                }
                state.messages.push({ role: msg.role, content: msg.content });
            });

            // Hide welcome screen
            if (elements.welcomeScreen) {
                elements.welcomeScreen.classList.add('hidden');
            }

            scrollToBottom();
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

// ========================================
// Initialization
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('AutoAgent initialized');
    state.auth = await initFirebase();
    // Don't overwrite if setup by fetchSessions or loadHistory
    const savedSessionId = localStorage.getItem('autoagent_session_id');
    if (savedSessionId) state.sessionId = savedSessionId;

    await initEventListeners();
    updateUIState();
    updateSidebarState();
});
