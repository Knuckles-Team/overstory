import { fileURLToPath } from 'node:url'
import { mergeConfig, type UserConfig } from 'vite'
import base from '../../../vite.config'

const arboraPort = process.env.BACKEND_PORT ?? '39100'

/**
 * The app's own config with one change: `/api` goes to the loopback arbora
 * with the browser's `Origin` and `Referer` removed. Arbora's no-auth mode
 * admits only a request that is not from a browser origin; in a deployment the
 * Overstory host makes that request on the browser's behalf, so this proxy
 * plays the host's part and nothing else.
 */
export default mergeConfig((base as unknown as () => UserConfig)(), {
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${arboraPort}/`,
        changeOrigin: true,
        configure: (proxy: {
          on: (event: string, handler: (req: { removeHeader: (n: string) => void }) => void) => void
        }) =>
          proxy.on('proxyReq', (req) => {
            req.removeHeader('origin')
            req.removeHeader('referer')
          }),
      },
    },
  },
}) as UserConfig
