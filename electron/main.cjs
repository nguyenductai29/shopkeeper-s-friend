'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged

function startBackend() {
  process.env.USER_DATA_PATH = app.getPath('userData')

  const backendPath = isDev
    ? path.join(__dirname, '..', 'backend', 'index.cjs')
    : path.join(process.resourcesPath, 'backend', 'server.cjs')

  if (!isDev) {
    process.env.NODE_ENV = 'production'
    process.env.FRONTEND_DIST_PATH = path.join(process.resourcesPath, 'frontend', 'dist')
  }

  require(backendPath)
}

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  win.once('ready-to-show', () => win && win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.loadURL(isDev ? 'http://localhost:8080' : 'http://localhost:3001')
}

app.whenReady().then(() => {
  startBackend()
  setTimeout(createWindow, 1000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
