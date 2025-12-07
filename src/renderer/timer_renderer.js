/**
 * Timer Renderer
 * Countdown timer with progress ring visualization
 */
class TimerRenderer {
  // =========================================
  // Static Configuration
  // =========================================

  static STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
    COMPLETED: 'completed',
  };

  static SOUND = {
    FREQUENCY: 1800,
    DURATION: 0.08,
    INTERVAL: 150,
    GROUP_PAUSE: 400,
    BEEPS_PER_GROUP: 4,
    GROUPS: 2,
  };

  static WHEEL_THRESHOLD = 50;

  static ANIMATION = {
    COMPLETED_DURATION: 2000,
    RESET_SPIN_DURATION: 300,
  };

  // =========================================
  // Constructor
  // =========================================

  constructor() {
    // Time state
    this.hours = 0;
    this.minutes = 0;
    this.seconds = 0;
    this.totalSeconds = 0;
    this.remainingSeconds = 0;

    // Timer state
    this.status = TimerRenderer.STATUS.IDLE;
    this.timeModifiedWhilePaused = false;

    // Timers & Audio
    this.intervalId = null;
    this.completedTimeoutId = null;
    this.resetAnimationTimeoutId = null;
    this.beepTimeoutIds = [];
    this.audioContext = null;

    // Bound event handlers (for removeEventListener)
    this._handleStart = () => this.start();
    this._handlePause = () => this.pause();
    this._handleReset = () => this.reset();

    // Input event handlers (stored per input for cleanup)
    this._inputHandlers = new Map();

    this.init();
  }

  init() {
    this.cacheDOM();
    if (!this.container) {
      console.warn('TimerRenderer: Container not found');
      return;
    }
    this.bindEvents();
  }

  // =========================================
  // DOM Setup
  // =========================================

  cacheDOM() {
    this.container = document.getElementById('timerPanelTimer');
    if (!this.container) return;

    if (this.container.children.length <= 1) {
      this.renderInitialHTML();
    }

    this.displayHours = this.container.querySelector('.timer-input-hours');
    this.displayMinutes = this.container.querySelector('.timer-input-minutes');
    this.displaySeconds = this.container.querySelector('.timer-input-seconds');
    this.btnStart = this.container.querySelector('.timer-btn-start');
    this.btnPause = this.container.querySelector('.timer-btn-pause');
    this.btnReset = this.container.querySelector('.timer-btn-reset');
    this.progressRing = this.container.querySelector('.timer-progress-ring-circle');

    this.initProgressRing();
  }

  initProgressRing() {
    if (!this.progressRing) return;
    this.progressRingRadius = this.progressRing.r.baseVal.value;
    this.progressRingCircumference = this.progressRingRadius * 2 * Math.PI;
    this.progressRing.style.strokeDasharray = `${this.progressRingCircumference} ${this.progressRingCircumference}`;
    this.progressRing.style.strokeDashoffset = this.progressRingCircumference;
  }

  renderInitialHTML() {
    this.container.innerHTML = `
      <div class="timer-layout">
        <div class="timer-wrapper">
          <div class="timer-circle-container">
            <svg class="timer-progress-ring" viewBox="0 0 300 300">
              <circle class="timer-progress-ring-circle-bg" stroke="rgba(255,255,255,0.1)" stroke-width="8" fill="transparent" r="90" cx="150" cy="150"/>
              <circle class="timer-progress-ring-circle" stroke="url(#timerGradient)" stroke-width="8" fill="transparent" r="90" cx="150" cy="150"/>
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#ff4d6d"/>
                  <stop offset="100%" stop-color="#d946ef"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="timer-display-container">
              <div class="timer-inputs">
                <input type="number" class="timer-input timer-input-hours" min="0" max="99" placeholder="00" value="00">
                <span class="timer-separator">:</span>
                <input type="number" class="timer-input timer-input-minutes" min="0" max="59" placeholder="00" value="05">
                <span class="timer-separator">:</span>
                <input type="number" class="timer-input timer-input-seconds" min="0" max="59" placeholder="00" value="00">
              </div>
            </div>
          </div>
          <div class="timer-controls">
            <button class="timer-btn timer-btn-reset" title="Reset">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
            </button>
            <button class="timer-btn timer-btn-start" title="Start">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <button class="timer-btn timer-btn-pause" title="Pause" style="display: none;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
          </div>
        </div>
        <div class="timer-presets">
          ${[3, 5, 10, 15, 20, 30, 45, 60].map((m) => `<button class="timer-preset-btn" data-minutes="${m}">${m}</button>`).join('')}
        </div>
      </div>
    `;
  }

  // =========================================
  // Event Binding
  // =========================================

  bindEvents() {
    this.btnStart?.addEventListener('click', this._handleStart);
    this.btnPause?.addEventListener('click', this._handlePause);
    this.btnReset?.addEventListener('click', this._handleReset);

    this.bindInputEvents();
    this.bindPresetEvents();
  }

  unbindEvents() {
    this.btnStart?.removeEventListener('click', this._handleStart);
    this.btnPause?.removeEventListener('click', this._handlePause);
    this.btnReset?.removeEventListener('click', this._handleReset);

    this.unbindInputEvents();
    this.unbindPresetEvents();
  }

  bindInputEvents() {
    const inputs = [this.displayHours, this.displayMinutes, this.displaySeconds].filter(Boolean);

    inputs.forEach((input) => {
      const handlers = {
        change: () => {
          this.validateInputs();
          this.markTimeModified();
        },
        input: () => {
          input.value = input.value.replace(/[^0-9]/g, '').slice(0, 2);
        },
        focus: () => {
          if (this.isEditable()) input.select();
        },
        wheel: (e) => this.handleWheelInput(e, input),
      };

      this._inputHandlers.set(input, handlers);
      input._scrollAccumulator = 0;

      input.addEventListener('change', handlers.change);
      input.addEventListener('input', handlers.input);
      input.addEventListener('focus', handlers.focus);
      input.addEventListener('wheel', handlers.wheel, { passive: false });
    });
  }

  unbindInputEvents() {
    this._inputHandlers.forEach((handlers, input) => {
      input.removeEventListener('change', handlers.change);
      input.removeEventListener('input', handlers.input);
      input.removeEventListener('focus', handlers.focus);
      input.removeEventListener('wheel', handlers.wheel);
    });
    this._inputHandlers.clear();
  }

  bindPresetEvents() {
    this._presetHandlers = [];
    this.container.querySelectorAll('.timer-preset-btn').forEach((btn) => {
      const handler = () => {
        if (!this.isEditable()) return;
        const minutes = parseInt(btn.dataset.minutes, 10);
        this.hours = Math.floor(minutes / 60);
        this.minutes = minutes % 60;
        this.seconds = 0;
        this.updateDisplayValues();
        this.markTimeModified();
      };
      this._presetHandlers.push({ btn, handler });
      btn.addEventListener('click', handler);
    });
  }

  unbindPresetEvents() {
    if (this._presetHandlers) {
      this._presetHandlers.forEach(({ btn, handler }) => {
        btn.removeEventListener('click', handler);
      });
      this._presetHandlers = [];
    }
  }

  handleWheelInput(e, input) {
    if (!this.isEditable()) return;
    e.preventDefault();

    input._scrollAccumulator += e.deltaY;

    if (Math.abs(input._scrollAccumulator) >= TimerRenderer.WHEEL_THRESHOLD) {
      const delta = Math.sign(input._scrollAccumulator) * -1;
      input._scrollAccumulator = 0;

      const max = input.classList.contains('timer-input-hours') ? 99 : 59;
      const currentVal = parseInt(input.value, 10) || 0;
      const newVal = (currentVal + delta + max + 1) % (max + 1);

      input.value = this.pad(newVal);
      this.validateInputs();
      this.markTimeModified();
    }
  }

  // =========================================
  // Timer Control
  // =========================================

  start() {
    if (this.status === TimerRenderer.STATUS.RUNNING) return;

    // Resume from paused without modification: continue from current remainingSeconds
    // Otherwise: calculate new totalSeconds from input
    const shouldRecalculate =
      this.status !== TimerRenderer.STATUS.PAUSED || this.timeModifiedWhilePaused;

    if (shouldRecalculate) {
      this.validateInputs();
      this.totalSeconds = this.hours * 3600 + this.minutes * 60 + this.seconds;
      if (this.totalSeconds === 0) return;
      this.remainingSeconds = this.totalSeconds;
    }

    // Don't start if no time remaining
    if (this.remainingSeconds === 0) return;

    this.status = TimerRenderer.STATUS.RUNNING;
    this.timeModifiedWhilePaused = false;
    this.toggleControls();
    this.disableInputs(true);

    this.clearInterval();
    this.intervalId = setInterval(() => this.tick(), 1000);
    this.updateProgress();
  }

  pause() {
    if (this.status !== TimerRenderer.STATUS.RUNNING) return;
    this.status = TimerRenderer.STATUS.PAUSED;
    this.clearInterval();
    this.disableInputs(false);
    this.toggleControls();
  }

  reset() {
    this.clearInterval();
    this.clearCompletedTimeout();

    this.status = TimerRenderer.STATUS.IDLE;
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.timeModifiedWhilePaused = false;
    this.disableInputs(false);
    this.toggleControls();
    this.updateProgress();
    this.container.classList.remove('timer-completed');

    if (this.progressRing) {
      this.progressRing.style.strokeDashoffset = this.progressRingCircumference;
    }

    this.animateResetButton();
  }

  tick() {
    if (this.remainingSeconds > 0) {
      this.remainingSeconds--;
      this.updateTimeFromRemaining();
      this.updateDisplayValues();
      this.updateProgress();
    } else {
      this.complete();
    }
  }

  complete() {
    this.clearInterval();
    this.status = TimerRenderer.STATUS.COMPLETED;
    this.updateDisplayValues();
    this.disableInputs(false);
    this.toggleControls();
    this.playSound();

    this.container.classList.add('timer-completed');
    this.completedTimeoutId = setTimeout(() => {
      this.container.classList.remove('timer-completed');
      this.completedTimeoutId = null;
    }, TimerRenderer.ANIMATION.COMPLETED_DURATION);
  }

  // =========================================
  // Display & UI
  // =========================================

  validateInputs() {
    let h = parseInt(this.displayHours?.value, 10) || 0;
    let m = parseInt(this.displayMinutes?.value, 10) || 0;
    let s = parseInt(this.displaySeconds?.value, 10) || 0;

    if (s > 59) {
      m += Math.floor(s / 60);
      s %= 60;
    }
    if (m > 59) {
      h += Math.floor(m / 60);
      m %= 60;
    }
    h = Math.min(h, 99);

    this.hours = h;
    this.minutes = m;
    this.seconds = s;
    this.updateDisplayValues();
  }

  updateDisplayValues() {
    if (this.displayHours) this.displayHours.value = this.pad(this.hours);
    if (this.displayMinutes) this.displayMinutes.value = this.pad(this.minutes);
    if (this.displaySeconds) this.displaySeconds.value = this.pad(this.seconds);
  }

  updateTimeFromRemaining() {
    this.hours = Math.floor(this.remainingSeconds / 3600);
    this.minutes = Math.floor((this.remainingSeconds % 3600) / 60);
    this.seconds = this.remainingSeconds % 60;
  }

  updateProgress() {
    if (!this.progressRing) return;

    const circumference = this.progressRingCircumference;
    if (this.totalSeconds === 0) {
      this.progressRing.style.strokeDasharray = `${circumference} ${circumference}`;
      this.progressRing.style.strokeDashoffset = '0';
      return;
    }

    const ratio = this.remainingSeconds / this.totalSeconds;
    this.progressRing.style.strokeDasharray = `${circumference * ratio} ${circumference}`;
    this.progressRing.style.strokeDashoffset = '0';
  }

  toggleControls() {
    if (!this.btnStart || !this.btnPause) return;
    const isRunning = this.status === TimerRenderer.STATUS.RUNNING;
    this.btnStart.style.display = isRunning ? 'none' : 'inline-flex';
    this.btnPause.style.display = isRunning ? 'inline-flex' : 'none';
  }

  disableInputs(disabled) {
    [this.displayHours, this.displayMinutes, this.displaySeconds].forEach((input) => {
      if (input) input.disabled = disabled;
    });
  }

  animateResetButton() {
    if (!this.btnReset) return;
    this.clearResetAnimationTimeout();
    const duration = TimerRenderer.ANIMATION.RESET_SPIN_DURATION;
    this.btnReset.style.transition = `transform ${duration}ms ease`;
    this.btnReset.style.transform = 'rotate(360deg)';
    this.resetAnimationTimeoutId = setTimeout(() => {
      this.btnReset.style.transition = 'none';
      this.btnReset.style.transform = 'rotate(0deg)';
      this.resetAnimationTimeoutId = null;
    }, duration);
  }

  clearResetAnimationTimeout() {
    if (this.resetAnimationTimeoutId) {
      clearTimeout(this.resetAnimationTimeoutId);
      this.resetAnimationTimeoutId = null;
    }
  }

  // =========================================
  // Helpers
  // =========================================

  isEditable() {
    return [
      TimerRenderer.STATUS.IDLE,
      TimerRenderer.STATUS.PAUSED,
      TimerRenderer.STATUS.COMPLETED,
    ].includes(this.status);
  }

  markTimeModified() {
    if (this.status === TimerRenderer.STATUS.PAUSED) {
      this.timeModifiedWhilePaused = true;
    }
  }

  pad(num) {
    return num.toString().padStart(2, '0');
  }

  clearInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  clearCompletedTimeout() {
    if (this.completedTimeoutId) {
      clearTimeout(this.completedTimeoutId);
      this.completedTimeoutId = null;
    }
  }

  // =========================================
  // Sound
  // =========================================

  async playSound() {
    if (!window.AudioContext && !window.webkitAudioContext) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!this.audioContext) {
      this.audioContext = new AudioContextClass();
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
        return;
      }
    }

    const { FREQUENCY, DURATION, INTERVAL, GROUP_PAUSE, BEEPS_PER_GROUP, GROUPS } =
      TimerRenderer.SOUND;

    // Clear any pending beeps before scheduling new ones
    this.clearBeepTimeouts();

    for (let group = 0; group < GROUPS; group++) {
      const groupStart = group * (BEEPS_PER_GROUP * INTERVAL + GROUP_PAUSE);
      for (let i = 0; i < BEEPS_PER_GROUP; i++) {
        this.scheduleBeep(groupStart + i * INTERVAL, FREQUENCY, DURATION);
      }
    }
  }

  scheduleBeep(delay, frequency, duration) {
    const timeoutId = setTimeout(() => {
      // Remove this timeout from the array
      const index = this.beepTimeoutIds.indexOf(timeoutId);
      if (index > -1) this.beepTimeoutIds.splice(index, 1);

      try {
        const ctx = this.audioContext;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        console.warn('Failed to play beep:', e);
      }
    }, delay);
    this.beepTimeoutIds.push(timeoutId);
  }

  clearBeepTimeouts() {
    this.beepTimeoutIds.forEach((id) => clearTimeout(id));
    this.beepTimeoutIds = [];
  }

  // =========================================
  // Cleanup
  // =========================================

  destroy() {
    this.clearInterval();
    this.clearCompletedTimeout();
    this.clearResetAnimationTimeout();
    this.clearBeepTimeouts();
    this.unbindEvents();

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

// Initialize
function initTimer() {
  // Cleanup existing instance if any
  if (window.timerApp && typeof window.timerApp.destroy === 'function') {
    window.timerApp.destroy();
  }
  window.timerApp = new TimerRenderer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTimer);
} else {
  initTimer();
}
