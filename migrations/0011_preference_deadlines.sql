INSERT OR IGNORE INTO app_settings (key,value,updated_at) SELECT 'preferences_open_at',value,unixepoch()*1000 FROM app_settings WHERE key='classes_close_at';
INSERT OR IGNORE INTO app_settings (key,value,updated_at) SELECT 'preferences_close_at',strftime('%Y-%m-%dT%H:%M:%fZ',value,'+7 days'),unixepoch()*1000 FROM app_settings WHERE key='classes_close_at';
