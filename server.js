const express = require("express");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Создаем папки, если их нет
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// Создаем папку для звуков, если их нет
if (!fs.existsSync("public/sounds")) {
  fs.mkdirSync("public/sounds", { recursive: true });
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "avatar") {
      cb(null, "uploads/avatars/");
    } else {
      cb(null, "uploads/");
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "_" + uniqueSuffix + ext);
  }
});

// Создаем папку для аватаров
if (!fs.existsSync("uploads/avatars")) {
  fs.mkdirSync("uploads/avatars", { recursive: true });
}

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === "avatar") {
      // Разрешаем только изображения для аватаров
      if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed for avatars'));
      }
    }
    cb(null, true);
  }
});

// База данных
let users = [];
let chats = [];
let onlineUsers = {};

// Загружаем данные из файла
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
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.json({ error: "Username and password required" });
  }

  if (users.find(u => u.username === username)) {
    return res.json({ error: "Пользователь уже существует" });
  }

  const user = {
    id: uuidv4(),
    username,
    password,
    avatar: "/uploads/default-avatar.png",
    createdAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    bio: "",
    email: "",
    phone: ""
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
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.json({ error: "Неверный логин или пароль" });
  }

  // Обновляем время последнего входа
  user.lastSeen = new Date().toISOString();
  saveData();

  res.json({
    success: true,
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    createdAt: user.createdAt,
    bio: user.bio,
    email: user.email,
    phone: user.phone
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
      lastSeen: u.lastSeen,
      bio: u.bio
    }))
  );
});

// Получить информацию о конкретном пользователе
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
    bio: user.bio,
    createdAt: user.createdAt
  });
});

// Создать чат
app.post("/createChat", (req, res) => {
  const { members } = req.body;

  if (!members || members.length < 2) {
    return res.json({ error: "Need at least 2 members" });
  }

  // Проверяем, существует ли уже такой чат
  let chat = chats.find(c => 
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

  // Добавляем информацию о других участниках
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
  
  // Добавляем информацию о других участниках
  const enrichedChats = userChats.map(chat => {
    const otherUserIds = chat.members.filter(id => id !== userId);
    const otherUsers = otherUserIds.map(id => {
      const user = users.find(u => u.id === id);
      return user ? {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        online: !!onlineUsers[user.id]
      } : null;
    }).filter(u => u !== null);

    return {
      ...chat,
      otherUsers,
      otherUser: otherUsers[0] // Для совместимости с предыдущей версией
    };
  });

  res.json({ chats: enrichedChats });
});

// Обновить профиль
app.post("/updateProfile", (req, res) => {
  const { userId, username, avatar, bio, email, phone } = req.body;

  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.json({ error: "User not found" });
  }

  if (username) user.username = username;
  if (avatar) user.avatar = avatar;
  if (bio !== undefined) user.bio = bio;
  if (email !== undefined) user.email = email;
  if (phone !== undefined) user.phone = phone;

  saveData();
  res.json({ 
    success: true, 
    user: {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      bio: user.bio,
      email: user.email,
      phone: user.phone
    }
  });
});

// Загрузить аватар
app.post("/uploadAvatar", upload.single("avatar"), (req, res) => {
  const { userId } = req.body;

  if (!req.file) {
    return res.json({ error: "No file uploaded" });
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

// Поиск пользователей
app.get("/search/users", (req, res) => {
  const { q } = req.query;
  
  if (!q || q.length < 2) {
    return res.json([]);
  }

  const searchResults = users
    .filter(u => 
      u.username.toLowerCase().includes(q.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(q.toLowerCase()))
    )
    .map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      online: !!onlineUsers[u.id],
      bio: u.bio
    }))
    .slice(0, 20); // Лимит результатов

  res.json(searchResults);
});

// Удалить сообщение (только для автора)
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
    return res.json({ error: "Not authorized to delete this message" });
  }

  // Помечаем сообщение как удаленное вместо полного удаления
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

// Закрепить/открепить чат
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

  socket.on("chat message", (data) => {
    const { chatId, userId, text } = data;
    
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const message = {
      id: uuidv4(),
      userId,
      text,
      time: new Date().toLocaleTimeString(),
      timestamp: Date.now(),
      read: false,
      readBy: [userId]
    };

    chat.messages.push(message);
    chat.lastMessage = message;
    saveData();

    // Отправляем сообщение всем в комнате
    io.to(chatId).emit("chat message", { ...message, chatId });
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
  // Создаем простой дефолтный аватар (можно заменить на реальное изображение)
  const defaultAvatarDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(defaultAvatarDir)) {
    fs.mkdirSync(defaultAvatarDir, { recursive: true });
  }
  
  // Здесь можно скопировать или создать дефолтный аватар
  // Для простоты оставляем заглушку
  console.log("Default avatar not found. Please add default-avatar.png to uploads folder.");
}

// Создаем звук уведомления, если его нет
const notificationSoundPath = path.join(__dirname, "public", "sounds", "notification.mp3");
if (!fs.existsSync(notificationSoundPath)) {
  console.log("Notification sound not found. Please add notification.mp3 to public/sounds folder.");
}

// Health check для Railway
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
  console.log(`🌍 Network: http://${getLocalIP()}:${PORT}`);
});

function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}