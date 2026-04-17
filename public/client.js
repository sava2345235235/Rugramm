document.addEventListener("DOMContentLoaded", () => {
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected');
    if (currentUser) {
      socket.emit('login', currentUser.id);
    }
  });

  let currentUser = null;
  let currentChat = null;
  let users = [];
  let chats = [];
  let userSettings = {};

  // Load user settings
  const savedSettings = localStorage.getItem("userSettings");
  if (savedSettings) {
    userSettings = JSON.parse(savedSettings);
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
  const errorP = document.getElementById("error");
  const userProfile = document.getElementById("userProfile");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const chatName = document.getElementById("chatName");
  const chatStatus = document.getElementById("chatStatus");
  const fileInput = document.getElementById("fileInput");
  const fileBtn = document.getElementById("attachBtn");
  const sendBtn = document.getElementById("sendBtn");
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const sidebar = document.getElementById("sidebar");
  const searchInput = document.getElementById("searchInput");
  const audioCallBtn = document.getElementById("audioCallBtn");
  const videoCallBtn = document.getElementById("videoCallBtn");

  // New elements
  const addUserBtn = document.getElementById("addUserBtn");
  const settingsModal = document.getElementById("settingsModal");
  const addUserModal = document.getElementById("addUserModal");
  const addUsernameInput = document.getElementById("addUsernameInput");
  const userSearchResults = document.getElementById("userSearchResults");
  const confirmAddUser = document.getElementById("confirmAddUser");
  const closeAddUser = document.getElementById("closeAddUser");
  const settingsAvatar = document.getElementById("settingsAvatar");
  const settingsUsername = document.getElementById("settingsUsername");
  const settingsUserId = document.getElementById("settingsUserId");
  const settingsCreatedAt = document.getElementById("settingsCreatedAt");
  const notificationSound = document.getElementById("notificationSound");
  const themeSelect = document.getElementById("themeSelect");
  const avatarUpload = document.getElementById("avatarUpload");
  const saveSettings = document.getElementById("saveSettings");
  const closeSettings = document.getElementById("closeSettings");
  const logoutBtn = document.getElementById("logoutBtn");

  // ============== PROFILE SETTINGS ==============

  if (userProfile) {
    userProfile.onclick = () => {
      console.log("Opening settings modal");
      if (settingsModal && currentUser) {
        settingsModal.classList.remove("hidden");
        
        settingsAvatar.src = currentUser.avatar || '/uploads/default-avatar.png';
        settingsUsername.value = currentUser.username;
        if (settingsUserId) settingsUserId.textContent = currentUser.id;
        if (settingsCreatedAt) settingsCreatedAt.textContent = currentUser.createdAt || new Date().toLocaleDateString();
        
        notificationSound.checked = userSettings.notificationSound !== false;
        themeSelect.value = userSettings.theme || 'light';
      }
    };
  }

  if (closeSettings) {
    closeSettings.onclick = () => {
      settingsModal.classList.add("hidden");
    };
  }

  if (avatarUpload) {
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
  }

  if (saveSettings) {
    saveSettings.onclick = async () => {
      const newUsername = settingsUsername.value.trim();
      const newAvatar = settingsAvatar.src;

      if (newUsername && newUsername !== currentUser.username) {
        currentUser.username = newUsername;
        userName.textContent = newUsername;
      }

      if (newAvatar !== currentUser.avatar && newAvatar.startsWith('data:')) {
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

      userSettings = {
        ...userSettings,
        notificationSound: notificationSound.checked,
        theme: themeSelect.value
      };

      localStorage.setItem("userSettings", JSON.stringify(userSettings));
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

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
  }

  // ============== LOGOUT ==============
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      console.log("Logging out...");
      
      localStorage.removeItem("currentUser");
      localStorage.removeItem("userSettings");
      
      currentUser = null;
      currentChat = null;
      users = [];
      chats = [];
      
      if (socket) {
        socket.disconnect();
      }
      
      chatScreen.classList.add("hidden");
      loginScreen.classList.remove("hidden");
      
      usernameInput.value = "";
      passwordInput.value = "";
      errorP.innerText = "";
      
      messagesDiv.innerHTML = "";
      chatsContainer.innerHTML = "";
      
      chatName.textContent = "Выберите чат";
      chatStatus.textContent = "";
      
      settingsModal.classList.add("hidden");
      
      console.log("User logged out successfully");
    };
  }

  // ============== ADD USER ==============
  
  function showAddUserModal() {
    console.log("Opening add user modal");
    if (addUserModal) {
      addUserModal.classList.remove("hidden");
      if (addUsernameInput) {
        addUsernameInput.value = "";
        addUsernameInput.focus();
      }
      if (userSearchResults) {
        userSearchResults.innerHTML = "";
      }
    }
  }

  if (addUserBtn) {
    addUserBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAddUserModal();
    };
    
    addUserBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAddUserModal();
    }, { passive: false });
  }

  if (closeAddUser) {
    closeAddUser.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      addUserModal.classList.add("hidden");
    };
    
    closeAddUser.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      addUserModal.classList.add("hidden");
    }, { passive: false });
  }

  // ============== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ==============
  
  if (addUsernameInput) {
    let searchUserTimeout;
    
    addUsernameInput.addEventListener("input", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      clearTimeout(searchUserTimeout);
      const query = addUsernameInput.value.trim();
      
      console.log("Search query:", query);
      
      if (query.length < 1) {
        if (userSearchResults) {
          userSearchResults.innerHTML = "";
        }
        return;
      }

      if (userSearchResults) {
        userSearchResults.innerHTML = '<div style="text-align:center; padding:20px; color:#9ca3af;">🔍 Поиск...</div>';
      }

      searchUserTimeout = setTimeout(() => {
        searchUsers(query);
      }, 300);
    });

    addUsernameInput.addEventListener("touchstart", (e) => {
      e.stopPropagation();
    });
  }

  async function searchUsers(query) {
    const searchTerm = query.startsWith('@') ? query.substring(1) : query;
    
    try {
      console.log("Searching for:", searchTerm);
      
      const res = await fetch(`/search/users?q=${encodeURIComponent(searchTerm)}`);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const filteredUsers = await res.json();
      
      console.log("Found users:", filteredUsers);

      if (!userSearchResults) return;

      if (filteredUsers.length === 0) {
        userSearchResults.innerHTML = '<div style="text-align:center; padding:20px; color:#9ca3af;">😕 Пользователи не найдены</div>';
        return;
      }

      // Очищаем контейнер и добавляем элементы безопасно
      userSearchResults.innerHTML = '';
      
      filteredUsers.forEach(user => {
        const itemDiv = document.createElement("div");
        itemDiv.className = "user-search-item";
        itemDiv.dataset.userId = user.id;
        itemDiv.dataset.username = user.username;
        
        const img = document.createElement("img");
        img.src = user.avatar || '/uploads/default-avatar.png';
        img.alt = user.username;
        
        const infoDiv = document.createElement("div");
        infoDiv.className = "user-info";
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "user-name";
        nameDiv.textContent = user.username; // Используем textContent для защиты от XSS
        
        const statusDiv = document.createElement("div");
        statusDiv.className = "user-status";
        
        const dotSpan = document.createElement("span");
        dotSpan.className = `status-dot ${user.online ? 'online' : 'offline'}`;
        
        const textSpan = document.createElement("span");
        textSpan.style.color = user.online ? '#22c55e' : '#9ca3af';
        textSpan.textContent = user.online ? 'в сети' : 'не в сети'; // Используем textContent для защиты от XSS
        
        statusDiv.appendChild(dotSpan);
        statusDiv.appendChild(textSpan);
        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(statusDiv);
        itemDiv.appendChild(img);
        itemDiv.appendChild(infoDiv);
        userSearchResults.appendChild(itemDiv);
      });

      document.querySelectorAll('.user-search-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const username = item.dataset.username;
          if (addUsernameInput) {
            addUsernameInput.value = '@' + username;
          }
          if (userSearchResults) {
            userSearchResults.innerHTML = '';
          }
        });
        
        item.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const username = item.dataset.username;
          if (addUsernameInput) {
            addUsernameInput.value = '@' + username;
          }
          if (userSearchResults) {
            userSearchResults.innerHTML = '';
          }
        }, { passive: false });
      });
      
    } catch (err) {
      console.error("Error searching users:", err);
      if (userSearchResults) {
        userSearchResults.innerHTML = '<div style="text-align:center; padding:20px; color:#ef4444;">❌ Ошибка поиска</div>';
      }
    }
  }

  // ============== СОЗДАНИЕ ЧАТА ==============
  
  async function handleAddUser() {
    console.log("handleAddUser called");
    
    if (!addUsernameInput) {
      console.error("addUsernameInput not found");
      return;
    }
    
    let username = addUsernameInput.value.trim();
    console.log("Username to add:", username);
    
    if (!username) {
      alert("Введите username");
      return;
    }

    if (username.startsWith('@')) {
      username = username.substring(1);
    }

    console.log("Looking for user:", username);
    console.log("Available users:", users);

    const user = users.find(u => u.username === username);
    if (!user) {
      console.log("User not found");
      alert("Пользователь не найден");
      return;
    }

    console.log("Found user:", user);

    if (user.id === currentUser.id) {
      alert("Нельзя добавить самого себя");
      return;
    }

    // Проверяем существующий чат
    const existingChat = chats.find(chat => {
      if (!chat.members || !Array.isArray(chat.members)) return false;
      return chat.members.includes(currentUser.id) && chat.members.includes(user.id);
    });

    if (existingChat) {
      console.log("Existing chat found:", existingChat);
      addUserModal.classList.add("hidden");
      
      if (!existingChat.otherUser) {
        existingChat.otherUser = {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          online: user.online
        };
      }
      
      await openChat(existingChat);
      return;
    }

    try {
      console.log("Creating new chat with:", user.id);
      const res = await fetch("/createChat", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ 
          members: [currentUser.id, user.id] 
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log("Create chat response:", data);

      if (data.success && data.chat) {
        console.log("Chat created successfully:", data.chat);
        
        const newChat = {
          ...data.chat,
          otherUser: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            online: user.online
          },
          messages: data.chat.messages || []
        };
        
        chats = [newChat, ...chats];
        renderChats(chats);
        
        addUserModal.classList.add("hidden");
        await openChat(newChat);
      } else {
        alert(data.error || "Ошибка при создании чата");
      }
    } catch (err) {
      console.error("Error creating chat:", err);
      alert("Ошибка при создании чата: " + err.message);
    }
  }

  if (confirmAddUser) {
    confirmAddUser.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Confirm add user clicked");
      await handleAddUser();
    });
    
    confirmAddUser.addEventListener('touchstart', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log("Confirm add user touched");
      await handleAddUser();
    }, { passive: false });
  }

  // ============== REGISTER & LOGIN ==============

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
        if (socket.connected) {
          socket.emit("login", currentUser.id);
        }
      } else {
        errorP.innerText = data.error || "Ошибка регистрации";
      }
    } catch (err) {
      console.error("Register error:", err);
      errorP.innerText = "Ошибка соединения с сервером";
    }
  }

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
        if (socket.connected) {
          socket.emit("login", currentUser.id);
        }
      } else {
        errorP.innerText = data.error || "Неверный логин или пароль";
      }
    } catch (err) {
      console.error("Login error:", err);
      errorP.innerText = "Ошибка соединения с сервером";
    }
  }

  // ============== CHAT FUNCTIONS ==============

  async function initChatScreen() {
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    
    userName.textContent = currentUser.username;
    userAvatar.src = currentUser.avatar;

    await loadUsers();
    await loadChats();
  }

  async function loadUsers() {
    try {
      const res = await fetch("/users");
      users = await res.json();
      console.log("Users loaded:", users);
    } catch (err) {
      console.error("Error loading users:", err);
    }
  }

  async function loadChats() {
    try {
      const res = await fetch(`/data/${currentUser.id}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      chats = data.chats || [];
      console.log("Chats loaded:", chats);
      
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

  function renderChats(chatsToRender) {
    if (!chatsContainer) return;
    
    chatsContainer.innerHTML = "";

    if (chatsToRender.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "20px";
      empty.style.textAlign = "center";
      empty.style.color = "#6b7280";
      empty.textContent = "Нет чатов. Нажмите кнопку + чтобы добавить";
      chatsContainer.appendChild(empty);
      return;
    }

    chatsToRender.forEach(chat => {
      const element = createChatElement(chat);
      chatsContainer.appendChild(element);
    });
  }

  function createChatElement(chat) {
    const otherUser = chat.otherUser || { username: "Пользователь", avatar: "/uploads/default-avatar.png" };
    const lastMessage = chat.messages[chat.messages.length - 1];
    const unreadCount = chat.messages.filter(m => !m.read && m.userId !== currentUser.id).length;

    const div = document.createElement("div");
    div.className = "chat-item";
    if (currentChat && currentChat.id === chat.id) {
      div.classList.add("active");
    }
    div.onclick = () => openChat(chat);

    const time = lastMessage ? formatTime(lastMessage.timestamp) : '';
    const lastMessageText = lastMessage ? (lastMessage.text || '📎 Файл') : 'Нет сообщений';

    // Создаем элементы безопасно с помощью textContent
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "chat-avatar";
    avatarDiv.textContent = otherUser.username.charAt(0);
    
    const infoDiv = document.createElement("div");
    infoDiv.className = "chat-info";
    
    const nameRowDiv = document.createElement("div");
    nameRowDiv.className = "chat-name-row";
    
    const nameSpan = document.createElement("span");
    nameSpan.className = "chat-name";
    nameSpan.textContent = otherUser.username; // Используем textContent для защиты от XSS
    
    const timeSpan = document.createElement("span");
    timeSpan.className = "chat-time";
    timeSpan.textContent = time;
    
    nameRowDiv.appendChild(nameSpan);
    nameRowDiv.appendChild(timeSpan);
    
    const messageDiv = document.createElement("div");
    messageDiv.className = "chat-last-message";
    
    const messageTextSpan = document.createElement("span");
    messageTextSpan.className = "last-message-text";
    messageTextSpan.textContent = lastMessageText; // Используем textContent для защиты от XSS
    messageDiv.appendChild(messageTextSpan);
    
    if (unreadCount > 0) {
      const unreadSpan = document.createElement("span");
      unreadSpan.className = "unread-count";
      unreadSpan.textContent = unreadCount;
      messageDiv.appendChild(unreadSpan);
    }
    
    infoDiv.appendChild(nameRowDiv);
    infoDiv.appendChild(messageDiv);
    div.appendChild(avatarDiv);
    div.appendChild(infoDiv);

    return div;
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }

  async function openChat(chat) {
    currentChat = chat;
    
    const otherUser = chat.otherUser || { username: "Пользователь", avatar: "/uploads/default-avatar.png" };
    chatName.textContent = otherUser.username;
    
    const isOnline = users.find(u => u.id === otherUser.id)?.online;
    chatStatus.innerHTML = isOnline ? '<span class="online-dot"></span> online' : 'не в сети';

    renderMessages(chat.messages);

    socket.emit("message read", { chatId: chat.id, userId: currentUser.id });
    
    if (window.innerWidth <= 768) {
      sidebar.classList.remove("show");
    }
    
    renderChats(chats);
  }

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

  function addMessageToDOM(msg) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${msg.userId === currentUser.id ? 'my-message' : 'their-message'}`;

    const messageBubble = document.createElement("div");
    messageBubble.className = "message-bubble";
    
    if (msg.userId !== currentUser.id) {
      const sender = users.find(u => u.id === msg.userId);
      const senderDiv = document.createElement("div");
      senderDiv.className = "message-sender";
      senderDiv.textContent = sender?.username || 'Пользователь';
      messageBubble.appendChild(senderDiv);
    }

    if (msg.text) {
      const textDiv = document.createElement("div");
      textDiv.textContent = msg.text; // Используем textContent для защиты от XSS
      messageBubble.appendChild(textDiv);
    }

    if (msg.file) {
      const fileDiv = document.createElement("div");
      fileDiv.className = "message-file";
      const isImage = msg.file.match(/\.(jpg|jpeg|png|gif|webp)$/i);
      if (isImage) {
        const img = document.createElement("img");
        img.src = msg.file;
        img.alt = "image";
        img.style.cssText = "max-width: 100%; max-height: 200px; border-radius: 10px;";
        fileDiv.appendChild(img);
      } else {
        const fileName = msg.file.split('/').pop() || 'файл';
        const link = document.createElement("a");
        link.href = msg.file;
        link.target = "_blank";
        link.textContent = "📎 " + fileName;
        fileDiv.appendChild(link);
      }
      messageBubble.appendChild(fileDiv);
    }

    const timeDiv = document.createElement("div");
    timeDiv.className = "message-time";
    const readStatus = msg.read ? '✓✓' : '✓';
    timeDiv.textContent = `${msg.time} `;
    if (msg.userId === currentUser.id) {
      const statusSpan = document.createElement("span");
      statusSpan.className = "message-status";
      statusSpan.textContent = readStatus;
      timeDiv.appendChild(statusSpan);
    }
    messageBubble.appendChild(timeDiv);

    messageDiv.appendChild(messageBubble);
    messageDiv.dataset.id = msg.id;
    messagesDiv.appendChild(messageDiv);
  }

  // ============== SEND MESSAGE - ИСПРАВЛЕНО ==============

  async function sendMessage(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!currentChat) {
      alert("Выберите чат");
      return;
    }

    const text = messageInput.value.trim();
    const file = fileInput.files[0];

    if (!text && !file) return;

    // Временно показываем сообщение
    const tempId = 'temp-' + Date.now();
    const tempMessage = {
      id: tempId,
      userId: currentUser.id,
      text: text,
      file: file ? URL.createObjectURL(file) : null,
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      read: false
    };

    // Добавляем сообщение в UI сразу
    addMessageToDOM(tempMessage);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    const formData = new FormData();
    formData.append("chatId", currentChat.id);
    formData.append("userId", currentUser.id);
    if (text) formData.append("text", text);
    if (file) formData.append("file", file);

    if (sendBtn) {
      sendBtn.classList.add('loading');
    }

    try {
      const res = await fetch("/sendMessage", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (data.success) {
        messageInput.value = "";
        fileInput.value = "";
        
        // Удаляем временное сообщение
        const tempMsg = document.querySelector(`[data-id="${tempId}"]`);
        if (tempMsg) {
          tempMsg.remove();
        }
        
        // Добавляем сообщение через сокет (сервер отправит)
        console.log("Message sent successfully");
      }
    } catch (err) {
      console.error("Error sending message:", err);
      alert("Ошибка при отправке");
      
      // Помечаем временное сообщение как ошибочное
      const tempMsg = document.querySelector(`[data-id="${tempId}"]`);
      if (tempMsg) {
        tempMsg.classList.add('error');
      }
    } finally {
      if (sendBtn) {
        sendBtn.classList.remove('loading');
      }
    }
  }

  if (sendBtn) {
    sendBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await sendMessage(e);
    };
    
    sendBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendBtn.click();
    }, { passive: false });
  }

  if (sendForm) {
    sendForm.onsubmit = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await sendMessage(e);
      return false;
    };
  }

  // ============== FILE ATTACHMENT ==============

  if (fileBtn) {
    fileBtn.onclick = function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log("File button clicked");
      if (fileInput) {
        fileInput.click();
      }
    };
    
    fileBtn.addEventListener("touchstart", function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log("File button touched");
      if (fileInput) {
        fileInput.click();
      }
    }, { passive: false });
  }

  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      if (this.files.length > 0) {
        console.log('File selected:', this.files[0].name);
        if (window.innerWidth <= 768) {
          sendMessage(new Event('submit'));
        }
      }
    });
  }

  // ============== MOBILE MENU ==============

  if (mobileMenuBtn) {
    mobileMenuBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.toggle("show");
    };
    
    mobileMenuBtn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.toggle("show");
    }, { passive: false });
  }

  // Close sidebar on mobile when clicking outside
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768) {
      if (sidebar && !sidebar.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
        sidebar.classList.remove("show");
      }
    }
  });

  document.addEventListener("touchstart", (e) => {
    if (window.innerWidth <= 768) {
      if (sidebar && !sidebar.contains(e.target) && mobileMenuBtn && !mobileMenuBtn.contains(e.target)) {
        sidebar.classList.remove("show");
      }
    }
  });

  // ============== SEARCH CHATS ==============

  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener("input", (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        filterChats(searchInput.value);
      }, 300);
    });
  }

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

  // ============== CALL BUTTONS ==============

  if (audioCallBtn) {
    audioCallBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentChat) {
        alert("Выберите чат");
        return;
      }
      alert("Голосовой звонок (в разработке)");
    };
  }

  if (videoCallBtn) {
    videoCallBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!currentChat) {
        alert("Выберите чат");
        return;
      }
      alert("Видеозвонок (в разработке)");
    };
  }

  // ============== SOCKET EVENTS - ИСПРАВЛЕНО ==============

  socket.on("newMessage", (data) => {
    console.log("New message received:", data);
    
    // Добавляем сообщение в текущий чат если он открыт
    if (data.chatId === currentChat?.id) {
      addMessageToDOM(data.message);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      socket.emit("message read", { chatId: currentChat.id, userId: currentUser.id });
    }
    
    // Обновляем список чатов (для последнего сообщения)
    const chatIndex = chats.findIndex(c => c.id === data.chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].messages.push(data.message);
      chats[chatIndex].lastMessage = data.message;
      
      // Перемещаем чат вверх
      const chat = chats.splice(chatIndex, 1)[0];
      chats.unshift(chat);
      
      renderChats(chats);
    }
  });

  socket.on("messages read", (data) => {
    console.log("Messages read:", data);
    
    if (data.chatId === currentChat?.id) {
      const messageElements = messagesDiv.querySelectorAll(".message");
      messageElements.forEach(el => {
        const statusSpan = el.querySelector(".message-status");
        if (statusSpan) {
          statusSpan.textContent = "✓✓";
        }
      });
    }
    
    const chatIndex = chats.findIndex(c => c.id === data.chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].messages.forEach(msg => {
        if (msg.userId !== currentUser.id) {
          msg.read = true;
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
        chatStatus.innerHTML = data.online ? '<span class="online-dot"></span> online' : 'не в сети';
      }
    }
    
    renderChats(chats);
  });

  // ============== EVENT LISTENERS ==============

  registerBtn.onclick = register;
  loginBtn.onclick = login;

  // Check saved user
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      initChatScreen();
      if (socket.connected) {
        socket.emit("login", currentUser.id);
      }
    } catch (err) {
      console.error("Error parsing saved user:", err);
      localStorage.removeItem("currentUser");
    }
  }

  // Close modals when clicking outside
  window.addEventListener("click", (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add("hidden");
    }
  });

  window.addEventListener("touchstart", (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add("hidden");
    }
  });

  // Стили
  const style = document.createElement('style');
  style.textContent = `
    .send-btn.loading {
      opacity: 0.5;
      pointer-events: none;
    }
    .send-btn.loading svg {
      animation: spin 1s linear infinite;
    }
    .message.error .message-bubble {
      background: linear-gradient(135deg, #991b1b, #7f1d1d, #991b1b) !important;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  console.log('🚀 App fully loaded');
});