import fs from 'fs';
import path from 'path';
import { PlayerProfile, GameHistoryEntry } from './types';
import { loadQuestions } from './questionLoader';
import {
    supabaseAdmin,
    getOrCreateSupabaseProfile,
    getPlayerData,
    updatePlayerData,
    getPlayerStats,
    updatePlayerStats as updateSupabaseStats,
    Profile,
    PlayerData,
    Stats
} from './supabase';
import { SpecialCardType } from './types';

const DATA_DIR = path.join(__dirname, '../data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Helper to check if user is a guest (Guest_xxxxxxx or legacy user_ format)
function isGuestUser(userId: string): boolean {
    return userId.startsWith('Guest_') || userId.startsWith('user_');
}

// Helper to check if userId looks like a Supabase UUID
function isSupabaseUUID(userId: string): boolean {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(userId);
}

// Ensure data files exist for guest storage
function ensureFilesExist() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PLAYERS_FILE)) {
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs.existsSync(HISTORY_FILE)) {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
    }
}

// In-memory cache for guests
let guestPlayersCache: Record<string, PlayerProfile> = {};
let guestHistoryCache: Record<string, GameHistoryEntry[]> = {};

// Load initial data for guests
export function loadData() {
    ensureFilesExist();
    try {
        const playersData = fs.readFileSync(PLAYERS_FILE, 'utf-8');
        guestPlayersCache = JSON.parse(playersData);

        const historyData = fs.readFileSync(HISTORY_FILE, 'utf-8');
        guestHistoryCache = JSON.parse(historyData);
    } catch (err) {
        console.error('Error loading guest data:', err);
        guestPlayersCache = {};
        guestHistoryCache = {};
    }
}

// Save guest players to file
function saveGuestPlayers() {
    try {
        fs.writeFileSync(PLAYERS_FILE, JSON.stringify(guestPlayersCache, null, 2));
    } catch (err) {
        console.error('Error saving guest players:', err);
    }
}

// Save guest history to file
function saveGuestHistory() {
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(guestHistoryCache, null, 2));
    } catch (err) {
        console.error('Error saving guest history:', err);
    }
}

// Create starter deck for new players
function createStarterDeck(): { ownedCards: string[], activeCards: string[], ownedSpecialCards: string[], activeSpecialCards: string[] } {
    const allQuestions = loadQuestions();
    
    // Starter deck: 15 random easy questions (difficulty <= 2)
    const starterCards = allQuestions
        .filter(q => q.difficulty <= 2)
        .sort(() => Math.random() - 0.5)
        .slice(0, 15)
        .map(q => q.id);

    // Default active deck: first 10
    const initialActive = starterCards.slice(0, 10);

    // Special Cards: Give 6 random cards, default active to 3
    const SPECIAL_CARD_POOL = ['SKIP', 'JOKER', 'SWAP_SELF', 'MIRROR', 'SWAP_OPPONENT'];
    const starterSpecials: string[] = [];
    for (let i = 0; i < 6; i++) {
        const randomType = SPECIAL_CARD_POOL[Math.floor(Math.random() * SPECIAL_CARD_POOL.length)];
        starterSpecials.push(randomType);
    }

    return {
        ownedCards: starterCards,
        activeCards: initialActive,
        ownedSpecialCards: starterSpecials,
        activeSpecialCards: starterSpecials.slice(0, 3)
    };
}

// Get or create player profile (hybrid - Supabase or guest)
export async function getOrCreateProfile(userId: string, supabaseUserId?: string): Promise<PlayerProfile> {
    // Determine if this is a Supabase user
    // 1. Explicit supabaseUserId provided
    // 2. userId itself is a UUID (meaning client sent Supabase user ID directly)
    const effectiveSupabaseId = supabaseUserId || (isSupabaseUUID(userId) ? userId : null);
    
    if (effectiveSupabaseId) {
        console.log(`📊 Loading Supabase profile for: ${effectiveSupabaseId}`);
        return await getOrCreateSupabaseProfileAsPlayerProfile(effectiveSupabaseId, userId);
    }

    // Guest user - use local storage
    console.log(`📊 Loading guest profile for: ${userId}`);
    return getOrCreateGuestProfile(userId);
}

// Convert Supabase data to PlayerProfile format
async function getOrCreateSupabaseProfileAsPlayerProfile(supabaseUserId: string, displayName?: string): Promise<PlayerProfile> {
    // Get or create the Supabase profile
    const profile = await getOrCreateSupabaseProfile(supabaseUserId, displayName);
    
    if (!profile) {
        throw new Error('Failed to create Supabase profile');
    }

    // Get player data
    let playerData = await getPlayerData(supabaseUserId);
    
    // If no player data or empty, create starter deck
    if (!playerData || playerData.owned_cards.length === 0) {
        const starter = createStarterDeck();
        
        await updatePlayerData(supabaseUserId, {
            owned_cards: starter.ownedCards,
            active_cards: starter.activeCards,
            owned_special_cards: starter.ownedSpecialCards,
            active_special_cards: starter.activeSpecialCards
        });

        playerData = {
            user_id: supabaseUserId,
            owned_cards: starter.ownedCards,
            active_cards: starter.activeCards,
            owned_special_cards: starter.ownedSpecialCards,
            active_special_cards: starter.activeSpecialCards
        };
    }

    // Get stats
    const stats = await getPlayerStats(supabaseUserId);

    // Convert to PlayerProfile format
    const playerProfile: PlayerProfile = {
        username: profile.username,
        ownedCards: playerData!.owned_cards,
        activeCards: playerData!.active_cards,
        ownedSpecialCards: playerData!.owned_special_cards as SpecialCardType[],
        activeSpecialCards: playerData!.active_special_cards as SpecialCardType[],
        stats: {
            wins: stats?.wins || 0,
            losses: stats?.losses || 0,
            draws: stats?.draws || 0,
            gamesPlayed: stats?.games_played || 0
        },
        created: new Date(profile.created_at).getTime(),
        supabaseUserId: supabaseUserId, // Store for later use
        displayName: profile.display_name || undefined
    };

    return playerProfile;
}

// Guest profile management
function getOrCreateGuestProfile(username: string): PlayerProfile {
    if (guestPlayersCache[username]) {
        // Migration for existing profiles
        const p = guestPlayersCache[username];
        if (!p.ownedSpecialCards) {
            p.ownedSpecialCards = ['SKIP', 'JOKER', 'SWAP_SELF', 'SKIP', 'JOKER', 'SWAP_SELF'];
            p.activeSpecialCards = ['SKIP', 'JOKER', 'SWAP_SELF'];
            saveGuestPlayers();
        }
        return p;
    }

    const starter = createStarterDeck();

    const newProfile: PlayerProfile = {
        username,
        ownedCards: starter.ownedCards,
        activeCards: starter.activeCards,
        ownedSpecialCards: starter.ownedSpecialCards as SpecialCardType[],
        activeSpecialCards: starter.activeSpecialCards as SpecialCardType[],
        stats: {
            wins: 0,
            losses: 0,
            draws: 0,
            gamesPlayed: 0
        },
        created: Date.now()
    };

    guestPlayersCache[username] = newProfile;
    saveGuestPlayers();
    return newProfile;
}

// Get profile (sync version for guests)
export function getProfile(username: string): PlayerProfile | null {
    return guestPlayersCache[username] || null;
}

// Update deck (hybrid)
export async function updateActiveDeck(
    username: string, 
    activeCards: string[], 
    activeSpecialCards?: string[],
    supabaseUserId?: string
): Promise<{ success: boolean; error?: string }> {
    const effectiveSupabaseId = supabaseUserId || (isSupabaseUUID(username) ? username : null);

    // Supabase user
    if (effectiveSupabaseId) {
        const playerData = await getPlayerData(effectiveSupabaseId);
        if (!playerData) return { success: false, error: 'User data not found (Supabase)' };

        // Verify ownership
        const missingCards = activeCards.filter(id => !playerData.owned_cards.includes(id));
        if (missingCards.length > 0) {
            console.log('Missing cards:', missingCards);
            return { success: false, error: `You do not own these cards: ${missingCards.join(', ')}` };
        }

        // Limit deck size: Max 10 (validation happens at game start)
        if (activeCards.length > 10) {
             return { success: false, error: `Deck too large: ${activeCards.length} cards (Max 10)` };
        }

        const updates: Partial<PlayerData> = { active_cards: activeCards };
        if (activeSpecialCards) {
            updates.active_special_cards = activeSpecialCards;
        }

        const result = await updatePlayerData(effectiveSupabaseId, updates);
        if (!result) return { success: false, error: 'Database update failed' };
        return { success: true };
    }

    // Guest user
    const profile = guestPlayersCache[username];
    if (!profile) return { success: false, error: 'User profile not found (Guest)' };

    // Verify ownership
    const missingCards = activeCards.filter(id => !profile.ownedCards.includes(id));
    if (missingCards.length > 0) {
        return { success: false, error: `You do not own these cards: ${missingCards.join(', ')}` };
    }

    // Limit deck size: Max 10 (validation happens at game start)
    if (activeCards.length > 10) {
        return { success: false, error: `Deck too large: ${activeCards.length} cards (Max 10)` };
    }

    profile.activeCards = activeCards;

    if (activeSpecialCards) {
        profile.activeSpecialCards = activeSpecialCards as SpecialCardType[];
    }

    saveGuestPlayers();
    return { success: true };
}

// Add earned cards to collection (hybrid)
export async function addCardsToCollection(
    username: string, 
    newCardIds: string[],
    supabaseUserId?: string
) {
    const effectiveSupabaseId = supabaseUserId || (isSupabaseUUID(username) ? username : null);

    // Supabase user
    if (effectiveSupabaseId) {
        const playerData = await getPlayerData(effectiveSupabaseId);
        if (!playerData) return;

        const uniqueNew = newCardIds.filter(id => !playerData.owned_cards.includes(id));
        if (uniqueNew.length === 0) return;

        await updatePlayerData(effectiveSupabaseId, {
            owned_cards: [...playerData.owned_cards, ...uniqueNew]
        });
        return;
    }

    // Guest user
    const profile = guestPlayersCache[username];
    if (!profile) return;

    const uniqueNew = newCardIds.filter(id => !profile.ownedCards.includes(id));
    profile.ownedCards.push(...uniqueNew);

    saveGuestPlayers();
}

// Update stats (hybrid)
export async function updateStats(
    username: string, 
    result: 'win' | 'loss' | 'draw',
    supabaseUserId?: string
) {
    const effectiveSupabaseId = supabaseUserId || (isSupabaseUUID(username) ? username : null);
    // Supabase user
    if (effectiveSupabaseId) {
        await updateSupabaseStats(effectiveSupabaseId, result);
        return;
    }

    // Guest user
    const profile = guestPlayersCache[username];
    if (!profile) return;

    profile.stats.gamesPlayed++;
    if (result === 'win') profile.stats.wins++;
    if (result === 'loss') profile.stats.losses++;
    if (result === 'draw') profile.stats.draws++;

    saveGuestPlayers();
}

// Legacy alias
export const updatePlayerStats = updateStats;

// Save game history (hybrid)
export async function logGameHistory(
    username: string, 
    entry: GameHistoryEntry,
    supabaseUserId?: string
) {
    const effectiveSupabaseId = supabaseUserId || (isSupabaseUUID(username) ? username : null);
    // Supabase user
    if (effectiveSupabaseId) {
        await supabaseAdmin.from('game_history').insert({
            user_id: effectiveSupabaseId,
            opponent_id: null, // Could be enhanced later
            result: entry.result,
            my_score: entry.score.you,
            opponent_score: entry.score.opponent,
            played_at: new Date(entry.timestamp || Date.now()).toISOString()
        });
        return;
    }

    // Guest user
    if (!guestHistoryCache[username]) {
        guestHistoryCache[username] = [];
    }
    guestHistoryCache[username].push(entry);
    saveGuestHistory();
}

// Get player history (hybrid)
export async function getPlayerHistory(
    username: string,
    supabaseUserId?: string
): Promise<GameHistoryEntry[]> {
    const effectiveSupabaseId = supabaseUserId || (isSupabaseUUID(username) ? username : null);
    // Supabase user
    if (effectiveSupabaseId) {
        const { data, error } = await supabaseAdmin
            .from('game_history')
            .select('*')
            .eq('user_id', effectiveSupabaseId)
            .order('played_at', { ascending: false })
            .limit(20);

        if (error || !data) return [];

        return data.map((row: any): GameHistoryEntry => ({
            gameId: row.id || 'unknown',
            opponent: row.opponent_id || 'Tuntematon',
            result: row.result,
            score: { you: row.my_score, opponent: row.opponent_score },
            playedCards: [],
            timestamp: new Date(row.played_at).getTime()
        }));
    }

    // Guest user
    return guestHistoryCache[username] || [];
}

// Get all stats (for leaderboard)
export function getAllStats(): PlayerProfile[] {
    return Object.values(guestPlayersCache);
}

// Get Supabase leaderboard
export async function getLeaderboard(limit: number = 10) {
    const { data, error } = await supabaseAdmin
        .from('leaderboard')
        .select('*')
        .limit(limit);

    if (error || !data) return [];
    return data;
}
