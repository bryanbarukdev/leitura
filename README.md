# Painel de Leitura

Acompanhe seu progresso de leitura com sincronização entre dispositivos (Supabase).

## Estrutura do Projeto

```
leitura/
├── index.html          # Página principal
├── css/
│   └── styles.css      # Estilos
├── js/
│   ├── config.js       # Configuração (Supabase, JSON)
│   └── app.js          # Lógica da aplicação
├── dados-leitura.json  # Dados locais (quando sem Supabase)
├── Livros/             # Capas e PDFs dos livros
├── supabase-schema.sql # Schema do banco (Supabase)
└── SUPABASE_SETUP.md   # Instruções de configuração
```

## Configuração

1. **Supabase**: edite `js/config.js` com sua URL e chave
2. **Schema**: execute `supabase-schema.sql` no SQL Editor do Supabase
3. Veja `SUPABASE_SETUP.md` para detalhes

## Desenvolvimento

Abra `index.html` em um servidor local (ex.: Live Server) ou hospede em GitHub Pages.
