import { Game, Question, SpecialCardType } from './types';
import { getQuestion, addQuestionsToPlayer, getAllQuestions } from './gameManager';
import { loadQuestions } from './questionLoader';
// We need access to all questions for Joker/Swap. 
// Assuming loadQuestions is exported or accessible. 
// Actually questions are in gameManager scope usually. We might need to export `getRandomQuestions` there or here.
// Let's assume we can import `getAllQuestions` or similar.



// Validate if player can play a card
export function canPlayCard(game: Game, playerRole: 'playerA' | 'playerB', questionId: string): { valid: boolean; error?: string } {
    const player = game[playerRole];

    // Check if player has any cards left
    if (!player || player.deck.length === 0) {
        return { valid: false, error: 'No cards left' };
    }

    // Check if it's player's turn
    if (game.currentTurn !== playerRole) {
        return { valid: false, error: 'Not your turn' };
    }

    // Check if there's already an active question
    if (game.activeQuestion !== null) {
        return { valid: false, error: 'Question already active' };
    }

    // Check if player has this card in their deck
    if (!player.deck.includes(questionId)) {
        return { valid: false, error: 'Card not in your deck' };
    }

    return { valid: true };
}

// Play a card (present question to opponent)
export function playCard(game: Game, playerRole: 'playerA' | 'playerB', questionId: string): Question | null {
    const validation = canPlayCard(game, playerRole, questionId);
    if (!validation.valid) {
        return null;
    }

    const player = game[playerRole];
    const opponent = playerRole === 'playerA' ? game.playerB : game.playerA;

    if (!player || !opponent) return null;

    // Remove card from player's deck
    player.deck = player.deck.filter(id => id !== questionId);

    // Set active question
    game.activeQuestion = {
        from: player.id,
        to: opponent.id,
        questionId
    };

    return getQuestion(questionId) || null;
}

// Answer a question
export function answerQuestion(
    game: Game,
    playerRole: 'playerA' | 'playerB',
    answerIndex: number
): {
    correct: boolean;
    correctAnswer: string;
    pointsAwarded: boolean;
    newScore: number;
    gameOver: boolean;
    winner: 'playerA' | 'playerB' | null;
} | null {
    // Check if there's an active question
    if (!game.activeQuestion) {
        return null;
    }

    const player = game[playerRole];
    const opponent = playerRole === 'playerA' ? game.playerB : game.playerA;
    const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';

    if (!player || !opponent) return null;

    // Check if this player should be answering
    if (game.activeQuestion.to !== player.id) {
        return null;
    }

    const question = getQuestion(game.activeQuestion.questionId);
    if (!question) return null;

    const correct = answerIndex === question.correctIndex;
    const correctAnswer = question.options[question.correctIndex];

    // Record this question answer in history
    game.answeredQuestions.push({
        questionId: game.activeQuestion.questionId,
        askedBy: opponentRole,
        answeredBy: playerRole,
        correct
    });

    let pointsAwarded = false;
    let gameOver = false;
    let winner: 'playerA' | 'playerB' | null = null;

    if (correct) {
        // Correct answer: award point to answerer
        player.score += 1;
        pointsAwarded = true;

        // Check configurable win condition
        if (player.score >= game.targetScore) {
            gameOver = true;
            winner = playerRole;
            game.status = 'finished';
            game.winner = player.id;
        }
    } else {
        // Wrong answer logic based on card type
        const type = question.cardType || 'normal';

        if (type === 'extra') {
            // Extra: Opponent gets a point
            opponent.score += 1;
            // Check if opponent won
            if (opponent.score >= game.targetScore) {
                gameOver = true;
                winner = opponentRole; // The asker wins
                game.status = 'finished';
                game.winner = opponent.id;
            }
        } else if (type === 'classic') {
            // Classic: Player loses a point
            player.score = Math.max(0, player.score - 1);
        } else if (type === 'holo') {
            // Holo: Game Over immediately, opponent wins
            gameOver = true;
            winner = opponentRole;
            game.status = 'finished';
            game.winner = opponent.id;
        }
    }

    // SWITCH LOGIC: Always switch turn to the answering player so they can ask next
    game.currentTurn = playerRole;

    // Clear active question
    game.activeQuestion = null;

    // Check if the player whose turn it is has cards
    const nextPlayerRole = game.currentTurn;
    const nextPlayer = game[nextPlayerRole];

    // Game End Condition: If the player whose turn it is has no cards, they cannot play.
    // In this alternating system, this is a valid end condition.
    if (nextPlayer && nextPlayer.deck.length === 0 && !gameOver) {
        // Game Over
        gameOver = true;
        game.status = 'finished';

        // Determine winner by score (Highest score wins, no cap)
        if ((game.playerA?.score || 0) > (game.playerB?.score || 0)) {
            winner = 'playerA';
        } else if ((game.playerB?.score || 0) > (game.playerA?.score || 0)) {
            winner = 'playerB';
        } else {
            // Draw
            winner = null;
        }
        game.winner = winner ? (game[winner]?.id || null) : 'DRAW';
    }

    return {
        correct,
        correctAnswer,
        pointsAwarded,
        newScore: player.score,
        gameOver: !!gameOver,
        winner: winner as 'playerA' | 'playerB' | null
    };
}

// Get current game state for a player
export function getPlayerGameState(game: Game, playerRole: 'playerA' | 'playerB') {
    const player = game[playerRole];
    const opponent = playerRole === 'playerA' ? game.playerB : game.playerA;

    if (!player) return null;

    // Get full question objects for the deck (without correct answers)
    const deckWithQuestions = player.deck.map(questionId => {
        const q = getQuestion(questionId);
        return q ? { id: q.id, question: q.question, category: q.category, cardType: q.cardType } : { id: questionId, question: 'Kysymys' };
    });

    // console.log(`GameState for ${playerRole}: Deck size ${deckWithQuestions.length}`);

    return {

        gameId: game.id,
        myPlayerId: playerRole,
        myScore: player.score,
        opponentScore: opponent?.score || 0,
        myDeckSize: player.deck.length,

        myDeck: deckWithQuestions, // Now includes question text
        mySpecialHand: player.specialHand,
        currentTurn: game.currentTurn === playerRole ? 'me' : 'opponent',
        status: game.status,
        winner: game.winner,
        roundNumber: game.answeredQuestions.length + 1,
        isWaitingForAnswer: (game.activeQuestion && game.activeQuestion.from === player.id) ? true : false
    };
}

// Get questions available for winner to select
export function getAvailableQuestionsForWinner(game: Game, winnerRole: 'playerA' | 'playerB'): string[] {
    const winner = game[winnerRole];
    if (!winner) return [];

    // Get all questions the winner answered correctly
    const correctlyAnswered = game.answeredQuestions
        .filter(qa => qa.answeredBy === winnerRole && qa.correct)
        .map(qa => qa.questionId);

    // Filter out questions already in winner's deck
    const available = correctlyAnswered.filter(qId => !winner.deck.includes(qId));

    // Remove duplicates
    return [...new Set(available)];
}

// Add selected questions to winner's deck
export function addSelectedQuestions(game: Game, winnerRole: 'playerA' | 'playerB', questionIds: string[]): boolean {
    const winner = game[winnerRole];
    if (!winner) return false;

    // Validate: max 3 questions
    if (questionIds.length > 3) return false;

    // Validate: all questions must be available
    const available = getAvailableQuestionsForWinner(game, winnerRole);
    const allValid = questionIds.every(qId => available.includes(qId));
    if (!allValid) return false;

    // Add questions to deck
    winner.deck.push(...questionIds);
    return true;
}

// Special Card Logic
export function useSpecialCard(game: Game, playerRole: 'playerA' | 'playerB', cardType: SpecialCardType): { success: boolean; message?: string; newQuestion?: Question | null } {
    const player = game[playerRole];
    const opponentRole = playerRole === 'playerA' ? 'playerB' : 'playerA';
    const opponent = game[opponentRole];

    if (!player || !player.specialHand.includes(cardType)) {
        return { success: false, message: 'Card not in hand' };
    }

    // Logic per type
    switch (cardType) {
        case 'SKIP':
            // Logic: Skip answering CURRENT active question.
            if (!game.activeQuestion || game.activeQuestion.to !== player.id) {
                return { success: false, message: 'Can only use SKIP when answering a question' };
            }
            // Clear active question
            game.activeQuestion = null;
            // Switch turn to the SKIPPER (so they can ask next)
            game.currentTurn = playerRole;
            break;

        case 'JOKER':
            // Logic: Play a random question from global pool active immediately
            // Requirement: Must be your turn to ASK
            if (game.currentTurn !== playerRole || game.activeQuestion) {
                return { success: false, message: 'Can only use JOKER when it is your turn to ask' };
            }
            if (!opponent) return { success: false, message: 'No opponent' };

            // Get random from all questions
            const allQ = getAllQuestions();
            const randomQ = allQ[Math.floor(Math.random() * allQ.length)];

            game.activeQuestion = {
                from: player.id,
                to: opponent.id,
                questionId: randomQ.id
            };
            break;

        case 'SWAP_SELF':
            // Logic: Swap a card in hand with random global one
            // Requirement: Your turn to ASK, must have deck cards
            if (game.currentTurn !== playerRole || player.deck.length === 0) {
                return { success: false, message: 'Can only use SWAP_SELF when asking and have cards' };
            }
            // Add random card
            const allQ2 = getAllQuestions();
            const newQ = allQ2[Math.floor(Math.random() * allQ2.length)];

            // Remove one random card from own deck? Or chosen? Let's say random for now to keep UI simple or just add 1 and remove 0?
            // "Vaihda oman pakan kortti" -> Trade 1 for 1.
            // Remove first card (simplification)
            player.deck.shift();
            player.deck.push(newQ.id);
            break;

        // Implement others as needed... MIRROR etc.
        case 'MIRROR': // "Laina"
            // Play next card from OPPONENT's deck against them
            if (game.currentTurn !== playerRole || game.activeQuestion) {
                return { success: false, message: 'Can only use MIRROR when asking' };
            }
            if (!opponent || opponent.deck.length === 0) {
                return { success: false, message: 'Opponent has no cards to mirror' };
            }

            // Steal card
            const stolenId = opponent.deck[0];
            opponent.deck.shift(); // Remove from opponent

            game.activeQuestion = {
                from: player.id, // I am asking
                to: opponent.id, // They are answering
                questionId: stolenId
            };
            break;

        case 'SWAP_OPPONENT':
            // Logic: Swap a random card from my deck with a random card from opponent's deck
            if (game.currentTurn !== playerRole) {
                return { success: false, message: 'Can only use SWAP_OPPONENT when it is your turn' };
            }
            if (player.deck.length === 0) {
                return { success: false, message: 'You have no cards to swap' };
            }
            if (!opponent || opponent.deck.length === 0) {
                return { success: false, message: 'Opponent has no cards to swap' };
            }

            // Pick random indices
            const myIdx = Math.floor(Math.random() * player.deck.length);
            const oppIdx = Math.floor(Math.random() * opponent.deck.length);

            // Swap
            const myCard = player.deck[myIdx];
            const oppCard = opponent.deck[oppIdx];

            player.deck[myIdx] = oppCard;
            opponent.deck[oppIdx] = myCard;

            return { success: true, message: 'Swapped a card with opponent!' };

        default:
            return { success: false, message: 'Not implemented' };
    }

    // Remove special card from hand
    const idx = player.specialHand.indexOf(cardType);
    if (idx > -1) player.specialHand.splice(idx, 1);

    return { success: true };
}
