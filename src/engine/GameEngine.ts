import { Game, Player, Question, SpecialCardType, QuestionAnswer, ActiveQuestion, ClientQuestion } from '../types';

/**
 * Unified Game Engine - Replaces gameLogic.ts and multiGameLogic.ts
 */

export function canPlayCard(game: Game, playerId: string, questionId: string): { valid: boolean; error?: string } {
    const player = game.players.get(playerId);
    if (!player) return { valid: false, error: 'Pelaajaa ei löydy pelistä' };

    if (game.status !== 'active') return { valid: false, error: 'Peli ei ole käynnissä' };
    if (game.activeQuestion) return { valid: false, error: 'Kysymys on jo aktiivinen' };

    // Check if it's this player's turn to ask
    const askerId = game.playerOrder[game.currentAskerIndex];
    if (askerId !== playerId) return { valid: false, error: 'Ei ole sinun vuorosi kysyä' };

    // Check if player has the card
    if (!player.deck.includes(questionId)) return { valid: false, error: 'Korttia ei löydy pakastasi' };

    return { valid: true };
}

export function playCard(game: Game, playerId: string, questionId: string, targetIds?: string[]): { success: boolean; question?: Question; error?: string } {
    const validation = canPlayCard(game, playerId, questionId);
    if (!validation.valid) return { success: false, error: validation.error };

    const player = game.players.get(playerId)!;
    // Remove card from deck
    player.deck = player.deck.filter(id => id !== questionId);

    // Determine target(s)
    let targets: string[] = [];
    if (game.type === 'single') {
        targets = [playerId]; // Self is target in single player? Or system? 
    } else if (game.type === 'classic') {
        const opponentId = game.playerOrder.find(id => id !== playerId);
        targets = opponentId ? [opponentId] : [];
    } else if (game.type === 'multi') {
        if (game.multiMode === 'round') {
            targets = game.playerOrder.filter(id => id !== playerId);
        } else {
            targets = targetIds || [];
        }
    }

    game.activeQuestion = {
        from: playerId,
        to: targets,
        questionId: questionId,
        answers: new Map(targets.map(id => [id, null]))
    };

    return { success: true };
}

export function answerQuestion(game: Game, playerId: string, answerIndex: number, allQuestions: Question[]): { 
    success: boolean; 
    correct?: boolean; 
    gameOver?: boolean;
    winner?: string | null;
    error?: string;
} {
    if (!game.activeQuestion) return { success: false, error: 'Ei aktiivista kysymystä' };
    if (!game.activeQuestion.to.includes(playerId)) return { success: false, error: 'Et ole tämän kysymyksen kohde' };
    if (game.activeQuestion.answers.get(playerId) !== null) return { success: false, error: 'Olet jo vastannut' };

    const question = allQuestions.find(q => q.id === game.activeQuestion!.questionId);
    if (!question) return { success: false, error: 'Kysymystä ei löydy' };

    const isCorrect = answerIndex === question.correctIndex;
    game.activeQuestion.answers.set(playerId, answerIndex);

    // Record history
    game.answeredQuestions.push({
        questionId: question.id,
        askedBy: game.activeQuestion.from,
        answeredBy: playerId,
        correct: isCorrect
    });

    if (isCorrect) {
        const player = game.players.get(playerId)!;
        player.score++;
    }

    // Check if round is over
    const allAnswered = Array.from(game.activeQuestion.answers.values()).every(a => a !== null);
    
    if (allAnswered) {
        game.activeQuestion = null;
        game.currentAskerIndex = (game.currentAskerIndex + 1) % game.playerOrder.length;

        // Check win conditions (skip for single player - handled separately)
        if (game.type !== 'single') {
            for (const p of game.players.values()) {
                if (p.score >= game.targetScore) {
                    game.status = 'finished';
                    game.winner = p.playerId;
                    return { success: true, correct: isCorrect, gameOver: true, winner: p.playerId };
                }
            }
        }
    }

    return { success: true, correct: isCorrect, gameOver: false };
}

export function getGameState(game: Game, playerId: string, allQuestions: Question[]): any {
    const player = game.players.get(playerId);
    if (!player) return null;

    const playersList = game.playerOrder.map(pid => {
        const p = game.players.get(pid)!;
        return {
            id: p.playerId,
            name: p.name,
            score: p.score,
            isAsker: game.playerOrder[game.currentAskerIndex] === p.playerId,
            isHost: game.hostId === p.playerId
        };
    });

    // Enrich deck with full card details
    const enrichedDeck = player.deck.map(id => {
        const q = allQuestions.find(x => x.id === id);
        return q ? {
            id: q.id,
            question: q.question,
            category: q.category,
            difficulty: q.difficulty,
            cardType: q.cardType
        } : { id, question: 'Tuntematon kortti', category: 'General', difficulty: 1 };
    });

    return {
        gameId: game.id,
        type: game.type,
        mode: game.type, // Legacy support
        multiMode: game.multiMode,
        myPlayerId: playerId,
        myScore: player.score,
        myDeckSize: player.deck.length,
        players: playersList,
        currentAskerId: game.playerOrder[game.currentAskerIndex],
        isMyTurn: game.playerOrder[game.currentAskerIndex] === playerId,
        isAnswering: game.activeQuestion?.to.includes(playerId) || false,
        status: game.status,
        winner: game.winner,
        playerCount: game.players.size,
        maxPlayers: game.maxPlayers,
        targetScore: game.targetScore,
        myDeck: enrichedDeck,
        mySpecialHand: player.specialHand,
        activeQuestion: game.activeQuestion ? {
            from: game.activeQuestion.from,
            to: game.activeQuestion.to,
        } : null,
        // Single player progress tracking
        roundNumber: game.answeredQuestions.length + 1,
        totalRounds: game.type === 'single' ? 10 : game.targetScore
    };
}
export function toClientQuestion(q: Question): ClientQuestion {
    return {
        id: q.id,
        question: q.question,
        options: q.options,
        category: q.category,
        cardType: q.cardType
    };
}

export function getAvailableQuestionsForWinner(game: Game, winnerId: string, allQuestions: Question[]): string[] {
    // Basic logic: return 3 random questions from the pool that the winner doesn't have yet
    const player = game.players.get(winnerId);
    if (!player) return [];

    // This needs access to the player's profile to know what they own, 
    // but for the engine, we just return a set of questions from the game history or just random new ones.
    // In the old logic, it was in gameLogic.ts and used game.answeredQuestions.
    
    return game.answeredQuestions
        .filter(aq => aq.correct && aq.answeredBy === winnerId)
        .map(aq => aq.questionId);
}
