# Superpowers Skills — Przewodnik

Wszystkie skille z podziałem na fazy pracy. Napisane dla junior deva / QA.

---

## Faza 1: Planowanie

| Skill | Co robi (prosto) | Kiedy użyć | Przykładowy prompt |
|-------|-----------------|------------|-------------------|
| `/brainstorming` | Zanim cokolwiek napiszesz — Claude zadaje ci pytania i razem ustalasz CO dokładnie budować | Przed każdą nową funkcją, nawet "prostą" | `/brainstorming` Chcę dodać system powiadomień email |
| `/writing-plans` | Tworzy szczegółowy plan krok-po-kroku z kodem, komendami, testami | Masz pomysł/spec, chcesz plan wykonania | `/writing-plans` Mam spec w docs/auth-spec.md, zrób plan |
| `/using-git-worktrees` | Tworzy odizolowaną kopię repozytorium żebyś nie psuł głównego brancha podczas implementacji | Przed dużą featurą lub odpaleniem planu | `/using-git-worktrees` feature/auth-middleware |

---

## Faza 2: Implementacja

| Skill | Co robi (prosto) | Kiedy użyć | Przykładowy prompt |
|-------|-----------------|------------|-------------------|
| `/executing-plans` | Wykonuje plan krok po kroku, zatrzymuje się po każdym tasku żebyś mógł sprawdzić | Masz gotowy plan w pliku `.md` | `/executing-plans` plans/02-authentication.md |
| `/subagent-driven-development` | Jak `/executing-plans` ale każdy task oddaje osobnemu "sub-Claude" — szybciej, mniej błędów kontekstu | Masz plan z niezależnymi taskami | `/subagent-driven-development` plans/02-authentication.md |
| `/dispatching-parallel-agents` | Uruchamia kilka niezależnych zadań równolegle jednocześnie | Masz 2+ niezależne zadania (nie zależą od siebie) | `/dispatching-parallel-agents` Napisz testy dla auth i dla tickets jednocześnie |
| `/test-driven-development` | Wymusza: najpierw failing test → potem implementacja — nawet jeśli tego nie ma w planie | Implementujesz feature/bugfix bez planu z TDD lub plan nie ma kroków TDD | `/test-driven-development` Dodaj endpoint POST /tickets |

### Kiedy używać `/executing-plans` vs `/subagent-driven-development`?

| | `/executing-plans` | `/subagent-driven-development` |
|--|-------------------|-------------------------------|
| Wykonanie | W tej samej sesji | Każdy task = osobny sub-Claude |
| Kontekst | Jeden długi kontekst (może się "zmęczyć") | Każdy task startuje świeżo |
| Kontrola | Checkpointy po każdym tasku | Dwuetapowy review po każdym tasku |
| Kiedy | Krótkie plany, proste taski | Długie plany, skomplikowane taski |

### Kiedy używać `/test-driven-development`?

| Sytuacja | Czy potrzebujesz? |
|----------|------------------|
| Plan ma kroki "write failing test" → "verify FAIL" → "implement" → "verify PASS" | Nie — TDD jest już w planie |
| Plan ma tylko "implement X" bez kroków testowych | Tak — wymusi TDD mimo braku kroków |
| Implementujesz feature ad-hoc bez planu | Tak — wymusi TDD |
| Naprawiasz buga bez planu | Tak — wymusi napisanie testu który reprodukuje buga |

---

## Faza 3: Jakość

| Skill | Co robi (prosto) | Kiedy użyć | Przykładowy prompt |
|-------|-----------------|------------|-------------------|
| `/systematic-debugging` | Zamiast zgadywać co nie działa — Claude metodycznie szuka przyczyny błędu | Masz buga/failing test i nie wiesz dlaczego | `/systematic-debugging` Test auth.test.ts FAIL z błędem "Cannot read userId" |
| `/requesting-code-review` | Claude robi review twojego kodu — szuka bugów, złych praktyk, brakujących testów | Po implementacji, przed mergem do main | `/requesting-code-review` Sprawdź server/src/middleware/auth.ts |
| `/receiving-code-review` | Gdy DOSTAJESZ review od kogoś — Claude pomaga ocenić czy sugestie są słuszne, nie ślepo je implementuje | Dostałeś feedback na PR i nie jesteś pewny czy ma rację | `/receiving-code-review` [wklej feedback] czy to ma sens? |
| `/verification-before-completion` | Przed powiedzeniem "gotowe" — Claude uruchamia testy, lint, typecheck i pokazuje dowody że działa | Przed commitem, PR, lub gdy chcesz powiedzieć "zrobione" | `/verification-before-completion` Sprawdź czy Task 2 z planu 02 jest naprawdę gotowy |

---

## Faza 4: Zakończenie

| Skill | Co robi (prosto) | Kiedy użyć | Przykładowy prompt |
|-------|-----------------|------------|-------------------|
| `/finishing-a-development-branch` | Pomaga zdecydować co zrobić z gotową gałęzią — merge, PR, cleanup | Feature skończona, testy przechodzą, chcesz mergować | `/finishing-a-development-branch` feature/auth jest gotowy |

---

## Narzędziowe

| Skill | Co robi (prosto) | Kiedy użyć | Przykładowy prompt |
|-------|-----------------|------------|-------------------|
| `/using-superpowers` | Instrukcja obsługi wszystkich skills — Claude ją czyta żeby wiedzieć jak działać | Na początku rozmowy (automatyczny) | (automatyczny) |
| `/writing-skills` | Tworzy/edytuje własne custom skille | Chcesz dodać własny skill do superpowers | `/writing-skills` Stwórz skill do generowania Prisma migrations |

---

## Typowy flow dla tego projektu

```
/brainstorming              <- Co budujemy? Jakie wymagania?
        |
/writing-plans              <- Jak to zbudujemy? Plan krok-po-kroku
        |
/using-git-worktrees        <- Izoluj workspace (osobny branch)
        |
/executing-plans            <- Buduj krok po kroku z checkpointami
lub
/subagent-driven-development
        |
/requesting-code-review     <- Sprawdź jakość przed mergem
        |
/finishing-a-development-branch  <- Merguj / stwórz PR / cleanup
```

---

## Cykl TDD (red-green)

TDD = Test-Driven Development. Zasada: **najpierw test, potem kod**.

```
1. Napisz test który FAIL (bo kod nie istnieje)  <- RED
2. Uruchom test, potwierdź że FAIL
3. Napisz minimalny kod żeby test przeszedł      <- GREEN
4. Uruchom test, potwierdź że PASS
5. Commit
```

Dlaczego? Jeśli piszesz test PO kodzie, test może przechodzić nawet gdy jest błędny.
Jeśli piszesz test PRZED kodem i widzisz RED — wiesz że test faktycznie coś sprawdza.

Nasze plany mają TDD wbudowane w kroki — dlatego `/executing-plans` wystarczy.
Gdy plan nie ma kroków TDD → dodaj `/test-driven-development` przed promptem.
