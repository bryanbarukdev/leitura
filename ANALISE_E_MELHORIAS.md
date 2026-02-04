# Análise Profunda do Painel de Leitura

## Funcionalidades Atuais

### Autenticação e Dados
- **Login/Signup** com Supabase (e-mail e senha)
- **Sincronização em nuvem** (Supabase) — dados iguais em celular e PC
- **Realtime** — alterações em um dispositivo refletem no outro
- Fallback para JSON/localStorage quando Supabase não está configurado

### Gestão de Livros
- Cadastro: título, autor, páginas, gêneros, status, anotações
- Capa (upload de imagem) e PDF anexado
- Status: Não Iniciado, Lendo, Pausado, Concluído
- Edição e exclusão de livros

### Sessões de Leitura
- Data, tempo (minutos), página inicial e final
- Avaliação em estrelas (1–5)
- Observações por sessão
- Histórico ordenado por data

### Estatísticas e Progresso
- Barra de progresso (páginas lidas / total)
- Número de sessões, páginas lidas, tempo total, avaliação média
- **Estimativa de conclusão** com base no ritmo (páginas/dia)

### Interface
- Layout responsivo (desktop e mobile)
- Navegação mobile: Livros e Novo
- Arrastar para fechar o painel de detalhes (mobile)
- Chips de gênero com scroll horizontal e drag
- Abrir PDF ao clicar na capa

---

## Funcionalidades Sugeridas

### Prioridade Alta

| Funcionalidade | Descrição |
|----------------|-----------|
| **Busca e filtro** | Campo de busca por título/autor; filtros por gênero, status e avaliação |
| **Ordenação** | Ordenar lista por título, autor, data de cadastro, progresso ou avaliação |
| **Editar livro pelo painel** | Botão "Editar" nos detalhes que preenche o formulário e permite salvar sem voltar à lista |
| **Meta de leitura** | Objetivo anual (ex: 12 livros) ou semanal (ex: 5h); indicador de progresso no header |
| **Exportar/Importar (Settings)** | Recolocar exportar JSON e importar em um menu Configurações, fora do fluxo principal |

### Prioridade Média

| Funcionalidade | Descrição |
|----------------|-----------|
| **ISBN / Open Library** | Busca por ISBN para preencher título, autor e capa automaticamente |
| **Tema claro/escuro** | Alternar tema (hoje só escuro) |
| **PWA** | Manifest + service worker para instalar como app e uso offline |
| **Cronômetro de leitura** | Timer na aba "Nova Leitura" para registrar tempo em tempo real |
| **Lista "Quero ler"** | Status/wishlist separado ou filtro dedicado |
| **Gráficos** | Páginas lidas por mês, livros concluídos por ano, ritmo de leitura |
| **Sair da conta** | Botão de logout em menu ou header (reintroduzir de forma discreta) |

### Prioridade Baixa

| Funcionalidade | Descrição |
|----------------|-----------|
| **Gêneros personalizados** | Adicionar novos gêneros além dos 8 fixos |
| **Série de livros** | Vincular livros em série (ex: Harry Potter 1, 2, 3) |
| **Notas com Markdown** | Anotações formatadas com **negrito**, listas, etc. |
| **Velocidade de leitura** | Calcular páginas/minuto e estimar tempo restante do livro |
| **Sequência de leitura** | Contador de dias consecutivos com sessões registradas |
| **Compartilhar progresso** | Gerar imagem para redes sociais (ex: “Li 50% de X”) |
| **Detecção de duplicados** | Aviso ao cadastrar livro com título e autor já existentes |
| **Lembretes** | Notificações para lembrar de ler (requer permissões do navegador) |

---

## Resumo por Área

### UX
- Busca, filtros e ordenação na lista de livros
- Edição direta no painel de detalhes
- Reintrodução de exportar/importar em Configurações
- Botão de logout visível

### Métricas e metas
- Meta de livros ou tempo por ano/mês
- Gráficos e painel geral de estatísticas
- Velocidade de leitura e sequência

### Conteúdo
- Busca por ISBN
- Gêneros customizados e séries
- Anotações em Markdown

### Técnico
- PWA (manifest + service worker)
- Tema claro/escuro
- Cronômetro integrado

---

## Ordem sugerida para implementar

1. Busca e filtro na lista
2. Editar livro a partir do painel de detalhes
3. Ordenação da lista
4. Botão de logout no header ou em um menu
5. Exportar/Importar em Configurações
6. Meta de leitura (ex: livros por ano)
7. Tema claro/escuro
8. Busca por ISBN
