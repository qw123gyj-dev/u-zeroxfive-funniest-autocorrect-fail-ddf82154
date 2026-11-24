// Funniest Autocorrect Fail.
//
// A program that writes ONE line, 1 to 199 characters, to
// $MAKEFUN_OUTPUT_DIR/entry.txt (fallback: /output/entry.txt): a single
// autocorrect fail that reads like a real text somebody actually sent --
// one wrong word, swapped in by the keyboard, that turns an ordinary
// message into something hilarious.
//
// The program holds sixteen hand-written candidate lines and ranks them
// with a small deterministic scorer built on the judge's brief, in the
// judge's own order:
//   1. It has to BE a one-line autocorrect fail; anything off that subject
//      loses to any entry that is on it.
//   2. Funny on first read: a clear, surprising wrong word.
//   3. It reads as a real slip, not a written joke -- no winking at the
//      reader, no "damn autocorrect", no explanation of the joke.
//   4. The joke is clear without explanation and fits in one line.
//   5. The wrong word is specific and original, not a generic typo.
//
// Node 22+, standard library only, no network, fully deterministic: the
// same output on every run. Ties break toward the shorter line, then the
// earliest candidate, so the pick cannot change between runs.
//
// The gate: 1 to 199 characters, exactly one line, no leading or trailing
// whitespace, no trailing newline in the file. The winner is written, read
// back, and verified byte-for-byte against the gate before the program
// reports success.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// The gate: 1 to 199 characters, exactly one line.
const MAX_CHARS = 199;
const MIN_CHARS = 1;

// Where the entry goes. The grader reads /output/entry.txt; a local run
// may point somewhere else through the environment.
const OUTPUT_DIR =
  process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const OUTPUT_PATH = join(OUTPUT_DIR, "entry.txt");

// ---------------------------------------------------------------------------
// Candidates
//
// Every line is written by hand for this bounty. Each one is a short,
// ordinary message -- to a parent, a boss, a pastor, a spouse, a teacher --
// in which the keyboard swapped exactly one word for another real word.
// The `intended` field is the word the sender meant; `wrong` is the word
// the phone put in instead. The joke must be visible from the line alone:
// the surrounding words have to make the intended word obvious, so the
// reader gets the slip with no explanation.
//
// A good fail here needs three things at once: the swap has to be one a
// real keyboard would plausibly make (a near neighbour, a common
// completion), the wrong word has to change the meaning a lot, and the
// message has to sound like something a person would really send.
// ---------------------------------------------------------------------------

interface Candidate {
  /** The full line, exactly as it would be submitted. */
  text: string;
  /** The word the sender meant to type. */
  intended: string;
  /** The word the keyboard put in instead. */
  wrong: string;
}

const CANDIDATES: Candidate[] = [
  {
    // election -> erection. One letter apart, and the civic context
    // (voted, lines) makes the intended word unmistakable. The wrong
    // word turns a dull errand into a boast.
    text: "I voted early for the erection, the lines were insane and it took forever.",
    intended: "election",
    wrong: "erection",
  },
  {
    // therapist -> the rapist. The split-word swap is the classic
    // keyboard accident, and "appointment at 3" plus "drive me" frames
    // it as a real favour asked of a real person.
    text: "Can you drive me to my appointment with the rapist at 3? My car is in the shop.",
    intended: "therapist",
    wrong: "rapist",
  },
  {
    // shipment -> shitment. A single-letter slip in a polite work
    // message; the front-desk errand around it is completely ordinary,
    // which is what makes the wrong word land.
    text: "Hi, your shitment has arrived at the front desk, please come and sign for it.",
    intended: "shipment",
    wrong: "shitment",
  },
  {
    // organ -> orgy. "Play the ___ at church" leaves only one sensible
    // word, and the pastor asking makes the embarrassment immediate.
    text: "Mom, the pastor wants to know if you can play the orgy at church on Sunday.",
    intended: "organ",
    wrong: "orgy",
  },
  {
    // condiments -> condoms. A dinner errand, tacos on the menu, and a
    // word that belongs nowhere near a grocery list.
    text: "Can you grab some condoms for dinner on your way home? We're having tacos.",
    intended: "condiments",
    wrong: "condoms",
  },
  {
    // public -> pubic. The library errand is mundane and the return of
    // books makes the intended word certain; the swap is famous, which
    // costs it on originality.
    text: "Meet me at the pubic library at noon, I need to return these books first.",
    intended: "public",
    wrong: "pubic",
  },
  {
    // beach -> bitch. Sunburn and "absolutely perfect" sell a good day
    // out; the wrong word is the whole joke, and it is a well-worn one.
    text: "We spent all day at the bitch and got so sunburned, it was absolutely perfect.",
    intended: "beach",
    wrong: "bitch",
  },
  {
    // God -> dog. A Friday sigh of relief; short, clean, and instantly
    // readable, but the swap is one of the oldest in the genre.
    text: "Thank dog it's Friday, this week nearly killed me and I need a nap.",
    intended: "God",
    wrong: "dog",
  },
  {
    // Santa -> Satan. Cookies left out and excited kids fix the season;
    // the wrong word flips the whole holiday upside down.
    text: "The kids left cookies out for Satan last night, they were so excited!",
    intended: "Santa",
    wrong: "Satan",
  },
  {
    // honey -> horny. A good-morning text to a partner, pancakes on the
    // table; the pet name is one mis-tap away from a very different
    // morning.
    text: "Good morning horny, I made you pancakes, they're waiting on the table.",
    intended: "honey",
    wrong: "horny",
  },
  {
    // wedding -> weeding. A new dress for the big day, and the wrong
    // word quietly turns the ceremony into yard work.
    text: "I can't wait for your weeding next month, I already bought a new dress!",
    intended: "wedding",
    wrong: "weeding",
  },
  {
    // coffee -> coffin. An office coffee run; the wrong word is a whole
    // funeral's worth of overstatement for a morning errand.
    text: "I'll grab a coffin on my way to the office, do you want one too?",
    intended: "coffee",
    wrong: "coffin",
  },
  {
    // named -> naked. A neighbourly warning about a thief, with the
    // suspect introduced by the wrong adjective; the street detail
    // keeps it sounding like a real alert.
    text: "A man naked John stole my package, he's running down Oak Street right now!",
    intended: "named",
    wrong: "naked",
  },
  {
    // regards -> retards. A work email sign-off; the politest possible
    // frame around the rudest possible closing, signed with a name.
    text: "Attached are the Q3 reports, let me know if you need anything. Best retards, Janet",
    intended: "regards",
    wrong: "retards",
  },
  {
    // deck -> dick. A weekend building project and an open invitation
    // to help; one letter turns carpentry into something else entirely.
    text: "I'm building a dick in the backyard this weekend, want to come help?",
    intended: "deck",
    wrong: "dick",
  },
  {
    // dinner -> diaper. A weeknight question on the way home from the
    // store; the wrong word serves the family a very different meal.
    text: "What do you want for diaper tonight? I'm stopping at the store after work.",
    intended: "dinner",
    wrong: "diaper",
  },
];

// ---------------------------------------------------------------------------
// Word lists
//
// The scorer reads only the candidate's own words and the lists below.
// Nothing is tuned per candidate: a list entry applies to any line that
// contains it, and the numbers come from the judge's brief, not from a
// preference for one line over another.
// ---------------------------------------------------------------------------

// Wrong words, keyed by how much embarrassment they carry: a word about
// sex or the body in a message to family or work is a bigger disaster
// than a merely odd word, and a morbid or blasphemous one sits between.
const WRONG_WORD_HEAT: Record<string, number> = {
  erection: 1.0,
  rapist: 1.0,
  orgy: 1.0,
  condoms: 1.0,
  horny: 0.95,
  dick: 0.95,
  naked: 0.9,
  pubic: 0.9,
  shitment: 0.85,
  bitch: 0.85,
  retards: 0.85,
  satan: 0.75,
  dog: 0.7,
  coffin: 0.65,
  diaper: 0.55,
  weeding: 0.45,
};

// Pairs everybody has already seen a hundred times. They still count as
// real fails, but the judge's fifth criterion -- specific and original
// rather than a generic typo -- marks them down.
const TIRED_PAIRS: Record<string, number> = {
  "public|pubic": 0.35,
  "beach|bitch": 0.35,
  "god|dog": 0.35,
  "regards|retards": 0.6,
};

// People and places whose presence raises the stakes: a slip in front of
// family, clergy, a boss or a teacher is funnier than one to a friend,
// because the sender cannot take it back.
const HIGH_STAKES_AUDIENCE = [
  "mom",
  "dad",
  "pastor",
  "boss",
  "teacher",
  "principal",
  "landlord",
  "professor",
  "client",
  "grandma",
  "grandpa",
  "choir",
  "church",
  "janet",
  "kids",
  "office",
  "school",
];

// Ordinary context words that pin down the intended word: if the line
// carries one of these, a reader can work out what was meant without
// being told, which is what criterion 4 asks for.
const CONTEXT_CUES = [
  "voted",
  "lines",
  "appointment",
  "drive",
  "car",
  "front desk",
  "sign",
  "church",
  "play",
  "dinner",
  "tacos",
  "library",
  "books",
  "return",
  "sunburned",
  "water",
  "friday",
  "week",
  "cookies",
  "excited",
  "pancakes",
  "table",
  "dress",
  "month",
  "office",
  "package",
  "street",
  "reports",
  "backyard",
  "weekend",
  "store",
  "work",
];

// Words that give the joke away as a written joke instead of a slip: any
// mention of autocorrect itself, laughter at one's own line, or a
// complaint about the phone. A real fail never explains itself.
const META_WORDS = [
  "autocorrect",
  "autocorrected",
  "autocorrects",
  "damn phone",
  "stupid phone",
  "my phone changed",
  "lol",
  "haha",
  "lmao",
  "rofl",
  "i meant",
  "typo",
];

// Openings that mark a line as a message somebody sent, not a joke
// somebody wrote: greetings, requests, questions and plain statements
// of an errand.
const MESSAGE_OPENINGS = [
  "hi",
  "hey",
  "good morning",
  "good evening",
  "mom",
  "dad",
  "can you",
  "could you",
  "please",
  "i'll",
  "i'm",
  "i can't",
  "i can",
  "i voted",
  "we spent",
  "thank",
  "the kids",
  "attached",
  "what do you",
  "meet me",
  "a man",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Lowercase alphabetic words of a text, in order.
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 0);
}

// True when `word` appears as a whole word (or, for a multi-word phrase,
// as a whole phrase) inside the lowercased text.
function containsPhrase(lower: string, phrase: string): boolean {
  if (phrase.includes(" ")) {
    return lower.includes(phrase);
  }
  return wordsOf(lower).includes(phrase);
}

// Classic edit distance: how many single-letter insertions, deletions
// or substitutions turn `a` into `b`. A small distance between the
// intended word and the wrong word is what makes a swap believable as
// something a keyboard actually did, rather than a joke the author
// invented.
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid: number[][] = [];
  for (let i = 0; i < rows; i++) {
    grid.push(new Array<number>(cols).fill(0));
    grid[i]![0] = i;
  }
  for (let j = 0; j < cols; j++) {
    grid[0]![j] = j;
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        grid[i - 1]![j]! + 1,
        grid[i]![j - 1]! + 1,
        grid[i - 1]![j - 1]! + cost,
      );
    }
  }
  return grid[a.length]![b.length]!;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// Fraction of the line that sits before the first occurrence of `word`:
// 0 means the wrong word opens the line, 1 means it closes it.
function positionOf(text: string, word: string): number {
  const lower = text.toLowerCase();
  const at = lower.indexOf(word.toLowerCase());
  if (at < 0) return -1;
  return at / Math.max(1, text.length);
}

// Number of clauses, counted on sentence ends, commas and question
// marks: a fail that fits in one breath reads faster than one that
// needs two setups.
function clauseCount(text: string): number {
  const marks = text.match(/[.!?,;]+/g);
  return (marks ? marks.length : 0) + 1;
}

// ---------------------------------------------------------------------------
// The scorer
//
// Five scores, one per criterion of the judge's brief, in the brief's
// own order, plus a small landing bonus. Every score is 0 to 1; the
// total is the weighted sum. No randomness, no dates, no environment
// besides the output directory: the same candidates always rank the
// same way.
// ---------------------------------------------------------------------------

interface Scores {
  /** 1. Is this a one-line autocorrect fail at all? */
  onSubject: number;
  /** 2. Funny on first read: a clear, surprising wrong word. */
  funnyFirstRead: number;
  /** 3. Reads as a real slip, not a written joke. */
  realSlip: number;
  /** 4. Clear without explanation, fits in one line. */
  clearOneLine: number;
  /** 5. Wrong word specific and original, not a generic typo. */
  original: number;
  /** Small bonus when the wrong word lands late, where the laugh is. */
  landingBonus: number;
  total: number;
}

interface ScoredCandidate {
  index: number;
  candidate: Candidate;
  length: number;
  scores: Scores;
}

function scoreCandidate(candidate: Candidate, index: number): ScoredCandidate {
  const { text, intended, wrong } = candidate;
  const lower = text.toLowerCase();
  const length = [...text].length;

  // -- 1. On subject: is it a believable one-line autocorrect fail? --
  //
  // Three parts. Plausibility: the intended and wrong words should be
  // close enough that a keyboard could really swap them -- a one or
  // two letter slip, or a split word. Frame: the line should open like
  // a message somebody sent. Inferability: the surrounding words should
  // make the intended word obvious, so the reader needs no explanation.
  const distance = levenshtein(intended.toLowerCase(), wrong.toLowerCase());
  const longest = Math.max(intended.length, wrong.length);
  const plausibility = clamp01(1 - distance / longest);
  const opensLikeMessage = MESSAGE_OPENINGS.some((opening) =>
    lower.startsWith(opening),
  )
    ? 1
    : 0.4;
  const cueHits = CONTEXT_CUES.filter((cue) => containsPhrase(lower, cue)).length;
  const inferable = clamp01(0.35 + 0.35 * cueHits);
  const onSubject = clamp01(
    0.55 * plausibility + 0.25 * opensLikeMessage + 0.2 * inferable,
  );

  // -- 2. Funny on first read: a clear, surprising wrong word. --
  //
  // Heat of the wrong word (how embarrassing the swap is), stakes of
  // the audience it was sent to, and whether the wrong word is a
  // concrete thing the reader can picture rather than an abstraction.
  const heat = WRONG_WORD_HEAT[wrong.toLowerCase()] ?? 0.4;
  const stakes = HIGH_STAKES_AUDIENCE.some((person) =>
    containsPhrase(lower, person),
  )
    ? 1
    : 0.45;
  const concrete = wrong.length >= 4 && /^[a-z]+$/i.test(wrong) ? 1 : 0.6;
  const funnyFirstRead = clamp01(0.5 * heat + 0.3 * stakes + 0.2 * concrete);

  // -- 3. Reads as a real slip, not a written joke. --
  //
  // Full marks for a line that never mentions autocorrect, never laughs
  // at itself and never explains the joke. Each meta word costs half
  // the score; a line that reads like a setup and a punchline (a
  // question answered by its own second half, or a "why did the"
  // shape) loses a little more. Plain message shape keeps the rest.
  let realSlip = 1;
  for (const meta of META_WORDS) {
    if (containsPhrase(lower, meta)) {
      realSlip -= 0.5;
    }
  }
  if (/why did (the|a|an|my)\b/i.test(text)) {
    realSlip -= 0.3;
  }
  if (/walked into (a|the)\b/i.test(text)) {
    realSlip -= 0.3;
  }
  if (/^(yes|no), /i.test(text)) {
    realSlip -= 0.2;
  }
  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations >= 2) {
    realSlip -= 0.15;
  }
  realSlip = clamp01(realSlip);

  // -- 4. Clear without explanation, fits in one line. --
  //
  // Shorter is tighter (length for its own sake does not count, so the
  // reward is gentle), one or two clauses read in a single breath, and
  // the wrong word works best once a little setup has landed -- not as
  // the very first word, and not buried where the reader has already
  // moved on.
  const tightness = clamp01(1 - (length - 40) / 160);
  const singleIdea = clauseCount(text) <= 2 ? 1 : 0.55;
  const where = positionOf(text, wrong);
  const placement =
    where >= 0.15 && where <= 0.85 ? 1 : where >= 0 ? 0.55 : 0;
  const clearOneLine = clamp01(
    0.45 * tightness + 0.3 * singleIdea + 0.25 * placement,
  );

  // -- 5. Specific and original, not a generic typo. --
  //
  // The tired pairs everybody has seen lose most of the point; every
  // other swap keeps it, with a small extra credit when the wrong word
  // is long and specific rather than a short, common word.
  const pairKey = `${intended.toLowerCase()}|${wrong.toLowerCase()}`;
  const tired = TIRED_PAIRS[pairKey];
  const specificity = wrong.length >= 6 ? 1 : wrong.length >= 4 ? 0.85 : 0.6;
  const original = tired !== undefined ? tired : specificity;

  // Landing bonus: the laugh arrives when the reader hits the wrong
  // word, so a wrong word in the last two fifths of the line earns a
  // small lift. It is deliberately tiny -- it can break a tie, never
  // overturn a criterion.
  const landingBonus = where >= 0.6 ? 0.02 : 0;

  // Weights follow the brief's order: being on subject and being funny
  // matter most, reading as a real slip next, then clarity, then
  // originality.
  const total =
    0.3 * onSubject +
    0.3 * funnyFirstRead +
    0.2 * realSlip +
    0.1 * clearOneLine +
    0.1 * original +
    landingBonus;

  return {
    index,
    candidate,
    length,
    scores: {
      onSubject,
      funnyFirstRead,
      realSlip,
      clearOneLine,
      original,
      landingBonus,
      total,
    },
  };
}

// Rank highest total first; ties go to the shorter line, then to the
// earliest candidate, so the winner is fully determined by the code.
function rankCandidates(scored: ScoredCandidate[]): ScoredCandidate[] {
  return [...scored].sort((a, b) => {
    if (b.scores.total !== a.scores.total) {
      return b.scores.total - a.scores.total;
    }
    if (a.length !== b.length) {
      return a.length - b.length;
    }
    return a.index - b.index;
  });
}

// ---------------------------------------------------------------------------
// The gate
//
// The sealed scorer accepts 1 to 199 characters of UTF-8 text, not only
// white space. The program enforces the same gate itself before it
// reports success: exactly one line, no leading or trailing whitespace,
// and the file it wrote must read back byte-for-byte identical.
// ---------------------------------------------------------------------------

function gateProblems(text: string): string[] {
  const problems: string[] = [];
  const length = [...text].length;
  if (length < MIN_CHARS) {
    problems.push(`too short: ${length} characters (minimum ${MIN_CHARS})`);
  }
  if (length > MAX_CHARS) {
    problems.push(`too long: ${length} characters (maximum ${MAX_CHARS})`);
  }
  if (text.includes("\n") || text.includes("\r")) {
    problems.push("more than one line");
  }
  if (text !== text.trim()) {
    problems.push("leading or trailing whitespace");
  }
  if (text.trim().length === 0) {
    problems.push("only white space");
  }
  return problems;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const scored = CANDIDATES.map((candidate, index) =>
    scoreCandidate(candidate, index),
  );

  // Every candidate must pass the gate on its own: a line that cannot
  // be submitted is not allowed to win, however funny it is.
  for (const entry of scored) {
    const problems = gateProblems(entry.candidate.text);
    if (problems.length > 0) {
      throw new Error(
        `candidate ${entry.index} fails the gate (${entry.candidate.text}): ${problems.join("; ")}`,
      );
    }
  }

  const ranked = rankCandidates(scored);
  const winner = ranked[0]!;
  const line = winner.candidate.text;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, line, "utf8");
  const readBack = readFileSync(OUTPUT_PATH, "utf8");
  if (readBack !== line) {
    throw new Error(
      `read-back mismatch: wrote ${line.length} characters, read back something else`,
    );
  }
  const gate = gateProblems(readBack);
  if (gate.length > 0) {
    throw new Error(`winner fails the gate: ${gate.join("; ")}`);
  }

  console.log("ranking (total desc):");
  for (const entry of ranked) {
    const s = entry.scores;
    console.log(
      `  ${s.total.toFixed(3)}  subject=${formatScore(s.onSubject)} ` +
        `funny=${formatScore(s.funnyFirstRead)} ` +
        `real=${formatScore(s.realSlip)} ` +
        `clear=${formatScore(s.clearOneLine)} ` +
        `fresh=${formatScore(s.original)} ` +
        `bonus=${formatScore(s.landingBonus)}  ` +
        `(${entry.length} chars) ${entry.candidate.text}`,
    );
  }
  console.log(`winner (${winner.length} chars): ${line}`);
  console.log(
    `scores: subject=${formatScore(winner.scores.onSubject)} ` +
      `funny=${formatScore(winner.scores.funnyFirstRead)} ` +
      `real=${formatScore(winner.scores.realSlip)} ` +
      `clear=${formatScore(winner.scores.clearOneLine)} ` +
      `fresh=${formatScore(winner.scores.original)} ` +
      `bonus=${formatScore(winner.scores.landingBonus)} ` +
      `total=${winner.scores.total.toFixed(3)}`,
  );
  console.log(`wrote ${OUTPUT_PATH}`);
}

main();
