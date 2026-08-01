"use strict";

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    const err = new Error(message || "assert.equal failed");
    err.actual = actual;
    err.expected = expected;
    throw err;
  }
}

function ok(value, message) {
  if (!value) throw new Error(message || "assert.ok failed");
}

function throws(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (_) {
    threw = true;
  }
  if (!threw) throw new Error(message || "assert.throws failed");
}

module.exports = { equal, ok, throws };
