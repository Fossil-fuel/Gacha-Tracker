"use strict";

/**
 * Turn Game8 article HTML into extracurricular story/event proposals.
 * Multiple pages are merged by label. Existing tasks are not touched here.
 */

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const SKIP_EVENT = /gift of odyssey|planar fissure|garden of plenty|aptitude showcase|redeem code|web event|sign-?in|login event|beginner event|authority level|protocol reconnection|operator progression|headhunting/i;

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(s) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function toIso(y, m, d) {
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

function parseOneDate(s) {
  const slash = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return toIso(Number(slash[3]), Number(slash[1]), Number(slash[2]));
  const named = String(s || "").match(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  if (!month) return null;
  return toIso(Number(named[3]), month, Number(named[2]));
}

function parseRange(s, fallbackYear) {
  const text = String(s || "");
  const slash = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (slash) return { start: parseOneDate(slash[1]), end: parseOneDate(slash[2]) };
  const short = text.match(/(\d{1,2})\/(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?!\s*\/)/);
  if (short) {
    const year = fallbackYear || new Date().getUTCFullYear();
    const sm = Number(short[1]);
    const sd = Number(short[2]);
    const em = Number(short[3]);
    const ed = Number(short[4]);
    const endYear = em < sm ? year + 1 : year;
    return { start: toIso(year, sm, sd), end: toIso(endYear, em, ed) };
  }
  const named = [...text.matchAll(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)];
  if (named.length >= 2) {
    return { start: parseOneDate(named[0][0]), end: parseOneDate(named[1][0]) };
  }
  if (named.length === 1) return { start: parseOneDate(named[0][0]), end: null };
  return { start: null, end: null };
}

function cmpVer(a, b) {
  const pa = String(a || "0").split(".").map((n) => Number(n) || 0);
  const pb = String(b || "0").split(".").map((n) => Number(n) || 0);
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  return (pa[1] || 0) - (pb[1] || 0);
}

function normLabel(s) {
  return String(s || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s*\(version\s+\d+\.\d+\)\s*/ig, " ")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function versionIn(text) {
  const m = String(text || "").match(/\b(\d+\.\d+)\b/);
  return m ? m[1] : "";
}

function isGenericHeading(text) {
  return /^(all |list of |other |find your |new and upcoming|popular guides|related guides|comment|author|premium|rankings|gaming news)/i.test(text)
    || /tier list|redeem code|countdown|patch note|giveaway|content overview|content highlight|release time|release date|release summary|special announcement|banners?$|convene/i.test(text)
    || text.length > 140;
}

function classifyHeading(text) {
  const h = text.toLowerCase();
    if (/rerun|light cone|w-engine|weapon|relic|boss|cosmetic|outfit|gear set|echo|bangboo|drive disc|\bmaps?\b|enhancement/.test(h)) return "skip";
  if (/permanent event|past event|beginner|web event/.test(h)) return "skip";
  if (/event/.test(h)) return "event";
  if (/(mission|quest|story|chapter)/.test(h) && !/mission item|daily quest|hidden quest|side quest|tutorial|exploration quest|commission list|quest items/.test(h)) {
    return "story";
  }
  if (/(character|agent|resonator|operator)/.test(h) && !/list|unreleased|non-playable|rerun/.test(h)) return "character";
  if (/released|is out|out now|release day/.test(h) || /^version\s+\d+\.\d+/.test(h)) return "meta";
  return "other";
}

function headingIsTask(text, kind) {
  if (!text || text.length > 90) return false;
  if ((kind === "character" ? text.length < 2 : text.length < 4)) return false;
  if (isGenericHeading(text)) return false;
  if (/guides?$|walkthrough|tier list|redeem|banner$|schedule$|calendar$/i.test(text)) return false;
  if (/^(main|side|daily|hidden|exploration|tutorial|companion|adventure|operator side|all|new) (quests?|missions?|events?|characters?)$/i.test(text)) return false;
  if (/^(reach|unlocked|log in|login|complete|during|after completing|available|requirement)\b/i.test(text)) return false;
  if (/\b(20\d{2})\b/.test(text) && /\d{1,2},/.test(text)) return false;
  if (/^version\s+\d+\.\d+/i.test(text) && /mission|quest|event|character|banner|map|relic/i.test(text)) return false;
  if (/(quests?|missions?)$/i.test(text) && !/[-–:]|\bmain\b|\bchapter\b|\boperator\b/i.test(text)) return false;
  if (kind === "event" && /^(go to|help |help out|participate|continue to|play |raise |visit the)\b/i.test(text)) return false;
  if (kind === "event" && text.split(" ").length > 12) return false;
  if (kind === "story" && /^(new )?(missions?|quests?|stories)$/i.test(text)) return false;
  if (kind === "event" && /events?$|schedule|calendar|summary/i.test(text)) return false;
  if (kind === "character" && /characters?$|operators?$|agents?$|resonators?$|choice$/i.test(text)) return false;
  return true;
}

function cleanCharacterName(name) {
  return String(name || "")
    .replace(/\s+new$/i, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCharacters(text) {
  const raw = String(text || "")
    .replace(/^confirmed release\s*[-–:]\s*/i, "")
    .replace(/\s+for version\s+\d+\.\d+.*$/i, "")
    .replace(/\s+releases? in\s+.+$/i, "")
    .replace(/\s+banner.*$/i, "")
    .trim();
  if (!raw || /rerun|banner|phase \d/i.test(text) && / and /i.test(raw) === false && raw.split(" ").length > 5) {
    // keep going for "A and B"
  }
  if (/rerun/i.test(text)) return [];
  const parts = raw.split(/\s*(?:,|&| and )\s*/i).map((p) => p.trim()).filter((p) => p && p.length <= 40 && !/version|phase|banner|rerun/i.test(p));
  return parts.slice(0, 2);
}

function phaseCharacter(text) {
  const m = String(text || "").match(/^(.{2,40}?)\s+(?:releases?|banner)\s+.*phase\s+(\d+)/i);
  if (!m) return null;
  if (/rerun/i.test(text)) return null;
  const name = m[1].replace(/^confirmed release\s*[-–]\s*/i, "").trim();
  if (!name || /version|banner/i.test(name)) return null;
  return { name, phase: Number(m[2]) || 1 };
}

function articleHtml(html) {
  const raw = String(html || "");
  const start = raw.search(/p-archiveContent__main/);
  if (start < 0) return raw;
  const endMark = raw.slice(start).search(/p-archiveContent__footer|id=["']comments|class=["'][^"']*comment/i);
  if (endMark > 0) return raw.slice(start, start + endMark);
  return raw.slice(start);
}

function htmlChunks(html) {
  const cleaned = articleHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const re = /<(h2|h3|td|th|li|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const chunks = [];
  let m;
  while ((m = re.exec(cleaned))) {
    const text = cleanText(m[2]);
    if (text) chunks.push({ tag: m[1].toLowerCase(), text });
  }
  return chunks;
}

function parseGame8Html(html) {
  const chunks = htmlChunks(html);
  const plain = chunks.map((c) => c.text).join("\n");
  let pageVersion = "";
  let releasedOn = null;
  const releases = [];
  const releasedVersions = new Set();
  const relRe = /version\s+(\d+\.\d+)[^\n]{0,60}?(released|is out|out now)/gi;
  let rm;
  while ((rm = relRe.exec(plain))) releasedVersions.add(rm[1]);
  const dayRe = /(\d+\.\d+)\s+release day on\s+([A-Za-z.]+\s+\d{1,2},?\s+\d{4})/gi;
  while ((rm = dayRe.exec(plain))) {
    releasedVersions.add(rm[1]);
    if (!releasedOn) releasedOn = parseOneDate(rm[2]);
  }
  const verDateRe = /version\s+(\d+\.\d+)[\s\S]{0,50}?released on\s+([A-Za-z.]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{4})/gi;
  while ((rm = verDateRe.exec(plain))) {
    const date = parseOneDate(rm[2]);
    if (!date) continue;
    releasedVersions.add(rm[1]);
    releases.push({ version: rm[1], date });
    if (!releasedOn) releasedOn = date;
  }
  if (releasedVersions.size) {
    pageVersion = [...releasedVersions].sort(cmpVer).pop();
  } else {
    const any = plain.match(/\bversion\s+(\d+\.\d+)\b/i);
    if (any) pageVersion = any[1];
  }

  let section = "other";
  let sectionVersion = pageVersion;
  const stories = [];
  const events = [];
  const characters = [];
  let lastEvent = null;
  let pendingRange = null;
  const fallbackYear = releasedOn ? Number(String(releasedOn).slice(0, 4)) : new Date().getUTCFullYear();

  function isChromeHeading(text) {
    return /guides?\b|tier list|tips and tricks|\bnews\b|walkthrough|achievement|troph(y|ies)|redeem code/i.test(text);
  }

  function isColumnHeader(text) {
    return /^(events?|quests?|missions?|dates?|duration|name|operator|agent|character|description|requirements?|phase \d+|event date|event duration|event description|date and summary|start|end)$/i.test(text);
  }

  function isCurrentSection(text) {
    if (isChromeHeading(text)) return false;
    if (/new (missions?|quests?|events?|characters?|agents?|resonators?|operators?)/i.test(text)) return true;
    if (/(current|featured|ongoing|upcoming) events?\b/i.test(text)) return true;
    if (/^(featured|ongoing|upcoming|current)\b/i.test(text)) return true;
    if (pageVersion && text.indexOf(pageVersion) !== -1 && /(quests?|missions?|events?|characters?|agents?|resonators?|operators?)\b/i.test(text)) return true;
    return false;
  }

  function rememberCharacter(name, phase) {
    const clean = cleanCharacterName(name);
    if (!clean || clean.split(" ").length > 3) return;
    if (/build|guide|choose|trial|simulator|project|skin|news|tips|explained|location|banner|list|comp/i.test(clean)) return;
    characters.push({ name: clean, phase: phase || characters.length + 1 });
  }

  function pushEvent(title, extra) {
    const split = parseRange(title, fallbackYear);
    const held = !split.start && pendingRange ? pendingRange : null;
    if (held) pendingRange = null;
    const name = (split.start ? title.replace(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/, "") : title).replace(/\s+/g, " ").trim().replace(/^(.+?)(?:\s+\1)+$/, "$1");
    if (!headingIsTask(name, "event")) return;
    if (/permanent/i.test(title)) return;
    const range = extra || (split.start ? split : held) || split;
    const item = {
      kind: "EVENT",
      title: name,
      version: sectionVersion || pageVersion,
      startDate: range.start || null,
      endDate: range.end || null,
      endDateTBD: !range.end,
      note: (held && held.note) || "",
      checked: !SKIP_EVENT.test(name),
    };
    events.push(item);
    lastEvent = item;
  }

  chunks.forEach((chunk) => {
    const text = chunk.text;
    if (chunk.tag === "h2" || chunk.tag === "h3" || chunk.tag === "th") {
      const named = text.match(/(?:released on|releases on)\s+(.+)$/i);
      if (named) {
        const d = parseOneDate(named[1]);
        if (d && (!releasedOn || d < releasedOn)) releasedOn = d;
      }
      if (isCurrentSection(text)) {
        const next = classifyHeading(text);
        if (next === "story" || next === "event" || next === "character") section = next;
        else if (/event/i.test(text)) section = "event";
        else if (/quest|mission|chapter|story/i.test(text)) section = "story";
        else if (/character|agent|resonator|operator/i.test(text)) section = "character";
        else if (/^(featured|ongoing|upcoming|current)\b/i.test(text)) section = "event";
        else section = "other";
        const headerVersion = versionIn(text);
        if (headerVersion && text.indexOf(headerVersion) !== -1 && /version|new |current|featured|ongoing|upcoming/i.test(text)) {
          sectionVersion = headerVersion;
        }
        return;
      }
      if (!isColumnHeader(text) && (chunk.tag === "h2" || chunk.tag === "h3" || chunk.tag === "th" || isChromeHeading(text))) {
        section = "other";
      }
      return;
    }
    if (section === "skip" || section === "other" || section === "meta") return;
    if (section === "character") {
      const phased = phaseCharacter(text);
      if (phased) rememberCharacter(phased.name, phased.phase);
      else if (headingIsTask(text, "character") && text.split(" ").length <= 3) {
        splitCharacters(text).forEach((name, i) => rememberCharacter(name, characters.length + i + 1));
      }
      return;
    }
    const leadingDate = /^(?:\d{1,2}\/\d{1,2}(?:\/\d{4})?|[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})\b/.test(text);
    if (leadingDate || /^end of\b/i.test(text) || /^permanent\b/i.test(text)) {
      if (section === "event") {
        if (lastEvent && /^permanent\b|^end of\b/i.test(text)) {
          lastEvent.endDate = null;
          lastEvent.endDateTBD = true;
        } else {
          const range = parseRange(text, fallbackYear);
          const note = eventNoteFromCell(text);
          if (range.start && lastEvent && !lastEvent.startDate) {
            lastEvent.startDate = range.start;
            if (range.end) {
              lastEvent.endDate = range.end;
              lastEvent.endDateTBD = false;
            }
            if (note) lastEvent.note = note;
          } else if (range.start) {
            pendingRange = range;
            if (note) pendingRange.note = note;
          }
        }
      }
      return;
    }
    if (chunk.tag === "p") return;
    if (section === "story" && (chunk.tag === "td" || chunk.tag === "li") && headingIsTask(text, "story")) {
      stories.push({ title: text, version: sectionVersion || pageVersion });
    } else if (section === "event" && (chunk.tag === "td" || chunk.tag === "li") && headingIsTask(text, "event")) {
      pushEvent(text);
    }
  });

  const articlePlain = cleanText(articleHtml(html));
  events.forEach((ev) => {
    ev.definition = definitionFor(articlePlain, ev.title);
  });

  return {
    version: pageVersion,
    releasedOn,
    releases,
    stories,
    events,
    characters,
  };
}

function dedupe(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      return;
    }
    map.set(key, {
      ...prev,
      startDate: prev.startDate || item.startDate || null,
      endDate: prev.endDate || item.endDate || null,
      endDateTBD: prev.endDate || item.endDate ? false : prev.endDateTBD,
      note: (item.note && item.note.length > (prev.note || "").length) ? item.note : (prev.note || item.note || ""),
      definition: (item.definition && item.definition.length > (prev.definition || "").length) ? item.definition : (prev.definition || item.definition || ""),
      checked: prev.checked !== false && item.checked !== false,
    });
  });
  return [...map.values()];
}

function buildTasksFromParsed(pages) {
  const parsed = pages.filter(Boolean);
  const storyPages = parsed.filter((p) => (p.stories || []).length && p.version);
  let version = "";
  if (storyPages.length) {
    storyPages.sort((a, b) => cmpVer(b.version, a.version));
    version = storyPages[0].version;
  } else {
    parsed.forEach((p) => {
      if (p.version && (!version || cmpVer(p.version, version) > 0)) version = p.version;
    });
  }
  let releasedOn = null;
  parsed.forEach((p) => {
    (p.releases || []).forEach((r) => {
      if (version && r.version !== version) return;
      if (!releasedOn || r.date < releasedOn) releasedOn = r.date;
    });
  });
  if (!releasedOn) {
    parsed.forEach((p) => {
      if (version && p.version && p.version !== version) return;
      if (p.releasedOn && (!releasedOn || p.releasedOn < releasedOn)) releasedOn = p.releasedOn;
    });
  }
  const stories = dedupe(
    parsed.flatMap((p) => p.stories || []).filter((s) => !version || !s.version || s.version === version),
    (s) => normLabel(s.title)
  ).filter((s) => storyQuality(s.title) > 0);
  let events = dedupe(
    parsed.flatMap((p) => p.events || []).filter((e) => !version || !e.version || e.version === version),
    (e) => normLabel(e.title)
  );
  const dated = events.filter((e) => e.startDate || e.endDate);
  if (dated.length >= 4 || events.length > 16) events = dated;
  events = events.slice(0, 16);
  const characterPages = parsed
    .map((p) => {
      const seen = new Map();
      (p.characters || []).forEach((c) => {
        const key = normLabel(c.name);
        if (key && !seen.has(key)) seen.set(key, c);
      });
      const hasStory = (p.stories || []).some((s) => !version || !s.version || s.version === version);
      return { version: p.version, list: [...seen.values()], hasStory };
    })
    .filter((p) => p.list.length && (!version || !p.version || p.version === version));
  characterPages.sort((a, b) => Number(b.hasStory) - Number(a.hasStory) || a.list.length - b.list.length || cmpVer(b.version, a.version));
  const characters = characterPages[0] ? characterPages[0].list : [];

  const tasks = [];
  const verPrefix = version ? version + " " : "";
  const storyTitles = [];
  const seenTitles = new Set();
  selectStoryArcs(stories).forEach((story) => {
    const title = chapterTitle(story.title);
    const key = normLabel(title);
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    storyTitles.push(title);
  });
  storyTitles.forEach((title, index) => {
    tasks.push(storyTask(verPrefix, title, storyCharacter(characters, storyTitles.length, index), releasedOn));
  });

  let updateEndDate = null;
  events.forEach((ev) => {
    const start = ev.startDate || releasedOn || null;
    const label = eventLabel(ev.title, version);
    if (!label) return;
    tasks.push({
      kind: "EVENT",
      label,
      startDate: start,
      endDate: ev.endDate,
      endDateTBD: !ev.endDate,
      description: eventDescription(label, ev.definition || ev.note),
      checked: ev.checked !== false,
    });
    if (ev.endDate && (!updateEndDate || ev.endDate > updateEndDate)) updateEndDate = ev.endDate;
  });

  return {
    version,
    releasedOn,
    updateEndDate,
    tasks,
  };
}

function storyQuality(title) {
  const text = String(title || "");
  if (/guide|walkthrough|tier list|redeem|all events|all quests/i.test(text)) return 0;
  if (/^(main|side|daily) (quests?|missions?)$/i.test(text)) return 0;
  let score = 1;
  if (/\b(main mission|main quest|chapter|trailblaze)\b/i.test(text)) score += 3;
  if (text.split(" ").length >= 3) score += 1;
  return score;
}

function eventLabel(title, version) {
  let name = String(title || "")
    .replace(/^◆\s*/, "")
    .replace(/\s*\(version\s+\d+\.\d+\)\s*/ig, " ")
    .replace(/\s+/g, " ")
    .trim();
  name = name.replace(/^\d+\.\d+\s+/, "");
  if (version) name = name.replace(new RegExp("^" + String(version).replace(".", "\\.") + "\\s+", "i"), "");
  return name.trim();
}

function clauseAfter(source, index) {
  const slice = String(source || "").slice(index, index + 280);
  const cut = slice.search(/(?<!\d)\.(?!\d)/);
  return (cut === -1 ? slice : slice.slice(0, cut)).replace(/\s+/g, " ").trim();
}

function definitionFor(plain, title) {
  const name = String(title || "").replace(/^\d+\.\d+\s+/, "").trim();
  if (name.length < 4) return "";
  const source = String(plain || "");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stated = new RegExp("(?:the\\s+\\w+\\s+event\\s+)?" + escaped + "\\s+(?:is|returns|also reruns)\\b", "ig");
  let match;
  while ((match = stated.exec(source))) {
    const clause = clauseAfter(source, match.index);
    if (/event|double|triple|log[\s-]*in|spend|returnee|trial|lottery|minigame/i.test(clause)) return clause;
  }
  const spending = source.match(new RegExp("spending\\s+event\\s+" + escaped, "i"));
  if (spending) return spending[0];
  return "";
}

function eventNoteFromCell(text) {
  let note = String(text || "");
  note = note.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, " ");
  note = note.replace(/\b\d{1,2}\/\d{1,2}\b/g, " ");
  note = note.replace(/\b[A-Za-z]+\.?\s+\d{1,2},?\s+\d{4}\b/g, " ");
  note = note.replace(/\s*[-–]\s*/g, " ");
  note = note.replace(/\s+/g, " ").trim();
  if (/^(log in during|unlocked by|reach\b|unlock\b|meet\b|complete main|available\b)/i.test(note)) return "";
  return note;
}

function eventDescription(title, note) {
  const text = (String(title || "") + " " + String(note || "")).replace(/\s+/g, " ").trim();
  if (/\breturnee\b|returning players|welcome back|come ?back|^back to\b/i.test(text)) return "Returnee event";
  if (/\bspend(ing)?\b|top-?up|recharg/i.test(text)) return "Spending event";
  if (/\btrial$/i.test(String(title || "").trim()) || /aptitude showcase|\b(character|agent|resonator|operator)s?\s+trials?\b|\btrials?\s+(event|stage|mode|combat)\b|\btrial (?:the |a )?(?:new )?(?:character|agent|resonator|operator)\b|\btry(?:ing)? out\b.*\b(character|agent|resonator|operator)\b|\b(character|agent|resonator|operator|banner)\b.*\btrials?\b/i.test(text)) return "Character trial event";
  if (/\b(double|triple|doubled|tripled|2x|3x|x2|x3)\b|\bdrop rate\b|\bdouble drop\b|planar fissure|garden of plenty|gift of odyssey/i.test(text)) return "Reward bonus event";
  if (/sign[\s-]*in|log[\s-]*in based|log[\s-]*in event|log[\s-]*in daily|log[\s-]*in to claim|logging[\s-]*in|login daily|check[\s-]*in|daily reward/i.test(text)) return "Login bonus event";
  return "Gameplay event";
}

function isSeparateStoryPart(title) {
  return /\b(operator mission|main mission|trailblaze mission|trailblaze continuance|companion quest|tales quest|part\s+\d+|interlude)\b/i.test(title);
}

function selectStoryArcs(stories) {
  const list = stories || [];
  if (list.length <= 2) return list;
  const arcs = [list[0]];
  list.slice(1).forEach((story) => {
    if (isSeparateStoryPart(story.title)) arcs.push(story);
  });
  return arcs.slice(0, 2);
}

function chapterTitle(title) {
  let name = String(title || "").replace(/\s+/g, " ").trim();
  [
    /^season\s+\d+\s+chapter\s+\d+\s*[-–:—]\s*/i,
    /^chapter\s+\d+\s*[-–:—]\s*/i,
    /^ch\.?\s*\d+\s+act\s+\d+\s*[-–:—]\s*/i,
    /^act\s+\d+\s*[-–:—]\s*/i,
    /^(tales quest|companion quest|companion story|trailblaze continuance|trailblaze mission)\s*[-–:—]\s*/i,
  ].forEach((re) => {
    name = name.replace(re, "");
  });
  name = name.replace(/\s+(main|operator)\s+missions?$/i, "");
  return name.trim() || String(title || "").trim();
}

function storyCharacter(characters, storyCount, index) {
  const names = (characters || []).map((c) => c.name).filter(Boolean);
  if (!names.length) return "";
  if (storyCount === 1) return names.slice(0, 2).join(", ");
  if (names.length === storyCount) return names[index] || "";
  return names[index] || "";
}

function storyTask(verPrefix, title, character, releasedOn) {
  const base = verPrefix + String(title || "Story").replace(new RegExp("^" + verPrefix.trim() + "\\s+", "i"), "");
  return {
    kind: "STORY",
    label: base.trim(),
    startDate: releasedOn || null,
    endDate: null,
    endDateTBD: true,
    description: character ? "Character: " + character : null,
    checked: true,
  };
}

function mergeGame8Pages(htmlList) {
  const parsed = (htmlList || []).map((html) => parseGame8Html(html));
  return buildTasksFromParsed(parsed);
}

function discoverFollowUps(html, pageUrl) {
  let base;
  try {
    base = new URL(pageUrl);
  } catch (_) {
    return [];
  }
  if (!/^https?:$/i.test(base.protocol)) return [];
  if (!/\/games\/[^/]+\/?$/.test(base.pathname)) return [];
  const gamePath = base.pathname.replace(/\/$/, "");
  const plain = cleanText(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
  const released = new Set();
  const relRe = /version\s+(\d+\.\d+)[^.\n]{0,80}?(released|is out|out now)/gi;
  let rm;
  while ((rm = relRe.exec(plain))) released.add(rm[1]);
  const links = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = cleanText(m[2]);
    if (!text || text.length > 90) continue;
    let href = m[1];
    try {
      href = new URL(href, pageUrl).href;
    } catch (_) {
      continue;
    }
    if (!href.includes("game8.co") || !href.includes(gamePath + "/archives/")) continue;
    const ver = versionIn(text);
    links.push({ href, text, ver });
  }
  const out = [];
  const versionLinks = links.filter((l) => l.ver && (/^version\s+\d+\.\d+$/i.test(l.text) || /update summary|released|is out/i.test(l.text)));
  const preferred = versionLinks.filter((l) => !released.size || released.has(l.ver));
  const pool = preferred.length ? preferred : versionLinks.filter((l) => /update summary|released|is out/i.test(l.text));
  pool.sort((a, b) => cmpVer(b.ver, a.ver));
  if (pool[0]) out.push(pool[0].href);
  const events = links.find((l) => /events?( and|&) schedule|all events|list of events/i.test(l.text));
  if (events) out.push(events.href);
  return out;
}

module.exports = {
  parseGame8Html,
  mergeGame8Pages,
  discoverFollowUps,
  normLabel,
};
