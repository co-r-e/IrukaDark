(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('ja', {
    errorOccurred: 'エラーが発生しました',
    apiUnavailable: 'Electron APIが利用できません。アプリを再起動してください。',
    unexpectedResponse: 'APIから予期しない応答が返されました。',
    apiError: 'APIエラーが発生しました:',
    textNotRetrieved: 'テキスト取得失敗',
    thinking: '考え中...',
    shortcutRegistered: (accel) => `ショートカットを ${accel} に設定しました`,
    failedToRegisterShortcut:
      'ショートカットの登録に失敗しました。別のアプリと競合している可能性があります。',
    placeholder: 'イルカダークに質問する',
    send: '送信',
    stop: '停止',
    canceled: '中断しました。',
    historyCompacted: '履歴を要約して圧縮しました。',
    availableCommands:
      '利用可能なコマンド: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate',
    sourcesBadge: '参照',
    webSearchEnabled: 'Web検索を有効にしました。',
    webSearchDisabled: 'Web検索を無効にしました。',
    webSearchStatusOn: 'Web検索: ON',
    webSearchStatusOff: 'Web検索: OFF',
    webSearchHelp: '/web on|off|status を使用できます',
    noPreviousAI: '直前のAIメッセージがありません。',
    selectionExplanation: '選択範囲の解説',
    selectionTranslation: '選択範囲の翻訳',
    selectionPronunciation: '選択範囲の発音',
    selectionEmpathy: '選択範囲への共感コメント',
    urlContextSummary: (url) => `URLの概要を取得します:\n${url}`,
    urlContextDetailed: (url) => `URLの内容を詳しく解説します:\n${url}`,
    snsPostRequest: (url) => `SNS投稿用のドラフトを作成します:\n${url}`,
    invalidUrlSelection:
      '有効なURLが見つかりません。http(s)のURLを1件だけ選択して再度お試しください。',
    updateAvailable: (v) =>
      `新しいバージョン（${v}）が利用可能です。ダウンロードページを開きますか？`,
    upToDate: '最新の状態です。',
    slashDescriptions: {
      what: '直前のAI出力をわかりやすく説明',
      next: '直前のAI回答の続きを生成',
      table: '直前のAI出力を表形式に整形',
      translate: '直前のAI出力を翻訳',
      clear: '履歴をクリア',
      compact: '履歴を要約して圧縮',
      web: 'Web検索の設定',
      webOn: 'Web検索を有効化',
      webOff: 'Web検索を無効化',
      webStatus: 'Web検索の状態を表示',
      contact: '連絡先ページを開く',
    },
    slashTranslateIntoLanguage: (name) => `${name}に翻訳`,
  });
})();
