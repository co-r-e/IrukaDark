(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('tr', {
    errorOccurred: 'Bir hata oluştu',
    apiKeyMissing: 'API anahtarı yok. .env.local içinde GEMINI_API_KEY ayarlayın.',
    apiUnavailable: 'Electron API kullanılamıyor. Uygulamayı yeniden başlatın.',
    unexpectedResponse: 'API beklenmeyen yanıt döndürdü.',
    apiError: 'API hatası:',
    textNotRetrieved: 'Metin alınamadı',
    thinking: 'Düşünüyorum…',
    searching: "Web'de aranıyor…",
    accessibilityWarning:
      'Otomatik kopyalama için Sistem Ayarları > Güvenlik ve Gizlilik > Erişilebilirlik izni verin.',
    shortcutRegistered: (accel) => `Kısayol ${accel} olarak ayarlandı`,
    failedToRegisterShortcut: 'Kısayol kaydedilemedi. Başka bir uygulama ile çakışıyor olabilir.',
    placeholder: "IrukaDark'a sor…",
    send: 'Gönder',
    stop: 'Durdur',
    canceled: 'İptal edildi.',
    historyCleared: 'Sohbet geçmişi temizlendi.',
    historyCompacted: 'Geçmiş özetlenip sıkıştırıldı.',
    availableCommands:
      'Komutlar: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate_JA, /translate_EN, /translate_zh-CN, /translate_zh-TW',
    sourcesBadge: 'Kaynaklar',
    webSearchEnabled: 'Web araması etkinleştirildi.',
    webSearchDisabled: 'Web araması devre dışı.',
    webSearchStatusOn: 'Web araması: AÇIK',
    webSearchStatusOff: 'Web araması: KAPALI',
    webSearchHelp: '/websearch on|off|status kullanın',
    noPreviousAI: 'Devam edilecek önceki bir yapay zekâ mesajı yok.',
    selectionExplanation: 'Seçim açıklaması',
    selectionTranslation: 'Seçimi çevir',
    updateAvailable: (v) => `Yeni sürüm (${v}) mevcut. İndirmeleri açalım mı?`,
    upToDate: 'Güncelsiniz.',
    updateCheckFailed: 'Güncelleme kontrolü başarısız.',
  });
})();
