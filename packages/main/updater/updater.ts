import { RootStore } from '@lindo/shared'
import { app, dialog } from 'electron'
import { logger } from '../logger'
import { GameUpdater } from './game-updater'

export const runUpdater = async (rootStore: RootStore) => {
  rootStore.appStore.setLindoVersion(app.getVersion())
  // Source builds must not replace themselves with binaries from the abandoned upstream.

  logger.info('runUpdater -> Start game update checking...')
  const gameUpdater = await GameUpdater.init(rootStore)
  try {
    await gameUpdater.run()
  } catch (error) {
    logger.error('Game update failed:', error)
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox('Lindo — game update failed', message)
    throw error
  }
  logger.info('runUpdater -> done')
}
