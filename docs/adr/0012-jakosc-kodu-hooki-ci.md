# ADR-0012: Bramki jakości: Prettier, ESLint, typecheck w pre-commit i w CI

- **Status:** Zaakceptowany
- **Retrospektywny:** tak
- **Data decyzji:** 2026-05-07 (źródło: commit `eb6b20d`, plan jakości kodu); wdrożenie 2026-05-08 (`e7e8586`)
- **Data spisania:** 2026-10-30
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

`project-scope.md` wymaga automatycznie egzekwowanego formatowania, analizy statycznej, hooków blokujących commity z błędami i sprawdzania typów w CI, ze wspólną konfiguracją dla client i server.

## Decyzja

Prettier i ESLint (flat config, typescript-eslint, react-hooks, sortowanie importów) w roocie. Husky + lint-staged w pre-commit; hook uruchamia też `prettier --check .` i `pnpm typecheck` na całym drzewie. GitHub Actions: lint i format, typecheck, testy serwera i klienta na Node 22.

## Rozważane opcje

Brak zapisu o rozważanych alternatywach.

## Konsekwencje

**Pozytywne**

- Do repozytorium nie trafia kod z błędami formatowania, lintu lub typów.

**Negatywne / koszty**

- Pre-commit sprawdza całe drzewo robocze, nie tylko zmienione pliki, więc niezacommitowane zmiany w innych plikach mogą zablokować commit.
- Commit trwa dłużej (pełny typecheck trzech projektów).

**Niewiadome**

- Brak.

## Dowody

- `project-scope.md` – sekcja Code Quality
- `eb6b20d` – plan jakości kodu
- `a7ae0c9`, `2dca2b7`, `e5985cd`, `58903b4` – Prettier, ESLint, Husky, CI
- `754efc8` – `prettier --check` w pre-commit
- `.github/workflows/ci.yml`, `package.json` (`lint-staged`, `typecheck`)
