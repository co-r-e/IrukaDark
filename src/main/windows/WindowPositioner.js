/**
 * WindowPositioner - Handles window position calculations and constraints
 * Encapsulates all logic related to positioning windows on screen
 */

const { screen } = require('electron');
const { WINDOW_MARGINS, WINDOW_LAYOUT, FALLBACK_SCREEN } = require('./windowConfig');

/**
 * WindowPositioner class for calculating and managing window positions
 */
class WindowPositioner {
  constructor() {
    // Cache for offset calculations
    this.mainPopupOffsetX = null;
    this.mainPopupOffsetY = null;
  }

  /**
   * Get the work area of the screen nearest to a given point
   * @param {Object} point - Point with x, y coordinates
   * @param {number} point.x - X coordinate
   * @param {number} point.y - Y coordinate
   * @returns {Object} Work area with x, y, width, height
   */
  getConstrainedScreenBounds(point) {
    try {
      const nearest = screen.getDisplayNearestPoint({ x: point.x, y: point.y });
      return nearest.workArea;
    } catch (error) {
      return FALLBACK_SCREEN;
    }
  }

  /**
   * Get the primary display work area
   * @returns {Object} Work area with x, y, width, height
   */
  getPrimaryWorkArea() {
    try {
      const primary = screen.getPrimaryDisplay();
      return primary && primary.workArea ? primary.workArea : FALLBACK_SCREEN;
    } catch (error) {
      return FALLBACK_SCREEN;
    }
  }

  /**
   * Constrain a value to a range
   * @param {number} value - Value to constrain
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {number} Constrained value
   * @private
   */
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Constrain a position to screen bounds
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} width - Window width
   * @param {number} height - Window height
   * @param {Object} workArea - Screen work area
   * @returns {Object} Constrained position with x, y
   */
  constrainToBounds(x, y, width, height, workArea) {
    return {
      x: Math.round(this.clamp(x, workArea.x, workArea.x + workArea.width - width)),
      y: Math.round(this.clamp(y, workArea.y, workArea.y + workArea.height - height)),
    };
  }

  /**
   * Calculate initial positions for both main and popup windows
   * Positions main window at bottom right, popup centered below it
   *
   * @param {number} mainWidth - Main window width
   * @param {number} mainHeight - Main window height
   * @param {number} popupWidth - Popup window width
   * @param {number} popupHeight - Popup window height
   * @param {Object} [workArea] - Optional work area (uses primary if not provided)
   * @returns {Object} Positions with mainX, mainY, popupX, popupY
   */
  calculateInitialPositions(mainWidth, mainHeight, popupWidth, popupHeight, workArea = null) {
    const wa = workArea || this.getPrimaryWorkArea();
    const { RIGHT: marginRight, BOTTOM: marginBottom } = WINDOW_MARGINS;
    const { POPUP_MAIN_OVERLAP: overlap } = WINDOW_LAYOUT;

    // Calculate unconstrained positions
    const mainX = wa.x + wa.width - mainWidth - marginRight;
    const mainY = wa.y + wa.height - mainHeight - marginBottom;
    const popupX = mainX + (mainWidth - popupWidth) / 2;
    const popupY = mainY + mainHeight + overlap;

    // Apply constraints
    const mainPos = this.constrainToBounds(mainX, mainY, mainWidth, mainHeight, wa);
    const popupPos = this.constrainToBounds(popupX, popupY, popupWidth, popupHeight, wa);

    return {
      ...mainPos,
      mainX: mainPos.x,
      mainY: mainPos.y,
      popupX: popupPos.x,
      popupY: popupPos.y,
    };
  }

  /**
   * Calculate position for main window above popup window
   * Uses cached offset on subsequent calls for consistent positioning
   *
   * @param {Object} popupBounds - Popup window bounds
   * @param {number} popupBounds.x - Popup X coordinate
   * @param {number} popupBounds.y - Popup Y coordinate
   * @param {number} popupBounds.width - Popup width
   * @param {number} popupBounds.height - Popup height
   * @param {number} mainWidth - Main window width
   * @param {number} mainHeight - Main window height
   * @returns {Object} Position with x, y, width, height for main window
   */
  calculateMainAbovePopup(popupBounds, mainWidth, mainHeight) {
    const workArea = this.getConstrainedScreenBounds(popupBounds);

    // Calculate or use cached offset
    if (!this.hasOffset()) {
      const { POPUP_MAIN_OVERLAP: overlap } = WINDOW_LAYOUT;
      const idealX = popupBounds.x + Math.round((popupBounds.width - mainWidth) / 2);
      const idealY = popupBounds.y - mainHeight - overlap;

      const constrained = this.constrainToBounds(idealX, idealY, mainWidth, mainHeight, workArea);

      // Cache offset for consistent positioning
      this.mainPopupOffsetX = constrained.x - popupBounds.x;
      this.mainPopupOffsetY = constrained.y - popupBounds.y;
    }

    // Calculate position using cached offset
    const targetX = popupBounds.x + this.mainPopupOffsetX;
    const targetY = popupBounds.y + this.mainPopupOffsetY;

    // Ensure still within bounds
    const final = this.constrainToBounds(targetX, targetY, mainWidth, mainHeight, workArea);

    return { ...final, width: mainWidth, height: mainHeight };
  }

  /**
   * Calculate position for main window on primary display
   * Positions at bottom right corner
   *
   * @param {number} width - Main window width
   * @param {number} height - Main window height
   * @returns {Object} Position with x, y
   */
  calculateMainWindowPosition(width, height) {
    const wa = this.getPrimaryWorkArea();
    const { RIGHT: marginRight, BOTTOM: marginBottom } = WINDOW_MARGINS;

    const x = wa.x + wa.width - width - marginRight;
    const y = wa.y + wa.height - height - marginBottom;

    return this.constrainToBounds(x, y, width, height, wa);
  }

  /**
   * Reset the cached offset values
   * Call this when window size changes to recalculate positioning
   */
  resetOffset() {
    this.mainPopupOffsetX = null;
    this.mainPopupOffsetY = null;
  }

  /**
   * Check if offset has been calculated
   * @returns {boolean} True if offset is cached
   */
  hasOffset() {
    return this.mainPopupOffsetX !== null && this.mainPopupOffsetY !== null;
  }
}

module.exports = WindowPositioner;
