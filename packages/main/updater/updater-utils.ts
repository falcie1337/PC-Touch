import type { AxiosInstance } from 'axios'
import fs from 'fs'
import type { Manifest } from './models'
import { gameFilePath } from './game-files'

export type DiffManifest = Record<string, 1 | 0 | -1>

export const retrieveManifests = async ({
  localManifestPath,
  remoteManifestUrl,
  httpClient,
  gamePath,
  forceDownload = false
}: {
  localManifestPath: string
  remoteManifestUrl: string
  httpClient: AxiosInstance
  gamePath?: string
  forceDownload?: boolean
}): Promise<[Manifest, Manifest, DiffManifest]> => {
  let localManifest: Manifest = { files: {} }
  if (fs.existsSync(localManifestPath)) {
    try {
      localManifest = validateManifest(JSON.parse(fs.readFileSync(localManifestPath, 'utf8')))
    } catch (error) {
      // A truncated or obsolete cache should be rebuilt from the remote manifest.
      if (!(error instanceof SyntaxError) && !(error instanceof InvalidManifestError)) throw error
    }
  }
  const remoteManifest = validateManifest(await downloadJson<unknown>(remoteManifestUrl, httpClient))
  const difference = diffManifest(localManifest, remoteManifest)

  for (const key of Object.keys(remoteManifest.files)) {
    if (forceDownload || (gamePath && !fs.existsSync(gameFilePath(gamePath, key)))) {
      difference[key] = 1
    }
  }

  return [localManifest, remoteManifest, difference]
}

class InvalidManifestError extends Error {}

export const validateManifest = (value: unknown): Manifest => {
  if (!value || typeof value !== 'object' || !('files' in value)) {
    throw new InvalidManifestError('Invalid game manifest: expected a files object')
  }
  const files = (value as Manifest).files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new InvalidManifestError('Invalid game manifest: expected a files object')
  }
  for (const [key, entry] of Object.entries(files)) {
    try {
      gameFilePath('.', key)
    } catch (error) {
      throw new InvalidManifestError(error instanceof Error ? error.message : String(error))
    }
    if (!entry || typeof entry.filename !== 'string' || !entry.filename || typeof entry.version !== 'string') {
      throw new InvalidManifestError(`Invalid game manifest entry: ${key}`)
    }
  }
  return value as Manifest
}

export const downloadJson = <T>(url: string, httpClient: AxiosInstance): Promise<T> => {
  return httpClient.get(url).then((res) => {
    return res.data
  })
}

/**
 * Return the difference between two manifest
 * @returns {(1|-1|0)} 0 -> same files, -1 files removed, 1 file added */
export const diffManifest = (manifestA: Manifest, manifestB: Manifest): DiffManifest => {
  const differences: DiffManifest = {}

  if (manifestB && manifestB.files) {
    for (const i in manifestB.files) {
      if (
        !manifestA ||
        !manifestA.files ||
        !manifestA.files[i] ||
        manifestA.files[i].version !== manifestB.files[i].version ||
        manifestA.files[i].filename !== manifestB.files[i].filename
      ) {
        differences[i] = 1
      } else {
        differences[i] = 0
      }
    }
  }

  if (manifestA && manifestA.files) {
    for (const i in manifestA.files) {
      if (!manifestB || !manifestB.files || !manifestB.files[i]) {
        differences[i] = -1
      }
    }
  }

  return differences
}
