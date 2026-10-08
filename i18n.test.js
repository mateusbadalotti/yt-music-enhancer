const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const read = file => JSON.parse(readFileSync(join(__dirname, file), "utf8"));
const english = read("_locales/en/messages.json");

test("Every locale translates the complete interface and preserves message placeholders", () => {
  for (const locale of readdirSync(join(__dirname, "_locales"))) {
    const messages = read(`_locales/${locale}/messages.json`);
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(english).sort(), locale);
    for (const [key, entry] of Object.entries(messages)) {
      assert.ok(entry.message.trim(), `${locale}: ${key}`);
      assert.deepEqual(entry.placeholders, english[key].placeholders, `${locale}: ${key}`);
      const placeholders = [...entry.message.matchAll(/\$(\w+)\$/g)].map(match => match[1]).sort();
      assert.deepEqual(placeholders, Object.keys(entry.placeholders ?? {}).sort(), `${locale}: ${key}`);
    }
  }
});

test("Interface and bridge messages resolve in the English fallback", () => {
  for (const file of ["content.js", "bridge.js", "background.js"]) {
    const source = readFileSync(join(__dirname, file), "utf8");
    for (const match of source.matchAll(/(?:\bt|new Error)\("([a-zA-Z]+)"/g)) {
      assert.ok(english[match[1]], `${file}: ${match[1]}`);
    }
  }
  assert.equal(read("manifest.json").default_locale, "en");
  assert.equal(read("manifest.json").description, "__MSG_extensionDescription__");
});

test("All manifest icons point to bundled PNG images", () => {
  for (const path of Object.values(read("manifest.json").icons)) {
    const bytes = readFileSync(join(__dirname, path));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});
