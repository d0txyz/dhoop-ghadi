# Dhoop Ghadi (धूप घड़ी)

**Safe work hours in extreme heat, for India's outdoor workers.**

Dhoop ghadi means sundial. Pick a place and a kind of work, and the agent tells you which hours of today and tomorrow are safe to work, when to stop, how long to rest each hour and how much water to drink. One short message, in seven languages, that can be read aloud or sent on WhatsApp to a crew or a contractor.

- Live: https://d0txyz.github.io/dhoop-ghadi/
- Proof and numbers: https://d0txyz.github.io/dhoop-ghadi/impact.html
- How it works: https://d0txyz.github.io/dhoop-ghadi/method.html
- Entry for [Code for a Billion](https://codeforindia.org/hackathon) (Bharat Agentic-AI Hackathon 2026), Climate track
- Team: Off Hours. Built by d0t

## The problem

**Size.** About 380 million people, three quarters of India's workforce, do work that is exposed to heat: on building sites, in fields, at brick kilns, on delivery bikes and at street stalls (World Bank, *Climate Investment Opportunities in India's Cooling Sector*, 2022, citing McKinsey Global Institute).

**Severity.**

- The International Labour Organization projects that India will lose 5.8% of all working hours to heat stress in 2030, equal to 34 million full-time jobs. Agriculture and construction each lose 9% (*Working on a warmer planet*, 2019).
- The 2025 Lancet Countdown estimates India lost about 247 billion potential labour hours to heat in 2024, a record, about 419 hours per person, with agriculture carrying 66% of the loss and construction 20%. It puts the lost income at about 194 billion US dollars.
- HeatWatch counted 359 heatstroke deaths (86 confirmed, 273 suspected) in the 2026 summer, against 20 confirmed in official figures.
- For a daily-wage worker the choice is blunt: work through the afternoon and risk heatstroke, or stop and lose the day's pay.

**The gap.** The health ministry's public advisory says to avoid the sun "between 12:00 noon and 03:00 pm" and to move strenuous work to "morning and evening hours". That is the same sentence for a street vendor in Pune and a brick moulder in Banda, on a mild day and on a lethal one. It ignores humidity, it ignores how heavy the work is, and it does not say which hours are left to earn in. Heat warnings are issued by district and by air temperature. Nobody hands a worker a schedule.

## What it does

1. **Observes.** Reads the hourly forecast for the place (Open-Meteo, free, no key).
2. **Judges.** Computes the Wet Bulb Globe Temperature for each hour, the heat stress index used in occupational health (ISO 7243), from temperature, humidity, wind and sunshine. Then it applies the ACGIH heat stress screening limits for the chosen workload. Each hour becomes one of five levels: work as usual, rest 15, rest 30, rest 45, stop.
3. **Plans.** Searches every way to place one or two work blocks between 5 am and 8 pm and keeps the plan that gets closest to a full day's work with the least time in heat, at hours as close to a normal day as the heat allows. It never schedules an hour where only 15 minutes of work is allowed. If a full day is not possible safely, it says how many hours are, and says not to push for more.
4. **Hands over.** One message in Hindi, English, Marathi, Bengali, Tamil, Telugu or Gujarati, with a listen button and a WhatsApp button.

Other details:

- A 24-hour dial with noon at the top shows the whole day at a glance.
- "New to this work, or back after a week away" switches to the stricter limits for people who are not used to the heat.
- A side-by-side strip shows what a normal 9 to 5 shift would mean on the same day.
- A "hot day" tab replays the real weather of 20 May 2026 for the chosen place, so the tool can be judged outside the heat season.
- No account, no cookies, no personal data, no paid API. About 80 KB, no build step, no dependencies.

## Proof: a backtest on the real summer of 2026

Field users cannot be shown in November, so the claim is tested on records instead.

For every day from 1 April to 30 June 2026, in 20 places, the agent planned the day from the forecast **as it was issued the day before**, and that plan was scored against the weather that **actually happened** (ERA5). A fixed 9 to 5 shift was scored against the same actual weather. The planner and heat index in the test are the same files the app runs.

Construction, farm labour and brick kiln work, 1,820 place-days:

| | 9 am to 5 pm shift | Dhoop Ghadi plan |
| --- | --- | --- |
| Hours on site in severe heat, per worker, April to June | 528 | 36 |
| Change | | 93% fewer |
| Safe work per day | 1.8 h | 4.1 h |
| Planned hours where the forecast was too mild | | 13% |

A severe-heat hour is one where the limits allow at most 15 minutes of that work, or none.

The same pattern holds for other work: loading and carrying 605 to 41 hours, delivery and sanitation 424 to 37, street vending 183 to 21.

Honest limits of this evidence:

- It is a test on weather records, not a field trial. No worker has yet been measured using Dhoop Ghadi, and no usage is claimed.
- ERA5 is a gridded reconstruction. A real site on concrete or near a kiln can be hotter than its grid cell.
- The limits are a cautious screening table (see below). On 70% of these summer days, a full day of heavy work (six hours of actual work, the most an eight-hour shift allows even on a cool day) could not be done safely at any hours. The tool says so plainly instead of stretching the day.
- The plan assumes the worker can move their hours. Many cannot without the employer agreeing, which is why the output is built to be forwarded.

Repeat it yourself:

```bash
npm run backtest
```

## Run it

Needs Node 20 or newer. There is nothing to install.

```bash
npm test
```

```bash
npm run serve
```

Then open http://localhost:4173. The site is plain static files, so any static host works.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `styles.css`, `src/app.js` | The one-screen app |
| `src/wbgt.js` | Heat index: WBGT from weather variables |
| `src/thresholds.js` | ACGIH limits by workload |
| `src/planner.js` | Hour levels, day planner, shift comparison, plan verification |
| `src/summary.js`, `src/i18n.js` | The message and its seven languages |
| `src/data.js`, `src/cities.js` | Open-Meteo access with a fallback host, preset places |
| `backtest/run.js`, `backtest/results.json` | The summer 2026 backtest and its output |
| `impact.html`, `method.html` | Evidence and method pages |
| `test/` | 17 tests (`node --test`) |
| `docs/AGENTFOUNDRY.md` | AgentFoundry log (what was done in the hackathon's IDE) |

## Method and sources

- ISO 7243:2017. WBGT = 0.7 × natural wet-bulb + 0.2 × globe + 0.1 × air temperature (outdoors, in sun).
- Globe and natural wet-bulb temperature: the model of [Liljegren et al. (2008)](https://doi.org/10.1080/15459620802310770), the reference method for deriving WBGT from ordinary weather variables. `src/wbgt.js` is a JavaScript port of the implementation in [ECMWF thermofeel](https://github.com/ecmwf/thermofeel) (Apache Licence 2.0). The port reproduces thermofeel's published test values to within 0.001°C (in the test suite), and matched the original on 16,128 further combinations of temperature, humidity, wind and sunshine during development.
- Limits: ACGIH screening criteria for heat stress exposure (TLV and action limit), as reproduced by the Canadian Centre for Occupational Health and Safety from *2026 TLVs and BEIs*. [Table](https://ccohs.ca/oshanswers/phys_agents/heat_control.html). ACGIH describes this table as a screening tool that is more protective than the limits themselves. That makes it the cautious choice for advice to the public, and it is why the safe hours look short.
- Workload classes: construction and agriculture are modelled as heavy work, as in the ILO report (400 W). [OSHA examples](https://www.osha.gov/heat-exposure/hazards).
- Water: one cup every 20 minutes, from the health ministry's [public health advisory on extreme heat](https://ncdc.mohfw.gov.in/uploads/pdf/5.%20Public%20Health%20Advisory_Extreme%20HeatHeatwave.pdf) and NIOSH (one cup every 15 to 20 minutes).
- Weather: [Open-Meteo](https://open-meteo.com) forecast, previous model runs and ERA5 archive.
- Statistics: [World Bank press release](https://www.worldbank.org/en/news/press-release/2022/11/30/a-greener-cooling-pathway-can-create-a-1-6-trillion-investment-opportunity-in-india-says-world-bank-report), [ILO report](https://www.ilo.org/sites/default/files/wcmsp5/groups/public/%40dgreports/%40dcomm/%40publ/documents/publication/wcms_711919.pdf), [Lancet Countdown 2025 coverage](https://www.outlookbusiness.com/planet/climate/india-record-heatwave-days-labour-losses-2024), [HeatWatch 2026 stocktake](https://www.preventionweb.net/news/struck-heat-stocktake-indias-2026-summer).

## Known limits

- Guidance from a forecast. Not a medical device.
- The index is modelled from forecast weather, not measured with a globe thermometer on site.
- The limits assume ordinary work clothes, drinking water at hand and a healthy adult.
- The Hindi, Marathi, Bengali, Tamil, Telugu and Gujarati text has not been reviewed by native speakers. Corrections are welcome. The Gujarati text was drafted by AgentFoundry's SMART-Code assistant and then reviewed and corrected (see `docs/AGENTFOUNDRY.md`).

## Licence

MIT. `src/wbgt.js` contains a port of ECMWF thermofeel's Liljegren solver (Apache Licence 2.0, noted in the file). Weather data by Open-Meteo (CC BY 4.0).
