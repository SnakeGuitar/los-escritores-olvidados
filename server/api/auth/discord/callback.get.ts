export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const expectedState = getCookie(event, 'leo_oauth_state')
  const returnTo = safeReturnTo(getCookie(event, RETURN_TO_COOKIE))
  deleteCookie(event, 'leo_oauth_state', { path: '/' })
  deleteCookie(event, RETURN_TO_COOKIE, { path: '/' })

  if (!query.code || typeof query.code !== 'string' || !query.state || query.state !== expectedState) {
    return sendRedirect(event, '/?auth=invalid')
  }

  try {
    const tokens = await exchangeDiscordCode(query.code)
    const member = await fetchCurrentDiscordMember(tokens.access_token)
    const role = roleFromDiscordMember(member.user.id, member.roles)
    if (!role) return sendRedirect(event, '/?auth=forbidden')

    const sql = database()
    const displayName = member.nick || member.user.global_name || member.user.username
    const users = await sql<{ id: string }[]>`
      INSERT INTO users (discord_id, username, display_name, avatar_url)
      VALUES (${member.user.id}, ${member.user.username}, ${displayName}, ${discordAvatarUrl(member.user)})
      ON CONFLICT (discord_id) DO UPDATE SET
        username = EXCLUDED.username,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        updated_at = NOW()
      RETURNING id
    `

    const sessionToken = createOpaqueToken()
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await sql`DELETE FROM sessions WHERE expires_at <= NOW()`
    await sql`
      INSERT INTO sessions (
        token_hash, user_id, role, discord_guild_id, access_token_encrypted, refresh_token_encrypted,
        discord_token_expires_at, expires_at
      ) VALUES (
        ${hashToken(sessionToken)}, ${users[0].id}, ${role}, ${useRuntimeConfig().discordGuildId}, ${encryptSecret(tokens.access_token)},
        ${encryptSecret(tokens.refresh_token)}, ${new Date(Date.now() + tokens.expires_in * 1000)},
        ${sessionExpiresAt}
      )
    `

    setCookie(event, 'leo_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: sessionExpiresAt,
    })
    return sendRedirect(event, returnTo)
  } catch (error: any) {
    console.error('[discord-oauth] Error en callback', {
      statusCode: error?.statusCode ?? error?.response?.status,
      statusMessage: error?.statusMessage ?? error?.response?.statusText,
      message: error?.message,
      data: error?.data,
    })
    return sendRedirect(event, '/?auth=failed')
  }
})
