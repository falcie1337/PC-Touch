import { DofusWindow } from '@/dofus-window'
import { RootStore } from '@/store'
import { TranslationFunctions } from '@lindo/i18n'
import { observe } from 'mobx'
import { EventManager } from '../helpers'
import { Mod } from '../mod'

interface SearchFilter {
  body: HTMLElement
  panels: HTMLElement
  container: HTMLDivElement
  input: HTMLInputElement
  observer: MutationObserver
  originalDisplay: Map<HTMLElement, string>
  onInput: () => void
}

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export class ZaapSearchFilterMod extends Mod {
  private readonly eventManager = new EventManager()
  private readonly settingDisposer: () => void
  private readonly filters = new Map<HTMLElement, SearchFilter>()
  private styleTag?: HTMLStyleElement
  private pending?: number

  constructor(wGame: DofusWindow, rootStore: RootStore, LL: TranslationFunctions) {
    super(wGame, rootStore, LL)
    this.settingDisposer = observe(
      this.rootStore.optionStore.gameGeneral,
      'zaapSearchFilter',
      () => {
        this.stop()
        if (this.rootStore.optionStore.gameGeneral.zaapSearchFilter) this.start()
      },
      true
    )
  }

  private start() {
    this.eventManager.on(this.wGame.dofus.connectionManager, 'ZaapListMessage', this.scheduleUpdate)
    this.eventManager.on(this.wGame.dofus.connectionManager, 'TeleportDestinationsListMessage', this.scheduleUpdate)
    this.eventManager.on(this.wGame.dofus.connectionManager, 'LeaveDialogMessage', this.resetSearchFilters)
  }

  private scheduleUpdate = () => {
    this.wGame.clearTimeout(this.pending)
    // Native handlers must populate the teleporter window before adding its search field.
    this.pending = this.wGame.setTimeout(() => {
      this.pending = undefined
      this.updateSearchFilters()
    }, 0)
  }

  private updateSearchFilters() {
    const doc = this.wGame.document
    const bodies = doc.querySelectorAll<HTMLElement>(
      '.teleporterListWindow .zaapBody, .teleporterListWindow .subwayBody'
    )
    for (const body of bodies) {
      const panels = body.querySelector<HTMLElement>('.panels')
      if (!panels) continue
      const existing = this.filters.get(body)
      if (existing && existing.panels === panels) {
        this.applyFilter(existing)
        continue
      }
      if (existing) this.removeFilter(existing)
      if (!this.styleTag) {
        this.styleTag = doc.createElement('style')
        this.styleTag.textContent = `
          .teleporterListWindow .lindo-teleport-search {
            height: 44px; padding: 5px 8px; box-sizing: border-box;
          }
          .teleporterListWindow .lindo-teleport-search input {
            width: 100%; height: 34px; box-sizing: border-box;
            text-align: center; color: white; background: #424242;
            border: 1px solid #262626; border-radius: 5px; font-size: 1em;
          }
          .teleporterListWindow .lindo-teleport-searchable > .panels {
            height: calc(90% - 44px) !important;
          }
        `
        doc.head.appendChild(this.styleTag)
      }
      // Clean remnants from the former injector without touching native destination rows or favorites.
      body.querySelectorAll('.lindo_zaapSearch__container').forEach((element) => element.remove())
      const container = doc.createElement('div')
      container.className = 'lindo-teleport-search'
      const input = doc.createElement('input')
      input.type = 'search'
      input.placeholder = body.classList.contains('subwayBody')
        ? this.LL.mod.zaapSearchFilter.placeholderZaapi()
        : this.LL.mod.zaapSearchFilter.placeholder()
      input.setAttribute('aria-label', input.placeholder)
      container.appendChild(input)
      body.insertBefore(container, panels)
      body.classList.add('lindo-teleport-searchable')
      const originalDisplay = new Map<HTMLElement, string>()
      const filter: SearchFilter = {
        body,
        panels,
        container,
        input,
        originalDisplay,
        observer: new this.wGame.MutationObserver(() => this.applyFilter(filter)),
        onInput: () => this.applyFilter(filter)
      }
      input.addEventListener('input', filter.onInput)
      filter.observer.observe(panels, { childList: true, subtree: true, characterData: true })
      this.filters.set(body, filter)
      this.applyFilter(filter)
    }
  }

  private applyFilter(filter: SearchFilter) {
    const wanted = normalizeSearch(filter.input.value.trim())
    for (const row of filter.panels.querySelectorAll<HTMLElement>('.row')) {
      if (!row.querySelector('.destinationName')) continue
      if (!filter.originalDisplay.has(row)) filter.originalDisplay.set(row, row.style.display)
      row.style.display = normalizeSearch(row.textContent ?? '').includes(wanted)
        ? filter.originalDisplay.get(row)!
        : 'none'
    }
    for (const row of filter.originalDisplay.keys()) {
      if (!filter.panels.contains(row)) filter.originalDisplay.delete(row)
    }
  }

  private removeFilter(filter: SearchFilter) {
    filter.observer.disconnect()
    filter.input.removeEventListener('input', filter.onInput)
    for (const [row, display] of filter.originalDisplay) row.style.display = display
    filter.originalDisplay.clear()
    filter.body.classList.remove('lindo-teleport-searchable')
    filter.container.remove()
    this.filters.delete(filter.body)
  }

  private resetSearchFilters = () => {
    this.wGame.clearTimeout(this.pending)
    this.pending = undefined
    for (const filter of [...this.filters.values()]) this.removeFilter(filter)
    this.styleTag?.remove()
    this.styleTag = undefined
  }

  private stop() {
    this.eventManager.close()
    this.resetSearchFilters()
  }

  destroy() {
    this.stop()
    this.settingDisposer()
  }
}
