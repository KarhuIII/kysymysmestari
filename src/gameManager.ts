import { Game, Player, Question } from './types';
import { loadQuestions } from './questionLoader';
import fs from 'fs';
import path from 'path';

let questions: Question[] = loadQuestions();
const games = new Map<string, Game>();

// Generate random room code
function generateGameId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Get random questions (simple shuffle)
function getRandomQuestions(count: number): string[] {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(q => q.id);
}

export function getAllQuestions(): Question[] {
    return questions;
}

// Get weighted random questions for initial deck (Total 20)
function generateWeightedDeck(): string[] {
    // Group questions by difficulty
    const byDifficulty = new Map<number, Question[]>();
    questions.forEach(q => {
        const diff = q.difficulty || 2; // Default to 2 if missing
        if (!byDifficulty.has(diff)) {
            byDifficulty.set(diff, []);
        }
        byDifficulty.get(diff)!.push(q);
    });

    const deck: string[] = [];

    // Distribution configuration (Total 20)
    const distribution = [
        { level: 2, count: 8 },  // Helppo
        { level: 3, count: 6 },  // Taitaja
        { level: 4, count: 3 },  // Mestari
        { level: 5, count: 2 },  // Kuningas
        { level: 6, count: 1 }   // Suurmestari
    ];

    distribution.forEach(dist => {
        const available = byDifficulty.get(dist.level) || [];
        const shuffled = [...available].sort(() => Math.random() - 0.5);

        // Take requested count, or all if not enough available
        const selected = shuffled.slice(0, dist.count).map(q => q.id);
        deck.push(...selected);

        // Fill properly if not enough questions in this tier? 
        // For now, if we run out, we might be short on cards.
        // But we have 237 questions, so should be fine.
    });

    // Shuffle the final deck so difficulties are mixed
    return deck.sort(() => Math.random() - 0.5);
}

// Generate deck for Single Player (10 questions, progressed difficulty)
function generateSinglePlayerDeck(): string[] {
    const byDifficulty = new Map<number, Question[]>();
    questions.forEach(q => {
        const diff = q.difficulty || 2;
        if (!byDifficulty.has(diff)) {
            byDifficulty.set(diff, []);
        }
        byDifficulty.get(diff)!.push(q);
    });

    const deck: string[] = [];

    // Configuration: 3 Easy, 4 Medium, 3 Hard
    const config = [
        { count: 3, levels: [1, 2] },
        { count: 4, levels: [3, 4] },
        { count: 3, levels: [5, 6] }
    ];

    config.forEach(cfg => {
        let availableForTier: Question[] = [];
        cfg.levels.forEach(lvl => {
            if (byDifficulty.has(lvl)) {
                availableForTier.push(...byDifficulty.get(lvl)!);
            }
        });
        
        // Shuffle available
        availableForTier = availableForTier.sort(() => Math.random() - 0.5);
        
        // Take count
        const selected = availableForTier.slice(0, cfg.count).map(q => q.id);
        deck.push(...selected);
    });
    
    // If we didn't get 10 (because missing levels), fill with randoms
    if (deck.length < 10) {
        const needed = 10 - deck.length;
        const allIds = questions.map(q => q.id);
        const remaining = allIds.filter(id => !deck.includes(id)).sort(() => Math.random() - 0.5);
        deck.push(...remaining.slice(0, needed));
    }

    return deck;
}

// Create new game
export function createGame(
    socketId: string, 
    playerName: string, // Added playerName
    targetScore: number = 5,
    visibility: 'public' | 'private' = 'public'
): { gameId: string; playerId: string } {
    const gameId = generateGameId();
    const playerId = 'playerA';

    const game: Game = {
        id: gameId,
        playerA: {
            id: socketId,
            name: playerName,
            score: 0,
            deck: [], // Will be set by setPlayerDeck
            specialHand: [] // Will be set by setPlayerDeck (or new func)
        },
        playerB: null,
        currentTurn: Math.random() < 0.5 ? 'playerA' : 'playerB', // Random starting turn
        activeQuestion: null,
        status: 'waiting',
        visibility: visibility,
        winner: null,
        answeredQuestions: [], // Initialize empty history
        targetScore: targetScore,
        mode: 'multi'
    };

    games.set(gameId, game);
    return { gameId, playerId };
}

// Create Single Player Game
export function createSinglePlayerGame(socketId: string, playerName?: string): { gameId: string; playerId: string } {
    const gameId = generateGameId();
    const playerId = 'playerA';

    const systemDeck = generateSinglePlayerDeck();

    const game: Game = {
        id: gameId,
        playerA: {
            id: socketId,
            name: playerName || 'Pelaaja',
            score: 0,
            deck: [], 
            specialHand: [] 
        },
        playerB: null,
        currentTurn: 'playerA',
        activeQuestion: null,
        status: 'waiting', // Unified Lobby: Start as waiting
        visibility: 'private', // Single player is always private
        winner: null,
        answeredQuestions: [],
        targetScore: 10,
        mode: 'single',
        systemDeck: systemDeck
    };

    games.set(gameId, game);
    return { gameId, playerId };
}

// Join existing game
export function joinGame(gameId: string, socketId: string, playerName: string): { success: boolean; playerId?: string; error?: string } {
    const game = games.get(gameId);

    if (!game) {
        return { success: false, error: 'Peliä ei löydy' };
    }

    if (game.status !== 'waiting') {
        return { success: false, error: 'Peli on jo alkanut' };
    }

    if (game.playerB !== null) {
        return { success: false, error: 'Peli on täynnä' };
    }

    game.playerB = {
        id: socketId,
        name: playerName,
        score: 0,

        deck: [], // Will be set by setPlayerDeck
        specialHand: []
    };
    game.status = 'waiting'; // Stay in waiting for manual start

    return { success: true, playerId: 'playerB' };
}

// Get game by ID
export function getGame(gameId: string): Game | undefined {
    return games.get(gameId);
}

// Get all waiting games
export function getWaitingGames(): Game[] {
    const waiting = Array.from(games.values()).filter(g => g.status === 'waiting' && g.mode !== 'single' && g.visibility !== 'private');
    console.log(`[GameManager] getWaitingGames returning ${waiting.length} games. Total games in map: ${games.size}`);
    return waiting;
}

// Get game by socket ID
export function getGameBySocketId(socketId: string): { game: Game; playerRole: 'playerA' | 'playerB' } | null {
    for (const game of games.values()) {
        if (game.playerA?.id === socketId) {
            return { game, playerRole: 'playerA' };
        }
        if (game.playerB?.id === socketId) {
            return { game, playerRole: 'playerB' };
        }
    }
    return null;
}

// Get question by ID
export function getQuestion(questionId: string): Question | undefined {
    return questions.find(q => q.id === questionId);
}

// Add random questions to player's deck
export function addQuestionsToPlayer(game: Game, playerRole: 'playerA' | 'playerB', count: number): void {
    const player = game[playerRole];
    if (!player) return;

    const newQuestions = getRandomQuestions(count);
    player.deck.push(...newQuestions);
}

// Remove game (cleanup)
export function removeGame(gameId: string): void {
    games.delete(gameId);
}

export function setPlayerDeck(gameId: string, playerRole: 'playerA' | 'playerB', deckIds: string[]) {
    const game = games.get(gameId);
    if (!game) return;

    if (game[playerRole]) {
        // Shuffle the deck
        game[playerRole]!.deck = [...deckIds].sort(() => Math.random() - 0.5);
    }
}


export function setPlayerSpecialHand(gameId: string, playerRole: 'playerA' | 'playerB', cards: import('./types').SpecialCardType[]) {
    const game = games.get(gameId);
    if (!game) return;
    if (game[playerRole]) {
        game[playerRole]!.specialHand = [...cards];
    }
}

// --- Question Management (Admin) ---

const DATA_DIR = path.join(__dirname, '../data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

function saveQuestionToFile(question: Question) {
    if (!fs.existsSync(QUESTIONS_FILE)) {
        fs.writeFileSync(QUESTIONS_FILE, JSON.stringify([], null, 2));
    }

    // We only write to questions.json for new/edited questions that belong there
    // If it source matches questions.json or is undefined (new), we save there.

    let manualQuestions: Question[] = [];
    try {
        const data = fs.readFileSync(QUESTIONS_FILE, 'utf-8');
        manualQuestions = JSON.parse(data);
    } catch (e) {
        manualQuestions = [];
    }

    const index = manualQuestions.findIndex(q => q.id === question.id);
    if (index !== -1) {
        manualQuestions[index] = question;
    } else {
        manualQuestions.push(question);
    }

    fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(manualQuestions, null, 2));
}

// For batch files, we might need a more complex update or just move edited batch questions to questions.json?
// Let's adopt a strategy: Edits to batch questions are basically "overrides".
// But for simplicity in this MVP:
// If editing a question from a batch file, we can either:
// A) Update the batch file (messy, big files)
// B) Save a copy in questions.json and prioritized it? (Complexity in loading)
// C) Just save to the file where it came from.

function saveQuestionToSource(question: Question) {
    const sourceFile = question._sourceFile || 'questions.json';
    const filePath = path.join(DATA_DIR, sourceFile);

    if (sourceFile === 'questions.json') {
        saveQuestionToFile(question);
        return;
    }

    // It's a batch file
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const rawData = JSON.parse(content);

        // Batch files have RawQuestion structure. We need to map Question -> RawQuestion update.
        // This is tricky because RawQuestion has fields we might not have in Question (like category_label).
        // For MVP, if user edits a batch question, let's just update the fields we have (text, options, correctIndex).

        // Find it
        // The batch file might be RawQuestion[]
        if (Array.isArray(rawData)) { // It is array
            const qIndex = rawData.findIndex((q: any) => q.id === question.id);
            if (qIndex !== -1) {
                const rawQ = rawData[qIndex];
                // Update fields
                rawQ.text = question.question;
                rawQ.difficulty = question.difficulty;
                // Update answers
                // We need to reconstruct answers array from options + correctIndex
                rawQ.answers = question.options.map((opt, idx) => ({
                    idx: idx + 1,
                    text: opt,
                    is_correct: idx === question.correctIndex
                }));

                fs.writeFileSync(filePath, JSON.stringify(rawData, null, 2));
            }
        }

    } catch (err) {
        console.error('Error updating source file:', err);
    }
}

export function addQuestion(question: Question): Question {
    // Generate ID if missing
    if (!question.id) {
        question.id = 'manual_' + Date.now();
    }
    question._sourceFile = 'questions.json';

    questions.push(question);
    saveQuestionToFile(question);
    return question;
}

export function updateQuestion(id: string, updates: Partial<Question>): Question | null {
    const index = questions.findIndex(q => q.id === id);
    if (index === -1) return null;

    const original = questions[index];
    const updated = { ...original, ...updates };

    questions[index] = updated;
    saveQuestionToSource(updated);

    return updated;
}

export function deleteQuestion(id: string): boolean {
    const index = questions.findIndex(q => q.id === id);
    if (index === -1) return false;

    const question = questions[index];
    questions.splice(index, 1);

    // Delete from file
    const sourceFile = question._sourceFile || 'questions.json';
    const filePath = path.join(DATA_DIR, sourceFile);

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let rawData = JSON.parse(content);

        if (sourceFile === 'questions.json') {
            rawData = rawData.filter((q: any) => q.id !== id);
        } else {
            // Batch file
            rawData = rawData.filter((q: any) => q.id !== id);
        }

        fs.writeFileSync(filePath, JSON.stringify(rawData, null, 2));
        return true;

    } catch (err) {
        console.error('Error deleting question:', err);
        return false;
    }
}
