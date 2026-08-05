"use strict";

/**
 * Pure mirror of listExtracurricularTimestampsForTimeTrends skip/include rules
 * (filed ISO → dateStr+hour; skip missing/invalid).
 */
function listExtracurricularTimestampsForTimeTrends(state, opts) {
  const out = [];
  const getParts =
    opts && typeof opts.getDatePartsInTimezone === "function"
      ? opts.getDatePartsInTimezone
      : (d) => ({
          year: d.getFullYear(),
          month: d.getMonth(),
          day: d.getDate(),
          hour: d.getHours(),
          minute: d.getMinutes(),
        });
  const isValidDateStr =
    opts && typeof opts.isValidDateStr === "function"
      ? opts.isValidDateStr
      : (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

  (state.extracurricularTasks || []).forEach((task) => {
    if (!task || !task.id) return;
    if (!state.extracurricularCompleted || !state.extracurricularCompleted[task.id]) return;
    const iso = state.extracurricularCompletedAt && state.extracurricularCompletedAt[task.id];
    if (!iso || typeof iso !== "string") return;
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return;
    const parts = getParts(d);
    const dateStr =
      String(parts.year) +
      "-" +
      String(parts.month + 1).padStart(2, "0") +
      "-" +
      String(parts.day).padStart(2, "0");
    if (!isValidDateStr(dateStr)) return;
    const hour = Number(parts.hour);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return;
    out.push({
      dateStr,
      hour,
      minute: Number.isFinite(Number(parts.minute))
        ? Math.max(0, Math.min(59, Math.round(Number(parts.minute))))
        : 0,
      gameId: task.gameId || "",
      taskType: "extracurricular",
      taskId: task.id,
      taskLabel: task.label || task.id,
    });
  });
  return out;
}

module.exports = { listExtracurricularTimestampsForTimeTrends };
