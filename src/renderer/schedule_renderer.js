/**
 * Schedule Renderer
 * Scheduled task management with alarm, app launch, and URL actions
 */
class ScheduleRenderer {
  // =========================================
  // Static Configuration
  // =========================================

  static ACTION_TYPES = {
    ALARM: 'alarm',
    OPEN_APP: 'open-app',
    OPEN_URL: 'open-url',
  };

  static REPEAT_TYPES = {
    ONCE: 'once',
    DAILY: 'daily',
    WEEKDAYS: 'weekdays',
  };

  static ALARM_SOUND = {
    FREQUENCY: 880,
    DURATION: 0.15,
    INTERVAL: 200,
    GROUP_PAUSE: 500,
    BEEPS_PER_GROUP: 3,
    GROUPS: 3,
  };

  static ICONS = {
    alarm: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    'open-app': '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    'open-url': '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    clock: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    plus: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    delete: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  };

  static CHECK_INTERVAL = 1000;
  static STORAGE_KEY = 'irukadark_schedules';

  // =========================================
  // Constructor & Initialization
  // =========================================

  constructor() {
    this._initState();
    this._initBoundHandlers();
    this.init();
  }

  _initState() {
    // Data
    this.schedules = [];
    this.triggeredToday = new Set();
    this.lastDateKey = null;

    // Timer
    this.checkIntervalId = null;

    // Audio
    this.audioContext = null;
    this.beepTimeoutIds = [];

    // Popup
    this.activePopup = null;
    this.activeOverlay = null;
    this.editingScheduleId = null;
    this.pendingRepeatConfig = null;
    this._popupCleanupFns = [];

    // DOM cache
    this.container = null;
    this.emptyState = null;
    this.listContainer = null;
    this.addBtn = null;
  }

  _initBoundHandlers() {
    this._handleAddClick = () => this.showAddPopup();
    this._handleDocumentClick = (e) => this._onDocumentClick(e);
    this._handleKeyDown = (e) => this._onKeyDown(e);
  }

  init() {
    this._cacheDOM();
    if (!this.container) {
      console.warn('ScheduleRenderer: Container #timerPanelSchedule not found');
      return;
    }
    this.loadSchedules();
    this._bindGlobalEvents();
    this._startTimeChecker();
  }

  // =========================================
  // DOM & Event Setup
  // =========================================

  _cacheDOM() {
    this.container = document.getElementById('timerPanelSchedule');
    if (!this.container) return;

    if (this.container.children.length === 0) {
      this._renderInitialHTML();
    }

    this.emptyState = this.container.querySelector('.schedule-empty');
    this.listContainer = this.container.querySelector('.schedule-list');
    this.addBtn = this.container.querySelector('.schedule-add-btn');
  }

  _renderInitialHTML() {
    this.container.innerHTML = `
      <div class="schedule-layout">
        <div class="schedule-list-container">
          <div class="schedule-empty">
            <span class="schedule-empty-icon">${ScheduleRenderer.ICONS.clock}</span>
            <span class="schedule-empty-text" data-i18n="schedule.noSchedules">No schedules yet</span>
          </div>
          <div class="schedule-list"></div>
        </div>
        <button class="schedule-add-btn" title="Add Schedule">${ScheduleRenderer.ICONS.plus}</button>
      </div>
    `;
  }

  _bindGlobalEvents() {
    this.addBtn?.addEventListener('click', this._handleAddClick);
    document.addEventListener('click', this._handleDocumentClick);
    document.addEventListener('keydown', this._handleKeyDown);
  }

  _unbindGlobalEvents() {
    this.addBtn?.removeEventListener('click', this._handleAddClick);
    document.removeEventListener('click', this._handleDocumentClick);
    document.removeEventListener('keydown', this._handleKeyDown);
  }

  _onDocumentClick(e) {
    if (this.activeOverlay) return;
    if (this.activePopup && !this.activePopup.contains(e.target)) {
      if (!this.addBtn?.contains(e.target) && !e.target.closest('.schedule-item')) {
        this.hidePopup();
      }
    }
  }

  _onKeyDown(e) {
    if (e.key !== 'Escape' || !this.activePopup) return;

    const repeatOverlay = this.activePopup.querySelector('.schedule-repeat-overlay');
    if (repeatOverlay) {
      repeatOverlay.remove();
    } else {
      this.hidePopup();
    }
  }

  // =========================================
  // Utility Methods
  // =========================================

  _t(key, fallback) {
    return typeof window.i18n === 'function' ? window.i18n(key) || fallback : fallback;
  }

  _escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _pad(num) {
    return num.toString().padStart(2, '0');
  }

  _isValidUrl(str) {
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  _truncateUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url.length > 20 ? url.substring(0, 20) + '...' : url;
    }
  }

  _generateId() {
    return 'sch_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
  }

  // =========================================
  // Schedule CRUD
  // =========================================

  addSchedule(data) {
    const schedule = {
      id: this._generateId(),
      time: data.time,
      enabled: true,
      action: data.action,
      repeat: data.repeat || { type: ScheduleRenderer.REPEAT_TYPES.ONCE },
      lastTriggered: null,
      createdAt: Date.now(),
    };
    this.schedules.push(schedule);
    this.saveSchedules();
    this._renderList();
    return schedule;
  }

  updateSchedule(id, updates) {
    const index = this.schedules.findIndex((s) => s.id === id);
    if (index === -1) return null;

    this.schedules[index] = { ...this.schedules[index], ...updates, updatedAt: Date.now() };
    this.saveSchedules();
    this._renderList();
    return this.schedules[index];
  }

  deleteSchedule(id) {
    const index = this.schedules.findIndex((s) => s.id === id);
    if (index === -1) return false;

    this.schedules.splice(index, 1);
    this.saveSchedules();
    this._renderList();
    return true;
  }

  toggleSchedule(id) {
    const schedule = this.schedules.find((s) => s.id === id);
    if (!schedule) return null;

    schedule.enabled = !schedule.enabled;
    this.saveSchedules();
    this._updateItemUI(id);
    return schedule;
  }

  _validateSchedule(schedule) {
    if (!schedule || typeof schedule !== 'object') return null;
    if (typeof schedule.id !== 'string') return null;
    if (!schedule.time || typeof schedule.time.hours !== 'number' || typeof schedule.time.minutes !== 'number') return null;
    if (!schedule.action || typeof schedule.action.type !== 'string') return null;

    schedule.time.hours = Math.max(0, Math.min(23, Math.floor(schedule.time.hours)));
    schedule.time.minutes = Math.max(0, Math.min(59, Math.floor(schedule.time.minutes)));
    schedule.enabled = schedule.enabled !== false;

    if (!schedule.repeat || typeof schedule.repeat.type !== 'string') {
      schedule.repeat = { type: ScheduleRenderer.REPEAT_TYPES.ONCE };
    }

    if (schedule.repeat.type === ScheduleRenderer.REPEAT_TYPES.WEEKDAYS) {
      if (!Array.isArray(schedule.repeat.weekdays)) {
        schedule.repeat.weekdays = [];
      } else {
        schedule.repeat.weekdays = schedule.repeat.weekdays
          .filter((d) => typeof d === 'number' && d >= 0 && d <= 6)
          .map((d) => Math.floor(d));
      }
      if (schedule.repeat.weekdays.length === 0) {
        schedule.repeat = { type: ScheduleRenderer.REPEAT_TYPES.ONCE };
      }
    }

    return schedule;
  }

  // =========================================
  // Time Checking & Execution
  // =========================================

  _startTimeChecker() {
    if (this.checkIntervalId) return;
    this.checkIntervalId = setInterval(() => this._checkSchedules(), ScheduleRenderer.CHECK_INTERVAL);
    this._checkSchedules();
  }

  _stopTimeChecker() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  _checkSchedules() {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentDay = now.getDay();
    const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    if (this.lastDateKey && this.lastDateKey !== dateKey) {
      this.triggeredToday.clear();
    }
    this.lastDateKey = dateKey;

    for (const schedule of this.schedules) {
      if (!schedule.enabled) continue;
      if (schedule.time.hours !== currentHours || schedule.time.minutes !== currentMinutes) continue;

      const triggeredKey = `${schedule.id}-${dateKey}`;
      if (this.triggeredToday.has(triggeredKey)) continue;
      if (!this._shouldTrigger(schedule, currentDay)) continue;

      this._executeAction(schedule);
      this.triggeredToday.add(triggeredKey);
      schedule.lastTriggered = Date.now();

      if (schedule.repeat.type === ScheduleRenderer.REPEAT_TYPES.ONCE) {
        schedule.enabled = false;
        this._updateItemUI(schedule.id);
      }

      this.saveSchedules();
    }
  }

  _shouldTrigger(schedule, currentDay) {
    switch (schedule.repeat.type) {
      case ScheduleRenderer.REPEAT_TYPES.ONCE:
      case ScheduleRenderer.REPEAT_TYPES.DAILY:
        return true;
      case ScheduleRenderer.REPEAT_TYPES.WEEKDAYS:
        return schedule.repeat.weekdays?.includes(currentDay) ?? false;
      default:
        return false;
    }
  }

  async _executeAction(schedule) {
    const { type, config } = schedule.action;

    switch (type) {
      case ScheduleRenderer.ACTION_TYPES.ALARM:
        await this._executeAlarm();
        break;
      case ScheduleRenderer.ACTION_TYPES.OPEN_APP:
        await this._executeOpenApp(config);
        break;
      case ScheduleRenderer.ACTION_TYPES.OPEN_URL:
        await this._executeOpenUrl(config);
        break;
      default:
        console.warn(`Unknown action type: ${type}`);
    }
  }

  async _executeAlarm() {
    await this._playAlarmSound();
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('IrukaDark Schedule', { body: 'Alarm!', silent: true });
    }
  }

  async _executeOpenApp(config) {
    if (!config?.appPath) return;
    try {
      await window.electronAPI.launcher.launchApp(config.appPath);
    } catch (err) {
      console.error('Failed to launch app:', err);
    }
  }

  async _executeOpenUrl(config) {
    if (!config?.url) return;
    try {
      await window.electronAPI.openExternal(config.url);
    } catch (err) {
      console.error('Failed to open URL:', err);
    }
  }

  // =========================================
  // Audio
  // =========================================

  async _playAlarmSound() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!this.audioContext) {
      this.audioContext = new AudioContextClass();
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch {
        return;
      }
    }

    const { FREQUENCY, DURATION, INTERVAL, GROUP_PAUSE, BEEPS_PER_GROUP, GROUPS } = ScheduleRenderer.ALARM_SOUND;
    this._clearBeepTimeouts();

    for (let group = 0; group < GROUPS; group++) {
      const groupStart = group * (BEEPS_PER_GROUP * INTERVAL + GROUP_PAUSE);
      for (let i = 0; i < BEEPS_PER_GROUP; i++) {
        this._scheduleBeep(groupStart + i * INTERVAL, FREQUENCY, DURATION);
      }
    }
  }

  _scheduleBeep(delay, frequency, duration) {
    const timeoutId = setTimeout(() => {
      const idx = this.beepTimeoutIds.indexOf(timeoutId);
      if (idx > -1) this.beepTimeoutIds.splice(idx, 1);

      try {
        const ctx = this.audioContext;
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        console.warn('Failed to play beep:', e);
      }
    }, delay);
    this.beepTimeoutIds.push(timeoutId);
  }

  _clearBeepTimeouts() {
    this.beepTimeoutIds.forEach((id) => clearTimeout(id));
    this.beepTimeoutIds = [];
  }

  // =========================================
  // List Rendering
  // =========================================

  _renderList() {
    if (!this.listContainer || !this.emptyState) return;

    if (this.schedules.length === 0) {
      this.emptyState.style.display = 'flex';
      this.listContainer.style.display = 'none';
      this.listContainer.innerHTML = '';
      return;
    }

    this.emptyState.style.display = 'none';
    this.listContainer.style.display = 'flex';

    const sorted = [...this.schedules].sort((a, b) => {
      return a.time.hours * 60 + a.time.minutes - (b.time.hours * 60 + b.time.minutes);
    });

    this.listContainer.innerHTML = sorted.map((s) => this._renderItem(s)).join('');
    this._bindItemEvents();
  }

  _renderItem(schedule) {
    const timeStr = `${this._pad(schedule.time.hours)}:${this._pad(schedule.time.minutes)}`;
    const actionLabel = this._escapeHtml(this._getActionLabel(schedule.action));
    const repeatLabel = this._escapeHtml(this._getRepeatLabel(schedule.repeat));
    const icon = ScheduleRenderer.ICONS[schedule.action.type] || '';

    return `
      <div class="schedule-item ${schedule.enabled ? '' : 'disabled'}" data-schedule-id="${this._escapeHtml(schedule.id)}">
        <div class="schedule-item-main">
          <div class="schedule-item-time">
            <span class="schedule-time-value">${timeStr}</span>
            <span class="schedule-repeat-badge">${repeatLabel}</span>
          </div>
          <div class="schedule-item-action">
            ${icon}
            <span class="schedule-action-label">${actionLabel}</span>
          </div>
        </div>
        <div class="schedule-item-controls">
          <label class="schedule-toggle">
            <input type="checkbox" ${schedule.enabled ? 'checked' : ''}>
            <span class="schedule-toggle-slider"></span>
          </label>
          <button class="schedule-item-edit" title="Edit">${ScheduleRenderer.ICONS.edit}</button>
          <button class="schedule-item-delete" title="Delete">${ScheduleRenderer.ICONS.delete}</button>
        </div>
      </div>
    `;
  }

  _bindItemEvents() {
    this.listContainer.querySelectorAll('.schedule-item').forEach((item) => {
      const id = item.dataset.scheduleId;
      item.querySelector('.schedule-toggle input')?.addEventListener('change', () => this.toggleSchedule(id));
      item.querySelector('.schedule-item-edit')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showEditPopup(id);
      });
      item.querySelector('.schedule-item-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSchedule(id);
      });
    });
  }

  _updateItemUI(id) {
    const schedule = this.schedules.find((s) => s.id === id);
    if (!schedule) return;

    const item = this.listContainer?.querySelector(`[data-schedule-id="${id}"]`);
    if (!item) return;

    item.classList.toggle('disabled', !schedule.enabled);
    const toggle = item.querySelector('.schedule-toggle input');
    if (toggle) toggle.checked = schedule.enabled;
  }

  _getActionLabel(action) {
    switch (action.type) {
      case ScheduleRenderer.ACTION_TYPES.ALARM:
        return this._t('schedule.actionAlarm', 'Alarm');
      case ScheduleRenderer.ACTION_TYPES.OPEN_APP:
        return action.config?.appName || this._t('schedule.actionOpenApp', 'Open App');
      case ScheduleRenderer.ACTION_TYPES.OPEN_URL:
        return action.config?.url ? this._truncateUrl(action.config.url) : this._t('schedule.actionOpenUrl', 'Open URL');
      default:
        return action.type;
    }
  }

  _getRepeatLabel(repeat) {
    switch (repeat.type) {
      case ScheduleRenderer.REPEAT_TYPES.ONCE:
        return this._t('schedule.repeatOnce', 'Once');
      case ScheduleRenderer.REPEAT_TYPES.DAILY:
        return this._t('schedule.repeatDaily', 'Daily');
      case ScheduleRenderer.REPEAT_TYPES.WEEKDAYS:
        if (repeat.weekdays?.length === 7) return this._t('schedule.repeatDaily', 'Daily');
        if (!repeat.weekdays?.length) return this._t('schedule.repeatOnce', 'Once');
        return this._formatWeekdays(repeat.weekdays);
      default:
        return this._t('schedule.repeatOnce', 'Once');
    }
  }

  _formatWeekdays(weekdays) {
    if (!weekdays?.length) return this._t('schedule.repeatOnce', 'Once');
    const dayNames = [
      this._t('schedule.daySun', 'Sun'),
      this._t('schedule.dayMon', 'Mon'),
      this._t('schedule.dayTue', 'Tue'),
      this._t('schedule.dayWed', 'Wed'),
      this._t('schedule.dayThu', 'Thu'),
      this._t('schedule.dayFri', 'Fri'),
      this._t('schedule.daySat', 'Sat'),
    ];
    return weekdays
      .sort((a, b) => a - b)
      .map((d) => dayNames[d])
      .join(', ');
  }

  // =========================================
  // Popup: Add/Edit
  // =========================================

  showAddPopup() {
    this.hidePopup();
    this.editingScheduleId = null;

    const now = new Date();
    this.pendingRepeatConfig = { type: ScheduleRenderer.REPEAT_TYPES.ONCE };

    this._createPopup('add', now.getHours(), now.getMinutes(), ScheduleRenderer.ACTION_TYPES.ALARM, {});
  }

  showEditPopup(id) {
    const schedule = this.schedules.find((s) => s.id === id);
    if (!schedule) return;

    this.hidePopup();
    this.editingScheduleId = id;
    this.pendingRepeatConfig = {
      type: schedule.repeat.type,
      ...(schedule.repeat.weekdays && { weekdays: [...schedule.repeat.weekdays] }),
    };

    this._createPopup('edit', schedule.time.hours, schedule.time.minutes, schedule.action.type, schedule.action.config || {});
  }

  _createPopup(mode, hours, minutes, actionType, actionConfig) {
    const overlay = document.createElement('div');
    overlay.className = 'schedule-popup-overlay';

    const popup = document.createElement('div');
    popup.className = `schedule-popup schedule-${mode}-popup`;
    popup.innerHTML = this._getPopupHTML(mode, hours, minutes, actionType, actionConfig);

    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    this.activePopup = popup;
    this.activeOverlay = overlay;

    this._bindPopupEvents(popup, overlay);

    requestAnimationFrame(() => {
      popup.querySelector('.schedule-time-hours')?.focus();
    });
  }

  _getPopupHTML(mode, hours, minutes, actionType, actionConfig) {
    const title = mode === 'add' ? this._t('schedule.addSchedule', 'Add Schedule') : this._t('schedule.editSchedule', 'Edit Schedule');

    return `
      <div class="schedule-popup-header">
        <span class="schedule-popup-title">${title}</span>
        <button type="button" class="schedule-popup-close">&times;</button>
      </div>
      <div class="schedule-popup-content">
        <div class="schedule-time-picker">
          <input type="number" class="schedule-time-hours" min="0" max="23" value="${this._pad(hours)}">
          <span class="schedule-time-separator">:</span>
          <input type="number" class="schedule-time-minutes" min="0" max="59" value="${this._pad(minutes)}">
        </div>
        <div class="schedule-form-group">
          <label>${this._t('schedule.action', 'Action')}</label>
          <select class="schedule-action-select">
            <option value="alarm" ${actionType === 'alarm' ? 'selected' : ''}>${this._t('schedule.actionAlarm', 'Alarm')}</option>
            <option value="open-app" ${actionType === 'open-app' ? 'selected' : ''}>${this._t('schedule.actionOpenApp', 'Open App')}</option>
            <option value="open-url" ${actionType === 'open-url' ? 'selected' : ''}>${this._t('schedule.actionOpenUrl', 'Open URL')}</option>
          </select>
        </div>
        <div class="schedule-action-config">${this._renderActionConfig(actionType, actionConfig)}</div>
        <div class="schedule-form-group">
          <label>${this._t('schedule.repeat', 'Repeat')}</label>
          <button type="button" class="schedule-repeat-btn">
            <span class="schedule-repeat-label">${this._getRepeatLabel(this.pendingRepeatConfig)}</span>
            ${ScheduleRenderer.ICONS.chevronDown}
          </button>
        </div>
      </div>
      <div class="schedule-popup-footer">
        <button type="button" class="schedule-btn-cancel">${this._t('common.cancel', 'Cancel')}</button>
        <button type="button" class="schedule-btn-save">${this._t('slideTemplate.save', 'Save')}</button>
      </div>
    `;
  }

  _renderActionConfig(actionType, config = {}) {
    switch (actionType) {
      case ScheduleRenderer.ACTION_TYPES.OPEN_APP:
        return `
          <div class="schedule-config-app">
            <input type="text" class="schedule-app-path" placeholder="${this._t('schedule.selectApp', 'Select an app...')}" value="${config.appName || ''}" readonly>
            <input type="hidden" class="schedule-app-path-hidden" value="${config.appPath || ''}">
            <button type="button" class="schedule-browse-app">${this._t('schedule.browse', 'Browse')}</button>
          </div>
        `;
      case ScheduleRenderer.ACTION_TYPES.OPEN_URL:
        return `
          <div class="schedule-config-url">
            <input type="url" class="schedule-url-input" placeholder="${this._t('schedule.urlPlaceholder', 'https://...')}" value="${config.url || ''}">
          </div>
        `;
      default:
        return '';
    }
  }

  // =========================================
  // Popup: Event Binding
  // =========================================

  _bindPopupEvents(popup, overlay) {
    const addListener = (el, event, handler, options) => {
      if (!el) return;
      el.addEventListener(event, handler, options);
      this._popupCleanupFns.push(() => el.removeEventListener(event, handler, options));
    };

    // Close handlers
    const closeHandler = () => this.hidePopup();
    addListener(popup.querySelector('.schedule-popup-close'), 'click', closeHandler);
    addListener(popup.querySelector('.schedule-btn-cancel'), 'click', closeHandler);
    addListener(overlay, 'click', (e) => e.target === overlay && this.hidePopup());
    addListener(popup, 'click', (e) => e.stopPropagation());

    // Save
    addListener(popup.querySelector('.schedule-btn-save'), 'click', () => this._handleSave(popup));

    // Action select
    const actionSelect = popup.querySelector('.schedule-action-select');
    addListener(actionSelect, 'change', () => {
      const configContainer = popup.querySelector('.schedule-action-config');
      if (configContainer) {
        configContainer.innerHTML = this._renderActionConfig(actionSelect.value, {});
        this._bindActionConfigEvents(popup);
      }
    });

    // Repeat button
    addListener(popup.querySelector('.schedule-repeat-btn'), 'click', (e) => {
      e.stopPropagation();
      this._showRepeatMenu(popup);
    });

    // Time inputs
    this._bindTimeInputEvents(popup, addListener);
    this._bindActionConfigEvents(popup);
  }

  _bindTimeInputEvents(popup, addListener) {
    const adjustValue = (input, delta, max) => {
      let val = parseInt(input.value, 10) || 0;
      val = (val + delta + max + 1) % (max + 1);
      input.value = this._pad(val);
    };

    const bindTimeInput = (input, max) => {
      if (!input) return;
      addListener(input, 'input', () => {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, 2);
      });
      addListener(input, 'blur', () => {
        const val = parseInt(input.value, 10) || 0;
        input.value = this._pad(Math.min(max, Math.max(0, val)));
      });
      addListener(input, 'wheel', (e) => {
        e.preventDefault();
        adjustValue(input, e.deltaY < 0 ? 1 : -1, max);
      }, { passive: false });
      addListener(input, 'keydown', (e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          adjustValue(input, 1, max);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          adjustValue(input, -1, max);
        }
      });
    };

    bindTimeInput(popup.querySelector('.schedule-time-hours'), 23);
    bindTimeInput(popup.querySelector('.schedule-time-minutes'), 59);
  }

  _bindActionConfigEvents(popup) {
    const browseBtn = popup.querySelector('.schedule-browse-app');
    if (!browseBtn) return;

    const handler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const result = await window.electronAPI?.schedule?.selectApp();
        if (result?.path) {
          const pathInput = popup.querySelector('.schedule-app-path');
          const hiddenInput = popup.querySelector('.schedule-app-path-hidden');
          if (pathInput) pathInput.value = result.name || result.path;
          if (hiddenInput) hiddenInput.value = result.path;
        }
      } catch (err) {
        console.error('Failed to select app:', err);
      }
    };

    browseBtn.addEventListener('click', handler);
    this._popupCleanupFns.push(() => browseBtn.removeEventListener('click', handler));
  }

  // =========================================
  // Popup: Repeat Menu
  // =========================================

  _showRepeatMenu(popup) {
    popup.querySelector('.schedule-repeat-overlay')?.remove();

    const currentType = this.pendingRepeatConfig?.type || ScheduleRenderer.REPEAT_TYPES.ONCE;
    const currentWeekdays = Array.isArray(this.pendingRepeatConfig?.weekdays) ? this.pendingRepeatConfig.weekdays : [];
    const selectedDays = new Set(currentWeekdays);

    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) =>
      this._t(`schedule.day${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}`, d)
    );

    const overlay = document.createElement('div');
    overlay.className = 'schedule-repeat-overlay';

    const menu = document.createElement('div');
    menu.className = 'schedule-repeat-menu';
    menu.innerHTML = `
      <div class="schedule-repeat-option ${currentType === 'once' ? 'active' : ''}" data-repeat="once">
        <span class="schedule-option-check"></span>
        <span>${this._t('schedule.repeatOnce', 'Once')}</span>
      </div>
      <div class="schedule-repeat-option ${currentType === 'daily' ? 'active' : ''}" data-repeat="daily">
        <span class="schedule-option-check"></span>
        <span>${this._t('schedule.repeatDaily', 'Daily')}</span>
      </div>
      <div class="schedule-repeat-separator"></div>
      <div class="schedule-repeat-weekdays">
        <span class="schedule-weekdays-label">${this._t('schedule.repeatWeekdays', 'Weekdays')}</span>
        <div class="schedule-weekday-buttons">
          ${dayLabels.map((d, i) => `<button type="button" data-day="${i}" class="${selectedDays.has(i) ? 'active' : ''}">${d}</button>`).join('')}
        </div>
      </div>
    `;

    overlay.appendChild(menu);
    popup.appendChild(overlay);

    // Event handlers
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === overlay) overlay.remove();
    });

    menu.addEventListener('click', (e) => e.stopPropagation());

    menu.querySelectorAll('.schedule-repeat-option').forEach((opt) => {
      opt.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pendingRepeatConfig = { type: opt.dataset.repeat };
        this._updateRepeatLabel(popup);
        overlay.remove();
      });
    });

    menu.querySelectorAll('.schedule-weekday-buttons button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const day = parseInt(btn.dataset.day, 10);
        if (isNaN(day)) return;

        selectedDays.has(day) ? selectedDays.delete(day) : selectedDays.add(day);
        btn.classList.toggle('active', selectedDays.has(day));

        this.pendingRepeatConfig = {
          type: ScheduleRenderer.REPEAT_TYPES.WEEKDAYS,
          weekdays: Array.from(selectedDays).sort((a, b) => a - b),
        };
        this._updateRepeatLabel(popup);
        menu.querySelectorAll('.schedule-repeat-option').forEach((o) => o.classList.remove('active'));
      });
    });
  }

  _updateRepeatLabel(popup) {
    const label = popup.querySelector('.schedule-repeat-label');
    if (label && this.pendingRepeatConfig) {
      label.textContent = this._getRepeatLabel(this.pendingRepeatConfig);
    }
  }

  // =========================================
  // Popup: Save & Hide
  // =========================================

  _handleSave(popup) {
    const hours = parseInt(popup.querySelector('.schedule-time-hours')?.value, 10) || 0;
    const minutes = parseInt(popup.querySelector('.schedule-time-minutes')?.value, 10) || 0;
    const actionType = popup.querySelector('.schedule-action-select')?.value || 'alarm';

    let actionConfig = {};

    if (actionType === ScheduleRenderer.ACTION_TYPES.OPEN_APP) {
      const appPath = popup.querySelector('.schedule-app-path-hidden')?.value;
      const appName = popup.querySelector('.schedule-app-path')?.value;
      if (!appPath) {
        alert(this._t('schedule.pleaseSelectApp', 'Please select an app'));
        return;
      }
      actionConfig = { appPath, appName };
    } else if (actionType === ScheduleRenderer.ACTION_TYPES.OPEN_URL) {
      let url = popup.querySelector('.schedule-url-input')?.value?.trim();
      if (!url) {
        alert(this._t('schedule.pleaseEnterUrl', 'Please enter a URL'));
        return;
      }
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (!this._isValidUrl(url)) {
        alert(this._t('schedule.invalidUrl', 'Please enter a valid URL'));
        return;
      }
      actionConfig = { url };
    }

    let repeatConfig = this.pendingRepeatConfig || { type: ScheduleRenderer.REPEAT_TYPES.ONCE };
    if (repeatConfig.type === ScheduleRenderer.REPEAT_TYPES.WEEKDAYS && !repeatConfig.weekdays?.length) {
      repeatConfig = { type: ScheduleRenderer.REPEAT_TYPES.ONCE };
    }

    const data = {
      time: { hours, minutes },
      action: { type: actionType, config: actionConfig },
      repeat: repeatConfig,
    };

    if (this.editingScheduleId) {
      this.updateSchedule(this.editingScheduleId, data);
    } else {
      this.addSchedule(data);
    }

    this.hidePopup();
  }

  hidePopup() {
    this._popupCleanupFns.forEach((fn) => {
      try { fn(); } catch {}
    });
    this._popupCleanupFns = [];

    this.activeOverlay?.remove();
    this.activePopup?.remove();
    this.activeOverlay = null;
    this.activePopup = null;
    this.editingScheduleId = null;
    this.pendingRepeatConfig = null;
  }

  // =========================================
  // Persistence
  // =========================================

  loadSchedules() {
    try {
      const saved = localStorage.getItem(ScheduleRenderer.STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : [];

      this.schedules = Array.isArray(parsed)
        ? parsed.map((s) => this._validateSchedule(s)).filter(Boolean)
        : [];

      if (parsed.length !== this.schedules.length) {
        this.saveSchedules();
      }
    } catch (err) {
      console.error('Failed to load schedules:', err);
      this.schedules = [];
    }
    this._renderList();
  }

  saveSchedules() {
    try {
      localStorage.setItem(ScheduleRenderer.STORAGE_KEY, JSON.stringify(this.schedules));
    } catch (err) {
      console.error('Failed to save schedules:', err);
    }
  }

  // =========================================
  // Cleanup
  // =========================================

  destroy() {
    this._stopTimeChecker();
    this._clearBeepTimeouts();
    this._unbindGlobalEvents();
    this.hidePopup();

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.schedules = [];
    this.triggeredToday.clear();
    this.lastDateKey = null;

    this.container = null;
    this.emptyState = null;
    this.listContainer = null;
    this.addBtn = null;
    this._popupCleanupFns = [];
  }
}

// =========================================
// Initialize
// =========================================

(function initSchedule() {
  const init = () => {
    if (window.scheduleApp?.destroy) {
      window.scheduleApp.destroy();
    }
    window.scheduleApp = new ScheduleRenderer();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
