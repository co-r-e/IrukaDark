/**
 * Stopwatch Renderer
 * Count-up stopwatch with millisecond precision
 */
class StopwatchRenderer {
  // =========================================
  // Static Configuration
  // =========================================

  static STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    PAUSED: 'paused',
  };

  static ANIMATION = {
    RESET_SPIN_DURATION: 300,
  };

  // =========================================
  // Constructor
  // =========================================

  constructor() {
    // Time state (in milliseconds)
    this.elapsedMs = 0;
    this.startTime = null;
    this.pausedElapsed = 0;

    // Timer state
    this.status = StopwatchRenderer.STATUS.IDLE;

    // Animation frame
    this.animationFrameId = null;

    // setTimeout ID for reset animation
    this.resetAnimationTimeoutId = null;

    // Bound event handlers (for removeEventListener)
    this._handleStart = () => this.start();
    this._handlePause = () => this.pause();
    this._handleReset = () => this.reset();

    this.init();
  }

  init() {
    this.cacheDOM();
    if (!this.container) {
      console.warn('StopwatchRenderer: Container not found');
      return;
    }
    this.bindEvents();
  }

  // =========================================
  // DOM Setup
  // =========================================

  cacheDOM() {
    this.container = document.getElementById('timerPanelStopwatch');
    if (!this.container) return;

    if (this.container.children.length <= 1) {
      this.renderInitialHTML();
    }

    this.displayHours = this.container.querySelector('.stopwatch-display-hours');
    this.displayMinutes = this.container.querySelector('.stopwatch-display-minutes');
    this.displaySeconds = this.container.querySelector('.stopwatch-display-seconds');
    this.displayMs = this.container.querySelector('.stopwatch-display-ms');
    this.btnStart = this.container.querySelector('.stopwatch-btn-start');
    this.btnPause = this.container.querySelector('.stopwatch-btn-pause');
    this.btnReset = this.container.querySelector('.stopwatch-btn-reset');
  }

  renderInitialHTML() {
    this.container.innerHTML = `
      <div class="stopwatch-layout">
        <div class="stopwatch-wrapper">
          <div class="stopwatch-display-container">
            <div class="stopwatch-display">
              <span class="stopwatch-display-hours">00</span>
              <span class="stopwatch-separator">:</span>
              <span class="stopwatch-display-minutes">00</span>
              <span class="stopwatch-separator">:</span>
              <span class="stopwatch-display-seconds">00</span>
              <span class="stopwatch-separator-ms">.</span>
              <span class="stopwatch-display-ms">00</span>
            </div>
          </div>
          <div class="stopwatch-controls">
            <button class="stopwatch-btn stopwatch-btn-reset" title="Reset">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M8 16H3v5"/>
              </svg>
            </button>
            <button class="stopwatch-btn stopwatch-btn-start" title="Start">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <button class="stopwatch-btn stopwatch-btn-pause" title="Pause" style="display: none;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            </button>
          </div>
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
  }

  unbindEvents() {
    this.btnStart?.removeEventListener('click', this._handleStart);
    this.btnPause?.removeEventListener('click', this._handlePause);
    this.btnReset?.removeEventListener('click', this._handleReset);
  }

  // =========================================
  // Stopwatch Control
  // =========================================

  start() {
    if (this.status === StopwatchRenderer.STATUS.RUNNING) return;

    this.status = StopwatchRenderer.STATUS.RUNNING;
    this.startTime = performance.now() - this.pausedElapsed;
    this.toggleControls();

    this.cancelAnimationFrame();
    this.tick();
  }

  pause() {
    if (this.status !== StopwatchRenderer.STATUS.RUNNING) return;

    this.status = StopwatchRenderer.STATUS.PAUSED;
    this.pausedElapsed = this.elapsedMs;
    this.cancelAnimationFrame();
    this.toggleControls();
  }

  reset() {
    this.cancelAnimationFrame();

    this.status = StopwatchRenderer.STATUS.IDLE;
    this.elapsedMs = 0;
    this.startTime = null;
    this.pausedElapsed = 0;

    this.toggleControls();
    this.updateDisplay();
    this.animateResetButton();
  }

  tick() {
    if (this.status !== StopwatchRenderer.STATUS.RUNNING) return;

    this.elapsedMs = performance.now() - this.startTime;
    this.updateDisplay();

    this.animationFrameId = requestAnimationFrame(() => this.tick());
  }

  // =========================================
  // Display & UI
  // =========================================

  updateDisplay() {
    const totalMs = Math.floor(this.elapsedMs);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = Math.floor((totalMs % 1000) / 10);

    if (this.displayHours) this.displayHours.textContent = this.pad(hours);
    if (this.displayMinutes) this.displayMinutes.textContent = this.pad(minutes);
    if (this.displaySeconds) this.displaySeconds.textContent = this.pad(seconds);
    if (this.displayMs) this.displayMs.textContent = this.pad(ms);
  }

  toggleControls() {
    if (!this.btnStart || !this.btnPause) return;
    const isRunning = this.status === StopwatchRenderer.STATUS.RUNNING;
    this.btnStart.style.display = isRunning ? 'none' : 'inline-flex';
    this.btnPause.style.display = isRunning ? 'inline-flex' : 'none';
  }

  animateResetButton() {
    if (!this.btnReset) return;
    this.clearResetAnimationTimeout();
    const duration = StopwatchRenderer.ANIMATION.RESET_SPIN_DURATION;
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

  pad(num) {
    return num.toString().padStart(2, '0');
  }

  cancelAnimationFrame() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // =========================================
  // Cleanup
  // =========================================

  destroy() {
    this.cancelAnimationFrame();
    this.clearResetAnimationTimeout();
    this.unbindEvents();
  }
}

// Initialize
function initStopwatch() {
  // Cleanup existing instance if any
  if (window.stopwatchApp && typeof window.stopwatchApp.destroy === 'function') {
    window.stopwatchApp.destroy();
  }
  window.stopwatchApp = new StopwatchRenderer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStopwatch);
} else {
  initStopwatch();
}
