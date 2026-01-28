"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const gameManager_1 = require("./gameManager");
const gameLogic_1 = require("./gameLogic");
const storage_1 = require("./storage");
// Initialize storage
(0, storage_1.loadData)();
// Map ephemeral socket ID -> Persistent User ID
const socketToUserMap = new Map();
function getUserId(socketId) {
    return socketToUserMap.get(socketId) || socketId;
}
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer);
app.use(express_1.default.json()); // Enable JSON body parsing for API
// Serve static files from public directory
app.use(express_1.default.static(path_1.default.join(__dirname, '../public')));
// --- API Endpoints ---
app.get('/api/questions', (req, res) => {
    res.json((0, gameManager_1.getAllQuestions)());
});
app.post('/api/questions', (req, res) => {
    try {
        const q = (0, gameManager_1.addQuestion)(req.body);
        res.json(q);
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to add question' });
    }
});
app.put('/api/questions/:id', (req, res) => {
    try {
        const q = (0, gameManager_1.updateQuestion)(req.params.id, req.body);
        if (q)
            res.json(q);
        else
            res.status(404).json({ error: 'Question not found' });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update question' });
    }
});
app.delete('/api/questions/:id', (req, res) => {
    try {
        const success = (0, gameManager_1.deleteQuestion)(req.params.id);
        if (success)
            res.json({ success: true });
        else
            res.status(404).json({ error: 'Question not found' });
    }
    catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});
app.get('/api/stats', (req, res) => {
    res.json((0, storage_1.getAllStats)());
});
// ---------------------
// Helper to broadcast waiting games
const broadcastWaitingGames = async (io) => {
    const games = (0, gameManager_1.getWaitingGames)();
    const waitingGames = await Promise.all(games.map(async (g) => {
        const hostId = getUserId(g.playerA.id);
        const profile = await (0, storage_1.getOrCreateProfile)(hostId);
        const winRate = profile.stats.gamesPlayed > 0
            ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100)
            : 0;
        return {
            id: g.id,
            hostName: profile.displayName || profile.username || hostId.substring(0, 8),
            winRate: winRate
        };
    }));
    console.log(`🌐 Broadcasting ${waitingGames.length} waiting games to all clients. Recipients: ${io.sockets.sockets.size} sockets.`);
    io.emit('waiting_games_list', waitingGames);
};
// Socket.IO connection handling
io.on('connection', async (socket) => {
    // Handle authentication (persistent ID)
    const userId = socket.handshake.auth.token || socket.id;
    socketToUserMap.set(socket.id, userId);
    console.log(`Client connected: ${socket.id} (User: ${userId})`);
    // Send initial list to the new connection
    console.log(`📡 Sending initial waiting games list to ${socket.id}`);
    const initialGames = await Promise.all((0, gameManager_1.getWaitingGames)().map(async (g) => {
        const hostId = getUserId(g.playerA.id);
        const profile = await (0, storage_1.getOrCreateProfile)(hostId);
        const winRate = profile.stats.gamesPlayed > 0
            ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100)
            : 0;
        return {
            id: g.id,
            hostName: profile.displayName || profile.username || hostId.substring(0, 8),
            winRate: winRate
        };
    }));
    socket.emit('waiting_games_list', initialGames);
    socket.on('get_waiting_games', async () => {
        console.log(`🙋 ${socket.id} requested manual refresh of game list`);
        const games = await Promise.all((0, gameManager_1.getWaitingGames)().map(async (g) => {
            const hostId = getUserId(g.playerA.id);
            const profile = await (0, storage_1.getOrCreateProfile)(hostId);
            const winRate = profile.stats.gamesPlayed > 0
                ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100)
                : 0;
            return {
                id: g.id,
                hostName: profile.displayName || profile.username || hostId.substring(0, 8),
                winRate: winRate
            };
        }));
        socket.emit('waiting_games_list', games);
    });
    // Create game
    socket.on('create_game', async (data) => {
        const targetScore = data?.targetScore || 5;
        // Validate score
        const validScore = Math.max(3, Math.min(100, targetScore));
        // Get profile and set deck
        const profile = await (0, storage_1.getOrCreateProfile)(getUserId(socket.id));
        // Validation: Check if player has enough cards for the target score
        if (profile.activeCards.length < validScore) {
            socket.emit('error', { message: `Sinulla pitää olla vähintään ${validScore} korttia pakassa pelataksesi tätä peliä (Nykyinen: ${profile.activeCards.length}).` });
            return;
        }
        const { gameId, playerId } = (0, gameManager_1.createGame)(socket.id, validScore);
        // Inject player's deck into the game
        console.log(`Setting deck for playerA (Game ${gameId}):`, profile.activeCards.length, 'cards');
        (0, gameManager_1.setPlayerDeck)(gameId, 'playerA', profile.activeCards);
        // Use activeSpecialCards logic (auto-fill 3 random for now if empty or specific logic)
        // For MVP: Give 3 specific ones if list empty, else use list. 
        const specials = profile.activeSpecialCards.length > 0 ? profile.activeSpecialCards : ['SKIP', 'JOKER', 'SWAP_SELF'];
        (0, gameManager_1.setPlayerSpecialHand)(gameId, 'playerA', specials);
        socket.join(gameId);
        const response = { gameId, playerId };
        socket.emit('game_created', response);
        console.log(`Game created: ${gameId} by ${socket.id}`);
        await broadcastWaitingGames(io);
    });
    // Join game (Request Phase)
    socket.on('join_game', async (data) => {
        const { getGame } = require('./gameManager');
        const targetGame = getGame(data.gameId);
        if (!targetGame) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }
        // Validate Deck Size
        const profile = await (0, storage_1.getOrCreateProfile)(getUserId(socket.id));
        if (profile.activeCards.length < targetGame.targetScore) {
            socket.emit('error', { message: `Sinulla pitää olla vähintään ${targetGame.targetScore} korttia pakassa liittyäksesi tähän peliä (Nykyinen: ${profile.activeCards.length}).` });
            return;
        }
        // Check if game is waiting
        if (targetGame.status !== 'waiting') {
            socket.emit('error', { message: 'Peli on jo alkanut tai päättynyt.' });
            return;
        }
        if (targetGame.playerB !== null) {
            socket.emit('error', { message: 'Peli on täynnä.' });
            return;
        }
        // Check pending requests
        if (targetGame.pendingJoinRequest) {
            socket.emit('error', { message: 'Pelissä on jo liittymispyyntö käsiteltävänä.' });
            return;
        }
        // Create Pending Request
        const requesterName = profile.displayName || profile.username || 'Pelaaja';
        targetGame.pendingJoinRequest = {
            socketId: socket.id,
            username: requesterName
        };
        console.log(`Join request to game ${targetGame.id} from ${requesterName} (${socket.id})`);
        // Notify Host
        if (targetGame.playerA) {
            const hostSocket = io.sockets.sockets.get(targetGame.playerA.id);
            if (hostSocket) {
                hostSocket.emit('join_request', {
                    requesterName: requesterName,
                    gameId: targetGame.id
                });
            }
        }
        // Notify Requester
        socket.emit('join_status', { status: 'waiting_for_approval' });
    });
    // Resolve Join Request (Host Phase)
    socket.on('resolve_join_request', async (data) => {
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (!gameData || gameData.playerRole !== 'playerA')
            return;
        const { game } = gameData;
        if (!game.pendingJoinRequest)
            return;
        const requesterId = game.pendingJoinRequest.socketId;
        const requesterSocket = io.sockets.sockets.get(requesterId);
        if (data.decision === 'accept') {
            game.pendingJoinRequest = null; // Clear request first
            if (!requesterSocket) {
                socket.emit('error', { message: 'Pelaaja on poistunut pelistä.' });
                return;
            }
            // Proceed with Join Logic
            const result = (0, gameManager_1.joinGame)(game.id, requesterId);
            if (result.success) {
                const profile = await (0, storage_1.getOrCreateProfile)(getUserId(requesterId));
                console.log(`Setting deck for playerB (Game ${game.id}):`, profile.activeCards.length, 'cards');
                (0, gameManager_1.setPlayerDeck)(game.id, 'playerB', profile.activeCards);
                const specials = profile.activeSpecialCards.length > 0 ? profile.activeSpecialCards : ['SKIP', 'JOKER', 'SWAP_SELF'];
                (0, gameManager_1.setPlayerSpecialHand)(game.id, 'playerB', specials);
                requesterSocket.join(game.id);
                const response = {
                    success: true,
                    playerId: result.playerId
                };
                requesterSocket.emit('game_joined', response);
                // Send game state to both
                if (game.playerA) {
                    const stateA = (0, gameLogic_1.getPlayerGameState)(game, 'playerA');
                    io.to(game.playerA.id).emit('game_state', stateA);
                }
                if (game.playerB) {
                    const stateB = (0, gameLogic_1.getPlayerGameState)(game, 'playerB');
                    requesterSocket.emit('game_state', stateB);
                }
                console.log(`Player joined game (Approved): ${game.id}`);
                await broadcastWaitingGames(io);
            }
            else {
                requesterSocket.emit('error', { message: result.error || 'Liittyminen epäonnistui' });
            }
        }
        else {
            // Reject
            game.pendingJoinRequest = null;
            if (requesterSocket) {
                requesterSocket.emit('error', { message: 'Pelin pitäjä hylkäsi liittymispyynnön.' });
                requesterSocket.emit('join_status', { status: 'rejected' });
            }
        }
    });
    // Play card
    socket.on('play_card', (data) => {
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        const { game, playerRole } = gameData;
        const question = (0, gameLogic_1.playCard)(game, playerRole, data.questionId);
        if (!question) {
            socket.emit('error', { message: 'Cannot play this card' });
            return;
        }
        // Send question to opponent (without correct answer)
        const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';
        const opponent = game[opponentRole];
        if (opponent) {
            const clientQuestion = {
                id: question.id,
                question: question.question,
                options: question.options,
                category: question.category,
                cardType: question.cardType
            };
            console.log(`Sending question to opponent in room ${game.id}:`, clientQuestion.question);
            // Send to the other player in the room
            socket.broadcast.to(game.id).emit('question_presented', { question: clientQuestion });
        }
        else {
            console.log('No opponent found!');
        }
        // Update game state for both players
        const statePlayer = (0, gameLogic_1.getPlayerGameState)(game, playerRole);
        const stateOpponent = (0, gameLogic_1.getPlayerGameState)(game, opponentRole);
        // Send to current player
        socket.emit('game_state', statePlayer);
        // Send to opponent via room broadcast
        if (opponent) {
            socket.broadcast.to(game.id).emit('game_state', stateOpponent);
        }
        console.log(`Card played in game ${game.id}: ${data.questionId}`);
    });
    // Use Special Card
    socket.on('use_special_card', (data) => {
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (!gameData)
            return;
        const { game, playerRole } = gameData;
        const result = (0, gameLogic_1.useSpecialCard)(game, playerRole, data.cardType);
        if (!result.success) {
            socket.emit('error', { message: result.message || 'Failed to use card' });
            return;
        }
        console.log(`Special card used: ${data.cardType} by ${playerRole}`);
        // If card caused a new question (Joker/Mirror), broadcast it
        if (result.newQuestion) { // Logic inside update? No, logic sets activeQuestion.
            // We need to check if activeQuestion changed and broadcast it.
            // Actually `playCard` emits 'question_presented'. We should do same here.
            /* Logic handles activeQuestion set. We check game.activeQuestion */
        }
        // If Active Question exists now (JOKER/MIRROR), send it
        if (game.activeQuestion) {
            const q = (0, gameManager_1.getQuestion)(game.activeQuestion.questionId);
            if (q) {
                const clientQ = { id: q.id, question: q.question, options: q.options, category: q.category, cardType: q.cardType };
                const opponent = game[playerRole === 'playerA' ? 'playerB' : 'playerA'];
                socket.broadcast.to(game.id).emit('question_presented', { question: clientQ });
            }
        }
        // Send updated state
        const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';
        io.to(game[playerRole].id).emit('game_state', (0, gameLogic_1.getPlayerGameState)(game, playerRole));
        if (game[opponentRole]) {
            io.to(game[opponentRole].id).emit('game_state', (0, gameLogic_1.getPlayerGameState)(game, opponentRole));
        }
    });
    // Answer question
    socket.on('answer_question', async (data) => {
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        const { game, playerRole } = gameData;
        const result = (0, gameLogic_1.answerQuestion)(game, playerRole, data.answerIndex);
        if (!result) {
            socket.emit('error', { message: 'Cannot answer question' });
            return;
        }
        const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';
        const opponent = game[opponentRole];
        // Send answer result to answerer
        socket.emit('answer_result', {
            correct: result.correct,
            correctAnswer: result.correctAnswer,
            pointsAwarded: result.pointsAwarded,
            newScore: result.newScore
        });
        // Send answer result to questioner
        if (opponent) {
            io.to(opponent.id).emit('opponent_answered', {
                correct: result.correct,
                correctAnswer: result.correctAnswer
            });
        }
        // Check if game is over
        if (result.gameOver) {
            // Handle Draw
            if (!result.winner) {
                // Log History for Draw
                if (game.playerA && game.playerB) {
                    await (0, storage_1.logGameHistory)(game.playerA.id, {
                        gameId: game.id, timestamp: Date.now(), opponent: game.playerB.id, result: 'draw',
                        score: { you: game.playerA.score, opponent: game.playerB.score }, playedCards: []
                    });
                    await (0, storage_1.logGameHistory)(game.playerB.id, {
                        gameId: game.id, timestamp: Date.now(), opponent: game.playerA.id, result: 'draw',
                        score: { you: game.playerB.score, opponent: game.playerA.score }, playedCards: []
                    });
                    await (0, storage_1.updatePlayerStats)(getUserId(game.playerA.id), 'draw');
                    await (0, storage_1.updatePlayerStats)(getUserId(game.playerB.id), 'draw');
                }
                io.to(game.playerA.id).emit('game_over', {
                    winner: 'draw',
                    finalScore: {
                        you: game.playerA.score,
                        opponent: game.playerB.score
                    }
                });
                io.to(game.playerB.id).emit('game_over', {
                    winner: 'draw',
                    finalScore: {
                        you: game.playerB.score,
                        opponent: game.playerA.score
                    }
                });
                console.log(`Game ${game.id} ended in a DRAW`);
            }
            else {
                // Handle Winner
                const winnerRole = result.winner;
                const loserRole = winnerRole === 'playerA' ? 'playerB' : 'playerA';
                // Update Stats & History
                const winnerId = game[winnerRole].id;
                const loserId = game[loserRole].id;
                await (0, storage_1.updatePlayerStats)(getUserId(winnerId), 'win');
                if (game[loserRole])
                    await (0, storage_1.updatePlayerStats)(getUserId(loserId), 'loss');
                await (0, storage_1.logGameHistory)(getUserId(winnerId), {
                    gameId: game.id, timestamp: Date.now(), opponent: loserId, result: 'win',
                    score: { you: game[winnerRole].score, opponent: game[loserRole].score }, playedCards: []
                });
                if (game[loserRole]) {
                    await (0, storage_1.logGameHistory)(getUserId(loserId), {
                        gameId: game.id, timestamp: Date.now(), opponent: winnerId, result: 'loss',
                        score: { you: game[loserRole].score, opponent: game[winnerRole].score }, playedCards: []
                    });
                }
                // Get available questions for winner to select
                const availableQuestionIds = (0, gameLogic_1.getAvailableQuestionsForWinner)(game, winnerRole);
                const availableQuestions = availableQuestionIds.map((qId) => {
                    const q = (0, gameManager_1.getQuestion)(qId);
                    return q ? { id: q.id, question: q.question, options: q.options } : null;
                }).filter((q) => q !== null);
                // Send game over to winner with available questions
                io.to(game[winnerRole].id).emit('game_over', {
                    winner: 'you',
                    finalScore: {
                        you: game[winnerRole].score,
                        opponent: game[loserRole].score
                    },
                    availableQuestions
                });
                // Send game over to loser
                if (game[loserRole]) {
                    io.to(game[loserRole].id).emit('game_over', {
                        winner: 'opponent',
                        finalScore: {
                            you: game[loserRole].score,
                            opponent: game[winnerRole].score
                        }
                    });
                }
                console.log(`Game ${game.id} ended. Winner: ${winnerRole}`);
            }
        }
        else {
            // Update game state for both players
            const statePlayer = (0, gameLogic_1.getPlayerGameState)(game, playerRole);
            const stateOpponent = (0, gameLogic_1.getPlayerGameState)(game, opponentRole);
            io.to(game[playerRole].id).emit('game_state', statePlayer);
            if (opponent) {
                io.to(opponent.id).emit('game_state', stateOpponent);
            }
        }
        console.log(`Question answered in game ${game.id}: ${result.correct ? 'correct' : 'wrong'}`);
    });
    // Select questions (winner only)
    socket.on('select_questions', async (data) => {
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }
        const { game, playerRole } = gameData;
        // Verify player is the winner
        if (game.winner !== game[playerRole]?.id) {
            socket.emit('error', { message: 'Only winner can select questions' });
            return;
        }
        // Add selected questions
        const success = (0, gameLogic_1.addSelectedQuestions)(game, playerRole, data.questionIds);
        if (success) {
            await (0, storage_1.addCardsToCollection)(getUserId(game[playerRole].id), data.questionIds);
            socket.emit('questions_selected', {
                count: data.questionIds.length,
                message: `Sait ${data.questionIds.length} uutta kysymystä!`
            });
            console.log(`Winner selected ${data.questionIds.length} questions in game ${game.id}`);
        }
        else {
            socket.emit('error', { message: 'Invalid question selection' });
        }
    });
    // Leave game
    socket.on('leave_game', () => {
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (gameData) {
            const { game } = gameData;
            console.log(`Player left game ${game.id}`);
            // Notify opponent
            socket.broadcast.to(game.id).emit('player_disconnected');
            // Remove game
            (0, gameManager_1.removeGame)(game.id);
            // Leave Socket.IO room
            socket.leave(game.id);
            broadcastWaitingGames(io);
        }
    });
    // Disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        // Clean up game if player disconnects
        const gameData = (0, gameManager_1.getGameBySocketId)(socket.id);
        if (gameData) {
            const { game } = gameData;
            io.to(game.id).emit('player_disconnected');
            (0, gameManager_1.removeGame)(game.id);
            broadcastWaitingGames(io);
        }
        // Clean up mapping
        socketToUserMap.delete(socket.id);
    });
    // --- Profile & Deck Management ---
    socket.on('get_profile', async () => {
        const profile = await (0, storage_1.getOrCreateProfile)(getUserId(socket.id));
        // Enrich deck with question text
        const ownedCardsDetails = profile.ownedCards.map((id) => {
            const q = (0, gameManager_1.getQuestion)(id);
            return q ? { id: q.id, question: q.question, difficulty: q.difficulty, category: q.category, cardType: q.cardType } : null;
        }).filter((q) => q !== null);
        socket.emit('profile_data', {
            ...profile,
            ownedCardsDetails
        });
    });
    socket.on('update_deck', async (data) => {
        const result = await (0, storage_1.updateActiveDeck)(getUserId(socket.id), data.activeCards, data.activeSpecialCards);
        if (result.success) {
            socket.emit('deck_updated', { success: true, activeCards: data.activeCards });
        }
        else {
            console.error('Deck update failed:', result.error);
            socket.emit('error', { message: `Deck save failed: ${result.error || 'Unknown error'}` });
        }
    });
    socket.on('get_history', async () => {
        const history = await (0, storage_1.getPlayerHistory)(getUserId(socket.id));
        socket.emit('history_data', history);
    });
});
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
