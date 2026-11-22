import type { DofusWindow } from '@/dofus-window'

export const createTabPortrait = (
  gameWindow: DofusWindow,
  targetDocument: Document,
  look: unknown,
  onReady: (image: HTMLImageElement) => void,
  onError: (error: unknown) => void
): (() => void) => {
  const portrait = new gameWindow.CharacterDisplay({
    scale: 'fitin',
    horizontalAlign: 'center',
    verticalAlign: 'center'
  })
  const host = gameWindow.gui.wBody
  let disposed = false
  let renderTimer: number | undefined
  let timeout: number | undefined
  const dispose = () => {
    if (disposed) return
    disposed = true
    gameWindow.clearTimeout(renderTimer)
    gameWindow.clearTimeout(timeout)
    try {
      portrait.release?.()
    } finally {
      if (portrait.rootElement?.parentNode === host.rootElement) host.removeChild(portrait)
    }
  }
  const fail = (error: unknown) => {
    if (disposed) return
    dispose()
    onError(error)
  }
  try {
    // CharacterDisplay.resize checks the Wui parent hierarchy, not just DOM attachment.
    // Keep it inside the game, then export pixels instead of adopting its live canvas into React.
    host.appendChild(portrait)
    Object.assign(portrait.rootElement.style, {
      width: '64px',
      height: '64px',
      position: 'fixed',
      left: '-10000px',
      top: '0',
      opacity: '0',
      pointerEvents: 'none'
    })
    timeout = gameWindow.setTimeout(() => fail(new Error('Tab portrait rendering timed out')), 10000)
    // Its constructor queues canvas initialization in this same game window.
    renderTimer = gameWindow.setTimeout(() => {
      if (disposed) return
      try {
        portrait.resize()
        portrait.setLook(
          look,
          { riderOnly: true, direction: 4, animation: 'AnimArtwork', boneType: 'timeline/', skinType: 'timeline/' },
          () => {
            if (disposed) return
            try {
              portrait.resize()
              const canvas = portrait.canvas.rootElement
              if (!canvas.width || !canvas.height) throw new Error('Tab portrait canvas has no dimensions')
              const image = targetDocument.createElement('img')
              image.alt = ''
              image.src = canvas.toDataURL('image/png')
              Object.assign(image.style, { width: '100%', height: '100%', display: 'block', objectFit: 'contain' })
              onReady(image)
            } catch (error) {
              onError(error)
            } finally {
              dispose()
            }
          }
        )
      } catch (error) {
        fail(error)
      }
    }, 0)
  } catch (error) {
    fail(error)
  }
  return dispose
}
