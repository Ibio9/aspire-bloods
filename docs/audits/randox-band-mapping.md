# Randox's band labels against our five states

**Read-only. Aug 2026.** Every band label printed on
`apps/server/src/modules/randox/specs/HSC5-Randox-Basic-Screen-Example-Report.pdf`
— the only example report Randox have sent — mapped onto the five states this
product renders.

Extracted mechanically from the PDF's per-panel pages (5–13) and its "Results
for your Doctor" table (pages 14–15). Nothing here is transcribed from memory.

---

## The two vocabularies

Ours is five states and one axis:

    SIGNIFICANT_LOW · LOW · IN_RANGE · HIGH · SIGNIFICANT_HIGH

Randox's, on this one report, is **thirteen labels across five different
schemes**:

| Scheme | Labels used | Analytes |
| --- | --- | --- |
| Three-band, symmetric | Low · Optimal · High | 19 |
| Two-band, upper only | Desirable · High | 4 |
| Two-band, lower only | Low · Desirable | 1 (HDL) |
| Two-band, upper only, other words | Optimal · High | 2 (Total Bilirubin, CRP) |
| Four-band, escalating | Normal · Moderately raised · High | 2 (ALT, AST) |
| Four-band, escalating | Optimal · Low · Pre-diabetic · High | 1 (Glucose) |
| Three-band, risk | Low Risk · Average Risk · High Risk | 1 (hsCRP) |
| Three-band, staged, inverted | Satisfactory · Stage 3 CKD · Stage 4&5 CKD | 1 (eGFR) |

**Thirteen labels, and only five of them are about a direction.** The rest carry
a judgement (Desirable, Satisfactory), a severity (Moderately raised), a
diagnosis (Pre-diabetic, Stage 3 CKD) or a risk tier (Average Risk). Our
vocabulary is deliberately none of those — see the non-diagnostic rule in
CLAUDE.md — so most of this table is not a renaming exercise.

---

## The mapping, analyte by analyte

`✔` the mapping is mechanical and safe. `⚠` **flagged — do not resolve without a
clinician.**

### Full Blood Count — three bands, symmetric (13 analytes)

Haemoglobin, Haematocrit, MCH, MCHC, MCV, Red Blood Cell Count, Basophil,
Eosinophil, Lymphocyte, Monocyte, Neutrophil, White Blood Cell and Platelet
Counts.

| Randox label | Example | Our state | |
| --- | --- | --- | --- |
| `<27.0  Low` | MCH | `LOW` | ✔ |
| `27.0 - 32.0  Optimal` | MCH | `IN_RANGE` | ✔ |
| `>32.0  High` | MCH | `HIGH` | ✔ |

This is the whole of the safe part of the mapping and it covers 13 of the 34
analytes. Randox's "Optimal" here is our IN_RANGE, **not** our optimal
narrowing: it is the laboratory's reference interval, printed under a word we
use for something else.

⚠ **`Optimal` is an overloaded word and we already use it.** Our optimal band is
a *narrowing of* the reference range from published guidance
(`packages/shared/optimalRanges.ts`). Randox's "Optimal" IS the reference range.
If a Randox band label ever reaches a screen unmapped, two different things will
be called optimal on one page.

### Kidney Health — five symmetric, one inverted

| Analyte | Randox labels | Our state | |
| --- | --- | --- | --- |
| Creatinine, Chloride, Phosphate, Potassium, Sodium, Urea | Low / Optimal / High | `LOW` / `IN_RANGE` / `HIGH` | ✔ |
| **eGFR** | `≥60  Satisfactory` | `IN_RANGE` | ⚠ |
| **eGFR** | `30 - 59.99  Stage 3 CKD` | `LOW`? | ⚠ |
| **eGFR** | `<30  Stage 4&5 CKD` | `SIGNIFICANT_LOW`? | ⚠ |

⚠ **eGFR is the one genuinely inverted marker on the report, and its bands are
diagnostic.** "Stage 3 CKD" is a *diagnosis of chronic kidney disease*, not a
description of where a number sits. Rendering it as "below range" understates
it; rendering it in our words at all is this product naming a condition. There
is no honest mapping and one is not proposed here. **For Richard.**

### Liver Health — two escalating, three symmetric, one upper-only

| Analyte | Randox labels | Our state | |
| --- | --- | --- | --- |
| ALP, GGT, Albumin | Low / Optimal / High | `LOW` / `IN_RANGE` / `HIGH` | ✔ |
| **ALT** | `<40  Normal` | `IN_RANGE` | ✔ |
| **ALT** | `40 - 200  Moderately raised` | `HIGH`? | ⚠ |
| **ALT** | `>200  High` | `SIGNIFICANT_HIGH`? | ⚠ |
| **AST** | `<40  Normal` / `40 - 185  Moderately raised` / `>185  High` | as ALT | ⚠ |
| Total Bilirubin | `<21.0  Optimal` / `≥21.0  High` | `IN_RANGE` / `HIGH` | ✔ |

⚠ **"Moderately raised" is not "above range" and "High" is not "significantly
above range".** The shapes look alike and the claims are different. Ours are
positional — where a value sits relative to an interval — and derived
arithmetically from a width multiplier. Randox's are severity judgements with
thresholds a laboratory chose (200 for ALT, 185 for AST; note they differ, which
a width multiplier cannot produce). Treating them as equivalent would be
inventing a clinical judgement and calling it a rename. **For Richard.**

Worth noting what this *does* say: for ALT the laboratory's own escalation
threshold is **5× the upper bound**, and our default `severityMultiplier` of 1.5
puts significantly-high at 100 for the same marker. Those are not close.

### Heart Health — three upper-only, one lower-only, one risk

| Analyte | Randox labels | Our state | |
| --- | --- | --- | --- |
| Total Cholesterol | `<5.0  Desirable` / `≥5.0  High` | `IN_RANGE` / `HIGH` | ⚠ |
| LDL Cholesterol | `<3.0  Desirable` / `≥3.0  High` | `IN_RANGE` / `HIGH` | ⚠ |
| Cholesterol Ratio | `<5.0  Desirable` / `≥5.0  High` | `IN_RANGE` / `HIGH` | ⚠ |
| Triglycerides | `<2.3  Desirable` / `≥2.3  High` | `IN_RANGE` / `HIGH` | ⚠ |
| **HDL Cholesterol** | `<1.55  Low` / `≥1.55  Desirable` | `LOW` / `IN_RANGE` | ⚠ |
| **hsCRP** | `<1  Low Risk` / `1 - 3  Average Risk` / `>3  High Risk` | ⚠ | ⚠ |

⚠ **"Desirable" is a target, not an interval.** 5.0 mmol/L is a threshold below
which cholesterol is desirable — there is no lower bound at which it stops
being. Mapping it to IN_RANGE with a floor of 0 is what the catalogue does today
and it is a reasonable approximation; calling it *the reference range* is not,
and "below the reference range" for a total cholesterol of 2.0 would be a
sentence nobody should read.

⚠ **HDL is the second inverted marker** and is the mirror image: the only band
that means anything is the FLOOR. See the measurement below.

⚠ **hsCRP's bands are risk tiers, not ranges.** "Average Risk" is not a state in
our vocabulary and does not correspond to one. **For Richard.**

### Diabetes Health — four bands, one of them diagnostic

| Randox label | Our state | |
| --- | --- | --- |
| `<4.00  Low` | `LOW` | ✔ |
| `4.00 - 5.59  Optimal` | `IN_RANGE` | ✔ |
| `5.60 - 6.99  Pre-diabetic` | ⚠ | ⚠ |
| `≥7.00  High` | ⚠ | ⚠ |

⚠ **"Pre-diabetic" is a diagnosis.** It is also the band a patient is most
likely to be in and most likely to search for. Neither "above range" nor
"significantly above range" says it, and saying it is not this product's to do.
**For Richard.**

### Other

| Analyte | Randox labels | Our state | |
| --- | --- | --- | --- |
| CRP | `≤5.0  Optimal` / `>5.0  High` | `IN_RANGE` / `HIGH` | ✔ |

---

## Count

| | |
| --- | --- |
| Analytes on the report | **34** |
| Map mechanically and safely (`✔`) | **19** |
| Flagged for a clinician (`⚠`) | **15** |
| Randox band labels in total | **13** |
| Of those, positional (Low/High/Optimal/Normal) | **4** |
| Of those, a judgement, a severity, a risk tier or a diagnosis | **9** |

---

## What eGFR and HDL do today — measured, not reasoned

Both are stored with an upper bound of **999**, which is the seed's way of
writing "there is no clinical ceiling". `packages/shared/statusBands.ts` now
declares it as `OPEN_UPPER_BOUND` rather than leaving it as a number in four
rows.

Measured by putting real values through `computeMarkerStatus` and
`severityThresholdFor`:

```
egfr  (60–999)   severity threshold 1408.5
   130 → IN_RANGE      97 → IN_RANGE      60 → IN_RANGE
    59 → LOW           45 → LOW           29 → LOW
    12 → LOW            4 → LOW

hdl   (1.55–999) severity threshold 1496.2
   3.2 → IN_RANGE     2.0 → IN_RANGE    1.55 → IN_RANGE
  1.14 → LOW          0.6 → LOW          0.3 → LOW
```

**The failure that was feared does not happen.** A high eGFR is not rendered as
"above range" in gold; neither is a high HDL. The 999 ceiling means every value
above the floor computes IN_RANGE, which is the clinically correct answer. That
was worth checking and it is worth writing down: nothing about kidney function
or good cholesterol is currently being flagged at a patient.

**Three other things do happen, and two of them were live.**

1. **The reference range was printed as "60–999 mL/min/1.73m²"** — on the marker
   page, on the result card, in the chart's tooltip, on its axis and in both
   PDFs. A number nobody chose, presented as the laboratory's interval.
   **FIXED.** `formatReferenceRange` now sets an open-topped range in words:
   "60 or above". Every reference range that reaches a screen or a PDF goes
   through that one function, so the fix is complete by construction.

2. **The range bar was drawn on a scale of roughly 0 to 2000.** `rangeBarScale`
   builds a scale that contains the reference range, and 60–999 is most of a
   thousand units wide. A perfectly healthy eGFR of 97 landed at **5% of the
   bar**, hard against the left-hand end of a green band — which reads as "only
   just inside my range". This is precisely the failure that module was written
   to end (a correct picture with a false axis), surviving in the one input
   nobody had put through it, because 999 is an ordinary number to arithmetic.
   **FIXED**, by refusing to draw: `reference-range-open-ended` is a new reason
   in `RANGE_BAR_UNAVAILABLE` with its own sentence, and rule 4 of that module
   ("when none of it can be drawn honestly, nothing is drawn") already covered
   the case.

   ⚠ The *right* rendering is an open-ended bar — a green region running from
   the lower bound off the right-hand end, with no upper hairline and no upper
   label. That is a design change across two components rather than a scale
   correction, and it is **not** done here.

3. ⚠ **The severity threshold is derived from the sentinel width**, so it comes
   out at 1408 for eGFR. An eGFR of **4** — dialysis territory — computes `LOW`,
   drawn in gold with a single chevron, indistinguishable from an eGFR of 59.
   **NOT FIXED, and deliberately.** The mechanism for fixing it already exists
   (`Marker.severityAbsoluteDelta`, an explicit per-marker number that bypasses
   the width multiplier entirely); what does not exist is anybody entitled to
   choose the number. Picking one would be inventing a clinical threshold.
   **For Richard.**

## And the model cannot express "higher is better"

Asked plainly: **no, and nothing in it can.** There is no `higherIsBetter`, no
direction, no polarity on `Marker`, on `ReferenceRange` or on `ResultReferenceRange`.

What it also cannot express is a **one-sided** range, which is the more accurate
description of what eGFR and HDL need and is a smaller thing to add. A reference
range is two required numbers; "no upper limit" has been spelled 999 since the
first seed.

Two observations for whoever decides this:

* **The five states already carry no polarity of their own.** `HIGH` and `LOW`
  share a hue; `SIGNIFICANT_HIGH` and `SIGNIFICANT_LOW` share a hue; direction
  is carried by the chevron and the word and by nothing else. So the system does
  not currently say that high is bad — it says that *outside the interval* is
  worth noticing. For a genuinely one-sided marker that is still wrong, but it is
  wrong in a smaller way than "higher is worse" would be.
* **A nullable bound is the smaller change and would be enough.** `referenceHigh:
  null` meaning "no ceiling" removes the sentinel, the printed 999, the false bar
  scale and the nonsense severity threshold in one move — and it makes the four
  affected markers visible in a query instead of findable only by knowing to
  grep for 999. It needs a migration and a pass over every `deriveStatus` caller,
  which is why it is written down here rather than done.

---

## The list for Richard

1. **eGFR's bands are a CKD staging.** Naming a stage is a diagnosis. What
   should a patient see for an eGFR of 45?
2. **"Moderately raised" (ALT 40–200, AST 40–185).** Is this our `HIGH`, and is
   Randox's "High" our `SIGNIFICANT_HIGH`? Their escalation is ~5× the upper
   bound; our default is 1.5× the range width.
3. **"Pre-diabetic" (glucose 5.60–6.99).** Same question, higher stakes, and it
   is the band patients search for.
4. **hsCRP's risk tiers.** Low / Average / High Risk are not positions on a
   scale. Should hsCRP render as a risk tier rather than as a range at all?
5. **"Desirable" (cholesterol, LDL, ratio, triglycerides).** A target with no
   floor. Is a total cholesterol of 2.0 "below range"?
6. **eGFR's significantly-low threshold.** A number, from a clinician, for
   `severityAbsoluteDelta`. Same for HDL if wanted.
7. **Should the one-sided markers get an open-ended bar** rather than no bar?
8. **The word "Optimal".** Randox use it for the reference interval; we use it
   for a narrowing inside one. Which of us changes?
9. **Are these bands the same on every Randox report**, or does the HSC5
   Basic Screen have its own set? Everything above is one document.
