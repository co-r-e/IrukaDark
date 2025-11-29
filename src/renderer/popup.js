/**
 * popup.js - Popup window drag controller
 * Manages the dragging behavior of the IrukaDark logo popup window
 */

// Constants for DragController
const DRAG_THRESHOLD = 0; // Minimum distance to consider as drag
// Read debug mode from URL parameter (set in windowConfig.js)
const DEBUG_MODE = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  } catch {
    return false;
  }
})();

/**
 * DragController - Manages popup window dragging with responsive IPC communication
 * Uses fire-and-forget IPC calls for immediate response during drag
 */
class DragController {
  /**
   * Creates a new DragController instance
   * @param {Object} api - Electron API interface object
   * @param {Function} api.notifyPopupPointer - Notify main process of pointer phase
   * @param {Function} api.getPopupBounds - Get current popup bounds
   * @param {Function} api.setPopupPosition - Set popup position
   * @param {HTMLElement} targetElement - Element to attach drag handlers to
   * @throws {Error} If API is not available or element is not found
   */
  constructor(api, targetElement) {
    this.api = api;
    this.targetElement = targetElement;

    // Drag state
    this.isDragging = false;
    this.hasMoved = false;
    this.startScreenX = 0;
    this.startScreenY = 0;
    this.startBounds = null;
    this.currentPointerId = null;

    // Event support detection
    this.supportsPointer = 'onpointerdown' in window;
    this.downEvent = this.supportsPointer ? 'pointerdown' : 'mousedown';
    this.moveEvent = this.supportsPointer ? 'pointermove' : 'mousemove';
    this.upEvent = this.supportsPointer ? 'pointerup' : 'mouseup';

    // AbortController for cleanup
    this.abortController = new AbortController();

    this.log('DragController initialized');
    this.attachEventListeners();
  }

  /**
   * Debug logging helper
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    if (DEBUG_MODE) {
    }
  }

  /**
   * Attach all event listeners with AbortController for proper cleanup
   */
  attachEventListeners() {
    const options = { capture: true, signal: this.abortController.signal };

    this.targetElement.addEventListener(this.downEvent, this.handleDown.bind(this), options);
    this.targetElement.addEventListener(this.moveEvent, this.handleMove.bind(this), options);
    this.targetElement.addEventListener(this.upEvent, this.handleUp.bind(this), options);

    if (this.supportsPointer) {
      this.targetElement.addEventListener(
        'lostpointercapture',
        this.handleLostCapture.bind(this),
        options
      );
    }

    // Cleanup on window unload
    window.addEventListener(
      'beforeunload',
      () => {
        this.cleanup();
      },
      options
    );
  }

  /**
   * Safe API call wrapper with logging
   * @param {string} methodName - API method name
   * @param {Array} args - Arguments to pass
   * @param {string} errorMsg - Error message
   * @param {*} defaultValue - Default value on error
   * @returns {*} Result or default value
   * @private
   */
  callAPI(methodName, args = [], errorMsg = '', defaultValue = null) {
    if (!this.api?.[methodName]) {
      this.log(`Warning: ${methodName} API not available`);
      return defaultValue;
    }

    try {
      return this.api[methodName](...args);
    } catch (error) {
      this.log(errorMsg || `Error calling ${methodName}:`, error);
      return defaultValue;
    }
  }

  /**
   * Notify main process of pointer phase
   * @param {string} phase - Pointer phase ('down' or 'up')
   */
  notifyPhase(phase) {
    this.callAPI('notifyPopupPointer', [phase], `Error notifying phase: ${phase}`);
  }

  /**
   * Get current popup window bounds
   * @returns {Promise<Object|null>} Bounds object or null on error
   */
  getBounds() {
    return this.callAPI('getPopupBounds', [], 'Error getting bounds');
  }

  /**
   * Set popup window position (fire-and-forget)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  setPosition(x, y) {
    this.callAPI('setPopupPosition', [x, y]);
    this.log('Position updated:', x, y);
  }

  /**
   * Set or release pointer capture for reliable drag tracking
   * @param {PointerEvent} event - The pointer event
   * @param {boolean} shouldCapture - True to capture, false to release
   * @private
   */
  managePointerCapture(event, shouldCapture) {
    if (!this.supportsPointer || this.currentPointerId == null || !event.target) return;

    const method = shouldCapture ? 'setPointerCapture' : 'releasePointerCapture';
    if (typeof event.target[method] !== 'function') return;

    try {
      event.target[method](this.currentPointerId);
      this.log(`Pointer ${shouldCapture ? 'captured' : 'released'}:`, this.currentPointerId);
    } catch (error) {
      this.log(`Failed to ${method}:`, error);
    }
  }

  /**
   * Handle pointer/mouse down event
   * @param {PointerEvent|MouseEvent} event - The pointer or mouse event
   */
  handleDown(event) {
    try {
      event.preventDefault();
    } catch {}

    this.log('Pointer down');

    // Initialize drag state BEFORE async IPC call
    // This ensures click detection works even if IPC fails
    this.isDragging = true;
    this.hasMoved = false;
    this.startScreenX = event.screenX;
    this.startScreenY = event.screenY;
    this.currentPointerId = event.pointerId ?? null;
    this.startBounds = null;

    // Set pointer capture for reliable drag tracking
    this.managePointerCapture(event, true);

    // Notify main process of pointer down (fire-and-forget for click detection)
    this.notifyPhase('down');

    // Get initial bounds asynchronously for drag functionality
    // Drag will only work if bounds are successfully retrieved
    this.getBounds()
      .then((bounds) => {
        if (bounds && this.isDragging) {
          this.startBounds = bounds;
          this.log('Bounds retrieved for drag:', bounds);
        }
      })
      .catch((err) => {
        this.log('Failed to get bounds (drag disabled):', err);
      });
  }

  /**
   * Handle pointer/mouse move event
   * @param {PointerEvent|MouseEvent} event - The pointer or mouse event
   */
  handleMove(event) {
    if (!this.isDragging) return;

    const dx = event.screenX - this.startScreenX;
    const dy = event.screenY - this.startScreenY;

    // Track if moved beyond threshold (independent of bounds availability)
    // This ensures drag vs click detection works even if IPC is slow
    this.hasMoved ||= Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD;

    // Only update position if bounds are available
    if (this.startBounds) {
      this.setPosition(this.startBounds.x + dx, this.startBounds.y + dy);
    }
  }

  /**
   * Handle pointer/mouse up event
   * @param {PointerEvent|MouseEvent} event - The pointer or mouse event
   */
  handleUp(event) {
    if (!this.isDragging) {
      return;
    }

    this.log('Pointer up, moved:', this.hasMoved);

    this.isDragging = false;

    // Release pointer capture
    this.managePointerCapture(event, false);

    this.currentPointerId = null;
    this.notifyPhase('up');
  }

  /**
   * Handle lost pointer capture event
   * Attempts to recapture the pointer if still dragging
   * @param {PointerEvent} event - The pointer event
   */
  handleLostCapture(event) {
    this.log('Lost pointer capture');

    if (this.isDragging) {
      // Attempt to recapture
      if (event.pointerId != null && event.target?.setPointerCapture) {
        try {
          event.target.setPointerCapture(event.pointerId);
          this.log('Pointer recaptured');
        } catch (error) {
          this.log('Failed to recapture pointer, ending drag');
          this.isDragging = false;
          this.notifyPhase('up');
        }
      }
    }
  }

  /**
   * Clean up resources and event listeners
   */
  cleanup() {
    this.log('Cleaning up DragController');

    // Abort all event listeners
    this.abortController.abort();

    // Clear state
    this.isDragging = false;
    this.startBounds = null;
  }

  /**
   * Destroy the controller and clean up all resources
   */
  destroy() {
    this.cleanup();
  }
}

/**
 * Setup error handling for logo image
 * Dynamically creates and displays fallback logo if the main logo fails to load
 */
function setupLogoErrorHandling() {
  const logoImg = document.getElementById('logoImg');
  const container = document.getElementById('logoContainer');

  if (!logoImg || !container) return;

  logoImg.addEventListener(
    'error',
    () => {
      logoImg.style.display = 'none';

      // Create fallback logo with inline SVG using template literal
      const fallbackLogo = document.createElement('div');
      fallbackLogo.id = 'fallbackLogo';
      fallbackLogo.className = 'fallback-logo';
      fallbackLogo.style.display = 'flex';
      fallbackLogo.innerHTML = `
        <svg width="50" height="50" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      `;

      container.appendChild(fallbackLogo);
    },
    { once: true }
  );
}

/**
 * Default logo path
 */
const DEFAULT_LOGO_PATH = 'assets/icons/irukadark_logo.svg';

/**
 * Update the popup logo image
 * @param {string|null} iconSrc - Base64 data URL or null for default
 */
function updatePopupLogo(iconSrc) {
  const logoImg = document.getElementById('logoImg');
  if (!logoImg) return;

  // Remove fallback logo if it exists
  const fallbackLogo = document.getElementById('fallbackLogo');
  if (fallbackLogo) {
    fallbackLogo.remove();
  }

  // Ensure img element is visible and update source
  logoImg.style.display = '';
  logoImg.src = iconSrc || DEFAULT_LOGO_PATH;
}

/**
 * Load custom popup icon if set
 */
async function loadCustomPopupIcon() {
  try {
    const api = window.electronAPI;
    if (!api?.getCustomPopupIcon) return;

    const customIcon = await api.getCustomPopupIcon();
    if (customIcon) {
      updatePopupLogo(customIcon);
      // Invalidate shadow after icon loaded to update macOS window shadow
      setTimeout(() => {
        api.invalidatePopupShadow?.();
      }, 50);
    }
  } catch (err) {
    // Keep default icon on error
  }
}

/**
 * Listen for popup icon changes from settings
 */
function setupPopupIconChangeListener() {
  const api = window.electronAPI;
  if (!api?.onPopupIconChanged) return;

  api.onPopupIconChanged((icon) => updatePopupLogo(icon));
}

/**
 * Initialize drag controller when DOM is ready
 * Creates the DragController instance and attaches it to the logo container
 */
(function initPopupDrag() {
  try {
    const api = window.electronAPI;
    if (!api) {
      return;
    }

    const container = document.getElementById('logoContainer');
    if (!container) {
      return;
    }

    // Setup logo error handling
    setupLogoErrorHandling();

    // Load custom icon if set
    loadCustomPopupIcon();

    // Listen for icon changes from settings
    setupPopupIconChangeListener();

    // Create and initialize drag controller
    const dragController = new DragController(api, container);

    // Store reference but ensure cleanup on page unload
    window.dragController = dragController;

    window.addEventListener(
      'beforeunload',
      () => {
        if (window.dragController) {
          window.dragController.destroy();
          delete window.dragController;
        }
      },
      { once: true }
    );
  } catch (error) {}
})();
