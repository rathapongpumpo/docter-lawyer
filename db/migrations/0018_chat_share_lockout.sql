-- FR-CHAT-027 AC1: a wrong share-link password 5 times locks the link for 15 minutes.
ALTER TABLE app.chat_shares ADD COLUMN failed_attempts int NOT NULL DEFAULT 0, ADD COLUMN locked_until timestamptz;
