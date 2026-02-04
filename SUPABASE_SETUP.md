# Configuração Supabase — Painel de Leitura

Para sincronizar seus dados entre celular e PC, configure o Supabase:

## 1. Criar projeto

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. **New Project** → nome, senha do banco, região
3. Em **Project Settings** → **API**: copie **Project URL** e **anon public**

## 2. Configurar credenciais

Edite `js/config.js` com sua **Project URL** e **anon public**.

## 3. Executar o schema (OBRIGATÓRIO)

**Sem isso, a tabela não existe e o sync não funciona.**

1. No Supabase: **SQL Editor** → **New query**
2. Cole todo o conteúdo de `supabase-schema.sql`
3. Clique em **Run** e confira se não há erros
4. Em **Table Editor**, confirme que a tabela `user_reading_data` foi criada

## 4. Confirmar e-mail (se usar signup)

Em **Authentication** → **Providers** → **Email**:  
desative "Confirm email" se quiser usar sem confirmar no e-mail.

## 5. Usar

1. Abra o site no celular e no PC
2. Crie conta ou entre com o mesmo e-mail e senha
3. As alterações sincronizam automaticamente. Use **Sincronizar agora** para forçar envio e ver erros.
