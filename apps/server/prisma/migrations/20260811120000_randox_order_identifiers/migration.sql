-- Randox hand back three identifiers across the order lifecycle and the client
-- was built believing two of them were one thing under two names:
--
--   CreateOrder / CreatePendingOrder  -> { orderId, externalNumber }
--   GetOrderStatus                    -> { orderNumber, orderId }
--
-- The spec's own examples use different prefixes for externalNumber
-- ("GC1123-00010300") and orderNumber ("GP-THE-00000130"), so they are stored
-- as separate columns and neither overwrites the other. Automatic linking
-- joins on randoxOrderId, which is the only identifier that provably appears
-- on both sides.
ALTER TABLE "RandoxOrder" ADD COLUMN "externalNumber" TEXT;
ALTER TABLE "RandoxOrder" ADD COLUMN "orderNumberConfirmed" BOOLEAN NOT NULL DEFAULT false;

-- Existing rows: orderNumber was written from the creation response, which is
-- externalNumber. Backfilling it into the new column says exactly that, and
-- leaves orderNumberConfirmed false because no GetOrderStatus has corroborated
-- it. A row where the two later turn out to differ is then visible as one.
UPDATE "RandoxOrder" SET "externalNumber" = "orderNumber" WHERE "externalNumber" IS NULL;
