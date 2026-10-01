-- Eventos de dia inteiro (sem hora de início nem de fim) e eventos com vários dias.
ALTER TABLE academic_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE personal_calendar_events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0;

-- As datas registadas em 0108 só têm dia (ou período), nunca hora: passam a dia inteiro
-- e os textos ficam curtos e diretos. Limites em hora de Lisboa (início 00:00, fim 23:59:59.999).
UPDATE academic_events SET all_day=1, title='Pagamento do jantar de curso',
  description='Último dia para pagar.' WHERE id='event-2026-dinner-payment';

UPDATE academic_events SET all_day=1, title='Jantar de curso',
  description='Hora e local por confirmar.' WHERE id='event-2026-course-dinner';

UPDATE academic_events SET all_day=1, title='1.ª frequência de Fisiologia I',
  description='De manhã. Hora por confirmar.' WHERE id='event-2026-fis1-frequency-1';

UPDATE academic_events SET all_day=1, title='2.ª frequência de Fisiologia I',
  description='De manhã. Hora por confirmar.' WHERE id='event-2026-fis1-frequency-2';

-- Um só evento de dois dias em vez de dois eventos separados.
UPDATE academic_events SET all_day=1, title='Teste de microscópio de Histologia I',
  description='Durante a aula, no dia 10 ou 11 conforme a turma.', ends_at=1797033599999
  WHERE id='event-2026-hist1-microscope-10';
DELETE FROM academic_events WHERE id='event-2026-hist1-microscope-11';

UPDATE academic_events SET all_day=1, title='Exame prático de DECIDES I',
  description='Vale 30% da nota. Dia e hora por confirmar.' WHERE id='event-2026-decides1-practical-week';

UPDATE academic_events SET all_day=1, title='Entrega do trabalho de Medicina Preventiva',
  description='Relatório e apresentação valem 15% da nota.' WHERE id='event-2026-mp-submission';

UPDATE academic_events SET all_day=1, title='Apresentação do trabalho de Medicina Preventiva',
  description='À tarde. Hora por confirmar.', starts_at=1797379200000, ends_at=1797465599999
  WHERE id='event-2026-mp-presentation';

-- Frequências de Fisiologia I: o período da manhã passa a ocupar o dia inteiro.
UPDATE academic_events SET ends_at=1793836799999 WHERE id='event-2026-fis1-frequency-1';
UPDATE academic_events SET ends_at=1797465599999 WHERE id='event-2026-fis1-frequency-2';
