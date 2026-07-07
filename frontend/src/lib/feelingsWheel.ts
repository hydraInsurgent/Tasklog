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
  // Short differentiating gloss shown under the name in the wheel (#85) - what sets
  // this word apart from its siblings. Cores carry none (they differentiate themselves).
  hint?: string;
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
        hint: "the future looks workable from here",
        children: [
          {
            name: "Inspired",
            moc: 540,
            hint: "lit up, ideas want out",
          },
          {
            name: "Hopeful",
            moc: 310,
            hint: "it could genuinely go well",
          },
        ],
      },
      {
        name: "Trusting",
        moc: 250,
        hint: "safe enough to open up",
        children: [
          {
            name: "Intimate",
            moc: 500,
            hint: "close, letting them see you",
          },
          {
            name: "Sensitive",
            moc: 250,
            hint: "soft-skinned, touched by small things",
          },
        ],
      },
      {
        name: "Peaceful",
        moc: 600,
        hint: "nothing needs to change right now",
        children: [
          {
            name: "Thankful",
            moc: 540,
            hint: "warm about what's already here",
          },
          {
            name: "Loving",
            moc: 500,
            hint: "care flowing outward, no agenda",
          },
        ],
      },
      {
        name: "Powerful",
        moc: 200,
        hint: "able to act on what matters",
        children: [
          {
            name: "Creative",
            moc: 400,
            hint: "making something only you would",
          },
          {
            name: "Courageous",
            moc: 200,
            hint: "afraid maybe, moving anyway",
          },
        ],
      },
      {
        name: "Accepted",
        moc: 350,
        hint: "you belong as you are",
        children: [
          {
            name: "Valued",
            moc: 350,
            hint: "your presence counts to them",
          },
          {
            name: "Respected",
            moc: 350,
            hint: "taken seriously, given weight",
          },
        ],
      },
      {
        name: "Proud",
        moc: 175,
        hint: "you did that, and it shows",
        children: [
          {
            name: "Confident",
            moc: 200,
            hint: "sure of your next move",
          },
          {
            name: "Successful",
            moc: 175,
            hint: "it worked, the result landed",
          },
        ],
      },
      {
        name: "Interested",
        moc: 310,
        hint: "something is pulling you closer",
        children: [
          {
            name: "Inquisitive",
            moc: 310,
            hint: "asking, digging, wanting the why",
          },
          {
            name: "Curious",
            moc: 310,
            hint: "drawn to look a little longer",
          },
        ],
      },
      {
        name: "Content",
        moc: 350,
        hint: "enough, and it feels like enough",
        children: [
          {
            name: "Joyful",
            moc: 540,
            hint: "bubbling over, hard to hide",
          },
          {
            name: "Free",
            moc: 540,
            hint: "nothing pinning you down",
          },
        ],
      },
      {
        name: "Playful",
        moc: 540,
        hint: "light, silly, up for fun",
        children: [
          {
            name: "Cheeky",
            moc: 540,
            hint: "mischief with a grin",
          },
          {
            name: "Aroused",
            moc: 125,
            hint: "charged, wanting, bodily pull",
          },
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
        hint: "good thing coming, can't sit still",
        children: [
          {
            name: "Energetic",
            moc: 310,
            hint: "engine running, ready to move",
          },
          {
            name: "Eager",
            moc: 310,
            hint: "leaning toward it, start now",
          },
        ],
      },
      {
        name: "Amazed",
        moc: 540,
        hint: "bigger than you expected",
        children: [
          {
            name: "Awe",
            moc: 540,
            hint: "small before something vast",
          },
          {
            name: "Astonished",
            moc: 250,
            hint: "didn't see that coming at all",
          },
        ],
      },
      {
        name: "Confused",
        moc: 100,
        hint: "the pieces don't fit yet",
        children: [
          {
            name: "Perplexed",
            moc: 100,
            hint: "turning it over, still stuck",
          },
          {
            name: "Disillusioned",
            moc: 75,
            hint: "it wasn't what they said",
          },
        ],
      },
      {
        name: "Startled",
        moc: 100,
        hint: "jolted before you could think",
        children: [
          {
            name: "Dismayed",
            moc: 100,
            hint: "unpleasant surprise, heart sank",
          },
          {
            name: "Shocked",
            moc: 100,
            hint: "system still catching up",
          },
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
        hint: "the tank is empty",
        children: [
          {
            name: "Unfocused",
            moc: 50,
            hint: "attention slides off everything",
          },
          {
            name: "Sleepy",
            moc: 50,
            hint: "body asking for sleep, not effort",
          },
        ],
      },
      {
        name: "Stressed",
        moc: 100,
        hint: "more load than capacity",
        children: [
          {
            name: "Out of control",
            moc: 100,
            hint: "the wheel isn't responding",
          },
          {
            name: "Overwhelmed",
            moc: 100,
            hint: "too much at once to hold",
          },
        ],
      },
      {
        name: "Busy",
        moc: 100,
        hint: "no room between the tasks",
        children: [
          {
            name: "Rushed",
            moc: 100,
            hint: "no time to do it properly",
          },
          {
            name: "Pressured",
            moc: 100,
            hint: "something is squeezing you",
          },
        ],
      },
      {
        name: "Bored",
        moc: 50,
        hint: "nothing here holds you",
        children: [
          {
            name: "Apathetic",
            moc: 50,
            hint: "can't be made to care",
          },
          {
            name: "Indifferent",
            moc: 50,
            hint: "noticed it, felt nothing",
          },
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
        hint: "danger feels close",
        children: [
          {
            name: "Helpless",
            moc: 50,
            hint: "nothing you do would matter",
          },
          {
            name: "Frightened",
            moc: 100,
            hint: "the fear has a face",
          },
        ],
      },
      {
        name: "Anxious",
        moc: 100,
        hint: "dread without a clear address",
        children: [
          {
            name: "Overwhelmed",
            moc: 100,
            hint: "worry stacked past capacity",
          },
          {
            name: "Worried",
            moc: 100,
            hint: "running bad futures on loop",
          },
        ],
      },
      {
        name: "Insecure",
        moc: 100,
        hint: "not sure you measure up",
        children: [
          {
            name: "Inadequate",
            moc: 20,
            hint: "not enough for the task",
          },
          {
            name: "Inferior",
            moc: 20,
            hint: "everyone else seems more",
          },
        ],
      },
      {
        name: "Weak",
        moc: 50,
        hint: "no strength for what's needed",
        children: [
          {
            name: "Worthless",
            moc: 20,
            hint: "as if you don't count",
          },
          {
            name: "Insignificant",
            moc: 20,
            hint: "too small to matter here",
          },
        ],
      },
      {
        name: "Rejected",
        moc: 75,
        hint: "pushed out, not wanted",
        children: [
          {
            name: "Excluded",
            moc: 75,
            hint: "the circle closed without you",
          },
          {
            name: "Persecuted",
            moc: 100,
            hint: "singled out and hunted",
          },
        ],
      },
      {
        name: "Threatened",
        moc: 100,
        hint: "something is coming at you",
        children: [
          {
            name: "Nervous",
            moc: 100,
            hint: "on edge, braced for it",
          },
          {
            name: "Exposed",
            moc: 100,
            hint: "defenses down, seen too much",
          },
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
        hint: "they didn't hold their end",
        children: [
          {
            name: "Betrayed",
            moc: 150,
            hint: "trust broken from inside it",
          },
          {
            name: "Resentful",
            moc: 150,
            hint: "keeping score, quietly burning",
          },
        ],
      },
      {
        name: "Humiliated",
        moc: 20,
        hint: "made small in front of others",
        children: [
          {
            name: "Disrespected",
            moc: 20,
            hint: "treated as less than you are",
          },
          {
            name: "Ridiculed",
            moc: 20,
            hint: "laughed at, made the joke",
          },
        ],
      },
      {
        name: "Bitter",
        moc: 150,
        hint: "old anger gone hard",
        children: [
          {
            name: "Indignant",
            moc: 150,
            hint: "this is plainly unfair",
          },
          {
            name: "Violated",
            moc: 150,
            hint: "a line was crossed on you",
          },
        ],
      },
      {
        name: "Mad",
        moc: 150,
        hint: "heat rising, plain anger",
        children: [
          {
            name: "Furious",
            moc: 150,
            hint: "full blaze, hard to steer",
          },
          {
            name: "Jealous",
            moc: 125,
            hint: "someone has what feels yours",
          },
        ],
      },
      {
        name: "Aggressive",
        moc: 150,
        hint: "wanting to push back hard",
        children: [
          {
            name: "Provoked",
            moc: 150,
            hint: "poked until it sparked",
          },
          {
            name: "Hostile",
            moc: 150,
            hint: "guard up, ready to strike",
          },
        ],
      },
      {
        name: "Frustrated",
        moc: 150,
        hint: "blocked from what you're trying to do",
        children: [
          {
            name: "Infuriated",
            moc: 150,
            hint: "boiled over, seeing red",
          },
          {
            name: "Annoyed",
            moc: 150,
            hint: "small irritation, still in control",
          },
        ],
      },
      {
        name: "Distant",
        moc: 50,
        hint: "pulled back behind glass",
        children: [
          {
            name: "Withdrawn",
            moc: 50,
            hint: "gone quiet, door shut",
          },
          {
            name: "Numb",
            moc: 50,
            hint: "feeling switched off entirely",
          },
        ],
      },
      {
        name: "Critical",
        moc: 175,
        hint: "finding fault everywhere you look",
        children: [
          {
            name: "Skeptical",
            moc: 175,
            hint: "not buying it yet",
          },
          {
            name: "Dismissive",
            moc: 175,
            hint: "decided it's beneath notice",
          },
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
        hint: "this shouldn't be happening",
        children: [
          {
            name: "Judgmental",
            moc: 175,
            hint: "measuring them, and they fail",
          },
          {
            name: "Embarrassed",
            moc: 20,
            hint: "cringing at what's on display",
          },
        ],
      },
      {
        name: "Disappointed",
        moc: 75,
        hint: "hoped for more than this",
        children: [
          {
            name: "Appalled",
            moc: 150,
            hint: "worse than you thought possible",
          },
          {
            name: "Revolted",
            moc: 150,
            hint: "your stomach turns at it",
          },
        ],
      },
      {
        name: "Awful",
        moc: 150,
        hint: "sick about it, through and through",
        children: [
          {
            name: "Nauseated",
            moc: 150,
            hint: "physically sickened by it",
          },
          {
            name: "Detestable",
            moc: 150,
            hint: "hate it to the core",
          },
        ],
      },
      {
        name: "Repelled",
        moc: 150,
        hint: "want distance from it, now",
        children: [
          {
            name: "Horrified",
            moc: 100,
            hint: "recoiling, can't unsee it",
          },
          {
            name: "Hesitant",
            moc: 100,
            hint: "holding back, something's off",
          },
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
        hint: "someone's act left a mark",
        children: [
          {
            name: "Embarrassed",
            moc: 20,
            hint: "wounded, and it showed",
          },
          {
            name: "Disappointed",
            moc: 75,
            hint: "they mattered and didn't come through",
          },
        ],
      },
      {
        name: "Depressed",
        moc: 50,
        hint: "grey weight on everything",
        children: [
          {
            name: "Inferior",
            moc: 20,
            hint: "sunk below everyone",
          },
          {
            name: "Empty",
            moc: 50,
            hint: "nothing left inside",
          },
        ],
      },
      {
        name: "Guilty",
        moc: 30,
        hint: "you did the harm",
        children: [
          {
            name: "Remorseful",
            moc: 30,
            hint: "would undo it if you could",
          },
          {
            name: "Ashamed",
            moc: 20,
            hint: "the fault feels like who you are",
          },
        ],
      },
      {
        name: "Despair",
        moc: 50,
        hint: "no way out visible",
        children: [
          {
            name: "Powerless",
            moc: 50,
            hint: "hands tied, nothing works",
          },
          {
            name: "Grief",
            moc: 75,
            hint: "a loss that must be carried",
          },
        ],
      },
      {
        name: "Vulnerable",
        moc: 100,
        hint: "unprotected where it matters",
        children: [
          {
            name: "Fragile",
            moc: 100,
            hint: "one knock from breaking",
          },
          {
            name: "Victimized",
            moc: 75,
            hint: "harm was done to you",
          },
        ],
      },
      {
        name: "Lonely",
        moc: 75,
        hint: "missing company where it should be",
        children: [
          {
            name: "Abandoned",
            moc: 75,
            hint: "left by someone who used to stay",
          },
          {
            name: "Isolated",
            moc: 75,
            hint: "cut off from everyone",
          },
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
