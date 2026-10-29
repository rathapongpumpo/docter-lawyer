-- The chat's legal-scope picker marks categories that have nothing in the knowledge library yet (FR-CHAT-011).
-- lc_web cannot read kb.chunks (embeddings are the AI service's), so it asks through this function, which returns only counts.
CREATE FUNCTION kb.category_content(p_drafts boolean)
RETURNS TABLE (code text, name_th text, name_en text, has_content boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = kb, pg_temp AS $$
  SELECT k.code, k.name_th, k.name_en,
         EXISTS (SELECT 1 FROM kb.chunks c
                 WHERE (c.is_published OR p_drafts)
                   AND c.category_ids && (SELECT array_agg(x.id) FROM kb.categories x WHERE x.id = k.id OR x.parent_id = k.id))
  FROM kb.categories k WHERE k.parent_id IS NULL AND k.is_active ORDER BY k.sort_order, k.id
$$;
REVOKE ALL ON FUNCTION kb.category_content FROM PUBLIC;
GRANT EXECUTE ON FUNCTION kb.category_content TO lc_web;
