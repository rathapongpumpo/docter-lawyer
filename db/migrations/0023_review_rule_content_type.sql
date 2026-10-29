-- Review-playbook rules go through the same review workflow as other content (FR-CR-011): the review log accepts them
ALTER TABLE kb.content_reviews DROP CONSTRAINT content_reviews_content_type_check;
ALTER TABLE kb.content_reviews ADD CONSTRAINT content_reviews_content_type_check CHECK (content_type IN (
  'article','law_version','guide','template','course','glossary','judgment','help_agency','court','court_fee','prescription_rule','prompt_version','review_rule'));
