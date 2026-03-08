// Add User functionality
function showAddUserModal() {
  console.log("Opening add user modal");
  addUserModal.classList.remove("hidden");
  addUsernameInput.value = "";
  userSearchResults.innerHTML = "";
  addUsernameInput.focus();
}

// Search users as you type
let searchUserTimeout;
addUsernameInput.addEventListener("input", () => {
  clearTimeout(searchUserTimeout);
  const query = addUsernameInput.value.trim();
  
  console.log("Search query:", query); // для отладки
  
  if (query.length < 1) {
    userSearchResults.innerHTML = "";
    return;
  }

  userSearchResults.innerHTML = '<div class="spinner"></div>';

  searchUserTimeout = setTimeout(() => {
    searchUsers(query);
  }, 300);
});

async function searchUsers(query) {
  const searchTerm = query.startsWith('@') ? query.substring(1) : query;
  
  try {
    const res = await fetch(`/search/users?q=${encodeURIComponent(searchTerm)}`);
    const filteredUsers = await res.json();
    
    console.log("Found users:", filteredUsers); // для отладки

    if (filteredUsers.length === 0) {
      userSearchResults.innerHTML = '<div class="empty-state"><span>😕</span><br>Пользователи не найдены</div>';
      return;
    }

    userSearchResults.innerHTML = filteredUsers.map(user => `
      <div class="user-search-item" data-user-id="${user.id}" data-username="${user.username}">
        <img src="${user.avatar || '/uploads/default-avatar.png'}" alt="${user.username}">
        <div class="user-info">
          <div class="user-name">${user.username}</div>
          <div class="user-status">
            <span class="status-dot ${user.online ? 'online' : 'offline'}"></span>
            <span style="color: ${user.online ? '#48bb78' : '#9ca3af'};">
              ${user.online ? 'в сети' : 'не в сети'}
            </span>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.user-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const username = item.dataset.username;
        addUsernameInput.value = '@' + username;
        userSearchResults.innerHTML = '';
      });
    });
  } catch (err) {
    console.error("Error searching users:", err);
    userSearchResults.innerHTML = '<div class="empty-state"><span>❌</span><br>Ошибка поиска</div>';
  }
}

confirmAddUser.onclick = async () => {
  let username = addUsernameInput.value.trim();
  
  if (!username) {
    alert("Введите username");
    return;
  }

  if (username.startsWith('@')) {
    username = username.substring(1);
  }

  console.log("Adding user:", username); // для отладки

  const user = users.find(u => u.username === username);
  if (!user) {
    alert("Пользователь не найден");
    return;
  }

  if (user.id === currentUser.id) {
    alert("Нельзя добавить самого себя");
    return;
  }

  // Проверяем, существует ли уже чат
  const existingChat = chats.find(chat => 
    chat.members.includes(currentUser.id) && 
    chat.members.includes(user.id)
  );

  if (existingChat) {
    addUserModal.classList.add("hidden");
    openChat(existingChat);
    return;
  }

  try {
    const res = await fetch("/createChat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: [currentUser.id, user.id] })
    });

    const data = await res.json();
    console.log("Chat created:", data); // для отладки

    if (data.success) {
      addUserModal.classList.add("hidden");
      await loadChats();
      openChat(data.chat);
    }
  } catch (err) {
    console.error("Error creating chat:", err);
    alert("Ошибка при создании чата");
  }
};

closeAddUser.onclick = () => {
  addUserModal.classList.add("hidden");
};

// Инициализация кнопки добавления
function initAddUserButton() {
  const addUserBtn = document.getElementById("addUserBtn");
  if (addUserBtn) {
    console.log("Add user button found"); // для отладки
    addUserBtn.onclick = showAddUserModal;
  } else {
    console.log("Add user button not found, creating new one"); // для отладки
    const newBtn = document.createElement("button");
    newBtn.className = "add-user-btn";
    newBtn.id = "addUserBtn";
    newBtn.innerHTML = "+";
    newBtn.onclick = showAddUserModal;
    document.body.appendChild(newBtn);
  }
}

// Вызовите инициализацию после загрузки страницы
initAddUserButton();