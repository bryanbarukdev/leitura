# Configuração Supabase — Painel de Leitura

Para sincronizar seus dados entre celular e PC, configure o Supabase:

## 1. Criar projeto

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. **New Project** → nome, senha do banco, região
3. Em **Project Settings** → **API**: copie **Project URL** e **anon public**

## 2. Executar o schema

1. No Supabase: **SQL Editor** → **New query**
2. Cole o conteúdo de `supabase-schema.sql`
3. Execute (Run)

## 3. Configurar o projeto

No `index.html`, preencha (já configurado):

```javascript
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'sua-chave-anon';
```

## 4. Usar

1. Abra o site no celular e no PC
2. Crie conta ou entre com o mesmo e-mail e senha
3. As alterações sincronizam automaticamente entre os dispositivos

---

**Realtime**: Para sync em tempo real, o script já adiciona a tabela à publicação. Se der erro, habilite em: **Database** → **Replication** → `user_reading_data`.
