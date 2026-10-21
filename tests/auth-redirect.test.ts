import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as h3 from 'h3'
import { RETURN_TO_COOKIE, safeReturnTo } from '../server/utils/return-to.ts'

// Nitro auto-imports these in the real app; the handlers are exercised here
// against real h3 with only the Discord/DB collaborators replaced.
let session: object | null = null
Object.assign(globalThis, {
  defineEventHandler: h3.defineEventHandler,
  getQuery: h3.getQuery,
  getCookie: h3.getCookie,
  setCookie: h3.setCookie,
  deleteCookie: h3.deleteCookie,
  sendRedirect: h3.sendRedirect,
  safeReturnTo,
  RETURN_TO_COOKIE,
  getAuthorizedSession: async () => session,
  createOpaqueToken: () => 'state-token',
  discordAuthorizationUrl: (state: string) => `https://discord.com/oauth2/authorize?state=${state}`,
  exchangeDiscordCode: async () => ({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }),
  fetchCurrentDiscordMember: async () => ({ user: { id: '1', username: 'u', global_name: null }, nick: null, roles: [] }),
  roleFromDiscordMember: () => 'admin',
  discordAvatarUrl: () => null,
  encryptSecret: (value: string) => value,
  hashToken: (value: string) => value,
  useRuntimeConfig: () => ({ discordGuildId: 'guild' }),
  database: () => Object.assign(async () => [{ id: 'user-id' }], {}),
})

const start = await import('../server/api/auth/discord/index.get.ts')
const callback = await import('../server/api/auth/discord/callback.get.ts')

async function call(handler: unknown, url: string, cookie = '') {
  const app = h3.createApp().use(handler as h3.EventHandler)
  const response = await h3.toWebHandler(app)(new Request(`http://localhost${url}`, { headers: cookie ? { cookie } : {} }))
  const cookies = response.headers.getSetCookie()
  return { location: response.headers.get('location'), cookies, cookie: (name: string) => cookies.find(c => c.startsWith(`${name}=`)) }
}

test('no session: stores the allowed destination in an HttpOnly cookie and goes to Discord', async () => {
  session = null
  const result = await call(start.default, '/api/auth/discord?returnTo=/lecturas')
  assert.match(result.location!, /^https:\/\/discord\.com\//)
  const stored = result.cookie(RETURN_TO_COOKIE)!
  assert.match(stored, /^leo_return_to=%2Flecturas;|^leo_return_to=\/lecturas;/)
  assert.match(stored, /HttpOnly/i)
  assert.match(stored, /SameSite=Lax/i)
})

test('no session: unknown or external destinations fall back to /admin', async () => {
  session = null
  for (const target of ['https://evil.example', '//evil.example', '/otra', '']) {
    const result = await call(start.default, `/api/auth/discord?returnTo=${encodeURIComponent(target)}`)
    assert.match(result.cookie(RETURN_TO_COOKIE)!, /^leo_return_to=(%2F|\/)admin;/, target)
  }
  const missing = await call(start.default, '/api/auth/discord')
  assert.match(missing.cookie(RETURN_TO_COOKIE)!, /^leo_return_to=(%2F|\/)admin;/)
})

test('valid session: redirects straight to the requested allowed page', async () => {
  session = { role: 'admin' }
  assert.equal((await call(start.default, '/api/auth/discord?returnTo=/lecturas')).location, '/lecturas')
  assert.equal((await call(start.default, '/api/auth/discord?returnTo=/admin')).location, '/admin')
  assert.equal((await call(start.default, '/api/auth/discord')).location, '/admin')
  assert.equal((await call(start.default, '/api/auth/discord?returnTo=https://evil.example')).location, '/admin')
})

test('callback returns to the stored page and clears the temporary cookies', async () => {
  const result = await call(callback.default, '/api/auth/discord/callback?code=c&state=s',
    `leo_oauth_state=s; ${RETURN_TO_COOKIE}=${encodeURIComponent('/lecturas')}`)
  assert.equal(result.location, '/lecturas')
  assert.match(result.cookie(RETURN_TO_COOKIE)!, /Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  assert.match(result.cookie('leo_oauth_state')!, /Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  assert.ok(result.cookie('leo_session'))
})

test('callback falls back to /admin for a missing or tampered cookie', async () => {
  for (const value of ['', `${RETURN_TO_COOKIE}=${encodeURIComponent('https://evil.example')}`, `${RETURN_TO_COOKIE}=%2F%2Fevil.example`]) {
    const result = await call(callback.default, '/api/auth/discord/callback?code=c&state=s', `leo_oauth_state=s; ${value}`)
    assert.equal(result.location, '/admin', value)
  }
})

test('callback with an invalid state does not authenticate and never leaves the site', async () => {
  const result = await call(callback.default, '/api/auth/discord/callback?code=c&state=bad',
    `leo_oauth_state=s; ${RETURN_TO_COOKIE}=${encodeURIComponent('/lecturas')}`)
  assert.equal(result.location, '/?auth=invalid')
  assert.equal(result.cookie('leo_session'), undefined)
})
