// 두 사람이 각자의 컴퓨터에서 두는 온라인 대국을 담당합니다.
(() => {
  'use strict';

  const core = window.OmokCore;

  const joinPanel = document.getElementById('join-panel');
  const roomPanel = document.getElementById('room-panel');
  const roomInput = document.getElementById('room-input');
  const joinButton = document.getElementById('join-button');
  const copyButton = document.getElementById('copy-button');
  const roomCodeText = document.getElementById('room-code');
  const seatBlack = document.getElementById('seat-black');
  const seatWhite = document.getElementById('seat-white');
  const spectatorCount = document.getElementById('spectator-count');
  const statusText = document.getElementById('status-text');
  const turnStone = document.getElementById('turn-stone');
  const noticeText = document.getElementById('notice');
  const undoButton = document.getElementById('undo-button');
  const resetButton = document.getElementById('reset-button');
  const moveList = document.getElementById('move-list');

  let game = core.createGame();
  let socket = null;
  let roomCode = '';
  let myRole = core.EMPTY;
  let seats = { black: { taken: false }, white: { taken: false } };
  let reconnectDelay = 1000;

  const view = window.createBoardView(document.getElementById('board'), handleSelect);

  // 재접속했을 때 원래 자리를 되찾을 수 있도록 식별자를 보관합니다.
  function loadPlayerId() {
    let id = null;
    try {
      id = window.localStorage.getItem('omok-player-id');
    } catch (error) {
      id = null;
    }
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        window.localStorage.setItem('omok-player-id', id);
      } catch (error) {
        // 저장할 수 없는 환경에서는 이번 접속에만 사용합니다.
      }
    }
    return id;
  }

  const playerId = loadPlayerId();

  function showNotice(message, isError) {
    noticeText.textContent = message || '';
    noticeText.className = isError ? 'notice notice--error' : 'notice';
  }

  function roleName(role) {
    return role === core.EMPTY ? '관전자' : core.stoneName(role);
  }

  function seatDescription(seat, stone) {
    if (!seat.taken) {
      return '비어 있음';
    }
    const mine = myRole === stone ? ' (나)' : '';
    return seat.connected ? `참가 중${mine}` : `접속 끊김${mine}`;
  }

  function updateRoomPanel() {
    roomCodeText.textContent = roomCode;
    seatBlack.querySelector('.seat-state').textContent = seatDescription(seats.black, core.BLACK);
    seatWhite.querySelector('.seat-state').textContent = seatDescription(seats.white, core.WHITE);
    seatBlack.classList.toggle('seat--me', myRole === core.BLACK);
    seatWhite.classList.toggle('seat--me', myRole === core.WHITE);
  }

  function updateStatus() {
    if (game.winner !== core.EMPTY) {
      turnStone.className = `stone-badge stone-badge--${game.winner === core.BLACK ? 'black' : 'white'}`;
      const mine = game.winner === myRole ? ' 내가 이겼습니다.' : '';
      statusText.textContent = `${core.withSubjectParticle(core.stoneName(game.winner))} 이겼습니다.${mine}`;
    } else if (game.finished) {
      turnStone.className = 'stone-badge stone-badge--none';
      statusText.textContent = '판이 모두 채워져 무승부로 끝났습니다.';
    } else if (!seats.white.taken) {
      turnStone.className = 'stone-badge stone-badge--none';
      statusText.textContent = '상대가 입장하기를 기다리고 있습니다. 초대 주소를 전달해 주십시오.';
    } else {
      turnStone.className = `stone-badge stone-badge--${game.currentPlayer === core.BLACK ? 'black' : 'white'}`;
      const suffix = myRole === core.EMPTY
        ? ' (관전 중입니다.)'
        : (game.currentPlayer === myRole ? ' 내 차례입니다.' : ' 상대의 착수를 기다립니다.');
      statusText.textContent = `${core.stoneName(game.currentPlayer)} 차례입니다.${suffix}`;
    }

    const last = game.moves[game.moves.length - 1];
    undoButton.disabled = !(last && last.stone === myRole);
    resetButton.disabled = myRole === core.EMPTY;
  }

  function updateMoveList() {
    moveList.innerHTML = '';
    game.moves.forEach((move) => {
      const item = document.createElement('li');
      item.textContent = `${core.stoneName(move.stone)} — ${core.coordinateName(move.x, move.y)}`;
      moveList.appendChild(item);
    });
    moveList.scrollTop = moveList.scrollHeight;
  }

  function refresh() {
    view.setGame(game);
    updateRoomPanel();
    updateStatus();
    updateMoveList();
  }

  function send(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function handleSelect(x, y) {
    if (myRole === core.EMPTY) {
      showNotice('관전 중이므로 돌을 놓을 수 없습니다.', true);
      return;
    }
    if (game.finished) {
      showNotice('이미 끝난 대국입니다. 새 게임을 시작해 주십시오.', true);
      return;
    }
    if (!seats.white.taken) {
      showNotice('상대가 아직 입장하지 않았습니다.', true);
      return;
    }
    if (game.currentPlayer !== myRole) {
      showNotice('지금은 상대의 차례입니다.', true);
      return;
    }
    send({ type: 'move', x, y });
  }

  function applyState(message) {
    myRole = message.role;
    roomCode = message.room;
    seats = message.seats;
    spectatorCount.textContent = `관전자 ${message.spectators}명`;
    game = {
      board: message.board,
      moves: message.moves,
      currentPlayer: message.currentPlayer,
      winner: message.winner,
      winningLine: message.winningLine,
      finished: message.finished,
    };
    if (message.notice) {
      showNotice(message.notice, false);
    } else if (noticeText.classList.contains('notice--error')) {
      // 착수가 정상적으로 반영되었으므로 이전 오류 알림을 지웁니다.
      showNotice('', false);
    }
    refresh();
  }

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.addEventListener('open', () => {
      reconnectDelay = 1000;
      send({ type: 'join', room: roomCode, playerId });
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      if (message.type === 'state') {
        applyState(message);
      } else if (message.type === 'error') {
        showNotice(message.message, true);
      }
    });

    socket.addEventListener('close', () => {
      showNotice('서버와의 연결이 끊겼습니다. 다시 연결하고 있습니다.', true);
      // 연결이 끊기면 간격을 늘려 가며 다시 시도합니다.
      window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    });
  }

  function enterRoom(code) {
    roomCode = String(code || 'MAIN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'MAIN';
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    window.history.replaceState(null, '', url);

    joinPanel.hidden = true;
    roomPanel.hidden = false;
    roomCodeText.textContent = roomCode;
    statusText.textContent = '서버에 연결하고 있습니다.';
    connect();
  }

  joinButton.addEventListener('click', () => enterRoom(roomInput.value));
  roomInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      enterRoom(roomInput.value);
    }
  });

  undoButton.addEventListener('click', () => send({ type: 'undo' }));
  resetButton.addEventListener('click', () => send({ type: 'reset' }));

  copyButton.addEventListener('click', async () => {
    const address = window.location.href;
    try {
      await navigator.clipboard.writeText(address);
      showNotice('초대 주소를 복사했습니다. 상대에게 전달해 주십시오.', false);
    } catch (error) {
      showNotice(`초대 주소를 직접 복사해 주십시오: ${address}`, false);
    }
  });

  view.setGame(game);
  view.resize();

  const requestedRoom = new URL(window.location.href).searchParams.get('room');
  if (requestedRoom) {
    enterRoom(requestedRoom);
  }
})();
