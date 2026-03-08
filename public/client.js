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

  socket.on('connect_error', (error) => {
    console.error('❌ Socket connection error:', error);
  });

  let currentUser = null;
  let currentChat = null;
  let users = [];
  let chats = [];
  let userSettings = {};

  // DOM Elements
  const loginScreen = document.getElementById("loginScreen");
  const chatScreen = document.getElementById("chatScreen");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const registerBtn = document.getElementById("registerBtn");
  const loginBtn = document.getElementById("loginBtn");
  const errorP = document.getElementById("error");

  // Check saved user
  const savedUser = localStorage.getItem("currentUser");
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      console.log('✅ Found saved user:', currentUser);
      initChatScreen();
    } catch (err) {
      console.error('Error parsing saved user:', err);
      localStorage.removeItem("currentUser");
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
      console.log('📝 Registering:', username);
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      console.log('📝 Register response:', data);

      if (data.success) {
        currentUser = { 
          id: data.id, 
          username: data.username, 
          avatar: data.avatar || "/uploads/default-avatar.png"
        };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        console.log('✅ Registered and saved user:', currentUser);
        initChatScreen();
        if (socket.connected) {
          socket.emit("login", currentUser.id);
        }
      } else {
        errorP.innerText = data.error || "Ошибка регистрации";
      }
    } catch (err) {
      console.error('❌ Register error:', err);
      errorP.innerText = "Ошибка соединения с сервером";
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
      console.log('🔑 Logging in:', username);
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      
      const data = await res.json();
      console.log('🔑 Login response:', data);

      if (data.success) {
        currentUser = { 
          id: data.id, 
          username: data.username, 
          avatar: data.avatar || "/uploads/default-avatar.png"
        };
        localStorage.setItem("currentUser", JSON.stringify(currentUser));
        console.log('✅ Login successful:', currentUser);
        initChatScreen();
        if (socket.connected) {
          socket.emit("login", currentUser.id);
        }
      } else {
        errorP.innerText = data.error || "Неверный логин или пароль";
      }
    } catch (err) {
      console.error('❌ Login error:', err);
      errorP.innerText = "Ошибка соединения с сервером";
    }
  }

  // Init chat screen
  async function initChatScreen() {
    console.log('🎯 Initializing chat screen for:', currentUser);
    loginScreen.classList.add("hidden");
    chatScreen.classList.remove("hidden");
    
    const userName = document.getElementById("userName");
    const userAvatar = document.getElementById("userAvatar");
    
    if (userName) userName.textContent = currentUser.username;
    if (userAvatar) userAvatar.src = currentUser.avatar;

    await loadUsers();
    await loadChats();
  }

  // Load users
  async function loadUsers() {
    try {
      const res = await fetch("/users");
      users = await res.json();
      console.log('👥 Users loaded:', users.length);
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
      console.log('💬 Chats loaded:', chats.length);
      renderChats(chats);
    } catch (err) {
      console.error("Error loading chats:", err);
    }
  }

  // Minimal render function
  function renderChats(chatsToRender) {
    const chatsContainer = document.getElementById("chatsContainer");
    if (!chatsContainer) return;
    
    chatsContainer.innerHTML = "";

    if (chatsToRender.length === 0) {
      const empty = document.createElement("div");
      empty.style.padding = "20px";
      empty.style.textAlign = "center";
      empty.style.color = "#6b7280";
      empty.textContent = "Нет чатов";
      chatsContainer.appendChild(empty);
      return;
    }

    chatsToRender.forEach(chat => {
      const otherUser = chat.otherUser || { username: "Пользователь" };
      const div = document.createElement("div");
      div.className = "chat-item";
      div.innerHTML = `<div class="chat-name">${otherUser.username}</div>`;
      chatsContainer.appendChild(div);
    });
  }

  // Event listeners
  registerBtn.onclick = register;
  loginBtn.onclick = login;

  console.log('🚀 App initialized');
});