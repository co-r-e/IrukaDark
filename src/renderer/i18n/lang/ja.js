(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('ja', {
    errorOccurred: 'エラーが発生しました',
    apiKeyMissing:
      'APIキーが設定されていません。.env.localファイルにGEMINI_API_KEYを設定してください。',
    apiUnavailable: 'Electron APIが利用できません。アプリを再起動してください。',
    unexpectedResponse: 'APIから予期しない応答が返されました。',
    apiError: 'APIエラーが発生しました:',
    textNotRetrieved: 'テキスト取得失敗',
    thinking: '考え中...',
    searching: 'Web検索中...',
    accessibilityWarning:
      '自動コピーのため、システム設定 > プライバシーとセキュリティ > アクセシビリティ で許可が必要です。未許可の場合は手動でコピー（Cmd+C）してから実行してください。',
    shortcutRegistered: (accel) => `ショートカットを ${accel} に設定しました`,
    failedToRegisterShortcut:
      'ショートカットの登録に失敗しました。別のアプリと競合している可能性があります。',
    placeholder: 'イルカダークに質問する',
    send: '送信',
    stop: '停止',
    canceled: '中断しました。',
    historyCleared: '履歴をクリアしました。',
    historyCompacted: '履歴を要約して圧縮しました。',
    availableCommands:
      '利用可能なコマンド: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate_JA, /translate_EN, /translate_zh-CN, /translate_zh-TW',
    sourcesBadge: '参照',
    webSearchEnabled: 'Web検索を有効にしました。',
    webSearchDisabled: 'Web検索を無効にしました。',
    webSearchStatusOn: 'Web検索: ON',
    webSearchStatusOff: 'Web検索: OFF',
    webSearchHelp: '/websearch on|off|status を使用できます',
    noPreviousAI: '直前のAIメッセージがありません。',
    selectionExplanation: '選択範囲の解説',
    selectionTranslation: '選択範囲の翻訳',
    updateAvailable: (v) =>
      `新しいバージョン（${v}）が利用可能です。ダウンロードページを開きますか？`,
    upToDate: '最新の状態です。',
    updateCheckFailed: 'アップデートの確認に失敗しました。',
  });
})();
