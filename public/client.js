// Persistent ID logic - Guest mode uses "Guest_xxxxxxx" format
function getGuestId() {
    let id = localStorage.getItem('kysymysmestari_player_id');
    if (!id) {
        // Generate Guest_xxxxxxx format ID
        const randomPart = Math.random().toString(36).substring(2, 9);
        id = 'Guest_' + randomPart;
        localStorage.setItem('kysymysmestari_player_id', id);
    }
    return id;
}

// Get the appropriate user ID (Supabase user or Guest)
function getCurrentUserId() {
    // Check if authenticated via Supabase
    if (window.auth && window.auth.isAuthenticated && window.auth.currentUser) {
        return window.auth.currentUser.id;
    }
    // Fall back to guest ID
    return getGuestId();
}

// Initial ID - might change after auth loads
let myPersistentId = getGuestId();

// Socket.IO connection - will reconnect after auth loads
let socket = io({
    auth: {
        token: myPersistentId
    }
});

// Reconnect socket with proper auth after Supabase auth loads
window.addEventListener('authStateChange', (e) => {
    const { user } = e.detail;
    const newId = user ? user.id : getGuestId();
    
    if (newId !== myPersistentId) {
        console.log('🔄 Auth changed, reconnecting socket with ID:', newId);
        myPersistentId = newId;
        
        // Disconnect and reconnect with new auth
        socket.disconnect();
        socket = io({
            auth: {
                token: myPersistentId
            }
        });
        
        // Re-attach event listeners
        setupSocketListeners();
        console.log('🆔 Updated Persistent ID:', myPersistentId);
    }
});

console.log('🆔 Initial Persistent ID:', myPersistentId);

// Game state
let gameState = {
    gameId: null,
    myPlayerId: null,
    myScore: 0,
    opponentScore: 0,
    myDeckSize: 0,
    myDeck: [],
    mySpecialHand: [],
    currentTurn: null,
    status: null
};

// DOM elements
const statusText = document.getElementById('status-text');
const connectionStatus = document.getElementById('connection-status');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const profileScreen = document.getElementById('profile-screen');
const deckManageScreen = document.getElementById('deck-manage-screen');
const navButtons = document.querySelectorAll('.nav-btn');


const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const roomCodeInput = document.getElementById('room-code-input');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCode = document.getElementById('room-code');

const myScoreEl = document.getElementById('my-score');
const opponentScoreEl = document.getElementById('opponent-score');
const turnIndicator = document.getElementById('turn-indicator');
const questionArea = document.getElementById('question-area');
const questionText = document.getElementById('question-text');
const answerOptions = document.getElementById('answer-options');
const deckArea = document.getElementById('deck-area');
const deckCount = document.getElementById('deck-count');
const deckCards = document.getElementById('deck-cards');
const waitingMessage = document.getElementById('waiting-message');
const answerResult = document.getElementById('answer-result');
const resultMessage = document.getElementById('result-message');
const continueBtn = document.getElementById('continue-btn');

const gameOverTitle = document.getElementById('game-over-title');
const finalMyScore = document.getElementById('final-my-score');
const finalOpponentScore = document.getElementById('final-opponent-score');
const newGameBtn = document.getElementById('new-game-btn');

// Question selection elements
const questionSelection = document.getElementById('question-selection');
const selectionCount = document.getElementById('selection-count');
const availableQuestions = document.getElementById('available-questions');
const confirmSelectionBtn = document.getElementById('confirm-selection-btn');
const loserMessage = document.getElementById('loser-message');
const selectionConfirmed = document.getElementById('selection-confirmed');
const selectionResult = document.getElementById('selection-result');

const serverList = document.getElementById('lobby-server-list');
const openServerListBtn = document.getElementById('open-server-modal-btn');
const lobbyMainGrid = document.getElementById('lobby-main-grid');
const lobbyServerSection = document.getElementById('lobby-server-list-section');
const refreshLobbyListBtn = document.getElementById('refresh-lobby-list-btn');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const approvalModal = document.getElementById('approval-modal');
const approvalMessage = document.getElementById('approval-message');
const approvalAcceptBtn = document.getElementById('approval-accept-btn');
const approvalRejectBtn = document.getElementById('approval-reject-btn');
const joinWaitingModal = document.getElementById('join-waiting-modal');

const debugLog = document.getElementById('debug-log');

function addDebugLog(msg) {
    console.log('[DEBUG UI]', msg);
    if (!debugLog) return;
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    debugLog.prepend(entry);
}

// Track selected questions
let selectedQuestionIds = [];

// Socket events - wrapped in function for reconnection support
function setupSocketListeners() {
    socket.off(); // Remove old listeners
    
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        statusText.textContent = 'Yhdistetty';
        connectionStatus.classList.add('connected');
    });

    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        statusText.textContent = 'Yhteys katkesi';
        connectionStatus.classList.remove('connected');
    });

    socket.on('game_created', (data) => {
        console.log('🎮 Game created:', data);
        gameState.gameId = data.gameId;
        gameState.myPlayerId = data.playerId;
        roomCode.textContent = data.gameId;
        roomCodeDisplay.classList.remove('hidden');
        createGameBtn.disabled = true;
    });

    socket.on('game_joined', (data) => {
        console.log('🚪 Game joined:', data);
        if (joinWaitingModal) joinWaitingModal.classList.add('hidden'); // Hide waiting modal
        if (data.success) {
            gameState.myPlayerId = data.playerId;
        } else {
            alert('Virhe: ' + data.error);
        }
    });

    socket.on('join_request', (data) => {
        addDebugLog(`Liittymispyyntö: ${data.requesterName}`);
        if (approvalMessage) approvalMessage.textContent = `${data.requesterName} haluaa liittyä peliin.`;
        if (approvalModal) approvalModal.classList.remove('hidden');
    });

    socket.on('join_status', (data) => {
        console.log('Join status:', data);
        if (data.status === 'waiting_for_approval') {
            if (joinWaitingModal) joinWaitingModal.classList.remove('hidden');
        } else if (data.status === 'rejected') {
            if (joinWaitingModal) joinWaitingModal.classList.add('hidden');
            // alert('Pelin pitäjä hylkäsi pyynnön.');
            // Alert is handled by 'error' event usually, but let's be safe
        }
    });

    socket.on('game_state', (data) => {
        console.log('📊 Game state received:', data);
        gameState = { ...gameState, ...data };
        updateGameUI();
    });

    socket.on('question_presented', (data) => {
        console.log('❓ Question presented:', data);
        showQuestion(data.question);
    });

    socket.on('answer_result', (data) => {
        console.log('✅ Answer result:', data);
        showAnswerResult(data);
    });

    socket.on('opponent_answered', (data) => {
        console.log('👤 Opponent answered:', data);
        showOpponentAnswer(data);
    });

    socket.on('game_over', (data) => {
        console.log('🏁 Game over:', data);
        showGameOver(data);
    });

    socket.on('player_disconnected', () => {
        console.log('⚠️ Player disconnected');
        alert('Vastustaja katkaisi yhteyden. Peli päättyi.');
        resetGame();
    });

    socket.on('error', (data) => {
        console.error('❌ Error from server:', data);
        alert('Virhe: ' + data.message);
    });

    socket.on('profile_data', (data) => {
        console.log('👤 Profile data:', data);
        renderProfile(data);
        renderDeckManager(data);
    });

    socket.on('history_data', (data) => {
        console.log('📜 History data:', data);
        renderHistory(data);
    });

    socket.on('deck_updated', (data) => {
        console.log('💾 Deck updated:', data);
        if (data.success) {
            showNotification('Pakka tallennettu!', 'success');
        }
    });

    socket.on('waiting_games_list', (games) => {
        addDebugLog(`Vastaanotettiin ${games.length} peliä listaan.`);
        renderServerList(games);
    });
}

// Initial socket setup
setupSocketListeners();


// Button handlers
// Button handlers
const surrenderBtn = document.getElementById('surrender-btn'); // New button

if (approvalAcceptBtn) {
    approvalAcceptBtn.addEventListener('click', () => {
        socket.emit('resolve_join_request', { decision: 'accept' });
        approvalModal.classList.add('hidden');
    });
}

if (approvalRejectBtn) {
    approvalRejectBtn.addEventListener('click', () => {
        socket.emit('resolve_join_request', { decision: 'reject' });
        approvalModal.classList.add('hidden');
    });
}

createGameBtn.addEventListener('click', () => {
    console.log('Creating game...');
    socket.emit('create_game', { targetScore: 5 });
});

joinGameBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length === 6) {
        console.log('Joining game:', code);
        socket.emit('join_game', { gameId: code });
    } else {
        alert('Syötä 6-merkkinen huonekoodi');
    }
});

continueBtn.addEventListener('click', () => {
    console.log('Continue clicked');
    answerResult.classList.add('hidden');
    updateGameUI();
});

newGameBtn.addEventListener('click', () => {
    console.log('New game clicked');
    resetGame();
});

if (surrenderBtn) {
    surrenderBtn.addEventListener('click', () => {
        if (confirm('Haluatko varmasti luovuttaa ja poistua pelistä?')) {
             resetGame(); // Allow local reset
        }
    });
}

if (openServerListBtn) {
    openServerListBtn.addEventListener('click', () => {
        lobbyMainGrid.classList.add('hidden');
        lobbyServerSection.classList.remove('hidden');
        socket.emit('get_waiting_games');
        addDebugLog('Switching to full-area server search...');
    });
}

if (backToLobbyBtn) {
    backToLobbyBtn.addEventListener('click', () => {
        lobbyMainGrid.classList.remove('hidden');
        lobbyServerSection.classList.add('hidden');
    });
}

if (refreshLobbyListBtn) {
    refreshLobbyListBtn.addEventListener('click', () => {
        showNotification('Päivitetään peli-listaa...', 'info');
        socket.emit('get_waiting_games');
    });
}

// Helper to toggle compact mode
function toggleGameMode(active) {
    if (active) {
        document.body.classList.add('game-active');
    } else {
        document.body.classList.remove('game-active');
    }
}

// Navigation Handling
navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active button
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Show target screen
        const targetId = btn.dataset.target;
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(targetId).classList.remove('hidden');

        // Fetch data if needed
        if (targetId === 'profile-screen') {
            socket.emit('get_profile');
            socket.emit('get_history');
        } else if (targetId === 'deck-manage-screen') {
            socket.emit('get_profile'); // To get latest deck info
        }
    });
});

const saveDeckBtn = document.getElementById('save-deck-btn');
if (saveDeckBtn) {
    saveDeckBtn.addEventListener('click', () => {
        saveDeck();
    });
}


// Profile & Deck Handlers
function renderServerList(games) {
    addDebugLog(`Renderöidään lista: ${games.length} peliä. Oma peli: ${gameState.gameId || 'None'}`);
    if (!serverList) {
        addDebugLog('VIRHE: serverList elementtiä ei löydy!');
        return;
    }
    serverList.innerHTML = '';

    if (games.length === 0) {
        serverList.innerHTML = '<p class="empty-list">Ei avoimia pelejä juuri nyt...</p>';
        return;
    }

    let renderedCount = 0;
    games.forEach(game => {
        // Don't show our own game if we are the host
        if (gameState.gameId === game.id) {
             addDebugLog(`Suodatettiin oma peli: ${game.id}`);
             return;
        }

        renderedCount++;
        const div = document.createElement('div');
        // Use the common mini-row style as requested (Slim Card style)
        div.className = 'mini-row server-item-slim'; 
        div.innerHTML = `
            <div class="mini-icon">🌐</div>
            <div class="mini-content">
                <div class="mini-cat">HUONE: ${game.id}</div>
                <div class="mini-q">${game.hostName} etsii vastustajaa</div>
            </div>
            <div class="mini-meta">Win Rate: ${game.winRate}%</div>
        `;

        div.addEventListener('click', () => {
            addDebugLog(`Klikattiin liittymistä peliin: ${game.id}`);
            socket.emit('join_game', { gameId: game.id });
        });

        serverList.appendChild(div);
    });
    
    addDebugLog(`Listaan piirrettiin ${renderedCount} peliä.`);
}


// UI update functions
function updateGameUI() {
    console.log('🔄 Updating UI with state:', gameState);
    toggleGameMode(true); // Enable compact mode
    // Hide lobby, show game
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');

    // Show player role
    const roleDisplay = document.getElementById('player-role-display');
    if (roleDisplay) {
        roleDisplay.textContent = gameState.myPlayerId === 'playerA' ? 'Olet pelaaja A (Aloittaja)' : 'Olet pelaaja B (Liittyjä)';
    }

    // Update scores
    myScoreEl.textContent = gameState.myScore;
    opponentScoreEl.textContent = gameState.opponentScore;

    // Update round counter
    const roundCounter = document.getElementById('round-counter');
    if (roundCounter && gameState.roundNumber) {
        roundCounter.textContent = `Kierros: ${gameState.roundNumber}`;
    }

    // Don't update turn/deck display if a question is currently being shown
    if (!questionArea.classList.contains('hidden')) {
        console.log('⚠️ Question is visible, skipping turn/deck update');
        return;
    }

    if (gameState.isWaitingForAnswer) {
        showWaiting(true);
        return;
    }

    // Update turn indicator
    if (gameState.currentTurn === 'me') {
        turnIndicator.textContent = 'Sinun vuorosi';
        turnIndicator.className = 'turn-indicator my-turn';
        showDeck();
    } else {
        turnIndicator.textContent = 'Vastustajan vuoro';
        turnIndicator.className = 'turn-indicator opponent-turn';
        showWaiting(false);
    }
    renderSpecialHand();
}


// (Old renderSpecialHand removed)


function showDeck() {
    console.log('🃏 Showing deck, cards:', gameState.myDeck.length);
    if (questionArea) questionArea.classList.add('hidden');
    if (waitingMessage) waitingMessage.classList.add('hidden');
    if (answerResult) answerResult.classList.add('hidden');
    if (deckArea) {
        deckArea.classList.remove('hidden');
        deckArea.classList.remove('disabled');
        deckArea.classList.remove('options-active');
    }

    if (deckCount) deckCount.textContent = gameState.myDeckSize;
    const uiDeck = deckCards || document.getElementById('deck-cards');
    if (!uiDeck) {
        console.error('❌ Critical: Deck cards container (#deck-cards) not found!');
        return;
    }

    // Default table state for asker: show face down card if not hovering
    if (gameState.currentTurn === 'me') {
        renderDefaultTableState();
    }

    uiDeck.innerHTML = '';

    // Helper for icons (duplicate for now to avoid scope issues)
    const categoryIcons = {
        'maantieto': '🌍', 'kulttuuri': '🎨', 'tiede': '⚛️', 'avaruus': '🪐',
        'historia': '📜', 'urheilu': '🏆', 'viihde': '🎬', 'yleistieto': '💡'
    };

    gameState.myDeck.forEach((card) => {
        const div = document.createElement('div');
        const cat = (card.category || 'yleistieto').toLowerCase();
        const icon = categoryIcons[cat] || '❓';

        // Use Slim Row style for in-game choice too!
        div.className = `mini-row category-${cat}`;
        
        div.innerHTML = `
            <div class="mini-icon">${icon}</div>
            <div class="mini-content">
                <div class="mini-cat">${card.category || 'Yleistieto'}</div>
                <div class="mini-q">${card.question}</div>
            </div>
            <div class="mini-meta">Lvl ${card.difficulty || 1}</div>
        `;

        div.addEventListener('click', () => {
            console.log('🎯 Playing card:', card.id);
            socket.emit('play_card', { questionId: card.id });
        });

        // Hover Preview Logic
        div.addEventListener('mouseenter', () => {
             if (gameState.currentTurn === 'me') {
                 showPreviewCard(card);
             }
        });
        div.addEventListener('mouseleave', () => {
             if (gameState.currentTurn === 'me') {
                 clearPreviewCard();
             }
        });

        uiDeck.appendChild(div);
    });


}

function showWaiting(isBig = false) {
    console.log('⏳ Showing waiting message, big:', isBig);
    if (questionArea) questionArea.classList.add('hidden');
    if (deckArea) {
        deckArea.classList.remove('hidden');
        deckArea.classList.add('disabled');
        deckArea.classList.remove('options-active');
    }
    if (answerResult) answerResult.classList.add('hidden');
    
    if (waitingMessage) {
        waitingMessage.classList.remove('hidden');
        waitingMessage.innerHTML = ''; // Clear previous content

        const div = document.createElement('div');
        div.className = 'mini-row face-down';
        
        let text = 'Odotetaan vastustajaa...';
        let icon = '⏳';
        
        if (isBig) {
            // Asker waiting for answer (Thinking...)
            text = 'VASTUSTAJA MIETTII...';
            icon = '🤔';
            
            div.className = 'mini-row face-down';
            div.innerHTML = `
                <div class="mini-icon">${icon}</div>
                <div class="mini-content">
                    <div class="mini-cat">ODOTETAAN</div>
                    <div class="mini-q" style="color:#b2bec3;">${text}</div>
                </div>
            `;
        } else {
            // Answerer waiting for Question (Full Card Face Down)
            div.className = 'card-wrapper face-down-full';
            div.innerHTML = `<div class="face-down-icon">❓</div>`;
        }
        
        waitingMessage.appendChild(div);
    }
}

function showQuestion(question) {
    console.log('💡 Showing question to user:', question.question);
    
    // Everyone sees deck disabled by default during a question phase
    if (deckArea) {
         deckArea.classList.remove('hidden');
         deckArea.classList.add('disabled');
    }
    
    waitingMessage.classList.add('hidden');
    answerResult.classList.add('hidden');
    questionArea.classList.remove('hidden');

    // Clear area and ensure it's visible
    questionArea.innerHTML = '';
    questionArea.classList.remove('hidden');
    questionArea.className = 'question-area'; // Reset classes
    
    // Determine category and icon
    const cat = (question.category || 'yleistieto').toLowerCase();
    const categoryIcons = {
        'maantieto': '🌍', 'kulttuuri': '🎨', 'tiede': '⚛️', 'avaruus': '🪐', 
        'historia': '📜', 'urheilu': '🏆', 'viihde': '🎬', 'yleistieto': '💡',
        'aliens': '👽', 'biologia': '🧬', 'taide': '🎭'
    };
    const icon = categoryIcons[cat] || '❓';
    const displayId = question.id ? question.id.substring(0,4) : '???';
    const lvl = question.difficulty || 1;

    // 1. Create Ethereal Card element
    const cardEl = document.createElement('div');
    cardEl.className = `card-wrapper tcg-ethereal category-${cat}`;
    cardEl.style.transform = 'scale(1.0)'; 
    cardEl.style.width = '260px';
    cardEl.style.height = '364px';
    cardEl.style.margin = '0 0 20px 0'; // Removed top margin
    cardEl.style.cursor = 'default';
    
    cardEl.innerHTML = `
        <div class="ethereal-inner">
            <div class="ethereal-category">${question.category || 'Kysymys'}</div>
            <div class="ethereal-circle">${icon}</div>
            <div class="ethereal-question" style="font-size:1.1rem;">${question.question}</div>
            <div class="ethereal-footer">
                <span>ID: ${displayId}</span>
                <span>Lvl ${lvl}</span>
            </div>
        </div>
    `;

    // 2. Determine where to show options based on role
    const isAnswerer = (gameState.currentTurn !== 'me');
    let targetContainer;

    if (isAnswerer) {
        // Answerer: Answers REPLACE the deck (hand cards) at the bottom
        targetContainer = document.getElementById('deck-cards');
        if (targetContainer) {
            targetContainer.innerHTML = ''; // Clear hand
            if (deckArea) {
                deckArea.classList.remove('hidden');
                deckArea.classList.remove('disabled'); // Active for answering
                deckArea.classList.add('options-active');
            }
        }
    } else {
        // Asker: Options stay on the table but are disabled
        targetContainer = document.createElement('div');
        targetContainer.className = 'answer-options';
        questionArea.appendChild(targetContainer);
    }

    if (targetContainer) {
        // Shuffle and create buttons
        const optionsWithIndices = question.options.map((opt, i) => ({ text: opt, index: i }));
        for (let i = optionsWithIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithIndices[i], optionsWithIndices[j]] = [optionsWithIndices[j], optionsWithIndices[i]];
        }

        optionsWithIndices.forEach((optionObj) => {
            const btn = document.createElement('div');
            btn.className = `mini-row option-mode category-${cat}`;
            const letter = String.fromCharCode(65 + optionObj.index);
            
            btn.innerHTML = `
                <div class="mini-icon" style="font-weight:bold; font-size:1.2rem;">${letter}</div>
                <div class="mini-content">
                    <div class="mini-q">${optionObj.text}</div>
                </div>
            `;

            if (!isAnswerer) {
                btn.classList.add('disabled');
            } else {
                btn.addEventListener('click', () => {
                     if (btn.classList.contains('disabled')) return;
                     socket.emit('answer_question', { answerIndex: optionObj.index });
                     Array.from(targetContainer.children).forEach(b => b.classList.add('disabled'));
                     btn.style.background = 'var(--neon-blue)';
                     btn.querySelector('.mini-q').style.color = 'black';
                     btn.querySelector('.mini-icon').textContent = '⏳';
                });
            }
            targetContainer.appendChild(btn);
        });
    }

    // 3. Render Card on table
    questionArea.appendChild(cardEl);
    
    // Note: If asker, targetContainer (options) was already appended to questionArea.
    // Ensure card is above options if both are in questionArea
    if (!isAnswerer) {
        questionArea.insertBefore(cardEl, targetContainer);
    }

    // Update special card buttons (enable skip if available)
    renderSpecialHand();
}

function showAnswerResult(data) {
    console.log('📋 Showing answer result');
    questionArea.classList.add('hidden');
    answerResult.classList.remove('hidden');

    if (data.correct) {
        resultMessage.className = 'correct';
        resultMessage.innerHTML = `
      <h3>✅ Oikein!</h3>
      <p>Sait pisteen! Uusi pisteesi: ${data.newScore}</p>
    `;
    } else {
        resultMessage.className = 'incorrect';
        resultMessage.innerHTML = `
      <h3>❌ Väärin!</h3>
      <p>Oikea vastaus: ${data.correctAnswer}</p>
    `;
    }
}

// --- TOAST NOTIFICATIONS ---
function showNotification(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span>${message}</span>`;
    
    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('closing');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

function showOpponentAnswer(data) {
    // Show notification instead of alert
    if (data.correct) {
        showNotification('Vastustaja vastasi oikein!', 'success');
    } else {
        showNotification('Vastustaja vastasi väärin!', 'error');
    }
    console.log('👥 Opponent result:', data);
}

function showGameOver(data) {
    console.log('🏆 Showing game over screen', data);
    gameScreen.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');

    finalMyScore.textContent = data.finalScore.you;
    finalOpponentScore.textContent = data.finalScore.opponent;

    // Reset selection state
    selectedQuestionIds = [];
    questionSelection.classList.add('hidden');
    loserMessage.classList.add('hidden');
    selectionConfirmed.classList.add('hidden');

    if (data.winner === 'you') {
        gameOverTitle.textContent = '🎉 Voitit!';

        // Show question selection if there are available questions
        if (data.availableQuestions && data.availableQuestions.length > 0) {
            questionSelection.classList.remove('hidden');
            renderAvailableQuestions(data.availableQuestions);
        } else {
            // No questions to select (answered none correctly or already owns all)
            selectionConfirmed.classList.remove('hidden');
            selectionResult.textContent = 'Ei valittavia kysymyksiä saatavilla.';
        }
    } else {
        gameOverTitle.textContent = '😔 Hävisit';
        loserMessage.classList.remove('hidden');
    }
}

function renderAvailableQuestions(questions) {
    availableQuestions.innerHTML = '';
    selectionCount.textContent = 'Valittu: 0/3';

    questions.forEach(q => {
        const div = document.createElement('div');
        div.className = 'selectable-question';
        div.textContent = q.question;
        div.dataset.id = q.id;

        div.addEventListener('click', () => {
            toggleQuestionSelection(q.id, div);
        });

        availableQuestions.appendChild(div);
    });
}

function toggleQuestionSelection(questionId, element) {
    const index = selectedQuestionIds.indexOf(questionId);

    if (index > -1) {
        // Deselect
        selectedQuestionIds.splice(index, 1);
        element.classList.remove('selected');
    } else {
        // Select (max 3)
        if (selectedQuestionIds.length < 3) {
            selectedQuestionIds.push(questionId);
            element.classList.add('selected');
        }
    }

    selectionCount.textContent = `Valittu: ${selectedQuestionIds.length}/3`;
    console.log('Selected questions:', selectedQuestionIds);
}

// Confirm selection button handler
confirmSelectionBtn.addEventListener('click', () => {
    if (selectedQuestionIds.length === 0) {
        alert('Valitse ainakin yksi kysymys!');
        return;
    }

    console.log('Confirming selection:', selectedQuestionIds);
    socket.emit('select_questions', { questionIds: selectedQuestionIds });
});

// Handle selection confirmation from server
socket.on('questions_selected', (data) => {
    console.log('✅ Questions selected:', data);
    questionSelection.classList.add('hidden');
    selectionConfirmed.classList.remove('hidden');
    selectionResult.textContent = `🎉 ${data.message}`;
});

function resetGame() {
    console.log('🔄 Resetting game');

    // Notify server we are leaving the game
    if (gameState.gameId) {
        socket.emit('leave_game');
    }

    gameState = {
        gameId: null,
        myPlayerId: null,
        myScore: 0,
        opponentScore: 0,
        myDeckSize: 0,
        myDeck: [],
        currentTurn: null,
        status: null
    };

    // Reset question selection state
    selectedQuestionIds = [];

    // Turn off compact mode
    toggleGameMode(false);

    // Show lobby, hide everything else
    lobbyScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');

    // Reset lobby elements
    roomCodeDisplay.classList.add('hidden');
    createGameBtn.disabled = false;
    roomCodeInput.value = '';

    // Reset game over elements
    questionSelection.classList.add('hidden');
    loserMessage.classList.add('hidden');
    selectionConfirmed.classList.add('hidden');
    availableQuestions.innerHTML = '';

    // Reset game screen elements
    if (questionArea) questionArea.classList.add('hidden');
    if (deckArea) deckArea.classList.add('hidden');
    if (waitingMessage) waitingMessage.classList.add('hidden');
    if (answerResult) answerResult.classList.add('hidden');
}

// --- Profile & Deck Rendering ---

function renderProfile(profile) {
    document.getElementById('stat-wins').textContent = profile.stats.wins;
    document.getElementById('stat-losses').textContent = profile.stats.losses;
    document.getElementById('stat-games').textContent = profile.stats.gamesPlayed;
}

function renderHistory(history) {
    const list = document.getElementById('history-list');
    list.innerHTML = '';

    if (history.length === 0) {
        list.innerHTML = '<p style="padding:10px; text-align:center; color:#888;">Ei pelihistoriaa.</p>';
        return;
    }

    // Show newest first
    const sorted = [...history].reverse();

    sorted.forEach(entry => {
        const div = document.createElement('div');
        div.className = `history-item ${entry.result}`;

        const date = new Date(entry.timestamp).toLocaleDateString();
        const scoreText = `${entry.score.you} - ${entry.score.opponent}`;

        div.innerHTML = `
            <div>
                <strong>${entry.result === 'win' ? 'Voitto' : (entry.result === 'loss' ? 'Häviö' : 'Tasapeli')}</strong>
                <span style="color:#666; font-size:0.9em;">vs. ${entry.opponent || 'Vastustaja'}</span>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:bold;">${scoreText}</div>
                <div style="font-size:0.8em; color:#aaa;">${date}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

// Deck Manager State
let currentProfile = null; // Store for sorting
let sortMode = 'difficulty'; // 'name', 'difficulty', 'category'
let filterMode = 'all';

const sortNameBtn = document.getElementById('sort-name-btn');
const sortDiffBtn = document.getElementById('sort-diff-btn');
const sortCatBtn = document.getElementById('sort-cat-btn');
const filterCatSelect = document.getElementById('filter-cat-select');

// Helper to update active button state
function updateSortButtons() {
    [sortNameBtn, sortDiffBtn, sortCatBtn].forEach(btn => {
        if(btn) btn.style.background = ''; // reset
        if(btn) btn.style.color = '';
    });
    // Highlight active
    let activeBtn = null;
    if (sortMode === 'name') activeBtn = sortNameBtn;
    if (sortMode === 'difficulty') activeBtn = sortDiffBtn;
    if (sortMode === 'category') activeBtn = sortCatBtn;
    
    if (activeBtn) {
        activeBtn.style.background = '#00b894';
        activeBtn.style.color = 'white';
    }
}

if (sortNameBtn) sortNameBtn.addEventListener('click', () => { sortMode = 'name'; updateSortButtons(); renderDeckManager(currentProfile); });
if (sortDiffBtn) sortDiffBtn.addEventListener('click', () => { sortMode = 'difficulty'; updateSortButtons(); renderDeckManager(currentProfile); });
if (sortCatBtn) sortCatBtn.addEventListener('click', () => { sortMode = 'category'; updateSortButtons(); renderDeckManager(currentProfile); });

if (filterCatSelect) {
    filterCatSelect.addEventListener('change', (e) => {
        filterMode = e.target.value;
        renderDeckManager(currentProfile);
    });
}

function renderDeckManager(profile) {
    // Initial setup
    currentProfile = profile;
    updateSortButtons(); // Ensure visual state

    const grid = document.getElementById('collection-grid');
    grid.innerHTML = '';

    const activeSet = new Set(profile.activeCards);
    document.getElementById('active-deck-count').textContent = activeSet.size;

    if (!profile.ownedCardsDetails) return;

    // 1. FILTERING
    let displayCards = profile.ownedCardsDetails.filter(card => {
        if (filterMode === 'all') return true;
        const cat = (card.category || 'yleistieto').toLowerCase();
        return cat === filterMode.toLowerCase();
    });

    // 2. SORTING
    displayCards.sort((a, b) => {
        // Always show Selected cards at the top
        const aSelected = activeSet.has(a.id);
        const bSelected = activeSet.has(b.id);

        if (aSelected !== bSelected) {
            return aSelected ? -1 : 1;
        }

        // Secondary Sort
        if (sortMode === 'name') {
            return (a.question || '').localeCompare(b.question || '');
        } else if (sortMode === 'category') {
            const catA = (a.category || '').toLowerCase();
            const catB = (b.category || '').toLowerCase();
            if (catA !== catB) return catA.localeCompare(catB);
            return (a.difficulty || 0) - (b.difficulty || 0);
        } else {
            // Default: Difficulty
            return (a.difficulty || 0) - (b.difficulty || 0);
        }
    });

    // Helper for icons
    const categoryIcons = {
        'maantieto': '🌍',
        'kulttuuri': '🎨',
        'tiede': '⚛️',
        'avaruus': '🪐',
        'historia': '📜',
        'aliens': '👽',
        'urheilu': '🏆',
        'viihde': '🎬',
        'yleistieto': '💡'
    };

    displayCards.forEach(card => {
        const div = document.createElement('div');
        const isActive = activeSet.has(card.id);
        const cat = (card.category || 'yleistieto').toLowerCase();
        const icon = categoryIcons[cat] || '❓';
        
        // Use Slim Row style
        div.className = `mini-row category-${cat} ${isActive ? 'selected' : ''}`;
        div.dataset.id = card.id;

        div.innerHTML = `
            <div class="mini-icon" title="Avaa kortti">${icon}</div>
            <div class="mini-content">
                <div class="mini-cat">${card.category || 'Yleistieto'}</div>
                <div class="mini-q">${card.question}</div>
            </div>
            <div class="mini-meta">Lvl ${card.difficulty || 1}</div>
            <div class="mini-check" style="opacity: ${isActive ? 1 : 0}">✔</div>
        `;

        // CLick on ROW toggles selection
        div.addEventListener('click', (e) => {
            // If clicking icon, don't select, show modal
            if (e.target.closest('.mini-icon')) {
                e.stopPropagation();
                showFullCardModal(card);
                return;
            }

            // Normal selection logic
            div.classList.toggle('selected');
            const check = div.querySelector('.mini-check');
            if (check) check.style.opacity = div.classList.contains('selected') ? '1' : '0';
            
            updateActiveCount();
        });

        grid.appendChild(div);
    });

    renderSpecialCollection(profile);
}

// --- FULL CARD MODAL LOGIC ---
function showFullCardModal(card) {
    const modal = document.getElementById('card-modal');
    const container = document.getElementById('full-card-container');
    const closeBtn = document.querySelector('.close-modal');

    // Render the fancy full card inside the modal
    container.innerHTML = '';
    
    // Create Ethereal Card for display
    const cardEl = document.createElement('div');
    const cat = (card.category || 'yleistieto').toLowerCase();
    const categoryIcons = { 'maantieto': '🌍', 'kulttuuri': '🎨', 'tiede': '⚛️', 'avaruus': '🪐', 'historia': '📜', 'urheilu': '🏆', 'viihde': '🎬', 'yleistieto': '💡' };
    const icon = categoryIcons[cat] || '❓';

    cardEl.className = `card-wrapper tcg-ethereal category-${cat}`;
    cardEl.style.transform = 'scale(1.2)'; // Make it big
    
    cardEl.innerHTML = `
        <div class="ethereal-inner" style="cursor:default;">
            <div class="ethereal-category">${card.category || 'Yleistieto'}</div>
            <div class="ethereal-circle">${icon}</div>
            <div class="ethereal-question">${card.question}</div>
            <div class="ethereal-footer">
                <span>ID: ${card.id.substring(0,4)}</span>
                <span>Lvl ${card.difficulty || 1}</span>
            </div>
        </div>
    `;
    
    container.appendChild(cardEl);
    modal.classList.remove('hidden');

    // Close logic
    closeBtn.onclick = () => {
        modal.classList.add('hidden');
    };
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.classList.add('hidden');
        }
    };
}

function renderSpecialCollection(profile) {
    const grid = document.getElementById('special-collection-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const owned = profile.ownedSpecialCards || [];
    // Create a copy of active cards to track which ones are already showing as selected
    // This handles duplicate types correctly by "consuming" one active instance for each match.
    const activePool = [...(profile.activeSpecialCards || [])];

    owned.forEach(cardType => {
        const div = document.createElement('div');
        div.className = 'card-toggle special-card'; // Reuse card-toggle style
        div.dataset.type = cardType;

        // Determine if this specific card instance should be selected
        const activeIndex = activePool.indexOf(cardType);
        if (activeIndex > -1) {
            div.classList.add('selected');
            activePool.splice(activeIndex, 1); // Consume one instance
        }

        // Ethereal Visuals
        let label = cardType;
        let icon = '';
        let specialClass = '';

        switch (cardType) {
            case 'SKIP': label = 'Skip'; icon = '⏭️'; specialClass = 'special-skip'; break;
            case 'JOKER': label = 'Jokeri'; icon = '🃏'; specialClass = 'special-joker'; break;
            case 'SWAP_SELF': label = 'Vaihto'; icon = '🔄'; specialClass = 'special-swap'; break;
            case 'MIRROR': label = 'Peili'; icon = '🪞'; specialClass = 'special-mirror'; break;
            case 'SWAP_OPPONENT': label = 'Häiriö'; icon = '🔀'; specialClass = 'special-disrupt'; break;
        }

        div.className = `card-wrapper tcg-ethereal ${specialClass}`;
        
        // Ethereal HTML structure
        div.innerHTML = `
            <div class="ethereal-inner">
                <div class="ethereal-category">SPECIAL</div>
                <div class="ethereal-circle" style="width:60px; height:60px; font-size:2rem;">${icon}</div>
                <div class="ethereal-question" style="font-weight:bold; font-size:1.3rem;">${label}</div>
                <div class="ethereal-footer">
                    <span>EFFECT</span>
                    <span>1 USE</span>
                </div>
            </div>
        `;

        if (activeIndex > -1) {
            div.classList.add('selected');
             div.style.border = '2px solid white';
             div.style.boxShadow = '0 0 15px white';
        }

        div.addEventListener('click', () => {
            // Toggle Logic visual simulation
            if (div.classList.contains('selected')) {
                div.classList.remove('selected');
                div.style.border = '';
                div.style.boxShadow = '';
            } else {
                const currentSelected = document.querySelectorAll('.card-wrapper.tcg-ethereal.selected .ethereal-inner .ethereal-category:contains("SPECIAL")').length; 
                // Note: The selector above is simplified, in reality we rely on class names
                 const currentSpecials = document.querySelectorAll('#special-collection-grid .selected').length;
                if (currentSpecials < 3) {
                    div.classList.add('selected');
                    div.style.border = '2px solid white';
                    div.style.boxShadow = '0 0 15px white';
                } else {
                    alert('Voit valita enintään 3 erikoiskorttia!');
                }
            }
        });

        grid.appendChild(div);
    });
}

function updateActiveCount() {
    const selected = document.querySelectorAll('.mini-row.selected').length;
    const countEl = document.getElementById('active-deck-count');
    if (countEl) countEl.textContent = selected;
}

function saveDeck() {
    const selectedEls = document.querySelectorAll('.mini-row.selected'); // Question cards (now mini-row)
    const activeCards = Array.from(selectedEls).map(el => el.dataset.id);

    // Strict validation: Must be 10 cards
    if (activeCards.length !== 10) {
        alert(`Sinun täytyy valita tasan 10 kysymyskorttia! (Nykyinen: ${activeCards.length})`);
        return;
    }

    // Get specials
    const activeSpecialCards = [];
    document.querySelectorAll('.special-card.selected').forEach(el => {
        activeSpecialCards.push(el.dataset.type);
    });

    socket.emit('update_deck', { activeCards, activeSpecialCards });
}

// --- SPECIAL CARDS IN GAME ---
function renderSpecialHand() {
    const container = document.getElementById('special-cards');
    if (!container) return;
    container.innerHTML = '';

    // If no special cards, hide/show logic?
    // gameState.mySpecialHand is array of strings e.g. ['skip']
    const mySpecials = gameState.mySpecialHand || [];

    if (mySpecials.length === 0) {
        // Optionally put a placeholder or just leave empty
        // container.innerHTML = '<span style="color:rgba(255,255,255,0.3); font-size:0.8rem;">Ei erikoiskortteja</span>';
        return;
    }

    const specialMeta = {
        // New lowercase keys (just in case)
        'skip': { icon: '⏭️', name: 'OHITA', desc: 'Ohita kysymys' },
        'remove_option': { icon: '5️⃣0️⃣', name: '50/50', desc: 'Poista 2 väärää' },
        'steal_points': { icon: '🕵️', name: 'VARAS', desc: 'Pölli pisteitä' },
        'double_points': { icon: '✨', name: 'TUPLA', desc: 'Tuplapisteet' },
        'shield': { icon: '🛡️', name: 'KILPI', desc: 'Suojaa varkailta' },
        'peek': { icon: '👁️', name: 'KURKKAA', desc: 'Katso vastustajan käsi' },
        
        // Legacy Uppercase Keys (Server likely uses these)
        'SKIP': { icon: '⏭️', name: 'OHITA', desc: 'Ohita vuoro/kysymys' },
        'JOKER': { icon: '🃏', name: 'JOKERI', desc: 'Satunnainen etu' },
        'SWAP_SELF': { icon: '🔄', name: 'VAIHTO', desc: 'Vaihda kysymys' },
        'MIRROR': { icon: '🪞', name: 'PEILI', desc: 'Heijasta vaikutus' },
        'SWAP_OPPONENT': { icon: '🔀', name: 'HÄIRIÖ', desc: 'Sekoita vastustaja' }
    };

    mySpecials.forEach(cardType => {
        console.log('🃏 Rendering Special Card:', cardType); // Debug log
        const div = document.createElement('div');
        const meta = specialMeta[cardType] || { icon: '⭐', name: 'ERIKOIS', desc: cardType }; // Fallback shows ID
        
        // Use Slim Row style
        div.className = 'mini-row category-viihde special-card-game'; 
        div.dataset.type = cardType;
        div.style.width = '200px'; 
        div.style.borderLeftColor = '#fdcb6e'; // Gold
        div.style.cursor = 'pointer';

        // Check if card is usable (e.g. is my turn)
        const canUse = (gameState.currentTurn === gameState.myPlayerId);
        if (!canUse) {
            div.style.opacity = '0.5';
            div.style.cursor = 'not-allowed';
            div.setAttribute('title', 'Ei sinun vuorosi');
        }

        div.innerHTML = `
            <div class="mini-icon">${meta.icon}</div>
            <div class="mini-content">
                <div class="mini-cat" style="color:#fdcb6e; font-size:0.6rem;">${meta.name}</div>
                <div class="mini-q" style="font-size:0.8rem;">${meta.desc}</div>
            </div>
        `;

        div.addEventListener('click', () => {
            if (!canUse) {
                console.log('Cant use card, not turn');
                return;
            }
            if (confirm(`Haluatko käyttää kortin: ${meta.name}?`)) {
                console.log('Using special card:', cardType);
                socket.emit('use_special_card', { cardType });
            }
        });

        container.appendChild(div);
    });
}

// --- PREVIEW CARD ON TABLE ---
function showPreviewCard(card) {
    if (!questionArea) return;
    
    // Ensure visibility
    questionArea.classList.remove('hidden');
    if (waitingMessage) waitingMessage.classList.add('hidden');
    
    // Reuse the Ethereal Card styling loop logic
    const cat = (card.category || 'yleistieto').toLowerCase();
    const categoryIcons = { 'maantieto': '🌍', 'kulttuuri': '🎨', 'tiede': '⚛️', 'avaruus': '🪐', 'historia': '📜', 'urheilu': '🏆', 'viihde': '🎬', 'yleistieto': '💡' };
    const icon = categoryIcons[cat] || '❓';

    // Render big card
    questionArea.innerHTML = `
        <div class="card-wrapper tcg-ethereal category-${cat}" style="transform: scale(1.0); margin: 0 0 20px 0; cursor: default; width: 260px; height: 364px; aspect-ratio: 2.5/3.5;">
            <div class="ethereal-inner" style="cursor:default; padding: 25px;">
                <div class="ethereal-category">${card.category || 'Yleistieto'}</div>
                <div class="ethereal-circle" style="width: 80px; height: 80px; font-size: 2.5rem;">${icon}</div>
                <div class="ethereal-question" style="font-size: 1.1rem;">${card.question}</div>
                 <div class="ethereal-footer" style="padding-top: 10px;">
                    <span>ID: ${card.id.substring(0,4)}</span>
                    <span>Lvl ${card.difficulty || 1}</span>
                </div>
            </div>
        </div>
        <div style="color: rgba(255,255,255,0.4); font-style: italic; font-size: 0.9rem;">Klikkaa pelataksesi</div>
    `;
}

function clearPreviewCard() {
    if (!questionArea) return;
    
    if (gameState.currentTurn === 'me') {
        renderDefaultTableState();
    } else {
        questionArea.innerHTML = '';
        questionArea.classList.add('hidden');
    }
}

function renderDefaultTableState() {
    if (!questionArea) return;
    questionArea.classList.remove('hidden');
    questionArea.innerHTML = `
        <div class="card-wrapper face-down-full" style="margin: 0 0 20px 0;">
            <div class="face-down-icon">❓</div>
        </div>
        <div style="color: rgba(255,255,255,0.3); font-style: italic; margin-top:5px;">Valitse kortti pelataksesi</div>
    `;
}
