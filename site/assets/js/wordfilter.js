// Simple word filter shared by the Worker and the site (keep both copies in sync:
// worker/src/wordfilter.js and site/assets/js/wordfilter.js).
// It is a first line of defence; the AI check, Report button and curator hide
// cover what a list can't.
const WORDS = [
  "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "cunt", "bitch", "bastard",
  "asshole", "dick", "cock", "pussy", "whore", "slut", "porn", "nazi", "nigger", "nigga",
  "faggot", "fag", "retard", "kike", "spic", "chink", "tranny", "rape", "rapist", "kys",
];

const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function normalise(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0134557@$!]/g, (c) => LEET[c] || c);
}

/** Returns the first blocked word found, or null. */
export function blockedWord(text) {
  const words = normalise(text).split(/[^a-z]+/).filter(Boolean);
  const set = new Set(WORDS);
  for (const w of words) if (set.has(w)) return w;
  // catch spaced-out spellings like "f u c k"
  const squashed = words.filter((w) => w.length === 1).join("");
  for (const w of WORDS) if (w.length >= 4 && squashed.includes(w)) return w;
  return null;
}
