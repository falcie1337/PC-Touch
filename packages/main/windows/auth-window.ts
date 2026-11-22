import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import type { WebAuthResult } from '@lindo/shared'

const REDIRECT_URI = 'dofustouch://authorized'

export const isWebAuthUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      url.origin === 'https://auth.ankama.com' &&
      !url.username &&
      !url.password &&
      /^\/(?:login\/[a-z-]+|register-direct\/ankama)$/.test(url.pathname) &&
      url.searchParams.getAll('client_id').length === 1 &&
      url.searchParams.get('client_id') === '18' &&
      url.searchParams.getAll('redirect_uri').length === 1 &&
      url.searchParams.get('redirect_uri') === REDIRECT_URI
    )
  } catch {
    return false
  }
}

export const readWebAuthCallback = (value: string): WebAuthResult => {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'dofustouch:' ||
      url.hostname !== 'authorized' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return { error: 'Invalid authentication callback' }
    }
    const codes = url.searchParams.getAll('code')
    const errors = url.searchParams.getAll('error')
    if (codes.length === 1 && errors.length === 0 && codes[0] && codes[0].length <= 8192) {
      return { code: codes[0] }
    }
    if (errors.length === 1 && codes.length === 0 && errors[0]) return { error: errors[0].slice(0, 200) }
  } catch {}
  return { error: 'Invalid authentication callback' }
}

export const openWebAuthWindow = (parent: BrowserWindow, url: string): Promise<WebAuthResult> => {
  // Validate before constructing a window. Never log URLs containing guest tokens or authorization codes.
  if (!isWebAuthUrl(url)) return Promise.resolve({ error: 'Invalid authentication URL' })

  return new Promise((resolve) => {
    const popup = new BrowserWindow({
      parent,
      title: 'Ankama Connect',
      width: 1000,
      height: 760,
      autoHideMenuBar: true,
      webPreferences: {
        // A new in-memory session keeps the logins of different accounts separate.
        partition: 'lindo-auth-' + randomUUID(),
        preload: undefined,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        webviewTag: false
      }
    })
    let settled = false
    const finish = (result: WebAuthResult) => {
      if (settled) return
      settled = true
      parent.removeListener('closed', parentClosed)
      resolve(result)
      if (!popup.isDestroyed()) popup.close()
    }
    const parentClosed = () => finish({ error: 'Authentication cancelled' })
    const handleNavigation = (event: { preventDefault: () => void }, target: string) => {
      try {
        const destination = new URL(target)
        if (destination.protocol === 'https:') return
        event.preventDefault()
        if (destination.protocol === 'dofustouch:') finish(readWebAuthCallback(target))
      } catch {
        event.preventDefault()
      }
    }
    popup.webContents.on('will-navigate', handleNavigation)
    popup.webContents.on('will-redirect', handleNavigation)
    popup.webContents.setWindowOpenHandler(({ url: target }) => {
      try {
        const destination = new URL(target)
        if (destination.protocol === 'dofustouch:') finish(readWebAuthCallback(target))
        else if (destination.protocol === 'https:') {
          popup.loadURL(target).catch(() => finish({ error: 'Could not load the authentication page' }))
        }
      } catch {}
      return { action: 'deny' }
    })
    popup.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) finish({ error: 'Could not load the authentication page' })
    })
    popup.once('closed', () => finish({ error: 'Authentication cancelled' }))
    parent.once('closed', parentClosed)
    popup.loadURL(url).catch(() => finish({ error: 'Could not load the authentication page' }))
  })
}
