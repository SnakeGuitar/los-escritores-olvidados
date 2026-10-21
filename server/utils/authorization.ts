import type { H3Event } from 'h3'

export type AppRole = 'admin' | 'official_reader'
export type Permission = 'manage_readings' | 'manage_contests' | 'manage_contest_texts'

interface SessionRow {
  token_hash: string
  user_id: string
  discord_id: string
  username: string
  display_name: string
  avatar_url: string | null
  role: string | null
  discord_guild_id: string | null
  access_token_encrypted: string
  refresh_token_encrypted: string
  discord_token_expires_at: Date
  expires_at: Date
}

export interface AuthorizedSession {
  user: {
    id: string
    discordId: string
    username: string
    displayName: string
    avatarUrl: string | null
  }
  role: AppRole
}

const permissions: Record<AppRole, Permission[]> = {
  admin: ['manage_readings', 'manage_contests', 'manage_contest_texts'],
  official_reader: ['manage_readings', 'manage_contest_texts'],
}

export function roleFromDiscordMember(discordUserId: string, roleIds: string[]): AppRole | null {
  const config = useRuntimeConfig()
  if (config.discordOwnerUserId && discordUserId === config.discordOwnerUserId) return 'admin'
  if (config.discordAdminRoleId && roleIds.includes(config.discordAdminRoleId)) return 'admin'
  if (config.discordModRoleId && roleIds.includes(config.discordModRoleId)) return 'admin'
  if (config.discordReaderRoleId && roleIds.includes(config.discordReaderRoleId)) return 'official_reader'
  return null
}

async function sessionRow(event: H3Event) {
  const token = getCookie(event, 'leo_session')
  if (!token) return null
  const sql = database()
  const rows = await sql<SessionRow[]>`
    SELECT s.*, u.discord_id, u.username, u.display_name, u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > NOW()
    LIMIT 1
  `
  return rows[0] ?? null
}

async function currentAccessToken(row: SessionRow) {
  const sql = database()
  let accessToken = decryptSecret(row.access_token_encrypted)
  if (new Date(row.discord_token_expires_at).getTime() > Date.now() + 60_000) return accessToken

  const refreshed = await refreshDiscordToken(decryptSecret(row.refresh_token_encrypted))
  accessToken = refreshed.access_token
  await sql`
    UPDATE sessions SET
      access_token_encrypted = ${encryptSecret(refreshed.access_token)},
      refresh_token_encrypted = ${encryptSecret(refreshed.refresh_token)},
      discord_token_expires_at = ${new Date(Date.now() + refreshed.expires_in * 1000)}
    WHERE token_hash = ${row.token_hash}
  `
  return accessToken
}

function isAppRole(role: string | null): role is AppRole {
  return role === 'admin' || role === 'official_reader'
}

function authorizedSession(row: SessionRow, role: AppRole): AuthorizedSession {
  return {
    user: {
      id: row.user_id,
      discordId: row.discord_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
    role,
  }
}

export async function getAuthorizedSession(event: H3Event): Promise<AuthorizedSession | null> {
  const row = await sessionRow(event)
  if (!row) return null

  const guildId = useRuntimeConfig().discordGuildId
  if (isAppRole(row.role) && row.discord_guild_id === guildId) {
    return authorizedSession(row, row.role)
  }

  // Sessions created before role/guild caching are upgraded once. New sessions
  // are authorized solely by their opaque, expiring session token in the DB.
  let role: AppRole | null
  try {
    const accessToken = await currentAccessToken(row)
    const member = await fetchCurrentDiscordMember(accessToken)
    role = roleFromDiscordMember(member.user.id, member.roles)
  } catch (error: any) {
    // Discord definitively rejected the user (revoked/invalid token, not a member).
    if ([400, 401, 403, 404].includes(error?.statusCode ?? error?.status)) return null
    // Rate limits, outages and network errors say nothing about the session:
    // report them as temporary instead of logging the user out.
    console.error('[auth] No se pudo verificar la sesión con Discord', { statusCode: error?.statusCode ?? error?.status, message: error?.message })
    throw createError({ statusCode: 503, message: 'No se pudo verificar la sesión con Discord. Inténtalo de nuevo en unos segundos.' })
  }
  if (!role) return null

  try {
    await database()`
      UPDATE sessions
      SET role = ${role}, discord_guild_id = ${guildId}
      WHERE token_hash = ${row.token_hash}
    `
  } catch (error: any) {
    // Still authorized by Discord; failing to cache only means re-checking next time.
    console.error('[auth] No se pudo guardar el rol en la sesión (¿migración pendiente?)', { message: error?.message })
  }
  return authorizedSession(row, role)
}

export async function requirePermission(event: H3Event, permission: Permission) {
  const session = await getAuthorizedSession(event)
  if (!session) throw createError({ statusCode: 401, message: 'Sesión no autorizada.' })
  if (!permissions[session.role].includes(permission)) {
    throw createError({ statusCode: 403, message: 'No tienes permisos para esta acción.' })
  }
  return session
}
