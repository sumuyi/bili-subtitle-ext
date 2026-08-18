export interface RouteInfo {
  bvid: string
  page: number
}

export function parseRoute(): RouteInfo | null {
  if (!location.pathname.startsWith('/video/')) return null
  const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/)
  if (!m) return null
  const page = Number(new URLSearchParams(location.search).get('p')) || 1
  return { bvid: m[1], page }
}

export function onRouteChange(cb: (route: RouteInfo | null) => void): () => void {
  let lastHref = location.href
  const mo = new MutationObserver(() => {
    if (location.href === lastHref) return
    lastHref = location.href
    cb(parseRoute())
  })
  mo.observe(document.documentElement, { childList: true, subtree: true })
  return () => mo.disconnect()
}
