"use strict";

const assert = require("../lib/assert");
const scan = require("../../scripts/extra-scan-parse");

function check(name, fn) {
  try {
    fn();
    return { name, ok: true };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err && err.message ? err.message : String(err),
      actual: err && err.actual,
      expected: err && err.expected,
    };
  }
}

const DETAIL = [
  "<h2>Spooky Funhouse Tales Event Information</h2>",
  "<table><tr><th>Event Start</th><td><span>October 22, 2026</span></td></tr>",
  "<tr><th>Event End</th><td><span>November 30, 2026</span></td></tr></table>",
].join("");

const SCHEDULE = [
  "<h2>Zenless Zone Zero Ongoing Event Schedule</h2>",
  "<table><tr><th>Event</th><th>Duration</th></tr>",
  "<tr><td><a href='/games/Zenless-Zone-Zero/archives/618093'>Angels Support Operation</a></td>",
  "<th>Start</th><td>September 9, 2026</td></tr>",
  "<tr><th>End</th><td>November 30, 2026</td></tr></table>",
  "<h2>List of All Upcoming Events</h2>",
  "<table><tr><td><a href='https://game8.co/games/Zenless-Zone-Zero/archives/630803'>Spooky Funhouse Tales</a></td>",
  "<th>Start</th><td>October 22, 2026</td></tr>",
  "<tr><th>End</th><td>November 30, 2026</td></tr>",
  "<tr><td><a href='/games/Zenless-Zone-Zero/archives/631039'>Cyber Miracle Healer, On Duty!</a></td>",
  "<th>Start</th><td>October 28, 2026</td></tr>",
  "<tr><th>End</th><td>November 16, 2026</td></tr></table>",
  "<h2>Zenless Zone Zero Permanent Events</h2>",
  "<a href='/games/Zenless-Zone-Zero/archives/1'>Road to Proxy Greatness</a>",
  "<h2>Zenless Zone Zero Past Events</h2>",
  "<a href='/games/Zenless-Zone-Zero/archives/2'>Old Festival</a>",
].join("");

module.exports = {
  name: "extra-scan-event-dates",
  title: "Extra scan reads each event page for start and end",
  run() {
    const checks = [];

    checks.push(check("Event page: Event Start and Event End become dates", () => {
      const dates = scan.parseEventDetail(DETAIL);
      assert.equal(dates.startDate, "2026-10-22");
      assert.equal(dates.endDate, "2026-11-30");
      assert.equal(dates.endDateTBD, false);
    }));

    checks.push(check("Event page: start row still counts when an earlier heading is open", () => {
      const html = "<th><div>Guide contents</div><th>Event Start</th><td>September 10, 2026</td></th><tr><th>Event End</th><td>October 19, 2026</td></tr>";
      const dates = scan.parseEventDetail(html);
      assert.equal(dates.startDate, "2026-09-10");
      assert.equal(dates.endDate, "2026-10-19");
    }));

    checks.push(check("Event page: permanent end stays open", () => {
      const dates = scan.parseEventDetail("<tr><th>Event Start</th><td>October 22, 2026</td></tr><tr><th>Event End</th><td>Permanent</td></tr>");
      assert.equal(dates.startDate, "2026-10-22");
      assert.equal(dates.endDate, null);
      assert.equal(dates.sawEnd, true);
    }));

    checks.push(check("Schedule table: End cell stays on that event", () => {
      const parsed = scan.parseGame8Html(SCHEDULE);
      const spooky = parsed.events.find((ev) => ev.title === "Spooky Funhouse Tales");
      const cyber = parsed.events.find((ev) => ev.title === "Cyber Miracle Healer, On Duty!");
      assert.ok(spooky, "spooky listed");
      assert.equal(spooky.startDate, "2026-10-22");
      assert.equal(spooky.endDate, "2026-11-30");
      assert.equal(cyber.startDate, "2026-10-28");
      assert.equal(cyber.endDate, "2026-11-16");
    }));

    checks.push(check("Discovery: ongoing and upcoming event links, not past or permanent", () => {
      const links = scan.discoverEventPages(SCHEDULE, "https://game8.co/games/Zenless-Zone-Zero/archives/457176");
      const titles = links.map((link) => link.title);
      assert.ok(titles.indexOf("Angels Support Operation") >= 0, "ongoing");
      assert.ok(titles.indexOf("Spooky Funhouse Tales") >= 0, "upcoming");
      assert.ok(titles.indexOf("Road to Proxy Greatness") < 0, "permanent skipped");
      assert.ok(titles.indexOf("Old Festival") < 0, "past skipped");
      const spooky = links.find((link) => link.title === "Spooky Funhouse Tales");
      assert.equal(spooky.href, "https://game8.co/games/Zenless-Zone-Zero/archives/630803");
    }));

    checks.push(check("Merge: event page dates override the listing and add a missing event", () => {
      const listing = [
        "<h2>Version 3.2 New Events</h2>",
        "<table><tr><td>Angels Support Operation</td><td>Complete event objectives.</td></tr></table>",
      ].join("");
      const merged = scan.mergeGame8Pages([listing], [
        { title: "Angels Support Operation", html: "<tr><th>Event Start</th><td>September 9, 2026</td></tr><tr><th>Event End</th><td>November 30, 2026</td></tr>" },
        { title: "Spooky Funhouse Tales", html: DETAIL },
      ]);
      const angels = merged.tasks.find((task) => task.label === "Angels Support Operation");
      const spooky = merged.tasks.find((task) => task.label === "Spooky Funhouse Tales");
      assert.ok(angels, "angels kept");
      assert.equal(angels.startDate, "2026-09-09");
      assert.equal(angels.endDate, "2026-11-30");
      assert.equal(angels.endDateTBD, false);
      assert.ok(spooky, "spooky added from its page");
      assert.equal(spooky.startDate, "2026-10-22");
      assert.equal(spooky.endDate, "2026-11-30");
      assert.equal(merged.updateEndDate, "2026-11-30");
    }));

    checks.push(check("Schedule date wins when it is a later cycle than the event page", () => {
      const schedule = [
        "<h2>Upcoming Events</h2><table>",
        "<tr><td>Advanced Bounty - Area Patrol</td><th>Start</th><td>November 4, 2026</td></tr>",
        "<tr><th>End</th><td>November 9, 2026</td></tr></table>",
      ].join("");
      const merged = scan.mergeGame8Pages([schedule], [
        { title: "Advanced Bounty: Area Patrol", startDate: "2026-09-23", endDate: "2026-09-28", sawEnd: true },
      ]);
      const task = merged.tasks.find((item) => /advanced bounty/i.test(item.label));
      assert.equal(task.startDate, "2026-11-04");
      assert.equal(task.endDate, "2026-11-09");
    }));

    checks.push(check("Hub follow-up includes an unquoted events schedule link", () => {
      const hub = "<a href=/games/Zenless-Zone-Zero/archives/457176>All Events and Schedule</a>";
      const links = scan.discoverFollowUps(hub, "https://game8.co/games/Zenless-Zone-Zero");
      assert.ok(links.indexOf("https://game8.co/games/Zenless-Zone-Zero/archives/457176") >= 0);
    }));

    const failed = checks.filter((c) => !c.ok);
    return { ok: failed.length === 0, checks, title: "Extra scan reads each event page for start and end" };
  },
};
