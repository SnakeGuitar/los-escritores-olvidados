export default defineEventHandler(async (event) => {
  const returnTo = safeReturnTo(getQuery(event).returnTo)
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  }

  // Reuse a valid one-week session instead of starting OAuth again.
  if (await getAuthorizedSession(event)) {
    deleteCookie(event, RETURN_TO_COOKIE, { path: '/' })
    return sendRedirect(event, returnTo)
  }

  setCookie(event, RETURN_TO_COOKIE, returnTo, cookieOptions)
  const state = createOpaqueToken()
  setCookie(event, 'leo_oauth_state', state, cookieOptions)
  return sendRedirect(event, discordAuthorizationUrl(state))
})
