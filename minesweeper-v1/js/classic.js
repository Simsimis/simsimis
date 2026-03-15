
// ==========================================
// UTILITIES & SHARED HELPERS (Formerly utils.js)
// ==========================================

// Seeded Random for Deterministic Generation
// Seeded Random for Deterministic Generation
function hashCoords(x, y) {
    let seed = window.infiniteSeed || 12345;
    x = Math.imul(x ^ seed, 1597334677);
    y = Math.imul(y ^ seed, 3812015801);
    x = (x ^ (y >>> 15) ^ (seed >>> 7));
    y = (y ^ (x >>> 15) ^ (seed >>> 7));
    return ((x ^ y) >>> 0) / 4294967296;
}

function seededRandom(seed) {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// ==========================================
// AUDIO SYSTEM
// ==========================================
const audio = {
    boom: new Audio('audio/mine_boom.mp3'),
    flag: new Audio('audio/flag_placement.mp3'),
    retry: new Audio('audio/Retry.mp3')
};

function playSound(name) {
    if (gameOptions.sfx && audio[name]) {
        audio[name].currentTime = 0;
        audio[name].play().catch(e => console.log('Audio play error:', e));
    }
}

// ==========================================
// GAME OPTIONS
// ==========================================
let gameOptions = {
    sfx: true,
    windowMode: 'windowed',
    resolution: '1000x800', // Default
    showFps: false
};

// FPS vars
let lastLoop = new Date();
let fpsDisplay = document.getElementById('fps-counter');

function fpsLoop() {
    if (!gameOptions.showFps) return;
    const thisLoop = new Date();
    const fps = 1000 / (thisLoop - lastLoop);
    lastLoop = thisLoop;
    if (fpsDisplay) fpsDisplay.textContent = 'FPS: ' + Math.round(fps);
    requestAnimationFrame(fpsLoop);
}

function loadOptions() {
    const saved = localStorage.getItem('minesweeper_options');
    if (saved) {
        gameOptions = { ...gameOptions, ...JSON.parse(saved) };
    }
    updateOptionsUI();
    applyOptions();
}

function saveOptions() {
    localStorage.setItem('minesweeper_options', JSON.stringify(gameOptions));
}

function updateOptionsUI() {
    const sfx = document.getElementById('opt-sfx');
    if (sfx) sfx.checked = gameOptions.sfx;

    const win = document.getElementById('opt-window');
    if (win) win.value = gameOptions.windowMode;

    const res = document.getElementById('opt-resolution');
    if (res) res.value = gameOptions.resolution;

    const fps = document.getElementById('opt-fps');
    if (fps) fps.checked = gameOptions.showFps;
}

function applyOptions() {
    // Window Mode & Resolution (IPC)
    if (window.electronAPI) {
        if (gameOptions.windowMode === 'fullscreen') {
            window.electronAPI.setFullscreen(true);
        } else {
            window.electronAPI.setFullscreen(false);
            const [w, h] = gameOptions.resolution.split('x').map(Number);
            window.electronAPI.setSize(w, h);
        }
    }

    // FPS
    if (gameOptions.showFps) {
        if (fpsDisplay) {
            fpsDisplay.style.display = 'block';
            requestAnimationFrame(fpsLoop);
        }
    } else {
        if (fpsDisplay) fpsDisplay.style.display = 'none';
    }
}

function toggleSFX() {
    gameOptions.sfx = document.getElementById('opt-sfx').checked;
    saveOptions();
}

function toggleFullscreen() {
    gameOptions.windowMode = document.getElementById('opt-window').value;
    saveOptions();
    applyOptions();
}

function updateResolution() {
    gameOptions.resolution = document.getElementById('opt-resolution').value;
    if (gameOptions.windowMode === 'fullscreen') {
        gameOptions.windowMode = 'windowed';
        document.getElementById('opt-window').value = 'windowed';
    }
    saveOptions();
    applyOptions();
}

function toggleFPS() {
    gameOptions.showFps = document.getElementById('opt-fps').checked;
    saveOptions();
    applyOptions();
}

// ==========================================
// THEME SYSTEM
// ==========================================
let customTheme = {
    mine: null,
    flag: null,
    background: null,
    maniaBar: null,
    numbers: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null }
};

function loadTheme() {
    const saved = localStorage.getItem('minesweeper_theme');
    if (saved) {
        customTheme = JSON.parse(saved);
        applyThemeGlobal();
    }
}

function saveTheme() {
    localStorage.setItem('minesweeper_theme', JSON.stringify(customTheme));
    applyThemeGlobal();
}

function resetFullTheme() {
    if (confirm("Reset current theme to default?")) {
        customTheme = {
            mine: null,
            flag: null,
            background: null,
            maniaBar: null,
            numbers: { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null, 8: null }
        };
        saveTheme();
        updateThemePreview();
    }
}

function applyThemeGlobal() {
    if (customTheme.background) {
        document.body.style.background = `url(${customTheme.background}) no-repeat center center fixed`;
        document.body.style.backgroundSize = 'cover';
    } else {
        document.body.style.background = 'linear-gradient(135deg, #e8f0f5 0%, #d1e3ed 50%, #c5dbe8 100%)';
    }
    const mania = document.getElementById('mania-bar');
    if (mania) {
        if (customTheme.maniaBar) {
            mania.style.backgroundColor = customTheme.maniaBar;
        } else {
            mania.style.backgroundColor = '#e74c3c';
        }
    }
}

function updateThemePreview() {
    const target = document.getElementById('theme-target').value;
    const container = document.getElementById('theme-preview-content');
    const upload = document.getElementById('theme-upload');
    const colorPicker = document.getElementById('theme-color');

    if (!container) return;

    container.innerHTML = '';

    // Show correct input type
    if (target === 'maniaBar') {
        upload.style.display = 'none';
        colorPicker.style.display = 'block';
        colorPicker.value = customTheme.maniaBar || '#e74c3c';
    } else {
        upload.style.display = 'block';
        colorPicker.style.display = 'none';
        upload.value = ''; // Reset file input
    }

    // Render Preview
    if (target === 'mine') {
        if (customTheme.mine) container.innerHTML = `<img src="${customTheme.mine}" style="width:36px;height:36px;">`;
        else container.innerHTML = '<i class="fas fa-bomb" style="font-size:20px;"></i>';
    } else if (target === 'flag') {
        if (customTheme.flag) container.innerHTML = `<img src="${customTheme.flag}" style="width:36px;height:36px;">`;
        else container.innerHTML = '<i class="fas fa-flag" style="font-size:20px;color:#e74c3c;"></i>';
    } else if (target === 'background') {
        if (customTheme.background) container.innerHTML = `<div style="width:80px;height:60px;background:url(${customTheme.background});background-size:cover;"></div>`;
        else container.innerText = 'Default BG';
    } else if (target === 'maniaBar') {
        container.style.backgroundColor = customTheme.maniaBar || '#e74c3c';
        container.style.width = '100%';
        container.style.height = '20px';
    } else if (!isNaN(target)) { // Numbers
        const val = customTheme.numbers[target];
        if (val) container.innerHTML = `<img src="${val}" style="width:36px;height:36px;">`;
        else container.innerHTML = `<span class="n${target}" style="font-size:24px;font-weight:bold;">${target}</span>`;
    }
}

function handleThemeUpload(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const result = e.target.result;
        const target = document.getElementById('theme-target').value;

        if (target === 'mine') customTheme.mine = result;
        else if (target === 'flag') customTheme.flag = result;
        else if (target === 'background') customTheme.background = result;
        else if (!isNaN(target)) customTheme.numbers[target] = result;

        saveTheme();
        updateThemePreview();
    };
    reader.readAsDataURL(file);
}

function handleThemeColor(input) {
    const target = document.getElementById('theme-target').value;
    if (target === 'maniaBar') {
        customTheme.maniaBar = input.value;
        saveTheme();
        updateThemePreview();
    }
}

function resetThemeAsset() {
    const target = document.getElementById('theme-target').value;
    if (target === 'mine') customTheme.mine = null;
    else if (target === 'flag') customTheme.flag = null;
    else if (target === 'background') customTheme.background = null;
    else if (target === 'maniaBar') customTheme.maniaBar = null;
    else if (!isNaN(target)) customTheme.numbers[target] = null;

    saveTheme();
    updateThemePreview();
}

// ==========================================
// STATISTICS
// ==========================================
let playerStats = {
    classic: { played: 0, won: 0, bestTimes: { easy: null, medium: null, hard: null } },
    minemania: { played: 0, won: 0, bestTimes: { easy: null, medium: null, hard: null } }
};
let activeStatsTab = 'classic';

function loadStats() {
    const saved = localStorage.getItem('minesweeper_stats');
    if (saved) {
        playerStats = JSON.parse(saved);
    }
}

function saveStats() {
    localStorage.setItem('minesweeper_stats', JSON.stringify(playerStats));
}

function resetStats() {
    if (confirm("Reset ALL stats (both modes)? This cannot be undone.")) {
        playerStats = {
            classic: { played: 0, won: 0, bestTimes: { easy: null, medium: null, hard: null } },
            minemania: { played: 0, won: 0, bestTimes: { easy: null, medium: null, hard: null } }
        };
        saveStats();
        renderStats();
    }
}

function getDifficultyKey() {
    // Rely on globals from classic.js (originalRows etc)
    const checkRows = typeof originalRows !== 'undefined' ? originalRows : rows;
    const checkCols = typeof originalCols !== 'undefined' ? originalCols : cols;

    if (checkRows === 9 && checkCols === 9) return 'easy';
    if (checkRows === 16 && checkCols === 16) return 'medium';
    if (checkRows === 16 && checkCols === 30) return 'hard';
    return 'custom';
}

function updateStats(won) {
    const mode = gameMode || 'classic'; // Defined in main.js or classic.js
    if (!playerStats[mode]) playerStats[mode] = { played: 0, won: 0, bestTimes: { easy: null, medium: null, hard: null } };

    playerStats[mode].played++;
    if (won) {
        playerStats[mode].won++;
        const diff = getDifficultyKey();
        if (diff !== 'custom') {
            const currentBest = playerStats[mode].bestTimes[diff];
            // 'seconds' is global from classic.js
            if (currentBest === null || seconds < currentBest) {
                playerStats[mode].bestTimes[diff] = seconds;
            }
        }
    }
    saveStats();
}

function switchStatsTab(mode) {
    activeStatsTab = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === mode) btn.classList.add('active');
    });
    renderStats();
}

function renderStats() {
    const stats = playerStats[activeStatsTab];
    if (!stats) return;

    document.getElementById('stat-played').textContent = stats.played;
    document.getElementById('stat-won').textContent = stats.won;

    const rate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    document.getElementById('stat-rate').textContent = rate + '%';

    const formatTime = (t) => t === null ? '-' : t + 's';
    document.getElementById('stat-best-easy').textContent = formatTime(stats.bestTimes.easy);
    document.getElementById('stat-best-medium').textContent = formatTime(stats.bestTimes.medium);
    document.getElementById('stat-best-hard').textContent = formatTime(stats.bestTimes.hard);
}


// ==========================================
// CLASSIC MODE (CORE ENGINE)
// ==========================================

let rows = 9, cols = 9, totalMines = 10;
let board = [];
let revealed = [];
let flagged = [];
let gameOver = false;
let firstClick = true;
let timerInterval = null;
let seconds = 0;
let gameMode = 'classic'; // Default

// Keep track of original settings for Retry
let originalRows = 9;
let originalCols = 9;
let originalMines = 10;

function setDifficulty(r, c, m) {
    // Store original values for retry
    originalRows = r;
    originalCols = c;
    originalMines = m;
    rows = r;
    cols = c;
    totalMines = m;
    initGame(rows, cols, totalMines);
}

function initGame(r, c, m) {
    rows = r;
    cols = c;
    totalMines = m;
    board = [];
    revealed = [];
    flagged = [];
    gameOver = false;
    firstClick = true;
    seconds = 0;

    // Clean up timers
    if (timerInterval) clearInterval(timerInterval);
    if (typeof stopManiaTimer === 'function') stopManiaTimer();

    // Reset UI
    const timerEl = document.getElementById('timer');
    if (timerEl) timerEl.textContent = '0';

    const countEl = document.getElementById('mineCount');
    if (countEl) countEl.textContent = totalMines;

    const msgEl = document.getElementById('message');
    if (msgEl) {
        msgEl.innerHTML = '';
        msgEl.className = 'message';
    }

    // Clean up modals (redundant safety)
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.remove();

    // Initialize Arrays
    for (let i = 0; i < rows; i++) {
        board.push(new Array(cols).fill(0));
        revealed.push(new Array(cols).fill(false));
        flagged.push(new Array(cols).fill(false));
    }

    renderBoard();

    // Helper for mania UI visibility (inter-module dependency)
    const maniaContainer = document.getElementById('mania-bar-container');
    if (maniaContainer) {
        if (gameMode === 'minemania') {
            maniaContainer.style.display = 'block';
            const bar = document.getElementById('mania-bar');
            if (bar) bar.style.width = '100%';
        } else {
            maniaContainer.style.display = 'none';
        }
    }
}

function placeMines(excludeR, excludeC) {
    let placed = 0;
    while (placed < totalMines) {
        const r = Math.floor(Math.random() * rows);
        const c = Math.floor(Math.random() * cols);
        if (board[r][c] !== -1 && !(r === excludeR && c === excludeC)) {
            board[r][c] = -1;
            placed++;
        }
    }
    calculateNumbers();
}

function calculateNumbers() {
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] === -1) continue;
            let count = 0;
            for (const [dr, dc] of directions) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc] === -1) {
                    count++;
                }
            }
            board[r][c] = count;
        }
    }
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;

    // Calculate available space
    const padding = 40;
    const headerHeight = 220;
    const maxW = window.innerWidth - padding;
    const maxH = window.innerHeight - headerHeight - padding;

    // Calculate optimal cell size
    const sizeW = Math.floor((maxW - ((cols - 1) * 3)) / cols);
    const sizeH = Math.floor((maxH - ((rows - 1) * 3)) / rows);
    const cellSize = Math.min(36, Math.max(18, Math.min(sizeW, sizeH)));

    boardEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    boardEl.innerHTML = '';

    // Create Fragment
    const fragment = document.createDocumentFragment();

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
            cell.style.fontSize = `${cellSize * 0.6}px`;

            cell.dataset.row = r;
            cell.dataset.col = c;

            // Event Listeners (Closure safe loop)
            cell.addEventListener('click', () => handleClick(r, c));
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                // Check if handleRightClick exists (defined in minemania.js/extensions)
                if (typeof handleRightClick === 'function') {
                    handleRightClick(r, c);
                } else {
                    // Fallback to basic toggle if extensions not loaded
                    if (gameOver || revealed[r][c]) return;
                    if (firstClick) return; // Block flagging before start? Logic says yes.
                    flagged[r][c] = !flagged[r][c];
                    updateCell(r, c);
                    updateMineCount();
                    playSound('flag');
                }
            });

            // Render state immediately
            if (revealed[r][c]) {
                cell.classList.add('revealed');
                if (board[r][c] > 0) {
                    cell.textContent = board[r][c];
                    cell.classList.add('n' + board[r][c]);
                } else if (board[r][c] === -1) {
                    // revealed mine (game over primarily)
                }
            } else if (flagged[r][c]) {
                cell.classList.add('flagged');
                cell.innerHTML = '<i class="fas fa-flag"></i>';
            }

            fragment.appendChild(cell);
        }
    }
    boardEl.appendChild(fragment);
}

// Global resize handler
window.addEventListener('resize', () => {
    // Only re-render if game screen is visible
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen && gameScreen.style.display === 'flex') {
        renderBoard();
    }
});

function handleClick(r, c) {
    if (gameOver || flagged[r][c]) return;

    // If already revealed, try to chord
    if (revealed[r][c]) {
        if (board[r][c] > 0) {
            // Only reset timer if chord actually did something (revealed cells)
            if (chord(r, c)) {
                if (typeof resetManiaTimer === 'function') resetManiaTimer();
            }
        }
        return;
    }

    if (firstClick) {
        firstClick = false;
        placeMines(r, c);
        startTimer();
        if (gameMode === 'minemania') {
            if (typeof startManiaTimer === 'function') startManiaTimer();
        }
    }

    // Valid action: Reset timer
    if (typeof resetManiaTimer === 'function') resetManiaTimer();

    if (board[r][c] === -1) {
        revealMines(r, c);
        endGame(false);
    } else {
        revealCell(r, c);
        checkWin();
    }
}

function chord(r, c) {
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    let flagCount = 0;
    for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            if (flagged[nr][nc]) flagCount++;
        }
    }

    if (flagCount === board[r][c]) {
        let hitMine = false;
        let changesMade = false; // Track if we actually revealed anything

        for (const [dr, dc] of directions) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                if (!revealed[nr][nc] && !flagged[nr][nc]) {
                    changesMade = true; // We are about to reveal or hit mine
                    if (board[nr][nc] === -1) {
                        hitMine = true;
                        const cell = document.querySelector(`.cell[data-row="${nr}"][data-col="${nc}"]`);
                        if (cell) {
                            cell.classList.add('revealed', 'mine');
                            // Theme handling
                            if (typeof customTheme !== 'undefined' && customTheme.mine) {
                                cell.innerHTML = `<img src="${customTheme.mine}" style="width:100%;height:100%;">`;
                            } else {
                                cell.innerHTML = '<i class="fas fa-bomb"></i>';
                            }
                            cell.classList.add('exploded');
                        }
                    } else {
                        revealCell(nr, nc);
                    }
                }
            }
        }

        if (hitMine) {
            revealMines(r, c);
            endGame(false);
            return true;
        } else {
            if (changesMade) checkWin();
            return changesMade; // Only return true if we did work
        }
    }
    return false; // No chord action
}

function revealCell(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols || revealed[r][c] || flagged[r][c]) return;

    revealed[r][c] = true;
    updateCell(r, c); // Optimistic update

    if (board[r][c] === 0) {
        // Flood fill
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr !== 0 || dc !== 0) {
                    revealCell(r + dr, c + dc);
                }
            }
        }
    }
}

function updateCell(r, c) {
    const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    if (!cell) return;

    // Reset classes
    cell.className = 'cell';
    cell.innerHTML = '';
    cell.style.width = '100% / cols'; // Just ensuring size logic if needed, but renderBoard sets fixed px

    if (revealed[r][c]) {
        cell.classList.add('revealed');
        if (board[r][c] > 0) {
            cell.textContent = board[r][c];
            cell.classList.add('n' + board[r][c]);
        }
    } else if (flagged[r][c]) {
        cell.classList.add('flagged');
        if (typeof customTheme !== 'undefined' && customTheme.flag) {
            cell.innerHTML = `<img src="${customTheme.flag}" style="width:100%;height:100%;">`;
        } else {
            cell.innerHTML = '<i class="fas fa-flag"></i>';
        }
    } else {
        cell.classList.remove('flagged');
        cell.innerHTML = '';
    }
}

function revealMines(clickedR, clickedC) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (board[r][c] === -1) {
                const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
                if (cell) {
                    cell.classList.add('revealed', 'mine');
                    if (typeof customTheme !== 'undefined' && customTheme.mine) {
                        cell.innerHTML = `<img src="${customTheme.mine}" style="width:100%;height:100%;">`;
                    } else {
                        cell.innerHTML = '<i class="fas fa-bomb"></i>';
                    }
                    if (r === clickedR && c === clickedC) {
                        cell.classList.add('exploded');
                    }
                }
            }
        }
    }
}

function startTimer() {
    timerInterval = setInterval(() => {
        seconds++;
        const el = document.getElementById('timer');
        if (el) el.textContent = seconds;
    }, 1000);
}

function updateMineCount() {
    let flags = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (flagged[r][c]) flags++;
        }
    }
    const el = document.getElementById('mineCount');
    if (el) el.textContent = totalMines - flags;
}

function checkWin() {
    let revealedCount = 0;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (revealed[r][c]) revealedCount++;
        }
    }
    if (revealedCount === rows * cols - totalMines) {
        endGame(true);
    }
}

function endGame(won) {
    gameOver = true;
    if (timerInterval) clearInterval(timerInterval);
    if (typeof stopManiaTimer === 'function') stopManiaTimer();

    const msgEl = document.getElementById('message');
    let content = '';

    if (won) {
        // Auto-flag remaining
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!revealed[r][c] && !flagged[r][c]) {
                    flagged[r][c] = true;
                    // Update visual
                    const cell = document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
                    if (cell) {
                        cell.classList.add('flagged');
                        cell.innerHTML = '<i class="fas fa-flag"></i>';
                    }
                }
            }
        }
        updateMineCount();
        content = '<i class="fas fa-trophy"></i> You Win!';
        msgEl.className = 'message win';
    } else {
        content = '<i class="fas fa-skull-crossbones"></i> Game Over!';
        msgEl.className = 'message lose';
        playSound('boom');
    }

    msgEl.innerHTML = content;

    // Cleanup existing modal
    const existingModal = document.getElementById('game-over-modal');
    if (existingModal) existingModal.remove();

    // Create Modal
    const modal = document.createElement('div');
    modal.id = 'game-over-modal';
    modal.className = 'retry-container';
    modal.innerHTML = `
        <div style="font-size: 2rem; font-weight: 700; color: ${won ? '#27ae60' : '#e74c3c'}; margin-bottom: 10px;">
            ${won ? '<i class="fas fa-trophy"></i> Victory!' : '<i class="fas fa-skull-crossbones"></i> Game Over!'}
        </div>
        <div style="font-size: 1.2rem; color: #7f8c8d; margin-bottom: 20px;">
            Time: ${seconds}s | Mines: ${totalMines}
        </div>
        <div style="display: flex; gap: 10px;">
            <button class="retry-btn" onclick="retryGame()">
                <i class="fas fa-redo"></i> Try Again
            </button>
            <button class="retry-btn" style="background: #95a5a6;" onclick="showMenu(); document.getElementById('game-over-modal').remove();">
                <i class="fas fa-bars"></i> Menu
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    if (typeof updateStats === 'function') {
        updateStats(won);
    }
}

function retryGame() {
    if (typeof playSound === 'function') playSound('retry');
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.remove();

    // Reset to original difficulty (not expanded values)
    // originalRows variables are in this file's scope
    setDifficulty(originalRows, originalCols, originalMines);
}


// ==========================================
// UI & NAVIGATION (Formerly ui.js)
// ==========================================

function showMenu() {
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('stats-screen').style.display = 'none';
    document.getElementById('options-screen').style.display = 'none';
    document.getElementById('themes-screen').style.display = 'none';
    document.getElementById('mode-selection').style.display = 'none';

    // Hide infinite screen (it is fixed pos usually)
    const inf = document.getElementById('infinite-screen');
    if (inf) inf.style.display = 'none';

    document.getElementById('main-menu').style.display = 'flex';

    if (typeof stopManiaTimer === 'function') stopManiaTimer();

    // Clean up modals
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.remove();
}

function showGame() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('stats-screen').style.display = 'none';
    document.getElementById('options-screen').style.display = 'none';
    document.getElementById('themes-screen').style.display = 'none';
    document.getElementById('mode-selection').style.display = 'none';

    const inf = document.getElementById('infinite-screen');
    if (inf) inf.style.display = 'none';

    document.getElementById('game-screen').style.display = 'flex';
    window.dispatchEvent(new Event('resize'));
}

function showModeSelection() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('mode-selection').style.display = 'flex';
}

function showOptions() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('options-screen').style.display = 'flex';
    if (typeof loadOptions === 'function') loadOptions();
}

function showStats() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('stats-screen').style.display = 'flex';
    if (typeof loadStats === 'function') loadStats();
    if (typeof renderStats === 'function') renderStats();
}

function showThemes() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('themes-screen').style.display = 'flex';
    if (typeof updateThemePreview === 'function') updateThemePreview();
}

function startGame(mode) {
    gameMode = mode; // Global from classic.js

    document.getElementById('mode-selection').style.display = 'none';

    if (mode === 'infinite') {
        showInfiniteMode(); // from infinite.js
        initInfiniteGame(); // from infinite.js
    } else {
        showGame();
        // Default difficulty settings
        // If we want to remember last used difficulty, we'd need to store it.
        // For now, default to easy 9x9x10 unless we add difficulty selection to UI
        // or keep using the in-game buttons.
        setDifficulty(9, 9, 10);
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    if (typeof loadStats === 'function') loadStats();
    if (typeof loadOptions === 'function') loadOptions();
    if (typeof loadTheme === 'function') loadTheme();

    // Don't auto-start, wait at menu
    showMenu();
});

function quitGame() {
    if (window.electronAPI && typeof window.electronAPI.quit === 'function') {
        window.electronAPI.quit();
    } else {
        window.close();
    }
}
