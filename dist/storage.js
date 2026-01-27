"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePlayerStats = void 0;
exports.loadData = loadData;
exports.getOrCreateProfile = getOrCreateProfile;
exports.getProfile = getProfile;
exports.updateActiveDeck = updateActiveDeck;
exports.addCardsToCollection = addCardsToCollection;
exports.updateStats = updateStats;
exports.logGameHistory = logGameHistory;
exports.getPlayerHistory = getPlayerHistory;
exports.getAllStats = getAllStats;
exports.getLeaderboard = getLeaderboard;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const questionLoader_1 = require("./questionLoader");
const supabase_1 = require("./supabase");
const DATA_DIR = path_1.default.join(__dirname, '../data');
const PLAYERS_FILE = path_1.default.join(DATA_DIR, 'players.json');
const HISTORY_FILE = path_1.default.join(DATA_DIR, 'history.json');
// Helper to check if user is a guest (Guest_xxxxxxx or legacy user_ format)
function isGuestUser(userId) {
    return userId.startsWith('Guest_') || userId.startsWith('user_');
}
// Helper to check if userId looks like a Supabase UUID
function isSupabaseUUID(userId) {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(userId);
}
// Ensure data files exist for guest storage
function ensureFilesExist() {
    if (!fs_1.default.existsSync(DATA_DIR)) {
        fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs_1.default.existsSync(PLAYERS_FILE)) {
        fs_1.default.writeFileSync(PLAYERS_FILE, JSON.stringify({}, null, 2));
    }
    if (!fs_1.default.existsSync(HISTORY_FILE)) {
        fs_1.default.writeFileSync(HISTORY_FILE, JSON.stringify({}, null, 2));
    }
}
// In-memory cache for guests
let guestPlayersCache = {};
let guestHistoryCache = {};
// Load initial data for guests
function loadData() {
    ensureFilesExist();
    try {
        const playersData = fs_1.default.readFileSync(PLAYERS_FILE, 'utf-8');
        guestPlayersCache = JSON.parse(playersData);
        const historyData = fs_1.default.readFileSync(HISTORY_FILE, 'utf-8');
        guestHistoryCache = JSON.parse(historyData);
    }
    catch (err) {
        console.error('Error loading guest data:', err);
        guestPlayersCache = {};
        guestHistoryCache = {};
    }
}
// Save guest players to file
function saveGuestPlayers() {
    try {
        fs_1.default.writeFileSync(PLAYERS_FILE, JSON.stringify(guestPlayersCache, null, 2));
    }
    catch (err) {
        console.error('Error saving guest players:', err);
    }
}
// Save guest history to file
function saveGuestHistory() {
    try {
        fs_1.default.writeFileSync(HISTORY_FILE, JSON.stringify(guestHistoryCache, null, 2));
    }
    catch (err) {
        console.error('Error saving guest history:', err);
    }
}
// Create starter deck for new players
function createStarterDeck() {
    const allQuestions = (0, questionLoader_1.loadQuestions)();
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
    const starterSpecials = [];
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
async function getOrCreateProfile(userId, supabaseUserId) {
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
async function getOrCreateSupabaseProfileAsPlayerProfile(supabaseUserId, displayName) {
    // Get or create the Supabase profile
    const profile = await (0, supabase_1.getOrCreateSupabaseProfile)(supabaseUserId, displayName);
    if (!profile) {
        throw new Error('Failed to create Supabase profile');
    }
    // Get player data
    let playerData = await (0, supabase_1.getPlayerData)(supabaseUserId);
    // If no player data or empty, create starter deck
    if (!playerData || playerData.owned_cards.length === 0) {
        const starter = createStarterDeck();
        await (0, supabase_1.updatePlayerData)(supabaseUserId, {
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
    const stats = await (0, supabase_1.getPlayerStats)(supabaseUserId);
    // Convert to PlayerProfile format
    const playerProfile = {
        username: profile.username,
        ownedCards: playerData.owned_cards,
        activeCards: playerData.active_cards,
        ownedSpecialCards: playerData.owned_special_cards,
        activeSpecialCards: playerData.active_special_cards,
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
function getOrCreateGuestProfile(username) {
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
    const newProfile = {
        username,
        ownedCards: starter.ownedCards,
        activeCards: starter.activeCards,
        ownedSpecialCards: starter.ownedSpecialCards,
        activeSpecialCards: starter.activeSpecialCards,
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
function getProfile(username) {
    return guestPlayersCache[username] || null;
}
// Update deck (hybrid)
async function updateActiveDeck(username, activeCards, activeSpecialCards, supabaseUserId) {
    // Supabase user
    if (supabaseUserId && !isGuestUser(supabaseUserId)) {
        const playerData = await (0, supabase_1.getPlayerData)(supabaseUserId);
        if (!playerData)
            return false;
        // Verify ownership
        const ownsAll = activeCards.every(id => playerData.owned_cards.includes(id));
        if (!ownsAll)
            return false;
        // Strict deck size check: Exactly 10
        if (activeCards.length !== 10)
            return false;
        const updates = { active_cards: activeCards };
        if (activeSpecialCards) {
            updates.active_special_cards = activeSpecialCards;
        }
        return await (0, supabase_1.updatePlayerData)(supabaseUserId, updates);
    }
    // Guest user
    const profile = guestPlayersCache[username];
    if (!profile)
        return false;
    // Verify ownership
    const ownsAll = activeCards.every(id => profile.ownedCards.includes(id));
    if (!ownsAll)
        return false;
    // Strict deck size check: Exactly 10
    if (activeCards.length !== 10)
        return false;
    profile.activeCards = activeCards;
    if (activeSpecialCards) {
        profile.activeSpecialCards = activeSpecialCards;
    }
    saveGuestPlayers();
    return true;
}
// Add earned cards to collection (hybrid)
async function addCardsToCollection(username, newCardIds, supabaseUserId) {
    // Supabase user
    if (supabaseUserId && !isGuestUser(supabaseUserId)) {
        const playerData = await (0, supabase_1.getPlayerData)(supabaseUserId);
        if (!playerData)
            return;
        const uniqueNew = newCardIds.filter(id => !playerData.owned_cards.includes(id));
        if (uniqueNew.length === 0)
            return;
        await (0, supabase_1.updatePlayerData)(supabaseUserId, {
            owned_cards: [...playerData.owned_cards, ...uniqueNew]
        });
        return;
    }
    // Guest user
    const profile = guestPlayersCache[username];
    if (!profile)
        return;
    const uniqueNew = newCardIds.filter(id => !profile.ownedCards.includes(id));
    profile.ownedCards.push(...uniqueNew);
    saveGuestPlayers();
}
// Update stats (hybrid)
async function updateStats(username, result, supabaseUserId) {
    // Supabase user
    if (supabaseUserId && !isGuestUser(supabaseUserId)) {
        await (0, supabase_1.updatePlayerStats)(supabaseUserId, result);
        return;
    }
    // Guest user
    const profile = guestPlayersCache[username];
    if (!profile)
        return;
    profile.stats.gamesPlayed++;
    if (result === 'win')
        profile.stats.wins++;
    if (result === 'loss')
        profile.stats.losses++;
    if (result === 'draw')
        profile.stats.draws++;
    saveGuestPlayers();
}
// Legacy alias
exports.updatePlayerStats = updateStats;
// Save game history (hybrid)
async function logGameHistory(username, entry, supabaseUserId) {
    // Supabase user
    if (supabaseUserId && !isGuestUser(supabaseUserId)) {
        await supabase_1.supabaseAdmin.from('game_history').insert({
            user_id: supabaseUserId,
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
async function getPlayerHistory(username, supabaseUserId) {
    // Supabase user
    if (supabaseUserId && !isGuestUser(supabaseUserId)) {
        const { data, error } = await supabase_1.supabaseAdmin
            .from('game_history')
            .select('*')
            .eq('user_id', supabaseUserId)
            .order('played_at', { ascending: false })
            .limit(20);
        if (error || !data)
            return [];
        return data.map((row) => ({
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
function getAllStats() {
    return Object.values(guestPlayersCache);
}
// Get Supabase leaderboard
async function getLeaderboard(limit = 10) {
    const { data, error } = await supabase_1.supabaseAdmin
        .from('leaderboard')
        .select('*')
        .limit(limit);
    if (error || !data)
        return [];
    return data;
}
