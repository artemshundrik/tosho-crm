# Голосова диктовка ТЗ та коментарів — специфікація

**Дата:** 2026-07-15
**Статус:** затверджено до реалізації

## Мета

Дати можливість диктувати голосом текст у найтекстовіші поля CRM (ТЗ дизайнеру та
коментарі) замість набору вручну. Голос → якісний український текст, вставлений у
позицію курсора.

## Рішення (затверджені)

| Питання | Рішення |
|---|---|
| Обсяг v1 | ТЗ-поля + поля коментарів (не «скрізь») |
| Мова | Українська, `language=uk` |
| Обробка | Транскрипт → другий прохід gpt «причесати» (пунктуація, абзаци, структура) |
| Режим запису | Batch: натиснув → говориш → стоп → вставка (без realtime-стрімінгу) |
| Провайдер | OpenAI, той самий ключ і патерн, що вже в `netlify/functions/tosho-ai.ts` |

## Архітектура

```
[DictationButton у полі]
  → MediaRecorder (webm/opus, fallback mp4/Safari) пише аудіо
  → стоп → Blob → base64
  → POST /.netlify/functions/transcribe   (Bearer = Supabase access_token)
       → перевірка JWT (getUser), CORS, ліміт розміру/типу
       → OpenAI /v1/audio/transcriptions (OPENAI_TRANSCRIBE_MODEL, language=uk) → raw
       → OpenAI /v1/responses (OPENAI_MODEL, промпт причісування за context) → cleaned
       → { raw, cleaned }
  → вставка cleaned у позицію курсора textarea
  → звичайне збереження поля (save-логіку не чіпаємо)
```

### Нові файли

1. **`netlify/functions/transcribe.ts`** — дзеркалить auth/CORS/fetch-патерн `tosho-ai.ts`.
   - Signature: `export const handler = async (event) => {...}`, повертає `{ statusCode, headers, body }`.
   - Вхід (JSON): `{ audioBase64, mimeType, context: 'brief' | 'comment', clean?: boolean }`.
   - Auth: Bearer JWT → `userClient.auth.getUser()`; нема користувача → 401.
   - Транскриб: декодуємо base64 → Buffer → `Blob` → `FormData` → `POST https://api.openai.com/v1/audio/transcriptions`
     з `model = OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe'`, `language = 'uk'`, `response_format = 'text'`.
   - Причісування (`clean` за замовч. true): `POST /v1/responses` з `OPENAI_MODEL`,
     developer-промпт залежить від `context` (ТЗ vs коментар). Якщо цей крок падає —
     повертаємо `raw` як `cleaned` (диктовку не втрачаємо).
   - Ліміти: макс. розмір тіла (~4.5 MB raw ≈ base64 6 MB Netlify ліміт); валідація mime `audio/*`.
   - Ключ `OPENAI_API_KEY` лише в Netlify env, ніколи в `src`.

2. **`src/lib/useDictation.ts`** — хук.
   - `getUserMedia({ audio })` → `MediaRecorder`. Стани `idle | recording | transcribing | error`.
   - `start()`, `stop()`, `cancel()`, `elapsedMs`, `error`, `isSupported`.
   - На стоп: збирає Blob → base64 → fetch функції з `access_token` (`supabase.auth.getSession()`).
   - Повертає текст через колбек `onResult(text)`. Ліміт запису ~5 хв (авто-стоп + попередження).

3. **`src/components/dictation/DictationButton.tsx`** — кнопка-мікрофон.
   - Пропси: `textareaRef`, `value`, `onChange(next)`, `context`, `disabled?`, опційно `onDirty?`.
   - Стани UI: idle (іконка мікрофона), recording (пульс + таймер + стоп), transcribing (спінер).
   - На результат: сплайс тексту в `value` за курсором `textareaRef.current.selectionStart/End`
     → `onChange(nextValue)` → відновлення курсора. Іконки — `lucide-react`. Тости — `sonner`.
   - Ховається, якщо `!isSupported` (нема MediaRecorder).

### Точки інтеграції (5)

| Місце | Поле / стан | Файл |
|---|---|---|
| ТЗ менеджера (inline + діалог) | `briefText` | `src/pages/QuoteDetailsPage.tsx` |
| ТЗ дизайнера | `briefDraft` | `src/pages/DesignTaskPage.tsx` |
| Перше ТЗ при створенні | textarea ТЗ | `src/components/quotes/QuoteBatchBuilderDialog.tsx` |
| Коментар до прорахунку | comment box | `src/pages/QuoteDetailsPage.tsx` |
| Коментар у дизайні | design comment | `src/pages/DesignTaskPage.tsx` |

Свідомо **не** вбудовуємо мікрофон у спільний `Textarea`/`AutoTextarea` — щоб не з'явився
скрізь. Кожна точка дротується окремо через `DictationButton`.

## Обробка помилок

- Нема дозволу на мікрофон → тост «Дозвольте доступ до мікрофона».
- Нема `MediaRecorder` → кнопка прихована.
- 401 → тост «Сесія протермінована».
- Транскриб ок, причісування впало → вставляємо `raw`, тихий тост.
- Задовгий запис → авто-стоп на ~5 хв + попередження.
- Мережа / OpenAI помилка → тост + можливість повторити.

## Безпека

- `OPENAI_API_KEY` тільки server-side (див. `docs/SECURITY.md`).
- Функція вимагає валідний Supabase JWT; CORS замкнений на POST/OPTIONS.
- Валідація mime (`audio/*`) та розміру тіла.
- Перед «готово» — `/security-review` (нова Netlify-функція + auth).

## Env

```
OPENAI_TRANSCRIBE_MODEL=gpt-4o-transcribe   # fallback whisper-1
# OPENAI_API_KEY, OPENAI_MODEL — вже є
```

## Верифікація

- `npx tsc --noEmit` + `npm run lint`.
- Ручна: `netlify dev` (8888) — записати коротку укр. фразу, підтвердити вставку (запускає користувач).

## Вартість

`gpt-4o-transcribe` ≈ $0.006/хв; прохід причісування — копійчаний. Логування використання
в v1 не робимо (додати пізніше за патерном `tosho_ai`, якщо треба).

## Поза обсягом v1

- Realtime-стрімінг тексту по словах (OpenAI Realtime + WebSocket).
- Диктовка в усіх textarea CRM.
- Логування/квоти використання.
- Автовизначення мови (`auto`) — наразі жорстко `uk`.
