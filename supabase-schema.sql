-- =============================================
-- Painel de Leitura — Schema Supabase
-- Execute no SQL Editor do Supabase
-- =============================================

-- Tabela principal
CREATE TABLE IF NOT EXISTS user_reading_data (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_reading_data IS 'Dados de livros e progresso de leitura por usuário';
COMMENT ON COLUMN user_reading_data.user_id IS 'ID do usuário (auth.users)';
COMMENT ON COLUMN user_reading_data.payload IS 'Array de livros em JSON';
COMMENT ON COLUMN user_reading_data.created_at IS 'Data de criação do registro';
COMMENT ON COLUMN user_reading_data.updated_at IS 'Última atualização';

-- RLS (Row Level Security)
ALTER TABLE user_reading_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário acessa apenas seus dados" ON user_reading_data;
DROP POLICY IF EXISTS "Usuário pode inserir seus dados" ON user_reading_data;
DROP POLICY IF EXISTS "Usuário pode atualizar seus dados" ON user_reading_data;
DROP POLICY IF EXISTS "Usuário pode ler seus dados" ON user_reading_data;

CREATE POLICY "Usuário pode ler seus dados"
  ON user_reading_data FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário pode inserir seus dados"
  ON user_reading_data FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário pode atualizar seus dados"
  ON user_reading_data FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_reading_data_updated_at ON user_reading_data;
CREATE TRIGGER trigger_user_reading_data_updated_at
  BEFORE UPDATE ON user_reading_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar Realtime (sync entre dispositivos)
-- Se der erro, habilite em: Supabase Dashboard > Database > Replication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_reading_data;
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignora se já habilitado ou publicação inexistente
END $$;
