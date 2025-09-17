(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('id', {
    errorOccurred: 'Terjadi kesalahan',
    apiKeyMissing: 'Kunci API belum diatur. Setel GEMINI_API_KEY di .env.local.',
    apiUnavailable: 'API Electron tidak tersedia. Mulai ulang aplikasi.',
    unexpectedResponse: 'Respons API tidak terduga.',
    apiError: 'Kesalahan API:',
    textNotRetrieved: 'Gagal mengambil teks',
    thinking: 'Berpikir…',
    searching: 'Mencari di web…',
    accessibilityWarning:
      'Untuk penyalinan otomatis, beri izin di Pengaturan Sistem > Keamanan & Privasi > Aksesibilitas.',
    shortcutRegistered: (accel) => `Pintasan disetel ke ${accel}`,
    failedToRegisterShortcut: 'Gagal mendaftarkan pintasan. Mungkin konflik dengan aplikasi lain.',
    placeholder: 'Tanyakan pada IrukaDark…',
    send: 'Kirim',
    stop: 'Berhenti',
    canceled: 'Dibatalkan.',
    historyCleared: 'Riwayat obrolan dihapus.',
    historyCompacted: 'Riwayat diringkas dan dipadatkan.',
    availableCommands:
      'Perintah: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate (JA/EN/zh-CN/zh-TW)',
    sourcesBadge: 'Sumber',
    webSearchEnabled: 'Penelusuran web diaktifkan.',
    webSearchDisabled: 'Penelusuran web dinonaktifkan.',
    webSearchStatusOn: 'Penelusuran web: AKTIF',
    webSearchStatusOff: 'Penelusuran web: NONAKTIF',
    webSearchHelp: 'Gunakan /websearch on|off|status',
    noPreviousAI: 'Tidak ada pesan AI sebelumnya untuk dilanjutkan.',
    selectionExplanation: 'Penjelasan pilihan',
    selectionTranslation: 'Terjemahkan pilihan',
    updateAvailable: (v) => `Versi baru (${v}) tersedia. Buka unduhan?`,
    upToDate: 'Anda sudah versi terbaru.',
    updateCheckFailed: 'Gagal memeriksa pembaruan.',
  });
})();
