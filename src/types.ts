export interface Question { id: string; question: string; options: string[]; correctIndex: number; difficulty: number; category?: string; cardType?: 'normal' | 'extra' | 'classic' | 'holo'; _sourceFile?: string; }

export type SpecialCardType = 'SWAP_OPPONENT' | 'SWAP_SELF' | 'JOKER' | 'MIRROR' | 'SKIP';

export interface Player {
    id: string;        // socket.id
    playerId: string;  // persistent player identifier (e.g., "player_abc123" or guest ID)
    name: string;      // display name
    score: number;
    deck: string[];
    specialHand: SpecialCardType[];
}

export interface PlayerProfile {
    // ... (keeps same)
    username: string; 
    ownedCards: string[]; 
    activeCards: string[]; 
    ownedSpecialCards: SpecialCardType[]; 
    activeSpecialCards: SpecialCardType[]; 
    stats: {
        wins: number;
        losses: number;
        draws: number;
        gamesPlayed: number;
    };
    created: number; 
    supabaseUserId?: string; 
    displayName?: string; 
}

export interface ActiveQuestion {
    from: string;      // asker playerId
    to: string[];      // who should answer
    questionId: string;
    answers: Map<string, number | null>; // playerId -> answerIndex
}

export interface QuestionAnswer {
    questionId: string;
    askedBy: string;    // playerId
    answeredBy: string; // playerId
    correct: boolean;
}

export type GameMode = 'single' | 'classic' | 'multi';
export type MultiMode = 'round' | 'choice';

export interface Game {
    id: string;
    type: GameMode;
    multiMode?: MultiMode;
    players: Map<string, Player>;  // playerId -> Player
    playerOrder: string[];
    currentAskerIndex: number;
    hostId: string;
    maxPlayers: number;
    activeQuestion: ActiveQuestion | null;
    status: 'waiting' | 'active' | 'finished';
    visibility: 'public' | 'private';
    winner: string | null;          // playerId of winner
    answeredQuestions: QuestionAnswer[];
    targetScore: number;
    pendingJoinRequests: Map<string, { socketId: string; username: string }>;
    systemDeck?: string[];         // for 'single' mode
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
    mode?: 'multi' | 'single';
    players?: { id: string; name: string; score: number; isHost: boolean }[]; // Added for Lobby UI compatibility
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

// ==================== MULTI-PLAYER MODE ====================

export type MultiGameMode = 'round' | 'choice'; // round = all answer, choice = pick target

export interface MultiPlayer {
    id: string;        // socket.id
    playerId: string;  // persistent player identifier (e.g., "player_abc123")
    name: string;      // display name
    score: number;
    deck: string[];
    specialHand: SpecialCardType[];
}

export interface MultiActiveQuestion {
    from: string;      // asker playerId
    to: string[];      // who should answer (all others in 'round', single in 'choice')
    questionId: string;
    answers: Map<string, number | null>; // playerId -> answerIndex (null = not yet answered)
}

export interface MultiQuestionAnswer {
    questionId: string;
    askedBy: string;    // playerId
    answeredBy: string; // playerId
    correct: boolean;
}

export interface MultiGame {
    id: string;
    gameMode: MultiGameMode;
    players: Map<string, MultiPlayer>;  // playerId -> MultiPlayer
    playerOrder: string[];              // ordered list for turn rotation
    currentAskerIndex: number;          // index in playerOrder for whose turn to ask
    hostId: string;                     // playerId of game creator
    maxPlayers: number;                 // 2-10+
    activeQuestion: MultiActiveQuestion | null;
    status: 'waiting' | 'active' | 'finished';
    visibility: 'public' | 'private';
    winner: string | null;              // playerId of winner
    answeredQuestions: MultiQuestionAnswer[];
    targetScore: number;
    pendingJoinRequests: Map<string, { socketId: string; username: string }>; // Multiple pending requests
}

// Multi-player WebSocket Events
export interface CreateMultiGameRequest {
    mode: MultiGameMode;
    maxPlayers?: number;
    targetScore?: number;
    visibility?: 'public' | 'private';
}

export interface CreateMultiGameResponse {
    gameId: string;
    playerId: string;
}

export interface MultiGameStateUpdate {
    gameId: string;
    gameMode: MultiGameMode;
    myPlayerId: string;
    myScore: number;
    myDeckSize: number;
    players: { id: string; name: string; score: number; isAsker: boolean; isHost: boolean }[];
    currentAskerId: string;
    isMyTurn: boolean;          // true if I'm the asker
    isAnswering: boolean;       // true if I should answer
    status: 'waiting' | 'active' | 'finished';
    winner: string | null;
    playerCount: number;
    maxPlayers: number;
}

export interface MultiQuestionPresentedEvent {
    question: ClientQuestion;
    askerId: string;
    askerName: string;
    targetIds: string[];  // who should answer
}

export interface MultiAnswerResultEvent {
    playerId: string;
    playerName: string;
    correct: boolean;
    pointsAwarded: boolean;
    newScore: number;
}

export interface MultiRoundResultEvent {
    results: MultiAnswerResultEvent[];
    correctAnswer: string;
    nextAskerId: string;
    nextAskerName: string;
}

export interface MultiGameOverEvent {
    rankings: { playerId: string; name: string; score: number; rank: number }[];
    winnerId: string;
    winnerName: string;
}
