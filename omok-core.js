// 오목 규칙을 담당하는 공용 모듈입니다.
// 브라우저와 Node.js 양쪽에서 같은 규칙을 사용하기 위해 이 파일을 공유합니다.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.OmokCore = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BOARD_SIZE = 15;
  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  const DIRECTIONS = [
    [1, 0],  // 가로
    [0, 1],  // 세로
    [1, 1],  // 우하향 대각선
    [1, -1], // 우상향 대각선
  ];

  const COLUMN_LABELS = 'ABCDEFGHIJKLMNO';

  function createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(EMPTY));
  }

  function createGame() {
    return {
      board: createBoard(),
      currentPlayer: BLACK,
      moves: [],
      winner: EMPTY,
      winningLine: [],
      finished: false,
    };
  }

  function stoneName(stone) {
    return stone === BLACK ? '검은 돌' : '흰 돌';
  }

  // 한국어 조사 '이'와 '가'를 앞 글자의 받침에 따라 골라 붙입니다.
  function withSubjectParticle(name) {
    const lastCharacter = name.charCodeAt(name.length - 1);
    const isHangulSyllable = lastCharacter >= 0xAC00 && lastCharacter <= 0xD7A3;
    if (!isHangulSyllable) {
      return `${name}이(가)`;
    }
    const hasFinalConsonant = (lastCharacter - 0xAC00) % 28 !== 0;
    return `${name}${hasFinalConsonant ? '이' : '가'}`;
  }

  function coordinateName(x, y) {
    return `${COLUMN_LABELS[x]}${y + 1}`;
  }

  function isInside(x, y) {
    return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
  }

  function countDirection(board, x, y, dx, dy, stone) {
    const found = [];
    let nextX = x + dx;
    let nextY = y + dy;
    while (isInside(nextX, nextY) && board[nextY][nextX] === stone) {
      found.push({ x: nextX, y: nextY });
      nextX += dx;
      nextY += dy;
    }
    return found;
  }

  // 마지막에 놓인 돌을 기준으로 다섯 개 이상 이어졌는지 확인합니다.
  function findWinningLine(board, x, y, stone) {
    for (const [dx, dy] of DIRECTIONS) {
      const backward = countDirection(board, x, y, -dx, -dy, stone).reverse();
      const forward = countDirection(board, x, y, dx, dy, stone);
      const line = [...backward, { x, y }, ...forward];
      if (line.length >= 5) {
        return line;
      }
    }
    return [];
  }

  // 착수가 규칙에 맞는지 확인합니다. 문제가 없으면 null을 돌려줍니다.
  function validateMove(game, x, y, stone) {
    if (game.finished) {
      return '이미 끝난 대국입니다.';
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || !isInside(x, y)) {
      return '오목판을 벗어난 자리입니다.';
    }
    if (game.board[y][x] !== EMPTY) {
      return '이미 돌이 놓인 자리입니다.';
    }
    if (stone !== undefined && stone !== game.currentPlayer) {
      return '지금은 차례가 아닙니다.';
    }
    return null;
  }

  function applyMove(game, x, y) {
    const stone = game.currentPlayer;
    game.board[y][x] = stone;
    game.moves.push({ x, y, stone });

    const line = findWinningLine(game.board, x, y, stone);
    if (line.length > 0) {
      game.winner = stone;
      game.winningLine = line;
      game.finished = true;
    } else if (game.moves.length === BOARD_SIZE * BOARD_SIZE) {
      game.finished = true;
    } else {
      // 검은 돌과 흰 돌이 교대로 두도록 차례를 넘깁니다.
      game.currentPlayer = stone === BLACK ? WHITE : BLACK;
    }
    return game;
  }

  function undoMove(game) {
    const last = game.moves.pop();
    if (!last) {
      return null;
    }
    game.board[last.y][last.x] = EMPTY;
    game.currentPlayer = last.stone;
    game.winner = EMPTY;
    game.winningLine = [];
    game.finished = false;
    return last;
  }

  return {
    BOARD_SIZE,
    EMPTY,
    BLACK,
    WHITE,
    COLUMN_LABELS,
    createBoard,
    createGame,
    stoneName,
    withSubjectParticle,
    coordinateName,
    isInside,
    findWinningLine,
    validateMove,
    applyMove,
    undoMove,
  };
}));
