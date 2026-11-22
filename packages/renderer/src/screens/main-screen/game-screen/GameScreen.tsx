import { DofusWindow, HTMLIFrameElementWithDofus } from '@/dofus-window'
import { useGameContext } from '@/providers'
import { useStores } from '@/store'
import { Game } from '@/store/game-store/game'
import { useI18nContext } from '@lindo/i18n'
import { reaction } from 'mobx'
import React, { memo, useEffect, useRef, useState } from 'react'
import { Alert } from '@mui/material'
import { useGameManager } from './use-game-manager'

export interface GameScreenProps {
  game: Game
}

// eslint-disable-next-line react/display-name
export const GameScreen = memo(({ game }: GameScreenProps) => {
  const gameContext = useGameContext()
  const rootStore = useStores()
  const { LL } = useI18nContext()
  const gameManager = useGameManager({
    game,
    rootStore,
    LL
  })
  const iframeGameRef = useRef<HTMLIFrameElementWithDofus>(null)
  const [loadError, setLoadError] = useState<string>()
  const gameId = game.id

  useEffect(() => {
    return reaction(
      () => rootStore.gameStore.selectedGame,
      (selectedGame) => {
        if (selectedGame?.id === gameId) {
          setTimeout(() => {
            iframeGameRef.current?.focus()
          }, 100)
        }
      },
      { fireImmediately: true }
    )
  }, [])

  const handleLoad = () => {
    if (iframeGameRef.current) {
      const gameWindow = iframeGameRef.current.contentWindow

      // only for debug purpose
      gameWindow.findSingleton = (searchKey: string, window: DofusWindow) => {
        const singletons = Object.values(window.singletons.c)

        const results = singletons.filter(({ exports }) => {
          if (!!exports.prototype && searchKey in exports.prototype) {
            return true
          } else if (searchKey in exports) {
            return true
          } else return false
        })

        if (results.length > 1) {
          window.lindoAPI.logger.error(
            `[MG] Singleton searcher found multiple results for key "${searchKey}". Returning all of them.`
          )()
          return results
        }

        return results.pop()
      }

      const reportError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        window.lindoAPI.logger.error('Game startup failed', message)()
        setLoadError(message)
      }
      const handleStartupError = (event: ErrorEvent) => reportError(event.message)
      gameWindow.addEventListener('error', handleStartupError, { once: true })
      try {
        if (typeof gameWindow.initDofus !== 'function')
          throw new Error('The game bootstrap did not load. Restart Lindo to repair the game files.')
        // WebSQL is unavailable in modern iframes. Keep native IndexedDB available.
        gameWindow.openDatabase = undefined
        gameWindow.lindoAuth = { open: (url) => window.lindoAPI.openWebAuth(url) }
        gameWindow.initDofus(() => {
          // Later runtime errors must not unmount the entire game and its login screen.
          gameWindow.removeEventListener('error', handleStartupError)
          try {
            window.lindoAPI.logger.info('initDofus done')()
            gameManager.init(gameWindow)
          } catch (error) {
            reportError(error)
          }
        })
      } catch (error) {
        gameWindow.removeEventListener('error', handleStartupError)
        reportError(error)
      }
    }
  }

  if (loadError) return <Alert severity='error'>Lindo could not start the game: {loadError}</Alert>

  return (
    <iframe
      id={`iframe-game-${game.id}`}
      ref={iframeGameRef}
      onLoad={handleLoad}
      style={{ border: 'none', width: '100%', height: '100%' }}
      src={gameContext.gameSrc}
    />
  )
})
