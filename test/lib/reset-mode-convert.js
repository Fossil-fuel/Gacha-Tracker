"use strict";

/**
 * Pure helpers mirroring src/01-core.js splitAutoHistoryForManualConvert
 * for offline regression without loading the browser bundle.
 */

function getDateStr(d) {
  const x = d instanceof Date ? d : new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function splitAutoHistoryForManualConvert(history, now) {
  const n = now instanceof Date ? now : new Date();
  const nowMs = n.getTime();
  const closed = [];
  let current = null;
  (history || []).forEach((p) => {
    if (!p || !(p.periodStart instanceof Date) || !(p.periodEnd instanceof Date)) return;
    const startMs = p.periodStart.getTime();
    const endMs = p.periodEnd.getTime();
    if (startMs <= nowMs && endMs > nowMs) {
      current = p;
    } else if (endMs <= nowMs) {
      closed.push({
        start: getDateStr(p.periodStart),
        end: getDateStr(p.periodEnd),
        completed: p.completed ? 1 : 0,
      });
    }
  });
  return { closed, current };
}

module.exports = {
  getDateStr,
  splitAutoHistoryForManualConvert,
};
