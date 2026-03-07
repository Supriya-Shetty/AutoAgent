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
    sessionId: null,
    isStreaming: false,
    messages: [],
    sidebarOpen: true,
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
        // Normalize newlines and ensure proper paragraph separation
        let normalizedText = text
            .replace(/\r\n/g, '\n')  // Normalize Windows line endings
            .replace(/\n\n+/g, '\n\n');  // Collapse multiple newlines to double

        return marked.parse(normalizedText);
    } catch (e) {
        return escapeHtml(text);
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
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
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
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = parseMarkdown(content);
            contentEl.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
            scrollToBottom();
        }
    }
}

function addToolCallToMessage(messageId, toolName) {
    const messageEl = document.getElementById(messageId);
    if (messageEl) {
        const contentEl = messageEl.querySelector('.message-content');
        if (contentEl) {
            const typingIndicator = contentEl.querySelector('.typing-indicator');
            if (typingIndicator) {
                typingIndicator.remove();
            }
            contentEl.insertAdjacentHTML('beforeend', createToolCallIndicator(toolName));
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
        const response = await fetch(CONFIG.CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                session_id: state.sessionId,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const newSessionId = response.headers.get('X-Session-Id');
        if (newSessionId) {
            state.sessionId = newSessionId;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.substring(5).trim();

                    if (data.includes('-') && data.length > 30) {
                        state.sessionId = data;
                        continue;
                    }

                    if (data.startsWith('🔧') || data.toLowerCase().includes('calling')) {
                        addToolCallToMessage(assistantMessageId, data);
                    } else if (data && data !== '[DONE]') {
                        fullResponse += data;
                        updateAssistantMessage(assistantMessageId, fullResponse);
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

    const messages = elements.messagesContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());

    if (elements.welcomeScreen) {
        elements.welcomeScreen.classList.remove('hidden');
    }
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

function initEventListeners() {
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

    // Discover prompts link
    if (elements.discoverPromptsLink) {
        elements.discoverPromptsLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Scroll to welcome screen if hidden
            if (elements.welcomeScreen.classList.contains('hidden')) {
                clearChat();
            }
        });
    }
}

// ========================================
// Init
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('OneChat - Composio Agent initialized');
    initEventListeners();
    updateUIState();
    updateSidebarState();
});
