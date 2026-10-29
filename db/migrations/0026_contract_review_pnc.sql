-- Contract review backend `pnc`: the company chat API answers one question per clause (docs/03-technical-spec.md §7.16).
-- Findings of this backend have the neutral level `unrated` (kept inside the encrypted findings JSON and counted in finding_counts).
ALTER TABLE app.contract_reviews DROP CONSTRAINT contract_reviews_backend_check;
ALTER TABLE app.contract_reviews ADD CONSTRAINT contract_reviews_backend_check CHECK (backend IN ('mock','http','pnc'));
