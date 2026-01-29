import { MultiGame, MultiActiveQuestion, Question, SpecialCardType, ClientQuestion, MultiGameStateUpdate, MultiQuestionAnswer } from './types';
import { getQuestion, getCurrentAskerId, advanceAsker, getMultiGame } from './multiGameManager';

// ==================== CARD VALIDATION ====================

export function canPlayCardMulti(
    game: MultiGame, 
    playerId: string, 
    questionId: string
): { valid: boolean; error?: string } {
    const player = game.players.get(playerId);

    if (!player) {
        return { valid: false, error: 'Player not in game' };
    }

    if (player.deck.length === 0) {
        return { valid: false, error: 'No cards left' };
    }

    // Check if it's this player's turn to ask
    const currentAsker = getCurrentAskerId(game);
    if (currentAsker !== playerId) {
        return { valid: false, error: 'Not your turn to ask' };
    }

    // Check if there's already an active question
    if (game.activeQuestion !== null) {
        return { valid: false, error: 'Question already active' };
    }

    // Check if player has this card
    if (!player.deck.includes(questionId)) {
        return { valid: false, error: 'Card not in your deck' };
    }

    return { valid: true };
}

// ==================== PLAY CARD ====================

export function playCardMulti(
    game: MultiGame, 
    playerId: string, 
    questionId: string,
    targetId?: string // Only used in 'choice' mode
): { success: boolean; question?: Question; error?: string } {
    const validation = canPlayCardMulti(game, playerId, questionId);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    const player = game.players.get(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    // Remove card from deck
    player.deck = player.deck.filter(id => id !== questionId);

    // Determine who answers
    let answerers: string[];
    
    if (game.gameMode === 'round') {
        // Everyone except asker answers
        answerers = game.playerOrder.filter(id => id !== playerId);
    } else {
        // Choice mode - must specify target
        if (!targetId || !game.players.has(targetId)) {
            return { success: false, error: 'Must specify valid target in choice mode' };
        }
        if (targetId === playerId) {
            return { success: false, error: 'Cannot target yourself' };
        }
        answerers = [targetId];
    }

    // Create active question
    game.activeQuestion = {
        from: playerId,
        to: answerers,
        questionId: questionId,
        answers: new Map(answerers.map(id => [id, null])) // Initialize all as unanswered
    };

    const question = getQuestion(questionId);
    return { success: true, question: question };
}

// ==================== ANSWER QUESTION ====================

export function answerQuestionMulti(
    game: MultiGame,
    playerId: string,
    answerIndex: number
): { 
    success: boolean; 
    correct?: boolean;
    error?: string;
    allAnswered?: boolean;
} {
    if (!game.activeQuestion) {
        return { success: false, error: 'No active question' };
    }

    // Check if this player should answer
    if (!game.activeQuestion.to.includes(playerId)) {
        return { success: false, error: 'You are not supposed to answer' };
    }

    // Check if already answered
    if (game.activeQuestion.answers.get(playerId) !== null) {
        return { success: false, error: 'Already answered' };
    }

    const question = getQuestion(game.activeQuestion.questionId);
    if (!question) {
        return { success: false, error: 'Question not found' };
    }

    // Record answer
    game.activeQuestion.answers.set(playerId, answerIndex);

    const correct = answerIndex === question.correctIndex;

    // Check if all have answered
    const allAnswered = Array.from(game.activeQuestion.answers.values()).every(a => a !== null);

    return { success: true, correct, allAnswered };
}

// ==================== RESOLVE ROUND ====================

export function resolveRound(game: MultiGame): {
    results: { playerId: string; playerName: string; correct: boolean; pointsAwarded: boolean; newScore: number }[];
    correctAnswer: string;
    gameOver: boolean;
    winner: string | null;
} {
    if (!game.activeQuestion) {
        return { results: [], correctAnswer: '', gameOver: false, winner: null };
    }

    const question = getQuestion(game.activeQuestion.questionId);
    if (!question) {
        return { results: [], correctAnswer: '', gameOver: false, winner: null };
    }

    const correctAnswer = question.options[question.correctIndex];
    const results: { playerId: string; playerName: string; correct: boolean; pointsAwarded: boolean; newScore: number }[] = [];

    // Process each answer
    for (const [answerId, answer] of game.activeQuestion.answers) {
        const player = game.players.get(answerId);
        if (!player) continue;

        const correct = answer === question.correctIndex;
        let pointsAwarded = false;

        if (correct) {
            player.score += 1;
            pointsAwarded = true;
        }

        // Record in history
        game.answeredQuestions.push({
            questionId: game.activeQuestion.questionId,
            askedBy: game.activeQuestion.from,
            answeredBy: answerId,
            correct
        });

        results.push({
            playerId: answerId,
            playerName: player.name,
            correct,
            pointsAwarded,
            newScore: player.score
        });
    }

    // Clear active question
    game.activeQuestion = null;

    // Advance to next asker
    advanceAsker(game);

    // Check win condition
    let gameOver = false;
    let winner: string | null = null;

    for (const [pid, player] of game.players) {
        if (player.score >= game.targetScore) {
            gameOver = true;
            winner = pid;
            game.status = 'finished';
            game.winner = pid;
            break;
        }
    }

    // Also check if any player has cards left
    if (!gameOver) {
        const currentAsker = getCurrentAskerId(game);
        const askerPlayer = game.players.get(currentAsker);
        
        if (askerPlayer && askerPlayer.deck.length === 0) {
            // Check if anyone has cards
            let anyoneHasCards = false;
            for (const [, p] of game.players) {
                if (p.deck.length > 0) {
                    anyoneHasCards = true;
                    break;
                }
            }

            if (!anyoneHasCards) {
                gameOver = true;
                game.status = 'finished';
                
                // Find winner by highest score
                let highScore = -1;
                for (const [pid, p] of game.players) {
                    if (p.score > highScore) {
                        highScore = p.score;
                        winner = pid;
                    }
                }
                game.winner = winner;
            }
        }
    }

    return { results, correctAnswer, gameOver, winner };
}

// ==================== GAME STATE ====================

export function getMultiPlayerGameState(game: MultiGame, playerId: string): MultiGameStateUpdate | null {
    const player = game.players.get(playerId);
    if (!player) return null;

    const currentAskerId = getCurrentAskerId(game);
    const isMyTurn = currentAskerId === playerId;
    
    // Check if I should be answering
    let isAnswering = false;
    if (game.activeQuestion && game.activeQuestion.to.includes(playerId)) {
        if (game.activeQuestion.answers.get(playerId) === null) {
            isAnswering = true;
        }
    }

    const players = game.playerOrder.map(pid => {
        const p = game.players.get(pid)!;
        return {
            id: pid,
            name: p.name,
            score: p.score,
            isAsker: pid === currentAskerId,
            isHost: pid === game.hostId
        };
    });

    return {
        gameId: game.id,
        gameMode: game.gameMode,
        myPlayerId: playerId,
        myScore: player.score,
        myDeckSize: player.deck.length,
        players,
        currentAskerId,
        isMyTurn,
        isAnswering,
        status: game.status,
        winner: game.winner,
        playerCount: game.players.size,
        maxPlayers: game.maxPlayers
    };
}

// ==================== CLIENT-SAFE QUESTION ====================

export function toClientQuestion(question: Question): ClientQuestion {
    return {
        id: question.id,
        question: question.question,
        options: question.options,
        category: question.category,
        cardType: question.cardType
    };
}

// ==================== DECK FOR UI ====================

export function getMultiPlayerDeck(game: MultiGame, playerId: string): ClientQuestion[] {
    const player = game.players.get(playerId);
    if (!player) return [];

    return player.deck.map(qId => {
        const q = getQuestion(qId);
        if (!q) return { id: qId, question: 'Kysymys', options: [] };
        return toClientQuestion(q);
    });
}
