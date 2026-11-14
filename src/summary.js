// Turns a plan into the sentences shown on the card, read aloud and shared.

import { t, sayRange } from './i18n.js';

function trimHours(minutes) {
  const h = Math.round((minutes / 60) * 2) / 2;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

/**
 * plan: result of planDay. usual: result of assessShift for 9 to 17.
 * Returns { kind, headline, rest, rule, usual, lines }.
 */
export function describe(lang, plan, usual) {
  const out = { kind: 'plan', headline: '', rest: '', rule: '', usual: '', lines: [] };

  if (!plan.blocks.length) {
    out.kind = 'stop';
    out.headline = t(lang, 'stop');
  } else if (plan.reached && usual.overLimitHours === 0) {
    out.kind = 'safe';
    out.headline = t(lang, 'allSafe');
  } else {
    const blocks = plan.blocks.map(([s, e]) => sayRange(lang, s, e)).join(t(lang, 'and'));
    out.headline = t(lang, 'workAt', { blocks });
    if (plan.blocks.length === 2) {
      const range = sayRange(lang, plan.blocks[0][1], plan.blocks[1][0]);
      out.rest = t(lang, 'restAt', { range });
    }
    if (!plan.reached) {
      out.kind = 'short';
      out.short = t(lang, 'short', { h: trimHours(plan.workMin) });
    }
  }

  if (plan.blocks.length) {
    let worst = 0;
    if (out.kind === 'safe') {
      for (const h of usual.hours) worst = Math.max(worst, h.level);
    } else {
      for (const [s, e] of plan.blocks) {
        for (let hr = s; hr < e; hr++) worst = Math.max(worst, plan.hours[hr].level);
      }
    }
    out.worstLevel = worst;
    out.rule = t(lang, `rule${worst}`);

    // When the planned hours differ in level, say which rule holds when.
    if (out.kind !== 'safe') {
      const runs = [];
      for (const [s, e] of plan.blocks) {
        for (let hr = s; hr < e; hr++) {
          const level = plan.hours[hr].level;
          const last = runs[runs.length - 1];
          if (last && last.level === level && last.end === hr) last.end = hr + 1;
          else runs.push({ level, start: hr, end: hr + 1 });
        }
      }
      if (new Set(runs.map((r) => r.level)).size > 1) {
        out.rule = runs.map((r) => `${sayRange(lang, r.start, r.end)}: ${t(lang, `rule${r.level}`)}`).join('\n');
      }
    }
  }

  out.usual =
    usual.overLimitHours === 0
      ? t(lang, 'usualOk')
      : t(lang, 'usualBad', { n: usual.overLimitHours, s: usual.severeHours });

  out.lines = [out.headline, out.rest, out.short, ...(out.rule ? out.rule.split('\n') : []), plan.blocks.length ? t(lang, 'water') : '']
    .filter(Boolean);
  return out;
}

/** Plain text for WhatsApp. */
export function shareText(lang, placeName, dayLabel, workLabel, summary, url) {
  return [
    `${t(lang, 'name')}: ${placeName}, ${dayLabel} (${workLabel})`,
    ...summary.lines,
    t(lang, 'danger'),
    url,
  ].join('\n');
}
