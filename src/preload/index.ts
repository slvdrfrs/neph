import { contextBridge, ipcRenderer } from 'electron'
import type { Snapshot, TrackerApi } from '../shared/types'

const api: TrackerApi = {
  getState: () => ipcRenderer.invoke('tracker:getState'),
  getHistory: () => ipcRenderer.invoke('tracker:getHistory'),
  getProfile: () => ipcRenderer.invoke('tracker:getProfile'),
  refresh: () => ipcRenderer.invoke('tracker:refresh'),
  onState: (cb: (s: Snapshot) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, s: Snapshot): void => cb(s)
    ipcRenderer.on('tracker:state', listener)
    return () => ipcRenderer.removeListener('tracker:state', listener)
  }
}

contextBridge.exposeInMainWorld('valtrack', api)
