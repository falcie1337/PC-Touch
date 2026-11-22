import { ConnectionManagerEvents, DofusWindow } from '@/dofus-window'
import { RootStore } from '@/store'
import { TranslationFunctions } from '@lindo/i18n'
import { IObjectDidChange, observe } from 'mobx'
import { GameGroupOption } from '@lindo/shared'

import { Mod } from '../mod'
import { EventManager } from '../helpers'

/**
 * This mod add the possibility to show party level and prospection count
 */
export class PartyInfoMod extends Mod {
  private partyInitialized: boolean = false
  private container?: HTMLDivElement
  private readonly settingDisposer: () => void
  private readonly eventManager = new EventManager()
  private refreshTimer?: number

  private get _option() {
    return this.rootStore.optionStore.gameGroup
  }

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL)
    this.settingDisposer = observe(this._option, (change: IObjectDidChange<GameGroupOption>) => {
      if (change.name === 'groupProspecting' || change.name === 'groupLevel') {
        this._stop()
        this._start()
      }
    })
    this._start()
  }

  private _start(): void {
    if (this._option.groupProspecting || this._option.groupLevel) {
      window.lindoAPI.logger.info('- enable PartyInfo')()

      this.partyInitialized = this.wGame.document.querySelector('#party-info-container') !== null
      this.scheduleUpdate()
      this.eventManager.on<ConnectionManagerEvents, 'PartyJoinMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyJoinMessage',
        this.scheduleUpdate
      )
      this.eventManager.on<ConnectionManagerEvents, 'PartyUpdateMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyUpdateMessage',
        this.scheduleUpdate
      )
      this.eventManager.on<ConnectionManagerEvents, 'PartyMemberEjectedMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyMemberEjectedMessage',
        this.scheduleUpdate
      )
      this.eventManager.on<ConnectionManagerEvents, 'PartyMemberRemoveMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyMemberRemoveMessage',
        this.scheduleUpdate
      )
      this.eventManager.on<ConnectionManagerEvents, 'PartyNewMemberMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyNewMemberMessage',
        this.scheduleUpdate
      )
      this.eventManager.on<ConnectionManagerEvents, 'PartyNewGuestMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyNewGuestMessage',
        this.scheduleUpdate
      )
      this.eventManager.on<ConnectionManagerEvents, 'PartyLeaderUpdateMessage'>(
        this.wGame.dofus.connectionManager,
        'PartyLeaderUpdateMessage',
        this.scheduleUpdate
      )
    }
  }

  private scheduleUpdate = () => {
    this.wGame.clearTimeout(this.refreshTimer)
    this.refreshTimer = this.wGame.setTimeout(() => {
      this.refreshTimer = undefined
      this.updatePartyInfo()
    }, 0)
  }

  // Initialize party info container
  private initializePartyInfo() {
    if (this.partyInitialized) {
      return
    }
    const partyBoxes = this.wGame.document.querySelector('.partyBoxes')
    if (!partyBoxes) {
      return
    }
    const parent = partyBoxes.parentElement!
    this.container = this.wGame.document.createElement('div')
    this.container.id = 'party-info-container'
    this.container.setAttribute(
      'style',
      `
        background: rgba(0, 0, 0, 0.6);
        margin: 2px;
        border-radius: 5px;
        margin-bottom: 5px;
        padding: 3px;
        font-weight: bolder;
        color: #ced0bb;
        font-family: berlin_sans_fb_demibold;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 1) inset;
    `
    )

    if (this._option.groupLevel) {
      const partyLevelElement = this.wGame.document.createElement('div')

      partyLevelElement.textContent = this.LL.mod.partyInfo.level() + ' ?'
      partyLevelElement.id = 'party-level'
      partyLevelElement.setAttribute('style', 'font-size: 13px;user-select: none;cursor: default;')
      this.container.appendChild(partyLevelElement)
    }

    if (this._option.groupProspecting) {
      const prospectionContainerElement = this.wGame.document.createElement('div')
      const prospectionImageElement = this.wGame.document.createElement('span')
      const prospectionTextElement = this.wGame.document.createElement('span')

      // Native game CSS resolves this icon through the current versioned CDN URL.
      prospectionImageElement.className = 'iconProspecting'
      prospectionImageElement.setAttribute('role', 'img')
      prospectionImageElement.setAttribute('aria-label', 'PP')
      prospectionImageElement.setAttribute(
        'style',
        'display: inline-block; width: 1em; height: 1em; vertical-align: middle; background-size: contain; background-repeat: no-repeat; background-position: center;'
      )
      prospectionContainerElement.appendChild(prospectionImageElement)
      prospectionContainerElement.setAttribute('style', 'font-size: 13px;user-select: none;cursor: default;')

      prospectionTextElement.textContent = ' ?'
      prospectionTextElement.id = 'party-pr'
      prospectionTextElement.setAttribute('style', 'vertical-align: middle;')

      prospectionContainerElement.appendChild(prospectionTextElement)
      this.container.appendChild(prospectionContainerElement)
    }

    parent.insertBefore(this.container, partyBoxes)
    this.partyInitialized = true
  }

  // Update party data
  private updatePartyInfo() {
    if (!this.partyInitialized) {
      this.initializePartyInfo()
    }
    try {
      let partyLevel = 0
      let prospecting = 0
      if (this.wGame.gui.party.currentParty && this.wGame.gui.party.currentParty._childrenList.length > 0) {
        this.wGame.gui.party.currentParty._childrenList.forEach((c) => {
          partyLevel += c.memberData.level
          prospecting += c.memberData.prospecting
        })
        if (this._option.groupLevel) {
          this.wGame.document.querySelector('#party-level')!.textContent =
            this.LL.mod.partyInfo.level() + ' ' + (isNaN(partyLevel) ? '?' : partyLevel)
        }
        if (this._option.groupProspecting) {
          this.wGame.document.querySelector('#party-pr')!.textContent = ' ' + (isNaN(prospecting) ? '?' : prospecting)
        }
      }
    } catch (e) {}
  }

  private _stop() {
    this.wGame.clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
    this.partyInitialized = false
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container)
    }
    this.eventManager.close()
  }

  destroy() {
    this._stop()
    this.settingDisposer()
  }
}
