import { CODE_PATTERN } from './machine'

export { Room as Room } from './room'

export interface Env {
  ROOMS: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response('ok', {
        headers: { 'access-control-allow-origin': '*' },
      })
    }

    const code = (url.searchParams.get('code') ?? '').toUpperCase()
    if (!CODE_PATTERN.test(code)) {
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
      })
    }

    const id = env.ROOMS.idFromName(code)
    return env.ROOMS.get(id).fetch(request)
  },
} satisfies { fetch(request: Request, env: Env): Promise<Response> }
