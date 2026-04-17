const express = require("express");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rate limiting для защиты от брутфорса
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // максимум 10 запросов
  message: { error: "Слишком много попыток входа. Попробуйте позже." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5, // максимум 5 регистраций
  message: { error: "Слишком много попыток регистрации. Попробуйте позже." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Создаем папки, если их нет
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

if (!fs.existsSync("uploads/avatars")) {
  fs.mkdirSync("uploads/avatars", { recursive: true });
}

// Настройка multer для загрузки файлов
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "avatar") {
      cb(null, "uploads/avatars/");
    } else {
      cb(null, "uploads/");
    }
  },
  filename: (req, file, cb) => {
    // Генерируем безопасное имя файла с UUID
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Разрешаем только изображения для аватарок
    if (file.fieldname === "avatar" && !allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Разрешены только изображения (JPEG, PNG, GIF, WebP)"));
    }
    // Для обычных файлов разрешаем только изображения
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Разрешены только файлы изображений"));
    }
    cb(null, true);
  }
});

// База данных
let users = [];
let chats = [];
let onlineUsers = {};

const DATA_FILE = "data.json";
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE));
    users = data.users || [];
    chats = data.chats || [];
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users, chats }, null, 2));
  } catch (err) {
    console.error("Error saving data:", err);
  }
}

// ============== API Routes ==============

// Регистрация
app.post("/register", registerLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ error: "Username and password required" });
  }

  if (users.find(u => u.username === username)) {
    return res.json({ error: "Пользователь уже существует" });
  }

  // Хешируем пароль перед сохранением
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const user = {
    id: uuidv4(),
    username,
    passwordHash: hashedPassword, // Сохраняем хеш вместо пароля
    avatar: "/uploads/default-avatar.png",
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString()
  };

  users.push(user);
  saveData();

  res.json({ 
    success: true, 
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    createdAt: user.createdAt
  });
});

// Вход
app.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);

  if (!user) {
    return res.json({ error: "Неверный логин или пароль" });
  }

  // Проверяем хеш пароля
  const validPassword = await bcrypt.compare(password, user.passwordHash || user.password);
  if (!validPassword) {
    return res.json({ error: "Неверный логин или пароль" });
  }

  user.lastSeen = new Date().toISOString();
  saveData();

  res.json({
    success: true,
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    createdAt: user.createdAt
  });
});

// Получить всех пользователей
app.get("/users", (req, res) => {
  res.json(
    users.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      online: !!onlineUsers[u.id],
      lastSeen: u.lastSeen
    }))
  );
});

// Получить информацию о пользователе
app.get("/user/:userId", (req, res) => {
  const userId = req.params.userId;
  const user = users.find(u => u.id === userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    online: !!onlineUsers[user.id],
    lastSeen: user.lastSeen,
    createdAt: user.createdAt
  });
});

// ============== ПОИСК ПОЛЬЗОВАТЕЛЕЙ - ИСПРАВЛЕНО ==============
app.get("/search/users", (req, res) => {
  const { q } = req.query;
  
  console.log("🔍 Search request for:", q);
  console.log("All users:", users.map(u => u.username));
  
  if (!q || q.length < 1) {
    return res.json([]);
  }

  const searchTerm = q.toLowerCase();
  
  const searchResults = users
    .filter(u => {
      // Поиск по username (без учета регистра)
      return u.username.toLowerCase().includes(searchTerm);
    })
    .map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      online: !!onlineUsers[u.id]
    }))
    .slice(0, 20);

  console.log("✅ Search results:", searchResults);
  res.json(searchResults);
});

// Создать чат
app.post("/createChat", (req, res) => {
  const { members } = req.body;

  if (!members || members.length < 2) {
    return res.json({ error: "Need at least 2 members" });
  }

  // Проверяем, существует ли уже такой чат
  let chat = chats.find(c => 
    c.members && 
    c.members.includes(members[0]) && 
    c.members.includes(members[1]) &&
    c.members.length === 2
  );

  if (!chat) {
    chat = {
      id: uuidv4(),
      members,
      messages: [],
      createdAt: new Date().toISOString(),
      pinned: false,
      lastMessage: null
    };
    chats.push(chat);
    saveData();
  }

  const otherUser = users.find(u => u.id !== members[0] && chat.members.includes(u.id));

  res.json({ 
    success: true, 
    chat: {
      ...chat,
      otherUser: otherUser ? {
        id: otherUser.id,
        username: otherUser.username,
        avatar: otherUser.avatar,
        online: !!onlineUsers[otherUser.id]
      } : null
    }
  });
});

// Отправить сообщение
app.post("/sendMessage", upload.single("file"), (req, res) => {
  const { chatId, userId, text } = req.body;

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({ error: "Чат не найден" });
  }

  const message = {
    id: uuidv4(),
    userId,
    text: text || "",
    file: req.file ? "/uploads/" + req.file.filename : null,
    fileType: req.file ? req.file.mimetype : null,
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    read: false,
    readBy: [userId]
  };

  chat.messages.push(message);
  chat.lastMessage = message;
  saveData();

  // Отправляем сообщение всем в комнате чата
  io.to(chatId).emit("newMessage", { 
    chatId, 
    message,
    userId: userId
  });

  res.json({ success: true, message });
});

// Получить данные пользователя
app.get("/data/:userId", (req, res) => {
  const userId = req.params.userId;
  
  const userChats = chats.filter(c => c.members.includes(userId));
  
  const enrichedChats = userChats.map(chat => {
    const otherUserIds = chat.members.filter(id => id !== userId);
    const otherUser = users.find(u => u.id === otherUserIds[0]);
    
    return {
      ...chat,
      otherUser: otherUser ? {
        id: otherUser.id,
        username: otherUser.username,
        avatar: otherUser.avatar,
        online: !!onlineUsers[otherUser.id]
      } : null
    };
  });

  res.json({ chats: enrichedChats });
});

// Обновить профиль - с проверкой авторизации
app.post("/updateProfile", (req, res) => {
  const { userId, username, avatar } = req.body;

  // Проверка: пользователь может изменять только свой профиль
  if (!userId) {
    return res.json({ error: "User ID required" });
  }

  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.json({ error: "User not found" });
  }

  if (username) {
    // Проверяем, не занято ли имя другим пользователем
    const existingUser = users.find(u => u.username === username && u.id !== userId);
    if (existingUser) {
      return res.json({ error: "Это имя уже занято" });
    }
    user.username = username;
  }
  if (avatar) user.avatar = avatar;

  saveData();
  res.json({ success: true });
});

// Загрузить аватар - с проверкой авторизации
app.post("/uploadAvatar", upload.single("avatar"), (req, res) => {
  const { userId } = req.body;

  if (!req.file) {
    return res.json({ error: "No file uploaded" });
  }

  // Проверка: пользователь может загружать аватар только для себя
  if (!userId) {
    return res.json({ error: "User ID required" });
  }

  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.json({ error: "User not found" });
  }

  const avatarUrl = "/uploads/avatars/" + req.file.filename;
  user.avatar = avatarUrl;

  saveData();

  res.json({ success: true, avatarUrl });
});

// Закрепить чат
app.post("/pinChat", (req, res) => {
  const { chatId, userId, pin } = req.body;

  const chat = chats.find(c => c.id === chatId);
  if (!chat || !chat.members.includes(userId)) {
    return res.json({ error: "Chat not found or access denied" });
  }

  chat.pinned = pin;
  saveData();

  res.json({ success: true, pinned: pin });
});

// Удалить сообщение
app.post("/deleteMessage", (req, res) => {
  const { messageId, chatId, userId } = req.body;

  const chat = chats.find(c => c.id === chatId);
  if (!chat) {
    return res.json({ error: "Chat not found" });
  }

  const messageIndex = chat.messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    return res.json({ error: "Message not found" });
  }

  const message = chat.messages[messageIndex];
  if (message.userId !== userId) {
    return res.json({ error: "Not authorized" });
  }

  chat.messages[messageIndex] = {
    ...message,
    deleted: true,
    text: "Сообщение удалено",
    file: null
  };

  saveData();
  io.to(chatId).emit("messageDeleted", { chatId, messageId });

  res.json({ success: true });
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "ok",
    timestamp: new Date().toISOString(),
    users: users.length,
    chats: chats.length,
    online: Object.keys(onlineUsers).length
  });
});

// Статистика
app.get("/stats", (req, res) => {
  res.json({
    totalUsers: users.length,
    totalChats: chats.length,
    totalMessages: chats.reduce((acc, chat) => acc + chat.messages.length, 0),
    onlineUsers: Object.keys(onlineUsers).length
  });
});

// ============== Socket.IO ==============

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("login", (userId) => {
    socket.userId = userId;
    onlineUsers[userId] = true;
    
    // Обновляем время последнего посещения
    const user = users.find(u => u.id === userId);
    if (user) {
      user.lastSeen = new Date().toISOString();
      saveData();
    }
    
    // Присоединяемся к комнатам чатов пользователя
    const userChats = chats.filter(c => c.members.includes(userId));
    userChats.forEach(chat => {
      socket.join(chat.id);
    });

    io.emit("onlineUpdate", { userId, online: true });
  });

  socket.on("message read", (data) => {
    const { chatId, userId } = data;
    
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    let updated = false;
    chat.messages.forEach(msg => {
      if (msg.userId !== userId && !msg.read) {
        msg.read = true;
        msg.readBy = msg.readBy || [];
        if (!msg.readBy.includes(userId)) {
          msg.readBy.push(userId);
          updated = true;
        }
      }
    });

    if (updated) {
      saveData();
      io.to(chatId).emit("messages read", { chatId, userId });
    }
  });

  socket.on("typing", (data) => {
    const { chatId, userId, isTyping } = data;
    socket.to(chatId).emit("user typing", { userId, isTyping });
  });

  // Call events
  socket.on("call-offer", (data) => {
    console.log("Call offer from", socket.userId, "to", data.targetId);
    socket.to(data.targetId).emit("call-offer", {
      ...data,
      callerId: socket.userId
    });
  });

  socket.on("call-answer", (data) => {
    console.log("Call answer from", socket.userId, "to", data.targetId);
    socket.to(data.targetId).emit("call-answer", data);
  });

  socket.on("call-ice-candidate", (data) => {
    console.log("ICE candidate from", socket.userId, "to", data.targetId);
    socket.to(data.targetId).emit("call-ice-candidate", data);
  });

  socket.on("call-reject", (data) => {
    console.log("Call reject from", socket.userId, "to", data.targetId);
    socket.to(data.targetId).emit("call-reject");
  });

  socket.on("call-end", (data) => {
    console.log("Call end from", socket.userId, "to", data.targetId);
    socket.to(data.targetId).emit("call-end");
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      delete onlineUsers[socket.userId];
      
      // Обновляем время последнего посещения
      const user = users.find(u => u.id === socket.userId);
      if (user) {
        user.lastSeen = new Date().toISOString();
        saveData();
      }
      
      io.emit("onlineUpdate", { userId: socket.userId, online: false });
    }
    console.log("Disconnected:", socket.id);
  });
});

// Создаем дефолтный аватар, если его нет
const defaultAvatarPath = path.join(__dirname, "uploads", "default-avatar.png");
if (!fs.existsSync(defaultAvatarPath)) {
  console.log("Default avatar not found. Please add default-avatar.png to uploads folder.");
}

// Для SPA - отдаем index.html на все маршруты
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Local: http://localhost:${PORT}`);
});

module.exports = app;