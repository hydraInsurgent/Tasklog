// Feelings wheel dataset for journaling (#79).
//
// Structure: Geoffrey Roberts's 2015 Emotion Wheel (7 cores, 41 secondaries,
// 82 tertiaries, 130 feelings total).
// Levels: David R. Hawkins's Map of Consciousness anchors, assigned to each
// feeling by nearest emotional family.
//
// The wheel structure, the MoC anchor table, and the mapping methodology
// (including deliberate cross-cases such as Proud -> Pride 175 inside the
// Happy sector) are documented and sourced in:
//   docs/research/feelings-wheel-moc.md
//
// Duplicate names (Embarrassed, Disappointed, Inferior, Overwhelmed) are
// genuine in the Roberts wheel; identify feelings by tree path, not by name.

export interface WheelFeeling {
  name: string;
  moc: number; // Hawkins level assigned per research file
  children?: WheelFeeling[]; // tertiary ring
}

export interface WheelCore {
  core: string;
  moc: number;
  color: string; // hex, locked from the approved prototype
  children: WheelFeeling[]; // secondary ring, each with tertiary children
}

export const FEELINGS_WHEEL: WheelCore[] = [
  {
    core: "Happy",
    moc: 540,
    color: "#F2D06B",
    children: [
      {
        name: "Optimistic",
        moc: 310,
        children: [
          { name: "Inspired", moc: 540 },
          { name: "Hopeful", moc: 310 },
        ],
      },
      {
        name: "Trusting",
        moc: 250,
        children: [
          { name: "Intimate", moc: 500 },
          { name: "Sensitive", moc: 250 },
        ],
      },
      {
        name: "Peaceful",
        moc: 600,
        children: [
          { name: "Thankful", moc: 540 },
          { name: "Loving", moc: 500 },
        ],
      },
      {
        name: "Powerful",
        moc: 200,
        children: [
          { name: "Creative", moc: 400 },
          { name: "Courageous", moc: 200 },
        ],
      },
      {
        name: "Accepted",
        moc: 350,
        children: [
          { name: "Valued", moc: 350 },
          { name: "Respected", moc: 350 },
        ],
      },
      {
        name: "Proud",
        moc: 175,
        children: [
          { name: "Confident", moc: 200 },
          { name: "Successful", moc: 175 },
        ],
      },
      {
        name: "Interested",
        moc: 310,
        children: [
          { name: "Inquisitive", moc: 310 },
          { name: "Curious", moc: 310 },
        ],
      },
      {
        name: "Content",
        moc: 350,
        children: [
          { name: "Joyful", moc: 540 },
          { name: "Free", moc: 540 },
        ],
      },
      {
        name: "Playful",
        moc: 540,
        children: [
          { name: "Cheeky", moc: 540 },
          { name: "Aroused", moc: 125 },
        ],
      },
    ],
  },
  {
    core: "Surprised",
    moc: 250,
    color: "#8FC7B4",
    children: [
      {
        name: "Excited",
        moc: 310,
        children: [
          { name: "Energetic", moc: 310 },
          { name: "Eager", moc: 310 },
        ],
      },
      {
        name: "Amazed",
        moc: 540,
        children: [
          { name: "Awe", moc: 540 },
          { name: "Astonished", moc: 250 },
        ],
      },
      {
        name: "Confused",
        moc: 100,
        children: [
          { name: "Perplexed", moc: 100 },
          { name: "Disillusioned", moc: 75 },
        ],
      },
      {
        name: "Startled",
        moc: 100,
        children: [
          { name: "Dismayed", moc: 100 },
          { name: "Shocked", moc: 100 },
        ],
      },
    ],
  },
  {
    core: "Bad",
    moc: 50,
    color: "#B9C0A9",
    children: [
      {
        name: "Tired",
        moc: 50,
        children: [
          { name: "Unfocused", moc: 50 },
          { name: "Sleepy", moc: 50 },
        ],
      },
      {
        name: "Stressed",
        moc: 100,
        children: [
          { name: "Out of control", moc: 100 },
          { name: "Overwhelmed", moc: 100 },
        ],
      },
      {
        name: "Busy",
        moc: 100,
        children: [
          { name: "Rushed", moc: 100 },
          { name: "Pressured", moc: 100 },
        ],
      },
      {
        name: "Bored",
        moc: 50,
        children: [
          { name: "Apathetic", moc: 50 },
          { name: "Indifferent", moc: 50 },
        ],
      },
    ],
  },
  {
    core: "Fearful",
    moc: 100,
    color: "#C9A6D6",
    children: [
      {
        name: "Scared",
        moc: 100,
        children: [
          { name: "Helpless", moc: 50 },
          { name: "Frightened", moc: 100 },
        ],
      },
      {
        name: "Anxious",
        moc: 100,
        children: [
          { name: "Overwhelmed", moc: 100 },
          { name: "Worried", moc: 100 },
        ],
      },
      {
        name: "Insecure",
        moc: 100,
        children: [
          { name: "Inadequate", moc: 20 },
          { name: "Inferior", moc: 20 },
        ],
      },
      {
        name: "Weak",
        moc: 50,
        children: [
          { name: "Worthless", moc: 20 },
          { name: "Insignificant", moc: 20 },
        ],
      },
      {
        name: "Rejected",
        moc: 75,
        children: [
          { name: "Excluded", moc: 75 },
          { name: "Persecuted", moc: 100 },
        ],
      },
      {
        name: "Threatened",
        moc: 100,
        children: [
          { name: "Nervous", moc: 100 },
          { name: "Exposed", moc: 100 },
        ],
      },
    ],
  },
  {
    core: "Angry",
    moc: 150,
    color: "#E08B7B",
    children: [
      {
        name: "Let down",
        moc: 150,
        children: [
          { name: "Betrayed", moc: 150 },
          { name: "Resentful", moc: 150 },
        ],
      },
      {
        name: "Humiliated",
        moc: 20,
        children: [
          { name: "Disrespected", moc: 20 },
          { name: "Ridiculed", moc: 20 },
        ],
      },
      {
        name: "Bitter",
        moc: 150,
        children: [
          { name: "Indignant", moc: 150 },
          { name: "Violated", moc: 150 },
        ],
      },
      {
        name: "Mad",
        moc: 150,
        children: [
          { name: "Furious", moc: 150 },
          { name: "Jealous", moc: 125 },
        ],
      },
      {
        name: "Aggressive",
        moc: 150,
        children: [
          { name: "Provoked", moc: 150 },
          { name: "Hostile", moc: 150 },
        ],
      },
      {
        name: "Frustrated",
        moc: 150,
        children: [
          { name: "Infuriated", moc: 150 },
          { name: "Annoyed", moc: 150 },
        ],
      },
      {
        name: "Distant",
        moc: 50,
        children: [
          { name: "Withdrawn", moc: 50 },
          { name: "Numb", moc: 50 },
        ],
      },
      {
        name: "Critical",
        moc: 175,
        children: [
          { name: "Skeptical", moc: 175 },
          { name: "Dismissive", moc: 175 },
        ],
      },
    ],
  },
  {
    core: "Disgusted",
    moc: 150,
    color: "#A9B7C9",
    children: [
      {
        name: "Disapproving",
        moc: 175,
        children: [
          { name: "Judgmental", moc: 175 },
          { name: "Embarrassed", moc: 20 },
        ],
      },
      {
        name: "Disappointed",
        moc: 75,
        children: [
          { name: "Appalled", moc: 150 },
          { name: "Revolted", moc: 150 },
        ],
      },
      {
        name: "Awful",
        moc: 150,
        children: [
          { name: "Nauseated", moc: 150 },
          { name: "Detestable", moc: 150 },
        ],
      },
      {
        name: "Repelled",
        moc: 150,
        children: [
          { name: "Horrified", moc: 100 },
          { name: "Hesitant", moc: 100 },
        ],
      },
    ],
  },
  {
    core: "Sad",
    moc: 75,
    color: "#8FAECF",
    children: [
      {
        name: "Hurt",
        moc: 75,
        children: [
          { name: "Embarrassed", moc: 20 },
          { name: "Disappointed", moc: 75 },
        ],
      },
      {
        name: "Depressed",
        moc: 50,
        children: [
          { name: "Inferior", moc: 20 },
          { name: "Empty", moc: 50 },
        ],
      },
      {
        name: "Guilty",
        moc: 30,
        children: [
          { name: "Remorseful", moc: 30 },
          { name: "Ashamed", moc: 20 },
        ],
      },
      {
        name: "Despair",
        moc: 50,
        children: [
          { name: "Powerless", moc: 50 },
          { name: "Grief", moc: 75 },
        ],
      },
      {
        name: "Vulnerable",
        moc: 100,
        children: [
          { name: "Fragile", moc: 100 },
          { name: "Victimized", moc: 75 },
        ],
      },
      {
        name: "Lonely",
        moc: 75,
        children: [
          { name: "Abandoned", moc: 75 },
          { name: "Isolated", moc: 75 },
        ],
      },
    ],
  },
];

// Full Hawkins anchor list, ascending. Enlightenment is published as the band
// 700-1000; it is stored here as 700. See docs/research/feelings-wheel-moc.md.
export const MOC_ANCHORS: { level: number; name: string }[] = [
  { level: 20, name: "Shame" },
  { level: 30, name: "Guilt" },
  { level: 50, name: "Apathy" },
  { level: 75, name: "Grief" },
  { level: 100, name: "Fear" },
  { level: 125, name: "Desire" },
  { level: 150, name: "Anger" },
  { level: 175, name: "Pride" },
  { level: 200, name: "Courage" },
  { level: 250, name: "Neutrality" },
  { level: 310, name: "Willingness" },
  { level: 350, name: "Acceptance" },
  { level: 400, name: "Reason" },
  { level: 500, name: "Love" },
  { level: 540, name: "Joy" },
  { level: 600, name: "Peace" },
  { level: 700, name: "Enlightenment" },
];

// Derive the journal entry score from the selected feelings' levels:
// arithmetic mean rounded to the nearest integer, or null when nothing
// is selected. Averaging log-scale levels is an editorial choice; see the
// research file's "Score derivation" section.
export function deriveMoc(levels: number[]): number | null {
  if (levels.length === 0) {
    return null;
  }
  const sum = levels.reduce((total, level) => total + level, 0);
  return Math.round(sum / levels.length);
}

// Display band for a derived score. 200 (Courage) is Hawkins's threshold
// between draining and constructive levels; 340+ reads as "high" so that
// averages dominated by Acceptance-level (350) feelings stay in the top band.
export function mocBand(moc: number | null): "low" | "mid" | "high" | "none" {
  if (moc === null) {
    return "none";
  }
  if (moc < 200) {
    return "low";
  }
  if (moc < 340) {
    return "mid";
  }
  return "high";
}
