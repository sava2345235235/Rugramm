document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  let currentUser = null;
  let currentChat = null;
  let users = [];
  let chats = [];
  let userSettings = {};

  // Load user settings from localStorage
  const savedSettings = localStorage.getItem("userSettings");
  if (savedSettings) {
    userSettings = JSON.parse(savedSettings);
    applyTheme(userSettings.theme || 'light');
  }

  // DOM Elements
  const loginScreen = document.getElementById("loginScreen");
  const chatScreen = document.getElementById("chatScreen");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const sendForm = document.getElementById("sendForm");
  const messageInput = document.getElementById("messageInput");
  const messagesDiv = document.getElementById("messages");
  const chatsContainer = document.getElementById("chatsContainer");
  const pinnedContainer = document.getElementById("pinnedContainer");
  const errorP = document.getElementById("error");
  const userProfile = document.getElementById("userProfile");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const chatName = document.getElementById("chatName");
  const chatStatus = document.getElementById("chatStatus");
  const fileInput = document.getElementById("fileInput");
  const fileBtn = document.getElementById("fileBtn");
  const emojiBtn = document.getElementById("emojiBtn");
  const emojiPanel = document.getElementById("emojiPanel");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const sidebar = document.getElementById("sidebar");
  const logoutBtn = document.getElementById("logoutBtn");
  const searchInput = document.getElementById("searchInput");

  // Add User Modal elements
  const addUserModal = document.getElementById("addUserModal");
  const addUsernameInput = document.getElementById("addUsernameInput");
  const userSearchResults = document.getElementById("userSearchResults");
  const confirmAddUser = document.getElementById("confirmAddUser");
  const closeAddUser = document.getElementById("closeAddUser");

  // Settings Modal elements
  const settingsModal = document.getElementById("settingsModal");
  const settingsAvatar = document.getElementById("settingsAvatar");
  const settingsUsername = document.getElementById("settingsUsername");
  const settingsUsernameDisplay = document.getElementById("settingsUsernameDisplay");
  const settingsUserId = document.getElementById("settingsUserId");
  const settingsCreatedAt = document.getElementById("settingsCreatedAt");
  const notificationSound = document.getElementById("notificationSound");
  const themeSelect = document.getElementById("themeSelect");
  const avatarUpload = document.getElementById("avatarUpload");
  const saveSettings = document.getElementById("saveSettings");
  const closeSettings = document.getElementById("closeSettings");

  // Profile modal (keep for backward compatibility)
  const profileModal = document.getElementById("profileModal");
  const closeProfile = document.getElementById("closeProfile");
  const saveProfile = document.getElementById("saveProfile");
  const profileName = document.getElementById("profileName");
  const profilePhoto = document.getElementById("profilePhoto");
  const profileAvatar = document.getElementById("profileAvatar");

  // Check saved user
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    initChatScreen();
    socket.emit("login", currentUser.id);
  }

  // Emojis
  const emojis = ["😀", "😂", "😎", "😍", "😭", "🔥", "❤️", "👍", "🎉", "😅", "🥳", "🤔", "👋", "🤝", "👍🏻", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇"];
  emojis.forEach(e => {
    const span = document.createElement("span");
    span.className = "emoji";
    span.textContent = e;
    span.onclick = () => {
      messageInput.value += e;
      emojiPanel.classList.remove("show");
    };
    emojiPanel.appendChild(span);
  });

  emojiBtn.onclick = () => {
    emojiPanel.classList.toggle("show");
  };

  fileBtn.onclick = () => {
    fileInput.click();
  };

  // Mobile menu
  mobileMenuBtn.onclick = () => {
    sidebar.classList.toggle("show");
  };

  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        sidebar.classList.remove("show");
      }
    }
  });

  // Search functionality
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterChats(searchInput.value);
    }, 300);
  });

  function filterChats(query) {
    if (!query) {
      renderChats(chats);
      return;
    }

    const filtered = chats.filter(chat => 
      chat.otherUser?.username.toLowerCase().includes(query.toLowerCase())
    );
    renderChats(filtered);
  }

  // Add User functionality
  function showAddUserModal() {
    addUserModal.classList.remove("hidden");
    addUsernameInput.value = "";
    userSearchResults.innerHTML = "";
    addUsernameInput.focus();
  }

  // Search users as you type
  let searchUserTimeout;
  addUsernameInput.addEventListener("input", () => {
    clearTimeout(searchUserTimeout);
    const query = addUsernameInput.value.trim();
    
    if (query.length < 1) {
      userSearchResults.innerHTML = "";
      return;
    }

    // Show loading
    userSearchResults.innerHTML = '<div class="spinner"></div>';

    searchUserTimeout = setTimeout(() => {
      searchUsers(query);
    }, 300);
  });

  function searchUsers(query) {
    // Remove @ if present
    const searchTerm = query.startsWith('@') ? query.substring(1) : query;
    
    const filteredUsers = users.filter(user => 
      user.id !== currentUser.id && 
      user.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filteredUsers.length === 0) {
      userSearchResults.innerHTML = '<div class="empty-state"><span>😕</span><br>Пользователи не найдены</div>';
      return;
    }

    userSearchResults.innerHTML = filteredUsers.map(user => `
      <div class="user-search-item" data-user-id="${user.id}" data-username="${user.username}">
        <img src="${user.avatar || '/uploads/default-avatar.png'}" alt="${user.username}">
        <div class="user-info">
          <div class="user-name">${user.username}</div>
          <div class="user-status">
            <span class="status-dot ${user.online ? 'online' : 'offline'}"></span>
            <span style="color: ${user.online ? '#48bb78' : '#9ca3af'};">
              ${user.online ? 'в сети' : 'не в сети'}
            </span>
          </div>
        </div>
      </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.user-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const userId = item.dataset.userId;
        const username = item.dataset.username;
        addUsernameInput.value = '@' + username;
        userSearchResults.innerHTML = '';
      });
    });
  }

  // Add selected user to chat
  confirmAddUser.onclick = async () => {
    let username = addUsernameInput.value.trim();
    
    if (!username) {
      alert("Введите username");
      return;
    }

    // Remove @ if present
    if (username.startsWith('@')) {
      username = username.substring(1);
    }

    const user = users.find(u => u.username === username);
    if (!user) {
      alert("Пользователь не найден");
      return;
    }

    if (user.id === currentUser.id) {
      alert("Нельзя добавить самого себя");
      return;
    }

    // Check if chat already exists
    const existingChat = chats.find(chat => 
      chat.members.includes(currentUser.id) && 
      chat.members.includes(user.id)
    );

    if (existingChat) {
      addUserModal.classList.add("hidden");
      openChat(existingChat);
      return;
    }

    try {
      const res = await fetch("/createChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: [currentUser.id, user.id] })
      });

      const data = await res.json();

      if (data.success) {
        addUserModal.classList.add("hidden");
        await loadChats();
        openChat(data.chat);
      }
    } catch (err) {
      console.error("Error creating chat:", err);
      alert("Ошибка при создании чата");
    }
  };

  closeAddUser.onclick = () => {
    addUserModal.classList.add("hidden");
  };

  // Settings functionality
  function showSettingsModal() {
    settingsModal.classList.remove("hidden");
    
    // Load current user data
    settingsAvatar.src = currentUser.avatar || '/uploads/default-avatar.png';
    settingsUsername.value = currentUser.username;
    settingsUsernameDisplay.textContent = currentUser.username;
    settingsUserId.textContent = currentUser.id;
    settingsCreatedAt.textContent = currentUser.createdAt || new Date().toLocaleDateString();
    
    // Load settings
    notificationSound.checked = userSettings.notificationSound !== false;
    themeSelect.value = userSettings.theme || 'light';
  }

  // Handle avatar upload
  avatarUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        settingsAvatar.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  // Save settings
  saveSettings.onclick = async () => {
    const newUsername = settingsUsername.value.trim();
    const newAvatar = settingsAvatar.src;

    if (newUsername && newUsername !== currentUser.username) {
      currentUser.username = newUsername;
      userName.textContent = newUsername;
    }

    // Update avatar if changed
    if (newAvatar !== currentUser.avatar && newAvatar.startsWith('data:')) {
      // Convert base64 to blob and upload
      const blob = await fetch(newAvatar).then(r => r.blob());
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.png");
      formData.append("userId", currentUser.id);

      try {
        const res = await fetch("/uploadAvatar", {
          method: "POST",
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          currentUser.avatar = data.avatarUrl;
          userAvatar.src = data.avatarUrl;
        }
      } catch (err) {
        console.error("Error uploading avatar:", err);
      }
    } else if (newAvatar !== currentUser.avatar) {
      currentUser.avatar = newAvatar;
      userAvatar.src = newAvatar;
    }

    // Save settings
    userSettings = {
      ...userSettings,
      notificationSound: notificationSound.checked,
      theme: themeSelect.value
    };

    localStorage.setItem("userSettings", JSON.stringify(userSettings));
    localStorage.setItem("currentUser", JSON.stringify(currentUser));

    // Apply theme
    applyTheme(themeSelect.value);

    // Update profile on server
    try {
      await fetch("/updateProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar
        })
      });
    } catch (err) {
      console.error("Error updating profile:", err);
    }

    settingsModal.classList.add("hidden");
  };

  closeSettings.onclick = () => {
    settingsModal.classList.add("hidden");
  };

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.body.style.background = '#1a202c';
      document.body.style.color = '#f7fafc';
    } else if (theme === 'light') {
      document.body.style.background = '#fff';
      document.body.style.color = '#1a1a1a';
    } else {
      // System theme
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.style.background = '#1a202c';
        document.body.style.color = '#f7fafc';
      } else {
        document.body.style.background = '#fff';
        document.body.style.color = '#1a1a1a';
      }
    }
  }

  // Play notification sound
  function playNotificationSound() {
    if (userSettings.notificationSound !== false) {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(() => {});
    }
  }

  // Register
  async function register() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      errorP.innerText = "Заполните все поля";
      return;
    }

    try {
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        currentUser = { 
          id: data.id, 
          username: data.username, 
          avatar: data.avatar || "/uploads/default-avatar.png",
          createdAt: new Date().toISOString()
        };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        initChatScreen();
        socket.emit("login", currentUser.id);
      } else {
        errorP.innerText = data.error;
      }
    } catch (err) {
      errorP.innerText = "Ошибка соединения";
    }
  }

  // Login
  async function login() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      errorP.innerText = "Заполните все поля";
      return;
    }

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        currentUser = { 
          id: data.id, 
          username: data.username, 
          avatar: data.avatar || "/uploads/default-avatar.png",
          createdAt: new Date().toISOString()
        };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        initChatScreen();
        socket.emit("login", currentUser.id);
      } else {
        errorP.innerText = data.error;
      }
    } catch (err) {
      errorP.innerText = "Ошибка соединения";
    }
  }

  // Logout function
  function logout() {
    localStorage.removeItem("currentUser");
    currentUser = null;
    currentChat = null;
    users = [];
    chats = [];
    socket.disconnect();
    chatScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    usernameInput.value = "";
    passwordInput.value = "";
    errorP.innerText = "";
    messagesDiv.innerHTML = "";
    chatsContainer.innerHTML = "";
    pinnedContainer.innerHTML = "";
    chatName.textContent = "Выберите чат";
    chatStatus.textContent = "";
  }

  // Init chat screen
  async function initChatScreen() {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    
    userName.textContent = currentUser.username;
    userAvatar.src = currentUser.avatar;

    await loadUsers();
    await loadChats();
  }

  // Load users
  async function loadUsers() {
    try {
      const res = await fetch("/users");
      users = await res.json();
    } catch (err) {
      console.error("Error loading users:", err);
    }
  }

  // Load chats
  async function loadChats() {
    try {
      const res = await fetch(`/data/${currentUser.id}`);
      const data = await res.json();
      chats = data.chats || [];
      
      // Sort chats by last message time
      chats.sort((a, b) => {
        const aTime = a.messages[a.messages.length - 1]?.timestamp || 0;
        const bTime = b.messages[b.messages.length - 1]?.timestamp || 0;
        return bTime - aTime;
      });
      
      renderChats(chats);
    } catch (err) {
      console.error("Error loading chats:", err);
    }
  }

  // Render chats
  function renderChats(chatsToRender) {
    chatsContainer.innerHTML = "";
    pinnedContainer.innerHTML = "";

    if (chatsToRender.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "20px";
      empty.style.textAlign = "center";
      empty.style.color = "#6b7280";
      empty.textContent = "Нет чатов. Нажмите кнопку + чтобы добавить";
      chatsContainer.appendChild(empty);
      return;
    }

    // Separate pinned and regular chats
    const pinned = chatsToRender.filter(chat => chat.pinned);
    const regular = chatsToRender.filter(chat => !chat.pinned);

    // Render pinned chats
    pinned.forEach(chat => {
      const element = createChatElement(chat, true);
      pinnedContainer.appendChild(element);
    });

    // Render regular chats
    regular.forEach(chat => {
      const element = createChatElement(chat, false);
      chatsContainer.appendChild(element);
    });
  }

  function createChatElement(chat, isPinned) {
    const otherUser = chat.otherUser || { username: "Пользователь", avatar: "/uploads/default-avatar.png" };
    const lastMessage = chat.messages[chat.messages.length - 1];
    const unreadCount = chat.messages.filter(m => !m.read && m.userId !== currentUser.id).length;

    const div = document.createElement("div");
    div.className = isPinned ? "pinned-item" : "chat-item";
    if (currentChat && currentChat.id === chat.id) {
      div.classList.add("active");
    }
    div.onclick = () => openChat(chat);

    const time = lastMessage ? formatTime(lastMessage.timestamp) : '';
    const lastMessageText = lastMessage ? (lastMessage.text || '📎 Файл') : 'Нет сообщений';

    if (isPinned) {
      div.innerHTML = `
        <img src="${otherUser.avatar || '/uploads/default-avatar.png'}" class="pinned-avatar" onerror="this.src='/uploads/default-avatar.png'">
        <div class="pinned-info">
          <div class="pinned-name">
            <h4>${otherUser.username}</h4>
            <span class="time">${time}</span>
          </div>
          <div class="pinned-message">
            <span>${lastMessageText}</span>
            ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
          </div>
        </div>
      `;
    } else {
      div.innerHTML = `
        <img src="${otherUser.avatar || '/uploads/default-avatar.png'}" class="chat-avatar" onerror="this.src='/uploads/default-avatar.png'">
        <div class="chat-info">
          <div class="chat-name-row">
            <span class="chat-name">${otherUser.username}</span>
            <span class="chat-time">${time}</span>
          </div>
          <div class="chat-last-message">
            <span>${lastMessageText}</span>
            ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ''}
          </div>
        </div>
      `;
    }

    return div;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) { // Less than 24 hours
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  // Open chat
  async function openChat(chat) {
    currentChat = chat;
    
    const otherUser = chat.otherUser || { username: "Пользователь", avatar: "/uploads/default-avatar.png" };
    chatName.textContent = otherUser.username;
    
    const isOnline = users.find(u => u.id === otherUser.id)?.online;
    chatStatus.textContent = isOnline ? "в сети" : "не в сети";
    chatStatus.style.color = isOnline ? "#48bb78" : "#9ca3af";

    renderMessages(chat.messages);

    // Mark messages as read
    socket.emit("message read", { chatId: chat.id, userId: currentUser.id });
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      sidebar.classList.remove("show");
    }
    
    renderChats(chats);
  }

  // Render messages
  function renderMessages(messages) {
    messagesDiv.innerHTML = "";

    if (!messages || messages.length === 0) {
      const empty = document.createElement("div");
      empty.style.textAlign = "center";
      empty.style.color = "#9ca3af";
      empty.style.padding = "40px 20px";
      empty.textContent = "Нет сообщений. Напишите что-нибудь!";
      messagesDiv.appendChild(empty);
      return;
    }

    messages.forEach(msg => {
      addMessageToDOM(msg);
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // Add single message to DOM
  function addMessageToDOM(msg) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${msg.userId === currentUser.id ? 'self' : 'other'}`;

    let content = '<div class="message-bubble">';
    
    if (msg.userId !== currentUser.id) {
      const sender = users.find(u => u.id === msg.userId);
      content += `<div class="message-sender">${sender?.username || 'Пользователь'}</div>`;
    }

    if (msg.text) {
      content += `<div class="message-text">${msg.text}</div>`;
    }

    if (msg.file) {
      const fileName = msg.file.split('_').pop() || 'файл';
      content += `<div class="message-file"><a href="${msg.file}" target="_blank">📎 ${fileName}</a></div>`;
    }

    const readStatus = msg.read ? '✓✓' : '✓';
    content += `<div class="message-time">${msg.time} <span class="message-status">${msg.userId === currentUser.id ? readStatus : ''}</span></div>`;
    content += '</div>';

    messageDiv.innerHTML = content;
    messageDiv.dataset.id = msg.id;
    messagesDiv.appendChild(messageDiv);
  }

  // Send message
  async function sendMessage(e) {
    e.preventDefault();

    if (!currentChat) {
      alert("Выберите чат");
      return;
    }

    const text = messageInput.value.trim();
    const file = fileInput.files[0];

    if (!text && !file) return;

    const formData = new FormData();
    formData.append("chatId", currentChat.id);
    formData.append("userId", currentUser.id);
    if (text) formData.append("text", text);
    if (file) formData.append("file", file);

    try {
      const res = await fetch("/sendMessage", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        messageInput.value = "";
        fileInput.value = "";
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  }

  // Profile (updated to show settings instead of old profile modal)
  userProfile.onclick = () => {
    showSettingsModal();
  };

  // Keep old profile modal for backward compatibility
  closeProfile.onclick = () => {
    profileModal.classList.add("hidden");
  };

  saveProfile.onclick = async () => {
    const newName = profileName.value.trim();
    const newAvatar = profilePhoto.value.trim();

    if (newName) currentUser.username = newName;
    if (newAvatar) currentUser.avatar = newAvatar;

    userAvatar.src = currentUser.avatar;
    userName.textContent = currentUser.username;
    profileAvatar.src = currentUser.avatar;
    
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    profileModal.classList.add("hidden");

    try {
      await fetch("/updateProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar
        })
      });
    } catch (err) {
      console.error("Error updating profile:", err);
    }
  };

  // Socket events
  socket.on("newMessage", (data) => {
    console.log("New message received:", data);
    
    if (data.chatId === currentChat?.id) {
      addMessageToDOM(data.message);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      socket.emit("message read", { chatId: currentChat.id, userId: currentUser.id });
    }
    
    // Play notification sound if not in current chat
    if (data.chatId !== currentChat?.id) {
      playNotificationSound();
    }
    
    loadChats();
  });

  socket.on("messages read", (data) => {
    if (data.chatId === currentChat?.id) {
      const messageElements = messagesDiv.querySelectorAll(".message");
      messageElements.forEach(el => {
        const statusSpan = el.querySelector(".message-status");
        if (statusSpan) {
          statusSpan.textContent = "✓✓";
        }
      });
    }
  });

  socket.on("onlineUpdate", (data) => {
    const userIndex = users.findIndex(u => u.id === data.userId);
    if (userIndex !== -1) {
      users[userIndex].online = data.online;
    }

    if (currentChat) {
      const otherUser = currentChat.otherUser;
      if (otherUser && otherUser.id === data.userId) {
        chatStatus.textContent = data.online ? "в сети" : "не в сети";
        chatStatus.style.color = data.online ? "#48bb78" : "#9ca3af";
      }
    }
  });

  // Event listeners
  registerBtn.onclick = register;
  loginBtn.onclick = login;
  logoutBtn.onclick = logout;
  sendForm.onsubmit = sendMessage;

  // Add user button
  const addUserBtn = document.createElement("button");
  addUserBtn.className = "add-user-btn";
  addUserBtn.innerHTML = "+";
  addUserBtn.onclick = showAddUserModal;
  document.body.appendChild(addUserBtn);

  // Click outside emoji panel
  document.addEventListener("click", (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) {
      emojiPanel.classList.remove("show");
    }
  });

  // Handle window resize
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      sidebar.classList.remove("show");
    }
  });

  // Close modals when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add('hidden');
    }
  });

  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (userSettings.theme === 'system') {
        applyTheme('system');
      }
    });
  }
});