(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('fr', {
    errorOccurred: "Un truc s'est mal passé",
    apiKeyMissing: 'Pas de clé API. Mets GEMINI_API_KEY dans .env.local.',
    apiUnavailable: "L'API de Electron n'est pas dispo. Redémarre l'application.",
    unexpectedResponse: "Réponse inattendue de l'API.",
    apiError: "Erreur d'API :",
    textNotRetrieved: 'Impossible de récupérer le texte',
    thinking: 'Réflexion…',
    searching: 'Recherche sur le web…',
    accessibilityWarning:
      "Pour la copie automatique, accordez l'autorisation dans Réglages Système > Sécurité et confidentialité > Accessibilité.",
    shortcutRegistered: (accel) => `Raccourci défini sur ${accel}`,
    failedToRegisterShortcut:
      'Échec de l’enregistrement du raccourci. Conflit possible avec une autre app.',
    placeholder: 'Demandez à IrukaDark…',
    send: 'Envoyer',
    stop: 'Arrêter',
    canceled: 'Annulé.',
    historyCleared: 'Historique effacé.',
    historyCompacted: 'Historique résumé et compacté.',
    availableCommands:
      'Commandes : /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate_JA, /translate_EN, /translate_zh-CN, /translate_zh-TW',
    sourcesBadge: 'Sources',
    webSearchEnabled: 'Recherche Web activée.',
    webSearchDisabled: 'Recherche Web désactivée.',
    webSearchStatusOn: 'Recherche Web : ON',
    webSearchStatusOff: 'Recherche Web : OFF',
    webSearchHelp: 'Utilisez /websearch on|off|status',
    noPreviousAI: 'Aucun message IA précédent à poursuivre.',
    selectionExplanation: 'Explication de la sélection',
    selectionTranslation: 'Traduire la sélection',
    updateAvailable: (v) =>
      `Nouvelle version (${v}) disponible. Ouvrir la page de téléchargement ?`,
    upToDate: 'Vous êtes à jour.',
    updateCheckFailed: 'Échec de la vérification des mises à jour.',
  });
})();
