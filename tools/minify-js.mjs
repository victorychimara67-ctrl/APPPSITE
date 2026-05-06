import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("script.js", "utf8");
const isWord = (ch) => /[A-Za-z0-9_$]/.test(ch || "");
let out = "";
let quote = "";
let escaped = false;

for (let i = 0; i < src.length; i += 1) {
  const ch = src[i];
  if (quote) {
    out += ch;
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === quote) quote = "";
    continue;
  }
  if (ch === "\"" || ch === "'" || ch === "`") {
    quote = ch;
    out += ch;
    continue;
  }
  if (/\s/.test(ch)) {
    const prev = out[out.length - 1];
    let j = i + 1;
    while (j < src.length && /\s/.test(src[j])) j += 1;
    const next = src[j];
    if (isWord(prev) && isWord(next)) out += " ";
    i = j - 1;
    continue;
  }
  out += ch;
}

writeFileSync("script.min.js", `${out.trim()}\n`);
console.log(`script.js ${src.length} bytes -> script.min.js ${out.trim().length} bytes`);
