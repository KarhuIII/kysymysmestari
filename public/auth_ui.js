// ===========================
// AUTH UI HANDLERS
// ===========================

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authTabs = document.querySelectorAll('.auth-tab');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// Login elements
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const googleLoginBtn = document.getElementById('google-login-btn');

// Register elements
const registerUsernameInput = document.getElementById('register-username');
const registerEmailInput = document.getElementById('register-email');
const registerPasswordInput = document.getElementById('register-password');
const registerPasswordConfirmInput = document.getElementById('register-password-confirm');
const registerBtn = document.getElementById('register-btn');

// Guest play
const guestPlayBtn = document.getElementById('guest-play-btn');

// Profile elements
const userInfoBar = document.getElementById('user-info-bar');
const userAvatar = document.getElementById('user-avatar');
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');

// Profile edit elements
const profileAvatar = document.getElementById('profile-avatar');
const avatarUpload = document.getElementById('avatar-upload');
const profileUsername = document.getElementById('profile-username');
const profileDisplayName = document.getElementById('profile-display-name');
const profileBio = document.getElementById('profile-bio');
const profileCountry = document.getElementById('profile-country');
const saveProfileBtn = document.getElementById('save-profile-btn');
const profileSaveMessage = document.getElementById('profile-save-message');

// Auth tab switching
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        if (targetTab === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        }
    });
});

// Helper to show error
function showAuthError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideAuthError(element) {
    element.classList.add('hidden');
}

// Login handler
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        hideAuthError(loginError);
        
        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value;
        
        if (!email || !password) {
            showAuthError(loginError, 'Täytä kaikki kentät');
            return;
        }
        
        loginBtn.disabled = true;
        loginBtn.textContent = 'Kirjaudutaan...';
        
        const { data, error } = await window.auth.signIn(email, password);
        
        loginBtn.disabled = false;
        loginBtn.textContent = 'Kirjaudu sisään';
        
        if (error) {
            showAuthError(loginError, error.message || 'Kirjautuminen epäonnistui');
        }
    });
}

// Register handler
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        hideAuthError(registerError);
        
        const username = registerUsernameInput.value.trim();
        const email = registerEmailInput.value.trim();
        const password = registerPasswordInput.value;
        const passwordConfirm = registerPasswordConfirmInput.value;
        
        // Validation
        if (!username || !email || !password || !passwordConfirm) {
            showAuthError(registerError, 'Täytä kaikki kentät');
            return;
        }
        
        if (username.length < 3 || username.length > 30) {
            showAuthError(registerError, 'Käyttäjänimen tulee olla 3-30 merkkiä');
            return;
        }
        
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            showAuthError(registerError, 'Käyttäjänimi saa sisältää vain kirjaimia, numeroita ja alaviivoja');
            return;
        }
        
        if (password.length < 6) {
            showAuthError(registerError, 'Salasanan tulee olla vähintään 6 merkkiä');
            return;
        }
        
        if (password !== passwordConfirm) {
            showAuthError(registerError, 'Salasanat eivät täsmää');
            return;
        }
        
        registerBtn.disabled = true;
        registerBtn.textContent = 'Rekisteröidään...';
        
        const { data, error } = await window.auth.signUp(email, password, username);
        
        registerBtn.disabled = false;
        registerBtn.textContent = 'Rekisteröidy';
        
        if (error) {
            showAuthError(registerError, error.message || 'Rekisteröinti epäonnistui');
        } else {
            showAuthError(registerError, ''); // Clear
            registerError.classList.add('hidden');
            alert('Rekisteröinti onnistui! Tarkista sähköpostisi vahvistaaksesi tilin.');
        }
    });
}

// Google login
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        const { error } = await window.auth.signInWithOAuth('google');
        if (error) {
            showAuthError(loginError, error.message || 'Google-kirjautuminen epäonnistui');
        }
    });
}

// Guest play - use old localStorage-based ID with Guest_xxxxxxx format
if (guestPlayBtn) {
    guestPlayBtn.addEventListener('click', () => {
        // Generate new Guest ID if needed
        let guestId = localStorage.getItem('kysymysmestari_player_id');
        if (!guestId || !guestId.startsWith('Guest_')) {
            const randomPart = Math.random().toString(36).substring(2, 9);
            guestId = 'Guest_' + randomPart;
            localStorage.setItem('kysymysmestari_player_id', guestId);
        }
        
        // Hide auth screen, show lobby
        authScreen.classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        document.getElementById('main-nav').style.display = 'flex';
        
        // Store guest flag
        localStorage.setItem('isGuest', 'true');
        
        // Reload to connect with new ID
        window.location.reload();
    });
}

// Logout handler
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        await window.auth.signOut();
        localStorage.removeItem('isGuest');
        window.location.reload();
    });
}

// Profile save handler
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
        const updates = {};
        
        if (profileUsername.value) updates.username = profileUsername.value.trim();
        if (profileDisplayName.value) updates.display_name = profileDisplayName.value.trim();
        if (profileBio.value) updates.bio = profileBio.value.trim();
        if (profileCountry.value) updates.country = profileCountry.value;
        
        saveProfileBtn.disabled = true;
        saveProfileBtn.textContent = 'Tallennetaan...';
        
        const { data, error } = await window.auth.updateProfileData(updates);
        
        saveProfileBtn.disabled = false;
        saveProfileBtn.textContent = 'Tallenna muutokset';
        
        if (error) {
            profileSaveMessage.textContent = error.message || 'Tallennus epäonnistui';
            profileSaveMessage.className = 'profile-message error';
            profileSaveMessage.classList.remove('hidden');
        } else if (data) {
            profileSaveMessage.textContent = 'Profiili päivitetty!';
            profileSaveMessage.className = 'profile-message success';
            profileSaveMessage.classList.remove('hidden');
            
            // Update user info bar
            if (data.display_name) {
                userDisplayName.textContent = data.display_name;
            } else if (data.username) {
                userDisplayName.textContent = data.username;
            }
            
            setTimeout(() => {
                profileSaveMessage.classList.add('hidden');
            }, 3000);
        } else {
            profileSaveMessage.textContent = 'Profiilia ei löytynyt';
            profileSaveMessage.className = 'profile-message error';
            profileSaveMessage.classList.remove('hidden');
        }
    });
}

// Avatar upload handler
if (avatarUpload) {
    avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const { data, error } = await window.auth.uploadAvatar(file);
        
        if (error) {
            alert(error.message || 'Kuvan lataus epäonnistui');
        } else {
            // Update avatar displays
            profileAvatar.innerHTML = `<img src="${data.url}" alt="Avatar">`;
            userAvatar.innerHTML = `<img src="${data.url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
    });
}

// Load profile data when visiting profile screen
async function loadProfileData() {
    if (!window.auth.isAuthenticated) return;
    
    // Get profile
    const { data: profile } = await window.auth.getProfile();
    if (profile) {
        if (profileUsername) profileUsername.value = profile.username || '';
        if (profileDisplayName) profileDisplayName.value = profile.display_name || '';
        if (profileBio) profileBio.value = profile.bio || '';
        if (profileCountry) profileCountry.value = profile.country || '';
        
        if (profile.avatar_url && profileAvatar) {
            profileAvatar.innerHTML = `<img src="${profile.avatar_url}" alt="Avatar">`;
        }
    }
    
    // Get stats
    const { data: stats } = await window.auth.getStats();
    if (stats) {
        document.getElementById('stat-wins').textContent = stats.wins || 0;
        document.getElementById('stat-losses').textContent = stats.losses || 0;
        document.getElementById('stat-games').textContent = stats.games_played || 0;
        
        const winRate = stats.games_played > 0 
            ? Math.round((stats.wins / stats.games_played) * 100) 
            : 0;
        document.getElementById('stat-winrate').textContent = winRate + '%';
        document.getElementById('stat-best-streak').textContent = stats.best_streak || 0;
    }
}

// Listen for auth state changes
window.addEventListener('authStateChange', async (e) => {
    const { user } = e.detail;
    
    if (user) {
        // Load profile and update UI
        const { data: profile } = await window.auth.getProfile();
        if (profile) {
            userDisplayName.textContent = profile.display_name || profile.username;
            if (profile.avatar_url) {
                userAvatar.innerHTML = `<img src="${profile.avatar_url}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            }
        }
    }
});

// Initialize auth on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Check if auth module is available
    if (window.auth) {
        await window.auth.initAuth();
        
        // If guest mode was previously set
        if (localStorage.getItem('isGuest') === 'true') {
            authScreen.classList.add('hidden');
            document.getElementById('lobby-screen').classList.remove('hidden');
            document.getElementById('main-nav').style.display = 'flex';

            // Show guest "profile" in top bar
            const userInfoBar = document.getElementById('user-info-bar');
            if (userInfoBar) {
                userInfoBar.classList.remove('hidden');
                document.getElementById('user-display-name').textContent = 'Vieras';
                document.getElementById('logout-btn').textContent = 'Poistu';
            }
        }
    }
});

// Export function for use by other parts of the app
window.loadProfileData = loadProfileData;
