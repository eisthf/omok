// 돌을 놓을 때 나는 소리를 웹 오디오로 합성합니다.
// 음원 파일을 두지 않고 잡음과 진동을 조합하여 나무판을 두드리는 소리를 만듭니다.
(function (root) {
  'use strict';

  const noiseBuffers = new WeakMap();

  // 짧은 잡음은 나무가 부딪히는 순간의 파열음을 표현합니다.
  function getNoiseBuffer(context) {
    let buffer = noiseBuffers.get(context);
    if (!buffer) {
      const length = Math.floor(context.sampleRate * 0.12);
      buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        samples[i] = Math.random() * 2 - 1;
      }
      noiseBuffers.set(context, buffer);
    }
    return buffer;
  }

  /**
   * 착수음 한 번을 예약합니다.
   * 실제 재생과 검사용 렌더링이 같은 코드를 쓰도록 문맥과 도착지를 인자로 받습니다.
   */
  function scheduleClack(context, destination, options) {
    const settings = options || {};
    const startTime = settings.time !== undefined ? settings.time : context.currentTime;
    const volume = settings.volume !== undefined ? settings.volume : 1;
    // 검은 돌과 흰 돌의 소리를 조금 다르게 하여 누가 두었는지 귀로도 구분되게 합니다.
    const basePitch = settings.stone === 2 ? 430 : 360;
    const pitch = basePitch * (0.97 + Math.random() * 0.06);

    const output = context.createGain();
    output.gain.value = volume;
    output.connect(destination);

    const noise = context.createBufferSource();
    noise.buffer = getNoiseBuffer(context);

    // 높은 성분을 걸러 내어 날카로운 느낌을 줄이고 둔탁한 울림만 남깁니다.
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(pitch * 4.5, startTime);
    noiseFilter.frequency.exponentialRampToValueAtTime(pitch * 1.2, startTime + 0.05);
    noiseFilter.Q.value = 0.7;

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.75, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0008, startTime + 0.07);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(output);
    noise.start(startTime);
    noise.stop(startTime + 0.1);

    // 낮은 기음이 묵직한 몸통을 만들고, 위쪽 배음이 나무의 결을 더합니다.
    [
      { ratio: 0.5, gain: 0.7, decay: 0.2, type: 'sine' },
      { ratio: 1, gain: 0.5, decay: 0.13, type: 'sine' },
      { ratio: 2.1, gain: 0.16, decay: 0.05, type: 'triangle' },
    ].forEach((part) => {
      const oscillator = context.createOscillator();
      oscillator.type = part.type;
      oscillator.frequency.setValueAtTime(pitch * part.ratio, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(pitch * part.ratio * 0.72, startTime + part.decay);

      const gain = context.createGain();
      gain.gain.setValueAtTime(part.gain, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0008, startTime + part.decay);

      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(startTime);
      oscillator.stop(startTime + part.decay + 0.02);
    });

    return 0.25;
  }

  // 화면에서 사용하는 소리 재생기를 만듭니다.
  function createStoneSound(storageKey) {
    const key = storageKey || 'omok-sound-enabled';
    let context = null;
    let enabled = true;

    try {
      enabled = window.localStorage.getItem(key) !== 'off';
    } catch (error) {
      enabled = true;
    }

    // 브라우저는 사용자가 조작하기 전에는 소리를 내지 못하게 막으므로,
    // 실제 조작이 일어난 뒤에 오디오 문맥을 만들고 깨웁니다.
    function ensureContext() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return null;
      }
      if (!context) {
        context = new AudioContextClass();
      }
      if (context.state === 'suspended') {
        context.resume();
      }
      return context;
    }

    window.addEventListener('pointerdown', ensureContext, { once: true });
    window.addEventListener('keydown', ensureContext, { once: true });

    return {
      play(stone) {
        if (!enabled) {
          return;
        }
        const audio = ensureContext();
        if (!audio) {
          return;
        }
        scheduleClack(audio, audio.destination, { stone, volume: 0.6 });
      },
      isEnabled() {
        return enabled;
      },
      setEnabled(next) {
        enabled = Boolean(next);
        try {
          window.localStorage.setItem(key, enabled ? 'on' : 'off');
        } catch (error) {
          // 저장할 수 없는 환경에서는 이번 접속에만 적용합니다.
        }
        if (enabled) {
          ensureContext();
        }
      },
    };
  }

  // 소리 켜기와 끄기 단추를 재생기와 연결합니다.
  function setupSoundButton(sound, button) {
    if (!button) {
      return;
    }
    function refreshLabel() {
      const on = sound.isEnabled();
      button.textContent = on ? '착수음 켜짐' : '착수음 꺼짐';
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('sound-button--off', !on);
    }
    button.addEventListener('click', () => {
      sound.setEnabled(!sound.isEnabled());
      refreshLabel();
      if (sound.isEnabled()) {
        // 켜자마자 소리를 들려주어 잘 들리는지 확인할 수 있게 합니다.
        sound.play(1);
      }
    });
    refreshLabel();
  }

  root.OmokSound = { scheduleClack, createStoneSound, setupSoundButton };
  root.setupSoundButton = setupSoundButton;
}(window));
