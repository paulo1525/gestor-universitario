-- Mantém o sistema de testes acessível após a publicação desta versão.
INSERT INTO app_module_settings (module_key, enabled, updated_by, updated_at) VALUES
  ('quizzes', 1, NULL, unixepoch() * 1000),
  ('quizzes.practice', 1, NULL, unixepoch() * 1000),
  ('quizzes.progress', 1, NULL, unixepoch() * 1000),
  ('quizzes.management', 1, NULL, unixepoch() * 1000)
ON CONFLICT(module_key) DO UPDATE SET
  enabled = 1,
  updated_by = NULL,
  updated_at = excluded.updated_at;
