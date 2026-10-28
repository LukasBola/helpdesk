declare namespace Express {
  interface Request {
    currentUser?: {
      id: string
      role: 'AGENT' | 'ADMIN'
    }
  }
}
