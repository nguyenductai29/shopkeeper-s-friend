'use strict'

const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')

const isDev = !app.isPackaged
const WINDOW_ICON_NAME = 'imo_kome_authentic_logo.ico'
const BACKEND_HOST = '127.0.0.1'

function loadEnvFile(envPath, override = false) {
  try {
    const content = fs.readFileSync(envPath, 'utf-8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && (override || process.env[m[1]] === undefined)) process.env[m[1]] = m[2].trim()
    }
  } catch {
    // env files are optional
  }
}

function loadEnv() {
  const envDir = isDev ? path.join(__dirname, '..') : path.dirname(process.execPath)
  loadEnvFile(path.join(envDir, '.env'))
  loadEnvFile(path.join(envDir, '.env.local'), true)
}

function getWindowIconPath() {
  return isDev
    ? path.join(__dirname, '..', 'frontend', 'public', WINDOW_ICON_NAME)
    : path.join(process.resourcesPath, 'frontend', 'dist', WINDOW_ICON_NAME)
}

function getBackendPort() { return Number(process.env.PORT || 3001) }
function getBackendUrl() { return `http://${BACKEND_HOST}:${getBackendPort()}` }

function isBackendResponding(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: BACKEND_HOST, port, path: '/api/health', timeout: 1200 }, (res) => {
      res.resume()
      resolve(res.statusCode >= 200 && res.statusCode < 500)
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, BACKEND_HOST)
  })
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) return port
  }
  throw new Error(`Không tìm được port backend trống từ ${startPort} đến ${startPort + 19}`)
}

async function startBackend() {
  loadEnv()
  const backendPort = getBackendPort()

  if (isDev && await isBackendResponding(backendPort)) {
    console.log(`[main] Reusing existing ShopFlow adapter at ${getBackendUrl()}`)
    return
  }

  if (!await isPortAvailable(backendPort)) {
    if (isDev) throw new Error(`Port backend ${backendPort} đang được dùng nhưng không phản hồi như ShopFlow backend.`)
    const fallbackPort = await findAvailablePort(backendPort + 1)
    process.env.PORT = String(fallbackPort)
    console.log(`[main] Backend port ${backendPort} is busy, using ${fallbackPort}`)
  }

  process.env.SHOPFLOW_BACKEND_HOST = BACKEND_HOST
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
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  })

  win.maximize()
  win.once('ready-to-show', () => win && win.show())
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  win.loadURL(isDev ? 'http://localhost:8080' : getBackendUrl())
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(async () => {
    await startBackend()
    setTimeout(createWindow, 800)
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') { app.quit(); win = null }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}
