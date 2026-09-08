(() => {
  'use strict';

  const BOARD_SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  // 화점(별점) 위치: 15줄 오목판의 관례를 따릅니다.
  const STAR_POINTS = [
    [3, 3], [3, 11], [11, 3], [11, 11], [7, 7],
  ];

  const DIRECTIONS = [
    [1, 0],  // 가로
    [0, 1],  // 세로
    [1, 1],  // 우하향 대각선
    [1, -1], // 우상향 대각선
  ];

  const COLUMN_LABELS = 'ABCDEFGHIJKLMNO';

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const statusText = document.getElementById('status-text');
  const turnStone = document.getElementById('turn-stone');
  const undoButton = document.getElementById('undo-button');
  const resetButton = document.getElementById('reset-button');
  const moveList = document.getElementById('move-list');

  const state = {
    board: [],
    currentPlayer: BLACK,
    moves: [],
    winner: EMPTY,
    winningLine: [],
    finished: false,
  };

  function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(EMPTY));
  }

  function stoneName(stone) {
    return stone === BLACK ? '검은 돌' : '흰 돌';
  }

  function coordinateName(x, y) {
    return `${COLUMN_LABELS[x]}${y + 1}`;
  }

  // 캔버스 좌표 계산에 필요한 값들을 화면 크기에 맞추어 갱신합니다.
  const metrics = {
    padding: 0,
    gap: 0,
    stoneRadius: 0,
  };

  function updateMetrics() {
    const size = canvas.width;
    metrics.padding = size * 0.055;
    metrics.gap = (size - metrics.padding * 2) / (BOARD_SIZE - 1);
    metrics.stoneRadius = metrics.gap * 0.44;
  }

  function toPixel(index) {
    return metrics.padding + index * metrics.gap;
  }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 640;
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = canvas.width;
    updateMetrics();
    draw();
  }

  function drawGrid() {
    const size = canvas.width;
    context.clearRect(0, 0, size, size);

    context.fillStyle = '#e3bb75';
    context.fillRect(0, 0, size, size);

    context.strokeStyle = '#6b4c22';
    context.lineWidth = Math.max(1, size * 0.0016);
    context.beginPath();
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const position = toPixel(i);
      context.moveTo(toPixel(0), position);
      context.lineTo(toPixel(BOARD_SIZE - 1), position);
      context.moveTo(position, toPixel(0));
      context.lineTo(position, toPixel(BOARD_SIZE - 1));
    }
    context.stroke();

    context.fillStyle = '#6b4c22';
    STAR_POINTS.forEach(([x, y]) => {
      context.beginPath();
      context.arc(toPixel(x), toPixel(y), metrics.gap * 0.11, 0, Math.PI * 2);
      context.fill();
    });
  }

  function drawStone(x, y, stone) {
    const centerX = toPixel(x);
    const centerY = toPixel(y);
    const radius = metrics.stoneRadius;

    const gradient = context.createRadialGradient(
      centerX - radius * 0.35, centerY - radius * 0.4, radius * 0.1,
      centerX, centerY, radius,
    );
    if (stone === BLACK) {
      gradient.addColorStop(0, '#6d7383');
      gradient.addColorStop(1, '#05070c');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#b9bfcc');
    }

    context.save();
    context.shadowColor = 'rgba(0, 0, 0, 0.35)';
    context.shadowBlur = radius * 0.5;
    context.shadowOffsetY = radius * 0.16;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.strokeStyle = stone === BLACK ? 'rgba(0, 0, 0, 0.6)' : 'rgba(120, 126, 140, 0.6)';
    context.lineWidth = Math.max(1, radius * 0.05);
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
  }

  function drawLastMoveMarker() {
    if (state.moves.length === 0) {
      return;
    }
    const last = state.moves[state.moves.length - 1];
    context.strokeStyle = last.stone === BLACK ? '#ffd166' : '#c1440e';
    context.lineWidth = Math.max(1.5, metrics.stoneRadius * 0.16);
    context.beginPath();
    context.arc(toPixel(last.x), toPixel(last.y), metrics.stoneRadius * 0.42, 0, Math.PI * 2);
    context.stroke();
  }

  function drawWinningLine() {
    if (state.winningLine.length === 0) {
      return;
    }
    const first = state.winningLine[0];
    const last = state.winningLine[state.winningLine.length - 1];

    context.save();
    context.strokeStyle = 'rgba(214, 48, 49, 0.85)';
    context.lineCap = 'round';
    context.lineWidth = Math.max(3, metrics.stoneRadius * 0.3);
    context.beginPath();
    context.moveTo(toPixel(first.x), toPixel(first.y));
    context.lineTo(toPixel(last.x), toPixel(last.y));
    context.stroke();
    context.restore();
  }

  function draw() {
    drawGrid();
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const stone = state.board[y][x];
        if (stone !== EMPTY) {
          drawStone(x, y, stone);
        }
      }
    }
    drawLastMoveMarker();
    drawWinningLine();
  }

  function countDirection(x, y, dx, dy, stone) {
    const found = [];
    let nextX = x + dx;
    let nextY = y + dy;
    while (
      nextX >= 0 && nextX < BOARD_SIZE &&
      nextY >= 0 && nextY < BOARD_SIZE &&
      state.board[nextY][nextX] === stone
    ) {
      found.push({ x: nextX, y: nextY });
      nextX += dx;
      nextY += dy;
    }
    return found;
  }

  // 마지막에 놓인 돌을 기준으로 다섯 개 이상 이어졌는지 확인합니다.
  function findWinningLine(x, y, stone) {
    for (const [dx, dy] of DIRECTIONS) {
      const backward = countDirection(x, y, -dx, -dy, stone).reverse();
      const forward = countDirection(x, y, dx, dy, stone);
      const line = [...backward, { x, y }, ...forward];
      if (line.length >= 5) {
        return line;
      }
    }
    return [];
  }

  function updateStatus() {
    if (state.winner !== EMPTY) {
      turnStone.className = `stone-badge stone-badge--${state.winner === BLACK ? 'black' : 'white'}`;
      statusText.textContent = `${stoneName(state.winner)}이 이겼습니다. 새 게임을 시작할 수 있습니다.`;
    } else if (state.finished) {
      turnStone.className = 'stone-badge stone-badge--none';
      statusText.textContent = '판이 모두 채워져 무승부로 끝났습니다.';
    } else {
      turnStone.className = `stone-badge stone-badge--${state.currentPlayer === BLACK ? 'black' : 'white'}`;
      statusText.textContent = `${stoneName(state.currentPlayer)} 차례입니다.`;
    }
    undoButton.disabled = state.moves.length === 0;
  }

  function updateMoveList() {
    moveList.innerHTML = '';
    state.moves.forEach((move) => {
      const item = document.createElement('li');
      item.textContent = `${stoneName(move.stone)} — ${coordinateName(move.x, move.y)}`;
      moveList.appendChild(item);
    });
    moveList.scrollTop = moveList.scrollHeight;
  }

  function placeStone(x, y) {
    if (state.finished || state.board[y][x] !== EMPTY) {
      return;
    }

    const stone = state.currentPlayer;
    state.board[y][x] = stone;
    state.moves.push({ x, y, stone });

    const line = findWinningLine(x, y, stone);
    if (line.length > 0) {
      state.winner = stone;
      state.winningLine = line;
      state.finished = true;
    } else if (state.moves.length === BOARD_SIZE * BOARD_SIZE) {
      state.finished = true;
    } else {
      // 검은 돌과 흰 돌이 교대로 두도록 차례를 넘깁니다.
      state.currentPlayer = stone === BLACK ? WHITE : BLACK;
    }

    draw();
    updateStatus();
    updateMoveList();
  }

  function undoMove() {
    const last = state.moves.pop();
    if (!last) {
      return;
    }
    state.board[last.y][last.x] = EMPTY;
    state.currentPlayer = last.stone;
    state.winner = EMPTY;
    state.winningLine = [];
    state.finished = false;

    draw();
    updateStatus();
    updateMoveList();
  }

  function resetGame() {
    state.board = createBoard();
    state.currentPlayer = BLACK;
    state.moves = [];
    state.winner = EMPTY;
    state.winningLine = [];
    state.finished = false;

    draw();
    updateStatus();
    updateMoveList();
  }

  function toBoardIndex(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const pixelX = (event.clientX - rect.left) * scale;
    const pixelY = (event.clientY - rect.top) * scale;

    const x = Math.round((pixelX - metrics.padding) / metrics.gap);
    const y = Math.round((pixelY - metrics.padding) / metrics.gap);

    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      return null;
    }

    // 교차점에서 지나치게 멀리 떨어진 지점은 잘못 누른 것으로 간주합니다.
    const distance = Math.hypot(pixelX - toPixel(x), pixelY - toPixel(y));
    if (distance > metrics.gap * 0.5) {
      return null;
    }
    return { x, y };
  }

  canvas.addEventListener('click', (event) => {
    const point = toBoardIndex(event);
    if (point) {
      placeStone(point.x, point.y);
    }
  });

  undoButton.addEventListener('click', undoMove);
  resetButton.addEventListener('click', resetGame);
  window.addEventListener('resize', resizeCanvas);

  state.board = createBoard();
  resizeCanvas();
  updateStatus();
  updateMoveList();
})();
