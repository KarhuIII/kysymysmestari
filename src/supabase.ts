import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Environment variables - these should be set in production
const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'YOUR_SUPABASE_SERVICE_KEY';

// Public client (for frontend operations with RLS)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client (for backend operations, bypasses RLS)
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Database types
export interface Profile {
    id: string; // Supabase Auth user ID
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
    country: string | null;
    created_at: string;
    updated_at: string;
}

export interface PlayerData {
    user_id: string;
    owned_cards: string[];
    active_cards: string[];
    owned_special_cards: string[];
    active_special_cards: string[];
}

export interface Stats {
    user_id: string;
    wins: number;
    losses: number;
    draws: number;
    games_played: number;
    win_streak: number;
    best_streak: number;
}

// Helper to verify JWT token from Supabase
export async function verifyToken(token: string): Promise<{ user: any } | null> {
    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error) {
            console.error('Token verification failed:', error.message);
            return null;
        }
        return { user: data.user };
    } catch (err) {
        console.error('Token verification error:', err);
        return null;
    }
}

// Get or create player profile
export async function getOrCreateSupabaseProfile(userId: string, username?: string): Promise<Profile | null> {
    // First try to get existing profile
    const { data: existingProfile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (existingProfile) {
        return existingProfile as Profile;
    }

    // Create new profile
    const { data: newProfile, error: createError } = await supabaseAdmin
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
    await supabaseAdmin.from('player_data').insert({
        user_id: userId,
        owned_cards: [],
        active_cards: [],
        owned_special_cards: [],
        active_special_cards: []
    });

    await supabaseAdmin.from('stats').insert({
        user_id: userId,
        wins: 0,
        losses: 0,
        draws: 0,
        games_played: 0,
        win_streak: 0,
        best_streak: 0
    });

    return newProfile as Profile;
}

// Get player data
export async function getPlayerData(userId: string): Promise<PlayerData | null> {
    const { data, error } = await supabaseAdmin
        .from('player_data')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Failed to get player data:', error.message);
        return null;
    }

    return data as PlayerData;
}

// Update player data
export async function updatePlayerData(userId: string, updates: Partial<PlayerData>): Promise<boolean> {
    const { error } = await supabaseAdmin
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
export async function getPlayerStats(userId: string): Promise<Stats | null> {
    const { data, error } = await supabaseAdmin
        .from('stats')
        .select('*')
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Failed to get stats:', error.message);
        return null;
    }

    return data as Stats;
}

// Update player stats
export async function updatePlayerStats(
    userId: string,
    result: 'win' | 'loss' | 'draw'
): Promise<boolean> {
    const stats = await getPlayerStats(userId);
    if (!stats) return false;

    const updates: Partial<Stats> = {
        games_played: stats.games_played + 1
    };

    if (result === 'win') {
        updates.wins = stats.wins + 1;
        updates.win_streak = stats.win_streak + 1;
        if ((updates.win_streak || 0) > stats.best_streak) {
            updates.best_streak = updates.win_streak;
        }
    } else if (result === 'loss') {
        updates.losses = stats.losses + 1;
        updates.win_streak = 0;
    } else {
        updates.draws = stats.draws + 1;
        updates.win_streak = 0;
    }

    const { error } = await supabaseAdmin
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
export async function updateProfile(
    userId: string,
    updates: Partial<Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'bio' | 'country'>>
): Promise<Profile | null> {
    const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', userId)
        .select()
        .single();

    if (error) {
        console.error('Failed to update profile:', error.message);
        return null;
    }

    return data as Profile;
}

// Check if username is available
export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
    let query = supabaseAdmin
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
