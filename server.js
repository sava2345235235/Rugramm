const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

// Database setup (SQLite with better-sqlite3)
const db = new Database('./data/chat.db');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT DEFAULT 'default.png',
    status TEXT DEFAULT 'offline',
    last_seen TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT DEFAULT 'private',
    created_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT,
    user_id TEXT,
    role TEXT DEFAULT 'member',
    pinned INTEGER DEFAULT 0,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    message_type TEXT DEFAULT 'text',
    created_at TEXT DEFAULT (datetime('now')),
    edited INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    FOREIGN KEY (chat_id) REFERENCES chats(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  )
`);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = file.mimetype.startsWith('image/') ? 'uploads/avatars' : 'uploads/files';
    fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Online users tracking
const onlineUsers = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> Set of socketIds

// Auth middleware for sockets
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(token);
    if (!user) return next(new Error('Invalid token'));
    socket.user = user;
    next();
  } catch (err) {
    next(err);
  }
});

io.on('connection', (socket) => {
  const user = socket.user;
  console.log(`User connected: ${user.username} (${socket.id})`);

  // Update user status to online
  onlineUsers.set(socket.id, user.id);
  if (!userSockets.has(user.id)) {
    userSockets.set(user.id, new Set());
  }
  userSockets.get(user.id).add(socket.id);
  
  db.prepare('UPDATE users SET status = ?, last_seen = datetime(\'now\') WHERE id = ?').run('online', user.id);
  
  // Notify contacts about online status
  socket.broadcast.emit('user_status', { userId: user.id, status: 'online' });

  // Join user's personal room for direct messages
  socket.join(`user:${user.id}`);

  // Get user's chats
  socket.on('get_chats', () => {
    const now = new Date().toISOString();
    const chats = db.prepare(`
      SELECT c.*, 
        (SELECT m.content FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT m.created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_time,
        (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id AND m.created_at > ? AND m.sender_id != ?) as unread_count
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      WHERE cm.user_id = ?
      ORDER BY last_message_time DESC
    `).all(now, user.id, user.id);
    
    // Get members for each chat
    chats.forEach(chat => {
      const members = db.prepare(`
        SELECT u.id, u.username, u.avatar, u.status, cm.role, cm.pinned
        FROM users u
        JOIN chat_members cm ON u.id = cm.user_id
        WHERE cm.chat_id = ?
      `).all(chat.id);
      chat.members = members;
    });
    
    socket.emit('chats_list', chats);
  });

  // Get messages for a chat
  socket.on('get_messages', (chatId) => {
    const messages = db.prepare(`
      SELECT m.*, u.username, u.avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = ? AND m.deleted = 0
      ORDER BY m.created_at ASC
      LIMIT 50
    `).all(chatId);
    socket.emit('messages_history', messages);
  });

  // Send message
  socket.on('send_message', (data) => {
    const { chatId, content, fileUrl, fileType, messageType = 'text' } = data;
    const messageId = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO messages (id, chat_id, sender_id, content, file_url, file_type, message_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, chatId, user.id, content, fileUrl, fileType, messageType, now);
    
    const sender = db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(user.id);
    
    const message = {
      id: messageId,
      chat_id: chatId,
      sender_id: user.id,
      username: sender.username,
      avatar: sender.avatar,
      content,
      file_url: fileUrl,
      file_type: fileType,
      message_type: messageType,
      created_at: now
    };
    
    // Send to all chat members
    const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId);
    members.forEach(member => {
      const sockets = userSockets.get(member.user_id);
      if (sockets) {
        sockets.forEach(socketId => {
          io.to(socketId).emit('new_message', message);
        });
      }
    });
  });

  // Typing indicator
  socket.on('typing', (data) => {
    const { chatId, isTyping } = data;
    socket.to(`chat:${chatId}`).emit('user_typing', { userId: user.id, username: user.username, isTyping });
  });

  // Create private chat
  socket.on('create_private_chat', (targetUserId) => {
    // Check if chat already exists
    const existingChat = db.prepare(`
      SELECT c.id FROM chats c
      JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = ?
      JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = ?
      WHERE c.type = 'private'
    `).get(user.id, targetUserId);
    
    if (existingChat) {
      socket.emit('chat_created', { chatId: existingChat.id, isNew: false });
      return;
    }
    
    const chatId = uuidv4();
    const now = new Date().toISOString();
    
    db.prepare('INSERT INTO chats (id, type, created_by, created_at) VALUES (?, ?, ?, ?)').run(chatId, 'private', user.id, now);
    db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, user.id);
    db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)').run(chatId, targetUserId);
    
    socket.emit('chat_created', { chatId, isNew: true });
    
    // Notify target user
    const targetSockets = userSockets.get(targetUserId);
    if (targetSockets) {
      targetSockets.forEach(socketId => {
        io.to(socketId).emit('new_chat_invitation', { chatId, from: user.id });
      });
    }
  });

  // Search users
  socket.on('search_users', (query) => {
    const users = db.prepare(`
      SELECT id, username, avatar, status FROM users
      WHERE username LIKE ? AND id != ?
      LIMIT 10
    `).all(`%${query}%`, user.id);
    socket.emit('search_results', users);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${user.username} (${socket.id})`);
    onlineUsers.delete(socket.id);
    
    const sockets = userSockets.get(user.id);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(user.id);
        db.prepare('UPDATE users SET status = ?, last_seen = datetime(\'now\') WHERE id = ?').run('offline', user.id);
        socket.broadcast.emit('user_status', { userId: user.id, status: 'offline' });
      }
    }
  });
});

// REST API endpoints

// Register
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    try {
      db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)').run(userId, username, hashedPassword);
      res.json({ success: true, userId, username });
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    res.json({ success: true, token: user.id, user: { id: user.id, username: user.username, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload avatar
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const userId = req.body.userId;
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  
  try {
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatarPath, userId);
    res.json({ success: true, avatar: avatarPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload file
app.post('/api/upload-file', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const filePath = `/uploads/files/${req.file.filename}`;
  const fileType = req.file.mimetype;
  
  res.json({ success: true, url: filePath, type: fileType });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
