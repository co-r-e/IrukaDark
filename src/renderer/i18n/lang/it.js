(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('it', {
    errorOccurred: 'Si è verificato un errore',
    apiKeyMissing: 'Chiave API mancante. Imposta GEMINI_API_KEY in .env.local.',
    apiUnavailable: "L'API di Electron non è disponibile. Riavvia l'app.",
    unexpectedResponse: "Risposta inattesa dall'API.",
    apiError: 'Errore API:',
    textNotRetrieved: 'Impossibile ottenere il testo',
    thinking: 'Sto pensando…',
    searching: 'Ricerca sul web…',
    accessibilityWarning:
      "Per la copia automatica, concedi l'autorizzazione in Impostazioni di sistema > Sicurezza e privacy > Accessibilità.",
    shortcutRegistered: (accel) => `Scorciatoia impostata su ${accel}`,
    failedToRegisterShortcut:
      "Impossibile registrare la scorciatoia. Possibile conflitto con un'altra app.",
    placeholder: 'Chiedi a IrukaDark…',
    send: 'Invia',
    stop: 'Stop',
    canceled: 'Annullato.',
    historyCleared: 'Cronologia pulita.',
    historyCompacted: 'Cronologia riassunta e compressa.',
    availableCommands:
      'Comandi: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate (JA/EN/zh-CN/zh-TW)',
    sourcesBadge: 'Fonti',
    webSearchEnabled: 'Ricerca web attivata.',
    webSearchDisabled: 'Ricerca web disattivata.',
    webSearchStatusOn: 'Ricerca web: ATTIVA',
    webSearchStatusOff: 'Ricerca web: DISATTIVA',
    webSearchHelp: 'Usa /websearch on|off|status',
    noPreviousAI: 'Nessun messaggio IA precedente da continuare.',
    selectionExplanation: 'Spiegazione selezione',
    selectionTranslation: 'Traduci selezione',
    updateAvailable: (v) => `Nuova versione (${v}) disponibile. Aprire la pagina di download?`,
    upToDate: 'Sei aggiornato.',
    updateCheckFailed: 'Verifica aggiornamenti non riuscita.',
  });
})();
