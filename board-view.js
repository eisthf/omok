// 오목판을 캔버스에 그리고, 클릭한 지점을 교차점 좌표로 바꾸어 주는 모듈입니다.
(function (root) {
  'use strict';

  const core = root.OmokCore;
  const BOARD_SIZE = core.BOARD_SIZE;

  // 화점(별점) 위치: 15줄 오목판의 관례를 따릅니다.
  const STAR_POINTS = [
    [3, 3], [3, 11], [11, 3], [11, 11], [7, 7],
  ];

  function createBoardView(canvas, onSelect) {
    const context = canvas.getContext('2d');
    const metrics = { padding: 0, gap: 0, stoneRadius: 0 };
    let game = core.createGame();

    function updateMetrics() {
      const size = canvas.width;
      metrics.padding = size * 0.055;
      metrics.gap = (size - metrics.padding * 2) / (BOARD_SIZE - 1);
      metrics.stoneRadius = metrics.gap * 0.44;
    }

    function toPixel(index) {
      return metrics.padding + index * metrics.gap;
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
      if (stone === core.BLACK) {
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

      context.strokeStyle = stone === core.BLACK
        ? 'rgba(0, 0, 0, 0.6)'
        : 'rgba(120, 126, 140, 0.6)';
      context.lineWidth = Math.max(1, radius * 0.05);
      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.stroke();
    }

    function drawLastMoveMarker() {
      if (game.moves.length === 0) {
        return;
      }
      const last = game.moves[game.moves.length - 1];
      context.strokeStyle = last.stone === core.BLACK ? '#ffd166' : '#c1440e';
      context.lineWidth = Math.max(1.5, metrics.stoneRadius * 0.16);
      context.beginPath();
      context.arc(toPixel(last.x), toPixel(last.y), metrics.stoneRadius * 0.42, 0, Math.PI * 2);
      context.stroke();
    }

    function drawWinningLine() {
      if (!game.winningLine || game.winningLine.length === 0) {
        return;
      }
      const first = game.winningLine[0];
      const last = game.winningLine[game.winningLine.length - 1];

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
          const stone = game.board[y][x];
          if (stone !== core.EMPTY) {
            drawStone(x, y, stone);
          }
        }
      }
      drawLastMoveMarker();
      drawWinningLine();
    }

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth || 640;
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = canvas.width;
      updateMetrics();
      draw();
    }

    function toBoardIndex(event) {
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      const pixelX = (event.clientX - rect.left) * scale;
      const pixelY = (event.clientY - rect.top) * scale;

      const x = Math.round((pixelX - metrics.padding) / metrics.gap);
      const y = Math.round((pixelY - metrics.padding) / metrics.gap);

      if (!core.isInside(x, y)) {
        return null;
      }
      // 교차점에서 지나치게 멀리 떨어진 지점은 잘못 누른 것으로 간주합니다.
      if (Math.hypot(pixelX - toPixel(x), pixelY - toPixel(y)) > metrics.gap * 0.5) {
        return null;
      }
      return { x, y };
    }

    canvas.addEventListener('click', (event) => {
      const point = toBoardIndex(event);
      if (point) {
        onSelect(point.x, point.y);
      }
    });
    window.addEventListener('resize', resize);

    return {
      setGame(nextGame) {
        game = nextGame;
        draw();
      },
      draw,
      resize,
    };
  }

  root.createBoardView = createBoardView;
}(window));
