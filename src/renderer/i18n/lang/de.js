(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('de', {
    errorOccurred: 'Ein Fehler ist aufgetreten',
    apiKeyMissing: 'API‑Schlüssel fehlt. Lege GEMINI_API_KEY in .env.local fest.',
    apiUnavailable: 'Electron‑API ist nicht verfügbar. Bitte App neu starten.',
    unexpectedResponse: 'Unerwartete Antwort der API.',
    apiError: 'API‑Fehler:',
    textNotRetrieved: 'Text konnte nicht abgerufen werden',
    thinking: 'Denke nach…',
    searching: 'Websuche läuft…',
    accessibilityWarning:
      'Für automatisches Kopieren bitte in Systemeinstellungen > Sicherheit & Datenschutz > Bedienungshilfen erlauben.',
    shortcutRegistered: (accel) => `Tastenkürzel auf ${accel} gesetzt`,
    failedToRegisterShortcut:
      'Registrierung des Kürzels fehlgeschlagen. Möglicher Konflikt mit anderer App.',
    placeholder: 'Frag IrukaDark…',
    send: 'Senden',
    stop: 'Stopp',
    canceled: 'Abgebrochen.',
    historyCleared: 'Chat‑Verlauf gelöscht.',
    historyCompacted: 'Verlauf zusammengefasst und komprimiert.',
    availableCommands: 'Befehle: /clear, /compact, /next, /contact, /web (on/off/status)',
    sourcesBadge: 'Quellen',
    webSearchEnabled: 'Websuche aktiviert.',
    webSearchDisabled: 'Websuche deaktiviert.',
    webSearchStatusOn: 'Websuche: AN',
    webSearchStatusOff: 'Websuche: AUS',
    webSearchHelp: 'Nutze /websearch on|off|status',
    noPreviousAI: 'Kein vorheriger KI‑Beitrag zum Fortsetzen.',
    selectionExplanation: 'Erläuterung der Auswahl',
    selectionTranslation: 'Auswahl übersetzen',
    updateAvailable: (v) => `Neue Version (${v}) verfügbar. Downloads öffnen?`,
    upToDate: 'Du bist auf dem neuesten Stand.',
    updateCheckFailed: 'Update‑Prüfung fehlgeschlagen.',
  });
})();
