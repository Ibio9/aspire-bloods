-- Panels become optional on Report — Aspire's own in-house/one-off marker
-- results have no packaged panel to attach to.
ALTER TABLE "Report" ALTER COLUMN "panelId" DROP NOT NULL;

-- Pricing has no place in a patient results portal.
ALTER TABLE "Panel" DROP COLUMN "b2bPriceGBP";
ALTER TABLE "Marker" DROP COLUMN "addOnPriceGBP";
