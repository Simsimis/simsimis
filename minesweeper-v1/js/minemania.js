
// ==========================================
// MINE MANIA MODE (EXTENSIONS)
// ==========================================

let maniaInterval = null;
let lastActionTime = 0;
let maniaTimeLimit = 5000; // 5 seconds

function startManiaTimer() {
    if (gameMode !== 'minemania' || gameOver) return;

    if (maniaInterval) clearInterval(maniaInterval);

    // UI Update
    const bar = document.getElementById('mania-bar');
    if (bar) bar.style.width = '100%';

    lastActionTime = Date.now();

    maniaInterval = setInterval(() => {
        if (gameOver) {
            clearInterval(maniaInterval);
            return;
        }

        const elapsed = Date.now() - lastActionTime;
        const remaining = Math.max(0, maniaTimeLimit - elapsed);
        const percent = (remaining / maniaTimeLimit) * 100;

        if (bar) {
            bar.style.width = percent + '%';
            if (percent < 30) bar.style.backgroundColor = '#c0392b';
            else if (percent < 60) bar.style.backgroundColor = '#f39c12';
            else {
                // Theme support
                if (typeof customTheme !== 'undefined' && customTheme.maniaBar) {
                    bar.style.backgroundColor = customTheme.maniaBar;
                } else {
                    bar.style.backgroundColor = '#e74c3c';
                }
            }
        }

        if (remaining <= 0) {
            punishPlayer();
            resetManiaTimer();
        }
    }, 100);
}

function resetManiaTimer() {
    if (gameMode !== 'minemania') return;
    lastActionTime = Date.now();
    const bar = document.getElementById('mania-bar');
    if (bar) {
        bar.style.width = '100%';
        bar.style.backgroundColor = (typeof customTheme !== 'undefined' && customTheme.maniaBar) ? customTheme.maniaBar : '#e74c3c';
    }
}

function stopManiaTimer() {
    if (maniaInterval) clearInterval(maniaInterval);
}

function punishPlayer() {
    playSound('boom'); // Warning sound

    // 1. Expand Board
    expandBoard();

    // 2. Add extra mine? (handled in expandBoard/shuffle)
    // Actually expandBoard adds cells. shuffleUnrevealedBoard moves mines.
    // Logic: expandBoard adds new empty cells (some with mines).

    // 3. Shake effect
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen) {
        gameScreen.classList.add('shake');
        setTimeout(() => gameScreen.classList.remove('shake'), 500);
    }
}

function expandBoard() {
    // Increase size
    const oldRows = rows;
    const oldCols = cols;

    // Cap size
    if (rows >= 25 && cols >= 40) return; // Hard limit

    rows = Math.min(rows + 1, 25);
    cols = Math.min(cols + 2, 40);

    // Rebuild grid keeping old state
    let newBoard = [];
    let newRevealed = [];
    let newFlagged = [];

    for (let r = 0; r < rows; r++) {
        newBoard[r] = [];
        newRevealed[r] = [];
        newFlagged[r] = [];
        for (let c = 0; c < cols; c++) {
            if (r < oldRows && c < oldCols) {
                newBoard[r][c] = board[r][c];
                newRevealed[r][c] = revealed[r][c];
                newFlagged[r][c] = flagged[r][c];
            } else {
                // New cell
                newBoard[r][c] = 0;
                newRevealed[r][c] = false;
                newFlagged[r][c] = false;

                // Chance to add mine to new cell (15% chance)
                if (Math.random() < 0.15) {
                    newBoard[r][c] = -1;
                    totalMines++;
                }
            }
        }
    }

    board = newBoard;
    revealed = newRevealed;
    flagged = newFlagged;

    // Update global state vars for Classic.js to use
    // (JS objects are reference, but we assigned new arrays, so globals in classic.js need update if they weren't shared. 
    // Since we are in same scope, assigning 'board' here updates the global 'board' used by classic.js)

    updateMineCount();
    calculateNumbers(); // Recalc numbers for new adjacencies
    renderBoard();
}

function shuffleUnrevealedBoard() {
    // Helper to check safety lock
    const isLocked = (r, c) => {
        // Lock: Correctly flagged mine (don't move these)
        if (flagged[r][c] && board[r][c] === -1) return true;
        return false;
    };

    // 1. Gather shuffleable cells and count movable mines
    let shuffleCoords = [];
    let minesToPlace = 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!revealed[r][c]) {
                if (isLocked(r, c)) {
                    // Keep as is. Do not touch.
                } else {
                    // This cell is free to change
                    shuffleCoords.push({ r, c });
                    if (board[r][c] === -1) {
                        minesToPlace++;
                    }
                    // Clear content
                    board[r][c] = 0;
                }
            }
        }
    }

    // 2. Shuffle coordinates
    for (let i = shuffleCoords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffleCoords[i], shuffleCoords[j]] = [shuffleCoords[j], shuffleCoords[i]];
    }

    // 3. Redistribute mines
    for (let i = 0; i < minesToPlace; i++) {
        const coord = shuffleCoords[i];
        board[coord.r][coord.c] = -1;
    }

    // 4. Recalculate numbers
    calculateNumbers();
}

// Override or Extension for Right Click
function handleRightClick(r, c) {
    if (gameOver || revealed[r][c]) return;

    if (gameMode === 'minemania') {
        if (flagged[r][c]) {
            // Unflagging BLOCKED
            playSound('boom');
            // Punishment for trying to remove locked flag
            expandBoard();
            resetManiaTimer();
            return;
        } else {
            // Flagging (Placing a flag)
            if (board[r][c] === -1) {
                // Correctly identified mine
                flagged[r][c] = true;
                updateCell(r, c);
                updateMineCount();
                playSound('flag');
                resetManiaTimer(); // Reward correct play
            } else {
                // Wrong Flag (Flagging empty space)
                // Rule: Shuffle Mines AND Expand Board
                playSound('retry');
                expandBoard(); // Punishment
                shuffleUnrevealedBoard();
                renderBoard(); // Re-render after shuffle/expand
                resetManiaTimer(); // FIX: Reset timer on wrong flag too so they have time to recover from chaos
            }
        }

    } else {
        // Classic behavior (toggle flag)
        if (firstClick) return;
        flagged[r][c] = !flagged[r][c];
        updateCell(r, c);
        updateMineCount();
        playSound('flag');
    }
}
