-- FR-AUTH-019: "5 failed sign-ins within 15 minutes" needs the time of the last failure to open a fresh window.
ALTER TABLE app.users ADD COLUMN last_failed_login_at timestamptz;
