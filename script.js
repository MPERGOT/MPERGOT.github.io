//
// Конфигурация, глобальное состояние и константы
// 

const AppState = {
    game: null, // 'CHESS', 'CHECKERS', 'HYBRID'
    mode: null, // 'PVP', 'PVE'
    score: { w: 0, b: 0 },
    isPlayerBottomWhite: true,
    gameOver: false,
    settings: {
        allowSwapOnBotTurn: false,
        mustCaptureEnabled: true,
        editModeActive: false,
        showSwapButton: false,
        addCountsAsTurn: true,
        enableUndo: false,
        botSpeed: 500
    }
};

const UNICODE = {
    w: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚', m: '●', kc: '★' }, 
    b: { p:'♟', n:'♞', b:'♝', r:'♜', q:'♛', k:'♚', m: '●', kc: '★' } 
};

// DOM-Элементы
const UI = {
    screens: { 
        menu: document.getElementById('game-menu'), 
        modeRow: document.getElementById('mode-row'), 
        game: document.getElementById('game-screen') 
    },
    board: document.getElementById('board'),
    piecesLayer: document.getElementById('pieces-layer'),
    turnInd: document.getElementById('turn-indicator'),
    score: document.getElementById('score-display'),
    history: document.getElementById('move-history'),
    result: document.getElementById('game-result-display'),
    btnSwap: document.getElementById('btn-swap'),
    settingsMenu: document.getElementById('settings-menu'),
    coordsX: document.getElementById('coords-x'),
    coordsY: document.getElementById('coords-y')
};

let board = [];
let mustCaptureSq = null;
let isBotPaused = false;
let currentTurn = 'w';
let selectedSquare = null;
let validMovesCache = [];
let prevMove = null;
let botTimer = null; 
let botMoveQueue = 0;      
let isBotExecuting = false; 

// Режим редактирования
let currentEditTool = null;
let targetEditSquare = null;
let pendingDelete = null;
let activePickerColor = 'w';

let undoStack = [];
let redoStack = [];

//
// Инициализация настроек 
//

function initSettings() {
    const editModeCheckbox = document.getElementById('setting-edit-mode');
    const addTurnContainer = document.getElementById('sub-setting-add-turn');
    
    if (editModeCheckbox && addTurnContainer) {
        const toggleAddTurnVisibility = () => {
            addTurnContainer.classList.toggle('show', editModeCheckbox.checked);
        };
        editModeCheckbox.addEventListener('change', toggleAddTurnVisibility);
    }
    
    const settingsMap = {
        'setting-must-capture': 'mustCaptureEnabled',
        'setting-swap-btn-toggle': 'showSwapButton',
        'setting-swap-bot': 'allowSwapOnBotTurn',
        'setting-edit-mode': 'editModeActive',
        'setting-add-is-turn': 'addCountsAsTurn',
        'setting-undo-redo': 'enableUndo'
    };

    Object.entries(settingsMap).forEach(([id, stateKey]) => {
        const el = document.getElementById(id);
        if (!el) return;
        
        el.checked = AppState.settings[stateKey];
        
        if (stateKey === 'editModeActive' && addTurnContainer) {
            addTurnContainer.classList.toggle('show', el.checked);
        }
        
        el.addEventListener('change', (e) => {
            AppState.settings[stateKey] = e.target.checked;
            if (stateKey === 'showSwapButton' || stateKey === 'allowSwapOnBotTurn') {
                updateSwapButtonState();
            }
            
            if (stateKey === 'editModeActive') {
                currentEditTool = null;
                document.querySelectorAll('.btn-edit').forEach(b => b.classList.remove('active-tool'));
            }

            if (stateKey === 'enableUndo') {
                updateUndoUI();
            }

            render(); 
        });
    });

    updateUndoUI();

    // Управление видимостью меню и анимацией шестеренки
    const settingsIcon = document.getElementById('settings-icon');
    let currentRotation = 0;

    settingsIcon.addEventListener('click', (e) => {        
        e.stopPropagation();
        const isHidden = UI.settingsMenu.classList.contains('hidden-settings');
        
        if (isHidden) {
            UI.settingsMenu.classList.remove('hidden-settings');
        currentRotation += 90;
        settingsIcon.style.transform = `rotate(${currentRotation}deg)`;
        } else {
            UI.settingsMenu.classList.add('hidden-settings');

            currentRotation -= 90;
            settingsIcon.style.transform = `rotate(${currentRotation}deg)`;
        }
    });

    document.addEventListener('click', () => {
        if (!UI.settingsMenu.classList.contains('hidden-settings')) {
            UI.settingsMenu.classList.add('hidden-settings');
            
            currentRotation -= 90;
            settingsIcon.style.transform = `rotate(${currentRotation}deg)`;
        }
    });

    UI.settingsMenu.addEventListener('click', e => e.stopPropagation());
    
    // Закрытие модалок по клику
 document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if(e.target === overlay) overlay.style.display = 'none';
        });
    });
    initSpeedSettings();
}

function updateUndoUI() {
    const historyNav = document.querySelector('.history-nav');
    const infoPanel = document.querySelector('.info-panel');
    const infoRows = document.querySelectorAll('.info-row');
    
    if (AppState.settings.enableUndo) {
        if (historyNav) historyNav.style.display = 'flex';
        
        if (infoPanel) {
            infoPanel.style.alignItems = 'flex-start';
        }
        infoRows.forEach(row => {
            row.style.justifyContent = 'flex-start';
        });
    } else {
        if (historyNav) historyNav.style.display = 'none';
        
        if (infoPanel) {
            infoPanel.style.alignItems = 'center';
        }
        infoRows.forEach(row => {
            row.style.justifyContent = 'center';
        });
    }
}

function initSpeedSettings() {
    const speedGroup = document.getElementById('speed-toggle-group');
    if (!speedGroup) return;
    
    const buttons = speedGroup.querySelectorAll('.speed-btn');
    
    const savedSpeed = localStorage.getItem('hybridGame_botSpeed');
    if (savedSpeed) {
        AppState.settings.botSpeed = parseInt(savedSpeed, 10);
    } else {
        AppState.settings.botSpeed = 500;
    }
    
    buttons.forEach(btn => {
        if (parseInt(btn.dataset.speed, 10) === AppState.settings.botSpeed) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }

        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            AppState.settings.botSpeed = parseInt(btn.dataset.speed, 10);
            localStorage.setItem('hybridGame_botSpeed', btn.dataset.speed);
        });
    });
}


// 
// Главное меню и управление ходом игры
//

document.getElementById('game-menu').addEventListener('click', (e) => {
    if (!e.target.classList.contains('main-btn')) return;
    const id = e.target.id;
    
    if (['btn-chess', 'btn-checkers', 'btn-hybrid'].includes(id)) {
        document.querySelectorAll('.buttons-row .main-btn').forEach(btn => {
            if (['btn-chess', 'btn-checkers', 'btn-hybrid'].includes(btn.id)) {
                btn.classList.remove('selected');
            }
        });
        e.target.classList.add('selected');
        AppState.game = id.replace('btn-', '').toUpperCase();
        UI.screens.modeRow.style.display = 'flex';
    } 
    else if (id === 'btn-pvp' || id === 'btn-pve') {
        startGame(id.replace('btn-', '').toUpperCase());
    }
});

document.getElementById('btn-exit').onclick = () => { 
    UI.screens.game.classList.remove('active'); 
    UI.screens.menu.classList.add('active'); 
};
document.getElementById('btn-reset').onclick = resetBoard;
UI.btnSwap.onclick = swapSides;

function startGame(mode) {
    AppState.mode = mode;
    UI.screens.menu.classList.remove('active');
    UI.screens.game.classList.add('active');
    AppState.score = { w: 0, b: 0 };
    resetBoard();
}

function resetBoard() {
    AppState.gameOver = false;
    AppState.isPlayerBottomWhite = true;
    UI.history.innerHTML = '';
    UI.result.textContent = '';
    currentTurn = 'w';
    selectedSquare = null;
    validMovesCache = []; 
    prevMove = null;
    botMoveQueue = 0;     
    isBotExecuting = false; 
    mustCaptureSq = null;
    currentEditTool = null;
    targetEditSquare = null;
    pendingDelete = null;
    undoStack = [];
    redoStack = [];
    
    updateNavButtons();
    document.querySelectorAll('.btn-edit').forEach(b => b.classList.remove('active-tool'));
    
    board = Array(8).fill(null).map(() => Array(8).fill(null));

    if (AppState.game === 'CHESS') setupChessPreset();
    else if (AppState.game === 'CHECKERS') setupCheckersPreset();
    else if (AppState.game === 'HYBRID') setupHybridPreset();

    updateScoreUI();
    
    // Генерация DOM-клеток
    if (UI.board.children.length === 0) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = document.createElement('div');
                cell.className = `cell ${(r + c) % 2 !== 0 ? 'dark' : 'light'}`;
                cell.dataset.r = r; cell.dataset.c = c;
                cell.onclick = () => handleSquareClick(parseInt(cell.dataset.r), parseInt(cell.dataset.c));
                UI.board.appendChild(cell);
            }
        }
    }
    
    updateCoordinates();
    updateSwapButtonState();
    render();
    
    if (AppState.mode === 'PVE' && !AppState.isPlayerBottomWhite) enqueueBotMove();
}

function setupChessPreset() {
    const order = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
        board[0][c] = { type: order[c], c: 'b' };
        if (order[c] === 'k') board[0][c].isOriginal = true;
        
        board[1][c] = { type: 'p', c: 'b' };
        board[6][c] = { type: 'p', c: 'w' };
        
        board[7][c] = { type: order[c], c: 'w' };
        if (order[c] === 'k') board[7][c].isOriginal = true;
    }
}

function setupCheckersPreset() {
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            if((r+c)%2 !== 0) {
                if(r < 3) board[r][c] = { type: 'm', c: 'b' };
                else if(r > 4) board[r][c] = { type: 'm', c: 'w' };
            }
        }
    }
}

function setupHybridPreset() {
    const blackRow = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
        board[0][c] = { type: blackRow[c], c: 'b' };
        if (blackRow[c] === 'k') board[0][c].isOriginal = true;
        board[1][c] = { type: 'p', c: 'b' };
    }
    for(let r=5; r<8; r++) {
        for(let c=0; c<8; c++) {
            if((r+c)%2 !== 0) board[r][c] = { type: 'm', c: 'w' };
        }
    }
}


// 
// Отрисовка интерфейса (Рендер)
//

function updateCoordinates() {
    let letters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let numbers = ['8', '7', '6', '5', '4', '3', '2', '1'];

    if (!AppState.isPlayerBottomWhite) {
        letters.reverse();
        numbers.reverse();
    }

    UI.coordsX.innerHTML = letters.map(l => `<span>${l}</span>`).join('');
    UI.coordsY.innerHTML = numbers.map(n => `<span>${n}</span>`).join('');
}

// Отрисовка (Рендер)
function render() {
    renderSettingsUI();
    
    const isBotTurn = (AppState.mode === 'PVE' && currentTurn === (AppState.isPlayerBottomWhite ? 'b' : 'w'));
    const mustCaps = (AppState.game === 'CHECKERS' && AppState.settings.mustCaptureEnabled) ? getAllUniversalCaps(currentTurn).map(m => m.from) : [];
     
    if (AppState.lastOrientation !== undefined && AppState.lastOrientation !== AppState.isPlayerBottomWhite) {
        UI.piecesLayer.innerHTML = '';
    }
    AppState.lastOrientation = AppState.isPlayerBottomWhite;

    const existingEls = Array.from(UI.piecesLayer.children);
    const reusedEls = new Set();
    const requiredPieces = [];

    Array.from(UI.board.children).forEach(cell => {
        const visualR = parseInt(cell.dataset.r);
        const visualC = parseInt(cell.dataset.c);
        const r = AppState.isPlayerBottomWhite ? visualR : 7 - visualR;
        const c = AppState.isPlayerBottomWhite ? visualC : 7 - visualC;
        const alg = toAlg(r, c);
        
        cell.className = `cell ${(visualR + visualC) % 2 !== 0 ? 'dark' : 'light'}`;
        
        if (prevMove && (prevMove.from === alg || prevMove.to === alg)) cell.classList.add('highlight-prev-move');
        if (mustCaps.includes(alg) && (!mustCaptureSq || mustCaptureSq === alg)) {
            cell.classList.add('highlight-must-capture');
        }

        const move = validMovesCache.find(m => (m.to || m.toAlg) === alg);
        if (move) cell.classList.add((move.captured || move.cap || move.isCheckersCap) ? 'highlight-capture' : 'highlight-normal');

        const p = getPiece(r, c);
        if (p) {
            requiredPieces.push({ r, c, visualR, visualC, alg, p, el: null });
        }
    });

    requiredPieces.forEach(req => {
        if (prevMove && prevMove.to === req.alg) {
            const match = existingEls.find(el => !reusedEls.has(el) && el.dataset.sq === prevMove.from);
            if (match) {
                req.el = match;
                reusedEls.add(match);
            }
        }
    });

    requiredPieces.forEach(req => {
        if (!req.el) {
            if (prevMove && prevMove.to === req.alg) return;
            const match = existingEls.find(el => !reusedEls.has(el) && el.dataset.sq === req.alg);
            if (match) {
                req.el = match;
                reusedEls.add(match);
            }
        }
    });

    requiredPieces.forEach(req => {
        if (!req.el) {
            const targetSymbol = getPieceSymbol(req.p);
            const targetColorClass = req.p.c === 'w' ? 'white' : 'black';
            const match = existingEls.find(el => {
                return !reusedEls.has(el) && 
                       el.classList.contains(targetColorClass) && 
                       el.innerHTML === targetSymbol;
            });
            if (match) {
                req.el = match;
                reusedEls.add(match);
            }
        }
    });

    existingEls.forEach(el => {
        if (!reusedEls.has(el)) {
            el.remove();
        }
    });

    let kingsCount = { w: 0, b: 0 };
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const p = getPiece(r, c);
            if(p && p.type === 'k') kingsCount[p.c]++;
        }
    }

    requiredPieces.forEach(req => {
        let pieceEl = req.el;
        if (!pieceEl) {
            pieceEl = document.createElement('div');
            UI.piecesLayer.appendChild(pieceEl);
        }
        
        pieceEl.className = `piece ${req.p.c === 'w' ? 'white' : 'black'}`;
        
        if (req.p.type === 'k' && req.p.isOriginal && kingsCount[req.p.c] > 1) {
            pieceEl.classList.add('highlight-original-king');
        } else {
            pieceEl.classList.remove('highlight-original-king');
        }
        pieceEl.innerHTML = getPieceSymbol(req.p);
        pieceEl.dataset.sq = req.alg; // Сохраняем текущую клетку для расчетов на следующем ходу
        
        pieceEl.style.top = `${req.visualR * 12.5}%`;
        pieceEl.style.left = `${req.visualC * 12.5}%`;
        
        if (currentEditTool === 'remove') pieceEl.classList.add('wobble');

        pieceEl.onclick = (e) => {
            e.stopPropagation();
            if (!AppState.gameOver && !(isBotTurn && !AppState.settings.editModeActive)) {
                handleSquareClick(req.visualR, req.visualC);
            }
        };
    });

    UI.turnInd.textContent = currentTurn === 'w' ? 'Белые' : 'Черные';
    UI.turnInd.style.color = currentTurn === 'w' ? '#f0d9b5' : '#b58863';
}

function renderSettingsUI() {
    document.getElementById('edit-tools').style.display = AppState.settings.editModeActive ? 'flex' : 'none';
    document.getElementById('sub-setting-bot-swap').classList.toggle('show', AppState.settings.showSwapButton);
}

function updateSwapButtonState() {
    if (!UI.btnSwap) return;
    
    if (AppState.settings.showSwapButton) {
        UI.btnSwap.style.display = 'inline-block'; 
    } else {
        UI.btnSwap.style.display = 'none';         
        return; 
    }
    
    if (AppState.gameOver) {
        UI.btnSwap.disabled = true;
        return;
    }
    
    const botColor = AppState.isPlayerBottomWhite ? 'b' : 'w';
    const isBotTurn = (AppState.mode === 'PVE' && currentTurn === botColor);

    if (isBotTurn && !AppState.settings.allowSwapOnBotTurn) {
        UI.btnSwap.disabled = true;
    } else {
        UI.btnSwap.disabled = false;
    }
}

function updateScoreUI() { 
    UI.score.textContent = `${AppState.score.w} : ${AppState.score.b}`; 
}

//
// Система отмены ходов (Undo / Redo)
//

const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.onclick = undoMove;
    if (btnRedo) btnRedo.onclick = redoMove;

function saveState() {
    const boardCopy = board.map(row => row.map(cell => cell ? {...cell} : null));
    undoStack.push({
        board: boardCopy,
        turn: currentTurn,
        historyHTML: UI.history.innerHTML,
        prevMove: prevMove ? {...prevMove} : null,
        botQueue: botMoveQueue,
        mustCaptureSq: mustCaptureSq,
        gameOver: AppState.gameOver,
        resultText: UI.result.textContent,
        score: UI.score.textContent,
        botQueue: botMoveQueue
    });
    redoStack = [];
    updateNavButtons();
}

function undoMove() {
    isBotExecuting = false;
    const botColor = AppState.isPlayerBottomWhite ? 'b' : 'w';
    
    if (undoStack.length === 0) return;
    isBotPaused = true;
    
    const currentBoardCopy = board.map(row => row.map(cell => cell ? {...cell} : null));
    redoStack.push({
        board: currentBoardCopy,
        turn: currentTurn,
        historyHTML: UI.history.innerHTML,
        prevMove: prevMove ? {...prevMove} : null,
        botQueue: botMoveQueue,
        mustCaptureSq: mustCaptureSq,
        gameOver: AppState.gameOver,
        resultText: UI.result.textContent,
        score: UI.score.textContent
    });
    
    const prevState = undoStack.pop();
    
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            board[r][c] = prevState.board[r][c];
        }
    }
    
    currentTurn = prevState.turn;
    UI.history.innerHTML = prevState.historyHTML;
    prevMove = prevState.prevMove;
    botMoveQueue = prevState.botQueue;
    mustCaptureSq = prevState.mustCaptureSq;
    
    AppState.gameOver = prevState.gameOver;
    UI.result.textContent = prevState.resultText;
    UI.score.textContent = prevState.score

    selectedSquare = null;
    validMovesCache = [];
    
    if (currentTurn == botColor) botMoveQueue--;
    
    render();
    updateNavButtons();
    updateSwapButtonState();
}

function redoMove() {
    if (redoStack.length === 0) return;
    
    undoStack.push({
        board: board.map(row => row.map(cell => cell ? {...cell} : null)),
        turn: currentTurn,
        historyHTML: UI.history.innerHTML,
        prevMove: prevMove ? {...prevMove} : null,
        botQueue: botMoveQueue,
        mustCaptureSq: mustCaptureSq,
        gameOver: AppState.gameOver,
        resultText: UI.result.textContent,
        score: UI.score.textContent
    });
    
    const nextState = redoStack.pop();
    
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            board[r][c] = nextState.board[r][c];
        }
    }
    
    currentTurn = nextState.turn;
    UI.history.innerHTML = nextState.historyHTML; 
    prevMove = nextState.prevMove;
    botMoveQueue = nextState.botQueue;
    mustCaptureSq = nextState.mustCaptureSq;
    
    AppState.gameOver = nextState.gameOver;
    UI.result.textContent = nextState.resultText;
    UI.score.textContent = nextState.score;
    
    selectedSquare = null;
    validMovesCache = [];
    
    render();
    updateNavButtons();
    updateSwapButtonState();
}

function updateNavButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = undoStack.length === 0;
    if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}


//
// Взаимодействие с доской и базовые механики
//

function handleSquareClick(visualR, visualC) {

    const r = AppState.isPlayerBottomWhite ? visualR : 7 - visualR;
    const c = AppState.isPlayerBottomWhite ? visualC : 7 - visualC;
    const alg = toAlg(r, c);

    if (currentEditTool === 'remove') {
        const piece = getPiece(r, c);
        if (piece) {
            if (piece.type === 'k' && piece.isOriginal) {
                alert("Начального короля удалять нельзя!"); 
                return;
            }
            pendingDelete = { r, c };
            document.getElementById('confirm-modal').style.display = 'flex';
            render();
        }
        return; 
    }

    if (currentEditTool === 'add') {
        const piece = getPiece(r, c);
        if (piece && piece.type === 'k' && piece.isOriginal) { 
            alert("Начального короля заменять нельзя!"); 
            return; 
        }
        targetEditSquare = { r, c };
        setPickerColor('w'); 
        document.getElementById('add-piece-modal').style.display = 'flex';
        render();
        return;
    }

    if (AppState.gameOver) return;
    
    const botColor = AppState.isPlayerBottomWhite ? 'b' : 'w';
    if (AppState.mode === 'PVE' && currentTurn === botColor) return; 

    if (selectedSquare) {
        const move = validMovesCache.find(m => (m.to || m.toAlg) === alg);
        if (move) { 
            executeMove({ ...move });
            return; 
        }
    }

    // Выбор фигуры для хода
    const p = getPiece(r, c);
    if (p && p.c === currentTurn) {
        if (mustCaptureSq) {
            if (alg !== mustCaptureSq) return;
        } 
        else if (AppState.game === 'CHECKERS' && AppState.settings.mustCaptureEnabled) {
            const caps = getAllUniversalCaps(currentTurn);
            if (caps.length > 0 && !caps.some(m => m.from === alg)) return;
        }

        selectedSquare = alg;
        validMovesCache = getValidMoves(r, c);
    } else {
        if (!mustCaptureSq) {
            selectedSquare = null;
            validMovesCache = [];
        }
    }
    render();
}

function executeMove(move) {
    if (AppState.gameOver || !move || !move.from) return;

    isBotPaused = false; 
    saveState(); 
    
    const f = fromAlg(move.from);
    const to = fromAlg(move.to || move.toAlg);
    const p = board[f.r][f.c];
    if (!p) return;
    
    let originalKingKilled = false;
    let shouldSwapTurn = true;

    board[f.r][f.c] = null;
    
    // Обработка взятия шашкой
    if (move.cap && move.cap.r !== undefined) {
        const victim = board[move.cap.r][move.cap.c];
        if (victim && victim.type === 'k' && victim.isOriginal) originalKingKilled = true;
        board[move.cap.r][move.cap.c] = null; 
    }
        
    const targetCell = board[to.r][to.c];
    if (targetCell && targetCell.type === 'k' && targetCell.isOriginal) originalKingKilled = true;

    board[to.r][to.c] = p;
    
    if (p.type === 'm' && ((p.c === 'w' && to.r === 0) || (p.c === 'b' && to.r === 7))) {
        p.type = 'kc'; 
    }
    if (p.type === 'p' && ((p.c === 'w' && to.r === 0) || (p.c === 'b' && to.r === 7))) {
        p.type = 'q'; 
    }    

    prevMove = { from: move.from, to: toAlg(to.r, to.c) };
    addHistory(prevMove);
    
    if (originalKingKilled) {
        selectedSquare = null;
        validMovesCache = [];
        mustCaptureSq = null;
        checkUniversalGameOver();
        updateSwapButtonState();
        render();
        return;
    }

    const canContinue = AppState.game === 'CHECKERS' && AppState.settings.mustCaptureEnabled && (p.type == 'm' || p.type == 'kc') && move.cap && getCheckersCapsForPiece(to.r, to.c, p).length > 0;

    if (canContinue) {
        shouldSwapTurn = false;
        selectedSquare = toAlg(to.r, to.c);
        mustCaptureSq = toAlg(to.r, to.c);
        validMovesCache = getCheckersCapsForPiece(to.r, to.c, p);
    } else {
        mustCaptureSq = null;
        shouldSwapTurn = true;
    }

    checkUniversalGameOver();

    if (AppState.gameOver) {
        selectedSquare = null;
        validMovesCache = [];
        updateSwapButtonState(); 
        render(); 
        return;
    }

    if (shouldSwapTurn) {
        currentTurn = currentTurn == 'w' ? 'b' : 'w';
        selectedSquare = null;
        validMovesCache = [];
    } 

    updateSwapButtonState();
    render();

    const botColor = AppState.isPlayerBottomWhite ? 'b' : 'w';
    if (AppState.mode === 'PVE' && currentTurn === botColor && !AppState.gameOver) {
        enqueueBotMove();
    }
}

function swapSides() {
    if (UI.btnSwap.disabled || AppState.gameOver) return;

    AppState.isPlayerBottomWhite = !AppState.isPlayerBottomWhite;
    selectedSquare = null;
    validMovesCache = [];
    
    updateSwapButtonState(); 
    updateCoordinates();
    render();
    checkUniversalGameOver();

    if (AppState.mode === 'PVE' && !AppState.gameOver) {
        const currentBotColor = AppState.isPlayerBottomWhite ? 'b' : 'w';
        
        if (currentTurn === currentBotColor) {
            isBotPaused = false;
            botMoveQueue = 0; 
            enqueueBotMove();
        }
    }
}


//
// Бот
//

function scheduleBotMove(delay) {
    if (botTimer) clearTimeout(botTimer);
    botTimer = setTimeout(botMove, delay);
}

function enqueueBotMove() {
    botMoveQueue++;
    processBotQueue();
}

function processBotQueue() {
    if (isBotExecuting || botMoveQueue <= 0 || AppState.gameOver || isBotPaused) return;

    isBotExecuting = true;

    // Ускоряем до 50мс, если в очереди больше 1 хода
    const currentDelay = botMoveQueue > 1 ? 50 : (AppState.settings.botSpeed || 500);

    setTimeout(() => {
        if (!AppState.gameOver) {

            if (typeof botMove === 'function') {
                botMove(true);
            }
        }

        botMoveQueue--;
        isBotExecuting = false;

        if (botMoveQueue > 0 && !AppState.gameOver) {
            processBotQueue();
        }
    }, currentDelay);
}

function botMove(fromQueue = false) {
    if (AppState.gameOver || isBotPaused) return;

    if (!fromQueue) {
        const botColor = AppState.isPlayerBottomWhite ? 'b' : 'w';
        if (currentTurn !== botColor) return;
    }

    let moves = [];
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const p = board[r][c];
            if (p && p.c === currentTurn) {
                moves.push(...getValidMoves(r, c));
            }
        }
    }

    if (moves.length === 0) { checkUniversalGameOver(); return; }
    
    // Бот делает случайные ходы
    const m = moves[Math.floor(Math.random() * moves.length)];
    executeMove(m);
}


//
// Завершения игры
//

function checkUniversalGameOver() {
    let hasMoves = { w: false, b: false };
    let checkersCount = { w: 0, b: 0 };
    let totalPieces = { w: 0, b: 0 };
    let originalKingAlive = { w: false, b: false };
    let originalKingPos = { w: null, b: null };
    if (AppState.game === 'HYBRID') {
        originalKingAlive.w = null;
    }

    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const p = board[r][c];
            if (p) {
                totalPieces[p.c]++;
                if (p.type === 'k' && p.isOriginal) {
                    originalKingAlive[p.c] = true;
                    originalKingPos[p.c] = {r, c};
                }
                if (p.type === 'm' || p.type === 'kc') checkersCount[p.c]++;
                
                if (!mustCaptureSq && !hasMoves[p.c] && getValidMoves(r, c).length > 0) {
                    hasMoves[p.c] = true;
                }
            }
        }
    }

    if (mustCaptureSq) {
        hasMoves = { w: true, b: true };
    }

    // Правила режима Шашки
    if (AppState.game === 'CHECKERS') {
        if (checkersCount.w === 0) return declareWinner('Шашки пали! Победа Черных', 'b');
        if (checkersCount.b === 0) return declareWinner('Шашки пали! Победа Белых', 'w');
        
        if (!hasMoves.w) return declareWinner('Нет ходов! Победа Черных!', 'b');
        if (!hasMoves.b) return declareWinner('Нет ходов! Победа Белых!', 'w');
        return;
    }

    // Правила режима Шахматы или Гибрид
    if (AppState.game === 'CHESS' || AppState.game === 'HYBRID') {
        
        if (AppState.game === 'CHESS') {
            if (!originalKingAlive.w && !originalKingAlive.b) return declareWinner('Ничья! Оба короля пали.');
            if (!originalKingAlive.w) return declareWinner('Король пал! Победа Черных', 'b');
            if (!originalKingAlive.b) return declareWinner('Король пал! Победа Белых', 'w');
        } 
        else if (AppState.game === 'HYBRID') {
            if (totalPieces.w === 0) return declareWinner('Фигуры Белых съедены! Победа Черных', 'b');
            if (totalPieces.b === 0) return declareWinner('Фигуры Черных съедены! Победа Белых', 'w');
            
            if (!originalKingAlive.b) return declareWinner('Король пал! Победа Белых', 'w');
        }

        if (!hasMoves[currentTurn]) {
            const enemy = currentTurn === 'w' ? 'b' : 'w';
            const enemyName = enemy === 'w' ? 'Белые' : 'Черные';
            
            let isCheckmate = false;
            if (originalKingAlive[currentTurn]) {
                const alg = toAlg(originalKingPos[currentTurn].r, originalKingPos[currentTurn].c);
                if (isSquareAttackedByEnemy(alg, currentTurn)) isCheckmate = true;
            }
            
            if (isCheckmate) {
                return declareWinner(`Мат! Победили ${enemyName}`, enemy);
            } else {
                return declareWinner('Пат! Ничья');
            }
        }
    }
}

function declareWinner(msg, winnerColor = null) {
    AppState.gameOver = true;
    UI.result.textContent = msg;
    if (winnerColor) AppState.score[winnerColor]++;
    updateScoreUI(); updateSwapButtonState();
    selectedSquare = null; validMovesCache = [];
    render();
}

//
// Генерация и валидация ходов
//

function getValidMoves(r, c) {
    const p = board[r][c];
    if (!p) return [];

    if (mustCaptureSq && toAlg(r, c) !== mustCaptureSq) return [];

    const canCapture = AppState.settings.mustCaptureEnabled && 
                       (AppState.game === 'CHECKERS');
    
    let allCaps = [];
    if (canCapture && !mustCaptureSq) {
        allCaps = getAllUniversalCaps(p.c);
    }

    let moves = [];

    if (AppState.game === 'HYBRID') {
        moves = getHybridMoves(r, c);
    } 
    else if (AppState.game === 'CHECKERS') {
        moves = getCheckersMovesForPiece(r, c, p);
    }
    else {
        moves = getChessMovesForPiece(r, c, p);
    }

    if (allCaps.length > 0) {
        const caps = moves.filter(m => !!m.cap || !!m.captured); 
        
        if (caps.length === 0) return [];
        moves = caps;
    }

    moves = moves.filter(m => {
        const to = fromAlg(m.to || m.toAlg);
        const target = board[to.r][to.c];
        return !(target && target.c === p.c); 
    });

    if (AppState.game !== 'CHECKERS') {
        moves = moves.filter(m => !leavesOriginalKingInCheck(m, p.c));
    }

    return moves;
}

function getHybridMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    
    const moves = [];
    const enemy = piece.c === 'w' ? 'b' : 'w';
    const dir = piece.c === 'w' ? -1 : 1; 

    const isValid = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;
    const fromAlg = toAlg(r, c);

    const addMove = (row, col) => {
        if (isValid(row, col)) {
            if (!board[row][col]) {
                moves.push({ from: fromAlg, to: toAlg(row, col), r: row, c: col });
                return true; 
            } else {
                if (board[row][col].c === enemy) {
                    moves.push({ from: fromAlg, to: toAlg(row, col), r: row, c: col, captured: true });
                }
                return false; 
            }
        }
        return false; 
    };

    const type = piece.type.toLowerCase();

    if (type === 'm') {
        for (let dc of [-1, 1]) {
            if (isValid(r + dir, c + dc) && !board[r + dir][c + dc]) {
                moves.push({ from: fromAlg, to: toAlg(r + dir, c + dc), r: r + dir, c: c + dc });
            }
        }
        
        const attackDirs = [[-1,-1], [-1,0], [-1,1], [0,-1], [0,1], [1,-1], [1,0], [1,1]];
        for (let [dr, dc] of attackDirs) {
            if (isValid(r + dr, c + dc) && board[r + dr][c + dc] && board[r + dr][c + dc].c === enemy) {
                moves.push({ 
                    from: fromAlg, 
                    to: toAlg(r + dr, c + dc), 
                    r: r + dr, 
                    c: c + dc, 
                    captured: true,
                    cap: { r: r + dr, c: c + dc }
                });
            }
        }
    }
    else if (type === 'kc' || type === 'b') {
        const dirs = [[-1,-1], [-1,1], [1,-1], [1,1]];
        for (let [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (addMove(nr, nc)) { nr += dr; nc += dc; }
        }
    }
    else if (type === 'k') {
        // Поставленный король
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let [dr, dc] of dirs) { addMove(r + dr, c + dc); }
    }
    else if (type === 'r') {
        const dirs = [[-1,0], [1,0], [0,-1], [0,1]];
        for (let [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (addMove(nr, nc)) { nr += dr; nc += dc; }
        }
    }
    else if (type === 'q') {
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1], [-1,0], [1,0], [0,-1], [0,1]];
        for (let [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            while (addMove(nr, nc)) { nr += dr; nc += dc; }
        }
    }
    else if (type === 'n') {
        const dirs = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (let [dr, dc] of dirs) { addMove(r + dr, c + dc); }
    }
    else if (type === 'p') {
        if (isValid(r + dir, c) && !board[r + dir][c]) {
            moves.push({ from: fromAlg, to: toAlg(r + dir, c), r: r + dir, c: c });
            const startRow = piece.c === 'w' ? 6 : 1;
            if (r === startRow && !board[r + dir * 2][c]) {
                moves.push({ from: fromAlg, to: toAlg(r + dir * 2, c), r: r + dir * 2, c: c });
            }
        }
        for (let dc of [-1, 1]) {
            if (isValid(r + dir, c + dc) && board[r + dir][c + dc] && board[r + dir][c + dc].c === enemy) {
                moves.push({ from: fromAlg, to: toAlg(r + dir, c + dc), r: r + dir, c: c + dc, captured: true });
            }
        }
    }

    return moves;
}

function leavesOriginalKingInCheck(move, color) {
    let origKing = null;
    
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const pc = board[r][c];
            if (pc && pc.type === 'k' && pc.c === color) {
                if (pc.isOriginal || !origKing) {
                    origKing = {r, c};
                }
            }
        }
    }
    if (!origKing) return false;
    
    // Временно совершаем ход на доске
    const f = fromAlg(move.from);
    const to = fromAlg(move.to || move.toAlg);
    const movingPiece = board[f.r][f.c];
    const targetPiece = board[to.r][to.c];
    let capturedPiece = null;
    let capR = -1, capC = -1;

    board[f.r][f.c] = null;
    if (move.cap && move.cap.r !== undefined) {
        capR = move.cap.r; capC = move.cap.c;
        capturedPiece = board[capR][capC];
        board[capR][capC] = null;
    }
    board[to.r][to.c] = movingPiece;

    const kingPosAlg = (movingPiece && movingPiece.type === 'k') ? toAlg(to.r, to.c) : toAlg(origKing.r, origKing.c);

    const inCheck = isSquareAttackedByEnemy(kingPosAlg, color);

    // Откатываем ход назад
    board[f.r][f.c] = movingPiece;
    board[to.r][to.c] = targetPiece;
    if (capturedPiece) board[capR][capC] = capturedPiece;

    return inCheck;
}

// Калькулятор для шахматных фигур
function getChessMovesForPiece(r, c, p) {
    if (p.type === 'k' && !p.isOriginal) {
        const moves = [];
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let [dr, dc] of dirs) {
            let nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const target = board[nr][nc];
                moves.push({ from: toAlg(r, c), to: toAlg(nr, nc), captured: !!target, isChessMove: true });
            }
        }
        return moves;
    }

    if (!window.__tempChessEngine) {
        window.__tempChessEngine = new Chess();
    }
    const tempChess = window.__tempChessEngine;
    tempChess.clear();
    
    for(let i=0; i<8; i++) {
        for(let j=0; j<8; j++) {
            let piece = board[i][j];
            if (piece) {
                let tempType = piece.type;
                
                if (piece.type === 'k') {
                    if (piece.isOriginal) {
                        tempType = 'k';
                    } else {
                        tempType = (i === 0 || i === 7) ? 'n' : 'p';
                    }
                } else if (piece.type === 'm' || piece.type === 'kc') {
                    tempType = 'n'; // Шашки маскируем под коней
                } else if (piece.type === 'p' && (i === 0 || i === 7)) {
                    tempType = 'q'; // Пешки на краях
                }
                try {
                    tempChess.put({ type: tempType, color: piece.c }, toAlg(i, j));
                } catch(e) {
                }
            }
        }
    }
    
    let fen = tempChess.fen().split(' ');
    fen[1] = p.c;
    
    if (tempChess.load(fen.join(' '))) {
        let moves = tempChess.moves({ square: toAlg(r, c), verbose: true });
        return moves.map(m => ({ 
            from: m.from, 
            to: m.to, 
            isChessMove: true, 
            captured: !!m.captured 
        }));
    }
    
    let fallbackMoves = getHybridMoves(r, c);
    return fallbackMoves.map(m => ({
        from: m.from,
        to: m.to || m.toAlg,
        isChessMove: true,
        captured: !!m.captured
    }));
}

// Калькулятор для шашечных фигур
function getCheckersMovesForPiece(r, c, p) {
    const moves = [];
    const caps = getCheckersCapsForPiece(r, c, p);
    
    if (AppState.game === 'HYBRID') {
        // Гибрид шашки
        const dirs8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        dirs8.forEach(d => {
            let nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !board[nr][nc]) {
                moves.push({from: toAlg(r,c), to: toAlg(nr,nc)}); 
            }
        });
    } else {
        // Классические шашки
        const dirs = p.type === 'm' ? (p.c === 'w' ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]]) : [[-1,-1],[-1,1],[1,-1],[1,1]];
        dirs.forEach(d => {
            let nr = r + d[0], nc = c + d[1];
            if (p.type === 'm') { 
                if (nr>=0 && nr<8 && nc>=0 && nc<8 && !board[nr][nc]) {
                    moves.push({from: toAlg(r,c), to: toAlg(nr,nc)}); 
                }
            } else { // Дамка
                while(nr>=0 && nr<8 && nc>=0 && nc<8 && !board[nr][nc]) { 
                    moves.push({from: toAlg(r,c), to: toAlg(nr,nc)}); 
                    nr+=d[0]; nc+=d[1]; 
                } 
            }
        });
    }
    
    return [...moves, ...caps];
}

function getCheckersCapsForPiece(r, c, p) {
    const caps = []; 
    
    if (AppState.game === 'HYBRID') {
        // Гибрид Шашки 
        const dirs8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        dirs8.forEach(d => {
            let nr = r + d[0], nc = c + d[1];
            if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
                const victim = board[nr][nc];
                if (victim && victim.c !== p.c) {

                    caps.push({from: toAlg(r,c), to: toAlg(nr,nc), cap: {r: nr, c: nc}});
                }
            }
        });
    } else {
        // Классические шашки
        const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
        dirs.forEach(d => {
            if (p.type === 'm') {
                const mr = r+d[0], mc = c+d[1], tr = r+d[0]*2, tc = c+d[1]*2;
                if (tr>=0 && tr<8 && tc>=0 && tc<8) {
                    const mid = board[mr][mc];
                    if (mid && mid.c !== p.c && !board[tr][tc]) {
                        caps.push({from: toAlg(r,c), to: toAlg(tr,tc), cap: {r: mr, c: mc}});
                    }
                }
            } else { // Дамка
                let nr = r+d[0], nc = c+d[1], victim = null;
                while(nr>=0 && nr<8 && nc>=0 && nc<8) {
                    const cur = board[nr][nc];
                    if (cur) { 
                        if (cur.c === p.c || victim) break; 
                        victim = {r: nr, c: nc}; 
                    } else if (victim) {
                        caps.push({from: toAlg(r,c), to: toAlg(nr,nc), cap: victim});
                    }
                    nr+=d[0]; nc+=d[1];
                }
            }
        });
    }
    
    return caps;
}

function getAllUniversalCaps(color) {
    let res = [];
    for(let r=0; r<8; r++) for(let c=0; c<8; c++) {
        const p = board[r][c];

        if (p && p.c === color && (p.type === 'm' || p.type === 'kc')) {
            res.push(...getCheckersCapsForPiece(r, c, p));
        }
    }
    return res;
}

function isSquareAttackedByEnemy(algSq, myColor) {
    const enemyColor = myColor === 'w' ? 'b' : 'w';
    
    for(let r=0; r<8; r++) {
        for(let c=0; c<8; c++) {
            const p = board[r][c];
            if (p && p.c === enemyColor) {
                
                // 1. Режим шашек
                if (AppState.game === 'CHECKERS') {
                    if (p.type === 'm' || p.type === 'kc') {
                        const caps = getCheckersCapsForPiece(r, c, p);
                        if (caps.some(m => m.cap && toAlg(m.cap.r, m.cap.c) === algSq)) return true;
                    }
                } 
                // Гибридный режим
                else if (AppState.game === 'HYBRID') {
                    const moves = getHybridMoves(r, c);
                    if (moves.some(m => {
                        const targetAlg = m.to || m.toAlg;
                        return targetAlg === algSq;
                    })) {
                        return true;
                    }
                } 
                // Классические шахматы
                else {
                    const moves = getChessMovesForPiece(r, c, p);
                    if (moves.some(m => {
                        const targetAlg = m.to || m.toAlg;
                        return targetAlg === algSq;
                    })) {
                        return true;
                    }
                }
                
            }
        }
    }
    return false;
}


//
// Режим редактирования доски (Edit Mode)
//

const btnAdd = document.getElementById('add-piece-btn');
const btnRemove = document.getElementById('remove-piece-btn');

btnAdd.onclick = () => {
    currentEditTool = currentEditTool === 'add' ? null : 'add';
    btnAdd.classList.toggle('active-tool', currentEditTool === 'add');
    btnRemove.classList.remove('active-tool');
    if(currentEditTool) render();
};

btnRemove.onclick = () => {
    currentEditTool = currentEditTool === 'remove' ? null : 'remove';
    btnRemove.classList.toggle('active-tool', currentEditTool === 'remove');
    btnAdd.classList.remove('active-tool');
    render(); 
};

document.getElementById('confirm-yes').onclick = () => {
    if (pendingDelete) {
        saveState(); 

        const { r, c } = pendingDelete;
        if (board[r]) {
            board[r][c] = null;
            
            const li = document.createElement('li');
            li.textContent = `🗑️ Удалена фигура: ${toAlg(r, c)}`;
            UI.history.prepend(li);
        }

        if (AppState.settings.addCountsAsTurn) {
            currentTurn = currentTurn === 'w' ? 'b' : 'w';
        }
        
        pendingDelete = null;
        document.getElementById('confirm-modal').style.display = 'none';
        
        render(); 
        checkUniversalGameOver();

        if (AppState.mode === 'PVE' && AppState.settings.addCountsAsTurn) {
            enqueueBotMove();
        }
    }
};

document.getElementById('confirm-no').onclick = () => {
    pendingDelete = null;
    document.getElementById('confirm-modal').style.display = 'none';
};

document.getElementById('picker-btn-white').onclick = () => setPickerColor('w');
document.getElementById('picker-btn-black').onclick = () => setPickerColor('b');
document.getElementById('add-piece-cancel').onclick = () => {
    document.getElementById('add-piece-modal').style.display = 'none';
    targetEditSquare = null;
};

function setPickerColor(color) {
    activePickerColor = color;
    document.getElementById('picker-btn-white').classList.toggle('active-color', color === 'w');
    document.getElementById('picker-btn-black').classList.toggle('active-color', color === 'b');
    
    const grid = document.getElementById('pieces-grid');
    grid.innerHTML = '';
    
    const addBtn = (type, symbol) => {
        const btn = document.createElement('button');
        btn.className = 'grid-piece-btn';
        btn.style.color = color === 'w' ? '#fff' : '#000';
        if(color === 'w') btn.style.textShadow = '0 2px 4px #000';
        btn.innerHTML = symbol;
        btn.onclick = () => selectPieceForCell(type);
        grid.appendChild(btn);
    };

    ['p','n','b','r','q','k', 'm', 'kc'].forEach(t => addBtn(t, UNICODE[color][t]));
}

function selectPieceForCell(type) {
    if (!targetEditSquare) return;
    
    saveState();
    
    const { r, c } = targetEditSquare;
    board[r][c] = { type: type, c: activePickerColor };

    document.getElementById('add-piece-modal').style.display = 'none';
    targetEditSquare = null;
    
    if (AppState.settings.addCountsAsTurn) {
        const li = document.createElement('li');
        li.textContent = `➕ Фигура на ${toAlg(r, c)}`;
        UI.history.prepend(li);
        
        // Передача хода
        currentTurn = currentTurn === 'w' ? 'b' : 'w';
    }
    
    render(); 
    checkUniversalGameOver();
    
    if (AppState.mode === 'PVE' && AppState.settings.addCountsAsTurn) {
        enqueueBotMove();
    }
}


//
// Утилиты и вспомогательные функции
//

function toAlg(r, c) { return String.fromCharCode(97 + c) + (8 - r); }
function fromAlg(s) { return { c: s.charCodeAt(0) - 97, r: 8 - parseInt(s[1]) }; }

function getPiece(r, c) { return board[r]?.[c] || null; }
function getPieceSymbol(p) { return UNICODE[p.c][p.type]; }

function addHistory(move) {
    const li = document.createElement('li');
    const side = currentTurn === 'w' ? '⚪' : '⚫';
    li.textContent = `${side} ${move.from} → ${move.to}`;
    UI.history.prepend(li);
}

//
// Запуск
//

initSettings();
window.onresize = render;