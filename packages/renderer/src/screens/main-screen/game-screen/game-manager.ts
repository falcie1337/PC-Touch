import type { Game, RootStore } from '@/store'
import type { DofusWindow } from '@/dofus-window'
import type { TranslationFunctions } from '@lindo/i18n'
import type { Mod } from '@/mods/mod'
import { NotificationsMod } from '@/mods/notifications'
import { isAlive } from 'mobx-state-tree'
import { createTabPortrait } from './tab-portrait'

type ModConstructor = new (game: DofusWindow, store: RootStore, LL: TranslationFunctions) => Mod

export interface GameManagerProps {
  game: Game
  rootStore: RootStore
  LL: TranslationFunctions
  modTypes: readonly ModConstructor[]
}

export class GameManager {
  private readonly props: GameManagerProps
  private gameWindow?: DofusWindow
  private mods: Mod[] = []
  private disposers: Array<() => void> = []
  private startupTimer?: number
  private resizeTimer?: number
  private loginTimer?: number
  private portraitDisposer?: () => void
  private backupMaxZoom?: number
  private generation = 0

  constructor(props: GameManagerProps) {
    this.props = props
  }

  private report = (operation: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    window.lindoAPI.logger.error(operation, message)()
  }

  private attempt = (operation: string, action: () => void) => {
    try {
      action()
    } catch (error) {
      this.report(operation, error)
    }
  }

  private stopMods = () => {
    const mods = this.mods
    this.mods = []
    for (const mod of mods) this.attempt(`Could not stop ${mod.constructor.name}`, () => mod.destroy())
  }

  private releasePortrait = () => {
    const dispose = this.portraitDisposer
    this.portraitDisposer = undefined
    if (dispose) this.attempt('Could not release tab portrait', dispose)
  }

  private cancelTimers = () => {
    window.clearTimeout(this.startupTimer)
    window.clearTimeout(this.resizeTimer)
    window.clearTimeout(this.loginTimer)
    this.startupTimer = this.resizeTimer = this.loginTimer = undefined
    this.generation++
  }

  destroy = () => {
    this.cancelTimers()
    for (const dispose of this.disposers) this.attempt('Could not remove game listener', dispose)
    this.disposers = []
    this.stopMods()
    this.releasePortrait()
    this.gameWindow = undefined
    this.backupMaxZoom = undefined
  }

  private fixMaxZoom = () => {
    const scene = this.gameWindow?.isoEngine?.mapScene
    if (!scene || !Number.isFinite(scene.camera?.maxZoom) || !Number.isFinite(scene.canvas?.height)) return
    this.backupMaxZoom ??= scene.camera.maxZoom
    scene.camera.maxZoom = Math.max(this.backupMaxZoom, this.backupMaxZoom + (scene.canvas.height / 800 - 1))
  }

  private startMods = (gameWindow: DofusWindow) => {
    const { game, rootStore, LL, modTypes } = this.props
    this.stopMods()
    for (const ModType of modTypes) {
      this.attempt(`Could not start ${ModType.name}; skipping this enhancement`, () => {
        const mod = new ModType(gameWindow, rootStore, LL)
        this.mods.push(mod)
        if (mod instanceof NotificationsMod) {
          mod.eventEmitter.on('notification', () => {
            if (isAlive(game)) game.setHasNotification(true)
          })
          mod.eventEmitter.on('focusTabRequest', () => {
            if (isAlive(game)) rootStore.gameStore.selectGame(game)
          })
        }
      })
    }
  }

  private createPortrait = (gameWindow: DofusWindow) => {
    this.releasePortrait()
    const generation = this.generation
    this.portraitDisposer = createTabPortrait(
      gameWindow,
      window.document,
      gameWindow.gui.playerData.characterBaseInformations.entityLook,
      (image) => {
        if (generation === this.generation && this.gameWindow === gameWindow && isAlive(this.props.game)) {
          this.props.game.setCharacterIcon(image)
        }
      },
      (error) => this.report('Could not create tab portrait', error)
    )
  }

  init = (gameWindow: DofusWindow) => {
    this.destroy()
    if (!isAlive(this.props.game)) return
    this.gameWindow = gameWindow
    const { game, rootStore } = this.props
    const handleCharacterSelected = () => {
      window.clearTimeout(this.startupTimer)
      const generation = this.generation
      // The native listener still has to connect character modules and request the map.
      // Never execute optional Lindo code inside its synchronous event dispatch.
      this.startupTimer = window.setTimeout(() => {
        this.startupTimer = undefined
        if (generation !== this.generation || !isAlive(game) || this.gameWindow !== gameWindow) return
        this.attempt('Could not update character tab name', () =>
          game.setCharacterName(gameWindow.gui.playerData.characterBaseInformations.name)
        )
        this.attempt('Could not create tab portrait', () => this.createPortrait(gameWindow))
        this.startMods(gameWindow)
        this.attempt('Could not adjust map zoom', this.fixMaxZoom)
      }, 0)
    }
    const handleDisconnect = () => {
      this.cancelTimers()
      this.stopMods()
      this.releasePortrait()
      this.backupMaxZoom = undefined
      if (isAlive(game)) game.disconnected()
    }
    const handleResize = () => {
      window.clearTimeout(this.resizeTimer)
      this.resizeTimer = window.setTimeout(() => {
        this.resizeTimer = undefined
        if (!isAlive(game) || this.gameWindow !== gameWindow) return
        this.attempt('Could not resize game UI', () => gameWindow.gui._resizeUi())
        this.attempt('Could not adjust map zoom', this.fixMaxZoom)
      }, 300)
    }
    gameWindow.gui.playerData.on('characterSelectedSuccess', handleCharacterSelected)
    gameWindow.gui.on('disconnect', handleDisconnect)
    gameWindow.addEventListener('resize', handleResize)
    this.disposers.push(
      () => gameWindow.gui.playerData.removeListener('characterSelectedSuccess', handleCharacterSelected),
      () => gameWindow.gui.removeListener('disconnect', handleDisconnect),
      () => gameWindow.removeEventListener('resize', handleResize)
    )

    const character = game.character
    if (character) {
      const generation = this.generation
      this.loginTimer = window.setTimeout(async () => {
        this.loginTimer = undefined
        try {
          const password = await window.lindoAPI.decryptCharacterPassword(character.password)
          if (generation !== this.generation || !isAlive(game) || this.gameWindow !== gameWindow) return
          gameWindow.gui.loginScreen._connectMethod = 'lastServer'
          gameWindow.gui.loginScreen._login(character.account, password, false)
          game.removeLogin()
        } catch (error) {
          this.report('Saved login failed', error)
        }
      }, rootStore.gameStore.games.indexOf(game) * 1500 + 1500)

      const selectSavedCharacter = async () => {
        const selection = gameWindow.gui.windowsContainer._childrenList.find((item) => item.id === 'characterSelection')
        if (!selection || selection.id !== 'characterSelection') return
        await new Promise((resolve) => window.setTimeout(resolve, 100))
        if (generation !== this.generation || !isAlive(game) || this.gameWindow !== gameWindow) return
        const row = selection.charactersTable.content._childrenList.find((item) => item.data?.name === character.name)
        if (!row) return
        row.tap()
        for (let tries = 0; tries < 15; tries++) {
          await new Promise((resolve) => window.setTimeout(resolve, 100))
          if (generation !== this.generation || !isAlive(game) || this.gameWindow !== gameWindow) return
          if (selection.characterDisplay.entity && selection.selectedCharacter) {
            this.attempt('Could not save character image', () => {
              const image = selection.characterDisplay.canvas.rootElement.toDataURL('image/png')
              window.lindoAPI.saveCharacterImage({ image, name: character.name })
            })
            break
          }
        }
        if (generation === this.generation && isAlive(game) && this.gameWindow === gameWindow) selection.btnPlay.tap()
      }
      const handleCharactersList = () => {
        selectSavedCharacter().catch((error) => this.report('Saved character selection failed', error))
      }
      gameWindow.dofus.connectionManager.on('CharactersListMessage', handleCharactersList)
      this.disposers.push(() =>
        gameWindow.dofus.connectionManager.removeListener('CharactersListMessage', handleCharactersList)
      )
    }
  }
}
