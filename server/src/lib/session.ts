import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'

import { env } from '../env'

const PgStore = connectPgSimple(session)

export const sessionMiddleware = session({
  store: new PgStore({
    conString: env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: false,
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
})
