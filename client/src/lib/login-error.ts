// Mapped by status, not message: the server must not reveal whether an account exists or is blocked.
export function loginErrorMessage(status: number | undefined): string {
  if (status === 401 || status === 403) return 'Nieprawidłowy e-mail lub hasło'
  if (status === 429) return 'Za dużo prób. Spróbuj za chwilę.'
  return 'Coś poszło nie tak. Spróbuj ponownie.'
}
