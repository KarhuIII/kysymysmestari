"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllQuestions = getAllQuestions;
exports.createGame = createGame;
exports.joinGame = joinGame;
exports.getGame = getGame;
exports.getWaitingGames = getWaitingGames;
exports.getGameBySocketId = getGameBySocketId;
exports.getQuestion = getQuestion;
exports.addQuestionsToPlayer = addQuestionsToPlayer;
exports.removeGame = removeGame;
exports.setPlayerDeck = setPlayerDeck;
exports.setPlayerSpecialHand = setPlayerSpecialHand;
exports.addQuestion = addQuestion;
exports.updateQuestion = updateQuestion;
exports.deleteQuestion = deleteQuestion;
const questionLoader_1 = require("./questionLoader");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let questions = (0, questionLoader_1.loadQuestions)();
const games = new Map();
// Generate random room code
function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}
// Get random questions (simple shuffle)
function getRandomQuestions(count) {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map(q => q.id);
}
function getAllQuestions() {
    return questions;
}
// Get weighted random questions for initial deck (Total 20)
function generateWeightedDeck() {
    // Group questions by difficulty
    const byDifficulty = new Map();
    questions.forEach(q => {
        const diff = q.difficulty || 2; // Default to 2 if missing
        if (!byDifficulty.has(diff)) {
            byDifficulty.set(diff, []);
        }
        byDifficulty.get(diff).push(q);
    });
    const deck = [];
    // Distribution configuration (Total 20)
    const distribution = [
        { level: 2, count: 8 }, // Helppo
        { level: 3, count: 6 }, // Taitaja
        { level: 4, count: 3 }, // Mestari
        { level: 5, count: 2 }, // Kuningas
        { level: 6, count: 1 } // Suurmestari
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
// Create new game
function createGame(socketId, targetScore = 5) {
    const gameId = generateGameId();
    const playerId = 'playerA';
    const game = {
        id: gameId,
        playerA: {
            id: socketId,
            score: 0,
            deck: [], // Will be set by setPlayerDeck
            specialHand: [] // Will be set by setPlayerDeck (or new func)
        },
        playerB: null,
        currentTurn: Math.random() < 0.5 ? 'playerA' : 'playerB', // Random starting turn
        activeQuestion: null,
        status: 'waiting',
        winner: null,
        answeredQuestions: [], // Initialize empty history
        targetScore: targetScore
    };
    games.set(gameId, game);
    return { gameId, playerId };
}
// Join existing game
function joinGame(gameId, socketId) {
    const game = games.get(gameId);
    if (!game) {
        return { success: false, error: 'Game not found' };
    }
    if (game.status !== 'waiting') {
        return { success: false, error: 'Game already started' };
    }
    if (game.playerB !== null) {
        return { success: false, error: 'Game is full' };
    }
    game.playerB = {
        id: socketId,
        score: 0,
        deck: [], // Will be set by setPlayerDeck
        specialHand: []
    };
    game.status = 'active';
    return { success: true, playerId: 'playerB' };
}
// Get game by ID
function getGame(gameId) {
    return games.get(gameId);
}
// Get all waiting games
function getWaitingGames() {
    const waiting = Array.from(games.values()).filter(g => g.status === 'waiting' && g.playerB === null);
    console.log(`[GameManager] getWaitingGames returning ${waiting.length} games. Total games in map: ${games.size}`);
    return waiting;
}
// Get game by socket ID
function getGameBySocketId(socketId) {
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
function getQuestion(questionId) {
    return questions.find(q => q.id === questionId);
}
// Add random questions to player's deck
function addQuestionsToPlayer(game, playerRole, count) {
    const player = game[playerRole];
    if (!player)
        return;
    const newQuestions = getRandomQuestions(count);
    player.deck.push(...newQuestions);
}
// Remove game (cleanup)
function removeGame(gameId) {
    games.delete(gameId);
}
function setPlayerDeck(gameId, playerRole, deckIds) {
    const game = games.get(gameId);
    if (!game)
        return;
    if (game[playerRole]) {
        // Shuffle the deck
        game[playerRole].deck = [...deckIds].sort(() => Math.random() - 0.5);
    }
}
function setPlayerSpecialHand(gameId, playerRole, cards) {
    const game = games.get(gameId);
    if (!game)
        return;
    if (game[playerRole]) {
        game[playerRole].specialHand = [...cards];
    }
}
// --- Question Management (Admin) ---
const DATA_DIR = path_1.default.join(__dirname, '../data');
const QUESTIONS_FILE = path_1.default.join(DATA_DIR, 'questions.json');
function saveQuestionToFile(question) {
    if (!fs_1.default.existsSync(QUESTIONS_FILE)) {
        fs_1.default.writeFileSync(QUESTIONS_FILE, JSON.stringify([], null, 2));
    }
    // We only write to questions.json for new/edited questions that belong there
    // If it source matches questions.json or is undefined (new), we save there.
    let manualQuestions = [];
    try {
        const data = fs_1.default.readFileSync(QUESTIONS_FILE, 'utf-8');
        manualQuestions = JSON.parse(data);
    }
    catch (e) {
        manualQuestions = [];
    }
    const index = manualQuestions.findIndex(q => q.id === question.id);
    if (index !== -1) {
        manualQuestions[index] = question;
    }
    else {
        manualQuestions.push(question);
    }
    fs_1.default.writeFileSync(QUESTIONS_FILE, JSON.stringify(manualQuestions, null, 2));
}
// For batch files, we might need a more complex update or just move edited batch questions to questions.json?
// Let's adopt a strategy: Edits to batch questions are basically "overrides".
// But for simplicity in this MVP:
// If editing a question from a batch file, we can either:
// A) Update the batch file (messy, big files)
// B) Save a copy in questions.json and prioritized it? (Complexity in loading)
// C) Just save to the file where it came from.
function saveQuestionToSource(question) {
    const sourceFile = question._sourceFile || 'questions.json';
    const filePath = path_1.default.join(DATA_DIR, sourceFile);
    if (sourceFile === 'questions.json') {
        saveQuestionToFile(question);
        return;
    }
    // It's a batch file
    try {
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        const rawData = JSON.parse(content);
        // Batch files have RawQuestion structure. We need to map Question -> RawQuestion update.
        // This is tricky because RawQuestion has fields we might not have in Question (like category_label).
        // For MVP, if user edits a batch question, let's just update the fields we have (text, options, correctIndex).
        // Find it
        // The batch file might be RawQuestion[]
        if (Array.isArray(rawData)) { // It is array
            const qIndex = rawData.findIndex((q) => q.id === question.id);
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
                fs_1.default.writeFileSync(filePath, JSON.stringify(rawData, null, 2));
            }
        }
    }
    catch (err) {
        console.error('Error updating source file:', err);
    }
}
function addQuestion(question) {
    // Generate ID if missing
    if (!question.id) {
        question.id = 'manual_' + Date.now();
    }
    question._sourceFile = 'questions.json';
    questions.push(question);
    saveQuestionToFile(question);
    return question;
}
function updateQuestion(id, updates) {
    const index = questions.findIndex(q => q.id === id);
    if (index === -1)
        return null;
    const original = questions[index];
    const updated = { ...original, ...updates };
    questions[index] = updated;
    saveQuestionToSource(updated);
    return updated;
}
function deleteQuestion(id) {
    const index = questions.findIndex(q => q.id === id);
    if (index === -1)
        return false;
    const question = questions[index];
    questions.splice(index, 1);
    // Delete from file
    const sourceFile = question._sourceFile || 'questions.json';
    const filePath = path_1.default.join(DATA_DIR, sourceFile);
    try {
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        let rawData = JSON.parse(content);
        if (sourceFile === 'questions.json') {
            rawData = rawData.filter((q) => q.id !== id);
        }
        else {
            // Batch file
            rawData = rawData.filter((q) => q.id !== id);
        }
        fs_1.default.writeFileSync(filePath, JSON.stringify(rawData, null, 2));
        return true;
    }
    catch (err) {
        console.error('Error deleting question:', err);
        return false;
    }
}
