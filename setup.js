const fs = require('fs');
const path = require('path');

console.log('🔧 Running setup...');

// Создаем необходимые папки
const dirs = [
  'uploads',
  'uploads/avatars',
  'public',
  'public/sounds'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Проверяем наличие дефолтного аватара
const defaultAvatar = path.join(__dirname, 'uploads', 'default-avatar.png');
if (!fs.existsSync(defaultAvatar)) {
  console.log('⚠️  Default avatar not found. Please add default-avatar.png to uploads folder');
}

// Проверяем наличие звука уведомления
const notificationSound = path.join(__dirname, 'public', 'sounds', 'notification.mp3');
if (!fs.existsSync(notificationSound)) {
  console.log('⚠️  Notification sound not found. Please add notification.mp3 to public/sounds folder');
}

// Проверяем наличие data.json
const dataFile = path.join(__dirname, 'data.json');
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({ users: [], chats: [] }, null, 2));
  console.log('✅ Created data.json');
}

console.log('✨ Setup complete!');