document.addEventListener("DOMContentLoaded", () => {
  const socket = io()
  let currentUser = null
  let currentChatId = null
  let usersList = []

  // HTML элементы
  const usernameInput = document.getElementById("usernameInput")
  const passwordInput = document.getElementById("passwordInput")
  const registerBtn = document.getElementById("registerBtn")
  const loginBtn = document.getElementById("loginBtn")
  const addUserBtn = document.getElementById("addUserBtn")
  const sendBtn = document.getElementById("sendBtn")
  const messageInput = document.getElementById("messageInput")
  const messagesDiv = document.getElementById("messages")
  const chatsContainer = document.getElementById("chatsContainer")
  const errorP = document.getElementById("error")

  const userProfile = document.getElementById("userProfile")
  const userAvatar = document.getElementById("userAvatar")
  const profileModal = document.getElementById("profileModal")
  const closeProfile = document.getElementById("closeProfile")
  const saveProfile = document.getElementById("saveProfile")
  const profileName = document.getElementById("profileName")
  const profilePhoto = document.getElementById("profilePhoto")
  const profileAvatar = document.getElementById("profileAvatar")

  // ---------------- Регистрация ----------------
  async function register() {
    const username = usernameInput.value
    const password = passwordInput.value
    const res = await fetch("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    if (data.success) {
      currentUser = { id: data.id, username: data.username, avatar: "default-avatar.png" }
      localStorage.setItem("currentUser", JSON.stringify(currentUser))
      initChatScreen()
    } else errorP.innerText = data.error
  }

  // ---------------- Вход ----------------
  async function login() {
    const username = usernameInput.value
    const password = passwordInput.value
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    if (data.success) {
      currentUser = { id: data.id, username: data.username, avatar: "default-avatar.png" }
      localStorage.setItem("currentUser", JSON.stringify(currentUser))
      initChatScreen()
    } else errorP.innerText = data.error
  }

  // ---------------- Инициализация чата ----------------
  async function initChatScreen() {
    document.getElementById("loginScreen").classList.add("hidden")
    document.getElementById("chatScreen").classList.remove("hidden")
    userAvatar.src = currentUser.avatar || "default-avatar.png"

    await loadUsers()
    await loadChats()
  }

  // ---------------- Загрузка пользователей ----------------
  async function loadUsers() {
    usersList = await (await fetch("/users")).json()
  }

  // ---------------- Загрузка чатов ----------------
  async function loadChats() {
    const data = await (await fetch(`/data/${currentUser.id}`)).json()
    chatsContainer.innerHTML = ""
    data.chats.forEach(chat => {
      const div = document.createElement("div")
      div.classList.add("chatItem")
      div.innerText = `Чат ${chat.id}`
      div.onclick = () => openChat(chat.id)
      chatsContainer.appendChild(div)
    })
  }

  // ---------------- Открытие чата ----------------
  async function openChat(chatId) {
    currentChatId = chatId
    messagesDiv.innerHTML = ""
    const data = await (await fetch(`/data/${currentUser.id}`)).json()
    const chatMessages = data.chats.find(c => c.id === chatId)?.messages || []
    chatMessages.forEach(m => addMessage(m))

    // Сообщения прочитаны
    socket.emit("message read", { chatId: chatId, userId: currentUser.id })
  }

  // ---------------- Отправка сообщения ----------------
  function sendMessage() {
    const msg = messageInput.value
    if (!msg || !currentChatId) return
    const data = { chatId: currentChatId, userId: currentUser.id, text: msg }
    socket.emit("chat message", data)
    addMessage({ ...data, status: "sent" })
    messageInput.value = ""
  }

  // ---------------- Добавление сообщения в DOM ----------------
  function addMessage(m) {
    const div = document.createElement("div")
    div.classList.add("message", m.userId === currentUser.id ? "self" : "other")
    const sender = m.userId === currentUser.id ? "Я" : `Пользователь ${m.userId}`
    div.innerText = `${sender}: ${m.text} (${m.status})`
    div.dataset.userId = m.userId
    div.dataset.text = m.text
    messagesDiv.appendChild(div)
    div.scrollIntoView({ behavior: "smooth" })
  }

  // ---------------- Статусы сообщений ----------------
  socket.on("update message status", data => {
    if (data.chatId !== currentChatId) return
    const messages = messagesDiv.querySelectorAll(".message")
    messages.forEach(div => {
      if (div.dataset.userId == data.message.userId && div.dataset.text == data.message.text) {
        div.innerText = `${div.innerText.split("(")[0]}(${data.message.status})`
      }
    })
  })

  socket.on("update messages", data => {
    if (data.chatId !== currentChatId) return
    messagesDiv.innerHTML = ""
    data.messages.forEach(m => addMessage(m))
  })

  // ---------------- Добавление пользователя в чат ----------------
  async function addUser() {
    const username = prompt("Введите username")
    if (!username) return
    const user = usersList.find(u => u.username === username)
    if (!user) { alert("Пользователь не найден"); return }
    const res = await fetch("/createChat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: [currentUser.id, user.id] })
    })
    const data = await res.json()
    if (data.success) { loadChats(); openChat(data.chat.id) }
  }

  // ---------------- Профиль пользователя ----------------
  userProfile.onclick = () => {
    profileModal.classList.remove("hidden")
    profileName.value = currentUser.username
    profilePhoto.value = currentUser.avatar || "default-avatar.png"
    profileAvatar.src = profilePhoto.value
  }

  closeProfile.onclick = () => profileModal.classList.add("hidden")

  saveProfile.onclick = async () => {
    currentUser.username = profileName.value
    currentUser.avatar = profilePhoto.value
    userAvatar.src = currentUser.avatar
    profileAvatar.src = currentUser.avatar
    profileModal.classList.add("hidden")
    localStorage.setItem("currentUser", JSON.stringify(currentUser))

    try {
      const res = await fetch("/updateProfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar
        })
      })
      const data = await res.json()
      if (!data.success) alert("Ошибка при сохранении профиля")
    } catch (err) {
      console.error(err)
      alert("Ошибка при сохранении профиля")
    }
  }

  // ---------------- Сохраняем пользователя после перезагрузки ----------------
  const savedUser = localStorage.getItem("currentUser")
  if (savedUser) {
    currentUser = JSON.parse(savedUser)
    initChatScreen()
  }

  // ---------------- Кнопки ----------------
  registerBtn.onclick = register
  loginBtn.onclick = login
  addUserBtn.onclick = addUser
  sendBtn.onclick = sendMessage
})