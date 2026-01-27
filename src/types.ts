export interface Question { id: string; question: string; options: string[]; correctIndex: number; difficulty: number; category?: string; cardType?: 'normal' | 'extra' | 'classic' | 'holo'; _sourceFile?: string; }

export type SpecialCardType = 'SWAP_OPPONENT' | 'SWAP_SELF' | 'JOKER' | 'MIRROR' | 'SKIP';

export interface Player {
    id: string;
    score: number;
    deck: string[]; // Array of question IDs
    specialHand: SpecialCardType[]; // Array of special cards
}

export interface PlayerProfile {
    username: string; // Acts as ID for now
    ownedCards: string[]; // All unlocked question IDs
    activeCards: string[]; // Currently selected deck
    ownedSpecialCards: SpecialCardType[]; // Unlocked special cards
    activeSpecialCards: SpecialCardType[]; // Selected specialist cards
    stats: {
        wins: number;
        losses: number;
        draws: number;
        gamesPlayed: number;
    };
    created: number; // Timestamp
    supabaseUserId?: string; // For authenticated users
    displayName?: string; // Visible name for other players
}

export interface ActiveQuestion {
    from: string; // Player ID who asked
    to: string; // Player ID who answers
    questionId: string;
}

export interface QuestionAnswer {
    questionId: string;
    askedBy: 'playerA' | 'playerB';
    answeredBy: 'playerA' | 'playerB';
    correct: boolean;
}

export interface Game {
    id: string;
    playerA: Player | null;
    playerB: Player | null;
    currentTurn: 'playerA' | 'playerB';
    activeQuestion: ActiveQuestion | null;
    status: 'waiting' | 'active' | 'finished';
    winner: string | null;
    answeredQuestions: QuestionAnswer[]; // Track Q&A history for winner selection
    pendingJoinRequest?: {
        socketId: string;
        username: string;
    } | null;
    targetScore: number;
}

// Client-safe question (without correct answer)
export interface ClientQuestion {
    id: string;
    question: string;
    options: string[];
    category?: string;
    cardType?: 'normal' | 'extra' | 'classic' | 'holo';
}

// WebSocket Events
export interface CreateGameResponse {
    gameId: string;
    playerId: string;
}

export interface JoinGameRequest {
    gameId: string;
}

export interface JoinGameResponse {
    success: boolean;
    playerId?: string;
    error?: string;
}

export interface PlayCardRequest {
    questionId: string;
}

export interface AnswerQuestionRequest {
    answerIndex: number;
}

export interface GameStateUpdate {
    gameId: string;
    myPlayerId: string;
    myScore: number;
    opponentScore: number;
    myDeckSize: number;
    currentTurn: 'me' | 'opponent';
    status: 'waiting' | 'active' | 'finished';
    winner: string | null;
    roundNumber: number;
    isWaitingForAnswer: boolean;
}

export interface QuestionPresentedEvent {
    question: ClientQuestion;
}

export interface AnswerResultEvent {
    correct: boolean;
    correctAnswer: string;
    pointsAwarded: boolean;
    newScore: number;
}

export interface GameOverEvent {
    winner: 'you' | 'opponent';
    finalScore: { you: number; opponent: number };
    availableQuestions?: ClientQuestion[]; // Questions winner can choose from
}

export interface UseSpecialCardRequest {
    cardType: SpecialCardType;
}

export interface SpecialCardEvent {
    playedBy: string;
    cardType: SpecialCardType;
    details?: string; // e.g. "Pelaaja A käytti Skip-kortin!"
}


export interface GameHistoryEntry {
    gameId: string;
    timestamp: number;
    opponent: string; // Username or "Guest"
    result: 'win' | 'loss' | 'draw';
    score: { you: number; opponent: number };
    playedCards: string[]; // IDs of cards played by this user
}
