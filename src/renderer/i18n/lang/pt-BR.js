(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('pt-BR', {
    errorOccurred: 'Ocorreu um erro',
    apiKeyMissing: 'Chave de API ausente. Defina GEMINI_API_KEY em .env.local.',
    apiUnavailable: 'A API do Electron não está disponível. Reinicie o app.',
    unexpectedResponse: 'Resposta inesperada da API.',
    apiError: 'Erro da API:',
    textNotRetrieved: 'Falha ao obter o texto',
    thinking: 'Pensando…',
    searching: 'Pesquisando na web…',
    accessibilityWarning:
      'Para cópia automática, conceda permissão em Ajustes do Sistema > Segurança e Privacidade > Acessibilidade.',
    shortcutRegistered: (accel) => `Atalho definido para ${accel}`,
    failedToRegisterShortcut: 'Falha ao registrar atalho. Pode haver conflito com outro app.',
    placeholder: 'Pergunte ao IrukaDark…',
    send: 'Enviar',
    stop: 'Parar',
    canceled: 'Cancelado.',
    historyCleared: 'Histórico limpo.',
    historyCompacted: 'Histórico resumido e compactado.',
    availableCommands:
      'Comandos: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate (JA/EN/zh-CN/zh-TW)',
    sourcesBadge: 'Fontes',
    webSearchEnabled: 'Pesquisa na web ativada.',
    webSearchDisabled: 'Pesquisa na web desativada.',
    webSearchStatusOn: 'Pesquisa na web: ON',
    webSearchStatusOff: 'Pesquisa na web: OFF',
    webSearchHelp: 'Use /websearch on|off|status',
    noPreviousAI: 'Nenhuma mensagem anterior da IA para continuar.',
    selectionExplanation: 'Explicação da seleção',
    selectionTranslation: 'Traduzir seleção',
    updateAvailable: (v) => `Nova versão (${v}) disponível. Abrir downloads?`,
    upToDate: 'Você está atualizado.',
    updateCheckFailed: 'Falha ao verificar atualizações.',
  });
})();
