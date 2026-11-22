import { app } from 'electron'

export const APP_PATH = app.getAppPath()
export const LOGS_PATH = app.getPath('logs')
export const GAME_PATH = app.getPath('userData') + '/game/'
export const CHARACTER_IMAGES_PATH = app.getPath('userData') + '/character-images/'
export const DOFUS_ORIGIN = 'https://dt-proxy-production-login.ankama-games.com/'
export const DOFUS_EARLY_ORIGIN = 'https://dt-proxy-production-early.ankama-games.com/'
export const DOFUS_ITUNES_ORIGIN = 'https://itunes.apple.com/lookup?id=1041406978&t=' + new Date().getTime()
export const LOCAL_ASSET_MAP_PATH = GAME_PATH + 'assetMap.json'
export const REMOTE_ASSET_MAP_URL = DOFUS_ORIGIN + 'assetMap.json'
export const LOCAL_LINDO_MANIFEST_PATH = GAME_PATH + 'lindoManifest.json'
// Pin both the manifest and its executable files to a reviewed revision.
export const LINDO_GAME_BASE_URL =
  'https://raw.githubusercontent.com/zenoxs/lindo-game-base/0327e6986a1ab78900667c79663d0b2215894058/'
export const REMOTE_LINDO_MANIFEST_URL = LINDO_GAME_BASE_URL + 'manifest.json'
export const LOCAL_DOFUS_MANIFEST_PATH = GAME_PATH + 'manifest.json'
export const REMOTE_DOFUS_MANIFEST_URL = DOFUS_ORIGIN + 'manifest.json'
export const LOCAL_VERSIONS_PATH = GAME_PATH + 'versions.json'
export const LOCAL_REGEX_PATH = GAME_PATH + 'regex.json'

// GitHub
export const GITHUB_OWNER = 'prixe'
export const GITHUB_REPO = 'lindo'
export const GITHUB_LATEST_RELEASE_URL = 'https://github.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/latest'
