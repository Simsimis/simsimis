
// ==========================================
// INFINITE MODE
// ==========================================

// Infinite Mode Vars
let infiniteBoard = new Map();      // "x,y" -> cell value (-1=mine, 0-8=number)
let infiniteRevealed = new Map();   // "x,y" -> boolean
let infiniteFlagged = new Map();    // "x,y" -> boolean
let infiniteStats = { revealed: 0, flags: 0 };
window.infiniteSeed = 12345; // Explicit global for sharing with classic.js
let waypoint = { x: 0, y: 0 };
let mouseWorldX = 0;
let mouseWorldY = 0;
let infiniteAllowed = new Map();
const ALLOWED_RADIUS = 4;
let infiniteTimerInterval = null;
let infiniteTimeRemaining = 0;
let infiniteDeadZones = [];

// ========== LUCKBOX SYSTEM ==========
let luckboxes = new Map(); // "x,y" -> {type, opened}
let activePowerUps = {
    safeZone: { active: false, expiry: 0, radius: 5 },
    numberVision: { active: false, expiry: 0 },
    bombVision: { active: false, expiry: 0 },
    groundHealing: { active: false, expiry: 0 }
};
const LUCKBOX_SPAWN_CHANCE = 1.0; // 0.2% chance per cell reveal
const LUCKBOX_MIN_DISTANCE = 25; // Minimum distance between luckboxes
const POWER_UP_DURATION = 30000; // 30 seconds
const LUCKBOX_TYPES = ['safeZone', 'numberVision', 'bombVision', 'groundHealing'];

// ========== MULTIPLAYER STATE ==========
let multiplayerEnabled = false;
let wsConnection = null;
let localPlayerId = null;
let localPlayerColor = '#00FFFF';
let localPlayerUsername = '';
let localSpawnX = 0;
let localSpawnY = 0;
let otherPlayers = new Map(); // playerId -> {username, color, spawnX, spawnY, cursorX, cursorY}
let otherPlayersAllowed = new Map(); // playerId -> Map of "x,y" -> true (their territories)
let otherPlayersCells = new Map(); // "x,y" -> playerId (who owns this revealed cell)

// Canvas & Camera State
let canvas, ctx;
let cameraX = 0, cameraY = 0; // World pixels at top-left of screen
let zoomLevel = 1.0;
let isPanning = false;
let isDragging = false;
let lastMouseX, lastMouseY;
let animationFrameId;
const BASE_CELL_SIZE = 32;

function showInfiniteMode() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('infinite-screen').style.display = 'flex'; // Changed to flex (or block handled by CSS)
    // CSS sets #infinite-screen to fixed position covering screen. 
    // We just need to show it.

    window.dispatchEvent(new Event('resize'));
}

function exitInfiniteMode() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);
    const canvas = document.getElementById('infinite-canvas');
    if (canvas) canvas.style.filter = 'none';
    const modal = document.getElementById('infinite-game-over-modal');
    if (modal) modal.remove();

    showMenu(); // Defined in main.js/ui.js
}

function getInfiniteCell(x, y) {
    const key = `${x},${y}`;

    if (infiniteBoard.has(key)) {
        return infiniteBoard.get(key);
    }

    // Generate cell deterministically
    const hash = hashCoords(x, y);
    const rand = seededRandom(hash);

    // ~15% mine density
    if (rand < 0.15) {
        infiniteBoard.set(key, -1);
        return -1;
    }

    // Calculate adjacent mines
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            const neighborHash = hashCoords(nx, ny);
            const neighborRand = seededRandom(neighborHash);
            if (neighborRand < 0.15) count++;
        }
    }

    infiniteBoard.set(key, count);
    return count;
}

function initInfiniteGame() {
    // Show Setup Modal with Room Options
    const modal = document.createElement('div');
    modal.className = 'retry-container';
    modal.id = 'infinite-lobby-modal';
    modal.style.zIndex = '3000';
    modal.style.position = 'absolute';
    modal.style.top = '50%';
    modal.style.left = '50%';
    modal.style.transform = 'translate(-50%, -50%)';
    modal.innerHTML = `
        <div style="font-size: 1.5rem; font-weight: bold; color: #fff; margin-bottom: 20px;">
            <i class="fas fa-infinity"></i> Infinite Mode
        </div>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <button id="mode-solo-btn" class="retry-btn" style="flex: 1; background: #3498db;" onclick="selectInfiniteMode('solo')">
                <i class="fas fa-user"></i> Solo
            </button>
            <button id="mode-multi-btn" class="retry-btn" style="flex: 1; background: #555;" onclick="selectInfiniteMode('multi')">
                <i class="fas fa-users"></i> Multiplayer
            </button>
        </div>
        
        <!-- Solo Options -->
        <div id="solo-options" style="margin-bottom: 15px;">
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button id="solo-new-btn" class="retry-btn" style="flex: 1; background: #2980b9; font-size: 1rem; padding: 10px;" onclick="switchSoloTab('new')">New World</button>
                <button id="solo-load-btn" class="retry-btn" style="flex: 1; background: #555; font-size: 1rem; padding: 10px;" onclick="switchSoloTab('load')">Load World</button>
            </div>

            <!-- NEW WORLD TAB -->
            <div id="solo-new-tab">
                <div style="margin-bottom: 15px; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 0;">
                    <label style="display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; margin-bottom: 10px;">
                        <input type="checkbox" id="infinite-endless-check" style="width: 20px; height: 20px;" onchange="toggleEndlessMode(this.checked)">
                        <span style="font-size: 1.2rem;">Endless Mode (No Timer)</span>
                    </label>
                    
                    <div id="timer-config-section">
                        <input type="number" id="infinite-timer-input" value="5" min="1" max="60" 
                               style="font-size: 1.2rem; padding: 5px; width: 80px; text-align: center; border-radius: 0; border: none;">
                        <span style="color: #ccc;"> minutes</span>
                    </div>
                </div>
            </div>

            <!-- LOAD WORLD TAB -->
            <div id="solo-load-tab" style="display: none;">
                <div id="saved-games-list" style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 0; margin-bottom: 10px;">
                    <!-- Saves injected here -->
                </div>
            </div>
        </div>

        
        <!-- Multiplayer Options (Hidden by default) -->
        <div id="multi-options" style="display: none; margin-bottom: 15px;">
            <input type="text" id="username-input" placeholder="Enter Username" maxlength="15" 
                   style="font-size: 1rem; padding: 10px; width: 100%; text-align: center; border-radius: 0; border: none; margin-bottom: 15px; box-sizing: border-box;">
            
            <!-- Create or Join Room Toggle -->
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button id="room-create-btn" class="retry-btn" style="flex: 1; background: #27ae60;" onclick="selectRoomAction('create')">
                    <i class="fas fa-plus-circle"></i> Create Room
                </button>
                <button id="room-join-btn" class="retry-btn" style="flex: 1; background: #555;" onclick="selectRoomAction('join')">
                    <i class="fas fa-sign-in-alt"></i> Join Room
                </button>
            </div>

            
            <!-- Create Room Settings -->
            <div id="create-room-options" style="background: rgba(0,0,0,0.2); padding: 15px; border-radius: 0; margin-bottom: 10px;">
                <div style="display: flex; gap: 20px; justify-content: center;">
                    <div>
                        <label style="color: #aaa; font-size: 0.9rem;">Timer</label><br>
                        <input type="number" id="room-timer-input" value="5" min="1" max="60" 
                               style="font-size: 1rem; padding: 5px; width: 60px; text-align: center; border-radius: 0; border: none;">
                        <span style="color: #888; font-size: 0.9rem;">min</span>
                    </div>
                    <div>
                        <label style="color: #aaa; font-size: 0.9rem;">Max Players</label><br>
                        <input type="number" id="room-max-players-input" value="4" min="2" max="8" 
                               style="font-size: 1rem; padding: 5px; width: 60px; text-align: center; border-radius: 0; border: none;">
                    </div>
                </div>
            </div>
            
            <!-- Join Room Code Input -->
            <div id="join-room-options" style="display: none; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 0; margin-bottom: 10px;">
                <label style="color: #aaa; font-size: 0.9rem;">Room Code</label><br>
                <input type="text" id="room-code-input" placeholder="ABCD12" maxlength="6" 
                       style="font-size: 1.5rem; padding: 10px; width: 150px; text-align: center; border-radius: 0; border: none; text-transform: uppercase; letter-spacing: 3px;">
            </div>
        </div>
        
        <div id="room-error" style="color: #e74c3c; margin-bottom: 10px; display: none;"></div>
        
        <div style="display: flex; gap: 10px;">
            <button id="start-btn" class="retry-btn" onclick="startInfiniteFromLobby()">
                <i class="fas fa-play"></i> Start
            </button>
            <button class="retry-btn" style="background: #95a5a6;" onclick="showMenu(); this.closest('.retry-container').remove();">
                Cancel
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

let selectedInfiniteMode = 'solo';
let selectedRoomAction = 'create';

function selectInfiniteMode(mode) {
    selectedInfiniteMode = mode;
    const soloBtn = document.getElementById('mode-solo-btn');
    const multiBtn = document.getElementById('mode-multi-btn');
    const soloOpts = document.getElementById('solo-options');
    const multiOpts = document.getElementById('multi-options');

    if (mode === 'solo') {
        soloBtn.style.background = '#3498db';
        multiBtn.style.background = '#555';
        soloOpts.style.display = 'block';
        multiOpts.style.display = 'none';
    } else {
        soloBtn.style.background = '#555';
        multiBtn.style.background = '#9b59b6';
        soloOpts.style.display = 'none';
        multiOpts.style.display = 'block';
    }
}

function selectRoomAction(action) {
    selectedRoomAction = action;
    const createBtn = document.getElementById('room-create-btn');
    const joinBtn = document.getElementById('room-join-btn');
    const createOpts = document.getElementById('create-room-options');
    const joinOpts = document.getElementById('join-room-options');
    const startBtn = document.getElementById('start-btn');

    if (action === 'create') {
        createBtn.style.background = '#27ae60';
        joinBtn.style.background = '#555';
        createOpts.style.display = 'block';
        joinOpts.style.display = 'none';
        startBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Create Room';
    } else {
        createBtn.style.background = '#555';
        joinBtn.style.background = '#3498db';
        createOpts.style.display = 'none';
        joinOpts.style.display = 'block';
        startBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Join Room';
    }
}

// Track room code for display
let currentRoomCode = '';
let isHost = false;
window.isInfiniteEndlessMode = false;

function switchSoloTab(tab) {
    const newBtn = document.getElementById('solo-new-btn');
    const loadBtn = document.getElementById('solo-load-btn');
    const newTab = document.getElementById('solo-new-tab');
    const loadTab = document.getElementById('solo-load-tab');
    const startBtn = document.getElementById('start-btn');

    if (tab === 'new') {
        newBtn.style.background = '#2980b9';
        loadBtn.style.background = '#555';
        newTab.style.display = 'block';
        loadTab.style.display = 'none';
        startBtn.style.display = 'flex'; // Show start button
    } else {
        newBtn.style.background = '#555';
        loadBtn.style.background = '#2980b9';
        newTab.style.display = 'none';
        loadTab.style.display = 'block';
        startBtn.style.display = 'none'; // Hide main start button (load has its own play buttons)
        renderSavedGamesList();
    }
}

function toggleEndlessMode(checked) {
    window.isInfiniteEndlessMode = checked;
    const timerSec = document.getElementById('timer-config-section');
    if (timerSec) {
        timerSec.style.opacity = checked ? '0.3' : '1';
        timerSec.style.pointerEvents = checked ? 'none' : 'auto';
    }
}

function startInfiniteFromLobby() {
    const modal = document.getElementById('infinite-lobby-modal');

    // Check if we are in solo-load tab
    const loadTab = document.getElementById('solo-load-tab');
    if (selectedInfiniteMode === 'solo' && loadTab && loadTab.style.display !== 'none') {
        // We are in load tab, but main start button is hidden anyway.
        // If somehow clicked, do nothing
        return;
    }

    const timerInput = document.getElementById('infinite-timer-input');
    const mins = parseFloat(timerInput?.value) || 5;

    if (selectedInfiniteMode === 'multi') {
        const usernameInput = document.getElementById('username-input');
        localPlayerUsername = usernameInput?.value.trim() || 'Player';
        multiplayerEnabled = true;

        if (selectedRoomAction === 'create') {
            // Create room with settings
            const roomTimerInput = document.getElementById('room-timer-input');
            const maxPlayersInput = document.getElementById('room-max-players-input');
            const roomTimer = parseFloat(roomTimerInput?.value) || 5;
            const maxPlayers = parseInt(maxPlayersInput?.value) || 4;

            connectToMultiplayerServer('create', null, roomTimer * 60, maxPlayers);
        } else {
            // Join existing room
            const roomCodeInput = document.getElementById('room-code-input');
            const roomCode = roomCodeInput?.value.trim().toUpperCase();

            if (!roomCode || roomCode.length < 4) {
                showRoomError('Please enter a valid room code');
                return;
            }

            connectToMultiplayerServer('join', roomCode);
        }
    } else {
        multiplayerEnabled = false;
        if (modal) modal.remove();
        launchInfiniteGame(mins);
    }
}
// Track room code for display

function showRoomError(message) {
    const errorDiv = document.getElementById('room-error');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }
}

function connectToMultiplayerServer(action, roomCode, timerDuration, maxPlayers) {
    // Detect server URL (same host, port 8080)
    const wsUrl = `ws://${window.location.hostname || 'localhost'}:8080`;

    try {
        wsConnection = new WebSocket(wsUrl);
    } catch (e) {
        showRoomError('Could not connect to server');
        return;
    }

    wsConnection.onopen = () => {
        console.log('Connected to multiplayer server');

        if (action === 'create') {
            wsConnection.send(JSON.stringify({
                type: 'createRoom',
                username: localPlayerUsername,
                timerDuration: timerDuration,
                maxPlayers: maxPlayers
            }));
        } else {
            wsConnection.send(JSON.stringify({
                type: 'joinRoom',
                username: localPlayerUsername,
                roomCode: roomCode
            }));
        }
    };

    wsConnection.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
    };

    wsConnection.onerror = (e) => {
        console.error('WebSocket error:', e);
        showRoomError('Connection failed. Is the server running?');
    };

    wsConnection.onclose = () => {
        console.log('Disconnected from server');
        if (multiplayerEnabled) {
            multiplayerEnabled = false;
        }
    };
}

function handleServerMessage(msg) {
    switch (msg.type) {
        case 'roomJoined':
            // Successfully joined/created a room
            localPlayerId = msg.playerId;
            localPlayerColor = msg.color;
            localSpawnX = msg.spawnX;
            localSpawnY = msg.spawnY;
            window.infiniteSeed = msg.seed;
            currentRoomCode = msg.roomCode;
            isHost = (msg.hostId === msg.playerId);

            // Close setup modal
            const setupModal = document.getElementById('infinite-lobby-modal');
            if (setupModal) setupModal.remove();

            // Store other players
            msg.players.forEach(p => {
                if (p.id !== localPlayerId) {
                    otherPlayers.set(p.id, p);
                    otherPlayersAllowed.set(p.id, new Map());
                }
            });

            // Load existing cells
            msg.revealedCells.forEach(([key, playerId]) => {
                infiniteRevealed.set(key, true);
                otherPlayersCells.set(key, playerId);
                if (playerId !== localPlayerId) {
                    const [x, y] = key.split(',').map(Number);
                    expandOtherPlayerTerritory(playerId, x, y);
                }
            });

            // If lobby, show lobby UI. If playing, join immediately.
            if (msg.gameStatus === 'lobby') {
                showRoomLobby(msg);
            } else {
                // Show infinite screen first (fixes phone bug)
                showInfiniteMode();
                launchInfiniteGameMultiplayer(msg.timerDuration);
            }
            break;

        case 'error':
            showRoomError(msg.message);
            break;

        case 'lobbyUpdate':
            updateRoomLobby(msg);
            break;

        case 'hostChanged':
            isHost = (msg.newHostId === localPlayerId);
            // Update UI to show new host
            const startBtnLobby = document.getElementById('room-start-game-btn');
            if (startBtnLobby) {
                startBtnLobby.style.display = isHost ? 'block' : 'none';
            }
            break;

        case 'gameStart':
            window.infiniteSeed = msg.seed;
            const lobby = document.getElementById('mp-lobby-ui');
            if (lobby) lobby.remove();

            // IMPORTANT: Show the infinite screen first (fixes phone bug where game didn't show)
            showInfiniteMode();

            launchInfiniteGameMultiplayer(msg.duration);
            break;

        case 'playerJoined':
            otherPlayers.set(msg.player.id, msg.player);
            otherPlayersAllowed.set(msg.player.id, new Map());
            console.log(`${msg.player.username} joined!`);
            break;

        case 'playerLeft':
            otherPlayers.delete(msg.playerId);
            otherPlayersAllowed.delete(msg.playerId);
            break;

        case 'reveal':
            if (msg.playerId !== localPlayerId) {
                const key = `${msg.x},${msg.y}`;
                infiniteRevealed.set(key, true);
                otherPlayersCells.set(key, msg.playerId);
                expandOtherPlayerTerritory(msg.playerId, msg.x, msg.y);
            }
            break;

        case 'explosion':
            infiniteDeadZones.push({ x: msg.x, y: msg.y, r: msg.r });
            if (msg.playerId !== localPlayerId) {
                triggerExplosionEffect();
            }
            break;

        case 'timerTick':
            infiniteTimeRemaining = msg.remaining;
            updateInfiniteTimerDisplay();
            break;

        case 'gameEnd':
            // Show leaderboard
            showLeaderboard(msg.leaderboard);
            break;

        case 'restartCountdown':
            updateRestartCountdown(msg.seconds);
            break;

        case 'gameRestart':
            // New game starting!
            restartMultiplayerGame(msg.seed, msg.duration);
            break;

        case 'cursorMove':
            const player = otherPlayers.get(msg.playerId);
            if (player) {
                player.cursorX = msg.x;
                player.cursorY = msg.y;
            }
            break;
    }
}

function expandOtherPlayerTerritory(playerId, cx, cy) {
    const allowed = otherPlayersAllowed.get(playerId);
    if (!allowed) return;
    const r = ALLOWED_RADIUS;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r) {
                allowed.set(`${cx + dx},${cy + dy}`, true);
            }
        }
    }
}

function launchInfiniteGameMultiplayer(mins) {
    // Reset state but use spawn position
    infiniteBoard.clear();
    infiniteRevealed.clear();
    infiniteFlagged.clear();
    infiniteStats = { revealed: 0, flags: 0 };

    infiniteAllowed.clear();
    updateAllowed(localSpawnX, localSpawnY);
    infiniteDeadZones = [];

    // Reset luckboxes and power-ups
    luckboxes.clear();
    activePowerUps.safeZone = { active: false, expiry: 0, radius: 5 };
    activePowerUps.numberVision = { active: false, expiry: 0 };
    activePowerUps.bombVision = { active: false, expiry: 0 };
    activePowerUps.groundHealing = { active: false, expiry: 0 };

    waypoint.x = localSpawnX;
    waypoint.y = localSpawnY;

    // FORCE DISPLAY (Fixes mobile blackout)
    showInfiniteMode();
    const lobby = document.getElementById('mp-lobby-ui');
    if (lobby) lobby.remove();

    // Setup Canvas
    canvas = document.getElementById('infinite-canvas');
    ctx = canvas.getContext('2d', { alpha: false });

    // DELAY RESIZE (Fixes mobile 0-size canvas bug)
    setTimeout(() => {
        resizeCanvas();
        // Center on spawn
        const cs = BASE_CELL_SIZE * zoomLevel;
        cameraX = (localSpawnX * cs) - (canvas.width / 2);
        cameraY = (localSpawnY * cs) - (canvas.height / 2);
    }, 100);

    window.addEventListener('resize', resizeCanvas);
    zoomLevel = 1.0;

    setupCanvasControls();

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderLoop();

    updateInfiniteStats();

    // Tell server to start timer (first player only does this)
    if (otherPlayers.size === 0) {
        wsConnection.send(JSON.stringify({ type: 'startTimer', duration: mins * 60 }));
    }
    startInfiniteTimer(mins);
}

// function loadInfiniteGame... (removed accidental duplicate)

function launchInfiniteGame(mins) {
    // Reset state
    currentSaveId = null; // New game = no save ID yet
    infiniteBoard.clear();
    infiniteRevealed.clear();
    infiniteBoard.clear();
    infiniteRevealed.clear();
    infiniteFlagged.clear();
    infiniteStats = { revealed: 0, flags: 0 };
    infiniteSeed = Date.now();

    infiniteStats = { revealed: 0, flags: 0 };
    infiniteSeed = Date.now();

    infiniteAllowed.clear();
    updateAllowed(0, 0); // Initial area around start
    infiniteDeadZones = [];

    // Reset luckboxes and power-ups
    luckboxes.clear();
    activePowerUps.safeZone = { active: false, expiry: 0, radius: 5 };
    activePowerUps.numberVision = { active: false, expiry: 0 };
    activePowerUps.bombVision = { active: false, expiry: 0 };
    activePowerUps.groundHealing = { active: false, expiry: 0 };

    // Start Waypoint at center (0,0) so it's visible
    waypoint.x = 0;
    waypoint.y = 0;

    // FORCE DISPLAY (Mobile fix)
    showInfiniteMode();
    const lobby = document.getElementById('mp-lobby-ui');
    if (lobby) lobby.remove();

    // Setup Canvas
    canvas = document.getElementById('infinite-canvas');
    ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency

    // DELAY RESIZE (Mobile fix)
    setTimeout(() => {
        resizeCanvas();
        // Center camera initially (0,0 is at center of screen)
        if (canvas) {
            cameraX = -(canvas.width / 2);
            cameraY = -(canvas.height / 2);
        }
    }, 100);

    window.addEventListener('resize', resizeCanvas);
    zoomLevel = 1.0;

    // Setup Controls
    setupCanvasControls();

    // Start Render Loop
    // Start Render Loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderLoop();

    updateInfiniteStats();

    if (window.isInfiniteEndlessMode) {
        if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);
        const timerDisp = document.getElementById('infinite-timer-display');
        if (timerDisp) {
            timerDisp.textContent = 'ENDLESS';
            timerDisp.style.color = '#3498db';
        }
    } else {
        startInfiniteTimer(mins);
    }
}

function resizeCanvas() {
    if (canvas) {
        // Parent is infinite-viewport which is full screen in new CSS
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        renderInfiniteCanvas();
    }
}

function renderLoop() {
    renderInfiniteCanvas();
    updatePowerUps();
    updatePowerUpHUD();
    animationFrameId = requestAnimationFrame(renderLoop);
}

function renderInfiniteCanvas() {
    if (!canvas || !ctx) return;

    const cellSize = BASE_CELL_SIZE * zoomLevel;

    // Clear background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Helper: Check if point is in any dead zone
    const isInDeadZone = (nx, ny) => {
        for (const zone of infiniteDeadZones) {
            if ((nx - zone.x) ** 2 + (ny - zone.y) ** 2 <= zone.r ** 2) return true;
        }
        return false;
    };

    // Helper: Get owner of a cell (Priority: Local > Others)
    const getOwner = (cx, cy) => {
        const k = `${cx},${cy}`;
        if (infiniteAllowed.get(k)) return localPlayerId;
        if (multiplayerEnabled) {
            for (const [pid, map] of otherPlayersAllowed) {
                if (map.has(k)) return pid;
            }
        }
        return null;
    };

    // Determine visible grid range
    const startCol = Math.floor(cameraX / cellSize);
    const endCol = Math.floor((cameraX + canvas.width) / cellSize) + 1;
    const startRow = Math.floor(cameraY / cellSize);
    const endRow = Math.floor((cameraY + canvas.height) / cellSize) + 1;

    // Draw visible cells
    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const x = c * cellSize - cameraX;
            const y = r * cellSize - cameraY;

            const key = `${c},${r}`;
            const isRevealed = infiniteRevealed.get(key);
            const isFlagged = infiniteFlagged.get(key);
            const isAllowed = infiniteAllowed.get(key);

            // Draw Cell Background
            // First check if in dead zone
            let isInDeadZoneCell = false;
            for (const zone of infiniteDeadZones) {
                if ((c - zone.x) ** 2 + (r - zone.y) ** 2 <= zone.r ** 2) {
                    isInDeadZoneCell = true;
                    break;
                }
            }

            if (isInDeadZoneCell) {
                // Dead zone - pure dark red (no blue)
                ctx.fillStyle = isRevealed ? '#1a0808' : '#2a1010'; // Pure dark red
            } else if (!isAllowed) {
                // Out of Bounds
                ctx.fillStyle = '#0f0f1a'; // Very dark
            } else if (isRevealed) {
                ctx.fillStyle = '#2a2a4a'; // Revealed dark
            } else {
                // Constant color (No checkerboard)
                ctx.fillStyle = '#4a4a6a';
            }

            // Gap (scaled)
            const gap = Math.max(1, 2 * zoomLevel);
            ctx.fillRect(x, y, cellSize - gap, cellSize - gap);

            // Determine Owner for Border Rendering
            const ownerId = getOwner(c, r);

            if (ownerId) {
                // Check if current cell is in dead zone (shouldn't have border if inside dead zone, technically infiniteAllowed handles this but let's be safe visually)
                let cellInDeadZone = false;
                for (const zone of infiniteDeadZones) {
                    if ((c - zone.x) ** 2 + (r - zone.y) ** 2 <= zone.r ** 2) {
                        cellInDeadZone = true;
                        break;
                    }
                }

                if (!cellInDeadZone) {
                    const isLocal = (ownerId === localPlayerId);
                    ctx.lineWidth = 2 * zoomLevel;
                    ctx.strokeStyle = isLocal ? (multiplayerEnabled ? localPlayerColor : '#00FFFF') : (otherPlayers.get(ownerId)?.color || '#FFF');

                    // Check neighbors using Priority Logic
                    // Draw border if:
                    // 1. Neighbor is in Dead Zone OR
                    // 2. Neighbor is Empty OR
                    // 3. Neighbor is Owned by someone with LOWER priority (ID comparison)
                    // This ensures only ONE player draws the shared border (the one with higher ID string)
                    const checkBound = (dx, dy) => {
                        const nx = c + dx;
                        const ny = r + dy;

                        // Always border against dead zones
                        if (isInDeadZone(nx, ny)) return true;

                        const neighborId = getOwner(nx, ny);

                        // Wall against empty space
                        if (!neighborId) return true;

                        // No wall between same owner
                        if (neighborId === ownerId) return false;

                        // Shared Wall Priority: Higher ID draws the wall
                        // This prevents double-drawing and mixed colors
                        return ownerId > neighborId;
                    };

                    if (checkBound(0, -1)) { // Top
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cellSize - gap, y); ctx.stroke();
                    }
                    if (checkBound(0, 1)) { // Bottom
                        ctx.beginPath(); ctx.moveTo(x, y + cellSize - gap); ctx.lineTo(x + cellSize - gap, y + cellSize - gap); ctx.stroke();
                    }
                    if (checkBound(-1, 0)) { // Left
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize - gap); ctx.stroke();
                    }
                    if (checkBound(1, 0)) { // Right
                        ctx.beginPath(); ctx.moveTo(x + cellSize - gap, y); ctx.lineTo(x + cellSize - gap, y + cellSize - gap); ctx.stroke();
                    }
                }
            }



            // Draw Waypoint
            if (c === waypoint.x && r === waypoint.y) {
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(x + cellSize / 2, y + cellSize / 2, (cellSize / 4), 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw Luckbox
            const luckboxKey = `${c},${r}`;
            const luckbox = luckboxes.get(luckboxKey);
            if (luckbox && !luckbox.opened) {
                const lbX = x + cellSize / 2;
                const lbY = y + cellSize / 2;
                const lbSize = cellSize * 0.6;

                // Glowing effect
                const glowSize = lbSize + Math.sin(Date.now() / 200) * 3;
                const gradient = ctx.createRadialGradient(lbX, lbY, 0, lbX, lbY, glowSize);
                gradient.addColorStop(0, 'rgba(255, 215, 0, 1)');
                gradient.addColorStop(0.5, 'rgba(255, 165, 0, 0.5)');
                gradient.addColorStop(1, 'rgba(255, 165, 0, 0)');

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(lbX, lbY, glowSize, 0, Math.PI * 2);
                ctx.fill();

                // Box
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(x + (cellSize - lbSize) / 2, y + (cellSize - lbSize) / 2, lbSize, lbSize);

                // Question mark
                if (zoomLevel > 0.4) {
                    ctx.fillStyle = '#8B4513';
                    ctx.font = `${10 * zoomLevel}px 'Press Start 2P'`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('?', lbX, lbY);
                }
            }

            // Draw Content (skip if in dead zone)
            let inDeadZone = false;
            for (const zone of infiniteDeadZones) {
                if ((c - zone.x) ** 2 + (r - zone.y) ** 2 <= zone.r ** 2) {
                    inDeadZone = true;
                    break;
                }
            }

            let inNumberVisionRange = false;
            if (activePowerUps.numberVision.active) {
                if (Math.abs(c - mouseWorldX) <= 1 && Math.abs(r - mouseWorldY) <= 1) {
                    inNumberVisionRange = true;
                }
            }

            if (isRevealed || inNumberVisionRange || (activePowerUps.bombVision.active && getInfiniteCell(c, r) === -1)) {
                const val = getInfiniteCell(c, r);

                // Check if protected by safe zone (show shield icon)
                if (isCellProtectedBySafeZone(c, r) && !isRevealed && zoomLevel > 0.4) {
                    ctx.font = `${10 * zoomLevel}px 'Press Start 2P'`;
                    ctx.fillStyle = 'rgba(46, 204, 113, 0.7)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🛡️', x + cellSize / 2, y + cellSize / 4);
                }

                if (val === -1 && (isRevealed || activePowerUps.bombVision.active || inNumberVisionRange)) {
                    // Show mines (revealed or with bomb vision)
                    if (isRevealed) {
                        ctx.fillStyle = '#9b59b6'; // Mine bg
                        ctx.fillRect(x, y, cellSize - gap, cellSize - gap);
                    }

                    // Don't draw text if too zoomed out
                    if (zoomLevel > 0.4) {
                        ctx.font = `${14 * zoomLevel}px 'Press Start 2P'`;
                        ctx.fillStyle = isRevealed ? '#fff' : 'rgba(231, 76, 60, 0.8)';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('💣', x + cellSize / 2, y + cellSize / 2 + (2 * zoomLevel));
                    }
                } else if (!inDeadZone && val > 0 && (isRevealed || inNumberVisionRange)) {
                    if (zoomLevel > 0.4) {
                        ctx.font = `${14 * zoomLevel}px 'Press Start 2P'`;
                        const colors = ['#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1', '#95a5a6'];
                        ctx.fillStyle = isRevealed ? colors[val - 1] || '#fff' : 'rgba(100, 149, 237, 0.8)';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(val, x + cellSize / 2, y + cellSize / 2);
                    }
                }
            } else if (!inDeadZone && isFlagged) {
                if (zoomLevel > 0.4) {
                    ctx.font = `${14 * zoomLevel}px 'Press Start 2P'`;
                    ctx.fillStyle = '#e74c3c';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('🚩', x + cellSize / 2, y + cellSize / 2 + (2 * zoomLevel));
                }
            }
        }
    }

    const cx = Math.floor((cameraX + canvas.width / 2) / cellSize);
    const cy = Math.floor((cameraY + canvas.height / 2) / cellSize);

    // Draw Dead Zone Outlines (per-cell, grid-aligned)
    for (const zone of infiniteDeadZones) {
        const r2 = zone.r * zone.r;

        // Check visible cells for dead zone membership
        for (let dr = -zone.r - 1; dr <= zone.r + 1; dr++) {
            for (let dc = -zone.r - 1; dc <= zone.r + 1; dc++) {
                const cellR = zone.y + dr;
                const cellC = zone.x + dc;
                const inZone = (dc * dc + dr * dr) <= r2;

                if (inZone) {
                    const x = cellC * cellSize - cameraX;
                    const y = cellR * cellSize - cameraY;
                    const gap = Math.max(1, 2 * zoomLevel);

                    // Dead cells are already drawn dark bordeaux in main loop
                    // Just draw the boundary edges here

                    // Check neighbors for boundary edges
                    // Only draw line if neighbor is OUTSIDE ALL dead zones (merge overlapping zones)
                    ctx.lineWidth = 2 * zoomLevel;
                    ctx.strokeStyle = '#FF0000'; // Red

                    // Helper: check if a world coordinate is in ANY dead zone
                    const isNeighborInAnyDeadZone = (worldX, worldY) => {
                        for (const z of infiniteDeadZones) {
                            if ((worldX - z.x) ** 2 + (worldY - z.y) ** 2 <= z.r ** 2) return true;
                        }
                        return false;
                    };

                    if (!isNeighborInAnyDeadZone(cellC, cellR - 1)) { // Top neighbor
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + cellSize - gap, y); ctx.stroke();
                    }
                    if (!isNeighborInAnyDeadZone(cellC, cellR + 1)) { // Bottom neighbor
                        ctx.beginPath(); ctx.moveTo(x, y + cellSize - gap); ctx.lineTo(x + cellSize - gap, y + cellSize - gap); ctx.stroke();
                    }
                    if (!isNeighborInAnyDeadZone(cellC - 1, cellR)) { // Left neighbor
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + cellSize - gap); ctx.stroke();
                    }
                    if (!isNeighborInAnyDeadZone(cellC + 1, cellR)) { // Right neighbor
                        ctx.beginPath(); ctx.moveTo(x + cellSize - gap, y); ctx.lineTo(x + cellSize - gap, y + cellSize - gap); ctx.stroke();
                    }
                }
            }
        }
    }

    if (document.getElementById('infinite-pos')) {
        document.getElementById('infinite-pos').textContent = `${cx}, ${cy}`;
    }

    // Render Safe Zone visual effect
    if (activePowerUps.safeZone.active) {
        const now = Date.now();
        const pulse = Math.sin(now / 200) * 0.1 + 0.9; // Pulsing effect
        ctx.strokeStyle = `rgba(46, 204, 113, ${0.3 * pulse})`;
        ctx.lineWidth = 3;

        // Draw safe zones around each revealed cell
        for (const [key, _] of infiniteRevealed) {
            const [rx, ry] = key.split(',').map(Number);
            const radius = activePowerUps.safeZone.radius;
            const sx = rx * cellSize - cameraX + cellSize / 2;
            const sy = ry * cellSize - cameraY + cellSize / 2;
            const sr = radius * cellSize;

            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    // Render Other Players' Cursors
    if (multiplayerEnabled) {
        ctx.font = `${10 / zoomLevel}px 'Press Start 2P'`;
        ctx.textAlign = 'center';

        for (const [pid, p] of otherPlayers) {
            if (p.cursorX !== undefined && p.cursorY !== undefined) {
                const px = p.cursorX * cellSize - cameraX;
                const py = p.cursorY * cellSize - cameraY;

                // Cursor Icon
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(px + 15, py + 5);
                ctx.lineTo(px + 5, py + 15);
                ctx.fill();

                // Name Tag
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeText(p.username, px + 10, py - 10);
                ctx.fillText(p.username, px + 10, py - 10);
            }
        }
    }
}

function setupCanvasControls() {
    if (!canvas) return;

    // Mouse / Drag
    canvas.onmousedown = (e) => {
        if (e.button === 0) { // Left click: Pan or Click
            isPanning = true;
            isDragging = false;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    };

    window.onmouseup = (e) => {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'grab';
            if (!isDragging && e.target === canvas) {
                handleCanvasClick(e.clientX, e.clientY, false);
            }
        }
    };

    window.onmousemove = (e) => {
        // Track mouse world pos
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const cs = BASE_CELL_SIZE * zoomLevel;
            mouseWorldX = Math.floor((cameraX + mx) / cs);
            mouseWorldY = Math.floor((cameraY + my) / cs);
        }

        if (isPanning) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) isDragging = true;
            if (isDragging) {
                cameraX -= dx;
                cameraY -= dy;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        }
    };

    // Zoom (Wheel)
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        const zoomSpeed = 0.1;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 1. Calculate world point under mouse BEFORE zoom
        const oldCellSize = BASE_CELL_SIZE * zoomLevel;
        const worldX = (cameraX + mouseX) / oldCellSize;
        const worldY = (cameraY + mouseY) / oldCellSize;

        // 2. Adjust zoom
        if (e.deltaY < 0) {
            zoomLevel = Math.min(zoomLevel + zoomSpeed, 3.0);
        } else {
            zoomLevel = Math.max(zoomLevel - zoomSpeed, 0.2);
        }

        // 3. Calculate new camera position so world point stays under mouse
        const newCellSize = BASE_CELL_SIZE * zoomLevel;
        cameraX = (worldX * newCellSize) - mouseX;
        cameraY = (worldY * newCellSize) - mouseY;

    }, { passive: false });

    // Right Click
    canvas.oncontextmenu = (e) => {
        e.preventDefault();
        handleCanvasClick(e.clientX, e.clientY, true);
    };

    // Keyboard (WASD)
    window.onkeydown = (e) => {
        if (document.getElementById('infinite-screen').style.display !== 'flex' &&
            getComputedStyle(document.getElementById('infinite-screen')).display === 'none') return;

        const speed = 15;
        if (e.key === 'w' || e.key === 'ArrowUp') cameraY -= speed;
        if (e.key === 's' || e.key === 'ArrowDown') cameraY += speed;
        if (e.key === 'a' || e.key === 'ArrowLeft') cameraX -= speed;
        if (e.key === 'd' || e.key === 'ArrowRight') cameraX += speed;

        // Waypoint Controls
        if (e.code === 'Space') { // Teleport to Waypoint
            const cs = BASE_CELL_SIZE * zoomLevel;
            cameraX = (waypoint.x * cs) - (canvas.width / 2) + (cs / 2);
            cameraY = (waypoint.y * cs) - (canvas.height / 2) + (cs / 2);
        }

        if (e.key.toLowerCase() === 'g') { // Move Waypoint to Mouse
            waypoint.x = mouseWorldX;
            waypoint.y = mouseWorldY;
            playSound('flag');
        }
    };

    // ========== TOUCH CONTROLS (Mobile) ==========
    let lastTouchX = 0, lastTouchY = 0;
    let lastPinchDist = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let touchStartX = 0, touchStartY = 0;
    let longPressTimer = null;
    let longPressFired = false;

    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchMoved = false;
        longPressFired = false;
        touchStartTime = Date.now();

        if (e.touches.length === 1) {
            // Single finger - pan
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            touchStartX = lastTouchX;
            touchStartY = lastTouchY;

            // Start long press timer for flagging
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                if (!touchMoved) {
                    longPressFired = true;
                    handleCanvasClick(touchStartX, touchStartY, true); // Flag
                    // Vibrate if available
                    if (navigator.vibrate) navigator.vibrate(50);
                }
            }, 400);
        } else if (e.touches.length === 2) {
            // Cancel long press on multi-touch
            clearTimeout(longPressTimer);
            // Two fingers - pinch zoom setup
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            // Center point for panning while zooming
            lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();

        const moveThreshold = 8; // Pixels before considered "moved"

        if (e.touches.length === 1) {
            // Direct pan - exactly like mouse
            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;

            const dx = currentX - lastTouchX;
            const dy = currentY - lastTouchY;

            // Check if moved enough to cancel tap/flag
            const totalDx = currentX - touchStartX;
            const totalDy = currentY - touchStartY;
            if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) {
                touchMoved = true;
                clearTimeout(longPressTimer);
            }

            // Apply pan directly
            cameraX -= dx;
            cameraY -= dy;

            lastTouchX = currentX;
            lastTouchY = currentY;
        } else if (e.touches.length === 2) {
            touchMoved = true;
            clearTimeout(longPressTimer);

            const rect = canvas.getBoundingClientRect();

            // Calculate new pinch distance
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const pinchDist = Math.sqrt(dx * dx + dy * dy);

            // Center point
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

            // Pan with two fingers
            const panDx = centerX - lastTouchX;
            const panDy = centerY - lastTouchY;
            cameraX -= panDx;
            cameraY -= panDy;

            // Smooth Zoom
            if (lastPinchDist > 0) {
                const rawZoomFactor = pinchDist / lastPinchDist;
                // Dampen zoom for smoothness (lerp towards target)
                const smoothZoomFactor = 1 + (rawZoomFactor - 1) * 0.6;

                const mouseX = centerX - rect.left;
                const mouseY = centerY - rect.top;

                // World point under center
                const oldCellSize = BASE_CELL_SIZE * zoomLevel;
                const worldX = (cameraX + mouseX) / oldCellSize;
                const worldY = (cameraY + mouseY) / oldCellSize;

                // Apply smooth zoom
                const newZoom = zoomLevel * smoothZoomFactor;
                zoomLevel = Math.min(Math.max(newZoom, 0.2), 3.0);

                // Keep world point under center
                const newCellSize = BASE_CELL_SIZE * zoomLevel;
                cameraX = (worldX * newCellSize) - mouseX;
                cameraY = (worldY * newCellSize) - mouseY;
            }

            lastPinchDist = pinchDist;
            lastTouchX = centerX;
            lastTouchY = centerY;
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        clearTimeout(longPressTimer);

        // Reset pinch distance to prevent snap on next gesture
        lastPinchDist = 0;

        // If still has 1 finger, update lastTouch to that finger to prevent jump
        if (e.touches.length === 1) {
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }

        // Only handle tap if ALL fingers lifted and no remaining touches
        if (e.touches.length === 0) {
            const touchDuration = Date.now() - touchStartTime;

            // Quick tap = reveal (only if not moved and long press didn't fire)
            if (!touchMoved && !longPressFired && touchDuration < 200) {
                handleCanvasClick(touchStartX, touchStartY, false);
            }
        }
    }, { passive: false });

    // Broadcast cursor move (throttled)
    if (multiplayerEnabled) {
        setInterval(() => {
            if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                wsConnection.send(JSON.stringify({
                    type: 'cursorMove',
                    x: mouseWorldX,
                    y: mouseWorldY
                }));
            }
        }, 100);
    }
}

function handleCanvasClick(clientX, clientY, isRightClick) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const cellSize = BASE_CELL_SIZE * zoomLevel;
    const worldX = Math.floor((cameraX + mouseX) / cellSize);
    const worldY = Math.floor((cameraY + mouseY) / cellSize);

    if (isRightClick) {
        handleInfiniteRightClick(worldX, worldY);
    } else {
        handleInfiniteClick(worldX, worldY);
    }
}

// Logic Functions
function handleInfiniteClick(x, y) {
    const key = `${x},${y}`;

    // Check if clicking on a luckbox
    const luckbox = luckboxes.get(key);
    if (luckbox && !luckbox.opened) {
        // Check if within allowed area or adjacent to revealed cell
        let canOpen = infiniteAllowed.get(key);
        if (!canOpen) {
            // Check adjacent cells
            for (let dx = -1; dx <= 1 && !canOpen; dx++) {
                for (let dy = -1; dy <= 1 && !canOpen; dy++) {
                    if (dx === 0 && dy === 0) continue;
                    const nkey = `${x + dx},${y + dy}`;
                    if (infiniteAllowed.get(nkey) || infiniteRevealed.get(nkey)) {
                        canOpen = true;
                    }
                }
            }
        }

        if (canOpen) {
            openLuckbox(x, y);
            return;
        }
    }

    // Check bounds
    if (!infiniteAllowed.get(key)) return;

    // Check Dead Zones
    for (const zone of infiniteDeadZones) {
        if ((x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.r ** 2) return;
    }

    // If flagged, do nothing
    if (infiniteFlagged.get(key)) return;

    // If already revealed, try Chording
    if (infiniteRevealed.get(key)) {
        const val = getInfiniteCell(x, y);
        if (val > 0) {
            chordInfinite(x, y, val);
        }
        return;
    }

    revealInfiniteCell(x, y);
    updateInfiniteStats();
}

function chordInfinite(x, y, value) {
    let flagCount = 0;
    // Count flags
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const nkey = `${x + dx},${y + dy}`;
            if (infiniteFlagged.get(nkey)) flagCount++;
        }
    }

    // If flags match number, reveal neighbors
    if (flagCount === value) {
        let changed = false;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                const nkey = `${nx},${ny}`;

                if (!infiniteRevealed.get(nkey) && !infiniteFlagged.get(nkey)) {
                    revealInfiniteCell(nx, ny);
                    changed = true;
                }
            }
        }
        if (changed) updateInfiniteStats();
    }
}

function updateAllowed(cx, cy) {
    const r = ALLOWED_RADIUS;
    for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r) { // Circular radius
                const key = `${cx + dx},${cy + dy}`;
                infiniteAllowed.set(key, true);
            }
        }
    }
}

function revealInfiniteCell(x, y) {
    const key = `${x},${y}`;
    if (infiniteRevealed.get(key)) return;

    // Block if in dead zone
    for (const zone of infiniteDeadZones) {
        if ((x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.r ** 2) return;
    }

    // Multiplayer: Block if in other player's territory
    if (multiplayerEnabled) {
        for (const [pid, allowed] of otherPlayersAllowed) {
            if (allowed.has(key)) return; // Cannot enter their territory
        }
    }

    infiniteRevealed.set(key, true);
    if (multiplayerEnabled && wsConnection) {
        wsConnection.send(JSON.stringify({ type: 'reveal', x, y }));
    }
    infiniteStats.revealed++;
    updateAllowed(x, y); // Expand morphologically

    const value = getInfiniteCell(x, y);

    // Try to spawn luckbox (only for non-mine cells)
    if (value !== -1) {
        trySpawnLuckbox(x, y);
    }

    // If mine, just reveal it (no game over in infinite mode - keep exploring!)
    if (value === -1) {
        // Check if protected by safe zone
        if (isCellProtectedBySafeZone(x, y)) {
            // Mine is neutralized by safe zone
            playSound('flag');
            infiniteFlagged.set(key, true);
            infiniteStats.flags++;
            showPowerUpNotification('Mine Neutralized!', 'Safe Zone protected you from an explosion', '#2ecc71');
            updateInfiniteStats();
            return;
        }

        playSound('boom');
        triggerExplosionEffect();
        infiniteDeadZones.push({ x, y, r: 4 });

        if (multiplayerEnabled && wsConnection) {
            wsConnection.send(JSON.stringify({ type: 'explosion', x, y }));
        }

        punishRevertExploration();
        return;
    }

    // Flood fill for empty cells
    if (value === 0) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                const nkey = `${nx},${ny}`;
                if (!infiniteRevealed.get(nkey) && !infiniteFlagged.get(nkey)) {
                    revealInfiniteCell(nx, ny);
                }
            }
        }
    }
}

function handleInfiniteRightClick(x, y) {
    const key = `${x},${y}`;
    if (!infiniteAllowed.get(key)) return; // Check bounds

    // Check Dead Zones
    for (const zone of infiniteDeadZones) {
        if ((x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.r ** 2) return;
    }

    if (infiniteRevealed.get(key)) return;

    if (infiniteFlagged.get(key)) {
        infiniteFlagged.delete(key);
        infiniteStats.flags--;
    } else {
        infiniteFlagged.set(key, true);
        infiniteStats.flags++;
    }

    playSound('flag');
    if (multiplayerEnabled && wsConnection) {
        wsConnection.send(JSON.stringify({
            type: 'flag',
            x, y,
            flagged: infiniteFlagged.get(key)
        }));
    }
    updateInfiniteStats();
}

function updateInfiniteStats() {
    const rev = document.getElementById('infinite-revealed');
    if (rev) rev.textContent = infiniteStats.revealed;
    const flg = document.getElementById('infinite-flags');
    if (flg) flg.textContent = infiniteStats.flags;
}

function startInfiniteTimer(mins) {
    const canvas = document.getElementById('infinite-canvas');
    if (canvas) canvas.style.filter = 'none';
    const existingModal = document.getElementById('infinite-game-over-modal');
    if (existingModal) existingModal.remove();

    infiniteTimeRemaining = Math.floor(mins * 60);
    updateInfiniteTimerDisplay();

    if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);
    infiniteTimerInterval = setInterval(() => {
        infiniteTimeRemaining--;
        updateInfiniteTimerDisplay();
        if (infiniteTimeRemaining <= 0) {
            endInfiniteGame();
        }
    }, 1000);
}

function updateInfiniteTimerDisplay() {
    const disp = document.getElementById('infinite-timer-display');
    if (disp) {
        const t = Math.max(0, infiniteTimeRemaining);
        const m = Math.floor(t / 60);
        const s = t % 60;
        disp.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

        if (t <= 10) disp.style.color = '#e74c3c';
        else disp.style.color = '#fff';
    }
}

function endInfiniteGame() {
    if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Blur
    const canvas = document.getElementById('infinite-canvas');
    if (canvas) {
        canvas.style.transition = 'filter 2s ease';
        canvas.style.filter = 'blur(8px)';
    }

    // Modal
    const modal = document.createElement('div');
    modal.id = 'infinite-game-over-modal';
    modal.className = 'retry-container';
    modal.style.zIndex = '2000';
    modal.innerHTML = `
        <div style="font-size: 2rem; font-weight: 700; color: #fff; margin-bottom: 20px;">
            <i class="fas fa-hourglass-end"></i> Time's Up!
        </div>
        <div style="font-size: 1.2rem; color: #bdc3c7; margin-bottom: 20px; text-align: left;">
            <p><i class="fas fa-eye"></i> Revealed: <strong>${infiniteStats.revealed}</strong></p>
            <p><i class="fas fa-flag"></i> Flags: <strong>${infiniteStats.flags}</strong></p>
        </div>
        <div style="display: flex; gap: 10px;">
            <button class="retry-btn" onclick="initInfiniteGame()">
                <i class="fas fa-redo"></i> Play Again
            </button>
            <button class="retry-btn" style="background: #95a5a6;" onclick="exitInfiniteMode()">
                <i class="fas fa-bars"></i> Menu
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

function punishRevertExploration() {
    // 1. Get revealed keys
    const keys = Array.from(infiniteRevealed.keys());
    if (keys.length <= 1) return;

    // 2. Remove random % (40-70% - harsh punishment!)
    const percent = 0.4 + (Math.random() * 0.3);
    const countToRemove = Math.floor(keys.length * percent);

    // Shuffle
    for (let i = keys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [keys[i], keys[j]] = [keys[j], keys[i]];
    }

    for (let i = 0; i < countToRemove; i++) {
        infiniteRevealed.delete(keys[i]);
        infiniteStats.revealed--;
    }

    // 3. Rebuild Allowed
    infiniteAllowed.clear();
    updateAllowed(0, 0);
    for (const key of infiniteRevealed.keys()) {
        const [x, y] = key.split(',').map(Number);
        updateAllowed(x, y);
    }

    updateInfiniteStats();
}

function triggerExplosionEffect() {
    // Camera Shake
    const shakeDuration = 300; // ms
    const shakeIntensity = 15;
    const startTime = Date.now();
    const originalX = cameraX;
    const originalY = cameraY;

    const shakeInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= shakeDuration) {
            clearInterval(shakeInterval);
            cameraX = originalX;
            cameraY = originalY;
            return;
        }

        const decay = 1 - (elapsed / shakeDuration);
        const offsetX = (Math.random() - 0.5) * 2 * shakeIntensity * decay;
        const offsetY = (Math.random() - 0.5) * 2 * shakeIntensity * decay;
        cameraX = originalX + offsetX;
        cameraY = originalY + offsetY;
    }, 16); // ~60fps

    // Screen Flash
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: radial-gradient(circle, rgba(255,100,0,0.6) 0%, rgba(255,0,0,0.3) 50%, transparent 100%);
        pointer-events: none;
        z-index: 9999;
        animation: explosionFlash 0.4s ease-out forwards;
    `;

    // Add animation if not exists
    if (!document.getElementById('explosion-style')) {
        const style = document.createElement('style');
        style.id = 'explosion-style';
        style.textContent = `
            @keyframes explosionFlash {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(1.2); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 400);
}

function showMultiplayerLobby(players) {
    const existing = document.getElementById('mp-lobby-ui');
    if (existing) existing.remove();

    const lobby = document.createElement('div');
    lobby.id = 'mp-lobby-ui';
    lobby.className = 'retry-container';
    lobby.style.zIndex = '4000';
    lobby.style.minWidth = '400px';
    lobby.innerHTML = `
        <h2><i class="fas fa-users"></i> Lobby</h2>
        <div style="margin: 20px 0; max-height: 300px; overflow-y: auto;">
            <div id="lobby-player-list" style="display: flex; flex-direction: column; gap: 10px;">
                <!-- Players inserted here -->
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <label>Timer:</label>
            <input type="number" id="lobby-timer" value="5" min="1" max="60" style="width: 60px; text-align: center; padding: 5px; border-radius: 0; border: none;"> min
        </div>
        
        <button class="retry-btn" onclick="requestStartGame()">
            Start Game
        </button>
    `;

    document.body.appendChild(lobby);
    updateMultiplayerLobby(players);
}

function updateMultiplayerLobby(players) {
    const list = document.getElementById('lobby-player-list');
    if (!list) return;

    list.innerHTML = players.map(p => `
        <div style="background: rgba(255,255,255,0.1); padding: 10px; border-radius: 0; display: flex; align-items: center; border-left: 4px solid ${p.color};">
            <span style="font-weight: bold; flex: 1;">${p.username}</span>
            ${p.isHost ? '<span style="font-size: 0.7rem; background: #f39c12; padding: 2px 6px; border-radius: 0; margin-left: 5px;">HOST</span>' : ''}
            ${p.id === localPlayerId ? '<span style="font-size: 0.8rem; opacity: 0.7;">(You)</span>' : ''}
        </div>
    `).join('');
}

function requestStartGame() {
    if (wsConnection && isHost) {
        wsConnection.send(JSON.stringify({
            type: 'requestStartGame'
        }));
    }
}

// ========== ROOM-BASED UI FUNCTIONS ==========

function showRoomLobby(roomData) {
    const existing = document.getElementById('mp-lobby-ui');
    if (existing) existing.remove();

    const lobby = document.createElement('div');
    lobby.id = 'mp-lobby-ui';
    lobby.className = 'retry-container';
    lobby.style.zIndex = '4000';
    lobby.style.minWidth = '450px';
    lobby.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="margin: 0;"><i class="fas fa-users"></i> Room Lobby</h2>
            <div style="background: linear-gradient(135deg, #9b59b6, #8e44ad); padding: 8px 15px; border-radius: 0; font-size: 1.2rem; font-weight: bold; letter-spacing: 3px; cursor: pointer;" 
                 onclick="copyRoomCode()" title="Click to copy">
                <i class="fas fa-copy" style="font-size: 0.8rem; margin-right: 5px;"></i>
                ${roomData.roomCode}
            </div>
        </div>
        
        <div style="font-size: 0.9rem; color: #888; margin-bottom: 10px;">
            Share this code with friends to join!
        </div>
        
        <div style="margin: 20px 0; max-height: 250px; overflow-y: auto;">
            <div id="lobby-player-list" style="display: flex; flex-direction: column; gap: 10px;">
                <!-- Players inserted here -->
            </div>
        </div>
        
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px;">
            <span style="color: #888;"><i class="fas fa-clock"></i> Timer:</span>
            <span style="font-size: 1.1rem;">${Math.floor(roomData.timerDuration / 60)} min</span>
            <span style="margin-left: auto; color: #888;"><i class="fas fa-users"></i></span>
            <span>${roomData.players.length} / ${roomData.maxPlayers}</span>
        </div>
        
        <div style="display: flex; gap: 10px;">
            <button id="room-start-game-btn" class="retry-btn" style="flex: 1; ${isHost ? '' : 'display: none;'}" onclick="requestStartGame()">
                <i class="fas fa-play"></i> Start Game
            </button>
            <div id="waiting-for-host" style="flex: 1; text-align: center; color: #888; padding: 15px; ${isHost ? 'display: none;' : ''}">
                <i class="fas fa-spinner fa-spin"></i> Waiting for host to start...
            </div>
            <button class="retry-btn" style="background: #e74c3c;" onclick="leaveRoom()">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        </div>
    `;

    document.body.appendChild(lobby);
    updateRoomLobby(roomData);
}

function updateRoomLobby(msg) {
    const list = document.getElementById('lobby-player-list');
    if (!list) return;

    const players = msg.players || [];
    list.innerHTML = players.map(p => `
        <div style="background: rgba(255,255,255,0.1); padding: 12px 15px; border-radius: 0; display: flex; align-items: center; border-left: 4px solid ${p.color};">
            <span style="font-weight: bold; flex: 1;">${p.username}</span>
            ${p.isHost ? '<span style="font-size: 0.7rem; background: #f39c12; padding: 2px 6px; border-radius: 0; margin-left: 5px;">HOST</span>' : ''}
            ${p.id === localPlayerId ? '<span style="font-size: 0.8rem; opacity: 0.7;">(You)</span>' : ''}
        </div>
    `).join('');

    // Update host UI
    const startBtn = document.getElementById('room-start-game-btn');
    const waitingDiv = document.getElementById('waiting-for-host');
    if (msg.hostId) {
        isHost = (msg.hostId === localPlayerId);
        if (startBtn) startBtn.style.display = isHost ? 'block' : 'none';
        if (waitingDiv) waitingDiv.style.display = isHost ? 'none' : 'block';
    }
}

function leaveRoom() {
    if (wsConnection) {
        wsConnection.send(JSON.stringify({ type: 'leaveRoom' }));
        wsConnection.close();
    }
    const lobby = document.getElementById('mp-lobby-ui');
    if (lobby) lobby.remove();
    multiplayerEnabled = false;
    showMenu();
}

function copyRoomCode() {
    navigator.clipboard.writeText(currentRoomCode).then(() => {
        // Visual feedback
        const codeDiv = document.querySelector('#mp-lobby-ui [onclick="copyRoomCode()"]');
        if (codeDiv) {
            const originalHTML = codeDiv.innerHTML;
            codeDiv.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                codeDiv.innerHTML = originalHTML;
            }, 1500);
        }
    });
}

// ==========================================
// SAVE / LOAD SYSTEM (LocalStorage)
// ==========================================

const SAVE_STORAGE_KEY = 'minesweeper_infinite_saves';
let currentSaveId = null; // Track loaded save ID

function getSavedGames() {
    try {
        const saves = localStorage.getItem(SAVE_STORAGE_KEY);
        // Ensure we handle invalid JSON
        if (!saves) return [];
        const parsed = JSON.parse(saves);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error('Error reading saves:', e);
        return [];
    }
}

// UI: Show Save Modal instead of prompt
function openSaveModal() {
    // Check if modal already exists
    if (document.getElementById('save-game-modal')) return;

    // Use existing name if updating, otherwise default
    const existingName = currentSaveId
        ? (getSavedGames().find(s => s.id === currentSaveId)?.name || 'World')
        : `World ${new Date().toLocaleTimeString()}`;

    const modal = document.createElement('div');
    modal.id = 'save-game-modal';
    modal.className = 'retry-container';
    modal.style.zIndex = '5000';
    modal.innerHTML = `
        <div style="font-size: 1.5rem; color: #fff; margin-bottom: 20px;">
            <i class="fas fa-save"></i> ${currentSaveId ? 'Update World' : 'Save World'}
        </div>
        <input type="text" id="save-name-input" placeholder="World Name" value="${existingName}" 
               style="font-size: 1.2rem; padding: 10px; width: 100%; border-radius: 0; border: none; margin-bottom: 20px; text-align: center;">
        
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button class="retry-btn" style="background: #2ecc71;" onclick="confirmSaveGame()">
                Save
            </button>
            <button class="retry-btn" style="background: #95a5a6;" onclick="document.getElementById('save-game-modal').remove()">
                Cancel
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    // Select text for easy overwrite
    const input = document.getElementById('save-name-input');
    input.focus();
    input.select();

    // Enter key support
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmSaveGame();
    });
}

function confirmSaveGame() {
    const input = document.getElementById('save-name-input');
    if (input && input.value.trim()) {
        saveInfiniteGame(input.value.trim());
        document.getElementById('save-game-modal').remove();
    }
}

function saveInfiniteGame(name) {
    console.log('Attempting to save game:', name);
    try {
        // 1. Serialize State
        const saveId = currentSaveId || Date.now().toString(); // Use existing ID or generate new

        const saveData = {
            id: saveId,
            name: name,
            date: Date.now(),
            seed: window.infiniteSeed,
            stats: { ...infiniteStats },
            camera: { x: cameraX, y: cameraY, zoom: zoomLevel },
            waypoint: waypoint,
            deadZones: infiniteDeadZones,
            revealed: Array.from(infiniteRevealed.keys()),
            flagged: Array.from(infiniteFlagged.keys()),
            isEndless: window.isInfiniteEndlessMode,
            luckboxes: Array.from(luckboxes.entries()),
            activePowerUps: {
                safeZone: { ...activePowerUps.safeZone },
                numberVision: { ...activePowerUps.numberVision },
                bombVision: { ...activePowerUps.bombVision },
                groundHealing: { ...activePowerUps.groundHealing }
            }
        };

        if (!window.isInfiniteEndlessMode) {
            saveData.timeRemaining = infiniteTimeRemaining;
        }

        // 2. Save to LocalStorage
        let saves = getSavedGames();

        if (currentSaveId) {
            // Update existing
            const index = saves.findIndex(s => s.id === currentSaveId);
            if (index !== -1) {
                saves[index] = saveData;
            } else {
                // ID somehow missed, treat as new
                saves.push(saveData);
            }
        } else {
            // New save
            saves.push(saveData);
            currentSaveId = saveId; // Set current ID so subsequent saves overwrite this one
        }

        // Sort by date desc (newest first)
        saves.sort((a, b) => b.date - a.date);

        // Limit saves
        if (saves.length > 20) saves.pop();

        localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saves));
        console.log('Successfully wrote to localStorage');

        // Show feedback styled like the game UI
        const msg = document.createElement('div');
        msg.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: #2ecc71; color: white; padding: 10px 20px; border-radius: 0;
            font-weight: bold; z-index: 6000; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;
        msg.innerHTML = '<i class="fas fa-check"></i> Game Saved!';
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);

        // Optional: Exit specific mode or just stay
        // exitInfiniteMode(); // Let's keep them in game, maybe? User choice. 
        // User requested "Save & Exit" button though.
        setTimeout(() => exitInfiniteMode(), 1000);

    } catch (err) {
        console.error('Failed to save game:', err);
        alert('Error saving game: ' + err.message);
    }
}

function deleteSavedGame(id) {
    let saves = getSavedGames();
    saves = saves.filter(s => s.id !== id);
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(saves));
    renderSavedGamesList();
}

function loadInfiniteGame(id) {
    console.log('Loading game:', id);
    try {
        const saves = getSavedGames();
        const save = saves.find(s => s.id === id);

        if (!save) {
            alert('Save not found!');
            return;
        }

        // 1. Restore State
        infiniteBoard.clear();
        infiniteRevealed.clear();
        infiniteFlagged.clear();
        infiniteAllowed.clear();
        luckboxes.clear();

        window.infiniteSeed = save.seed;
        infiniteStats = save.stats || { revealed: 0, flags: 0 };
        infiniteDeadZones = save.deadZones || [];
        waypoint = save.waypoint || { x: 0, y: 0 };

        // Restore luckboxes
        if (save.luckboxes && Array.isArray(save.luckboxes)) {
            save.luckboxes.forEach(([key, box]) => {
                luckboxes.set(key, box);
            });
        }

        // Restore power-ups (recalculate expiry based on remaining time)
        if (save.activePowerUps) {
            const now = Date.now();
            activePowerUps.safeZone = save.activePowerUps.safeZone || { active: false, expiry: 0, radius: 5 };
            activePowerUps.numberVision = save.activePowerUps.numberVision || { active: false, expiry: 0 };
            activePowerUps.bombVision = save.activePowerUps.bombVision || { active: false, expiry: 0 };
            activePowerUps.groundHealing = save.activePowerUps.groundHealing || { active: false, expiry: 0 };
        }

        // Restore Maps
        if (Array.isArray(save.revealed)) {
            save.revealed.forEach(key => infiniteRevealed.set(key, true));
        }
        if (Array.isArray(save.flagged)) {
            save.flagged.forEach(key => infiniteFlagged.set(key, true));
        }

        // Rebuild Allowed Areas
        updateAllowed(0, 0);
        if (Array.isArray(save.revealed)) {
            save.revealed.forEach(key => {
                const parts = key.split(',');
                if (parts.length === 2) {
                    updateAllowed(parseInt(parts[0]), parseInt(parts[1]));
                }
            });
        }

        // 2. Launch Game
        showInfiniteMode();
        const lobby = document.getElementById('infinite-lobby-modal');
        if (lobby) lobby.remove();

        canvas = document.getElementById('infinite-canvas');
        if (!canvas) {
            // Should not happen if showInfiniteMode works
            return;
        }
        ctx = canvas.getContext('2d', { alpha: false });

        // Restore Camera
        if (save.camera) {
            cameraX = save.camera.x;
            cameraY = save.camera.y;
            zoomLevel = save.camera.zoom;
        } else {
            resizeCanvas();
            cameraX = -(canvas.width / 2);
            cameraY = -(canvas.height / 2);
        }

        window.addEventListener('resize', resizeCanvas);
        setupCanvasControls();

        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        renderLoop();
        updateInfiniteStats();

        // 3. Handle Timer / Endless
        if (save.isEndless) {
            window.isInfiniteEndlessMode = true;
            const timerDisp = document.getElementById('infinite-timer-display');
            if (timerDisp) {
                timerDisp.textContent = 'ENDLESS';
                timerDisp.style.color = '#3498db';
            }
            if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);
        } else {
            window.isInfiniteEndlessMode = false;
            // Resume timer
            const minsRemaining = (save.timeRemaining || 300) / 60;
            startInfiniteTimer(minsRemaining);
        }
        console.log('Game loaded successfully');
    } catch (e) {
        console.error('Error loading game:', e);
        alert('Failed to load game: ' + e.message);
    }
}

function renderSavedGamesList() {
    const container = document.getElementById('saved-games-list');
    if (!container) return;

    const saves = getSavedGames();

    if (saves.length === 0) {
        container.innerHTML = '<div style="color: #aaa; text-align: center; padding: 20px;">No saved worlds found.</div>';
        return;
    }

    container.innerHTML = saves.map(save => {
        const dateStr = new Date(save.date).toLocaleString();
        const mode = save.isEndless ? '<span style="color: #3498db;">Endless</span>' : 'Timed';
        const revealedCount = save.stats ? save.stats.revealed : 0;
        const luckboxCount = save.luckboxes ? save.luckboxes.filter(([_, box]) => !box.opened).length : 0;
        const luckboxDisplay = luckboxCount > 0 ? ` • <span style="color: #FFD700;">🎁 ${luckboxCount} Luckboxes</span>` : '';

        return `
            <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 0; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: bold; font-size: 1.1rem; color: #fff;">${save.name || 'Untitled World'}</div>
                    <div style="color: #aaa; font-size: 0.9rem;">
                        ${dateStr} • ${mode} • Revealed: ${revealedCount}${luckboxDisplay}
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="retry-btn" style="padding: 5px 15px; font-size: 0.9rem; background: #2ecc71;" onclick="loadInfiniteGame('${save.id}')">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="retry-btn" style="padding: 5px 15px; font-size: 0.9rem; background: #e74c3c;" onclick="deleteSavedGame('${save.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}


// ========== LEADERBOARD UI ==========

function showLeaderboard(leaderboard) {
    if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);

    // Remove any existing modal
    const existingModal = document.getElementById('infinite-game-over-modal');
    if (existingModal) existingModal.remove();

    // Blur canvas
    const canvas = document.getElementById('infinite-canvas');
    if (canvas) {
        canvas.style.transition = 'filter 1s ease';
        canvas.style.filter = 'blur(8px)';
    }

    const modal = document.createElement('div');
    modal.id = 'infinite-game-over-modal';
    modal.className = 'retry-container';
    modal.style.zIndex = '5000';
    modal.style.minWidth = '500px';

    // Build leaderboard rows
    const rows = leaderboard.map((p, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const isMe = p.playerId === localPlayerId;
        return `
            <div style="display: flex; align-items: center; padding: 12px 15px; background: ${isMe ? 'rgba(52, 152, 219, 0.3)' : 'rgba(255,255,255,0.05)'}; border-radius: 0; border-left: 4px solid ${p.color};">
                <span style="font-size: 1.5rem; width: 40px;">${medal}</span>
                <span style="flex: 1; font-weight: ${isMe ? 'bold' : 'normal'};">${p.username}</span>
                <span style="color: #2ecc71; margin-right: 20px;"><i class="fas fa-eye"></i> ${p.revealed}</span>
                <span style="color: #e74c3c; margin-right: 20px;"><i class="fas fa-bomb"></i> ${p.explosions}</span>
                <span style="font-weight: bold; font-size: 1.1rem; color: #f39c12;">${p.totalScore}</span>
            </div>
        `;
    }).join('');

    modal.innerHTML = `
        <div style="font-size: 2rem; font-weight: 700; color: #fff; margin-bottom: 20px;">
            <i class="fas fa-trophy" style="color: #f39c12;"></i> Game Over!
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; max-height: 300px; overflow-y: auto;">
            ${rows}
        </div>
        
        <div id="restart-countdown" style="font-size: 1.2rem; color: #3498db; margin-bottom: 15px;">
            <i class="fas fa-sync-alt fa-spin"></i> New game starting in <span id="countdown-seconds">10</span>s...
        </div>
        
        <div style="display: flex; gap: 10px;">
            <button class="retry-btn" style="background: #e74c3c;" onclick="leaveRoom()">
                <i class="fas fa-door-open"></i> Leave Room
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}

function updateRestartCountdown(seconds) {
    const countdownSpan = document.getElementById('countdown-seconds');
    if (countdownSpan) {
        countdownSpan.textContent = seconds;
    }
}

function restartMultiplayerGame(seed, duration) {
    // Remove leaderboard modal
    const modal = document.getElementById('infinite-game-over-modal');
    if (modal) modal.remove();

    // Reset canvas filter
    const canvas = document.getElementById('infinite-canvas');
    if (canvas) {
        canvas.style.filter = 'none';
    }

    // Reset game state
    window.infiniteSeed = seed;
    infiniteBoard.clear();
    infiniteRevealed.clear();
    infiniteFlagged.clear();
    infiniteStats = { revealed: 0, flags: 0 };
    infiniteDeadZones = [];

    // Reset luckboxes and power-ups
    luckboxes.clear();
    activePowerUps.safeZone = { active: false, expiry: 0, radius: 5 };
    activePowerUps.numberVision = { active: false, expiry: 0 };
    activePowerUps.bombVision = { active: false, expiry: 0 };
    activePowerUps.groundHealing = { active: false, expiry: 0 };

    // Reset allowed area to spawn position
    infiniteAllowed.clear();
    updateAllowed(localSpawnX, localSpawnY);

    // Reset other players' territories
    otherPlayersAllowed.clear();
    otherPlayersCells.clear();
    otherPlayers.forEach((_, pid) => {
        otherPlayersAllowed.set(pid, new Map());
    });

    // Reset camera to spawn
    const cs = BASE_CELL_SIZE * zoomLevel;
    cameraX = (localSpawnX * cs) - (canvas.width / 2);
    cameraY = (localSpawnY * cs) - (canvas.height / 2);

    // Restart timer
    infiniteTimeRemaining = duration;
    updateInfiniteTimerDisplay();

    if (infiniteTimerInterval) clearInterval(infiniteTimerInterval);
    infiniteTimerInterval = setInterval(() => {
        // Timer is managed by server, but we can show local updates
    }, 1000);

    // Resume render loop
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderLoop();

    updateInfiniteStats();
}

// Keep old function for backwards compat
function showMultiplayerLobby(players) {
    showRoomLobby({ players, roomCode: currentRoomCode, timerDuration: 300, maxPlayers: 8 });
}

function updateMultiplayerLobby(players) {
    updateRoomLobby({ players });
}

// ========== LUCKBOX FUNCTIONS ==========

function trySpawnLuckbox(x, y) {
    // Check spawn chance
    if (Math.random() > LUCKBOX_SPAWN_CHANCE) return;

    // Check minimum distance from other luckboxes
    for (const [key, box] of luckboxes) {
        const [bx, by] = key.split(',').map(Number);
        const dist = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
        if (dist < LUCKBOX_MIN_DISTANCE) return;
    }

    // Random power-up type
    const type = 'numberVision';
    const key = `${x},${y}`;
    luckboxes.set(key, { type, opened: false });
}

function openLuckbox(x, y) {
    const key = `${x},${y}`;
    const box = luckboxes.get(key);
    if (!box || box.opened) return;

    box.opened = true;
    luckboxes.set(key, box);

    // Activate power-up
    const now = Date.now();
    const expiry = now + POWER_UP_DURATION;

    switch (box.type) {
        case 'safeZone':
            activePowerUps.safeZone = { active: true, expiry, radius: 5 };
            showPowerUpNotification('Safe Zone Activated!', 'Creates a protective zone around you for 30s', '#2ecc71');
            break;
        case 'numberVision':
            activePowerUps.numberVision = { active: true, expiry };
            showPowerUpNotification('Number Vision Activated!', 'Reveals a 3x3 area around your cursor for 30s', '#3498db');
            break;
        case 'bombVision':
            activePowerUps.bombVision = { active: true, expiry };
            showPowerUpNotification('Bomb Vision Activated!', 'See all mines through fog for 30s', '#e74c3c');
            break;
        case 'groundHealing':
            activePowerUps.groundHealing = { active: true, expiry };
            showPowerUpNotification('Ground Healing Activated!', 'Removes dead zones around you for 30s', '#9b59b6');
            healDeadZones(x, y);
            break;
    }

    playSound('retry'); // Use retry sound for power-up
}

function healDeadZones(centerX, centerY) {
    // Remove dead zones near the player
    const healRadius = 8;
    infiniteDeadZones = infiniteDeadZones.filter(zone => {
        const dist = Math.sqrt((centerX - zone.x) ** 2 + (centerY - zone.y) ** 2);
        return dist > healRadius;
    });
}

function updatePowerUps() {
    const now = Date.now();
    let changed = false;

    for (const [type, powerUp] of Object.entries(activePowerUps)) {
        if (powerUp.active && now > powerUp.expiry) {
            powerUp.active = false;
            changed = true;
        }
    }

    if (changed) {
        updatePowerUpHUD();
    }
}

function showPowerUpNotification(title, description, color) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: rgba(0, 0, 0, 0.9);
        border-left: 4px solid ${color};
        padding: 15px 20px;
        border-radius: 0;
        z-index: 5000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;
    notification.innerHTML = `
        <div style="font-weight: bold; color: ${color}; margin-bottom: 5px;">${title}</div>
        <div style="color: #ccc; font-size: 0.9rem;">${description}</div>
    `;

    // Add animation
    if (!document.getElementById('powerup-anim')) {
        const style = document.createElement('style');
        style.id = 'powerup-anim';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function updatePowerUpHUD() {
    const container = document.getElementById('powerup-hud');
    if (!container) return;

    const now = Date.now();
    let html = '';

    for (const [type, powerUp] of Object.entries(activePowerUps)) {
        if (powerUp.active) {
            const remaining = Math.max(0, Math.ceil((powerUp.expiry - now) / 1000));
            const icons = {
                safeZone: '🛡️',
                numberVision: '👁️',
                bombVision: '💣',
                groundHealing: '✨'
            };
            const names = {
                safeZone: 'Safe Zone',
                numberVision: 'Number Vision',
                bombVision: 'Bomb Vision',
                groundHealing: 'Healing'
            };
            html += `<div style="background: rgba(255,255,255,0.1); padding: 5px 10px; border-radius: 0; display: flex; align-items: center; gap: 8px;">
                <span>${icons[type]}</span>
                <span>${names[type]}</span>
                <span style="color: #f39c12; font-weight: bold;">${remaining}s</span>
            </div>`;
        }
    }

    container.innerHTML = html;
    container.style.display = html ? 'flex' : 'none';
}

function isCellProtectedBySafeZone(x, y) {
    if (!activePowerUps.safeZone.active) return false;

    // Check if cell is within safe zone radius of any revealed cell
    const radius = activePowerUps.safeZone.radius;
    for (const [key, _] of infiniteRevealed) {
        const [rx, ry] = key.split(',').map(Number);
        const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2);
        if (dist <= radius) return true;
    }
    return false;
}
