-- Percursos de aprendizagem que alternam explicações curtas e exercícios.
INSERT INTO app_module_settings (module_key, enabled, updated_by, updated_at) VALUES
  ('quizzes.learning', 1, NULL, unixepoch() * 1000)
ON CONFLICT(module_key) DO UPDATE SET
  enabled = 1,
  updated_by = NULL,
  updated_at = excluded.updated_at;

CREATE TABLE learning_modules (
  id TEXT PRIMARY KEY,
  curricular_unit_id TEXT NOT NULL REFERENCES curricular_units(id) ON DELETE RESTRICT,
  quiz_topic_id TEXT REFERENCES quiz_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  estimated_minutes INTEGER NOT NULL DEFAULT 10 CHECK (estimated_minutes BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(curricular_unit_id, title)
);

CREATE INDEX idx_learning_modules_catalog
ON learning_modules(curricular_unit_id, status, sort_order, title);

CREATE TABLE learning_steps (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 1),
  step_type TEXT NOT NULL CHECK (step_type IN ('explanation', 'exercise')),
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  question_id TEXT REFERENCES quiz_questions(id) ON DELETE RESTRICT,
  answer_format TEXT CHECK (answer_format IN ('multiple_choice', 'short_answer')),
  expected_answer TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(module_id, position),
  CHECK (
    (step_type = 'explanation' AND question_id IS NULL AND answer_format IS NULL)
    OR
    (step_type = 'exercise' AND question_id IS NOT NULL AND answer_format IS NOT NULL)
  )
);

CREATE INDEX idx_learning_steps_module
ON learning_steps(module_id, position);

CREATE TABLE learning_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  module_id TEXT NOT NULL REFERENCES learning_modules(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  current_step_position INTEGER NOT NULL DEFAULT 1 CHECK (current_step_position >= 1),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_learning_attempts_one_active
ON learning_attempts(user_id, module_id)
WHERE status = 'active';

CREATE INDEX idx_learning_attempts_user_history
ON learning_attempts(user_id, updated_at DESC);

CREATE TABLE learning_step_responses (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES learning_attempts(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL REFERENCES learning_steps(id) ON DELETE RESTRICT,
  selected_option_id TEXT,
  answer_text TEXT,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(attempt_id, step_id),
  CHECK (
    (selected_option_id IS NOT NULL AND answer_text IS NULL)
    OR
    (selected_option_id IS NULL AND answer_text IS NOT NULL)
  )
);

CREATE INDEX idx_learning_responses_attempt
ON learning_step_responses(attempt_id, step_id);

-- Primeiro percurso: uma introdução orientada à Neuroanatomia já publicada.
INSERT INTO learning_modules (
  id, curricular_unit_id, quiz_topic_id, title, summary,
  estimated_minutes, status, sort_order, published_at, created_at, updated_at
)
SELECT
  'learning-neuro-a1', cu.id, qt.id,
  'Organização geral do sistema nervoso central',
  'Cinco ciclos curtos para relacionar a organização do sistema nervoso central, a substância cinzenta e branca, as vias cruzadas, as colunas funcionais e o sistema ventricular.',
  12, 'published', 1, unixepoch() * 1000, unixepoch() * 1000, unixepoch() * 1000
FROM curricular_units cu
JOIN quiz_topics qt ON qt.curricular_unit_id = cu.id
WHERE cu.code = 'NEURO'
  AND cu.active = 1
  AND qt.id = 'quiz-topic-neuro-aula-1'
ON CONFLICT(id) DO UPDATE SET
  curricular_unit_id = excluded.curricular_unit_id,
  quiz_topic_id = excluded.quiz_topic_id,
  title = excluded.title,
  summary = excluded.summary,
  estimated_minutes = excluded.estimated_minutes,
  status = 'published',
  sort_order = excluded.sort_order,
  published_at = COALESCE(learning_modules.published_at, excluded.published_at),
  updated_at = excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-01', id, 1, 'explanation', 'Do centro para a periferia',
  '<p>O <strong>sistema nervoso central</strong> é constituído pelo encéfalo e pela espinal medula. Os nervos cranianos e os nervos raquidianos pertencem à componente periférica e estabelecem a comunicação entre estes centros e o restante organismo.</p><p>Esta distinção é estrutural: o encéfalo ocupa a cavidade craniana; a espinal medula continua-se inferiormente no canal vertebral.</p>',
  NULL, NULL, NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET title=excluded.title,content_html=excluded.content_html,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-02', id, 2, 'exercise', 'Aplicar a distinção estrutural', '', 'quiz-neuro-a1-001', 'multiple_choice', NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET question_id=excluded.question_id,answer_format=excluded.answer_format,expected_answer=excluded.expected_answer,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-03', id, 3, 'explanation', 'Substância cinzenta e substância branca',
  '<p>A <strong>substância cinzenta</strong> concentra sobretudo corpos celulares neuronais, dendrites e sinapses. A <strong>substância branca</strong> é dominada por axónios, muitos deles mielinizados.</p><p>A mielina é rica em lípidos e confere à substância branca a tonalidade mais pálida. A posição relativa destas substâncias varia: no cérebro, a substância cinzenta forma o córtex superficial e núcleos profundos; na espinal medula, ocupa uma posição central.</p>',
  NULL, NULL, NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET title=excluded.title,content_html=excluded.content_html,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-04', id, 4, 'exercise', 'Explicar a cor da substância branca', '', 'quiz-neuro-a1-004', 'short_answer', 'Mielina nos axónios', unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET question_id=excluded.question_id,answer_format=excluded.answer_format,expected_answer=excluded.expected_answer,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-05', id, 5, 'explanation', 'Cruzamento e organização contralateral',
  '<p>Muitas vias nervosas atravessam a linha mediana. Este <strong>cruzamento</strong> permite que informação de uma metade do corpo seja processada no lado oposto do encéfalo e que esse lado participe no respetivo controlo motor.</p><p>A consequência funcional é uma organização frequentemente contralateral, embora o local do cruzamento varie entre vias.</p>',
  NULL, NULL, NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET title=excluded.title,content_html=excluded.content_html,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-06', id, 6, 'exercise', 'Prever o efeito de um cruzamento', '', 'quiz-neuro-a1-005', 'multiple_choice', NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET question_id=excluded.question_id,answer_format=excluded.answer_format,expected_answer=excluded.expected_answer,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-07', id, 7, 'explanation', 'Colunas funcionais do tronco cerebral',
  '<p>Os neurónios com funções semelhantes organizam-se em colunas longitudinais. Entre as colunas motoras, a <strong>somática</strong> dirige-se a músculos derivados dos sómitos da cabeça, a <strong>branquial</strong> a músculos derivados da parede da faringe embrionária e a <strong>visceral</strong> contém fibras pré-ganglionares parassimpáticas para glândulas e músculo liso.</p>',
  NULL, NULL, NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET title=excluded.title,content_html=excluded.content_html,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-08', id, 8, 'exercise', 'Identificar a componente visceral', '', 'quiz-neuro-a1-009', 'short_answer', 'Fibras pré-ganglionares parassimpáticas', unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET question_id=excluded.question_id,answer_format=excluded.answer_format,expected_answer=excluded.expected_answer,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-09', id, 9, 'explanation', 'Continuidade do sistema ventricular',
  '<p>Os ventrículos laterais comunicam com o terceiro ventrículo, que é mediano e se situa entre as duas metades do diencéfalo. O <strong>aqueduto cerebral</strong> atravessa o mesencéfalo e liga o terceiro ao quarto ventrículo.</p><p>Inferiormente, o quarto ventrículo continua-se com o canal central da espinal medula e comunica também com o espaço subaracnoideu.</p>',
  NULL, NULL, NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET title=excluded.title,content_html=excluded.content_html,updated_at=excluded.updated_at;

INSERT INTO learning_steps (id, module_id, position, step_type, title, content_html, question_id, answer_format, expected_answer, created_at, updated_at)
SELECT 'learning-neuro-a1-step-10', id, 10, 'exercise', 'Localizar a ligação ventricular', '', 'quiz-neuro-a1-048', 'multiple_choice', NULL, unixepoch() * 1000, unixepoch() * 1000
FROM learning_modules WHERE id = 'learning-neuro-a1'
ON CONFLICT(id) DO UPDATE SET question_id=excluded.question_id,answer_format=excluded.answer_format,expected_answer=excluded.expected_answer,updated_at=excluded.updated_at;
