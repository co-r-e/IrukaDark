(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('vi', {
    errorOccurred: 'Đã xảy ra lỗi',
    apiKeyMissing: 'Chưa đặt khóa API. Hãy đặt GEMINI_API_KEY trong .env.local.',
    apiUnavailable: 'API Electron không khả dụng. Vui lòng khởi động lại ứng dụng.',
    unexpectedResponse: 'Phản hồi bất ngờ từ API.',
    apiError: 'Lỗi API:',
    textNotRetrieved: 'Không lấy được văn bản',
    thinking: 'Đang suy nghĩ…',
    searching: 'Đang tìm trên web…',
    accessibilityWarning:
      'Để tự động sao chép, hãy cấp quyền tại Cài đặt hệ thống > Bảo mật & quyền riêng tư > Trợ năng.',
    shortcutRegistered: (accel) => `Đã đặt phím tắt thành ${accel}`,
    failedToRegisterShortcut: 'Không thể đăng ký phím tắt. Có thể xung đột với ứng dụng khác.',
    placeholder: 'Hỏi IrukaDark…',
    send: 'Gửi',
    stop: 'Dừng',
    canceled: 'Đã hủy.',
    historyCleared: 'Đã xóa lịch sử trò chuyện.',
    historyCompacted: 'Đã tóm tắt và nén lịch sử.',
    availableCommands:
      'Lệnh: /clear, /compact, /next, /table, /what do you mean?, /contact, /web (on/off/status), /translate (JA/EN/zh-CN/zh-TW)',
    sourcesBadge: 'Nguồn',
    webSearchEnabled: 'Đã bật Tìm kiếm web.',
    webSearchDisabled: 'Đã tắt Tìm kiếm web.',
    webSearchStatusOn: 'Tìm kiếm web: BẬT',
    webSearchStatusOff: 'Tìm kiếm web: TẮT',
    webSearchHelp: 'Dùng /web on|off|status',
    noPreviousAI: 'Không có tin nhắn AI trước đó để tiếp tục.',
    selectionExplanation: 'Giải thích vùng chọn',
    selectionTranslation: 'Dịch vùng chọn',
    updateAvailable: (v) => `Có phiên bản mới (${v}). Mở trang tải xuống?`,
    upToDate: 'Bạn đang dùng phiên bản mới nhất.',
    updateCheckFailed: 'Không thể kiểm tra cập nhật.',
  });
})();
