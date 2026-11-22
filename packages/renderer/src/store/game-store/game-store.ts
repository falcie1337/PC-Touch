import { Instance, SnapshotOut, types } from 'mobx-state-tree'
import { GameCharacter, MAX_GAME_TABS, MultiAccountContext, withRootStore } from '@lindo/shared'
import { Game, GameModel } from './game'

/**
 * Model description here for TypeScript hints.
 */
export const GameStoreModel = types
  .model('GameStore')
  .props({
    isMuted: types.optional(types.boolean, false),
    _games: types.map(GameModel),
    gamesOrder: types.array(types.safeReference(GameModel, { acceptsUndefined: false })),
    selectedGame: types.safeReference(GameModel)
  })
  .extend(withRootStore)
  .views((self) => ({
    get games() {
      return Array.from(self._games.values())
    },
    get canAddGame() {
      return self._games.size < MAX_GAME_TABS
    }
  }))
  .actions((self) => ({
    toggleMute() {
      self.isMuted = !self.isMuted
      window.lindoAPI.setAudioMuteWindow(self.isMuted)
    },
    addGame(character?: GameCharacter) {
      if (!self.canAddGame) return
      const game = self._games.put({ character: character?.id })
      self.gamesOrder.push(game)
      self.selectedGame = game
    },
    removeGame(game: Game) {
      if (!self._games.has(game.id)) return
      if (self.selectedGame === game) {
        const index = self.gamesOrder.indexOf(game)
        const nextIndex = index < self.gamesOrder.length - 1 ? index + 1 : index - 1
        self.selectedGame = nextIndex >= 0 ? self.gamesOrder[nextIndex] : undefined
        self.selectedGame?.setHasNotification(false)
      }
      self._games.delete(game.id)
    },
    selectGame(game: Game) {
      if (self._games.has(game.id)) {
        self.selectedGame = game
        self.selectedGame.setHasNotification(false)
      }
    },
    selectGameIndex(index: number) {
      if (index >= 0 && index < self.gamesOrder.length) {
        self.selectedGame = self.gamesOrder[index]
        self.selectedGame.setHasNotification(false)
      }
    }
  }))
  .actions((self) => ({
    gamesFromTeamWindow(context: MultiAccountContext) {
      const team = self.rootStore.optionStore.gameMultiAccount
        .selectTeamById(context.teamId)
        ?.windows.find((w) => w.id === context.teamWindowId)
      team?.characters.forEach((character) => {
        self.addGame(character)
      })
    },
    selectNextGame() {
      const index = self.gamesOrder.indexOf(self.selectedGame!)
      if (index >= self.gamesOrder.length - 1) {
        self.selectGameIndex(0)
        return
      }
      if (index !== -1) {
        self.selectGameIndex(index + 1)
      }
    },
    selectPreviousGame() {
      const index = self.gamesOrder.indexOf(self.selectedGame!)
      if (index === 0) {
        self.selectGameIndex(self.gamesOrder.length - 1)
        return
      }
      if (index !== -1) {
        self.selectGameIndex(index - 1)
      }
    },
    removeSelectedGame() {
      if (self.selectedGame) {
        self.removeGame(self.selectedGame)
      }
    },
    moveGame(srcGameId: string, targetGameId: string) {
      const srcGame = self._games.get(srcGameId)!
      const oldIndex = self.gamesOrder.indexOf(srcGame)
      const newIndex = self.gamesOrder.findIndex((g) => g.id === targetGameId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      self.gamesOrder.splice(oldIndex, 1)
      self.gamesOrder.splice(newIndex, 0, srcGame)
    }
  }))

/**
 * Un-comment the following to omit model attributes from your snapshots (and from async storage).
 * Useful for sensitive data like passwords, or transitive state like whether a modal is open.

 * Note that you'll need to import `omit` from ramda, which is already included in the project!
 *  .postProcessSnapshot(omit(["password", "socialSecurityNumber", "creditCardNumber"]))
 */

type GameStoreType = Instance<typeof GameStoreModel>

export interface GameStore extends GameStoreType {}

type GameStoreSnapshotType = SnapshotOut<typeof GameStoreModel>

export interface GameStoreSnapshot extends GameStoreSnapshotType {}
