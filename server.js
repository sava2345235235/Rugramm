const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");

// Динамический импорт uuid
let uuidv4;
import('uuid').then(module => {
  uuidv4 = module.v4;
}).catch(err => {
  console.error("Error importing uuid:", err);
  process.exit(1);
});

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

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  }
});
const upload = multer({ storage });

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
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveData();

  res.json({ 
    success: true, 
    id: user.id,
    username: user.username,
    avatar: user.avatar
  });
});

// Вход
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.json({ error: "Неверный логин или пароль" });
  }

  res.json({
    success: true,
    id: user.id,
    username: user.username,
    avatar: user.avatar
  });
});

// Получить всех пользователей
app.get("/users", (req, res) => {
  res.json(
    users.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      online: !!onlineUsers[u.id]
    }))
  );
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
      createdAt: new Date().toISOString()
    };
    chats.push(chat);
    saveData();
  }

  res.json({ success: true, chat });
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
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    read: false,
    readBy: [userId]
  };

  chat.messages.push(message);
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
  const enrichedChats = userChats.map(chat => ({
    ...chat,
    otherUser: users.find(u => u.id !== userId && chat.members.includes(u.id))
  }));

  res.json({ chats: enrichedChats });
});

// Обновить профиль
app.post("/updateProfile", (req, res) => {
  const { userId, username, avatar } = req.body;

  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.json({ error: "User not found" });
  }

  if (username) user.username = username;
  if (avatar) user.avatar = avatar;

  saveData();
  res.json({ success: true });
});

// ============== Socket.IO ==============

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  socket.on("login", (userId) => {
    socket.userId = userId;
    onlineUsers[userId] = true;
    
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

  socket.on("disconnect", () => {
    if (socket.userId) {
      delete onlineUsers[socket.userId];
      io.emit("onlineUpdate", { userId: socket.userId, online: false });
    }
    console.log("Disconnected:", socket.id);
  });
});

// Health check для Railway
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Для SPA - отдаем index.html на все маршруты
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});