// 온라인 대국을 중계하는 서버입니다.
// 정적 파일을 제공하면서 동시에 WebSocket 연결을 처리합니다.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const core = require('./omok-core.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = __dirname;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 브라우저에 그대로 내려보내도 되는 파일만 허용합니다.
const SERVABLE_FILES = new Set([
  'index.html',
  'online.html',
  'style.css',
  'omok-core.js',
  'board-view.js',
  'game.js',
  'online.js',
]);

function sendStatic(request, response) {
  const requestPath = new URL(request.url, 'http://localhost').pathname;
  const name = requestPath === '/' ? 'index.html' : path.basename(requestPath);

  if (!SERVABLE_FILES.has(name)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('찾을 수 없는 경로입니다.');
    return;
  }

  fs.readFile(path.join(PUBLIC_DIR, name), (error, data) => {
    if (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('파일을 읽지 못했습니다.');
      return;
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(name)] || 'application/octet-stream' });
    response.end(data);
  });
}

const server = http.createServer(sendStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

/** 대국방을 방 코드로 찾아 보관합니다. */
const rooms = new Map();

function normalizeRoomCode(value) {
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return code || 'MAIN';
}

function createRoom(code) {
  return {
    code,
    game: core.createGame(),
    // 먼저 입장한 사람이 검은 돌을, 그다음 사람이 흰 돌을 잡습니다.
    seats: {
      [core.BLACK]: null,
      [core.WHITE]: null,
    },
    clients: new Set(),
  };
}

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = createRoom(code);
    rooms.set(code, room);
  }
  return room;
}

function isSeatConnected(room, stone) {
  const seat = room.seats[stone];
  if (!seat) {
    return false;
  }
  return [...room.clients].some((client) => client.playerId === seat.playerId);
}

function countSpectators(room) {
  return [...room.clients].filter((client) => client.role === core.EMPTY).length;
}

function buildState(room, client) {
  const game = room.game;
  return {
    type: 'state',
    room: room.code,
    role: client.role,
    board: game.board,
    moves: game.moves,
    currentPlayer: game.currentPlayer,
    winner: game.winner,
    winningLine: game.winningLine,
    finished: game.finished,
    seats: {
      black: { taken: Boolean(room.seats[core.BLACK]), connected: isSeatConnected(room, core.BLACK) },
      white: { taken: Boolean(room.seats[core.WHITE]), connected: isSeatConnected(room, core.WHITE) },
    },
    spectators: countSpectators(room),
  };
}

function broadcastState(room, notice) {
  room.clients.forEach((client) => {
    if (client.readyState !== client.OPEN) {
      return;
    }
    const payload = buildState(room, client);
    if (notice) {
      payload.notice = notice;
    }
    client.send(JSON.stringify(payload));
  });
}

function sendError(client, message) {
  if (client.readyState === client.OPEN) {
    client.send(JSON.stringify({ type: 'error', message }));
  }
}

// 이미 앉아 있던 자리를 되찾거나, 비어 있는 자리를 차례대로 배정합니다.
function assignSeat(room, playerId) {
  for (const stone of [core.BLACK, core.WHITE]) {
    if (room.seats[stone] && room.seats[stone].playerId === playerId) {
      return stone;
    }
  }
  for (const stone of [core.BLACK, core.WHITE]) {
    if (!room.seats[stone]) {
      room.seats[stone] = { playerId };
      return stone;
    }
  }
  return core.EMPTY;
}

function handleJoin(client, message) {
  if (client.room) {
    return;
  }
  const code = normalizeRoomCode(message.room);
  const playerId = String(message.playerId || '').slice(0, 64);
  if (!playerId) {
    sendError(client, '접속자 식별자가 없어 입장하지 못했습니다.');
    return;
  }

  const room = getRoom(code);
  // 같은 식별자로 이미 연결된 창이 있다면 이전 연결을 정리합니다.
  [...room.clients].forEach((other) => {
    if (other.playerId === playerId && other !== client) {
      other.close(4000, '같은 사용자가 다시 접속했습니다.');
    }
  });

  client.playerId = playerId;
  client.role = assignSeat(room, playerId);
  client.room = room;
  room.clients.add(client);

  const roleName = client.role === core.EMPTY ? '관전자' : core.stoneName(client.role);
  broadcastState(room, `${core.withSubjectParticle(roleName)} 입장했습니다.`);
}

function handleMove(client, message) {
  const room = client.room;
  if (!room) {
    return;
  }
  if (client.role === core.EMPTY) {
    sendError(client, '관전자는 돌을 놓을 수 없습니다.');
    return;
  }
  if (!room.seats[core.WHITE]) {
    sendError(client, '상대가 아직 입장하지 않았습니다.');
    return;
  }
  const reason = core.validateMove(room.game, message.x, message.y, client.role);
  if (reason) {
    sendError(client, reason);
    return;
  }
  core.applyMove(room.game, message.x, message.y);
  broadcastState(room);
}

function handleUndo(client) {
  const room = client.room;
  if (!room) {
    return;
  }
  const last = room.game.moves[room.game.moves.length - 1];
  if (!last) {
    sendError(client, '무를 수 있는 수가 없습니다.');
    return;
  }
  // 자기가 마지막으로 놓은 돌만 무를 수 있습니다.
  if (last.stone !== client.role) {
    sendError(client, '자신이 마지막으로 놓은 돌만 무를 수 있습니다.');
    return;
  }
  core.undoMove(room.game);
  broadcastState(room, `${core.withSubjectParticle(core.stoneName(client.role))} 한 수를 물렀습니다.`);
}

function handleReset(client) {
  const room = client.room;
  if (!room) {
    return;
  }
  if (client.role === core.EMPTY) {
    sendError(client, '관전자는 새 게임을 시작할 수 없습니다.');
    return;
  }
  room.game = core.createGame();
  broadcastState(room, `${core.withSubjectParticle(core.stoneName(client.role))} 새 게임을 시작했습니다.`);
}

wss.on('connection', (client) => {
  client.role = core.EMPTY;
  client.room = null;
  client.playerId = '';

  client.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      sendError(client, '읽을 수 없는 형식의 요청입니다.');
      return;
    }

    switch (message.type) {
      case 'join': handleJoin(client, message); break;
      case 'move': handleMove(client, message); break;
      case 'undo': handleUndo(client); break;
      case 'reset': handleReset(client); break;
      default: sendError(client, '알 수 없는 요청입니다.');
    }
  });

  client.on('close', () => {
    const room = client.room;
    if (!room) {
      return;
    }
    room.clients.delete(client);
    if (room.clients.size === 0) {
      // 아무도 남지 않은 방은 정리합니다.
      rooms.delete(room.code);
      return;
    }
    const roleName = client.role === core.EMPTY ? '관전자' : core.stoneName(client.role);
    broadcastState(room, `${roleName}의 접속이 끊겼습니다.`);
  });
});

server.listen(PORT, () => {
  console.log(`오목 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
