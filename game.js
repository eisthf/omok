// 한 대의 컴퓨터에서 두 사람이 번갈아 두는 방식을 담당합니다.
(() => {
  'use strict';

  const core = window.OmokCore;

  const statusText = document.getElementById('status-text');
  const turnStone = document.getElementById('turn-stone');
  const undoButton = document.getElementById('undo-button');
  const resetButton = document.getElementById('reset-button');
  const moveList = document.getElementById('move-list');

  let game = core.createGame();
  const view = window.createBoardView(document.getElementById('board'), handleSelect);

  function updateStatus() {
    if (game.winner !== core.EMPTY) {
      turnStone.className = `stone-badge stone-badge--${game.winner === core.BLACK ? 'black' : 'white'}`;
      statusText.textContent = `${core.withSubjectParticle(core.stoneName(game.winner))} 이겼습니다. 새 게임을 시작할 수 있습니다.`;
    } else if (game.finished) {
      turnStone.className = 'stone-badge stone-badge--none';
      statusText.textContent = '판이 모두 채워져 무승부로 끝났습니다.';
    } else {
      turnStone.className = `stone-badge stone-badge--${game.currentPlayer === core.BLACK ? 'black' : 'white'}`;
      statusText.textContent = `${core.stoneName(game.currentPlayer)} 차례입니다.`;
    }
    undoButton.disabled = game.moves.length === 0;
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
    updateStatus();
    updateMoveList();
  }

  function handleSelect(x, y) {
    if (core.validateMove(game, x, y)) {
      return;
    }
    core.applyMove(game, x, y);
    refresh();
  }

  undoButton.addEventListener('click', () => {
    if (core.undoMove(game)) {
      refresh();
    }
  });

  resetButton.addEventListener('click', () => {
    game = core.createGame();
    refresh();
  });

  view.setGame(game);
  view.resize();
  updateStatus();
  updateMoveList();
})();
