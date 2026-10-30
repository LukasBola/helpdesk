# ADR-0009: Walidacja zmiennych środowiskowych przez Zod przy starcie serwera

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); wdrożenie 2026-05-11 (`bfb6aad`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Serwer zależy od zmiennych środowiskowych (baza, sekrety auth, token webhooka, origin klienta). Brak lub błąd zmiennej powinien być widoczny od razu, a nie przy pierwszym użyciu.

## Decyzja

Jeden schemat Zod w `server/src/env.ts` waliduje `process.env` przy starcie; przy błędzie serwer się nie uruchamia. Reszta kodu czyta konfigurację wyłącznie z obiektu `env`. Zasady zależne od środowiska są w schemacie (np. `CLIENT_URL` wymagany tylko w produkcji).

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Błędna konfiguracja zatrzymuje start z czytelnym komunikatem.
- Typowany dostęp do konfiguracji w całym serwerze.

**Negatywne / koszty**

- Opcjonalne zmienne (np. `POSTMARK_WEBHOOK_TOKEN`) nie zatrzymują startu; brak tokenu ujawnia się dopiero jako 401 z webhooka.

**Niewiadome**

- Brak.

## Dowody

- `d1441c4` – `tech-stack.md`: „Zod schema validates process.env on startup; app refuses to start if required vars are missing”
- `bfb6aad`, `ceeb91f` – implementacja i testy
- `server/src/env.ts` – schemat, `superRefine` dla `CLIENT_URL`
