-- Aprender matéria fica arquivado até existir uma decisão explícita de retoma.
INSERT INTO app_module_settings (module_key,enabled,updated_by,updated_at)
VALUES ('quizzes.learning',0,NULL,unixepoch()*1000)
ON CONFLICT(module_key) DO UPDATE SET enabled=0,updated_by=NULL,updated_at=excluded.updated_at;
