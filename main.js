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
  getDoc,
  getDocs,
  query, 
  where,
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

// --- DOM Elements ---
// Screens & Modals
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const bannedScreen = document.getElementById('banned-screen');
const profileModal = document.getElementById('profile-modal');
const createGroupModal = document.getElementById('create-group-modal');
const groupInfoModal = document.getElementById('group-info-modal');

// Audio
const notificationSound = document.getElementById('notification-sound');

// Auth UI
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authError = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const bannedLogoutBtn = document.getElementById('banned-logout-btn');

// Sidebar UI
const currentUserAvatar = document.getElementById('current-user-avatar');
const currentUserNameDisplay = document.getElementById('current-user-name');
const userEmailDisplay = document.getElementById('user-email-display');
const globalChatBtn = document.getElementById('global-chat-btn');
const usersListContainer = document.getElementById('users-list');
const groupsListContainer = document.getElementById('groups-list');
const logoutBtn = document.getElementById('logout-btn');
const openProfileBtn = document.getElementById('open-profile-btn');
const openCreateGroupBtn = document.getElementById('open-create-group-btn');

// Profile Modal UI
const profileForm = document.getElementById('profile-form');
const displayNameInput = document.getElementById('display-name');
const photoUrlInput = document.getElementById('photo-url');
const closeModalBtn = document.getElementById('close-modal-btn');

// Create Group Modal UI
const createGroupForm = document.getElementById('create-group-form');
const groupNameInput = document.getElementById('group-name');
const createGroupUserList = document.getElementById('create-group-user-list');
const closeCreateGroupBtn = document.getElementById('close-create-group-btn');

// Group Info Modal UI
const infoModalGroupName = document.getElementById('info-modal-group-name');
const groupInfoMembersList = document.getElementById('group-info-members-list');
const addMemberBtn = document.getElementById('add-member-btn');
const addMemberSection = document.getElementById('add-member-section');
const newMemberSelect = document.getElementById('new-member-select');
const confirmAddMemberBtn = document.getElementById('confirm-add-member-btn');
const leaveGroupBtn = document.getElementById('leave-group-btn');
const closeGroupInfoBtn = document.getElementById('close-group-info-btn');

// Chat UI
const chatHeaderInfo = document.getElementById('chat-header-info');
const chatTitle = document.getElementById('chat-title');
const chatHeaderIcon = document.getElementById('chat-header-icon');
const chatStatusText = document.getElementById('chat-status-text');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('chat-messages');
const clearChatBtn = document.getElementById('clear-chat-btn');

// App State
let currentUser = null;
let currentRoom = 'global'; 
let currentRoomType = 'global'; // 'global', 'dm', 'group'
let currentChatName = 'Global Chat';
let unsubscribeMessages = null;
let unsubscribeUsers = null;
let unsubscribeGroups = null;
let userDocUnsubscribe = null;
let lastSeenInterval = null;
let initialLoad = true;
const onlineThresholdMs = 5 * 60 * 1000; 
const SUPER_ADMIN_EMAIL = "pcisclass.12a@gmail.com";

let allUsers = {}; // Map of uid -> userData

// --- Helper Functions ---
const getAvatarUrl = (seed) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
const getRoomId = (uid1, uid2) => [uid1, uid2].sort().join('_');
const isOnline = (lastSeenTimestamp) => {
  if (!lastSeenTimestamp) return false;
  return (Date.now() - lastSeenTimestamp.toDate().getTime()) < onlineThresholdMs;
};

// --- Auth State Listener ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Listen to user document for ban status
    userDocUnsubscribe = onSnapshot(doc(db, 'users', user.uid), async (docSnap) => {
      const data = docSnap.data() || {};
      
      if (data.isBanned) {
        // User is Banned!
        currentUser = null;
        showScreen(bannedScreen);
        hideScreen(chatScreen);
        hideScreen(loginScreen);
        
        // Cleanup listeners
        if (unsubscribeMessages) unsubscribeMessages();
        if (unsubscribeUsers) unsubscribeUsers();
        if (unsubscribeGroups) unsubscribeGroups();
        if (lastSeenInterval) clearInterval(lastSeenInterval);
      } else {
        // Normal Login initialization (only once)
        if (!currentUser) {
          currentUser = user;
          userEmailDisplay.textContent = user.email;
          currentUserNameDisplay.textContent = data.displayName || 'You';
          currentUserAvatar.src = data.photoUrl || getAvatarUrl(user.email);
          
          showScreen(chatScreen);
          hideScreen(loginScreen);
          hideScreen(bannedScreen);
          
          await updatePresence();
          lastSeenInterval = setInterval(updatePresence, 60000);
          
          switchRoom('global', 'Global Chat', 'global');
          subscribeToUsers();
          subscribeToGroups();
        }
      }
    });
  } else {
    // Logged out
    currentUser = null;
    showScreen(loginScreen);
    hideScreen(chatScreen);
    hideScreen(bannedScreen);
    if (userDocUnsubscribe) userDocUnsubscribe();
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeUsers) unsubscribeUsers();
    if (unsubscribeGroups) unsubscribeGroups();
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
  } catch(e) { console.error(e); }
}

// --- Auth Handlers ---
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    authError.textContent = '';
    loginBtn.disabled = true;
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (error) {
    authError.textContent = formatError(error.message);
  } finally {
    loginBtn.disabled = false;
  }
});

signupBtn.addEventListener('click', async () => {
  if (!authForm.checkValidity()) { authForm.reportValidity(); return; }
  try {
    authError.textContent = '';
    signupBtn.disabled = true;
    await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
  } catch (error) {
    authError.textContent = formatError(error.message);
  } finally {
    signupBtn.disabled = false;
  }
});

logoutBtn.addEventListener('click', (e) => { e.stopPropagation(); signOut(auth); });
bannedLogoutBtn.addEventListener('click', () => signOut(auth));

// --- Profile Modal Handlers ---
openProfileBtn.addEventListener('click', () => showScreen(profileModal));
closeModalBtn.addEventListener('click', () => hideScreen(profileModal));
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
    if (displayName) currentUserNameDisplay.textContent = displayName;
    if (photoUrl) currentUserAvatar.src = photoUrl;
  } catch(err) { alert("Failed to update profile."); }
});

// --- Sidebar Users & Groups ---
function subscribeToUsers() {
  unsubscribeUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
    usersListContainer.innerHTML = '';
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      allUsers[data.uid] = data; // Cache user
      
      if (data.uid === currentUser.uid) {
        if (data.displayName) { currentUserNameDisplay.textContent = data.displayName; displayNameInput.value = data.displayName; }
        if (data.photoUrl) { currentUserAvatar.src = data.photoUrl; photoUrlInput.value = data.photoUrl; }
      } else if (!data.isBanned) {
        renderUserInSidebar(data);
        if (currentRoomType === 'dm' && currentRoom.includes(data.uid)) {
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
  div.style.justifyContent = 'space-between';
  
  const leftSide = document.createElement('div');
  leftSide.style.display = 'flex';
  leftSide.style.alignItems = 'center';
  leftSide.style.gap = '10px';
  leftSide.style.flex = '1';
  leftSide.style.overflow = 'hidden';
  
  const avatarContainer = document.createElement('div');
  avatarContainer.className = 'avatar-container';
  const img = document.createElement('img');
  img.src = userData.photoUrl || getAvatarUrl(userData.email);
  img.className = 'avatar-small';
  const statusDot = document.createElement('div');
  statusDot.className = `status-indicator ${isOnline(userData.lastSeen) ? 'online' : ''}`;
  avatarContainer.append(img, statusDot);
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'user-item-name';
  nameSpan.textContent = userData.displayName || userData.email.split('@')[0];
  
  leftSide.append(avatarContainer, nameSpan);
  div.appendChild(leftSide);
  
  // Super Admin Ban Button
  if (currentUser.email === SUPER_ADMIN_EMAIL) {
    const banBtn = document.createElement('button');
    banBtn.className = 'btn secondary small danger-text';
    banBtn.textContent = 'Ban';
    banBtn.style.padding = '2px 6px';
    banBtn.style.fontSize = '0.7rem';
    banBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Are you sure you want to PERMANENTLY BAN ${nameSpan.textContent}?`)) return;
      await updateDoc(doc(db, 'users', userData.uid), { isBanned: true });
    };
    div.appendChild(banBtn);
  }
  
  div.addEventListener('click', () => {
    switchRoom(getRoomId(currentUser.uid, userData.uid), nameSpan.textContent, 'dm', div, userData.lastSeen);
  });
  
  if (currentRoom === getRoomId(currentUser.uid, userData.uid)) div.classList.add('active');
  usersListContainer.appendChild(div);
}

function subscribeToGroups() {
  const q = query(collection(db, 'groups'), where('members', 'array-contains', currentUser.uid));
  unsubscribeGroups = onSnapshot(q, (snapshot) => {
    groupsListContainer.innerHTML = '';
    snapshot.forEach((docSnap) => {
      renderGroupInSidebar(docSnap.id, docSnap.data());
    });
  });
}

function renderGroupInSidebar(groupId, groupData) {
  const div = document.createElement('div');
  div.className = 'user-item';
  
  const iconSpan = document.createElement('span');
  iconSpan.className = 'channel-icon';
  iconSpan.textContent = '👥';
  iconSpan.style.marginRight = '10px';
  
  const nameSpan = document.createElement('span');
  nameSpan.className = 'user-item-name';
  nameSpan.textContent = groupData.name;
  
  div.append(iconSpan, nameSpan);
  div.addEventListener('click', () => switchRoom(groupId, groupData.name, 'group', div));
  
  if (currentRoom === groupId) div.classList.add('active');
  groupsListContainer.appendChild(div);
}

globalChatBtn.addEventListener('click', () => switchRoom('global', 'Global Chat', 'global'));

function switchRoom(roomId, roomName, type, activeElement = null, targetLastSeen = null) {
  currentRoom = roomId;
  currentRoomType = type;
  currentChatName = roomName;
  initialLoad = true;
  
  chatTitle.textContent = roomName;
  
  if (type === 'global') {
    chatHeaderIcon.textContent = '#';
    chatStatusText.classList.add('hidden');
    // Global chat can ONLY be cleared by Super Admin
    if (currentUser.email === SUPER_ADMIN_EMAIL) {
      clearChatBtn.classList.remove('hidden');
    } else {
      clearChatBtn.classList.add('hidden');
    }
  } else if (type === 'dm') {
    chatHeaderIcon.textContent = '@';
    updateHeaderStatus(targetLastSeen);
    clearChatBtn.classList.remove('hidden'); // DMs can be cleared by either user
  } else if (type === 'group') {
    chatHeaderIcon.textContent = '👥';
    chatStatusText.classList.add('hidden');
    // We will check admin status later to show/hide clear button
    clearChatBtn.classList.add('hidden'); 
  }
  
  globalChatBtn.classList.remove('active');
  document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active'));
  if (type === 'global') globalChatBtn.classList.add('active');
  else if (activeElement) activeElement.classList.add('active');
  
  subscribeToMessages();
  messageInput.focus();
  
  // If group, fetch doc to check if user is admin
  if (type === 'group') {
    getDoc(doc(db, 'groups', roomId)).then(docSnap => {
      if (docSnap.exists() && docSnap.data().admins.includes(currentUser.uid)) {
        clearChatBtn.classList.remove('hidden');
      }
    });
  }
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

// --- Create Group Logic ---
openCreateGroupBtn.addEventListener('click', () => {
  groupNameInput.value = '';
  createGroupUserList.innerHTML = '';
  
  Object.values(allUsers).forEach(u => {
    if (u.uid === currentUser.uid) return;
    const label = document.createElement('label');
    label.className = 'checklist-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = u.uid;
    const name = u.displayName || u.email.split('@')[0];
    label.append(checkbox, name);
    createGroupUserList.appendChild(label);
  });
  
  showScreen(createGroupModal);
});

closeCreateGroupBtn.addEventListener('click', () => hideScreen(createGroupModal));

createGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = groupNameInput.value.trim();
  if (!name) return;
  
  const selectedUIDs = Array.from(createGroupUserList.querySelectorAll('input:checked')).map(cb => cb.value);
  if (selectedUIDs.length === 0) return alert('Select at least 1 member');
  
  selectedUIDs.push(currentUser.uid); // Add self
  
  try {
    await addDoc(collection(db, 'groups'), {
      name: name,
      members: selectedUIDs,
      admins: [currentUser.uid],
      createdBy: currentUser.uid,
      createdAt: serverTimestamp()
    });
    hideScreen(createGroupModal);
  } catch(e) { alert("Failed to create group"); }
});

// --- Group Info Modal Logic ---
chatHeaderInfo.addEventListener('click', async () => {
  if (currentRoomType !== 'group') return;
  
  infoModalGroupName.textContent = currentChatName;
  groupInfoMembersList.innerHTML = 'Loading...';
  addMemberBtn.classList.add('hidden');
  addMemberSection.classList.add('hidden');
  showScreen(groupInfoModal);
  
  const groupDoc = await getDoc(doc(db, 'groups', currentRoom));
  if (!groupDoc.exists()) return hideScreen(groupInfoModal);
  
  const gData = groupDoc.data();
  const isAdmin = gData.admins.includes(currentUser.uid);
  
  groupInfoMembersList.innerHTML = '';
  
  gData.members.forEach(uid => {
    const u = allUsers[uid];
    if (!u) return;
    const div = document.createElement('div');
    div.className = 'checklist-item';
    div.style.justifyContent = 'space-between';
    
    const name = document.createElement('span');
    name.textContent = `${u.displayName || u.email.split('@')[0]} ${gData.admins.includes(uid) ? '(Admin)' : ''}`;
    div.appendChild(name);
    
    if (isAdmin && uid !== currentUser.uid) {
      const rmBtn = document.createElement('button');
      rmBtn.className = 'btn secondary small danger-text';
      rmBtn.textContent = 'Remove';
      rmBtn.style.padding = '2px 6px';
      rmBtn.onclick = async () => {
        if(!confirm(`Remove ${name.textContent}?`)) return;
        await updateDoc(doc(db, 'groups', currentRoom), { members: arrayRemove(uid) });
        hideScreen(groupInfoModal); // close to force refresh next time
      };
      div.appendChild(rmBtn);
    }
    groupInfoMembersList.appendChild(div);
  });
  
  if (isAdmin) {
    addMemberBtn.classList.remove('hidden');
    // Populate select
    newMemberSelect.innerHTML = '';
    let hasNonMembers = false;
    Object.values(allUsers).forEach(u => {
      if (!gData.members.includes(u.uid)) {
        hasNonMembers = true;
        const opt = document.createElement('option');
        opt.value = u.uid;
        opt.textContent = u.displayName || u.email.split('@')[0];
        newMemberSelect.appendChild(opt);
      }
    });
    if (!hasNonMembers) addMemberBtn.classList.add('hidden');
  }
});

addMemberBtn.addEventListener('click', () => {
  addMemberSection.classList.toggle('hidden');
});

confirmAddMemberBtn.addEventListener('click', async () => {
  const uid = newMemberSelect.value;
  if (!uid) return;
  await updateDoc(doc(db, 'groups', currentRoom), { members: arrayUnion(uid) });
  hideScreen(groupInfoModal);
});

leaveGroupBtn.addEventListener('click', async () => {
  if (!confirm("Are you sure you want to leave this group?")) return;
  await updateDoc(doc(db, 'groups', currentRoom), { members: arrayRemove(currentUser.uid) });
  hideScreen(groupInfoModal);
  switchRoom('global', 'Global Chat', 'global');
});

closeGroupInfoBtn.addEventListener('click', () => hideScreen(groupInfoModal));

// --- Chat Messages Logic ---
messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

function getMessagesRef() {
  if (currentRoomType === 'group') return collection(db, 'groups', currentRoom, 'messages');
  return collection(db, 'chats', currentRoom, 'messages');
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;
  
  messageInput.value = ''; 
  messageInput.style.height = 'auto';
  
  try {
    await addDoc(getMessagesRef(), {
      text: text,
      uid: currentUser.uid,
      senderEmail: currentUser.email,
      timestamp: serverTimestamp(),
      senderName: currentUserNameDisplay.textContent,
      senderPhoto: currentUserAvatar.src
    });
  } catch (error) { alert('Failed to send message.'); }
});

function subscribeToMessages() {
  if (unsubscribeMessages) unsubscribeMessages();
  messagesContainer.innerHTML = ''; 
  
  const q = query(getMessagesRef(), orderBy('timestamp', 'asc'), limit(150));

  unsubscribeMessages = onSnapshot(q, (snapshot) => {
    if (!initialLoad && snapshot.docChanges().length > 0) {
      if (snapshot.docChanges().some(c => c.type === 'added' && c.doc.data().uid !== currentUser.uid)) {
        notificationSound.play().catch(e => {});
      }
    }
    
    messagesContainer.innerHTML = '';
    snapshot.forEach(doc => renderMessage(doc.id, doc.data()));
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (initialLoad) initialLoad = false;
  });
}

function renderMessage(docId, data) {
  const { text, uid, senderEmail, timestamp, senderName, senderPhoto } = data;
  const isSent = uid === currentUser.uid;
  
  const wrapperDiv = document.createElement('div');
  wrapperDiv.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
  
  const avatar = document.createElement('img');
  avatar.src = senderPhoto || getAvatarUrl(senderEmail);
  avatar.className = 'avatar-small';
  
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  
  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = text;
  
  const info = document.createElement('div');
  info.className = 'message-info';
  
  let timeString = '';
  if (timestamp) timeString = timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  const displayName = senderName || senderEmail.split('@')[0];
  info.textContent = isSent ? timeString : `${displayName} • ${timeString}`;
  
  if (isSent) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-msg-btn';
    deleteBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>`;
    deleteBtn.onclick = () => deleteMessage(docId);
    info.appendChild(deleteBtn);
  }
  
  msgDiv.append(bubble, info);
  if (isSent) wrapperDiv.append(msgDiv, avatar);
  else wrapperDiv.append(avatar, msgDiv);
  
  messagesContainer.appendChild(wrapperDiv);
}

async function deleteMessage(docId) {
  if (!confirm("Delete this message?")) return;
  try { await deleteDoc(doc(getMessagesRef(), docId)); } 
  catch (error) { console.error(error); }
}

clearChatBtn.addEventListener('click', async () => {
  if (!confirm("Are you sure you want to completely clear this chat for EVERYONE?")) return;
  clearChatBtn.disabled = true;
  try {
    const snapshot = await getDocs(query(getMessagesRef()));
    const promises = [];
    snapshot.forEach(docSnap => promises.push(deleteDoc(docSnap.ref)));
    await Promise.all(promises);
  } catch (err) { alert("Failed to clear chat."); } 
  finally { clearChatBtn.disabled = false; }
});

function showScreen(screen) { screen.classList.remove('hidden'); }
function hideScreen(screen) { screen.classList.add('hidden'); }
function formatError(msg) { return msg.replace('Firebase: ', ''); }
