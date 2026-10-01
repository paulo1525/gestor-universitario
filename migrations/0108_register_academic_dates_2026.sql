-- Academic dates and course dinner explicitly supplied by the user on 2026-10-01.

-- Whole-day/period bounds represent dates, not confirmed appointment times.

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-dinner-payment','Pagamento do jantar de curso — prazo limite','Prazo indicado pelo utilizador: terça-feira, 6 de outubro de 2026. Hora limite não indicada.','deadline',NULL,1791241200000,1791327599999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Pagamento do jantar de curso — prazo limite' AND starts_at=1791241200000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-course-dinner','Jantar de curso','Jantar de curso em 8 de outubro de 2026. Hora e local por confirmar.','event',NULL,1791414000000,1791500399999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Jantar de curso' AND starts_at=1791414000000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-fis1-frequency-1','Fisiologia I — 1.ª frequência (de manhã)','Data comunicada na reunião de início de ano: 4 de novembro. Período da manhã; hora exata por confirmar.','assessment',(SELECT id FROM curricular_units WHERE code='FIS1' AND active=1 LIMIT 1),1793750400000,1793793599999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Fisiologia I — 1.ª frequência (de manhã)' AND starts_at=1793750400000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-fis1-frequency-2','Fisiologia I — 2.ª frequência (de manhã)','Data comunicada na reunião de início de ano: 16 de dezembro. Período da manhã; hora exata por confirmar.','assessment',(SELECT id FROM curricular_units WHERE code='FIS1' AND active=1 LIMIT 1),1797379200000,1797422399999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Fisiologia I — 2.ª frequência (de manhã)' AND starts_at=1797379200000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-hist1-microscope-10','Histologia I — teste de microscópio (10 de dezembro)','Teste durante a aula, em 10 ou 11 de dezembro, conforme a turma. Hora correspondente à aula; confirmar a distribuição por turma.','assessment',(SELECT id FROM curricular_units WHERE code='HIST1' AND active=1 LIMIT 1),1796860800000,1796947199999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Histologia I — teste de microscópio (10 de dezembro)' AND starts_at=1796860800000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-hist1-microscope-11','Histologia I — teste de microscópio (11 de dezembro)','Teste durante a aula, em 10 ou 11 de dezembro, conforme a turma. Hora correspondente à aula; confirmar a distribuição por turma.','assessment',(SELECT id FROM curricular_units WHERE code='HIST1' AND active=1 LIMIT 1),1796947200000,1797033599999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Histologia I — teste de microscópio (11 de dezembro)' AND starts_at=1796947200000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-decides1-practical-week','DECIDES I — exame prático (semana de 30 de novembro)','Exame final prático, com ponderação de 30%, na semana de 30 de novembro a 6 de dezembro de 2026. Dia e hora exatos por confirmar; este registo representa a semana indicada.','exam',(SELECT id FROM curricular_units WHERE code='DECIDESI' AND active=1 LIMIT 1),1795996800000,1796601599999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='DECIDES I — exame prático (semana de 30 de novembro)' AND starts_at=1795996800000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-mp-submission','Medicina Preventiva — submissão do trabalho','Submissão em 11 de dezembro. O trabalho (relatório e apresentação) corresponde a 15% da avaliação. Hora limite não indicada.','deadline',(SELECT id FROM curricular_units WHERE code='MP' AND active=1 LIMIT 1),1796947200000,1797033599999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Medicina Preventiva — submissão do trabalho' AND starts_at=1796947200000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT OR IGNORE INTO academic_events(id,title,description,event_type,curricular_unit_id,starts_at,ends_at,location,visibility,status,created_by,updated_by,created_at,updated_at)
SELECT 'event-2026-mp-presentation','Medicina Preventiva — apresentação do trabalho (à tarde)','Apresentação em 16 de dezembro à tarde. O trabalho (relatório e apresentação) corresponde a 15% da avaliação. Hora exata por confirmar.','assessment',(SELECT id FROM curricular_units WHERE code='MP' AND active=1 LIMIT 1),1797422400000,1797465599999,NULL,'students','scheduled',u.id,u.id,unixepoch()*1000,unixepoch()*1000
FROM users u WHERE u.status='active' AND (u.commission_position='principal_admin' OR u.role='admin')
AND NOT EXISTS(SELECT 1 FROM academic_events WHERE title='Medicina Preventiva — apresentação do trabalho (à tarde)' AND starts_at=1797422400000)
ORDER BY CASE WHEN u.commission_position='principal_admin' THEN 0 ELSE 1 END,u.created_at LIMIT 1;

INSERT INTO admin_audit_log(actor_user_id,action,details,created_at)
SELECT id,'calendar_dates_registered','{"source":"authorized-academic-dates-2026-10-01","events":9,"dinner":"2026-10-08","paymentDeadline":"2026-10-06","timezone":"Europe/Lisbon"}',unixepoch()*1000
FROM users WHERE status='active' AND (commission_position='principal_admin' OR role='admin')
AND NOT EXISTS(SELECT 1 FROM admin_audit_log WHERE action='calendar_dates_registered' AND details LIKE '%authorized-academic-dates-2026-10-01%')
ORDER BY CASE WHEN commission_position='principal_admin' THEN 0 ELSE 1 END,created_at LIMIT 1;
