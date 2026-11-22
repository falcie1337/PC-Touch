import { Config } from './config'
import { Dofus } from './dofus'
import { CharacterDisplayClass, GUI } from './gui'
import { NpcDialogUi } from './gui/npc-dialog-ui'
import { ActorManager, IsoEngine } from './iso-engine'
import { WebAuthResult } from '@lindo/shared'

export * from './dofus'
export * from './gui'
export * from './iso-engine'
export * from './gui/character-display'

export interface DofusWindow extends Window {
  MutationObserver: typeof MutationObserver
  d: {
    recordActivity: () => void
  }
  initDofus: (callback: () => void) => void
  lindoAuth: { open: (url: string) => Promise<WebAuthResult> }
  openDatabase: unknown
  dofus: Dofus
  foreground: {
    rootElement: HTMLDivElement
    _monsterTooltips: []
    showAllMonsterGroupTooltips: () => void
    removeAllMonsterGroupTooltips: () => void
  }
  gui: GUI
  isoEngine: IsoEngine
  actorManager: ActorManager
  CharacterDisplay: CharacterDisplayClass
  Config: Config
  singletons: {
    c: Array<{ exports: { prototype: object } }>
  }
  findSingleton: (name: string, window: DofusWindow) => unknown
  npcDialogUi: NpcDialogUi
}

export interface HTMLIFrameElementWithDofus extends HTMLIFrameElement {
  contentWindow: DofusWindow
}
