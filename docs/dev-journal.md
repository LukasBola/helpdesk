# Dev Journal — Helpdesk Project

Historia komend i decyzji podczas pracy nad projektem.

---

## 2026-05-08

### Plan 00: Code Quality (Prettier, ESLint, Husky, CI)

```text
/using-git-worktrees feature/code-quality

Kiedy worktree będzie gotowy:

/executing-plans plans/00-code-quality.md
```

**Dlaczego `/using-git-worktrees`?**
Tworzy odizolowaną kopię repo w osobnym katalogu. Wszystkie zmiany lądują tam — `main` zostaje nienaruszony. Jeśli coś pójdzie nie tak w połowie planu, możesz po prostu usunąć worktree bez konsekwencji.

**Czy trzeba najpierw utworzyć branch?**
Nie. `/using-git-worktrees feature/code-quality` tworzy branch i worktree jednocześnie — nie trzeba robić `git checkout -b` wcześniej. Pod spodem wykonuje:

```bash
git worktree add -b feature/code-quality ../helpdesk-code-quality
```

**Dlaczego `/executing-plans` a nie `/subagent-driven-development`?**
Plan 00 ma tylko 4 taski i są sekwencyjne (Prettier → ESLint → Husky → CI). Żaden task nie zależy od równoległości ani nie jest na tyle długi żeby "zmęczyć" kontekst. `/subagent-driven-development` ma sens od planu 02+ gdzie taski są bardziej złożone.

**Co robi ten plan?**
Konfiguruje całe środowisko jakości kodu zanim napisze się choćby linijkę logiki:

- **Prettier** — formatowanie kodu (średniki, cudzysłowy, długość linii)
- **ESLint strict** — statyczna analiza TypeScript, wykrywanie błędów przed uruchomieniem
- **Husky + lint-staged** — pre-commit hook blokuje commit jeśli jest błąd formatowania lub lint
- **CI pipeline** — GitHub Actions uruchamia lint + typecheck + testy przy każdym push

**Plusy tej kolejności (code quality jako Plan 00):**
Każdy kolejny commit od teraz będzie automatycznie sprawdzany. Nie ma długu technicznego w formatowaniu od pierwszego dnia.

**Minusy / na co uważać:**
Po `npx prettier --write .` (Step 4 w Task 1) wszystkie pliki zostaną sformatowane — git pokaże dużo zmian naraz. To normalne i oczekiwane.

---

Po skończeniu implementacji:

```text
/requesting-code-review
Sprawdź zmiany wprowadzone podczas implementacji plans/00-code-quality.md

Kiedy review będzie gotowe i poprawki wdrożone:

/verification-before-completion

Kiedy weryfikacja przejdzie:

/finishing-a-development-branch
```

**Dlaczego `/requesting-code-review` przed mergem?**
Claude sprawdza czy konfiguracja jest kompletna i poprawna — czy czegoś nie brakuje w ESLint config, czy Husky hook faktycznie blokuje złe commity, czy CI pipeline ma wszystkie wymagane kroki. Lepiej wyłapać to teraz niż po mergu do `main`.

**Co robi `/verification-before-completion`?**
Uruchamia testy, lint i prettier --check, pokazuje rzeczywisty output z exit code. Żadnych twierdzeń "powinno działać" — tylko twarde dowody że działa. Skill wymusza to przed każdym commitem/PR.

**Co robi `/finishing-a-development-branch`?**
Pyta co zrobić z gotowym worktree — możesz wybrać merge do `main`, stworzenie PR na GitHubie, lub cleanup (usunięcie brancha jeśli coś poszło nie tak).
