/**
 * Timer Renderer
 * Countdown timer with progress ring visualization
 */
class TimerRenderer {
  constructor() {
    this.hours = 0;
    this.minutes = 0;
    this.seconds = 0;
    this.totalSeconds = 0;
    this.remainingSeconds = 0;
    this.intervalId = null;
    this.completedTimeoutId = null;
    this.status = 'idle'; // 'idle', 'running', 'paused', 'completed'
    this.audioContext = null;

    this.init();
  }

  init() {
    this.cacheDOM();
    if (!this.container) {
      console.warn('TimerRenderer: Container not found');
      return;
    }
    this.bindEvents();
    this.render();
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

    // Time inputs
    this.displayHours = this.container.querySelector('.timer-input-hours');
    this.displayMinutes = this.container.querySelector('.timer-input-minutes');
    this.displaySeconds = this.container.querySelector('.timer-input-seconds');

    // Control buttons
    this.btnStart = this.container.querySelector('.timer-btn-start');
    this.btnPause = this.container.querySelector('.timer-btn-pause');
    this.btnReset = this.container.querySelector('.timer-btn-reset');

    // Progress ring
    this.progressRing = this.container.querySelector('.timer-progress-ring-circle');
    this.progressRingRadius = this.progressRing ? this.progressRing.r.baseVal.value : 90;
    this.progressRingCircumference = this.progressRingRadius * 2 * Math.PI;

    if (this.progressRing) {
      this.progressRing.style.strokeDasharray = `${this.progressRingCircumference} ${this.progressRingCircumference}`;
      this.progressRing.style.strokeDashoffset = this.progressRingCircumference;
    }
  }

  renderInitialHTML() {
    this.container.innerHTML = `
      <div class="timer-layout">
        <div class="timer-wrapper">
          <div class="timer-circle-container">
            <svg class="timer-progress-ring" viewBox="0 0 300 300">
              <circle
                class="timer-progress-ring-circle-bg"
                stroke="rgba(255,255,255,0.1)"
                stroke-width="8"
                fill="transparent"
                r="90"
                cx="150"
                cy="150"
              />
              <circle
                class="timer-progress-ring-circle"
                stroke="url(#timerGradient)"
                stroke-width="8"
                fill="transparent"
                r="90"
                cx="150"
                cy="150"
              />
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#ff4d6d" />
                  <stop offset="100%" stop-color="#d946ef" />
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"/></svg>
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
          <button class="timer-preset-btn" data-minutes="3">3</button>
          <button class="timer-preset-btn" data-minutes="5">5</button>
          <button class="timer-preset-btn" data-minutes="10">10</button>
          <button class="timer-preset-btn" data-minutes="15">15</button>
          <button class="timer-preset-btn" data-minutes="20">20</button>
          <button class="timer-preset-btn" data-minutes="30">30</button>
          <button class="timer-preset-btn" data-minutes="45">45</button>
          <button class="timer-preset-btn" data-minutes="60">60</button>
        </div>
      </div>
    `;
  }

  // =========================================
  // Event Binding
  // =========================================

  bindEvents() {
    // Control buttons
    this.btnStart?.addEventListener('click', () => this.start());
    this.btnPause?.addEventListener('click', () => this.pause());
    this.btnReset?.addEventListener('click', () => this.reset());

    // Time inputs
    this.bindInputEvents();

    // Preset buttons
    this.bindPresetEvents();
  }

  bindInputEvents() {
    const inputs = [this.displayHours, this.displayMinutes, this.displaySeconds].filter(Boolean);

    inputs.forEach((input) => {
      input.addEventListener('change', () => this.validateInputs());

      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
        if (input.value.length > 2) input.value = input.value.slice(0, 2);
      });

      input.addEventListener('focus', () => {
        if (this.isEditable()) input.select();
      });

      // Scroll wheel adjustment (passive: false to allow preventDefault)
      input._scrollAccumulator = 0;
      input.addEventListener('wheel', (e) => this.handleWheelInput(e, input), { passive: false });
    });
  }

  bindPresetEvents() {
    const presetBtns = this.container.querySelectorAll('.timer-preset-btn');
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.isEditable()) return;
        const minutes = parseInt(btn.dataset.minutes, 10);
        this.hours = Math.floor(minutes / 60);
        this.minutes = minutes % 60;
        this.seconds = 0;
        this.updateDisplayValues();
      });
    });
  }

  handleWheelInput(e, input) {
    if (!this.isEditable()) return;
    e.preventDefault();

    input._scrollAccumulator += e.deltaY;
    const SCROLL_THRESHOLD = 50;

    if (Math.abs(input._scrollAccumulator) >= SCROLL_THRESHOLD) {
      const delta = Math.sign(input._scrollAccumulator) * -1;
      input._scrollAccumulator = 0;

      let val = parseInt(input.value, 10) || 0;
      val += delta;

      const max = input.classList.contains('timer-input-hours') ? 99 : 59;
      if (val < 0) val = max;
      if (val > max) val = 0;

      input.value = this.pad(val);
      this.validateInputs();
    }
  }

  // =========================================
  // Timer Control
  // =========================================

  start() {
    // Prevent multiple intervals
    if (this.status === 'running') return;

    if (this.isEditable()) {
      this.validateInputs();
      this.totalSeconds = this.hours * 3600 + this.minutes * 60 + this.seconds;
      if (this.totalSeconds === 0) return;
      this.remainingSeconds = this.totalSeconds;
    }

    this.status = 'running';
    this.toggleControls();
    this.disableInputs(true);

    // Clear any existing interval before creating new one
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.intervalId = setInterval(() => this.tick(), 1000);
    this.updateProgress();
  }

  pause() {
    if (this.status !== 'running') return;
    this.status = 'paused';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.toggleControls();
  }

  reset() {
    // Clear interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear completed animation timeout
    if (this.completedTimeoutId) {
      clearTimeout(this.completedTimeoutId);
      this.completedTimeoutId = null;
    }

    this.status = 'idle';
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.disableInputs(false);
    this.toggleControls();
    this.updateProgress();

    // Remove completed class immediately on reset
    this.container.classList.remove('timer-completed');

    if (this.progressRing) {
      this.progressRing.style.strokeDashoffset = this.progressRingCircumference;
    }
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
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.status = 'completed';
    this.updateDisplayValues();
    this.disableInputs(false);
    this.toggleControls();
    this.playSound();

    this.container.classList.add('timer-completed');
    this.completedTimeoutId = setTimeout(() => {
      this.container.classList.remove('timer-completed');
      this.completedTimeoutId = null;
    }, 2000);
  }

  // =========================================
  // Display & UI
  // =========================================

  render() {
    // Initial render if needed
  }

  validateInputs() {
    let h = parseInt(this.displayHours?.value, 10) || 0;
    let m = parseInt(this.displayMinutes?.value, 10) || 0;
    let s = parseInt(this.displaySeconds?.value, 10) || 0;

    // Handle overflow
    if (s > 59) {
      m += Math.floor(s / 60);
      s = s % 60;
    }
    if (m > 59) {
      h += Math.floor(m / 60);
      m = m % 60;
    }

    // Clamp hours to max 99
    if (h > 99) h = 99;

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

    if (this.totalSeconds === 0) {
      this.progressRing.style.strokeDasharray = `${this.progressRingCircumference} ${this.progressRingCircumference}`;
      this.progressRing.style.strokeDashoffset = '0';
      return;
    }

    const visibleLength =
      this.progressRingCircumference * (this.remainingSeconds / this.totalSeconds);
    this.progressRing.style.strokeDasharray = `${visibleLength} ${this.progressRingCircumference}`;
    this.progressRing.style.strokeDashoffset = '0';
  }

  toggleControls() {
    if (!this.btnStart || !this.btnPause) return;

    if (this.status === 'running') {
      this.btnStart.style.display = 'none';
      this.btnPause.style.display = 'inline-flex';
    } else {
      this.btnStart.style.display = 'inline-flex';
      this.btnPause.style.display = 'none';
    }
  }

  disableInputs(disabled) {
    if (this.displayHours) this.displayHours.disabled = disabled;
    if (this.displayMinutes) this.displayMinutes.disabled = disabled;
    if (this.displaySeconds) this.displaySeconds.disabled = disabled;
  }

  // =========================================
  // Helpers
  // =========================================

  isEditable() {
    return this.status === 'idle' || this.status === 'completed';
  }

  pad(num) {
    return num.toString().padStart(2, '0');
  }

  // =========================================
  // Sound
  // =========================================

  async playSound() {
    if (!window.AudioContext && !window.webkitAudioContext) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    // Resume AudioContext if suspended (happens when tab is in background)
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('Failed to resume AudioContext:', e);
        return;
      }
    }

    const ctx = this.audioContext;
    const beepDuration = 0.08;
    const beepInterval = 150;
    const groupPause = 400;

    const playBeep = (time) => {
      setTimeout(() => {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(1800, ctx.currentTime);

          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beepDuration);

          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + beepDuration);
        } catch (e) {
          console.warn('Failed to play beep:', e);
        }
      }, time);
    };

    // First group
    for (let i = 0; i < 4; i++) {
      playBeep(i * beepInterval);
    }

    // Second group
    const secondGroupStart = 4 * beepInterval + groupPause;
    for (let i = 0; i < 4; i++) {
      playBeep(secondGroupStart + i * beepInterval);
    }
  }

  // =========================================
  // Cleanup
  // =========================================

  destroy() {
    // Clear timers
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.completedTimeoutId) {
      clearTimeout(this.completedTimeoutId);
      this.completedTimeoutId = null;
    }

    // Close AudioContext
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.timerApp = new TimerRenderer();
  });
} else {
  window.timerApp = new TimerRenderer();
}
