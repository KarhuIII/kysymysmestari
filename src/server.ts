import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import {
    createGame,
    createSinglePlayerGame,
    joinGame,
    getGameBySocketId,
    getQuestion,
    removeGame,
    setPlayerDeck,
    setPlayerSpecialHand,
    getAllQuestions,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    getWaitingGames
} from './gameManager';
import {
    playCard,
    answerQuestion,
    useSpecialCard,
    getPlayerGameState,
    getAvailableQuestionsForWinner,
    addSelectedQuestions
} from './gameLogic';
import {
    createMultiGame,
    joinMultiGame,
    leaveMultiGame,
    getMultiGame,
    getMultiGameBySocketId,
    getWaitingMultiGames,
    removeMultiGame,
    setMultiPlayerDeck,
    setMultiPlayerSpecialHand,
    getCurrentAskerId,
    startMultiGame,
    getQuestion as getMultiQuestion
} from './multiGameManager';
import {
    playCardMulti,
    answerQuestionMulti,
    resolveRound,
    getMultiPlayerGameState,
    toClientQuestion,
    getMultiPlayerDeck
} from './multiGameLogic';
import {
    loadData,
    getOrCreateProfile,
    getProfile,
    updateActiveDeck,
    updatePlayerStats,
    logGameHistory,
    addCardsToCollection,
    getPlayerHistory,
    getAllStats
} from './storage';
import {
    CreateGameResponse,
    JoinGameRequest,
    JoinGameResponse,
    PlayCardRequest,
    AnswerQuestionRequest,
    ClientQuestion,
    UseSpecialCardRequest,
    CreateMultiGameRequest,
    MultiGameMode
} from './types';


// Initialize storage
loadData();

// Map ephemeral socket ID -> Persistent User ID
const socketToUserMap = new Map<string, string>();

function getUserId(socketId: string): string {
    return socketToUserMap.get(socketId) || socketId;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json()); // Enable JSON body parsing for API

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// --- API Endpoints ---

app.get('/api/questions', (req, res) => {
    res.json(getAllQuestions());
});

app.post('/api/questions', (req, res) => {
    try {
        const q = addQuestion(req.body);
        res.json(q);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to add question' });
    }
});

app.put('/api/questions/:id', (req, res) => {
    try {
        const q = updateQuestion(req.params.id, req.body);
        if (q) res.json(q);
        else res.status(404).json({ error: 'Question not found' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update question' });
    }
});

app.delete('/api/questions/:id', (req, res) => {
    try {
        const success = deleteQuestion(req.params.id);
        if (success) res.json({ success: true });
        else res.status(404).json({ error: 'Question not found' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete question' });
    }
});

app.get('/api/stats', (req, res) => {
    res.json(getAllStats());
});

// ---------------------

// Helper to broadcast waiting games
const broadcastWaitingGames = async (io: Server) => {
    const games = getWaitingGames();
    const waitingGames = await Promise.all(games.map(async g => {
        const hostId = getUserId(g.playerA!.id);
        const profile = await getOrCreateProfile(hostId);
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

// Helper to broadcast waiting multi-games
const broadcastWaitingMultiGames = async () => {
    const games = getWaitingMultiGames();
    const waitingGames = await Promise.all(games.map(async g => {
        const host = g.players.get(g.hostId);
        return {
            id: g.id,
            hostName: host?.name || 'Host',
            mode: g.gameMode,
            playerCount: g.players.size,
            maxPlayers: g.maxPlayers,
            targetScore: g.targetScore
        };
    }));
    console.log(`🌐 [Multi] Broadcasting ${waitingGames.length} waiting multi-games`);
    io.emit('waiting_multi_games_list', waitingGames);
};

// Helper to send waiting multi-games to a specific socket
const broadcastWaitingMultiGamesTo = async (socket: Socket) => {
    const games = getWaitingMultiGames();
    const waitingGames = await Promise.all(games.map(async g => {
        const host = g.players.get(g.hostId);
        return {
            id: g.id,
            hostName: host?.name || 'Host',
            mode: g.gameMode,
            playerCount: g.players.size,
            maxPlayers: g.maxPlayers,
            targetScore: g.targetScore
        };
    }));
    socket.emit('waiting_multi_games_list', waitingGames);
};

// Socket.IO connection handling
io.on('connection', async (socket: Socket) => {
    // Handle authentication (persistent ID)
    const userId = socket.handshake.auth.token || socket.id;
    socketToUserMap.set(socket.id, userId);

    console.log(`Client connected: ${socket.id} (User: ${userId})`);

    // Send initial list to the new connection
    console.log(`📡 Sending initial waiting games list to ${socket.id}`);
    const initialGames = await Promise.all(getWaitingGames().map(async g => {
        const hostId = getUserId(g.playerA!.id);
        const profile = await getOrCreateProfile(hostId);
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
        const games = await Promise.all(getWaitingGames().map(async g => {
            const hostId = getUserId(g.playerA!.id);
            const profile = await getOrCreateProfile(hostId);
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
    socket.on('create_game', async (data: { targetScore?: number; visibility?: 'public' | 'private' }) => {
        const targetScore = data?.targetScore || 5;
        const visibility = data?.visibility || 'public';
        // Validate score
        const validScore = Math.max(3, Math.min(100, targetScore));

        // Get profile and set deck
        const profile = await getOrCreateProfile(getUserId(socket.id));
        const playerName = profile.displayName || profile.username || 'Pelaaja';

        // Validation: Check if player has enough cards for the target score
        if (profile.activeCards.length < validScore) {
            socket.emit('error', { message: `Sinulla pitää olla vähintään ${validScore} korttia pakassa pelataksesi tätä peliä (Nykyinen: ${profile.activeCards.length}).` });
            return;
        }

        const { gameId, playerId } = createGame(socket.id, playerName, validScore, visibility);

        // Inject player's deck into the game
        console.log(`Setting deck for playerA (Game ${gameId}):`, profile.activeCards.length, 'cards');
        setPlayerDeck(gameId, 'playerA', profile.activeCards);
        // Use activeSpecialCards logic (auto-fill 3 random for now if empty or specific logic)
        // For MVP: Give 3 specific ones if list empty, else use list. 
        const specials = profile.activeSpecialCards.length > 0 ? profile.activeSpecialCards : ['SKIP', 'JOKER', 'SWAP_SELF'];
        setPlayerSpecialHand(gameId, 'playerA', specials as any);

        socket.join(gameId);

        const response: CreateGameResponse = { gameId, playerId };
        socket.emit('game_created', response);
        
        // Send initial state for Lobby UI
        const { getGame } = require('./gameManager');
        const game = getGame(gameId);
        if (game) {
            const state = getPlayerGameState(game, 'playerA');
            socket.emit('game_state', state);
        }

        console.log(`Game created: ${gameId} by ${socket.id}`);
        await broadcastWaitingGames(io);
    });

    // Create Single Player Game
    socket.on('start_single_player', async () => {
        // Clean up any existing game for this socket first
        const existingGame = getGameBySocketId(socket.id);
        if (existingGame) {
            console.log(`Cleaning up existing game ${existingGame.game.id} before starting new SP game`);
            socket.leave(existingGame.game.id);
            removeGame(existingGame.game.id);
        }
        
        const profile = await getOrCreateProfile(getUserId(socket.id));
        const playerName = profile.displayName || profile.username || 'Pelaaja';
        const { gameId, playerId } = createSinglePlayerGame(socket.id, playerName);
        
        socket.join(gameId);
        
        // Notify client
        const response: CreateGameResponse = { gameId, playerId };
        socket.emit('game_created', response);
        
        // Send initial state for Lobby
        const { getGame } = require('./gameManager');
        const game = getGame(gameId);
        if (game) {
             const state = getPlayerGameState(game, 'playerA');
             socket.emit('game_state', state);
        }
        console.log(`Single Player Game created: ${gameId} by ${socket.id}`);
    });

    // Start 1v1 or Single Player Game (Manual Start)
    socket.on('start_game', () => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }

        const { game, playerRole } = gameData;

        // Only host/playerA can start
        if (playerRole !== 'playerA') {
            socket.emit('error', { message: 'Vain peli isäntä voi aloittaa pelin' });
            return;
        }

        // 1v1 check: need 2 players
        if (game.mode !== 'single' && !game.playerB) {
            socket.emit('error', { message: 'Peli tarvitsee toisen pelaajan ennen aloitusta' });
            return;
        }

        // Activate game
        game.status = 'active';

        // Serve first question for Single Player
        if (game.mode === 'single' && game.systemDeck && game.systemDeck.length > 0) {
            const firstQId = game.systemDeck.shift()!;
            game.activeQuestion = {
                from: 'SYSTEM',
                to: socket.id,
                questionId: firstQId
            };
        }

        // Notify all players in game
        const updateState = (role: 'playerA' | 'playerB') => {
            const player = game[role];
            if (player) {
                const s = getPlayerGameState(game, role);
                io.to(player.id).emit('game_state', s);
                
                // If single player question was set, send it
                if (game.mode === 'single' && game.activeQuestion) {
                    const q = getQuestion(game.activeQuestion.questionId);
                    if (q) {
                        const clientQ = toClientQuestion(q);
                        io.to(player.id).emit('question_presented', { question: clientQ });
                    }
                }
            }
        };

        updateState('playerA');
        updateState('playerB');

        console.log(`Game ${game.id} manually started by host`);
    });

    // Join game (Request Phase)
    socket.on('join_game', async (data: JoinGameRequest) => {
        const { getGame } = require('./gameManager');
        const targetGame = getGame(data.gameId);

        if (!targetGame) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }

        // Validate Deck Size
        const profile = await getOrCreateProfile(getUserId(socket.id));
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
    socket.on('resolve_join_request', async (data: { decision: 'accept' | 'reject' }) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData || gameData.playerRole !== 'playerA') return;

        const { game } = gameData;
        if (!game.pendingJoinRequest) return;

        const requesterId = game.pendingJoinRequest.socketId;
        const requesterSocket = io.sockets.sockets.get(requesterId);

        if (data.decision === 'accept') {
             const requesterName = game.pendingJoinRequest?.username || 'Pelaaja';
             game.pendingJoinRequest = null; // Clear request first

             if (!requesterSocket) {
                 socket.emit('error', { message: 'Pelaaja on poistunut pelistä.' });
                 return;
             }

             // Proceed with Join Logic
             // We use the captured requesterName
             const result = joinGame(game.id, requesterId, requesterName);

             if (result.success) {
                const profile = await getOrCreateProfile(getUserId(requesterId));

                console.log(`Setting deck for playerB (Game ${game.id}):`, profile.activeCards.length, 'cards');
                setPlayerDeck(game.id, 'playerB', profile.activeCards);
                const specials = profile.activeSpecialCards.length > 0 ? profile.activeSpecialCards : ['SKIP', 'JOKER', 'SWAP_SELF'];
                setPlayerSpecialHand(game.id, 'playerB', specials as any);

                requesterSocket.join(game.id);

                const response: JoinGameResponse = {
                    success: true,
                    playerId: result.playerId
                };
                requesterSocket.emit('game_joined', response);

                // Send game state to both
                if (game.playerA) {
                    const stateA = getPlayerGameState(game, 'playerA');
                    io.to(game.playerA.id).emit('game_state', stateA);
                }
                if (game.playerB) {
                    const stateB = getPlayerGameState(game, 'playerB');
                    requesterSocket.emit('game_state', stateB);
                }

                console.log(`Player joined game (Approved): ${game.id}`);
                await broadcastWaitingGames(io);

             } else {
                 requesterSocket.emit('error', { message: result.error || 'Liittyminen epäonnistui' });
             }
        } else {
            // Reject
            game.pendingJoinRequest = null;
            if (requesterSocket) {
                requesterSocket.emit('error', { message: 'Pelin pitäjä hylkäsi liittymispyynnön.' });
                requesterSocket.emit('join_status', { status: 'rejected' });
            }
        }
    });

    // Play card
    socket.on('play_card', (data: PlayCardRequest) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        const { game, playerRole } = gameData;
        const question = playCard(game, playerRole, data.questionId);

        if (!question) {
            socket.emit('error', { message: 'Cannot play this card' });
            return;
        }

        // Send question to opponent (without correct answer)
        const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';
        const opponent = game[opponentRole];

        if (opponent) {
            const clientQuestion: ClientQuestion = {
                id: question.id,
                question: question.question,
                options: question.options,
                category: question.category,
                cardType: question.cardType
            };

            console.log(`Sending question to opponent in room ${game.id}:`, clientQuestion.question);
            // Send to the other player in the room
            socket.broadcast.to(game.id).emit('question_presented', { question: clientQuestion });
        } else {
            console.log('No opponent found!');
        }

        // Update game state for both players
        const statePlayer = getPlayerGameState(game, playerRole);
        const stateOpponent = getPlayerGameState(game, opponentRole);

        // Send to current player
        socket.emit('game_state', statePlayer);
        // Send to opponent via room broadcast
        if (opponent) {
            socket.broadcast.to(game.id).emit('game_state', stateOpponent);
        }

        console.log(`Card played in game ${game.id}: ${data.questionId}`);
    });

    // Use Special Card
    socket.on('use_special_card', (data: UseSpecialCardRequest) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) return;

        const { game, playerRole } = gameData;
        const result = useSpecialCard(game, playerRole, data.cardType);

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
            const q = getQuestion(game.activeQuestion.questionId);
            if (q) {
                const clientQ: ClientQuestion = { id: q.id, question: q.question, options: q.options, category: q.category, cardType: q.cardType };
                const opponent = game[playerRole === 'playerA' ? 'playerB' : 'playerA'];
                socket.broadcast.to(game.id).emit('question_presented', { question: clientQ });
            }
        }

        // Send updated state
        const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';
        io.to(game[playerRole]!.id).emit('game_state', getPlayerGameState(game, playerRole));
        if (game[opponentRole]) {
            io.to(game[opponentRole]!.id).emit('game_state', getPlayerGameState(game, opponentRole));
        }
    });

    // Answer question
    socket.on('answer_question', async (data: AnswerQuestionRequest) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        const { game, playerRole } = gameData;
        const result = answerQuestion(game, playerRole, data.answerIndex);

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
            // SINGLE PLAYER GAME OVER
            if (game.mode === 'single') {
                const finalScore = game.playerA!.score;
                // Log history for single player
                await logGameHistory(getUserId(game.playerA!.id), {
                    gameId: game.id, timestamp: Date.now(), opponent: 'SYSTEM', result: 'win',
                    score: { you: finalScore, opponent: 0 }, playedCards: []
                });
                await updatePlayerStats(getUserId(game.playerA!.id), 'win');
                
                // Get available questions for winner to select
                const availableQuestionIds = getAvailableQuestionsForWinner(game, 'playerA');
                const availableQuestions = availableQuestionIds.map((qId: string) => {
                    const q = getQuestion(qId);
                    return q ? { id: q.id, question: q.question, options: q.options } : null;
                }).filter((q: any) => q !== null);
                
                socket.emit('game_over', {
                    winner: 'you',
                    finalScore: { you: finalScore, opponent: 0 },
                    availableQuestions
                });
                console.log(`Single Player Game ${game.id} ended. Score: ${finalScore}/10`);
            } else {
                // MULTIPLAYER GAME OVER
                // Handle Draw
                if (!result.winner) {
                    // Log History for Draw
                    if (game.playerA && game.playerB) {
                        await logGameHistory(game.playerA.id, {
                            gameId: game.id, timestamp: Date.now(), opponent: game.playerB.id, result: 'draw',
                            score: { you: game.playerA.score, opponent: game.playerB.score }, playedCards: []
                        });
                        await logGameHistory(game.playerB.id, {
                            gameId: game.id, timestamp: Date.now(), opponent: game.playerA.id, result: 'draw',
                            score: { you: game.playerB.score, opponent: game.playerA.score }, playedCards: []
                        });
                        await updatePlayerStats(getUserId(game.playerA.id), 'draw');
                        await updatePlayerStats(getUserId(game.playerB.id), 'draw');
                    }

                    io.to(game.playerA!.id).emit('game_over', {
                        winner: 'draw',
                        finalScore: {
                            you: game.playerA!.score,
                            opponent: game.playerB!.score
                        }
                    });
                    io.to(game.playerB!.id).emit('game_over', {
                        winner: 'draw',
                        finalScore: {
                            you: game.playerB!.score,
                            opponent: game.playerA!.score
                        }
                    });
                    console.log(`Game ${game.id} ended in a DRAW`);
                } else {
                    // Handle Winner
                    const winnerRole = result.winner;
                    const loserRole = winnerRole === 'playerA' ? 'playerB' : 'playerA';

                    // Update Stats & History
                    const winnerId = game[winnerRole]!.id;
                    const loserId = game[loserRole]!.id;

                    await updatePlayerStats(getUserId(winnerId), 'win');
                    if (game[loserRole]) await updatePlayerStats(getUserId(loserId), 'loss');

                    await logGameHistory(getUserId(winnerId), {
                        gameId: game.id, timestamp: Date.now(), opponent: loserId, result: 'win',
                        score: { you: game[winnerRole]!.score, opponent: game[loserRole]!.score }, playedCards: []
                    });
                    if (game[loserRole]) {
                        await logGameHistory(getUserId(loserId), {
                            gameId: game.id, timestamp: Date.now(), opponent: winnerId, result: 'loss',
                            score: { you: game[loserRole]!.score, opponent: game[winnerRole]!.score }, playedCards: []
                        });
                    }

                    // Get available questions for winner to select
                    const availableQuestionIds = getAvailableQuestionsForWinner(game, winnerRole);
                    const availableQuestions = availableQuestionIds.map((qId: string) => {
                        const q = getQuestion(qId);
                        return q ? { id: q.id, question: q.question, options: q.options } : null;
                    }).filter((q: any) => q !== null);

                    // Send game over to winner with available questions
                    io.to(game[winnerRole]!.id).emit('game_over', {
                        winner: 'you',
                        finalScore: {
                            you: game[winnerRole]!.score,
                            opponent: game[loserRole]!.score
                        },
                        availableQuestions
                    });

                    // Send game over to loser
                    if (game[loserRole]) {
                        io.to(game[loserRole]!.id).emit('game_over', {
                            winner: 'opponent',
                            finalScore: {
                                you: game[loserRole]!.score,
                                opponent: game[winnerRole]!.score
                            }
                        });
                    }
                    console.log(`Game ${game.id} ended. Winner: ${winnerRole}`);
                }
            }
        } else {
            // Update game state for both players
            const statePlayer = getPlayerGameState(game, playerRole);
            const stateOpponent = getPlayerGameState(game, opponentRole);

            io.to(game[playerRole]!.id).emit('game_state', statePlayer);
            if (opponent) {
                io.to(opponent.id).emit('game_state', stateOpponent);
            }

            // Single Player: If next question is ready, send it
            if (game.mode === 'single' && game.activeQuestion) {
                const q = getQuestion(game.activeQuestion.questionId);
                if (q) {
                    const clientQ: ClientQuestion = { 
                        id: q.id, 
                        question: q.question, 
                        options: q.options, 
                        category: q.category, 
                        cardType: q.cardType 
                    };
                    socket.emit('question_presented', { question: clientQ });
                }
            }
        }

        console.log(`Question answered in game ${game.id}: ${result.correct ? 'correct' : 'wrong'}`);
    });

    // Select questions (winner only)
    socket.on('select_questions', async (data: { questionIds: string[] }) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Game not found' });
            return;
        }

        const { game, playerRole } = gameData;

        // Verify player is the winner
        // In Single Player, winner is always 'playerA' (the player role, not socket ID)
        if (game.mode === 'single') {
            if (game.winner !== 'playerA' || playerRole !== 'playerA') {
                socket.emit('error', { message: 'Only winner can select questions' });
                return;
            }
        } else {
            if (game.winner !== game[playerRole]?.id) {
                socket.emit('error', { message: 'Only winner can select questions' });
                return;
            }
        }

        // Add selected questions
        const success = addSelectedQuestions(game, playerRole, data.questionIds);

        if (success) {
            await addCardsToCollection(getUserId(game[playerRole]!.id), data.questionIds);

            socket.emit('questions_selected', {
                count: data.questionIds.length,
                message: `Sait ${data.questionIds.length} uutta kysymystä!`
            });
            console.log(`Winner selected ${data.questionIds.length} questions in game ${game.id}`);
        } else {
            socket.emit('error', { message: 'Invalid question selection' });
        }
    });

    // Leave game
    socket.on('leave_game', () => {
        const gameData = getGameBySocketId(socket.id);
        if (gameData) {
            const { game } = gameData;
            console.log(`Player left game ${game.id}`);

            // Notify opponent
            socket.broadcast.to(game.id).emit('player_disconnected');

            // Remove game
            removeGame(game.id);

            // Leave Socket.IO room
            socket.leave(game.id);
            broadcastWaitingGames(io);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);

        // Clean up game if player disconnects
        const gameData = getGameBySocketId(socket.id);
        if (gameData) {
            const { game } = gameData;
            io.to(game.id).emit('player_disconnected');
            removeGame(game.id);
            broadcastWaitingGames(io);
        }

        // Clean up mapping
        socketToUserMap.delete(socket.id);
    });

    // --- Profile & Deck Management ---

    socket.on('get_profile', async () => {
        const profile = await getOrCreateProfile(getUserId(socket.id));

        // Enrich deck with question text
        const ownedCardsDetails = profile.ownedCards.map((id: string) => {
            const q = getQuestion(id);
            return q ? { id: q.id, question: q.question, difficulty: q.difficulty, category: q.category, cardType: q.cardType } : null;
        }).filter((q: any) => q !== null);

        socket.emit('profile_data', {
            ...profile,
            ownedCardsDetails
        });
    });

    socket.on('update_deck', async (data: { activeCards: string[], activeSpecialCards?: any[] }) => {
        const result = await updateActiveDeck(getUserId(socket.id), data.activeCards, data.activeSpecialCards);
        if (result.success) {
            socket.emit('deck_updated', { success: true, activeCards: data.activeCards });
        } else {
            console.error('Deck update failed:', result.error);
            socket.emit('error', { message: `Deck save failed: ${result.error || 'Unknown error'}` });
        }
    });

    socket.on('get_history', async () => {
        const history = await getPlayerHistory(getUserId(socket.id));
        socket.emit('history_data', history);
    });

    // ==================== MULTI-PLAYER MODE ====================

    // Create Multi-Player Game
    socket.on('create_multi_game', async (data: CreateMultiGameRequest) => {
        const profile = await getOrCreateProfile(getUserId(socket.id));
        const playerName = profile.displayName || profile.username || 'Host';
        
        const { gameId, playerId } = createMultiGame(socket.id, playerName, {
            mode: data.mode,
            maxPlayers: data.maxPlayers || 10,
            targetScore: data.targetScore || 5,
            visibility: data.visibility || 'public'
        });

        // Set player's deck
        if (profile.activeCards.length > 0) {
            setMultiPlayerDeck(gameId, playerId, profile.activeCards);
        }
        const specials = profile.activeSpecialCards?.length > 0 
            ? profile.activeSpecialCards 
            : ['SKIP', 'JOKER', 'SWAP_SELF'];
        setMultiPlayerSpecialHand(gameId, playerId, specials as any);

        socket.join(gameId);
        socket.emit('multi_game_created', { gameId, playerId });
        
        // Send initial state
        const game = getMultiGame(gameId);
        if (game) {
            socket.emit('multi_game_state', getMultiPlayerGameState(game, playerId));
        }

        console.log(`[Multi] Game ${gameId} created by ${playerName} (mode: ${data.mode})`);
        broadcastWaitingMultiGames();
    });

    // Get waiting multi games
    socket.on('get_waiting_multi_games', () => {
        broadcastWaitingMultiGamesTo(socket);
    });

    // Join Multi-Player Game
    socket.on('join_multi_game', async (data: { gameId: string }) => {
        const profile = await getOrCreateProfile(getUserId(socket.id));
        const playerName = profile.displayName || profile.username || 'Player';

        const result = joinMultiGame(data.gameId, socket.id, playerName);

        if (!result.success) {
            socket.emit('error', { message: result.error || 'Liittyminen epäonnistui' });
            return;
        }

        const game = getMultiGame(data.gameId);
        if (!game) return;

        // Set player's deck
        if (profile.activeCards.length > 0) {
            setMultiPlayerDeck(data.gameId, result.playerId!, profile.activeCards);
        }
        const specials = profile.activeSpecialCards?.length > 0 
            ? profile.activeSpecialCards 
            : ['SKIP', 'JOKER', 'SWAP_SELF'];
        setMultiPlayerSpecialHand(data.gameId, result.playerId!, specials as any);

        socket.join(data.gameId);
        socket.emit('multi_game_joined', { gameId: data.gameId, playerId: result.playerId });

        // Send state to all players in game
        for (const [pid, player] of game.players) {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.emit('multi_game_state', getMultiPlayerGameState(game, pid));
            }
        }

        console.log(`[Multi] ${playerName} joined game ${data.gameId}`);
        broadcastWaitingMultiGames();
    });

    // Start Multi-Player Game (Host only)
    socket.on('start_multi_game', () => {
        const gameData = getMultiGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }

        const { game, playerId } = gameData;

        // Only host can start
        if (game.hostId !== playerId) {
            socket.emit('error', { message: 'Vain pelin luoja voi aloittaa pelin' });
            return;
        }

        if (game.players.size < 2) {
            socket.emit('error', { message: 'Pelissä pitää olla vähintään 2 pelaajaa' });
            return;
        }

        const success = startMultiGame(game.id);
        if (!success) {
            socket.emit('error', { message: 'Pelin aloitus epäonnistui' });
            return;
        }

        // Send state to all players
        for (const [pid, player] of game.players) {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.emit('multi_game_started');
                playerSocket.emit('multi_game_state', getMultiPlayerGameState(game, pid));
                
                // Send deck to each player
                playerSocket.emit('multi_deck', getMultiPlayerDeck(game, pid));
            }
        }

        console.log(`[Multi] Game ${game.id} started with ${game.players.size} players`);
        broadcastWaitingMultiGames();
    });

    // Play card in Multi-Player
    socket.on('play_card_multi', (data: { questionId: string; targetId?: string }) => {
        const gameData = getMultiGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }

        const { game, playerId } = gameData;
        const result = playCardMulti(game, playerId, data.questionId, data.targetId);

        if (!result.success) {
            socket.emit('error', { message: result.error || 'Kortin pelaaminen epäonnistui' });
            return;
        }

        if (!result.question || !game.activeQuestion) return;

        const clientQ = toClientQuestion(result.question);
        const askerName = game.players.get(playerId)?.name || 'Kysyjä';

        // Send question to answerers
        for (const answerId of game.activeQuestion.to) {
            const answerer = game.players.get(answerId);
            if (answerer) {
                const answererSocket = io.sockets.sockets.get(answerer.id);
                if (answererSocket) {
                    answererSocket.emit('multi_question_presented', {
                        question: clientQ,
                        askerId: playerId,
                        askerName: askerName,
                        targetIds: game.activeQuestion.to
                    });
                }
            }
        }

        // Send updated state to all
        for (const [pid, player] of game.players) {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.emit('multi_game_state', getMultiPlayerGameState(game, pid));
            }
        }

        console.log(`[Multi] Card played in game ${game.id} by ${askerName}`);
    });

    // Answer question in Multi-Player
    socket.on('answer_multi', (data: { answerIndex: number }) => {
        const gameData = getMultiGameBySocketId(socket.id);
        if (!gameData) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }

        const { game, playerId } = gameData;
        const result = answerQuestionMulti(game, playerId, data.answerIndex);

        if (!result.success) {
            socket.emit('error', { message: result.error || 'Vastaaminen epäonnistui' });
            return;
        }

        // Notify the answerer immediately
        socket.emit('multi_answer_received', { correct: result.correct });

        // Check if all have answered
        if (result.allAnswered) {
            const roundResult = resolveRound(game);

            // Send round result to all
            for (const [pid, player] of game.players) {
                const playerSocket = io.sockets.sockets.get(player.id);
                if (playerSocket) {
                    const nextAsker = game.players.get(getCurrentAskerId(game));
                    playerSocket.emit('multi_round_result', {
                        results: roundResult.results,
                        correctAnswer: roundResult.correctAnswer,
                        nextAskerId: getCurrentAskerId(game),
                        nextAskerName: nextAsker?.name || 'Seuraava'
                    });

                    // If game over, send game over
                    if (roundResult.gameOver) {
                        const rankings = Array.from(game.players.values())
                            .sort((a, b) => b.score - a.score)
                            .map((p, i) => ({ playerId: p.playerId, name: p.name, score: p.score, rank: i + 1 }));
                        
                        const winner = game.players.get(roundResult.winner!);
                        playerSocket.emit('multi_game_over', {
                            rankings,
                            winnerId: roundResult.winner,
                            winnerName: winner?.name || 'Voittaja'
                        });
                    } else {
                        // Send updated state
                        playerSocket.emit('multi_game_state', getMultiPlayerGameState(game, pid));
                    }
                }
            }

            console.log(`[Multi] Round resolved in game ${game.id}. Game over: ${roundResult.gameOver}`);
        }
    });

    // Leave Multi-Player Game
    socket.on('leave_multi_game', () => {
        const gameData = getMultiGameBySocketId(socket.id);
        if (!gameData) return;

        const { game, playerId } = gameData;
        const playerName = game.players.get(playerId)?.name || 'Player';

        leaveMultiGame(game.id, playerId);
        socket.leave(game.id);

        // Notify remaining players
        for (const [pid, player] of game.players) {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
                playerSocket.emit('multi_player_left', { playerName });
                playerSocket.emit('multi_game_state', getMultiPlayerGameState(game, pid));
            }
        }

        console.log(`[Multi] ${playerName} left game ${game.id}`);
        broadcastWaitingMultiGames();
    });

});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
