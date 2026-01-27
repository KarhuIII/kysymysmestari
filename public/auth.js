// Supabase Client for Frontend
// This file handles authentication and profile operations

// IMPORTANT: Use the PUBLIC "anon" key from Supabase Dashboard → Settings → API
// The anon key is a long JWT token that starts with "eyJ..."
// DO NOT use the "service_role" key here - it's secret and only for backend!
const SUPABASE_URL = 'https://uwpbkzktgxiksxhsazok.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3cGJremt0Z3hpa3N4aHNhem9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1MDcyMzIsImV4cCI6MjA4NTA4MzIzMn0.pVSoGxr0ZjnnWg_WxkvHcDYOJhuqs8ZEe0Cr0EvX9P4'; // Find in: Dashboard → Settings → API → anon public

// Initialize Supabase client
const { createClient } = supabase; // From CDN
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth state
let currentUser = null;
let currentSession = null;

// ===========================
// AUTH FUNCTIONS
// ===========================

/**
 * Sign up with email and password
 */
async function signUp(email, password, username) {
    try {
        const { data: existingUser } = await supabaseClient
            .from('profiles')
            .select('username')
            .eq('username', username)
            .maybeSingle();

        if (existingUser) {
            return { error: { message: 'Käyttäjänimi on jo käytössä' } };
        }

        // Sign up
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: window.location.origin,
                data: {
                    username: username
                }
            }
        });

        if (error) {
            return { error };
        }

        return { data };
    } catch (err) {
        console.error('SignUp error:', err);
        return { error: { message: 'Rekisteröinti epäonnistui' } };
    }
}

/**
 * Sign in with email and password
 */
async function signIn(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return { error };
        }

        currentUser = data.user;
        currentSession = data.session;
        
        if (window.mobileLog) window.mobileLog('SignIn success: ' + (currentUser ? currentUser.email : 'No User'), 'success');

        return { data };
    } catch (err) {
        console.error('SignIn error:', err);
        return { error: { message: 'Kirjautuminen epäonnistui' } };
    }
}

/**
 * Sign in with OAuth (Google, Facebook, etc.)
 */
async function signInWithOAuth(provider) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: provider, // 'google', 'facebook', etc.
            options: {
                redirectTo: window.location.origin
            }
        });

        if (error) {
            return { error };
        }

        return { data };
    } catch (err) {
        console.error('OAuth SignIn error:', err);
        return { error: { message: 'OAuth kirjautuminen epäonnistui' } };
    }
}

/**
 * Sign out
 */
async function signOut() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        
        if (error) {
            return { error };
        }

        currentUser = null;
        currentSession = null;

        return { success: true };
    } catch (err) {
        console.error('SignOut error:', err);
        return { error: { message: 'Uloskirjautuminen epäonnistui' } };
    }
}

/**
 * Get current session
 */
async function getSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (session) {
        currentSession = session;
        currentUser = session.user;
    }
    
    return { session, error };
}

/**
 * Get access token for Socket.io authentication
 */
function getAccessToken() {
    return currentSession?.access_token || null;
}

// ===========================
// PROFILE FUNCTIONS
// ===========================

/**
 * Get current user's profile
 */
async function getProfile() {
    // Ensure we have a valid session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (!session) {
        return { error: { message: 'Ei kirjautunut' } };
    }
    
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
    
    // Profile should exist from signup trigger - just return what we have
    return { data, error };
}

/**
 * Update profile
 */
async function updateProfileData(updates) {
    try {
        if (!currentUser) {
            return { error: { message: 'Ei kirjautunut' } };
        }

        // Remove username from updates if present (username is immutable)
        if (updates.username) {
            delete updates.username;
        }

        const { data, error } = await supabaseClient
            .from('profiles')
            .update(updates)
            .eq('id', currentUser.id)
            .select()
            .maybeSingle();

        if (error) {
            console.error('Profile update error:', error);
        }

        return { data, error };
    } catch (err) {
        console.error('Profile update EXCEPTION:', err);
        return { error: { message: 'Virhe profiilin päivityksessä: ' + err.message } };
    }
}

/**
 * Get player data (cards, etc.)
 */
async function getPlayerData() {
    if (!currentUser) {
        return { error: { message: 'Ei kirjautunut' } };
    }

    const { data, error } = await supabaseClient
        .from('player_data')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    return { data, error };
}

/**
 * Update player deck
 */
async function updateDeck(activeCards, activeSpecialCards) {
    if (!currentUser) {
        return { error: { message: 'Ei kirjautunut' } };
    }

    const { data, error } = await supabaseClient
        .from('player_data')
        .update({
            active_cards: activeCards,
            active_special_cards: activeSpecialCards
        })
        .eq('user_id', currentUser.id)
        .select()
        .single();

    return { data, error };
}

/**
 * Get player stats
 */
async function getStats() {
    if (!currentUser) {
        return { error: { message: 'Ei kirjautunut' } };
    }

    const { data, error } = await supabaseClient
        .from('stats')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    return { data, error };
}

/**
 * Get game history
 */
async function getGameHistory(limit = 20) {
    if (!currentUser) {
        return { error: { message: 'Ei kirjautunut' } };
    }

    const { data, error } = await supabaseClient
        .from('game_history')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    return { data, error };
}

/**
 * Get leaderboard
 */
async function getLeaderboard(limit = 50) {
    const { data, error } = await supabaseClient
        .from('leaderboard')
        .select('*')
        .limit(limit);

    return { data, error };
}

/**
 * Upload avatar
 */
async function uploadAvatar(file) {
    if (!currentUser) {
        return { error: { message: 'Ei kirjautunut' } };
    }

    // Validate file
    if (!file.type.startsWith('image/')) {
        return { error: { message: 'Vain kuvatiedostot sallittu' } };
    }
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
        return { error: { message: 'Kuva saa olla korkeintaan 2MB' } };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${currentUser.id}/avatar.${fileExt}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('avatars')
        .upload(fileName, file, {
            upsert: true
        });

    if (uploadError) {
        return { error: uploadError };
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
        .from('avatars')
        .getPublicUrl(fileName);

    // Update profile with avatar URL
    const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', currentUser.id);

    if (updateError) {
        return { error: updateError };
    }

    return { data: { url: urlData.publicUrl } };
}

// ===========================
// AUTH STATE LISTENER
// ===========================

// Listen for auth state changes
supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    
    currentSession = session;
    currentUser = session?.user || null;

    // Dispatch custom event for UI updates
    window.dispatchEvent(new CustomEvent('authStateChange', {
        detail: { event, session, user: currentUser }
    }));

    // If signed in/out, update UI
    if (event === 'SIGNED_IN') {
        showAuthenticatedUI();
    } else if (event === 'SIGNED_OUT') {
        showUnauthenticatedUI();
    }
});

// ===========================
// UI HELPERS
// ===========================

async function showAuthenticatedUI() {
    document.querySelectorAll('.auth-required').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('.auth-guest').forEach(el => el.classList.add('hidden'));
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('lobby-screen')?.classList.remove('hidden');
    document.getElementById('main-nav')?.style.setProperty('display', 'flex');
    
    // Fetch and display profile from Supabase
    if (window.mobileLog) window.mobileLog('Fetching profile...');
    const { data: profile, error } = await getProfile();
    
    if (error) {
        if (window.mobileLog) window.mobileLog('Profile fetch ERROR: ' + JSON.stringify(error), 'error');
    }

    if (profile) {
        const displayName = profile.display_name || profile.username || 'Pelaaja';
        const userDisplayNameEl = document.getElementById('user-display-name');
        const userAvatarEl = document.getElementById('user-avatar');
        
        if (userDisplayNameEl) {
            userDisplayNameEl.textContent = displayName;
        }
        if (userAvatarEl && profile.avatar_url) {
            userAvatarEl.src = profile.avatar_url;
        }
        
        // Also populate profile edit form
        const profileUsernameEl = document.getElementById('profile-username');
        const profileDisplayNameEl = document.getElementById('profile-display-name');
        const profileBioEl = document.getElementById('profile-bio');
        const profileCountryEl = document.getElementById('profile-country');
        
        if (profileUsernameEl) profileUsernameEl.value = profile.username || '';
        if (profileDisplayNameEl) profileDisplayNameEl.value = profile.display_name || '';
        if (profileBioEl) profileBioEl.value = profile.bio || '';
        if (profileCountryEl) profileCountryEl.value = profile.country || '';
        
        console.log('✅ Loaded Supabase profile:', displayName);
    }
}

function showUnauthenticatedUI() {
    document.querySelectorAll('.auth-required').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.auth-guest').forEach(el => el.classList.remove('hidden'));
    document.getElementById('auth-screen')?.classList.remove('hidden');
    document.getElementById('lobby-screen')?.classList.add('hidden');
    document.getElementById('main-nav')?.style.setProperty('display', 'none');
}

// Initialize - check for existing session
async function initAuth() {
    const { session } = await getSession();
    if (session) {
        showAuthenticatedUI();
    } else {
        showUnauthenticatedUI();
    }
}

// Export functions for use in client.js
window.auth = {
    signUp,
    signIn,
    signInWithOAuth,
    signOut,
    getSession,
    getAccessToken,
    getProfile,
    updateProfileData,
    getPlayerData,
    updateDeck,
    getStats,
    getGameHistory,
    getLeaderboard,
    uploadAvatar,
    initAuth,
    get currentUser() { return currentUser; },
    get isAuthenticated() { return !!currentUser; }
};
