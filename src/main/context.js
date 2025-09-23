let mainWindow = null;
let popupWindow = null;

function setMainWindow(win) {
  mainWindow = win;
}

function getMainWindow() {
  return mainWindow;
}

function setPopupWindow(win) {
  popupWindow = win;
}

function getPopupWindow() {
  return popupWindow;
}

module.exports = {
  setMainWindow,
  getMainWindow,
  setPopupWindow,
  getPopupWindow,
};
