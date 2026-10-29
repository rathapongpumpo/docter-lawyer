-- The review playbook written from the knowledge base (docs/knowledge-base/review-playbook) uses clause types the first DDL did not list.
-- Widen the set instead of squeezing rules into a wrong type: a finding is grouped by clause type, so a misfiled rule would mislead.
ALTER TABLE kb.review_rules DROP CONSTRAINT review_rules_clause_type_check;
ALTER TABLE kb.review_rules ADD CONSTRAINT review_rules_clause_type_check CHECK (clause_type IN (
  'parties','subject','price_payment','delivery_acceptance','penalty','deposit','warranty_defects','termination','liability_limit',
  'dispute_jurisdiction','governing_law','other',
  'acceptance','time_for_performance','payment','interest','limitation_of_liability','dispute_resolution','non_compete','subcontract','variation'));
