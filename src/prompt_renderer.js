(() => {
  const $ = (id) => document.getElementById(id);
  const state = { password: false };

  function applyLang(lang) {
    const t = String(lang || 'en').toLowerCase();
    // toggle document direction for RTL locales
    try {
      const rtl = ['ar', 'he', 'fa', 'ur'];
      const isRTL = rtl.some((code) => t.startsWith(code));
      document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    } catch {}
    if (t.startsWith('ja')) {
      $('cancelBtn').textContent = 'キャンセル';
      $('okBtn').textContent = '保存';
      $('xBtn').setAttribute('title', '閉じる');
    } else if (t.startsWith('fr')) {
      $('cancelBtn').textContent = 'Annuler';
      $('okBtn').textContent = 'Enregistrer';
      $('xBtn').setAttribute('title', 'Fermer');
    } else if (t.startsWith('de')) {
      $('cancelBtn').textContent = 'Abbrechen';
      $('okBtn').textContent = 'Speichern';
      $('xBtn').setAttribute('title', 'Schließen');
    } else if (t.startsWith('es')) {
      $('cancelBtn').textContent = 'Cancelar';
      $('okBtn').textContent = 'Guardar';
      $('xBtn').setAttribute('title', 'Cerrar');
    } else if (t.startsWith('pt')) {
      $('cancelBtn').textContent = 'Cancelar';
      $('okBtn').textContent = 'Salvar';
      $('xBtn').setAttribute('title', 'Fechar');
    } else if (t.startsWith('ko')) {
      $('cancelBtn').textContent = '취소';
      $('okBtn').textContent = '저장';
      $('xBtn').setAttribute('title', '닫기');
    } else if (t.startsWith('zh')) {
      $('cancelBtn').textContent = '取消';
      $('okBtn').textContent = '保存';
      $('xBtn').setAttribute('title', '关闭');
    } else if (t.startsWith('tr')) {
      $('cancelBtn').textContent = 'İptal';
      $('okBtn').textContent = 'Kaydet';
      $('xBtn').setAttribute('title', 'Kapat');
    } else if (t.startsWith('ar')) {
      $('cancelBtn').textContent = 'إلغاء';
      $('okBtn').textContent = 'حفظ';
      $('xBtn').setAttribute('title', 'إغلاق');
    } else {
      $('cancelBtn').textContent = 'Cancel';
      $('okBtn').textContent = 'Save';
      $('xBtn').setAttribute('title', 'Close');
    }
  }

  function applyTheme(theme) {
    const t = String(theme || 'dark').toLowerCase();
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(t === 'light' ? 'light' : 'dark');
  }

  function initEvents() {
    $('cancelBtn').addEventListener('click', () => window.electronPrompt?.cancel());
    $('xBtn').addEventListener('click', () => window.electronPrompt?.cancel());
    $('okBtn').addEventListener('click', () => window.electronPrompt?.submit($('val').value));
    $('val').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.electronPrompt?.submit($('val').value);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        window.electronPrompt?.cancel();
      }
    });
  }

  window.electronPrompt?.onInit((opts) => {
    try {
      document.title = opts.title || 'Input';
    } catch {}
    try {
      $('title').textContent = opts.title || 'Input';
    } catch {}
    try {
      $('label').textContent = opts.label || 'Value';
    } catch {}
    try {
      $('val').value = opts.value || '';
    } catch {}
    try {
      $('val').placeholder = opts.placeholder || '';
    } catch {}
    try {
      state.password = !!opts.password;
      $('val').setAttribute('type', state.password ? 'password' : 'text');
    } catch {}
    try {
      applyLang(opts.lang || 'en');
    } catch {}
    try {
      applyTheme(opts.theme || 'dark');
    } catch {}
    setTimeout(() => {
      try {
        $('val').focus();
        $('val').select();
      } catch {}
    }, 0);
  });

  document.addEventListener('DOMContentLoaded', () => {
    try {
      applyTheme('dark');
    } catch {}
    initEvents();
  });
})();
