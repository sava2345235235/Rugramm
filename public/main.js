document.addEventListener("DOMContentLoaded", () => {
  const socket = io();
  let currentUser = null;
  let currentChatId = null;
  let usersList = [];

  // Проверка сохранённого пользователя
  if (localStorage.getItem("currentUser")) {
    currentUser = JSON.parse(localStorage.getItem("currentUser"));
    initChatScreen();
    socket.emit("login", currentUser.id);
  }

  async function register() {
    const username = document.getElementById("usernameInput").value;
    const password = document.getElementById("passwordInput").value;
    const res = await fetch("/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (data.success) { currentUser = data; localStorage.setItem("currentUser", JSON.stringify(currentUser)); initChatScreen(); socket.emit("login", currentUser.id); }
    else document.getElementById("error").innerText = data.error;
  }

  async function login() {
    const username = document.getElementById("usernameInput").value;
    const password = document.getElementById("passwordInput").value;
    const res = await fetch("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (data.success) { currentUser = data; localStorage.setItem("currentUser", JSON.stringify(currentUser)); initChatScreen(); socket.emit("login", currentUser.id); }
    else document.getElementById("error").innerText = data.error;
  }

  async function initChatScreen() {
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("chatScreen").classList.remove("hidden");
    document.getElementById("profileName").innerText = currentUser.username;
    document.getElementById("profileAvatar").src = currentUser.avatar || "default.png";
    await loadUsers();
    await loadChats();
  }

  async function loadUsers() { usersList = await (await fetch("/users")).json(); renderUserStatus(); }

  function renderUserStatus() {
    usersList.forEach(u => {
      const chatDiv = document.querySelector(`#chatUser-${u.id}`);
      if (chatDiv) chatDiv.querySelector(".status").innerText = u.online ? "online" : "offline";
    });
  }

  async function loadChats() {
    const data = await (await fetch(`/data/${currentUser.id}`)).json();
    const container = document.getElementById("chatsContainer");
    container.innerHTML = "";
    data.chats.forEach(chat => {
      const div = document.createElement("div");
      div.classList.add("chatItem");
      div.id = `chatUser-${chat.id}`;
      div.innerHTML = `<span>Чат ${chat.id}</span><span class="status">offline</span>`;
      div.onclick = () => openChat(chat.id);
      container.appendChild(div);
    });
  }

  function openChat(chatId) {
    currentChatId = chatId;
    document.getElementById("messages").innerHTML = "";
    fetch(`/data/${currentUser.id}`).then(res => res.json()).then(data => {
      const chat = data.chats.find(c => c.id === chatId);
      if (!chat) return;
      chat.messages.forEach(m => addMessage(m));
      // Отправляем прочтение сообщений
      socket.emit("read messages", { chatId, userId: currentUser.id });
    });
  }

  function sendMessage() {
    const msg = document.getElementById("messageInput").value;
    if (!msg || !currentChatId) return;
    const data = { chatId: currentChatId, userId: currentUser.id, text: msg };
    socket.emit("chat message", data);
    addMessage({ ...data, readBy: [currentUser.id] });
    document.getElementById("messageInput").value = "";
  }

  function addMessage(m) {
    const div = document.createElement("div");
    div.classList.add("message");
    div.classList.add(m.userId === currentUser.id ? "self" : "other");
    const readStatus = m.readBy && m.readBy.includes(currentUser.id) ? "✔✔" : "✔";
    div.innerText = (m.userId === currentUser.id ? "Я" : "Пользователь " + m.userId) + ": " + m.text + " " + readStatus;
    document.getElementById("messages").appendChild(div);
    div.scrollIntoView({ behavior: "smooth" });
  }

  async function addUser() {
    const username = prompt("Введите username");
    if (!username) return;
    const user = usersList.find(u => u.username === username);
    if (!user) { alert("Пользователь не найден"); return; }
    const res = await fetch("/createChat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ members: [currentUser.id, user.id] }) });
    const data = await res.json();
    if (data.success) { loadChats(); openChat(data.chat.id); }
  }

  // Socket.IO события
  socket.on("chat message", data => { if (data.chatId === currentChatId) addMessage(data); });
  socket.on("updateOnline", data => { usersList.find(u => u.id === data.userId).online = data.online; renderUserStatus(); });
  socket.on("updateRead", data => { if (data.chatId === currentChatId) openChat(currentChatId); });

  // Профиль
  const profileBlock = document.getElementById("profileBlock");
  const profileModal = document.getElementById("profileModal");
  const closeProfileBtn = document.getElementById("closeProfileBtn");
  const saveProfileBtn = document.getElementById("saveProfileBtn");

  profileBlock.onclick = () => profileModal.classList.remove("hidden");
  closeProfileBtn.onclick = () => profileModal.classList.add("hidden");
  saveProfileBtn.onclick = () => {
    const name = document.getElementById("editName").value;
    const avatar = document.getElementById("editAvatar").value;
    if (name) { currentUser.username = name; document.getElementById("profileName").innerText = name; }
    if (avatar) { currentUser.avatar = avatar; document.getElementById("profileAvatar").src = avatar; }
    localStorage.setItem("currentUser", JSON.stringify(currentUser));
    profileModal.classList.add("hidden");
  }

  document.getElementById("registerBtn").onclick = register;
  document.getElementById("loginBtn").onclick = login;
  document.getElementById("addUserBtn").onclick = addUser;
  document.getElementById("sendBtn").onclick = sendMessage;
});