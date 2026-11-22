import axios, { AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'
import fs from 'fs-extra'
import * as beautify from 'js-beautify'
import { UpdaterWindow } from '../windows/updater-window'
import { Files, ItunesLookup, Manifest, RegexPatches } from './models'
import { DiffManifest, retrieveManifests } from './updater-utils'
import { downloadToFile, gameFilePath, runWithConcurrency } from './game-files'
import { GAME_PATCH_REVISION, prepareBootstrapFile, prepareGameAudio, prepareGameScript } from './game-patches'
import {
  DOFUS_ITUNES_ORIGIN,
  DOFUS_ORIGIN,
  GAME_PATH,
  LINDO_GAME_BASE_URL,
  LOCAL_ASSET_MAP_PATH,
  LOCAL_DOFUS_MANIFEST_PATH,
  LOCAL_LINDO_MANIFEST_PATH,
  REMOTE_LINDO_MANIFEST_URL,
  LOCAL_REGEX_PATH,
  LOCAL_VERSIONS_PATH,
  DOFUS_EARLY_ORIGIN
} from '../constants'
import { RootStore } from '@lindo/shared'
import { logger } from '../logger'
import { generateUserArgent } from '../utils'
import { Agent } from 'https'

interface GameVersion {
  buildVersion: string
  appVersion: string
  sourceOrigin: string
  patchRevision: string
}

export class GameUpdater {
  private readonly _updaterWindow: UpdaterWindow
  private readonly _rootStore: RootStore
  private readonly _httpClient: AxiosInstance
  private readonly _dofusOrigin: string

  private constructor(updaterWindow: UpdaterWindow, rootStore: RootStore, userAgent: string) {
    this._updaterWindow = updaterWindow
    this._rootStore = rootStore
    this._httpClient = axios.create({
      headers: { 'User-Agent': userAgent },
      timeout: 30000,
      httpsAgent: new Agent({ keepAlive: true })
    })
    this._dofusOrigin = rootStore.appStore.dofusTouchEarly ? DOFUS_EARLY_ORIGIN : DOFUS_ORIGIN
    axiosRetry(this._httpClient, {
      retries: 3,
      retryDelay: () => 1000,
      shouldResetTimeout: true,
      onRetry: (retryCount, error) => logger.warn({ retryCount, error: error.toString() })
    })
  }

  static async init(rootStore: RootStore): Promise<GameUpdater> {
    const updaterWindow = await UpdaterWindow.init(rootStore)
    const userAgent = await generateUserArgent(rootStore.appStore.appVersion)
    return new GameUpdater(updaterWindow, rootStore, userAgent)
  }

  async run() {
    try {
      fs.mkdirSync(GAME_PATH, { recursive: true })
      const previousVersions = this._readVersions()
      const forceDownload =
        previousVersions.sourceOrigin !== this._dofusOrigin || previousVersions.patchRevision !== GAME_PATCH_REVISION

      this._updaterWindow.sendProgress({ message: 'DOWNLOADING MANIFESTS', percent: 0 })
      const [, remoteAssetManifest, assetDiffManifest] = await retrieveManifests({
        localManifestPath: LOCAL_ASSET_MAP_PATH,
        remoteManifestUrl: new URL('assetMap.json', this._dofusOrigin).href,
        httpClient: this._httpClient,
        gamePath: GAME_PATH,
        forceDownload
      })
      const [localLindoManifest, remoteLindoManifest, lindoDiffManifest] = await retrieveManifests({
        localManifestPath: LOCAL_LINDO_MANIFEST_PATH,
        remoteManifestUrl: REMOTE_LINDO_MANIFEST_URL,
        httpClient: this._httpClient,
        gamePath: GAME_PATH,
        forceDownload
      })
      const [localDofusManifest, remoteDofusManifest, dofusDiffManifest] = await retrieveManifests({
        localManifestPath: LOCAL_DOFUS_MANIFEST_PATH,
        remoteManifestUrl: new URL('manifest.json', this._dofusOrigin).href,
        httpClient: this._httpClient,
        gamePath: GAME_PATH,
        forceDownload
      })
      if (!remoteDofusManifest.files['build/script.js'] || !remoteLindoManifest.files['index.html']) {
        throw new Error('The game manifests are missing the required desktop bootstrap or game script')
      }

      this._updaterWindow.sendProgress({ message: 'DOWNLOADING ASSETS', percent: 10 })
      await this._downloadAssetsFiles(assetDiffManifest, remoteAssetManifest)
      const [lindoFiles, dofusFiles] = await this._retrieveMissingLindoAndDofusFiles(
        lindoDiffManifest,
        remoteLindoManifest,
        dofusDiffManifest,
        remoteDofusManifest
      )
      this._updaterWindow.sendProgress({ message: 'CHECKING VERSIONS', percent: 60 })
      const versions = await this._findingVersions(dofusFiles)
      this._applyRegex(lindoDiffManifest, lindoFiles, dofusFiles)

      this._updaterWindow.sendProgress({ message: 'WRITING GAME FILES', percent: 80 })
      this._writeMissingFiles(lindoFiles)
      this._writeMissingFiles(dofusFiles)
      // Removed entries exist in the previous manifest, not the new one.
      this._removeOldFiles(dofusDiffManifest, localDofusManifest)
      this._removeOldFiles(lindoDiffManifest, localLindoManifest)

      // Commit the manifests only after every required download and file write succeeds.
      for (const [filename, manifest] of [
        [LOCAL_ASSET_MAP_PATH, remoteAssetManifest],
        [LOCAL_LINDO_MANIFEST_PATH, remoteLindoManifest],
        [LOCAL_DOFUS_MANIFEST_PATH, remoteDofusManifest],
        [LOCAL_VERSIONS_PATH, versions]
      ] as const) {
        fs.outputJsonSync(filename, manifest)
      }
      this._rootStore.appStore.setAppVersion(versions.appVersion)
      this._rootStore.appStore.setBuildVersion(versions.buildVersion)
      this._updaterWindow.sendProgress({ message: 'GAME READY', percent: 100 })
      logger.info('Game update completed successfully')
    } finally {
      this._updaterWindow.close()
    }
  }

  private _readVersions(): Partial<GameVersion> {
    try {
      const value = fs.readJsonSync(LOCAL_VERSIONS_PATH)
      return value && typeof value === 'object' ? value : {}
    } catch (error) {
      if (error instanceof SyntaxError || (error as { code?: string }).code === 'ENOENT') return {}
      throw error
    }
  }

  private _writeMissingFiles(files: Files) {
    for (const [filename, content] of Object.entries(files)) {
      const destination = gameFilePath(GAME_PATH, filename)
      const data = Buffer.isBuffer(content) || typeof content === 'string' ? content : JSON.stringify(content)
      fs.outputFileSync(destination, data)
    }
  }

  private _removeOldFiles(differences: DiffManifest, previousManifest: Manifest) {
    for (const key of Object.keys(previousManifest.files)) {
      if (differences[key] === -1) fs.removeSync(gameFilePath(GAME_PATH, key))
    }
  }

  private _applyRegex(lindoDiffManifest: DiffManifest, lindoFiles: Files, dofusFiles: Files) {
    const patches: RegexPatches =
      lindoDiffManifest['regex.json'] === 1
        ? (lindoFiles['regex.json'] as RegexPatches)
        : fs.readJsonSync(LOCAL_REGEX_PATH)
    for (const filename of Object.keys(patches)) {
      if (typeof dofusFiles[filename] !== 'string') continue
      let content = dofusFiles[filename] as string
      if (filename.endsWith('.js')) content = beautify.js(content, { break_chained_methods: true })
      else if (filename.endsWith('.css')) content = beautify.css(content)
      for (const [pattern, replacement] of patches[filename]) {
        const updatedReplacement = replacement.replaceAll(
          'https://proxyconnection.touch.dofus.com',
          this._dofusOrigin.slice(0, -1)
        )
        content = content.replace(new RegExp(pattern, 'g'), updatedReplacement)
      }
      if (filename === 'build/script.js' && !content.includes('window.singletons =')) {
        throw new Error('The current game bundle is incompatible with the pinned desktop bootstrap (singletons patch)')
      }
      if (filename === 'build/script.js') {
        content = prepareGameScript(content)
        const audioPatched = prepareGameAudio(content)
        if (audioPatched === content)
          logger.warn('Desktop audio lifecycle patch was not recognized; keeping game audio unchanged')
        content = audioPatched
      }
      dofusFiles[filename] = content
    }
  }

  private async _findingVersions(dofusFiles: Files): Promise<GameVersion> {
    const previous = this._readVersions()
    const script = dofusFiles['build/script.js']
    let buildVersion = previous.buildVersion
    let appVersion = previous.appVersion
    if (typeof script === 'string') {
      const match = script.match(/window\.buildVersion\s*=\s*["'](\d+\.\d+\.\d+(?:-\d+)?)["']/)
      if (!match) throw new Error('Could not read the version from the current game bundle')
      buildVersion = match[1]
      const response = await this._httpClient.get<ItunesLookup>(DOFUS_ITUNES_ORIGIN)
      appVersion = response.data.results?.[0]?.version
    }
    if (!buildVersion || !appVersion) throw new Error('Could not determine the game and app versions')
    return { buildVersion, appVersion, sourceOrigin: this._dofusOrigin, patchRevision: GAME_PATCH_REVISION }
  }

  private async _retrieveMissingLindoAndDofusFiles(
    lindoDiff: DiffManifest,
    remoteLindo: Manifest,
    dofusDiff: DiffManifest,
    remoteDofus: Manifest
  ): Promise<[Files, Files]> {
    const lindoFiles: Files = {}
    await runWithConcurrency(
      Object.keys(remoteLindo.files).filter((key) => lindoDiff[key] === 1),
      async (key) => {
        // Ignore branch URLs embedded in the upstream manifest; every file must use the pinned revision.
        lindoFiles[key] = await this._downloadFile(new URL(key, LINDO_GAME_BASE_URL).href, key)
        if (typeof lindoFiles[key] === 'string') lindoFiles[key] = prepareBootstrapFile(key, lindoFiles[key] as string)
      }
    )
    if (lindoDiff['regex.json'] === 1) {
      for (const key of Object.keys(remoteDofus.files)) dofusDiff[key] = 1
    }
    const dofusFiles: Files = {}
    await runWithConcurrency(
      Object.keys(remoteDofus.files).filter((key) => dofusDiff[key] === 1),
      async (key) => {
        dofusFiles[key] = await this._downloadFile(
          new URL(remoteDofus.files[key].filename, this._dofusOrigin).href,
          key
        )
      }
    )
    return [lindoFiles, dofusFiles]
  }

  private async _downloadAssetsFiles(diff: DiffManifest, manifest: Manifest) {
    const keys = Object.keys(manifest.files).filter((key) => diff[key] === 1)
    let completed = 0
    await runWithConcurrency(keys, async (key) => {
      const url = new URL(manifest.files[key].filename, this._dofusOrigin).href
      await downloadToFile(this._httpClient, url, gameFilePath(GAME_PATH, key))
      completed++
      this._updaterWindow.sendProgress({
        message: `DOWNLOADING ASSETS (${completed}/${keys.length})`,
        percent: 10 + (completed / keys.length) * 30
      })
    })
  }

  private async _downloadFile(url: string, filename: string): Promise<string | object> {
    if (new URL(url).protocol !== 'https:') throw new Error('Game downloads must use HTTPS')
    const response = await this._httpClient.get(url, { responseType: 'arraybuffer' })
    const content = Buffer.from(response.data)
    if (filename.endsWith('.json')) return JSON.parse(content.toString('utf8'))
    if (/\.(?:js|css|html)$/.test(filename)) return content.toString('utf8')
    return content
  }
}
