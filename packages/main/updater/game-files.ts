import type { AxiosInstance } from 'axios'
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { pipeline } from 'stream/promises'

export const gameFilePath = (root: string, filename: string): string => {
  // Manifests are remote input. Also reject Windows drive letters and alternate data streams.
  if (
    !filename ||
    filename.includes(String.fromCharCode(0)) ||
    /[\\:<>"|?*]/.test(filename) ||
    filename.split('/').some((part) => !part || part.endsWith('.') || part.endsWith(' '))
  ) {
    throw new Error(`Invalid game file path: ${filename}`)
  }
  return path.join(root, filename)
}

export const downloadToFile = async (httpClient: AxiosInstance, url: string, destination: string): Promise<void> => {
  const temporaryPath = destination + '.download-' + randomBytes(8).toString('hex')
  await fs.promises.mkdir(path.dirname(destination), { recursive: true })
  try {
    const response = await httpClient.get(url, { responseType: 'stream' })
    await pipeline(response.data, fs.createWriteStream(temporaryPath, { flags: 'wx' }))
    await fs.promises.rename(temporaryPath, destination)
  } finally {
    await fs.promises.rm(temporaryPath, { force: true })
  }
}

export const runWithConcurrency = async <T>(
  items: T[],
  action: (item: T) => Promise<void>,
  concurrency = 4
): Promise<void> => {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid download concurrency')
  let next = 0
  const workers = Array.from({ length: Math.min(items.length, concurrency) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await action(item)
    }
  })
  // Wait for in-flight writes to finish before reporting an error to the updater.
  const results = await Promise.allSettled(workers)
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failed) throw failed.reason
}
