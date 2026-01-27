"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = exports.supabase = void 0;
exports.verifyToken = verifyToken;
exports.getOrCreateSupabaseProfile = getOrCreateSupabaseProfile;
exports.getPlayerData = getPlayerData;
exports.updatePlayerData = updatePlayerData;
exports.getPlayerStats = getPlayerStats;
exports.updatePlayerStats = updatePlayerStats;
exports.updateProfile = updateProfile;
exports.isUsernameAvailable = isUsernameAvailable;
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
// Environment variables - these should be set in production
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'YOUR_SUPABASE_SERVICE_KEY';
// Public client (for frontend operations with RLS)
exports.supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY);
// Admin client (for backend operations, bypasses RLS)
exports.supabaseAdmin = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
// Helper to verify JWT token from Supabase
async function verifyToken(token) {
    try {
        const { data, error } = await exports.supabase.auth.getUser(token);
        if (error) {
            console.error('Token verification failed:', error.message);
            return null;
        }
        return { user: data.user };
    }
    catch (err) {
        console.error('Token verification error:', err);
        return null;
    }
}
// Get or create player profile
async function getOrCreateSupabaseProfile(userId, username) {
    // First try to get existing profile
    const { data: existingProfile, error: fetchError } = await exports.supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (existingProfile) {
        return existingProfile;
    }
    // Create new profile
    const { data: newProfile, error: createError } = await exports.supabaseAdmin
        .from('profiles')
        .insert({
        id: userId,
        username: username || `user_${userId.substring(0, 8)}`,
        display_name: null,
        avatar_url: null,
        bio: null,
        country: null
    })
        .select()
        .single();
    if (createError) {
        console.error('Failed to create profile:', createError.message);
        return null;
    }
    // Also create initial player data and stats
    await exports.supabaseAdmin.from('player_data').insert({
        user_id: userId,
        owned_cards: [],
        active_cards: [],
        owned_special_cards: [],
        active_special_cards: []
    });
    await exports.supabaseAdmin.from('stats').insert({
        user_id: userId,
        wins: 0,
        losses: 0,
        draws: 0,
        games_played: 0,
        win_streak: 0,
        best_streak: 0
    });
    return newProfile;
}
// Get player data
async function getPlayerData(userId) {
    const { data, error } = await exports.supabaseAdmin
        .from('player_data')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error) {
        console.error('Failed to get player data:', error.message);
        return null;
    }
    return data;
}
// Update player data
async function updatePlayerData(userId, updates) {
    const { error } = await exports.supabaseAdmin
        .from('player_data')
        .update(updates)
        .eq('user_id', userId);
    if (error) {
        console.error('Failed to update player data:', error.message);
        return false;
    }
    return true;
}
// Get player stats
async function getPlayerStats(userId) {
    const { data, error } = await exports.supabaseAdmin
        .from('stats')
        .select('*')
        .eq('user_id', userId)
        .single();
    if (error) {
        console.error('Failed to get stats:', error.message);
        return null;
    }
    return data;
}
// Update player stats
async function updatePlayerStats(userId, result) {
    const stats = await getPlayerStats(userId);
    if (!stats)
        return false;
    const updates = {
        games_played: stats.games_played + 1
    };
    if (result === 'win') {
        updates.wins = stats.wins + 1;
        updates.win_streak = stats.win_streak + 1;
        if ((updates.win_streak || 0) > stats.best_streak) {
            updates.best_streak = updates.win_streak;
        }
    }
    else if (result === 'loss') {
        updates.losses = stats.losses + 1;
        updates.win_streak = 0;
    }
    else {
        updates.draws = stats.draws + 1;
        updates.win_streak = 0;
    }
    const { error } = await exports.supabaseAdmin
        .from('stats')
        .update(updates)
        .eq('user_id', userId);
    if (error) {
        console.error('Failed to update stats:', error.message);
        return false;
    }
    return true;
}
// Update profile
async function updateProfile(userId, updates) {
    const { data, error } = await exports.supabaseAdmin
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();
    if (error) {
        console.error('Failed to update profile:', error.message);
        return null;
    }
    return data;
}
// Check if username is available
async function isUsernameAvailable(username, excludeUserId) {
    let query = exports.supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username);
    if (excludeUserId) {
        query = query.neq('id', excludeUserId);
    }
    const { data, error } = await query;
    if (error) {
        console.error('Failed to check username:', error.message);
        return false;
    }
    return data.length === 0;
}
