import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { TrackerService } from './riot/service'

let win: BrowserWindow | null = null
const service = new TrackerService()

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 620,
    show: false,
    backgroundColor: '#111113',
    autoHideMenuBar: true,
    title: 'NEPH.GG',
    // Sin barra de título de Windows: la app dibuja la suya y los botones
    // nativos (min/max/cerrar) se pintan del color del marco (--chrome)
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#111113',
      symbolColor: '#8a8f98',
      height: 34
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => (win = null))

  // Los enlaces externos se abren en el navegador, no dentro de la app
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('tracker:getState', () => service.snapshot)
  ipcMain.handle('tracker:getHistory', (_e, start?: number) =>
    service.getHistory(start ?? 0)
  )
  ipcMain.handle('tracker:getScoreboard', (_e, matchId: string) =>
    service.getScoreboard(matchId)
  )
  ipcMain.handle('tracker:getProfile', () => service.getProfile())
  ipcMain.handle('tracker:refresh', () => service.pollNow())

  createWindow()
  service.start((snapshot) => {
    win?.webContents.send('tracker:state', snapshot)
  })
})

app.on('window-all-closed', () => {
  service.stop()
  app.quit()
})
