import { spawnSync } from 'node:child_process'

function run(command, args) {
  const result = spawnSync(command, args, { env: process.env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el entorno Production de Vercel.')
    process.exit(1)
  }

  console.log('Aplicando migraciones de producción antes del build...')
  run(process.execPath, ['scripts/migrate.mjs'])
}

run('npm', ['run', 'build'])
