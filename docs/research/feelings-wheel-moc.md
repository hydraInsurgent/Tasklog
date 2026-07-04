# Research: Feelings Wheel (Geoffrey Roberts) + Hawkins Map of Consciousness

Date: 2026-07-02
Feature: #79 Journaling (docs/plans/P79-journaling.md, Step 1)
Consumed by: `frontend/src/lib/feelingsWheel.ts`

---

## Purpose

The journaling feature lets the user multi-select feelings from a feelings wheel.
Each feeling carries a numeric level from David R. Hawkins' Map of Consciousness (MoC),
so the logged score is derived from the selected feelings, never self-tagged.
This file records the verified source data for both models and the methodology used
to map one onto the other.

---

## Sources

| # | Source | URL | Used for |
|---|--------|-----|----------|
| 1 | Mike Bostock, "Emotion Wheel" (Observable), a text recreation of Geoffrey Roberts's 2015 Emotion Wheel | https://observablehq.com/@mbostock/emotion-wheel | Full wheel hierarchy, verbatim (fetched 2026-07-02 via https://api.observablehq.com/@mbostock/emotion-wheel.js) |
| 2 | feelingswheel.com (hosts the Roberts wheel image, credits Geoffrey Roberts) | https://feelingswheel.com/ | Confirms Roberts attribution; the site renders the wheel as an image, so the text hierarchy was taken from source 1 |
| 3 | Geoffrey Roberts's original imgur upload (linked from sources 1 and 2) | https://imgur.com/a/CkxQC | Original artifact reference |
| 4 | feelingswheel.app | https://feelingswheel.app/ | Cross-check: states the wheel has "130 emotions and 7 core emotions", which matches the count below (7 + 41 + 82 = 130) |
| 5 | The Dad Train, "The Feeling Wheel" | https://thedadtrain.com/feeling-wheel/ | Background on Geoffrey Roberts (pastor and life coach; wheel built for clients with limited emotional vocabulary) |
| 6 | Michael Teh, "The Map of Consciousness" | https://iammichaelteh.com/the-map-of-consciousness/ | Full MoC level table with calibration numbers and emotion column (fetched 2026-07-02) |
| 7 | Veritas Publishing (David R. Hawkins's official publisher), "Map of Consciousness" | https://veritaspub.com/map-of-consciousness/ | Confirms the scale is logarithmic, 1 to 1000, with 200 as the threshold between destructive and constructive levels |

Lineage note (from source 1): Roberts's 2015 wheel appears to be based on a 2014
vocabulary wheel by Kaitlin Robbs, which in turn derives from Gloria Willcox's
"The Feeling Wheel" (1982). We use the Roberts layout because it matches the
user's old journal template (7 cores including Bad and Surprised).

---

## Verified wheel structure (Geoffrey Roberts, 2015)

Verbatim from source 1. 7 cores, 41 secondaries, 82 tertiaries (2 per secondary), 130 total.
Listed here in the wheel's clockwise order starting at Happy.

### Happy (9 secondaries)

| Secondary | Tertiaries |
|---|---|
| Optimistic | Inspired, Hopeful |
| Trusting | Intimate, Sensitive |
| Peaceful | Thankful, Loving |
| Powerful | Creative, Courageous |
| Accepted | Valued, Respected |
| Proud | Confident, Successful |
| Interested | Inquisitive, Curious |
| Content | Joyful, Free |
| Playful | Cheeky, Aroused |

### Surprised (4 secondaries)

| Secondary | Tertiaries |
|---|---|
| Excited | Energetic, Eager |
| Amazed | Awe, Astonished |
| Confused | Perplexed, Disillusioned |
| Startled | Dismayed, Shocked |

### Bad (4 secondaries)

| Secondary | Tertiaries |
|---|---|
| Tired | Unfocused, Sleepy |
| Stressed | Out of control, Overwhelmed |
| Busy | Rushed, Pressured |
| Bored | Apathetic, Indifferent |

### Fearful (6 secondaries)

| Secondary | Tertiaries |
|---|---|
| Scared | Helpless, Frightened |
| Anxious | Overwhelmed, Worried |
| Insecure | Inadequate, Inferior |
| Weak | Worthless, Insignificant |
| Rejected | Excluded, Persecuted |
| Threatened | Nervous, Exposed |

### Angry (8 secondaries)

| Secondary | Tertiaries |
|---|---|
| Let down | Betrayed, Resentful |
| Humiliated | Disrespected, Ridiculed |
| Bitter | Indignant, Violated |
| Mad | Furious, Jealous |
| Aggressive | Provoked, Hostile |
| Frustrated | Infuriated, Annoyed |
| Distant | Withdrawn, Numb |
| Critical | Skeptical, Dismissive |

### Disgusted (4 secondaries)

| Secondary | Tertiaries |
|---|---|
| Disapproving | Judgmental, Embarrassed |
| Disappointed | Appalled, Revolted |
| Awful | Nauseated, Detestable |
| Repelled | Horrified, Hesitant |

### Sad (6 secondaries)

| Secondary | Tertiaries |
|---|---|
| Hurt | Embarrassed, Disappointed |
| Depressed | Inferior, Empty |
| Guilty | Remorseful, Ashamed |
| Despair | Powerless, Grief |
| Vulnerable | Fragile, Victimized |
| Lonely | Abandoned, Isolated |

### Duplicate names are genuine

The Roberts wheel intentionally repeats some words in different sectors:

- Embarrassed: Disgusted > Disapproving, and Sad > Hurt
- Disappointed: Disgusted (secondary), and Sad > Hurt (tertiary)
- Inferior: Fearful > Insecure, and Sad > Depressed
- Overwhelmed: Fearful > Anxious, and Bad > Stressed

Any consuming code must therefore identify feelings by their path in the tree
(core > secondary > tertiary), never by name alone.

### Verification caveat

feelingswheel.com serves the wheel as an image, so the hierarchy above was verified
against Bostock's text recreation (source 1), which links directly to Roberts's
original imgur upload. The total count (130) independently matches the count claimed
by feelingswheel.app (source 4). Newer redrawn variants of the wheel circulating
online sometimes swap individual words; this file pins the 2015 layout.

---

## Verified Hawkins Map of Consciousness anchors

From source 6 (Michael Teh), quoted as retrieved on 2026-07-02, cross-checked with
source 7 for the scale definition (logarithmic, 1 to 1000, threshold at 200):

> 1. Shame (1-20) - Humiliation
> 2. Guilt (30) - Blame
> 3. Apathy (50) - Despair
> 4. Grief (75) - Sadness
> 5. Fear (100) - Anxiety
> 6. Desire (125) - Craving
> 7. Anger (150) - Hate
> 8. Pride (175) - Arrogance
> 9. Courage (200) - Empowerment
> 10. Neutrality (250) - Trust
> 11. Willingness (310) - Hopefulness
> 12. Acceptance (350) - Forgiveness
> 13. Reason (400) - Understanding
> 14. Love (500) - Unconditional compassion
> 15. Joy (540) - Serenity
> 16. Peace (600) - Bliss
> 17. Enlightenment (700-1000) - Transcendence

Anchor table used by the dataset (level numbers as commonly published in
Hawkins's "Power vs. Force" chart; Shame is charted at 20, Enlightenment
is a band from 700 to 1000 and is stored as 700):

| Level | Name |
|---|---|
| 20 | Shame |
| 30 | Guilt |
| 50 | Apathy |
| 75 | Grief |
| 100 | Fear |
| 125 | Desire |
| 150 | Anger |
| 175 | Pride |
| 200 | Courage |
| 250 | Neutrality |
| 310 | Willingness |
| 350 | Acceptance |
| 400 | Reason |
| 500 | Love |
| 540 | Joy |
| 600 | Peace |
| 700 | Enlightenment |

Key structural facts:

- The scale is logarithmic (base 10 exponents), so differences are not linear.
- 200 (Courage) is the threshold: levels below 200 are destructive or draining,
  levels at or above 200 are constructive.
- Hawkins himself places some pleasant-feeling states below 200 (Pride 175,
  Desire 125). Feeling good and calibrating high are not the same thing in
  this model, and our mapping preserves that.

---

## Mapping methodology

**This mapping is our editorial judgment layered on two independent published
models.** Geoffrey Roberts's wheel and Hawkins's Map of Consciousness were never
designed to interoperate. Roberts gives vocabulary; Hawkins gives calibration.
Neither author endorses the combination. The rules below are ours.

### Rules applied

1. **Nearest anchor by emotional family.** Each wheel feeling is assigned the
   Hawkins anchor whose emotional family it belongs to, regardless of which
   wheel sector it sits in. Examples: everything shame-flavored (Ashamed,
   Humiliated, Worthless, Inadequate, Embarrassed) gets Shame 20 even when it
   sits in the Angry, Fearful, or Disgusted sector; Guilty and Remorseful get
   Guilt 30; anxiety words get Fear 100; loss and disappointment words get
   Grief 75; apathy, numbness, and exhaustion words get Apathy 50.

2. **Tertiary feelings inherit their secondary's level by default.** A tertiary
   only overrides when it clearly belongs to a different Hawkins family
   (e.g. Mad 150 but Jealous 125, because jealousy is craving/Desire in
   Hawkins's model; Scared 100 but Helpless 50, because helplessness is
   powerlessness/Apathy).

3. **Cross-cases are deliberate.** The wheel sector does NOT dictate the level:
   - Proud maps to Pride 175 despite sitting in the Happy sector. Hawkins
     explicitly calibrates pride below 200.
   - Aroused (Happy > Playful) maps to Desire 125 for the same reason.
   - Humiliated and its children map to Shame 20 despite sitting in Angry.
   - Guilty and its children map to Guilt 30 / Shame 20 despite Sad being 75.
   - Critical, Disapproving, and Judgmental map to Pride 175 (Hawkins ties
     pride to scorn and arrogance) despite sitting in Angry and Disgusted.
   - Horrified and Hesitant map to Fear 100 despite sitting in Disgusted.
   - Confused and Startled families map to Fear 100 despite Surprised
     itself being neutral (250).

4. **Cores get the family's anchor:** Happy = Joy 540, Surprised =
   Neutrality 250 (surprise is valence-neutral arousal), Bad = Apathy 50
   (its secondaries are tired, stressed, busy, bored), Fearful = Fear 100,
   Angry = Anger 150, Disgusted = Anger 150 (Hawkins has no disgust anchor;
   disgust-proper sits in the hate/aversion band next to Anger, while the
   judgment side of disgust goes to Pride 175 per rule 1), Sad = Grief 75.

5. **Positive-sector spread follows Hawkins's own ladder:** Powerful and
   Courageous = Courage 200, Trusting = Neutrality 250 (Hawkins pairs
   Neutrality with trust), Optimistic / Hopeful / Interested = Willingness 310
   (Hawkins pairs Willingness with optimism), Accepted / Valued / Respected /
   Content = Acceptance 350, Creative = Reason 400 (editorial: creativity as
   capability rather than raw empowerment), Loving / Intimate = Love 500,
   Joyful / Thankful / Inspired / Playful / Free / Amazed / Awe = Joy 540,
   Peaceful = Peace 600. Enlightenment 700 is intentionally not assigned to
   any wheel feeling; no everyday vocabulary word earns it.

### Entries that required a judgment call (no clean Hawkins family)

- Surprised core and Astonished: Neutrality 250 (valence-neutral).
- Excited / Energetic / Eager: Willingness 310 (positive readiness).
- Busy / Rushed / Pressured: Fear 100 (time pressure reads as anxiety).
- Sensitive (Happy > Trusting): inherits Trusting 250.
- Violated (Angry > Bitter): kept at Anger 150 rather than Grief or Fear.
- Creative: Reason 400 rather than inheriting Powerful 200.

### Score derivation

The journal entry's MoC score is the arithmetic mean of the levels of all
selected feelings, rounded to the nearest integer (`deriveMoc`). Bands for
display (`mocBand`): below 200 = "low" (below the Courage threshold),
200 to 339 = "mid", 340 and above = "high" (Acceptance and up, with a small
tolerance below 350 so a rounded average dominated by 350-level feelings
still reads high). Empty selection = "none"; no score is shown.

Averaging note: the Hawkins scale is logarithmic, so an arithmetic mean of
levels is not physically meaningful in Hawkins's own terms. We use it anyway
because it is simple, stable, and monotonic (adding a lower feeling always
lowers the score), which is what a journal trend line needs. This is an
editorial choice, documented here so it is not mistaken for something Hawkins
prescribes.
