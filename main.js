const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0b0b0b', title: 'no problem: auto problem',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'index.html'));
  // F11 fullscreen, F12 devtools
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
