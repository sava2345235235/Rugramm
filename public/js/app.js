// State
let socket = null;
let currentUser = null;
let currentChatId = null;
let chats = [];

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const chatScreen = document.getElementById('chat-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const tabBtns = document.querySelectorAll('.tab-btn');
const searchInput = document.getElementById('search-users');
const searchResults = document.getElementById('search-results');
const chatsList = document.getElementById('chats-list');
const noChatSelected = document.getElementById('no-chat-selected');
const activeChat = document.getElementById('active-chat');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message');
const attachFileBtn = document.getElementById('attach-file');
const fileInput = document.getElementById('file-input');
const typingIndicator = document.getElementById('typing-indicator');

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const tab = btn.dataset.tab;
        loginForm.classList.toggle('active', tab === 'login');
        registerForm.classList.toggle('active', tab === 'register');
        authError.textContent = '';
    });
});

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('token', data.token);
            connectSocket(data.token);
            showChatScreen();
        } else {
            authError.textContent = data.error;
        }
    } catch (err) {
        authError.textContent = 'Ошибка подключения';
    }
});

// Register
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Auto login after registration
            const loginResponse = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const loginData = await loginResponse.json();
            if (loginData.success) {
                currentUser = loginData.user;
                localStorage.setItem('token', loginData.token);
                connectSocket(loginData.token);
                showChatScreen();
            }
        } else {
            authError.textContent = data.error;
        }
    } catch (err) {
        authError.textContent = 'Ошибка подключения';
    }
});

// Connect to Socket.IO
function connectSocket(token) {
    socket = io({
        auth: { token }
    });
    
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('get_chats');
    });
    
    socket.on('chats_list', (chatsData) => {
        chats = chatsData;
        renderChatsList();
    });
    
    socket.on('messages_history', (messages) => {
        renderMessages(messages);
    });
    
    socket.on('new_message', (message) => {
        if (message.chat_id === currentChatId) {
            appendMessage(message);
            scrollToBottom();
        }
        // Update chat list
        socket.emit('get_chats');
    });
    
    socket.on('user_typing', (data) => {
        if (data.userId !== currentUser.id && data.isTyping) {
            typingIndicator.textContent = `${data.username} печатает...`;
        } else {
            typingIndicator.textContent = '';
        }
    });
    
    socket.on('chat_created', (data) => {
        if (data.isNew) {
            socket.emit('get_chats');
            selectChat(data.chatId);
        }
    });
    
    socket.on('search_results', (users) => {
        renderSearchResults(users);
    });
    
    socket.on('user_status', (data) => {
        // Update user status in chat list
        chats.forEach(chat => {
            if (chat.members) {
                chat.members.forEach(member => {
                    if (member.id === data.userId) {
                        member.status = data.status;
                    }
                });
            }
        });
        if (currentChatId) {
            renderCurrentChatHeader();
        }
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
}

// Show chat screen
function showChatScreen() {
    authScreen.classList.remove('active');
    chatScreen.classList.add('active');
    document.getElementById('current-username').textContent = currentUser.username;
    document.getElementById('current-user-avatar').src = currentUser.avatar || '/uploads/avatars/default.png';
}

// Render chats list
function renderChatsList() {
    chatsList.innerHTML = '';
    
    chats.forEach(chat => {
        const otherMember = chat.members.find(m => m.id !== currentUser.id);
        const name = otherMember ? otherMember.username : (chat.name || 'Чат');
        const avatar = otherMember ? otherMember.avatar : '/uploads/avatars/default.png';
        const status = otherMember ? otherMember.status : 'offline';
        const lastMessage = chat.last_message || 'Нет сообщений';
        const time = chat.last_message_time ? new Date(chat.last_message_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
        
        const chatEl = document.createElement('div');
        chatEl.className = `chat-item ${currentChatId === chat.id ? 'active' : ''}`;
        chatEl.innerHTML = `
            <img src="${avatar}" alt="Avatar" class="avatar">
            <div class="chat-item-info">
                <div class="chat-item-name">${name}</div>
                <div class="chat-item-last-message">${lastMessage}</div>
            </div>
            <div style="text-align: right;">
                <div class="chat-item-time">${time}</div>
                ${chat.unread_count > 0 ? `<span class="unread-badge">${chat.unread_count}</span>` : ''}
            </div>
        `;
        
        chatEl.addEventListener('click', () => selectChat(chat.id));
        chatsList.appendChild(chatEl);
    });
}

// Select chat
function selectChat(chatId) {
    currentChatId = chatId;
    noChatSelected.style.display = 'none';
    activeChat.classList.remove('hidden');
    
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
        const otherMember = chat.members.find(m => m.id !== currentUser.id);
        const name = otherMember ? otherMember.username : (chat.name || 'Чат');
        const avatar = otherMember ? otherMember.avatar : '/uploads/avatars/default.png';
        const status = otherMember ? otherMember.status : 'offline';
        
        document.getElementById('chat-name').textContent = name;
        document.getElementById('chat-avatar').src = avatar;
        document.getElementById('chat-status').textContent = status;
        document.getElementById('chat-status').className = `status ${status}`;
    }
    
    renderChatsList();
    socket.emit('get_messages', chatId);
    messagesContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Загрузка сообщений...</div>';
}

// Render current chat header
function renderCurrentChatHeader() {
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
        const otherMember = chat.members.find(m => m.id !== currentUser.id);
        if (otherMember) {
            document.getElementById('chat-name').textContent = otherMember.username;
            document.getElementById('chat-avatar').src = otherMember.avatar || '/uploads/avatars/default.png';
            document.getElementById('chat-status').textContent = otherMember.status;
            document.getElementById('chat-status').className = `status ${otherMember.status}`;
        }
    }
}

// Render messages
function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    scrollToBottom();
}

// Append message
function appendMessage(msg) {
    const isSent = msg.sender_id === currentUser.id;
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isSent ? 'sent' : 'received'}`;
    
    let content = '';
    if (msg.message_type === 'image' && msg.file_url) {
        content = `<div class="message-file"><img src="${msg.file_url}" alt="Image"></div>`;
    } else if (msg.file_url) {
        content = `<div class="message-file"><a href="${msg.file_url}" target="_blank">📎 Файл</a></div>`;
    }
    
    if (msg.content) {
        content = `<div class="message-content">${escapeHtml(msg.content)}</div>` + content;
    }
    
    const time = new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageEl.innerHTML = `
        ${!isSent ? `
        <div class="message-header">
            <img src="${msg.avatar || '/uploads/avatars/default.png'}" alt="Avatar" class="message-avatar">
            <span class="message-username">${msg.username}</span>
            <span class="message-time">${time}</span>
        </div>
        ` : ''}
        ${content}
        ${isSent ? `<div class="message-time">${time}</div>` : ''}
    `;
    
    messagesContainer.appendChild(messageEl);
}

// Scroll to bottom
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Send message
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentChatId) return;
    
    socket.emit('send_message', {
        chatId: currentChatId,
        content,
        messageType: 'text'
    });
    
    messageInput.value = '';
    socket.emit('typing', { chatId: currentChatId, isTyping: false });
}

sendMessageBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!currentChatId) return;
    
    socket.emit('typing', { chatId: currentChatId, isTyping: true });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', { chatId: currentChatId, isTyping: false });
    }, 2000);
});

// File upload
attachFileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatId) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload-file', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const messageType = data.type.startsWith('image/') ? 'image' : 'file';
            socket.emit('send_message', {
                chatId: currentChatId,
                content: '',
                fileUrl: data.url,
                fileType: data.type,
                messageType
            });
        }
    } catch (err) {
        console.error('Upload error:', err);
    }
    
    fileInput.value = '';
});

// Search users
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (query.length > 0) {
            socket.emit('search_users', query);
        } else {
            searchResults.innerHTML = '';
        }
    }, 300);
});

// Render search results
function renderSearchResults(users) {
    searchResults.innerHTML = '';
    
    if (users.length === 0) {
        searchResults.innerHTML = '<div style="padding: 15px; color: #999; text-align: center;">Пользователи не найдены</div>';
        return;
    }
    
    users.forEach(user => {
        const el = document.createElement('div');
        el.className = 'search-result-item';
        el.innerHTML = `
            <img src="${user.avatar || '/uploads/avatars/default.png'}" alt="Avatar" class="avatar">
            <span>${user.username}</span>
            <span class="status ${user.status}" style="margin-left: auto;">${user.status}</span>
        `;
        
        el.addEventListener('click', () => {
            socket.emit('create_private_chat', user.id);
            searchInput.value = '';
            searchResults.innerHTML = '';
        });
        
        searchResults.appendChild(el);
    });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check for existing token on load
window.addEventListener('load', () => {
    const token = localStorage.getItem('token');
    if (token) {
        // Verify token by trying to get user info
        // For simplicity, we'll just connect
        connectSocket(token);
        showChatScreen();
    }
});
