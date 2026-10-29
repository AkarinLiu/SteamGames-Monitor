import tls from 'node:tls'

let initialized = false

/**
 * Node's bundled CA store can be missing enterprise/system roots used by some
 * networks. Merge the OS trust store into Node's defaults once at startup.
 */
export function initSystemCa(): void {
  if (initialized) return
  initialized = true
  try {
    const defaults = tls.getCACertificates('default')
    let system: string[] = []
    try {
      system = tls.getCACertificates('system')
    } catch {
      system = []
    }
    if (system.length === 0) return
    const merged = [...defaults]
    const seen = new Set(merged)
    for (const cert of system) {
      if (!seen.has(cert)) {
        seen.add(cert)
        merged.push(cert)
      }
    }
    tls.setDefaultCACertificates(merged)
  } catch (error) {
    console.warn('[tls] unable to merge system CA certificates:', error)
  }
}
