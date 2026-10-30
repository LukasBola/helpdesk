# ADR-0007: SPA i API pod jednym originem, ciasteczka sesji bez CORS

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-10-29 (źródło: commit `2e3a555`, spec frontendu)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Sesja Better Auth jest w ciasteczku. Frontend w dev działa na `:5173`, API na `:3000`. Proxy Vite przekazuje `/api` do serwera, ale zachowuje nagłówek `Origin: http://localhost:5173`, więc bez dodatkowej konfiguracji Better Auth odrzuca logowanie (403).

## Decyzja

Przeglądarka rozmawia z API wyłącznie przez origin frontendu: w dev przez proxy Vite, w produkcji zakłada się nginx proxujący `/api`. Klient auth i axios nie mają `baseURL`. Serwer ufa originowi z `CLIENT_URL` (`trustedOrigins`); zmienna jest wymagana w produkcji, w dev domyślnie `http://localhost:5173`.

## Rozważane opcje

Specyfikacja wymienia wariant cross-origin (CORS, inne ustawienia ciasteczek) jako wymagający innego projektu i nieplanowany.

## Konsekwencje

**Pozytywne**

- Ciasteczka `SameSite=Lax` działają bez CORS.
- Testy API Playwright idą przez proxy Vite, więc sprawdzają to samo połączenie co przeglądarka.

**Negatywne / koszty**

- Wpisanie `localhost:3000` w kliencie omija proxy i psuje ciasteczka.
- Nowa zmienna środowiskowa `CLIENT_URL`, obowiązkowa w produkcji.

**Niewiadome**

- Konfiguracja produkcyjna (nginx) nie istnieje; jednoorigin w produkcji to założenie specyfikacji.

## Dowody

- `docs/superpowers/specs/2026-10-29-frontend-core-design.md` – proxy, brak `baseURL`, `trustedOrigins`, założenie produkcyjne
- `da07fe6` – `trustedOrigins: [env.CLIENT_URL]`
- `client/vite.config.ts` – proxy `/api` → `http://localhost:3000`
- `server/src/env.ts` – `CLIENT_URL` wymagany w produkcji
- `e2e/fixtures/api.ts` – testy API przez origin frontendu
