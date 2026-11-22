export const gameRequestHeaders = (url: string, headers: Record<string, string>): Record<string, string> => {
  const requestHeaders = { ...headers }
  const target = new URL(url)
  const omitReferer = target.protocol === 'https:' && target.hostname === 'static.ankama.com'
  const omitted = [
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-dest'
  ]
  for (const key of Object.keys(requestHeaders)) {
    if (omitted.includes(key.toLowerCase()) || (omitReferer && key.toLowerCase() === 'referer')) {
      delete requestHeaders[key]
    }
  }
  return requestHeaders
}
