# Age-specific reference ranges

Generated 2026-08-12 by `npm run audit:age-ranges --workspace=apps/server`. Read-only.

## The state of it

| | |
| --- | --- |
| Analytes whose interval moves with age | **14** |
| …of those, carrying an age bracket | **0** |
| Age-banded rows loaded from a source | **0** |
| Catalogue reference-range rows in total | 89 |

The schema supports `ageMin` and `ageMax`, and `resolveReferenceRange()` already scores an age-bracketed row above an unbounded one. The capability is there and the data is not.

## Why none is loaded

A reference range comes from the result, then from a named published document with a citation on the row. Never from a session’s own knowledge, never extrapolated from a related marker. Every document this repository holds has been checked against that rule and none of them carries an age-banded interval:

- `HSC5-Randox-Basic-Screen-Example-Report.pdf` is the only document in the tree with reference ranges in it at all. It prints one interval per analyte and does not say whose — not the age and not the sex.
- The NHS Lothian document behind the sex-specific ranges is sex-specific by its own title and excludes hormones. It says nothing about age.
- There is no API route to reference ranges. `GetTests` returns id, name, code, stabilityTime, sampleTubes, cost and currency; nothing in the OpenAPI spec returns an interval outside `GetOrderResultDetail`, which is per result.

**Loading a partially-right set from memory would be the one change here capable of doing harm.** An age-banded row is MORE specific than the blanket one, so the resolver prefers it — a wrong specific answer beats a right general one every time.

## What to ask for

**The Randox Pathology Services Catalogue**, which is already outstanding for the sex-specific gap and for every panel tier above Basic Screen. Ask explicitly for the AGE BRACKETS as well as the sex splits: a catalogue that prints “adult” and nothing else does not close this.

## An adult-wide band is close to meaningless (4)

### Alkaline Phosphatase (ALP)

- **Stored today:** 30–130 U/L · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** Bone growth is a large part of circulating ALP, so the interval is far higher through adolescence, falls to an adult plateau, and rises again in later life. A single adult-wide band spans none of those states well. It is also the analyte most often raised for a reason worth finding, which is exactly when a band that is wrong for the patient’s age matters.

### DHEAS

- **Stored today:** 2.2–15.2 µmol/L · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** DHEAS peaks in early adulthood and declines markedly thereafter, which is the single largest age effect of any analyte in this catalogue. It is also on the WITHHELD list for the sex-specific work (the source excludes hormones), so it currently has neither split.

### Insulin Like Growth Factor 1 (IGF-1)

- **Stored today:** no catalogue range at all.
- **Why age matters:** IGF-1 falls steadily and steeply across adult life — it is the analyte whose reference interval is most routinely quoted per decade rather than for adults as a group. An adult-wide band is not a usable comparison for either end of that range, and this marker is reported precisely because somebody wants to place a patient against their own age group.

### Total PSA

- **Stored today:** 0–3 µg/L · sex MALE · no age bracket · provenance `PUBLISHED`
- **Why age matters:** PSA rises with age in men with no prostate disease, and age-specific thresholds are the ordinary clinical practice rather than a refinement of it. One adult band over-refers younger men and under-refers older ones; the second of those is the failure that does not announce itself.

## An adult-wide band describes a population the patient may not be in (6)

### Anti-Mullerian Hormone (AMH)

- **Stored today:** 7–35 pmol/L · sex FEMALE · no age bracket · provenance `UNSOURCED`
- **Why age matters:** AMH declines with age throughout adult life and is reported almost exclusively to place somebody against their own age group. A band without one answers a different question from the one being asked.

### Follicle Stimulating Hormone (FSH)

- **Stored today:** 1.5–12.4 IU/L · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** The interval changes at menopause rather than gradually, so for women it is age-related in a step rather than a slope. A single band cannot express a step and reads as one continuous population.

### Luteinising Hormone

- **Stored today:** 1.7–8.6 IU/L · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** Same step change at menopause as FSH, and the two are read together.

### Oestradiol

- **Stored today:** 100–500 pmol/L · sex FEMALE · no age bracket · provenance `UNSOURCED`
- **Why age matters:** Falls at menopause and is cycle-dependent before it, so a single adult band is a range that applies to nobody in particular. Also on the sex-specific WITHHELD list.

### Sex Hormone Binding Globulin (SHBG)

- **Stored today:** 10–57 nmol/L · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** Rises with age, which partly offsets the testosterone decline — so an age-blind SHBG and an age-blind testosterone are wrong in opposite directions, and the free androgen index derived from both inherits whatever they get.

### Testosterone

- **Stored today:** 8.6–29 nmol/L · sex MALE · no age bracket · provenance `UNSOURCED`
- **Why age matters:** Declines gradually through adult life in men. Also on the sex-specific WITHHELD list, so it currently has neither split.

## An adult-wide band is roughly right and measurably wrong (4)

### Creatinine

- **Stored today:** 50–98 µmol/L · sex FEMALE · no age bracket · provenance `PUBLISHED`
- **Stored today:** 64–111 µmol/L · sex MALE · no age bracket · provenance `PUBLISHED`
- **Why age matters:** Tracks muscle mass, which falls with age, so an older patient sits lower for the same kidney function. It DOES now carry a sex split from NHS Lothian, which is the larger of the two effects; the age effect is on top of that.

### eGFR

- **Stored today:** 90–999 mL/min/1.73m² · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** Age is already INSIDE the calculation, so the reported value is age-adjusted before it reaches us — but the interval it is compared against is not, and normal eGFR declines with age regardless. This one needs the least urgent attention of the fourteen and is on the list so nobody re-derives that reasoning.

### Haemoglobin

- **Stored today:** 115–160 g/L · sex FEMALE · no age bracket · provenance `PUBLISHED`
- **Stored today:** 135–180 g/L · sex MALE · no age bracket · provenance `PUBLISHED`
- **Why age matters:** The interval differs in later life as well as by sex. The sex split is loaded (NHS Lothian); the age effect on top of it is not, and anaemia in older patients is exactly where the difference is read.

### TSH

- **Stored today:** 0.4–4 mIU/L · sex ANY · no age bracket · provenance `UNSOURCED`
- **Why age matters:** The upper limit of the population interval rises with age, so older patients are flagged as subclinically raised against a younger population’s ceiling. The effect is smaller than the four above and lands on a very large number of patients.

## The loader

Rows go in `apps/server/prisma/ageBandedReferenceRanges.ts` as `AGE_BANDED_RANGES`, in the same shape the sex-specific ranges use: the printed form exactly as the document has it, the stored form in our unit, the conversion factor between them as data where they differ, and the citation. `seedAgeBandedReferenceRanges()` in `prisma/seed.ts` writes them through `lib/catalogueRanges.ts`, which asserts the row it is about to touch is a catalogue row and not a patient’s own record, and refuses to overwrite a `RANDOX` range.

**The blanket row is not deleted**, unlike the sex-specific loader’s. A sex split is exhaustive; a set of age brackets is not, and deleting the unbounded band would leave anybody outside the brackets with no suggestion at all.
