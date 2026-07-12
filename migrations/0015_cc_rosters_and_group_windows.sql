INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_1_open_at', value, unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_open_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_1_close_at', value, unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_close_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_2_open_at', datetime(value, '+1 day'), unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_open_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_2_close_at', datetime(value, '+1 day'), unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_close_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_3_open_at', datetime(value, '+2 days'), unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_open_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_3_close_at', datetime(value, '+2 days'), unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_close_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_4_open_at', datetime(value, '+3 days'), unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_open_at';
INSERT OR IGNORE INTO app_settings (key, value, updated_at)
SELECT 'preferences_group_4_close_at', datetime(value, '+3 days'), unixepoch() * 1000 FROM app_settings WHERE key = 'preferences_close_at';

ALTER TABLE class_students ADD COLUMN additional_info_validation TEXT
  CHECK(additional_info_validation IN ('friends_other_class', 'integration_bullying', 'other'));
ALTER TABLE class_students ADD COLUMN additional_info_validation_note TEXT;
