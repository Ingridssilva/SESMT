-- ============================================================
-- migration_melhorias.sql
-- Aplicar no Supabase SQL Editor (use incógnito para evitar
-- tradução automática que quebra a sintaxe).
-- ============================================================

-- 1. Índice em nc_historico.nc_id (melhora GET /api/ncs/<id>)
CREATE INDEX IF NOT EXISTS idx_nc_historico_nc_id
    ON nc_historico(nc_id);

-- 2. Índice em checklist_respostas.preenchimento_id (join frequente)
CREATE INDEX IF NOT EXISTS idx_checklist_respostas_preenchimento_id
    ON checklist_respostas(preenchimento_id);

-- 3. Índice em checklist_preenchimentos.inspecao_id e lideranca_id
CREATE INDEX IF NOT EXISTS idx_cp_inspecao_id
    ON checklist_preenchimentos(inspecao_id);

CREATE INDEX IF NOT EXISTS idx_cp_lideranca_id
    ON checklist_preenchimentos(lideranca_id);

-- 4. Índice em nao_conformidades.status (filtro mais comum)
CREATE INDEX IF NOT EXISTS idx_nc_status
    ON nao_conformidades(status);

-- 5. Coluna pdf_url em checklist_preenchimentos
--    (rastreia URL do PDF no SharePoint; usado por webhook ZapSign)
ALTER TABLE checklist_preenchimentos
    ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- 6. Sequences para o ano atual e próximo
--    (elimina o CREATE SEQUENCE em runtime que causava double-commit)
DO $$
DECLARE
    ano INT := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
BEGIN
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS seq_inspecoes_%s START 1', ano);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS seq_inspecoes_%s START 1', ano + 1);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS seq_inspecoes_lideranca_%s START 1', ano);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS seq_inspecoes_lideranca_%s START 1', ano + 1);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS seq_nao_conformidades_%s START 1', ano);
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS seq_nao_conformidades_%s START 1', ano + 1);
END$$;

-- ============================================================
-- Verificar resultado
-- ============================================================
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN (
    'idx_nc_historico_nc_id',
    'idx_checklist_respostas_preenchimento_id',
    'idx_cp_inspecao_id',
    'idx_cp_lideranca_id',
    'idx_nc_status'
)
ORDER BY tablename, indexname;
