/**
 * popup.js - Popup window drag controller
 * Manages the dragging behavior of the IrukaDark logo popup window
 */

// Constants for DragController
const DRAG_THRESHOLD = 0; // Minimum distance to consider as drag
const DEBUG_MODE = false; // Set to true for console logging

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
      console.log('[DragController]', ...args);
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
   * Notify main process of pointer phase
   * @param {string} phase - Pointer phase ('down' or 'up')
   * @returns {boolean} True if notification was sent successfully
   */
  notifyPhase(phase) {
    if (!this.api?.notifyPopupPointer) {
      this.log('Warning: notifyPopupPointer API not available');
      return false;
    }

    try {
      this.api.notifyPopupPointer(phase);
      return true;
    } catch (error) {
      this.log('Error notifying phase:', error);
      return false;
    }
  }

  /**
   * Get current popup window bounds
   * @returns {Promise<Object|null>} Bounds object with x, y, width, height or null on error
   */
  async getBounds() {
    try {
      if (!this.api?.getPopupBounds) {
        throw new Error('getPopupBounds API not available');
      }
      return await this.api.getPopupBounds();
    } catch (error) {
      this.log('Error getting bounds:', error);
      return null;
    }
  }

  /**
   * Set popup window position (fire-and-forget for immediate response)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  async setPosition(x, y) {
    try {
      if (!this.api?.setPopupPosition) {
        throw new Error('setPopupPosition API not available');
      }
      // Direct IPC call without throttling for immediate response
      // Don't await - fire and forget for maximum responsiveness
      this.api.setPopupPosition(Math.round(x), Math.round(y));
      this.log('Position updated:', x, y);
    } catch (error) {
      this.log('Error setting position:', error);
      // Keep drag state intact even if IPC fails
    }
  }

  /**
   * Set or release pointer capture for reliable drag tracking
   * @param {PointerEvent} event - The pointer event
   * @param {boolean} shouldCapture - True to capture, false to release
   * @returns {boolean} True if successful
   * @private
   */
  managePointerCapture(event, shouldCapture) {
    if (!this.supportsPointer || this.currentPointerId == null) {
      return false;
    }

    const method = shouldCapture ? 'setPointerCapture' : 'releasePointerCapture';

    if (!event.target?.[method]) {
      return false;
    }

    try {
      event.target[method](this.currentPointerId);
      this.log(`Pointer ${shouldCapture ? 'captured' : 'released'}:`, this.currentPointerId);
      return true;
    } catch (error) {
      this.log(`Failed to ${shouldCapture ? 'set' : 'release'} pointer capture:`, error);
      return false;
    }
  }

  /**
   * Handle pointer/mouse down event
   * @param {PointerEvent|MouseEvent} event - The pointer or mouse event
   */
  async handleDown(event) {
    try {
      event.preventDefault();
    } catch {}

    this.log('Pointer down');

    // Get initial bounds
    this.startBounds = await this.getBounds();
    if (!this.startBounds) {
      this.log('Failed to get initial bounds');
      return;
    }

    // Initialize drag state
    this.isDragging = true;
    this.hasMoved = false;
    this.startScreenX = event.screenX;
    this.startScreenY = event.screenY;
    this.currentPointerId = event.pointerId ?? null;

    // Set pointer capture for reliable drag tracking
    this.managePointerCapture(event, true);

    this.notifyPhase('down');
  }

  /**
   * Handle pointer/mouse move event
   * @param {PointerEvent|MouseEvent} event - The pointer or mouse event
   */
  handleMove(event) {
    if (!this.isDragging || !this.startBounds) {
      return;
    }

    const dx = event.screenX - this.startScreenX;
    const dy = event.screenY - this.startScreenY;

    // Track if moved beyond threshold
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
      this.hasMoved = true;
    }

    // Update position immediately for responsive tracking
    this.setPosition(this.startBounds.x + dx, this.startBounds.y + dy);
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
 * Displays fallback logo if the main logo fails to load
 */
function setupLogoErrorHandling() {
  const logoImg = document.getElementById('logoImg');
  const fallbackLogo = document.getElementById('fallbackLogo');

  if (logoImg && fallbackLogo) {
    logoImg.addEventListener('error', () => {
      logoImg.style.display = 'none';
      fallbackLogo.style.display = 'flex';
    });
  }
}

/**
 * Initialize drag controller when DOM is ready
 * Creates the DragController instance and attaches it to the logo container
 */
(function initPopupDrag() {
  try {
    const api = window.electronAPI;
    if (!api) {
      console.error('Electron API not available');
      return;
    }

    const container = document.getElementById('logoContainer');
    if (!container) {
      console.error('Logo container not found');
      return;
    }

    // Setup logo error handling
    setupLogoErrorHandling();

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
  } catch (error) {
    console.error('Failed to initialize popup drag:', error);
  }
})();
