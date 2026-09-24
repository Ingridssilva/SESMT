-- migration_offline.sql
-- Adiciona coluna local_id nas tabelas de inspeção para deduplicação de sync offline.
-- Execute uma vez no Supabase (SQL Editor) antes de fazer deploy desta versão.
--
-- Seguro para executar múltiplas vezes (IF NOT EXISTS / ON CONFLICT).

-- 1. Inspeções de campo
ALTER TABLE inspecoes
    ADD COLUMN IF NOT EXISTS local_id TEXT UNIQUE;

-- 2. Inspeções de liderança
ALTER TABLE inspecoes_lideranca
    ADD COLUMN IF NOT EXISTS local_id TEXT UNIQUE;

-- Índices para lookup rápido durante sync
CREATE INDEX IF NOT EXISTS idx_inspecoes_local_id
    ON inspecoes (local_id)
    WHERE local_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inspecoes_lideranca_local_id
    ON inspecoes_lideranca (local_id)
    WHERE local_id IS NOT NULL;

-- Verificação
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('inspecoes', 'inspecoes_lideranca')
  AND column_name = 'local_id';
