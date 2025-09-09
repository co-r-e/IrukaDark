(function () {
  if (typeof window === 'undefined' || !window.__IRUKA_REGISTER_I18N__) return;
  window.__IRUKA_REGISTER_I18N__('th', {
    errorOccurred: 'เกิดข้อผิดพลาด',
    apiKeyMissing: 'ยังไม่ได้ตั้งค่า API key กรุณาตั้งค่า GEMINI_API_KEY ใน .env.local',
    apiUnavailable: 'ไม่สามารถใช้ API ของ Electron ได้ โปรดรีสตาร์ตแอป',
    unexpectedResponse: 'ได้รับการตอบกลับจาก API ที่ไม่คาดคิด',
    apiError: 'ข้อผิดพลาดของ API:',
    textNotRetrieved: 'ดึงข้อความไม่สำเร็จ',
    thinking: 'กำลังคิด…',
    searching: 'กำลังค้นเว็บ…',
    accessibilityWarning:
      'หากต้องการคัดลอกอัตโนมัติ โปรดให้สิทธิ์ที่ การตั้งค่าระบบ > ความปลอดภัยและความเป็นส่วนตัว > การช่วยสำหรับการเข้าถึง',
    shortcutRegistered: (accel) =>
      `ตั้งคีย์ลัดเป็น ${accel.replace('CommandOrControl', 'Cmd/Ctrl')}`,
    failedToRegisterShortcut: 'ไม่สามารถลงทะเบียนคีย์ลัด อาจขัดแย้งกับแอปอื่น',
    placeholder: 'ถาม IrukaDark…',
    send: 'ส่ง',
    stop: 'หยุด',
    canceled: 'ยกเลิกแล้ว',
    historyCleared: 'ล้างประวัติแชทแล้ว',
    historyCompacted: 'สรุปและย่อประวัติแล้ว',
    availableCommands: 'คำสั่ง: /clear, /compact, /next, /contact, /web (on/off/status)',
    sourcesBadge: 'แหล่งที่มา',
    webSearchEnabled: 'เปิดการค้นเว็บแล้ว',
    webSearchDisabled: 'ปิดการค้นเว็บแล้ว',
    webSearchStatusOn: 'ค้นเว็บ: เปิด',
    webSearchStatusOff: 'ค้นเว็บ: ปิด',
    webSearchHelp: 'ใช้ /websearch on|off|status',
    noPreviousAI: 'ไม่มีข้อความ AI ก่อนหน้าให้ทำต่อ',
    selectionExplanation: 'คำอธิบายส่วนที่เลือก',
    selectionTranslation: 'แปลส่วนที่เลือก',
    updateAvailable: (v) => `มีเวอร์ชันใหม่ (${v}) พร้อมใช้ เปิดหน้าดาวน์โหลดไหม?`,
    upToDate: 'เป็นเวอร์ชันล่าสุดแล้ว',
    updateCheckFailed: 'ตรวจสอบการอัปเดตล้มเหลว',
  });
})();
