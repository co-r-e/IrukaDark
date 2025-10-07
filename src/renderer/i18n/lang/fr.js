(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('fr', {
    errorOccurred: "Un truc s'est mal passé",
    apiUnavailable: "L'API de Electron n'est pas dispo. Redémarre l'application.",
    unexpectedResponse: "Réponse inattendue de l'API.",
    apiError: "Erreur d'API :",
    textNotRetrieved: 'Impossible de récupérer le texte',
    thinking: 'Réflexion…',
    shortcutRegistered: (accel) => `Raccourci défini sur ${accel}`,
    failedToRegisterShortcut:
      'Échec de l’enregistrement du raccourci. Conflit possible avec une autre app.',
    placeholder: 'Demandez à IrukaDark…',
    send: 'Envoyer',
    stop: 'Arrêter',
    canceled: 'Annulé.',
    historyCompacted: 'Historique résumé et compacté.',
    availableCommands:
      'Commandes : /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate',
    sourcesBadge: 'Sources',
    webSearchEnabled: 'Recherche Web activée.',
    webSearchDisabled: 'Recherche Web désactivée.',
    webSearchStatusOn: 'Recherche Web : ON',
    webSearchStatusOff: 'Recherche Web : OFF',
    webSearchHelp: 'Utilisez /web on|off|status',
    noPreviousAI: 'Aucun message IA précédent à poursuivre.',
    selectionExplanation: 'Explication de la sélection',
    selectionTranslation: 'Traduire la sélection',
    selectionPronunciation: 'Prononcer la sélection',
    selectionEmpathy: 'Réponse empathique pour la sélection',
    urlContextSummary: (url) => `Résumé de l’URL sélectionnée :\n${url}`,
    urlContextDetailed: (url) => `Analyse détaillée de l’URL sélectionnée :\n${url}`,
    snsPostRequest: (url) => `Préparer un post X à partir de cette URL :\n${url}`,
    invalidUrlSelection:
      'Aucune URL valide détectée. Sélectionnez une seule URL http(s) puis réessayez.',
    updateAvailable: (v) =>
      `Nouvelle version (${v}) disponible. Ouvrir la page de téléchargement ?`,
    upToDate: 'Vous êtes à jour.',
    slashDescriptions: {
      what: 'Clarifier la dernière réponse de l’IA',
      next: 'Continuer la dernière réponse de l’IA',
      table: 'Mettre la dernière réponse de l’IA en tableau',
      translate: 'Traduire la dernière réponse de l’IA',
      clear: 'Effacer l’historique du chat',
      compact: 'Résumer et compacter l’historique',
      web: 'Commandes de recherche Web',
      webOn: 'Activer la recherche Web',
      webOff: 'Désactiver la recherche Web',
      webStatus: 'Afficher l’état de la recherche Web',
      contact: 'Ouvrir la page de contact',
    },
    slashTranslateIntoLanguage: (name) => `Traduire en ${name}`,
  });
})();
