# How AgentFoundry was used

Code for a Billion requires that entries are built using AgentFoundry (AF), the official IDE. This file records exactly what was done in AF. Only work that really happened is listed here.

## Log

AgentFoundry v0.1.80 on Windows, 14 November 2026.

| Time (IST) | AF feature | What was done | Evidence |
| --- | --- | --- | --- |
| 11:55 | Project | Opened this repository as an AF project (credential import skipped) and ran `npm test` in the AF terminal: 17 of 17 pass | `docs/af/01-project-tests.jpg` |
| 11:56 to 12:11 | SMART-Code | Asked SMART-Code to add Gujarati as a seventh language. It read `src/i18n.js` and wrote the `gu` row in `LANGS` and the full `gu` text table in three approved `edit_file` calls (the Haiku route returned empty replies, so the task was rerun on the GPT-5 route) | `docs/af/03-smartcode.jpg`, `docs/af/smart-code-session.json` (the full SMART-Code session log) |
| 12:12 | Review | The Gujarati draft was reviewed and corrected before commit. Mistranslations were corrected, most importantly in the heat-illness warning ("ગુલામી", slavery, where "faint" was meant, and "પાણી વાઢો", cut water, where "pour water" was meant), plus time-of-day words and a few unnatural phrases | commit diff of `src/i18n.js` |
| 12:14 | Terminal | Ran `npm test` (17 of 17 pass, including the check that every language has every key) and `npm run backtest` in the AF terminal after the change; backtest results unchanged | `docs/af/04-tests-after-gujarati.jpg` |

Not done in AF: Agent Studio and Evals. The agent definition and the eval cases below are kept as reference; the same cases run as unit tests in `test/planner.test.js`.

## Agent description for Agent Studio

**Name:** Dhoop Ghadi

**Goal:** Give an outdoor worker in India the safe hours to work today and tomorrow in extreme heat.

**Inputs:** place (latitude, longitude), kind of work (construction, farm labour, brick kiln, loading, delivery, street vending, sanitation), whether the person is used to the heat, language.

**Tools:**

- `fetchForecast(lat, lon)`: hourly weather from Open-Meteo (`src/data.js`).
- `wbgtFromWeather(hour)`: heat stress index for one hour (`src/wbgt.js`).
- `planDay(hours, options)`: the best one or two work blocks (`src/planner.js`).
- `describe(lang, plan, usualShift)`: the message (`src/summary.js`).

**Guardrails:**

- Never schedule an hour whose level is above "30 minutes work, 30 minutes rest".
- Never claim more safe hours than the limits allow. If eight hours cannot be reached, say how many can.
- Never give medical advice beyond the fixed danger line (stop, shade, water on the body, call 108).
- Never ask for or store a name, phone number or exact address.
- All limits come from `src/thresholds.js`. The agent does not invent thresholds.

## Checks for Evals

| Case | Input | Expected |
| --- | --- | --- |
| Cool day | WBGT 22 all day, heavy work | One block, 7 am to 3 pm, message kind `safe` |
| Warm day | WBGT 27, with 28.5 from 10 am to 2 pm, heavy work | One block, no split |
| Severe afternoon | WBGT 27, with 31 from 10 am to 4 pm, heavy work | Two blocks, a rest gap from 10 am to 4 pm |
| Lethal day | WBGT 34 all day, any work | No blocks, message kind `stop` |
| New worker | WBGT 27, moderate work, not used to heat | Stricter level than for a worker who is used to it |
| Forecast too mild | Plan from WBGT 27, real WBGT 31 in one planned hour | `verifyPlan` reports exactly one missed hour |

These are the same cases as `test/planner.test.js`.
