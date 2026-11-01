# ADR-0017: Lokalna Ollama jako domyślny dostawca AI, za wspólnym interfejsem dostawcy

- **Status:** Zaakceptowany
- **Retrospektywny:** nie
- **Data decyzji:** 2026-11-01 (źródło: spec Planu 07)
- **Data spisania:** 2026-11-01
- **Zastępuje / Zastąpiony przez:** —

## Kontekst

Plan 07 dodaje AI. Dla każdego nowego ticketu AI liczy w tle streszczenie, propozycję priorytetu i szkic odpowiedzi. `tech-stack.md` zakładał do tego Claude API, wyjście strukturalne przez tool use i nagrane odpowiedzi Claude w testach. Użytkownik zażądał lokalnego modelu jako domyślnego, żeby kontrolować koszty. Liczenie w tle oznacza wywołanie modelu dla każdego maila. Aplikacja działa na razie tylko lokalnie, a produkcja jest poza zakresem.

## Decyzja

AI wołamy przez wspólny interfejs dostawcy wybierany zmienną `AI_PROVIDER`:

- `ollama` jest domyślny: lokalna Ollama, model z `OLLAMA_MODEL`, domyślnie `qwen3.8:27b-q4_K_M` (GGUF);
- `claude` ma tylko szkielet bez implementacji;
- `fake` służy do testów.

Wyjście strukturalne daje parametr `format` (JSON Schema) Ollamy. Każdą odpowiedź waliduje Zod przed zapisem.

## Rozważane opcje

- **Claude API jako jedyny dostawca** (stary plan 07, `tech-stack.md`): odrzucone, bo koszt rośnie z liczbą maili.
- **Model MLX (`qwen3.8:27b-mlx`) lub `nvfp4` (`qwen3.8:27b`):** odrzucone, bo Ollama 0.40.13 zwraca dla nich `structured output is unavailable`, a wymuszony schemat jest wymagany.
- **Pełna implementacja Claude obok Ollamy już w Planie 07:** odłożone (decyzja użytkownika). Na razie zostaje tylko miejsce w interfejsie.

## Konsekwencje

**Pozytywne**

- Wywołanie modelu nic nie kosztuje: `costUsd = 0`.
- Treść maili klientów nie opuszcza maszyny [wniosek].
- Zmiana dostawcy nie wymaga zmian w logice ticketów, bo prompty i schematy są w serwisie AI, a dostawca tylko tłumaczy wywołanie [wniosek].

**Negatywne / koszty**

- Każdy deweloper musi zainstalować Ollamę i pobrać model (około 18 GB, potrzeba dużo RAM).
- Model 27B odpowiada wolniej niż API w chmurze, a pierwsze wywołanie trwa dłużej, bo model musi się wczytać. Dlatego liczenie działa w tle, a nie na kliknięcie [wniosek].
- Opisy Claude w `tech-stack.md` (tool use, `__fixtures__/claude/`) są nieaktualne dla domyślnej ścieżki.

**Niewiadome**

- Źródło AI na produkcji: zdalna Ollama albo Claude. Rozstrzygnie osobny plan wdrożenia.
- Czy jakość szkiców z lokalnego modelu wystarczy. Sprawdzimy to ręcznie, a potem ewaluacjami promptfoo w Planie 12.

## Dowody

- `docs/superpowers/specs/2026-11-01-ai-pipeline-design.md` – cele 8–10, sekcje „Konfiguracja” i „Fakty o Ollamie”
- `tech-stack.md` – Claude API, tool use, fixtures Claude
- `plans/07-ai-pipeline.md` – pierwotny plan tylko z Claude
- Test ręczny 2026-11-01 (Ollama 0.40.13): `format` działa dla `qwen3.8:27b-q4_K_M`, dla wariantów MLX i `nvfp4` zwraca błąd
- `server/prisma/schema.prisma` – model `AIInteraction` z `costUsd`
