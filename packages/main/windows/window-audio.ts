import { observe } from 'mobx'
import type { BrowserWindow } from 'electron'
import type { WindowOption } from '@lindo/shared'

export const bindWindowAudio = (win: BrowserWindow, options: WindowOption, isWindowMuted: () => boolean) => {
  const update = () => {
    const muted = options.audioMuted || isWindowMuted() || (options.soundOnFocus && !win.isFocused())
    win.webContents.setAudioMuted(muted)
  }
  win.on('focus', update)
  win.on('blur', update)
  const disposeOptions = observe(options, (change) => {
    if (change.name === 'audioMuted' || change.name === 'soundOnFocus') update()
  })
  update()
  return {
    update,
    dispose: () => {
      disposeOptions()
      win.removeListener('focus', update)
      win.removeListener('blur', update)
    }
  }
}
