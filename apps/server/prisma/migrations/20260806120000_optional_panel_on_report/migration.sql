-- A report does not have to come from a catalogue panel. A one-off or
-- ad-hoc set of markers is a legitimate report with no panel behind it.
-- Widening only (NOT NULL -> NULL) so this is safe on existing rows: every
-- current report keeps its panel, nothing is rewritten.
ALTER TABLE "Report" ALTER COLUMN "panelId" DROP NOT NULL;
