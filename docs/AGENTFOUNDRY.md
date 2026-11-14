# How AgentFoundry was used

Code for a Billion requires that entries are built using AgentFoundry (AF), the official IDE. This file records exactly what was done in AF. Only work that really happened is listed here.

## Log

**Status: not started.** The rows below are the planned steps. A date and evidence are added to a row only when that step has been done, and rows that were not done are deleted before submission.

| Date (IST) | AF feature | What was done | Evidence |
| --- | --- | --- | --- |
| | Project | Opened this repository as an AF project | `docs/af/01-project.png` |
| | Terminal | Ran `npm test` (17 tests) and `npm run backtest` | `docs/af/02-tests.png` |
| | Agent Studio | Defined the Dhoop Ghadi agent: observe, judge, plan, hand over | `docs/af/03-agent.png` |
| | Smart-Code | Added a seventh language to `src/i18n.js` and a test for it | commit hash, `docs/af/04-smartcode.png` |
| | Evals | Ran the plan checks below as an eval suite | `docs/af/05-evals.png` |

## Steps to do in AgentFoundry

1. Sign up at agentfoundry.me and install the Windows build. On first launch, decline the offer to import credentials and settings from other tools.
2. Open the `dhoop-ghadi` folder as a project. Screenshot.
3. In the AF terminal run `npm test`, then `npm run backtest`. Screenshot the passing output.
4. In Agent Studio, create an agent named Dhoop Ghadi from the description in the next section. Screenshot.
5. With Smart-Code, give this task: "Add Gujarati (`gu`) to `src/i18n.js`, following the structure of the Hindi entry exactly, including `periods`, `hourWord`, `rangeA`, `sample` and `sampleNote`. Add `gu` to `LANGS`. Do not change any other language. Then run `npm test`." Review the result, run the tests, commit from AF.
6. Optional: in Evals, add the checks listed below and run them.
7. Put the screenshots in `docs/af/` and fill in the log above.

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
