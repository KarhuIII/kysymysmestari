import { MultiGame, MultiPlayer, MultiGameMode, Question, SpecialCardType } from './types';
import { loadQuestions } from './questionLoader';

let questions: Question[] = loadQuestions();
const multiGames = new Map<string, MultiGame>();

// Generate random room code
function generateGameId(): string {
    return 'M' + Math.random().toString(36).substring(2, 7).toUpperCase(); // M prefix for multi
}

// Generate unique player ID
function generatePlayerId(): string {
    return 'p_' + Math.random().toString(36).substring(2, 10);
}

// Get random questions for deck
function getRandomQuestions(count: number): string[] {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(q => q.id);
}

// Get weighted random questions for initial deck (Total 20)
function generateWeightedDeck(): string[] {
    const byDifficulty = new Map<number, Question[]>();
    questions.forEach(q => {
        const diff = q.difficulty || 2;
        if (!byDifficulty.has(diff)) {
            byDifficulty.set(diff, []);
        }
        byDifficulty.get(diff)!.push(q);
    });

    const deck: string[] = [];
    const distribution = [
        { level: 2, count: 8 },
        { level: 3, count: 6 },
        { level: 4, count: 3 },
        { level: 5, count: 2 },
        { level: 6, count: 1 }
    ];

    distribution.forEach(dist => {
        const available = byDifficulty.get(dist.level) || [];
        const shuffled = [...available].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, dist.count).map(q => q.id);
        deck.push(...selected);
    });

    return deck.sort(() => Math.random() - 0.5);
}

// ==================== MULTI-GAME MANAGEMENT ====================

export function createMultiGame(
    socketId: string, 
    playerName: string,
    options: { 
        mode: MultiGameMode; 
        maxPlayers?: number; 
        targetScore?: number;
        visibility?: 'public' | 'private';
    }
): { gameId: string; playerId: string } {
    const gameId = generateGameId();
    const playerId = generatePlayerId();

    const hostPlayer: MultiPlayer = {
        id: socketId,
        playerId: playerId,
        name: playerName,
        score: 0,
        deck: [], // Will be set later
        specialHand: []
    };

    const game: MultiGame = {
        id: gameId,
        gameMode: options.mode,
        players: new Map([[playerId, hostPlayer]]),
        playerOrder: [playerId],
        currentAskerIndex: 0,
        hostId: playerId,
        maxPlayers: Math.min(options.maxPlayers || 10, 20), // Cap at 20
        activeQuestion: null,
        status: 'waiting',
        visibility: options.visibility || 'public',
        winner: null,
        answeredQuestions: [],
        targetScore: options.targetScore || 5,
        pendingJoinRequests: new Map()
    };

    multiGames.set(gameId, game);
    console.log(`[MultiGame] Created game ${gameId} by ${playerName} (mode: ${options.mode})`);
    return { gameId, playerId };
}

export function joinMultiGame(
    gameId: string, 
    socketId: string, 
    playerName: string
): { success: boolean; playerId?: string; error?: string } {
    const game = multiGames.get(gameId);

    if (!game) {
        return { success: false, error: 'Peliä ei löydy' };
    }

    if (game.status !== 'waiting') {
        return { success: false, error: 'Peli on jo alkanut' };
    }

    if (game.players.size >= game.maxPlayers) {
        return { success: false, error: 'Peli on täynnä' };
    }

    const playerId = generatePlayerId();
    const newPlayer: MultiPlayer = {
        id: socketId,
        playerId: playerId,
        name: playerName,
        score: 0,
        deck: [],
        specialHand: []
    };

    game.players.set(playerId, newPlayer);
    game.playerOrder.push(playerId);
    
    console.log(`[MultiGame] ${playerName} joined game ${gameId} (${game.players.size}/${game.maxPlayers})`);
    return { success: true, playerId };
}

export function leaveMultiGame(gameId: string, playerId: string): boolean {
    const game = multiGames.get(gameId);
    if (!game) return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    game.players.delete(playerId);
    game.playerOrder = game.playerOrder.filter(id => id !== playerId);

    // Adjust asker index if needed
    if (game.currentAskerIndex >= game.playerOrder.length) {
        game.currentAskerIndex = 0;
    }

    console.log(`[MultiGame] ${player.name} left game ${gameId}`);

    // If host left, promote next player or delete game
    if (playerId === game.hostId) {
        if (game.playerOrder.length > 0) {
            game.hostId = game.playerOrder[0];
            console.log(`[MultiGame] New host: ${game.players.get(game.hostId)?.name}`);
        } else {
            multiGames.delete(gameId);
            console.log(`[MultiGame] Game ${gameId} deleted (empty)`);
        }
    }

    return true;
}

export function getMultiGame(gameId: string): MultiGame | undefined {
    return multiGames.get(gameId);
}

export function getMultiGameBySocketId(socketId: string): { game: MultiGame; playerId: string } | null {
    for (const game of multiGames.values()) {
        for (const [playerId, player] of game.players) {
            if (player.id === socketId) {
                return { game, playerId };
            }
        }
    }
    return null;
}

export function getWaitingMultiGames(): MultiGame[] {
    return Array.from(multiGames.values()).filter(g => g.status === 'waiting' && g.visibility !== 'private');
}

export function removeMultiGame(gameId: string): void {
    multiGames.delete(gameId);
}

// ==================== TURN MANAGEMENT ====================

export function getCurrentAskerId(game: MultiGame): string {
    return game.playerOrder[game.currentAskerIndex];
}

export function advanceAsker(game: MultiGame): string {
    game.currentAskerIndex = (game.currentAskerIndex + 1) % game.playerOrder.length;
    return game.playerOrder[game.currentAskerIndex];
}

export function getAnswererIds(game: MultiGame): string[] {
    const askerId = getCurrentAskerId(game);
    
    if (game.gameMode === 'round') {
        // Everyone except asker answers
        return game.playerOrder.filter(id => id !== askerId);
    } else {
        // Choice mode - target will be specified when playing card
        return [];
    }
}

// ==================== DECK MANAGEMENT ====================

export function setMultiPlayerDeck(gameId: string, playerId: string, deckIds: string[]): void {
    const game = multiGames.get(gameId);
    if (!game) return;

    const player = game.players.get(playerId);
    if (player) {
        player.deck = [...deckIds].sort(() => Math.random() - 0.5);
    }
}

export function setMultiPlayerSpecialHand(gameId: string, playerId: string, cards: SpecialCardType[]): void {
    const game = multiGames.get(gameId);
    if (!game) return;

    const player = game.players.get(playerId);
    if (player) {
        player.specialHand = [...cards];
    }
}

// ==================== GAME START ====================

export function startMultiGame(gameId: string): boolean {
    const game = multiGames.get(gameId);
    if (!game) return false;

    if (game.players.size < 2) {
        return false; // Need at least 2 players
    }

    game.status = 'active';
    
    // Randomize starting asker
    game.currentAskerIndex = Math.floor(Math.random() * game.playerOrder.length);
    
    console.log(`[MultiGame] Game ${gameId} started with ${game.players.size} players`);
    return true;
}

// ==================== QUESTION ACCESS ====================

export function getQuestion(questionId: string): Question | undefined {
    return questions.find(q => q.id === questionId);
}
