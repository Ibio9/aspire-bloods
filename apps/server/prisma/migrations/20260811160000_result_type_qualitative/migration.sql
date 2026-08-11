-- A fifth result type, for the twenty-two catalogue entries that were MEASURED
-- and had no unit because there is no quantity to put a unit on: the sixteen
-- UTI organisms and three resistance markers (detected / not detected), the
-- resting ECG (a trace somebody reads), the body composition analyser (a
-- device you stand on) and the prostate cancer risk score (a calculation).
--
-- Additive only. Nothing is re-typed by this migration: the seed's catalogue
-- import carries the new value onto the affected markers, which is the same
-- path every other result-type change has taken.
ALTER TYPE "ResultType" ADD VALUE IF NOT EXISTS 'QUALITATIVE';
