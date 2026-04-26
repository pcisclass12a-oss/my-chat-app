import { auth, db } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  addDoc,
  setDoc,
  doc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';

// --- DOM Elements ---
// Screens & Modals
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const profileModal = document.getElementById('profile-modal');

// Audio
const notificationSound = document.getElementById('notification-sound');

// Auth UI
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');

// Sidebar UI
const currentUserAvatar = document.getElementById('current-user-avatar');
const currentUserNameDisplay = document.getElementById('current-user-name');
const userEmailDisplay = document.getElementById('user-email-display');
const globalChatBtn = document.getElementById('global-chat-btn');
const usersListContainer = document.getElementById('users-list');
const logoutBtn = document.getElementById('logout-btn');
const openProfileBtn = document.getElementById('open-profile-btn');

// Profile Modal UI
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name');
const photoUrlInput = document.getElementById('photo-url');
const closeModalBtn = document.getElementById('close-modal-btn');

// Chat UI
const chatTitle = document.getElementById('chat-title');
const chatHeaderIcon = document.getElementById('chat-header-icon');
const chatStatusText = document.getElementById('chat-status-text');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('chat-messages');

// App State
let currentUser = null;
let currentRoom = 'global'; // 'global' or 'uid1_uid2'
let currentChatName = 'Global Chat';
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let lastSeenInterval = null;
let initialLoad = true;
const onlineThresholdMs = 5 * 60 * 1000; // 5 minutes

// --- Helper Functions ---
const getAvatarUrl = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

const getRoomId = (uid1, uid2) => {
  return [uid1, uid2].sort().join('_');
};

const isOnline = (lastSeenTimestamp) => {
  if (!lastSeenTimestamp) return false;
  const lastSeenMs = lastSeenTimestamp.toDate().getTime();
  const nowMs = Date.now();
  return (nowMs - lastSeenMs) < onlineThresholdMs;
};

// --- Auth State Listener ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    
    // Set UI initially
    userEmailDisplay.textContent = user.email;
    currentUserNameDisplay.textContent = 'You';
    currentUserAvatar.src = getAvatarUrl(user.email);
    
    showScreen(chatScreen);
    hideScreen(loginScreen);
    
    // Save/Update user to Firestore
    await updatePresence();
    
    // Start interval to update presence every minute
    lastSeenInterval = setInterval(updatePresence, 60000);
    
    // Default to global room
    switchRoom('global', 'Global Chat');
    subscribeToUsers();
  } else {
    currentUser = null;
    showScreen(loginScreen);
    hideScreen(chatScreen);
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeUsers) unsubscribeUsers();
    if (lastSeenInterval) clearInterval(lastSeenInterval);
  }
});

async function updatePresence() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid), {
      uid: currentUser.uid,
      email: currentUser.email,
      lastSeen: serverTimestamp()
    }, { merge: true });
  } catch(e) {
    console.error("Error updating presence:", e);
  }
}

// --- Auth Handlers ---
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = emailInput.value;
  const password = passwordInput.value;
  try {
    authError.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    authError.textContent = formatError(error.message);
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

signupBtn.addEventListener('click', async () => {
  if (!authForm.checkValidity()) {
    authForm.reportValidity();
    return;
  }
  const email = emailInput.value;
  const password = passwordInput.value;
  try {
    authError.textContent = '';
    signupBtn.disabled = true;
    signupBtn.textContent = 'Signing up...';
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    authError.textContent = formatError(error.message);
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Sign Up';
  }
});

logoutBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // prevent opening profile modal
  signOut(auth);
});

// --- Profile Modal Handlers ---
openProfileBtn.addEventListener('click', () => {
  showScreen(profileModal);
});

closeModalBtn.addEventListener('click', () => {
  hideScreen(profileModal);
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const displayName = displayNameInput.value.trim();
  const photoUrl = photoUrlInput.value.trim();
  
  if (!currentUser) return;
  
  try {
    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (photoUrl) updateData.photoUrl = photoUrl;
    
    await setDoc(doc(db, 'users', currentUser.uid), updateData, { merge: true });
    hideScreen(profileModal);
    
    // Optimistic UI Update
    if (displayName) currentUserNameDisplay.textContent = displayName;
    if (photoUrl) currentUserAvatar.src = photoUrl;
    
  } catch(err) {
    console.error("Error updating profile: ", err);
    alert("Failed to update profile.");
  }
});

// --- Sidebar Users & Room Switching ---
function subscribeToUsers() {
  const q = query(collection(db, 'users'));
  
  unsubscribeUsers = onSnapshot(q, (snapshot) => {
    usersListContainer.innerHTML = '';
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Update our own UI if it changed in DB
      if (data.uid === currentUser.uid) {
        if (data.displayName) {
          currentUserNameDisplay.textContent = data.displayName;
          displayNameInput.value = data.displayName;
        }
        if (data.photoUrl) {
          currentUserAvatar.src = data.photoUrl;
          photoUrlInput.value = data.photoUrl;
        }
      } else {
        // Render other users
        renderUserInSidebar(data);
        
        // Update header status if we are chatting with them
        if (currentRoom !== 'global' && currentRoom.includes(data.uid)) {
          updateHeaderStatus(data.lastSeen);
        }
      }
    });
  });
}

function renderUserInSidebar(userData) {
  const div = document.createElement('div');
  div.className = 'user-item';
  div.dataset.uid = userData.uid;
  
  const avatarContainer = document.createElement('div');
  avatarContainer.className = 'avatar-container';
  
  const img = document.createElement('img');
  img.src = userData.photoUrl || getAvatarUrl(userData.email);
  img.className = 'avatar-small';
  
  const statusDot = document.createElement('div');
  statusDot.className = `status-indicator ${isOnline(userData.lastSeen) ? 'online' : ''}`;
  
  avatarContainer.appendChild(img);
  avatarContainer.appendChild(statusDot);
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'user-item-name';
  nameSpan.textContent = userData.displayName || userData.email.split('@')[0];
  
  div.appendChild(avatarContainer);
  div.appendChild(nameSpan);
  
  div.addEventListener('click', () => {
    const roomId = getRoomId(currentUser.uid, userData.uid);
    switchRoom(roomId, nameSpan.textContent, div, userData.lastSeen);
  });
  
  // If we are currently in this room, mark active
  if (currentRoom === getRoomId(currentUser.uid, userData.uid)) {
    div.classList.add('active');
  }
  
  usersListContainer.appendChild(div);
}

globalChatBtn.addEventListener('click', () => {
  switchRoom('global', 'Global Chat');
});

function switchRoom(roomId, roomName, activeElement = null, targetLastSeen = null) {
  currentRoom = roomId;
  currentChatName = roomName;
  initialLoad = true; // reset for sound notification logic
  
  // Update Header UI
  chatTitle.textContent = roomName;
  chatHeaderIcon.textContent = roomId === 'global' ? '#' : '@';
  
  if (roomId === 'global') {
    chatStatusText.classList.add('hidden');
  } else {
    updateHeaderStatus(targetLastSeen);
  }
  
  // Update Active classes in sidebar
  globalChatBtn.classList.remove('active');
  document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
  
  if (roomId === 'global') {
    globalChatBtn.classList.add('active');
  } else if (activeElement) {
    activeElement.classList.add('active');
  }
  
  // Resubscribe to messages
  subscribeToMessages(roomId);
  
  // Focus input
  messageInput.focus();
}

function updateHeaderStatus(lastSeen) {
  chatStatusText.classList.remove('hidden');
  if (isOnline(lastSeen)) {
    chatStatusText.textContent = 'Online';
    chatStatusText.style.color = 'var(--success-color)';
    chatStatusText.style.background = 'rgba(16, 185, 129, 0.1)';
  } else {
    chatStatusText.textContent = 'Offline';
    chatStatusText.style.color = 'var(--text-secondary)';
    chatStatusText.style.background = 'rgba(255, 255, 255, 0.1)';
  }
}

// --- Chat Messages Logic ---

// Auto-resize textarea
messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
});

// Handle Enter vs Shift+Enter
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;
  
  messageInput.value = ''; // clear input early
  messageInput.style.height = 'auto'; // reset height
  
  try {
    const messageData = {
      text: text,
      uid: currentUser.uid,
      senderEmail: currentUser.email,
      timestamp: serverTimestamp(),
      senderName: currentUserNameDisplay.textContent,
      senderPhoto: currentUserAvatar.src
    };
    
    await addDoc(collection(db, 'chats', currentRoom, 'messages'), messageData);
  } catch (error) {
    console.error('Error sending message: ', error);
    alert('Failed to send message.');
  }
});

function subscribeToMessages(roomId) {
  if (unsubscribeMessages) unsubscribeMessages();
  
  messagesContainer.innerHTML = ''; 
  
  const q = query(
    collection(db, 'chats', roomId, 'messages'),
    orderBy('timestamp', 'asc'),
    limit(150)
  );

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    
    // Play sound if not initial load and has changes
    if (!initialLoad && snapshot.docChanges().length > 0) {
      const hasNewIncomingMsg = snapshot.docChanges().some(change => {
        return change.type === 'added' && change.doc.data().uid !== currentUser.uid;
      });
      
      if (hasNewIncomingMsg) {
        notificationSound.play().catch(e => console.log("Audio play blocked by browser"));
      }
    }
    
    messagesContainer.innerHTML = '';
    
    snapshot.forEach((doc) => {
      renderMessage(doc.id, doc.data());
    });
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    if (initialLoad) {
      initialLoad = false;
    }
  }, (error) => {
    console.error('Error fetching messages: ', error);
  });
}

function renderMessage(docId, data) {
  const { text, uid, senderEmail, timestamp, senderName, senderPhoto } = data;
  const isSent = uid === currentUser.uid;
  
  const wrapperDiv = document.createElement('div');
  wrapperDiv.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
  
  // Avatar
  const avatar = document.createElement('img');
  avatar.src = senderPhoto || getAvatarUrl(senderEmail);
  avatar.className = 'avatar-small';
  
  // Message Content
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  
  const info = document.createElement('div');
  info.className = 'message-info';
  
  let timeString = '';
  if (timestamp) {
    const date = timestamp.toDate();
    timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  const displayName = senderName || senderEmail.split('@')[0];
  info.textContent = isSent ? timeString : `${displayName} • ${timeString}`;
  
  // Delete Button (only for sent messages)
  if (isSent) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-msg-btn';
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
      </svg>
    `;
    deleteBtn.title = "Delete Message";
    deleteBtn.onclick = () => deleteMessage(docId);
    info.appendChild(deleteBtn);
  }
  
  msgDiv.appendChild(bubble);
  msgDiv.appendChild(info);
  
  if (isSent) {
    wrapperDiv.appendChild(msgDiv);
    wrapperDiv.appendChild(avatar); // Avatar on right
  } else {
    wrapperDiv.appendChild(avatar); // Avatar on left
    wrapperDiv.appendChild(msgDiv);
  }
  
  messagesContainer.appendChild(wrapperDiv);
}

async function deleteMessage(docId) {
  if (!confirm("Delete this message?")) return;
  try {
    await deleteDoc(doc(db, 'chats', currentRoom, 'messages', docId));
  } catch (error) {
    console.error("Error deleting message: ", error);
  }
}

// --- Utils ---
function showScreen(screen) {
  screen.classList.remove('hidden');
}

function hideScreen(screen) {
  screen.classList.add('hidden');
}

function formatError(msg) {
  return msg.replace('Firebase: ', '');
}
