-- Garante ao nível da D1 que nunca podem coexistir duas distribuições
-- aplicadas/publicadas ainda ativas, mesmo perante pedidos concorrentes.
CREATE UNIQUE INDEX idx_distribution_single_active
  ON distribution_proposals ((1))
  WHERE invalidated_at IS NULL
    AND status IN ('applied', 'published');
