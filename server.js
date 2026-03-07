const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const multer = require("multer");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static("public"));

const USERS_FILE = "users.json";
const CHATS_FILE = "chats.json";

if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, "[]");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

let users = JSON.parse(fs.readFileSync(USERS_FILE));
let chats = JSON.parse(fs.readFileSync(CHATS_FILE));
let onlineUsers = {};

function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function saveChats() { fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2)); }

// Multer для файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// Регистрация
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: "Введите данные" });
  if (users.find(u => u.username === username)) return res.json({ success: false, error: "Пользователь уже существует" });
  const newUser = { id: users.length + 1, username, password, avatar: "/uploads/default.png" };
  users.push(newUser);
  saveUsers();
  res.json({ success: true, ...newUser });
});

// Логин
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.json({ success: false, error: "Неверный логин или пароль" });
  res.json({ success: true, ...user });
});

// Список пользователей
app.get("/users", (req, res) => {
  res.json(users.map(u => ({ ...u, online: !!onlineUsers[u.id] })));
});

// Создание чата (только один чат на пару пользователей)
app.post("/createChat", (req, res) => {
  const { members } = req.body;
  if (!members || members.length < 2) return res.json({ success: false });
  const exists = chats.find(c => c.members.sort().join(",") === members.sort().join(","));
  if (exists) return res.json({ success: true, chat: exists });
  const chat = { id: chats.length + 1, members, messages: [] };
  chats.push(chat);
  saveChats();
  res.json({ success: true, chat });
});

// Получение данных чата
app.get("/data/:userId", (req, res) => {
  const userId = Number(req.params.userId);
  const userChats = chats.filter(c => c.members.includes(userId));
  res.json({ chats: userChats });
});

// Удаление чата
app.post("/deleteChat", (req, res) => {
  const { chatId } = req.body;
  chats = chats.filter(c => c.id !== Number(chatId));
  saveChats();
  res.json({ success: true });
});

// Отправка сообщений (с файлом)
app.post("/sendMessage", upload.single("file"), (req, res) => {
  const { chatId, userId, text } = req.body;
  const chat = chats.find(c => c.id === Number(chatId));
  if (!chat) return res.json({ success: false });
  const message = {
    userId: Number(userId),
    text,
    time: Date.now(),
    file: req.file ? "/uploads/" + req.file.filename : null,
    readBy: [Number(userId)]
  };
  chat.messages.push(message);
  saveChats();
  io.to(chat.members.filter(id => onlineUsers[id]).map(id => onlineUsers[id])).emit("chat message", { chatId: chat.id, ...message });
  res.json({ success: true });
});

// Socket.IO
io.on("connection", socket => {
  let currentUserId = null;

  socket.on("login", userId => {
    currentUserId = userId;
    onlineUsers[userId] = socket.id;
    io.emit("updateOnline", { userId, online: true });
  });

  socket.on("disconnect", () => {
    if (currentUserId) {
      delete onlineUsers[currentUserId];
      io.emit("updateOnline", { userId: currentUserId, online: false });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on port " + PORT));