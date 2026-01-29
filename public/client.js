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

// Handle Guest Login event (from auth_ui.js) - similar to authStateChange but forced for guest
window.addEventListener('guestLogin', (e) => {
    const { guestId } = e.detail;
    console.log('👤 Guest login detected:', guestId);
    
    if (guestId !== myPersistentId) {
        myPersistentId = guestId;
        socket.disconnect();
        socket = io({
            auth: {
                token: myPersistentId
            }
        });
        setupSocketListeners();
        console.log('🆔 Updated Persistent ID (Guest):', myPersistentId);
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
let nextQuestion = null; // Queue next question for single player flow

// Socket events - wrapped in function for reconnection support
function setupSocketListeners() {
    socket.off(); // Remove old listeners
    
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        statusText.textContent = 'Yhdistetty';
        connectionStatus.classList.add('connected');
        
        // Fetch profile immediately to update deck counts
        socket.emit('get_profile');
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
        
        // Redirect logic: SP goes direct, Others go to Lobby
        if (gameState.mode === 'single') {
            console.log('🕹️ Single Player: Bypassing lobby');
            document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
            const gameScreen = document.getElementById('game-screen');
            if (gameScreen) gameScreen.classList.remove('hidden');
        } else {
            showLobbyScreen(data.gameId, true);
        }
        
        if (createGameBtn) createGameBtn.disabled = true;
    });

    socket.on('game_joined', (data) => {
        console.log('🚪 Game joined:', data);
        if (joinWaitingModal) joinWaitingModal.classList.add('hidden'); // Hide waiting modal
        if (data.success) {
            gameState.myPlayerId = data.playerId;
            gameState.mode = 'single'; // 1v1
            showLobbyScreen(gameState.gameId || data.gameId, false); // Host=false
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
        
        // If waiting (1v1/Multi), update Lobby UI
        if (data.status === 'waiting') {
            updateLobbyUI(gameState);
        } else {
            // Active game - Hide lobby, show game screen
            const lobby = document.getElementById('game-lobby-screen');
            const gameScreen = document.getElementById('game-screen');
            if (lobby) lobby.classList.add('hidden');
            if (gameScreen) gameScreen.classList.remove('hidden');
            updateGameUI();
        }
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
        console.log('📦 Deck updated:', data);
        // showNotification('Pakka tallennettu!', 'success'); // Suppressed per user request
    });

    socket.on('waiting_games_list', (games) => {
        addDebugLog(`Vastaanotettiin ${games.length} peliä listaan.`);
        renderServerList(games);
    });

    

    // Handlers moved to end of file to prevent re-attachment issues



    // ==================== MULTI-PLAYER LISTENERS ====================

    socket.on('multi_game_created', (data) => {
        console.log('🎮 Multi-Game created:', data);
        gameState.gameId = data.gameId;
        gameState.myPlayerId = data.playerId;
        showLobbyScreen(data.gameId, true);
    });

    socket.on('multi_game_joined', (data) => {
         console.log('🚪 Multi-Game joined:', data);
        if (typeof joinWaitingModal !== 'undefined' && joinWaitingModal) joinWaitingModal.classList.add('hidden');
        gameState.gameId = data.gameId;
        gameState.myPlayerId = data.playerId;
        showLobbyScreen(data.gameId, false);
    });

    socket.on('multi_game_state', (data) => {
        console.log('📊 Multi-Game state:', data);
        // data contains: players (array), mode, status, settings, etc.
        if (data.status === 'active') {
             startGameFromLobby(data);
             updateMultiGameUI(data);
        } else {
             updateLobbyUI(data);
        }
    });

    socket.on('multi_game_started', () => {
         console.log('🚀 Multi-Game started!');
         showScreen('multi-game-screen');
         document.body.classList.add('game-active');
    });

    socket.on('multi_question_presented', (data) => {
         console.log('❓ Multi Answer Time:', data);
         showMultiQuestion(data);
    });

    socket.on('multi_answer_received', (data) => {
          // Feedback for answering
          if (data.correct) {
               showNotification('Oikein!', 'success');
          } else {
               showNotification('Väärin!', 'error');
          }
           // UI should update to "waiting for others"
          const qArea = document.getElementById('multi-question-text');
          if(qArea) qArea.innerHTML = '<h3>Vastaus rekisteröity. Odotetaan muita...</h3>';
          document.getElementById('multi-answer-options').innerHTML = '';
    });

    socket.on('multi_round_result', (data) => {
        console.log('🏁 Round Result:', data);
        showMultiRoundResult(data);
    });

    socket.on('multi_game_over', (data) => {
         console.log('🏆 Multi Game Over:', data);
         showMultiGameOver(data);
    });
    
    socket.on('waiting_multi_games_list', (games) => {
         // Merge or handle separately? 
         // For now, let's just log or maybe implement a separate list if user wants?
         // User "Server List" usually implies generic. 
         // Let's modify renderServerList to accept these too or call a variant.
         console.log('Multi games list:', games);
         renderServerList(games); // Unified render
    });

    socket.on('multi_deck', (deck) => {
         // Receive deck cards for gameplay
         // Render hand using existing logic but into multi-deck-area
         renderMultiHand(deck);
    });
}

// Initial socket setup
// setupSocketListeners(); // It is called at the end of file usually, or if we are inside function? 



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

    // Create Game Modal Logic
    const openCreateMenuBtn = document.getElementById('open-create-menu-btn');
    const createGameModal = document.getElementById('create-game-modal');
    const closeCreateModal = document.getElementById('close-create-modal');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const countBtns = document.querySelectorAll('.count-btn'); // NEW
    const playerCountGroup = document.getElementById('player-count-group');
    const createMaxPlayersInput = document.getElementById('create-max-players'); // Hidden input
    const modeDescription = document.getElementById('mode-description');
    const confirmCreateGameBtn = document.getElementById('confirm-create-game-btn');

    let selectedMode = '1v1'; // Default

    const modeDescriptions = {
        '1v1': 'Klassinen kaksinpeli. Toinen vastaa vuorollaan.',
        'round': 'Kaikki vastaavat. Nopein oikein vastannut saa pisteet. (2-10 pelaajaa)',
        'choice': 'Vuorossa oleva valitsee kuka vastaa. (3-10 pelaajaa)'
    };

    if (openCreateMenuBtn) {
        openCreateMenuBtn.addEventListener('click', () => {
             createGameModal.classList.remove('hidden');
        });
    }

    if (closeCreateModal) {
        closeCreateModal.addEventListener('click', () => {
             createGameModal.classList.add('hidden');
        });
    }

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update UI
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            selectedMode = btn.dataset.mode;
            
            // Show/Hide player count based on mode
            if (selectedMode === '1v1') {
                playerCountGroup.classList.add('hidden');
            } else {
                playerCountGroup.classList.remove('hidden');
            }

            // Update description
            if (modeDescription) {
                modeDescription.textContent = modeDescriptions[selectedMode];
            }
        });
    });

    // Handle Player Count Buttons
    countBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            countBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            createMaxPlayersInput.value = btn.dataset.count;
        });
    });

    if (confirmCreateGameBtn) {
        confirmCreateGameBtn.addEventListener('click', () => {
            const count = parseInt(document.getElementById('active-deck-count').textContent || '0');
             
            if (count !== 10) {
                alert(`Sinun täytyy valita tasan 10 kysymyskorttia ennen pelin aloitusta! (Valittu: ${count})`);
                return;
            }

            const visibility = document.querySelector('input[name="visibility"]:checked').value;
            const maxPlayers = parseInt(createMaxPlayersInput.value);

            console.log(`Starting game: Mode=${selectedMode}, Visibility=${visibility}, MaxPlayers=${maxPlayers}`);

            if (selectedMode === '1v1') {
                socket.emit('create_game', { targetScore: 5, visibility: visibility });
            } else {
                socket.emit('create_multi_game', { 
                    mode: selectedMode, 
                    maxPlayers: maxPlayers,
                    targetScore: 5,
                    visibility: visibility 
                });
            }
            
            createGameModal.classList.add('hidden');
            // Show notification? 
            // We wait for socket event to switch screen
        });
    }

    /* 
    createGameBtn.addEventListener('click', () => { ... old logic removed ... });
    */

const singlePlayerBtn = document.getElementById('single-player-btn');
if (singlePlayerBtn) {
    singlePlayerBtn.addEventListener('click', () => {
        console.log('Starting single player game...');
        // No deck check required for single player? 
        // Logic says system provides deck. But player answers...
        // Does player use their own cards to ANSWER? No, usually you answer given questions.
        // But in this game, "Deck" is questions you ASK.
        // In SP, System asks. So player needs no cards?
        // Actually, player might still want to "collect" cards if they win?
        // Let's allow starting without check.
        socket.emit('start_single_player');
    });
}

joinGameBtn.addEventListener('click', () => {
    const count = parseInt(document.getElementById('active-deck-count').textContent || '0');
    if (count !== 10) {
        alert(`Sinun täytyy valita tasan 10 kysymyskorttia ennen peliin liittymistä! (Valittu: ${count})`);
        return;
    }
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
    
    if (nextQuestion) {
        showQuestion(nextQuestion);
        nextQuestion = null;
    } else {
        updateGameUI();
    }
});

// New game button handler is defined later with SP-aware logic

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
        // Check if we are leaving Deck Manager
        const currentActive = document.querySelector('.nav-btn.active');
        if (currentActive && currentActive.dataset.target === 'deck-manage-screen' && btn !== currentActive) {
             showNotification('Pakka tallennettu', 'success');
        }

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

// Profile & Deck Handlers
const deckTabBtns = document.querySelectorAll('.deck-tabs .auth-tab');
if (deckTabBtns.length > 0) {
    deckTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
             // Deactivate all
             deckTabBtns.forEach(b => b.classList.remove('active'));
             document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
             
             // Activate clicked
             btn.classList.add('active');
             const target = document.getElementById(btn.dataset.target);
             if (target) target.classList.remove('hidden');

             // Show confirmation toast on tab switch as requested
             showNotification('Pakka tallennettu', 'success');
        });
    });
}

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
    // Safety check: ensure we actually have a game ID before showing game UI
    if (!gameState.gameId) {
        console.warn('⚠️ updateGameUI called but gameId is null. Ignoring.');
        return;
    }

    console.log('🔄 Updating UI with state:', gameState);
    toggleGameMode(true); // Enable compact mode
    // Hide lobby, show game
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverScreen.classList.add('hidden');

    // Make sure we hide result screen if it was left open (e.g. from previous game)
    // unless we are actually viewing a result?
    // answerResult.classList.add('hidden'); // Logic seems to handle this elsewhere


    // Show player role
    const roleDisplay = document.getElementById('player-role-display');
    if (roleDisplay) {
        roleDisplay.textContent = gameState.myPlayerId === 'playerA' ? 'Olet pelaaja A (Aloittaja)' : 'Olet pelaaja B (Liittyjä)';
    }

    // Update scores
    // Update scores
    myScoreEl.textContent = gameState.myScore;
    
    if (gameState.mode === 'single') {
        // Single Player Adjustments
        opponentScoreEl.parentElement.classList.add('hidden'); // Hide opponent score container
        myScoreEl.parentElement.classList.add('hidden'); // Hide player score too (mystery mode)
        const roleDisplay = document.getElementById('player-role-display');
        if (roleDisplay) roleDisplay.textContent = 'Yksinpeli';
        
        // Hide VS badge container (parent of turn-indicator)
        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator && turnIndicator.parentElement) {
             const vsBadge = turnIndicator.parentElement.querySelector('.vs-badge');
             if (vsBadge) vsBadge.classList.add('hidden');
        }
    } else {
        opponentScoreEl.parentElement.classList.remove('hidden');
        opponentScoreEl.textContent = gameState.opponentScore;
        
        // Show VS badge
        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator && turnIndicator.parentElement) {
             const vsBadge = turnIndicator.parentElement.querySelector('.vs-badge');
             if (vsBadge) vsBadge.classList.remove('hidden');
        }
    }

    // Update round counter (if element exists or create one)
    // ...

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
    if (gameState.mode === 'single') {
         turnIndicator.textContent = `Kysymys ${gameState.roundNumber}/10`;
         turnIndicator.className = 'turn-indicator my-turn'; // Keep it active style
         showDeck();
    } else {
        if (gameState.currentTurn === 'me') {
            turnIndicator.textContent = 'Sinun vuorosi';
            turnIndicator.className = 'turn-indicator my-turn';
            showDeck();
        } else {
            turnIndicator.textContent = 'Vastustajan vuoro';
            turnIndicator.className = 'turn-indicator opponent-turn';
            showWaiting(false);
        }
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
    if (gameState.currentTurn === 'me' && gameState.mode !== 'single') {
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

    // Safety: If game screen is hidden or we have no game ID, don't show question
    if (gameScreen.classList.contains('hidden') || !gameState.gameId) {
         console.warn('⚠️ Attempted to show question but game screen is hidden or no game active.');
         return;
    }

    
    // If answer result is visible, queue this question instead of showing immediately (SP flow)
    if (!answerResult.classList.contains('hidden')) {
        console.log('⏳ Queuing next question until user clicks Continue');
        nextQuestion = question;
        return;
    }
    
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
    // Inline styles removed to allow CSS control for responsiveness
    
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
    // In Single Player, player is ALWAYS answerer
    const isAnswerer = (gameState.currentTurn !== 'me' || gameState.mode === 'single');
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
    
    // Single Player: Skip result screen, auto-continue
    if (gameState.mode === 'single') {
        questionArea.classList.add('hidden');
        // Don't show answerResult screen, just wait for next question
        // The next question will be queued via nextQuestion variable
        if (nextQuestion) {
            showQuestion(nextQuestion);
            nextQuestion = null;
        }
        return;
    }
    
    // Multiplayer: Show result
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
    }, 1000);
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

    // Reconstruct score display to avoid detached DOM element issues on replay
    const finalScoresDiv = document.querySelector('#game-over-screen .final-scores');
    if (finalScoresDiv) {
        if (gameState.mode === 'single') {
            finalScoresDiv.innerHTML = `
                <p>Oikein: <span id="final-my-score">${data.finalScore.you}</span>/10</p>
            `;
        } else {
            finalScoresDiv.innerHTML = `
                <p>Sinä: <span id="final-my-score">${data.finalScore.you}</span></p>
                <p>Vastustaja: <span id="final-opponent-score">${data.finalScore.opponent}</span></p>
            `;
        }
    }

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
        div.className = 'question-item';
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
    if (questionArea) {
        questionArea.classList.add('hidden');
        questionArea.innerHTML = '';
    }
    if (deckArea) {
        deckArea.classList.add('hidden');
        deckArea.innerHTML = '';
        deckArea.classList.remove('options-active'); // Reset styling
    }
    if (waitingMessage) waitingMessage.classList.add('hidden');
    if (answerResult) answerResult.classList.add('hidden');
    
    // Explicitly ensure body doesn't have game-active (redundant safety)
    document.body.classList.remove('game-active');

}

// New Game Button Handler
if (newGameBtn) {
    newGameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const wasSpMode = gameState.mode === 'single';
        
        // If was in Single Player mode, start a new SP game immediately without going to lobby
        if (wasSpMode) {
            // Reset game over UI
            gameOverScreen.classList.add('hidden');
            questionSelection.classList.add('hidden');
            loserMessage.classList.add('hidden');
            selectionConfirmed.classList.add('hidden');
            selectedQuestionIds = [];
            
            // Reset game state
            gameState = {
                ...gameState,
                myScore: 0,
                opponentScore: 0,
                myDeckSize: 0,
                myDeck: [],
                currentTurn: null,
                status: null
            };
            
            // Small delay to prevent click event from bleeding through to new question options
            setTimeout(() => {
                socket.emit('start_single_player');
            }, 50);
        } else {
            resetGame();
        }
    });
}

// Exit Game Button Handler
const exitGameBtn = document.getElementById('exit-game-btn');
if (exitGameBtn) {
    exitGameBtn.addEventListener('click', () => {
        resetGame();
    });
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
let viewMode = 'grid'; // Default to grid

const sortNameBtn = document.getElementById('sort-name-btn');
const sortDiffBtn = document.getElementById('sort-diff-btn');
const sortCatBtn = document.getElementById('sort-cat-btn');
const viewToggleBtn = document.getElementById('view-toggle-btn');
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

    // Update view toggle button text/icon
    if (viewToggleBtn) {
        if (viewMode === 'grid') {
             viewToggleBtn.innerHTML = '📜 Lista';
             viewToggleBtn.style.background = '#00b894';
             viewToggleBtn.style.color = 'white';
        } else {
             viewToggleBtn.innerHTML = '🖼️ Kortit';
             viewToggleBtn.style.background = ''; // reset
             viewToggleBtn.style.color = '';
        }
    }
}

if (sortNameBtn) sortNameBtn.addEventListener('click', () => { sortMode = 'name'; updateSortButtons(); renderDeckManager(currentProfile); });
if (sortDiffBtn) sortDiffBtn.addEventListener('click', () => { sortMode = 'difficulty'; updateSortButtons(); renderDeckManager(currentProfile); });
if (sortCatBtn) sortCatBtn.addEventListener('click', () => { sortMode = 'category'; updateSortButtons(); renderDeckManager(currentProfile); });

if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
        viewMode = (viewMode === 'list') ? 'grid' : 'list';
        updateSortButtons();
        renderDeckManager(currentProfile);
    });
}

if (filterCatSelect) {
    filterCatSelect.addEventListener('change', (e) => {
        filterMode = e.target.value;
        renderDeckManager(currentProfile);
    });
}



const settingsToggleBtn = document.getElementById('deck-settings-toggle');
if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener('click', () => {
        const menu = document.getElementById('deck-controls-menu');
        const arrow = document.getElementById('settings-arrow');
        if (menu) {
            menu.classList.toggle('hidden');
            if (arrow) {
                arrow.textContent = menu.classList.contains('hidden') ? '▼' : '▲';
            }
        }
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
    
    // Toggle Grid Class
    if (viewMode === 'grid') {
        grid.classList.add('grid-mode');
    } else {
        grid.classList.remove('grid-mode');
    }

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
        let div = document.createElement('div');
        const isActive = activeSet.has(card.id);
        const cat = (card.category || 'yleistieto').toLowerCase();
        const icon = categoryIcons[cat] || '❓';
        
        if (viewMode === 'list') {
            // === LIST VIEW (Mini Row) ===
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
            
            // Icon click opens modal
            div.addEventListener('click', (e) => {
                if (e.target.closest('.mini-icon')) {
                    e.stopPropagation();
                    showFullCardModal(card);
                    return;
                }
                toggleCardSelection(div, isActive, card);
            });
            grid.appendChild(div);

        } else {
            // === GRID VIEW (Card Wrapper) ===
            // Wrap in cell for better layout control
            const cell = document.createElement('div');
            cell.className = 'card-grid-cell';

            // Create Ethereal Card style
            div.className = `card-wrapper tcg-ethereal category-${cat}`;
            if (isActive) {
                div.classList.add('selected');
                div.style.border = '2px solid #00b894'; // Helper highlight
                div.style.boxShadow = '0 0 15px #00b894';
            }
            div.dataset.id = card.id;
            
            div.innerHTML = `
                <div class="ethereal-inner" style="pointer-events:none;">
                    <div class="ethereal-category">${card.category || 'Yleistieto'}</div>
                    <div class="ethereal-circle">${icon}</div>
                    <div class="ethereal-question">${card.question}</div>
                     <div class="ethereal-footer">
                        <span style="font-size: 0.6rem; opacity: 0.7;">#${card.id.substring(0,4)}/1</span>
                         <div class="rarity-dot basic"></div>
                    </div>
                </div>
            `;

            div.addEventListener('click', () => {
                 toggleCardSelection(div, isActive, card);
            });
            
            cell.appendChild(div);
            grid.appendChild(cell);
        }
    });

    renderSpecialCollection(profile);
}

function toggleCardSelection(element, wasActive, card) {
     if (element.classList.contains('selected')) {
         // Deselecting
         element.classList.remove('selected');
         if (viewMode === 'list') {
             const check = element.querySelector('.mini-check');
             if(check) check.style.opacity = '0';
         } else {
             element.style.border = '';
             element.style.boxShadow = '';
         }
     } else {
         // Selecting - Check Limit
         const currentSelected = document.querySelectorAll('#collection-grid .selected').length;
         if (currentSelected >= 10) {
             alert('Voit valita enintään 10 kysymyskorttia!');
             return;
         }

         element.classList.add('selected');
          if (viewMode === 'list') {
             const check = element.querySelector('.mini-check');
             if(check) check.style.opacity = '1';
         } else {
             element.style.border = '2px solid #00b894';
             element.style.boxShadow = '0 0 15px #00b894';
         }
     }
     updateActiveCount();
     saveDeck(); // Auto-save
}


function updateActiveCount() {
    const selected = document.querySelectorAll('#collection-grid .selected').length;
    const countEl = document.getElementById('active-deck-count');
    if (countEl) countEl.textContent = selected;
}

function saveDeck() {
    const selectedEls = document.querySelectorAll('#collection-grid .selected');
    const activeCards = Array.from(selectedEls).map(el => el.dataset.id);

    // Get specials
    const activeSpecialCards = [];
    document.querySelectorAll('.special-card.selected').forEach(el => {
        activeSpecialCards.push(el.dataset.type);
    });

    // Auto-save always emits, validation happens at game start
    socket.emit('update_deck', { activeCards, activeSpecialCards });
}

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
    
    // Toggle Grid Class based on viewMode
    if (viewMode === 'grid') {
         grid.classList.add('grid-mode'); // Should be default grid really, but let's be explicit if we want list mode for specials too?
         // Actually, special grid was ALREADY grid.
         // If viewMode IS 'list', maybe we want list mode for specials too?
         grid.style.display = 'grid'; // Force grid for now as per previous request?
         // User requested toggle for ALL. 
    } else {
        // If List mode, maybe revert to column?
        // But user asked for Special cards to be side-by-side (grid) previously.
        // Let's interpret "List Mode" for Specials as "Mini Row" and "Card Mode" as "Big Card".
        // BUT if I change display to block/flex, I lose the grid layout.
        
        // Let's support both.
        if (viewMode === 'list') {
            grid.style.display = 'flex';
            grid.style.flexDirection = 'column';
        } else {
             // Grid mode handled by CSS class .grid-mode
             // Removing manual inline styles that conflict with theme.css
             grid.removeAttribute('style');
        }
    }


    const owned = profile.ownedSpecialCards || [];
    // Create a copy of active cards to track which ones are already showing as selected
    // This handles duplicate types correctly by "consuming" one active instance for each match.
    const activePool = [...(profile.activeSpecialCards || [])];

    owned.forEach(cardType => {
        const div = document.createElement('div');
        div.dataset.type = cardType;

        // Determine if this specific card instance should be selected
        const activeIndex = activePool.indexOf(cardType);
        let isSelected = false;
        if (activeIndex > -1) {
            isSelected = true;
            activePool.splice(activeIndex, 1); // Consume one instance
        }
        
        const specialMeta = {
            'SKIP': { icon: '⏭️', name: 'OHITA', desc: 'Ohita kysymys' },
            'JOKER': { icon: '🃏', name: 'JOKERI', desc: 'Satunnainen etu' },
            'SWAP_SELF': { icon: '🔄', name: 'VAIHTO', desc: 'Vaihda kysymys' },
            'MIRROR': { icon: '🪞', name: 'PEILI', desc: 'Heijasta vaikutus' },
            'SWAP_OPPONENT': { icon: '🔀', name: 'HÄIRIÖ', desc: 'Sekoita vastustaja' }
        };
        const meta = specialMeta[cardType] || { icon: '⭐', name: cardType, desc: 'Erikoiskortti' };
        // Determine SPECIAL CLASS for coloring
        let specialClass = '';
        if (cardType === 'SKIP') specialClass = 'special-skip';
        if (cardType === 'JOKER') specialClass = 'special-joker';
        if (cardType === 'SWAP_SELF') specialClass = 'special-swap';

        
        if (viewMode === 'list') {
             // === LIST MODE (Mini Row) ===
            div.className = `mini-row category-viihde special-card ${isSelected ? 'selected' : ''}`;
             // Special styling overrides for mini-row?
             div.style.borderLeftColor = '#fdcb6e'; // Gold for special
             
             div.innerHTML = `
                <div class="mini-icon">${meta.icon}</div>
                <div class="mini-content">
                    <div class="mini-cat" style="color:#fdcb6e;">${meta.name}</div>
                    <div class="mini-q">${meta.desc}</div>
                </div>
                <div class="mini-check" style="opacity: ${isSelected ? 1 : 0}">✔</div>
            `;
            grid.appendChild(div);
            
        } else {
             // === GRID MODE (Card Wrapper) ===
             const cell = document.createElement('div');
             cell.className = 'card-grid-cell';

            div.className = `card-wrapper tcg-ethereal special-card ${specialClass} ${isSelected ? 'selected' : ''}`;
            
            div.innerHTML = `
                <div class="ethereal-inner">
                    <div class="ethereal-category">SPECIAL</div>
                    <div class="ethereal-circle">${meta.icon}</div>
                    <div class="ethereal-question">${meta.name}</div>
                    <div class="ethereal-footer">
                        <span>EFFECT</span>
                         <div class="rarity-dot special"></div>
                    </div>
                </div>
            `;
            
            if (isSelected) {
                 div.style.border = '2px solid white';
                 div.style.boxShadow = '0 0 15px white';
            }

            div.addEventListener('click', () => {
                if (div.classList.contains('selected')) {
                    div.classList.remove('selected');
                    if (viewMode === 'list') {
                        const check = div.querySelector('.mini-check');
                        if(check) check.style.opacity = '0';
                    } else {
                        div.style.border = '';
                        div.style.boxShadow = '';
                    }
                } else {
                    const currentSpecials = document.querySelectorAll('.special-card.selected').length;
                    if (currentSpecials < 3) {
                        div.classList.add('selected');
                        if (viewMode === 'list') {
                            const check = div.querySelector('.mini-check');
                            if(check) check.style.opacity = '1';
                        } else {
                            div.style.border = '2px solid white';
                            div.style.boxShadow = '0 0 15px white';
                        }
                    } else {
                        alert('Voit valita enintään 3 erikoiskorttia!');
                        return; // Don't save if blocked
                    }
                }
                saveDeck(); // Auto-save
            });

            cell.appendChild(div);
            grid.appendChild(cell);
        }
    });
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

// ==================== MULTI-PLAYER UI FUNCTIONS ====================

function updateMultiLobbyUI(state) {
    const list = document.getElementById('multi-players-list');
    const count = document.getElementById('multi-player-count');
    const modeInfo = document.getElementById('multi-mode-info');
    
    if (list) {
        list.innerHTML = '';
        state.players.forEach(p => {
             const div = document.createElement('div');
             div.className = 'player-item glass-panel';
             div.style.padding = '10px';
             div.style.display = 'flex';
             div.style.justifyContent = 'space-between';
             div.style.alignItems = 'center';
             
             div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.5rem;">👤</span>
                    <span style="font-weight:bold;">${p.name} ${p.isHost ? '👑' : ''}</span>
                </div>
                <div class="score-badge">${p.score} pts</div>
             `;
             list.appendChild(div);
        });
    }

    if (count) count.textContent = `Pelaajia: ${state.players.length}/${state.settings.maxPlayers}`;
    if (modeInfo) modeInfo.textContent = `Pelimuoto: ${state.mode === 'round' ? 'Kierros (Kaikki vastaa)' : 'Valinta (Kysyjä valitsee)'}`;
}

function updateMultiGameUI(state) {
    console.log('🔄 Updating Multi Game UI:', state);
    toggleGameMode(true);
    
    // Switch screens
    document.getElementById('game-lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden'); // Legacy screen? 
    // Wait, do we use 'game-screen' for multi too? Or 'multi-game-screen'?
    // In showScreen('multi-game-screen') call... 
    // I don't have 'multi-game-screen' in HTML. I should use 'game-screen' but adapted.
    // Let's assume we reuse 'game-screen'.
    
    const gameScreen = document.getElementById('game-screen');
    gameScreen.classList.remove('hidden');
    
    // Update Scores
    const myPlayer = state.players.find(p => p.id === gameState.myPlayerId);
    if (myPlayer) {
        document.getElementById('my-score').textContent = myPlayer.score;
    }
    
    // Opponent Score? In multi we might have many.
    // Maybe hide opponent score or show "Leaderboard"?
    // For now, let's just show top opponent or something.
    document.getElementById('opponent-score-container').classList.add('hidden'); // Hide simple VS score
    
    // Turn Indicator
    const turnIndicator = document.getElementById('turn-indicator');
    if (state.status === 'active') {
         if (state.mode === 'round') {
             turnIndicator.textContent = 'Kierros käynnissä';
             turnIndicator.className = 'turn-indicator';
         } else if (state.mode === 'choice') {
             const asker = state.players.find(p => p.id === state.currentTurn);
             if (state.currentTurn === gameState.myPlayerId) {
                 turnIndicator.textContent = 'Sinun vuorosi valita!';
                 turnIndicator.className = 'turn-indicator my-turn';
             } else {
                 turnIndicator.textContent = `${asker ? asker.name : 'Pelaaja'} valitsee...`;
                 turnIndicator.className = 'turn-indicator opponent-turn';
             }
         }
    }
    
    // Show Deck if my turn (or always if round mode?)
    // In round mode, everyone answers? No, usually asker asks.
    // "Round" mode description: "Kaikki vastaavat". So Asker asks, everyone else answers.
    // So Asker needs deck.
    
    if (state.activeQuestion) {
        // Question in progress
        showMultiQuestion({
            question: state.activeQuestion.card, // This might need adaptation
            askerId: state.currentTurn, 
            askerName: 'Kysyjä' // Todo: resolve name
        });
    } else {
        // Waiting for asker
        if (state.currentTurn === gameState.myPlayerId) {
             showDeck();
        } else {
             showWaiting(false);
        }
    }
}

function renderMultiHand(deck) {
    // Reuse existing logic, just update state
    gameState.myDeck = deck;
    gameState.myDeckSize = deck.length;
    showDeck();
}

function showMultiQuestion(data) {
    // Reuse showQuestion logic but adapt data
    // data.question is the card object (or clientQuestion)
    showQuestion(data.question);
}

function showMultiRoundResult(data) {
    // Show toast or overlay?
    if (data.correct) {
        showNotification('Oikein! +1 Piste', 'success');
    } else {
        showNotification(`Väärin! Oikea: ${data.correctAnswer}`, 'error');
    }
}

function showMultiGameOver(data) {
    console.log('🏆 Multi Game Over');
    document.getElementById('game-screen').classList.add('hidden');
    const screen = document.getElementById('game-over-screen');
    screen.classList.remove('hidden');
    
    document.getElementById('game-over-title').textContent = 'Peli Päättyi!';
    
    const resultsDiv = document.querySelector('#game-over-screen .final-scores');
    resultsDiv.innerHTML = '<h3>Tulokset:</h3><ul style="list-style:none; padding:0;">';
    
    // Sort scores
    const sorted = data.scores.sort((a,b) => b.score - a.score);
    
    sorted.forEach((s, i) => {
        const isMe = s.playerId === gameState.myPlayerId;
        const name = s.playerId === gameState.myPlayerId ? 'Sinä' : 'Pelaaja ' + s.playerId.substring(0,4);
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : ''));
        
        resultsDiv.innerHTML += `
            <li style="padding:10px; background:rgba(255,255,255,0.1); margin:5px 0; border-radius:5px; ${isMe ? 'border:1px solid #6c5ce7;' : ''}">
                <span style="font-size:1.2rem; margin-right:10px;">${medal}</span>
                <span style="font-weight:bold;">${name}</span>
                <span style="float:right;">${s.score} p</span>
            </li>
        `;
    });
    
    resultsDiv.innerHTML += '</ul>';
    
    document.getElementById('question-selection').classList.add('hidden');
    document.getElementById('loser-message').classList.add('hidden');
}

// ==================== LOBBY & NAVIGATION FUNCTIONS (FIXED) ====================

    // Updated Handlers for Lobby
    const startGameBtn = document.getElementById('start-game-btn');
    const leaveLobbyBtn = document.getElementById('leave-lobby-btn');

    if (startGameBtn) {
        startGameBtn.addEventListener('click', () => {
             console.log('👑 Host starting game...', gameState.mode);
             
             // Check mode to call correct socket event
             if (gameState.gameMode === 'round' || gameState.gameMode === 'choice') {
                 // Multiplayer (new logic)
                 socket.emit('start_multi_game', { gameId: gameState.gameId });
             } else {
                 // 1v1 or Single Player (classic logic)
                 socket.emit('start_game');
             }
        });
    }

    if (leaveLobbyBtn) {
        leaveLobbyBtn.addEventListener('click', () => {
             if(confirm('Haluatko varmasti poistua aulasta?')) {
                 console.log('👋 Leaving lobby...');
                 
                 // Mode-aware leave
                 if (gameState.mode === 'multi' || gameState.gameMode === 'round' || gameState.gameMode === 'choice') {
                     socket.emit('leave_multi_game', { gameId: gameState.gameId });
                 } else {
                     socket.emit('leave_game', { gameId: gameState.gameId });
                 }
                 
                 // Reset UI locally
                 document.getElementById('game-lobby-screen').classList.add('hidden');
                 document.getElementById('lobby-screen').classList.remove('hidden');
                 document.body.classList.remove('game-active');
             }
        });
    }

function showLobbyScreen(gameId, isHost) {
    console.log(`Showing Lobby: ${gameId}, Host: ${isHost}`);
    
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    
    // Show Lobby
    const lobby = document.getElementById('game-lobby-screen');
    if (lobby) lobby.classList.remove('hidden');
    
    // Update Info
    const codeEl = document.getElementById('lobby-room-code');
    if (codeEl) codeEl.textContent = gameId;
    
    // Controls
    const hostControls = document.getElementById('host-controls');
    const guestControls = document.getElementById('guest-controls');
    // Note: ensure startBtn is re-queried or valid if declared globally
    
    if (isHost) {
        if (hostControls) hostControls.classList.remove('hidden');
        if (guestControls) guestControls.classList.add('hidden');
        if (startGameBtn) startGameBtn.disabled = true; // Wait for players
    } else {
        if (hostControls) hostControls.classList.add('hidden');
        if (guestControls) guestControls.classList.remove('hidden');
    }
    
    // Reset/Clear lists
    const pList = document.getElementById('lobby-player-list');
    if (pList) pList.innerHTML = '<div class="waiting-spinner"></div>';
    
    // Try to request latest state if missing?
    socket.emit('get_multi_game_state', { gameId: gameId });
}

function updateLobbyUI(state) {
    console.log('🔄 updateLobbyUI:', state); // Added Debug log
    // Check IDs from index.html: lobby-player-list, lobby-player-count
    const list = document.getElementById('lobby-player-list');
    const count = document.getElementById('lobby-player-count');
    const max = document.getElementById('lobby-max-players');
    
    // Safety check for players array
    const players = state.players || [];
    console.log(`👥 Players in state: ${players.length}`, players); // Added Debug log
    
    if (list) {
        list.innerHTML = '';
        players.forEach(p => {
             const div = document.createElement('div');
             div.className = 'player-item glass-panel';
             div.style.padding = '10px';
             div.style.marginBottom = '5px';
             div.style.display = 'flex';
             div.style.justifyContent = 'space-between';
             div.style.alignItems = 'center';
             
             // Check if me
             const isMe = p.id === gameState.myPlayerId;
             if (isMe) div.style.border = '1px solid #00b894';
             
             div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:1.5rem;">${p.isHost ? '👑' : '👤'}</span>
                    <span style="font-weight:bold;">${p.name}</span>
                </div>
                <div class="score-badge">${p.score}</div>
             `;
             list.appendChild(div);
        });
    }

    if (count) count.textContent = players.length;
    // Fix: Check both settings.maxPlayers and root maxPlayers
    const maxPlayers = (state.settings && state.settings.maxPlayers) ? state.settings.maxPlayers : (state.maxPlayers || '?');
    if (max) max.textContent = maxPlayers;
    
    // Host Logic
    const startBtn = document.getElementById('start-game-btn');
    const msg = document.getElementById('lobby-status-msg');
    
    if (startBtn) {
        if (players.length >= 2) {
            startBtn.disabled = false;
            if (msg) msg.textContent = 'Valmiina aloitukseen!';
        } else {
            startBtn.disabled = true;
            if (msg) msg.textContent = 'Odotetaan lisää pelaajia...';
        }
    }
    
    // Verify Deck Rendering for "My Deck"
     const deckPreview = document.getElementById('lobby-my-deck-preview');
     if(deckPreview && state.players) {
          const me = players.find(p => p.id === gameState.myPlayerId);
          if (me && me.deckSize > 0) {
                deckPreview.innerHTML = `<p style="text-align:center;">Valittuna ${me.deckSize} korttia</p>`;
                // Ideally we show cards if available in data, but usually 'state' only has summaries.
                // We rely on 'renderMultiHand' for full deck which comes separately.
          } else {
               deckPreview.innerHTML = '<p style="text-align:center; opacity:0.5;">Ei pakkaa valittu</p>';
          }
     }
}

function startGameFromLobby(state) {
     console.log('Starting game from lobby...');
     document.getElementById('game-lobby-screen').classList.add('hidden');
     document.getElementById('game-screen').classList.remove('hidden');
     document.body.classList.add('game-active');
     
     // Update game UI initially
     updateMultiGameUI(state);
}

// Re-implement updateMultiLobbyUI to redirect to updateLobbyUI
function updateMultiLobbyUI(state) {
    updateLobbyUI(state);
}

function renderMultiHand(deck) {
    // Check where to render
    const lobbyPreview = document.getElementById('lobby-my-deck-preview');
    const gameDeckArea = document.getElementById('deck-cards'); // Reuse single player deck area?
    
    // If we are in lobby (game-lobby-screen not hidden)
    const lobby = document.getElementById('game-lobby-screen');
    const inLobby = !lobby.classList.contains('hidden');
    
    const target = inLobby ? lobbyPreview : gameDeckArea;
    
    if (!target) return;
    target.innerHTML = '';
    
    const cards = deck.hand || deck; // Handle both formats
    
    cards.forEach(card => {
         const div = document.createElement('div');
         
         if (inLobby) {
             // Mini preview style
             div.className = 'mini-card';
             div.style.background = '#2d3436';
             div.style.padding = '5px';
             div.style.margin = '2px';
             div.style.fontSize = '0.7em';
             div.textContent = card.question.substring(0, 20) + '...';
         } else {
             // Game style (reuse card-btn class)
             div.className = 'card-btn category-' + (card.category||'yleistieto').toLowerCase();
             div.textContent = card.question;
             div.onclick = () => {
                 if (confirm(`Kysy: "${card.question}"?`)) {
                     socket.emit('play_card_multi', { questionId: card.id });
                 }
             };
         }
         target.appendChild(div);
    });
}

// Logo Rotation Feature
(function() {
    const title = document.getElementById('game-title');
    if (!title) return;

    const styles = ['logo-style-1', 'logo-style-6', 'logo-style-10'];
    let currentStyle = '';

    function rotateLogo() {
        // Remove current style
        if (currentStyle) {
            title.classList.remove(currentStyle);
        }

        // Pick a new random style (different from current if possible, but random as requested)
        // User said "randomisti", so true random is fine.
        const randomIndex = Math.floor(Math.random() * styles.length);
        currentStyle = styles[randomIndex];
        
        // Apply new style
        title.classList.add(currentStyle);
        
        console.log('🔄 Logo rotated to:', currentStyle);
    }

    // Initial call
    rotateLogo();

    // Set interval (5 seconds)
    setInterval(rotateLogo, 5000);
})();

