import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import 'dotenv/config';

import {
    createGame,
    joinGame,
    getGameBySocketId,
    getGame,
    removeGame,
    getWaitingGames,
    initQuestions,
    getAllQuestions
} from './managers/GameManager';

import {
    getGameState,
    playCard,
    answerQuestion,
    toClientQuestion,
    getAvailableQuestionsForWinner
} from './engine/GameEngine';

import {
    loadData,
    getOrCreateProfile,
    updateActiveDeck,
    updatePlayerStats,
    logGameHistory,
    addCardsToCollection,
    getPlayerHistory,
    getAllStats
} from './storage';

import {
    Question,
    ClientQuestion,
    Game,
    Player,
    JoinGameResponse,
    SpecialCardType
} from './types';

// Initialize storage and managers
async function initialize() {
    console.log('🚀 Initializing server components...');
    await loadData();
    await initQuestions();
    console.log('✅ Initialization complete.');
}

initialize().catch(err => {
    console.error('❌ Critical initialization error:', err);
    process.exit(1);
});

// Map ephemeral socket ID -> Persistent User ID
const socketToUserMap = new Map<string, string>();

function getUserId(socketId: string): string {
    return socketToUserMap.get(socketId) || socketId;
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- API Endpoints ---

app.get('/api/questions', (req, res) => {
    res.json(getAllQuestions());
});

app.get('/api/stats', (req, res) => {
    res.json(getAllStats());
});

// --- Helper to broadcast waiting games ---
const broadcastWaitingGames = async (io: Server) => {
    const games = getWaitingGames();
    const waitingGames = await Promise.all(games.map(async g => {
        const profile = await getOrCreateProfile(g.hostId);
        const winRate = profile.stats.gamesPlayed > 0 
            ? Math.round((profile.stats.wins / profile.stats.gamesPlayed) * 100) 
            : 0;
            
        return {
            id: g.id,
            hostName: profile.displayName || profile.username || g.hostId.substring(0, 8),
            winRate: winRate,
            type: g.type,
            playerCount: g.players.size,
            maxPlayers: g.maxPlayers
        };
    }));
    io.emit('waiting_games_list', waitingGames);
};

// --- Helper to present question in single player mode ---
const SP_TOTAL_QUESTIONS = 10;

const presentSinglePlayerQuestion = (game: Game, socket: Socket, playerId: string) => {
    const questionsAnswered = game.answeredQuestions.length;
    
    // Check if we've completed 10 questions
    if (questionsAnswered >= SP_TOTAL_QUESTIONS) {
        game.status = 'finished';
        const player = game.players.get(playerId)!;
        const allCorrect = player.score === SP_TOTAL_QUESTIONS;
        
        // If all correct, player can pick from answered questions
        let availableQuestions: any[] = [];
        if (allCorrect) {
            const answeredIds = game.answeredQuestions.map(aq => aq.questionId);
            availableQuestions = answeredIds.slice(0, 3).map(id => {
                const q = getAllQuestions().find(x => x.id === id);
                return q ? { id: q.id, question: q.question, options: q.options } : null;
            }).filter(x => x !== null);
        }
        
        socket.emit('game_over', {
            winner: 'you',
            rankings: [{ playerId, name: player.name, score: player.score, rank: 1 }],
            availableQuestions,
            perfectScore: allCorrect,
            totalQuestions: SP_TOTAL_QUESTIONS
        });
        removeGame(game.id);
        return;
    }

    if (!game.systemDeck || game.systemDeck.length === 0) {
        // No more questions in deck - end game early
        game.status = 'finished';
        const player = game.players.get(playerId)!;
        
        socket.emit('game_over', {
            winner: 'you',
            rankings: [{ playerId, name: player.name, score: player.score, rank: 1 }],
            availableQuestions: [],
            totalQuestions: questionsAnswered
        });
        removeGame(game.id);
        return;
    }

    const questionId = game.systemDeck.shift()!;
    const question = getAllQuestions().find(q => q.id === questionId);
    
    if (!question) {
        // Skip invalid question, try next
        presentSinglePlayerQuestion(game, socket, playerId);
        return;
    }

    // Set up active question with SYSTEM as asker
    game.activeQuestion = {
        from: 'SYSTEM',
        to: [playerId],
        questionId: questionId,
        answers: new Map([[playerId, null]])
    };

    socket.emit('question_presented', { 
        question: toClientQuestion(question),
        questionNumber: questionsAnswered + 1,
        totalQuestions: SP_TOTAL_QUESTIONS  
    });
    socket.emit('game_state', getGameState(game, playerId, getAllQuestions()));
};
io.on('connection', async (socket: Socket) => {
    const userId = socket.handshake.auth.token || socket.id;
    socketToUserMap.set(socket.id, userId);

    console.log(`Client connected: ${socket.id} (User: ${userId})`);
    await broadcastWaitingGames(io);

    socket.on('get_waiting_games', async () => {
        await broadcastWaitingGames(io);
    });

    socket.on('get_profile', async () => {
        const uid = getUserId(socket.id);
        const profile = await getOrCreateProfile(uid);
        
        // Enrich profile with full card details for Deck Manager
        const allQuestions = getAllQuestions();
        const enrichedProfile = {
            ...profile,
            ownedCardsDetails: profile.ownedCards.map(id => {
                const q = allQuestions.find(x => x.id === id);
                return q ? q : { id, question: 'Unknown card', category: 'General', difficulty: 1 };
            })
        };
        
        socket.emit('profile_data', enrichedProfile);
    });

    socket.on('get_history', async () => {
        const uid = getUserId(socket.id);
        const history = await getPlayerHistory(uid);
        socket.emit('history_data', history);
    });

    socket.on('update_deck', async (data: { activeCards: string[], activeSpecialCards?: string[] }) => {
        const uid = getUserId(socket.id);
        const result = await updateActiveDeck(uid, data.activeCards, data.activeSpecialCards);
        if (result.success) {
            socket.emit('deck_updated', { success: true });
        } else {
            socket.emit('error', { message: result.error || 'Dekin päivitys epäonnistui' });
        }
    });

    // Create Game
    socket.on('create_game', async (data: { targetScore?: number; visibility?: 'public' | 'private' }) => {
        const profile = await getOrCreateProfile(getUserId(socket.id));
        const playerName = profile.displayName || profile.username || 'Pelaaja';
        const uid = getUserId(socket.id);

        const game = createGame(socket.id, uid, playerName, 'classic', {
            targetScore: data.targetScore,
            visibility: data.visibility
        });

        const player = game.players.get(uid)!;
        player.deck = profile.activeCards;
        player.specialHand = profile.activeSpecialCards;

        socket.join(game.id);
        socket.emit('game_created', { gameId: game.id, playerId: uid });
        socket.emit('game_state', getGameState(game, uid, getAllQuestions()));

        await broadcastWaitingGames(io);
    });

    // Start Single Player
    socket.on('start_single_player', async () => {
        const uid = getUserId(socket.id);
        const profile = await getOrCreateProfile(uid);
        const playerName = profile.displayName || profile.username || 'Pelaaja';

        const game = createGame(socket.id, uid, playerName, 'single', {});
        const player = game.players.get(uid)!;
        player.deck = profile.activeCards;
        player.specialHand = profile.activeSpecialCards;

        // Create system deck from all available questions (shuffled)
        const allQ = getAllQuestions();
        game.systemDeck = allQ.map(q => q.id).sort(() => Math.random() - 0.5);

        socket.join(game.id);
        socket.emit('game_created', { gameId: game.id, playerId: uid });
        socket.emit('game_state', getGameState(game, uid, getAllQuestions()));

        // Automatically present first question for single player
        presentSinglePlayerQuestion(game, socket, uid);
    });

    // Start Game (Manual)
    socket.on('start_game', (data: { gameId: string }) => {
        const game = getGame(data.gameId);
        if (!game) return;

        if (game.hostId !== getUserId(socket.id)) {
            socket.emit('error', { message: 'Vain isäntä voi aloittaa' });
            return;
        }

        game.status = 'active';
        for (const p of game.players.values()) {
            io.to(p.id).emit('game_state', getGameState(game, p.playerId, getAllQuestions()));
        }
        broadcastWaitingGames(io);
    });

    // Join Game
    socket.on('join_game', async (data: { gameId: string }) => {
        const game = getGame(data.gameId);
        if (!game) {
            socket.emit('error', { message: 'Peliä ei löydy' });
            return;
        }

        const uid = getUserId(socket.id);
        const profile = await getOrCreateProfile(uid);
        const playerName = profile.displayName || profile.username || 'Pelaaja';

        if (game.visibility === 'private' && game.hostId !== uid) {
            game.pendingJoinRequests.set(uid, { socketId: socket.id, username: playerName });
            const host = game.players.get(game.hostId);
            if (host) {
                io.to(host.id).emit('join_request', { playerId: uid, playerName, gameId: game.id });
            }
            socket.emit('join_status', { status: 'waiting_for_approval' });
            return;
        }

        const result = joinGame(data.gameId, socket.id, uid, playerName);
        if (result.success) {
            const player = game.players.get(uid)!;
            player.deck = profile.activeCards;
            player.specialHand = profile.activeSpecialCards;

            socket.join(game.id);
            socket.emit('game_joined', { success: true, playerId: uid });

            for (const p of game.players.values()) {
                io.to(p.id).emit('game_state', getGameState(game, p.playerId, getAllQuestions()));
            }
            await broadcastWaitingGames(io);
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    // Resolve Join Request
    socket.on('resolve_join_request', async (data: { gameId: string, playerId: string, decision: 'accept' | 'reject' }) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData || gameData.game.hostId !== gameData.playerId) return;

        const { game } = gameData;
        const req = game.pendingJoinRequests.get(data.playerId);
        if (!req) return;

        game.pendingJoinRequests.delete(data.playerId);

        if (data.decision === 'accept') {
            const result = joinGame(game.id, req.socketId, data.playerId, req.username);
            if (result.success) {
                const profile = await getOrCreateProfile(data.playerId);
                const player = game.players.get(data.playerId)!;
                player.deck = profile.activeCards;
                player.specialHand = profile.activeSpecialCards;

                const targetSocket = io.sockets.sockets.get(req.socketId);
                if (targetSocket) {
                    targetSocket.join(game.id);
                    targetSocket.emit('game_joined', { success: true, playerId: data.playerId });
                }

                for (const p of game.players.values()) {
                    io.to(p.id).emit('game_state', getGameState(game, p.playerId, getAllQuestions()));
                }
                await broadcastWaitingGames(io);
            }
        } else {
            io.to(req.socketId).emit('join_status', { status: 'rejected' });
        }
    });

    // Play Card
    socket.on('play_card', (data: { cardId: string, targetIds?: string[] }) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) return;

        const { game, playerId } = gameData;
        const result = playCard(game, playerId, data.cardId, data.targetIds);

        if (result.success) {
            const q = getAllQuestions().find(x => x.id === data.cardId);
            if (q) {
                const clientQ = toClientQuestion(q);
                for (const tid of game.activeQuestion!.to) {
                    const target = game.players.get(tid);
                    if (target) io.to(target.id).emit('question_presented', { question: clientQ });
                }
                for (const p of game.players.values()) {
                    io.to(p.id).emit('game_state', getGameState(game, p.playerId, getAllQuestions()));
                }
            }
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    // Answer Question
    socket.on('answer_question', async (data: { answerIndex: number }) => {
        const gameData = getGameBySocketId(socket.id);
        if (!gameData) return;

        const { game, playerId } = gameData;
        const result = answerQuestion(game, playerId, data.answerIndex, getAllQuestions());

        if (result.success) {
            const lastAns = game.answeredQuestions[game.answeredQuestions.length - 1];
            const q = getAllQuestions().find(x => x.id === lastAns.questionId);

            socket.emit('answer_result', {
                correct: result.correct,
                correctAnswer: q?.correctIndex,
                pointsAwarded: result.correct ? 1 : 0
            });

            // Notify asker (if not SYSTEM)
            if (lastAns.askedBy !== 'SYSTEM') {
                const asker = game.players.get(lastAns.askedBy);
                if (asker) {
                    io.to(asker.id).emit('opponent_answered', {
                        correct: result.correct,
                        correctAnswer: q?.correctIndex,
                        answeredBy: playerId
                    });
                }
            }

            for (const p of game.players.values()) {
                io.to(p.id).emit('game_state', getGameState(game, p.playerId, getAllQuestions()));
            }

            if (result.gameOver) {
                await handleGameOver(game, result.winner);
            } else if (game.type === 'single') {
                // Single player: present next question automatically after a short delay
                setTimeout(() => {
                    presentSinglePlayerQuestion(game, socket, playerId);
                }, 100);
            }
        } else {
            socket.emit('error', { message: result.error });
        }
    });

    const handleGameOver = async (game: Game, winnerId?: string | null) => {
        const rankings = Array.from(game.players.values())
            .sort((a, b) => b.score - a.score)
            .map((p, i) => ({ playerId: p.playerId, name: p.name, score: p.score, rank: i + 1 }));

        for (const p of game.players.values()) {
            const isWinner = p.playerId === winnerId;
            let availableQuestions: any[] = [];
            
            if (isWinner) {
                const qIds = getAvailableQuestionsForWinner(game, winnerId!, getAllQuestions());
                availableQuestions = qIds.map(id => {
                    const q = getAllQuestions().find(x => x.id === id);
                    return q ? { id: q.id, question: q.question, options: q.options } : null;
                }).filter(x => x !== null);
            }

            io.to(p.id).emit('game_over', {
                winner: isWinner ? 'you' : (winnerId ? 'opponent' : 'draw'),
                rankings,
                availableQuestions
            });

            await logGameHistory(p.playerId, {
                gameId: game.id,
                timestamp: Date.now(),
                opponent: winnerId ? (winnerId === p.playerId ? (game.players.size > 1 ? 'Multiple' : 'SYSTEM') : winnerId) : 'DRAW',
                result: isWinner ? 'win' : (winnerId ? 'loss' : 'draw'),
                score: { you: p.score, opponent: 0 },
                playedCards: []
            });
            await updatePlayerStats(p.playerId, isWinner ? 'win' : (winnerId ? 'loss' : 'draw'));
        }

        removeGame(game.id);
        await broadcastWaitingGames(io);
    };

    socket.on('select_end_questions', async (data: { selectedIds: string[] }) => {
        await addCardsToCollection(getUserId(socket.id), data.selectedIds);
        socket.emit('cards_added_success');
    });

    const handleLeave = async () => {
        const gameData = getGameBySocketId(socket.id);
        if (gameData) {
            const { game } = gameData;
            socket.leave(game.id);
            removeGame(game.id);
            io.to(game.id).emit('player_disconnected');
            await broadcastWaitingGames(io);
        }
    };

    socket.on('leave_game', handleLeave);
    socket.on('disconnect', handleLeave);
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
