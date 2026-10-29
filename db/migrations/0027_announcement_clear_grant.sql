-- Clearing the system announcement deletes its row (admin_clear_announcement); lc_web was only granted SELECT/INSERT/UPDATE.
GRANT DELETE ON app.system_settings TO lc_web;
