# ADR-0004: Poczta przychodząca przez webhook Postmark, idempotencja po `Message-ID`

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-04-23 (źródło: commit `d1441c4`); wdrożenie 2026-05-13 (`31fee68`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Tickety powstają z e-maili od klientów. Dostawca webhooków ponawia wywołania, więc ten sam e-mail może przyjść więcej niż raz. System sam wysyła odpowiedzi, więc musi ignorować własną pocztę (pętla).

## Decyzja

Postmark Inbound jako źródło e-maili, przez `POST /api/webhooks/postmark`. Webhook uwierzytelniany nagłówkiem `X-Postmark-Token` porównywanym w czasie stałym. Duplikaty blokuje unikalne ograniczenie na `tickets.messageId`. Wiadomości z własnej domeny wychodzącej są odrzucane.

## Rozważane opcje

Brak zapisu o porównaniu dostawców. `tech-stack.md` podaje jako powód wyboru Postmarka „better quoted reply and threading support”.

## Konsekwencje

**Pozytywne**

- Ponowienia webhooka nie tworzą duplikatów (zweryfikowane testem na prawdziwej bazie).
- Bez `POSTMARK_WEBHOOK_TOKEN` webhook odrzuca każde wywołanie (401), a nie przyjmuje wszystkiego.

**Negatywne / koszty**

- Uzależnienie od formatu payloadu Postmarka.
- Duże e-maile przekraczały domyślny limit body 100 kB i kończyły się błędem 500; limit dla webhooka podniesiono do 10 MB (`74e7221`).

**Niewiadome**

- Brak.

## Dowody

- `d1441c4` – `tech-stack.md`: Postmark, idempotencja po `Message-ID`
- `31fee68`, `3d73108` – endpoint webhooka, zadanie z wykrywaniem pętli
- `a13bdb2` – token porównywany w czasie stałym, walidacja Zod
- `c7e7bdc`, `0cebd7b` – test deduplikacji, 20 przypadków brzegowych
- `server/prisma/schema.prisma` – `messageId String @unique`
- `74e7221` – limit body 10 MB dla webhooka
