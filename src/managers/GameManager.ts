import { Game, Player, GameMode, MultiMode, Question } from '../types';
import { loadQuestions } from '../questionLoader';

let questions: Question[] = [];
const games = new Map<string, Game>();

export async function initQuestions() {
    questions = await loadQuestions();
}

export function getAllQuestions(): Question[] {
    return questions;
}

function generateId(prefix: string = ''): string {
    return prefix + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function createGame(
    hostSocketId: string,
    hostPlayerId: string,
    hostName: string,
    type: GameMode,
    options: {
        targetScore?: number;
        visibility?: 'public' | 'private';
        maxPlayers?: number;
        multiMode?: MultiMode;
    }
): Game {
    const gameId = generateId(type === 'multi' ? 'M' : '');
    
    const host: Player = {
        id: hostSocketId,
        playerId: hostPlayerId,
        name: hostName,
        score: 0,
        deck: [],
        specialHand: []
    };

    const game: Game = {
        id: gameId,
        type: type,
        multiMode: options.multiMode || 'round',
        players: new Map([[hostPlayerId, host]]),
        playerOrder: [hostPlayerId],
        currentAskerIndex: 0,
        hostId: hostPlayerId,
        maxPlayers: options.maxPlayers || (type === 'multi' ? 10 : 2),
        activeQuestion: null,
        status: type === 'single' ? 'active' : 'waiting',
        visibility: options.visibility || 'public',
        winner: null,
        answeredQuestions: [],
        targetScore: options.targetScore || (type === 'single' ? 10 : 5),
        pendingJoinRequests: new Map()
    };

    if (type === 'single') {
        game.visibility = 'private';
        // Logic for single player deck generation should be shared/moved here
    }

    games.set(gameId, game);
    return game;
}

export function getGame(gameId: string): Game | undefined {
    return games.get(gameId);
}

export function getGameBySocketId(socketId: string): { game: Game; playerId: string } | null {
    for (const game of games.values()) {
        for (const player of game.players.values()) {
            if (player.id === socketId) {
                return { game, playerId: player.playerId };
            }
        }
    }
    return null;
}

export function joinGame(gameId: string, socketId: string, playerId: string, name: string): { success: boolean; error?: string } {
    const game = games.get(gameId);
    if (!game) return { success: false, error: 'Peliä ei löydy' };
    if (game.status !== 'waiting') return { success: false, error: 'Peli on jo alkanut' };
    if (game.players.size >= game.maxPlayers) return { success: false, error: 'Peli on täynnä' };

    const player: Player = {
        id: socketId,
        playerId: playerId,
        name: name,
        score: 0,
        deck: [],
        specialHand: []
    };

    game.players.set(playerId, player);
    game.playerOrder.push(playerId);

    return { success: true };
}

export function removeGame(gameId: string) {
    games.delete(gameId);
}

export function getWaitingGames(): Game[] {
    return Array.from(games.values()).filter(g => g.status === 'waiting' && g.visibility === 'public');
}
