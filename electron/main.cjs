'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')

const isDev = !app.isPackaged

function loadEnv() {
  const envPath = isDev
    ? path.join(__dirname, '..', '.env')
    : path.join(path.dirname(process.execPath), '.env')
  try {
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].trim()
      }
    }
  } catch {
    // .env is optional
  }
}

function getDefaultDataDir() {
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(base, "Shopkeeper's Friend")
  }
  return path.join(os.homedir(), '.local', 'share', 'shopkeeper-s-friend')
}

function startBackend() {
  loadEnv()

  if (!process.env.ELECTRON_DATA_DIR || !process.env.ELECTRON_DATA_DIR.trim()) {
    process.env.ELECTRON_DATA_DIR = getDefaultDataDir()
  }

  // backend/ is bundled into the asar in both dev and prod
  const backendPath = path.join(__dirname, '..', 'backend', 'index.cjs')

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
  setTimeout(createWindow, 1500)
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
