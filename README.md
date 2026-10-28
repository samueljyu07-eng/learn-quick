# Learn Quick

Learn Quick turns source material into a short study path built around one goal. You paste notes, a PDF, or a link, pick what you need the material for, and the app writes definitions, an explanation, a summary, a study time, and practice problems.

The language model is Claude (`claude-sonnet-5-5`). The key stays in `.env.local` and is never written into the app.

## Run it

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and paste your key after `ANTHROPIC_API_KEY=`. Create a key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys). Step 1 works before the key is set. Definitions, the summary, the timer, and practice problems need it.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If that port is already used by another app, start this one on 3010:

```bash
npx next dev --hostname 127.0.0.1 --port 3010
```

Use Safari or Chrome. The in-editor browser can reload the page in a loop and call Claude over and over.

## The study path

1. **Objective.** Paste text, upload a `.txt`, `.md`, `.html`, or `.pdf`, or give a link. Pick a goal: pass a test, learn a skill, understand the ideas, or apply them to a task you have now. You can add context, such as the test format or the real task.
2. **Definitions.** Claude extracts key terms. You can check the ones you understand. Checked terms are saved in **My definitions**.
3. **Explain.** Three sentences that orient you before the summary.
4. **Summary.** A short summary tied to your goal, with links back to the source passages. A clarification box lets you ask for a revision.
5. **Check.** Shown in the progress bar. Not built yet.

**Practice these problems** sits on the summary page. It is practice, not step 5.

## Familiarity and study time

When terms are extracted, Learn Quick compares them with My definitions. Matching ignores capital letters and simple plurals. Claude is asked only about leftover terms that might be synonyms. The score is saved once for that material.

The timer does not ask Claude for a minute count. Claude rates difficulty from 1 to 5. The app then calculates:

- reading and processing: `(summary words / 200) × 2`
- new terms: `1.5 minutes` for each unfamiliar term
- difficulty: `+0`, `+3`, `+6`, `+10`, or `+15` minutes

The total is rounded and kept between 5 and 120 minutes. **Why this time?** shows the breakdown. Change the numbers in `config/study.ts`.

The timer counts down from an end time. Start, pause, reset, and the five-minute buttons still work when hardcore mode is off. A refresh keeps the remaining time.

## Hardcore mode

On step 1, hardcore mode is optional. Turning it on asks you to confirm: if you don't pass the practice problems before the timer ends, that material is locked forever.

The deadline is saved on the server when the study time is calculated. Refreshing the page does not move it, and hardcore mode has no pause, reset, or add-time controls. The countdown you see is that server deadline.

You pass if every practice problem has a score and the average is 70 or higher before the deadline. Otherwise the material is marked FAILED. Learn Quick stores a fingerprint of the text (lowercase, with spaces and punctuation removed, then SHA-256). A later paste or upload that matches, or is about 90% the same, is rejected with "This material is locked." **Locked materials** lists the titles.

Until accounts arrive in the next phase, the lock belongs to a private cookie in this browser. Clearing site data for this app starts a new cookie. The deadline itself still cannot be edited from the page.

## Practice problems

The set matches the goal from step 1:

| Goal | What you get |
| --- | --- |
| Pass a test | 5 to 10 multiple-choice questions and 2 short answers. The test format in your context is used when you gave one. |
| Learn a skill | 2 or 3 exercises. Coding skills open a code editor. Python runs in the browser. Other languages are reviewed but not run. Other skills ask you to do the thing and describe what you did. |
| Understand | 3 prompts to explain the idea in your own words. |
| Apply it | One draft of your real task, scored against a rubric built from your outcome. |

Each answer gets a score from 0 to 100 and a short note. 70 or higher passes. Multiple-choice is scored in the app. Written answers and code are scored by Claude. The first Python run downloads Python into the browser, so it can take a little while.

New problem types are added in `lib/problems/registry.ts`.

## What is stored on this computer

Nothing is in a database yet.

| Data | Where |
| --- | --- |
| The current material and goal | `sessionStorage`, key `learn-quick-session` |
| My definitions | `localStorage`, key `learn-quick-library` |
| Familiarity for a material | `localStorage`, key `learn-quick-familiarity` |
| The timer | `localStorage`, key `learn-quick-timer` |
| Extracted terms, the summary, and practice problems | `sessionStorage` |
| Hardcore deadlines and locks | On the server, in `data/hardcore.json`, tied to a private browser cookie |

## What's next

Build these one phase at a time. Do not start the next phase until the current one is tested.

**Phase C. Accounts, points, and a contribution tracker.** Add Supabase for email sign-in and a database. Move the hardcore locks, deadlines, and My definitions off this computer and onto the signed-in person. Award points only for a passing session, with a higher multiplier when the material is less familiar. Repeats earn less, and there is a daily cap. Show a year-style calendar of points, the current streak, and the total. The point numbers go in `config/study.ts`.

**Phase D. Leaderboard.** All time, this month, and by university. People opt in with a display name. Email addresses stay hidden. A university can be verified from the email domain when that is possible.

**Phase E. Podcast mode.** A button on the summary page. Claude writes a two-host conversation matched to the goal, then a text-to-speech service turns it into audio. Cache each podcast and cap how many a person can generate per day.

Step 5, **Check**, stays unbuilt until it is asked for on its own.
