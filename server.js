const express = require("express");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public")); // папка с HTML, CSS, JS

const USERS_FILE = "users.json";
const CHATS_FILE = "chats.json";

// Инициализация файлов
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, "[]");

let users = JSON.parse(fs.readFileSync(USERS_FILE));
let chats = JSON.parse(fs.readFileSync(CHATS_FILE));

function saveUsers(){ fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)) }
function saveChats(){ fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2)) }

// ------------------ Регистрация ------------------
app.post("/register", (req, res)=>{
    const { username, password } = req.body;
    if(!username || !password) return res.json({ success:false, error:"Введите данные" });
    if(users.find(u=>u.username===username)) return res.json({ success:false, error:"Пользователь уже существует" });

    const newUser = { id: users.length+1, username, password };
    users.push(newUser);
    saveUsers();
    res.json({ success:true, id:newUser.id, username:newUser.username });
});

// ------------------ Логин ------------------
app.post("/login", (req,res)=>{
    const { username, password } = req.body;
    const user = users.find(u=>u.username===username && u.password===password);
    if(!user) return res.json({ success:false, error:"Неверный логин или пароль" });
    res.json({ success:true, id:user.id, username:user.username });
});

// ------------------ Список пользователей ------------------
app.get("/users",(req,res)=>{ res.json(users); });

// ------------------ Создание чата ------------------
app.post("/createChat",(req,res)=>{
    const { members } = req.body;
    if(!members || members.length < 2) return res.json({ success:false });

    const chat = { id: chats.length+1, members, messages: [] };
    chats.push(chat);
    saveChats();
    res.json({ success:true, chat });
});

// ------------------ Данные чатов ------------------
app.get("/data/:userId",(req,res)=>{
    const userId = Number(req.params.userId);
    const userChats = chats.filter(c=>c.members.includes(userId));
    res.json({ chats: userChats });
});

// ------------------ Socket.io ------------------
io.on("connection", socket=>{
    socket.on("chat message", data=>{
        const chat = chats.find(c=>c.id===data.chatId);
        if(!chat) return;
        const message = { userId:data.userId, text:data.text, time:Date.now() };
        chat.messages.push(message);
        saveChats();
        io.emit("chat message", { chatId:data.chatId, ...message });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>{ console.log("Server running on port "+PORT) });