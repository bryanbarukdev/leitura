// --- CONFIGURAÇÃO SUPABASE (edite aqui ou use js/config.js) ---
        const SUPABASE_URL = (typeof window.SUPABASE_URL !== 'undefined' ? window.SUPABASE_URL : '') || 'https://dtcloojdcochyfjxlisk.supabase.co';
        const SUPABASE_ANON_KEY = (typeof window.SUPABASE_ANON_KEY !== 'undefined' ? window.SUPABASE_ANON_KEY : '') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0Y2xvb2pkY29jaHlmanhsaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjc0NTUsImV4cCI6MjA4NTgwMzQ1NX0.UXShBSGJcrD7vucFfslYMd1kgiG_ljXqwhxlBzkzCAg';
        const DADOS_JSON_FILE = (typeof window.DADOS_JSON_FILE !== 'undefined' ? window.DADOS_JSON_FILE : '') || 'dados-leitura.json';
        const STORAGE_KEY = 'readingTrackerBooks';
        const BACKUP_KEY = 'readingTrackerBooks_backup';
        const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
        
        let supabaseClient = null;
        if (SUPABASE_CONFIGURED && typeof window.supabase !== 'undefined') {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        
        function parseDataPayload(raw) {
            if (Array.isArray(raw)) return raw;
            if (raw && typeof raw === 'object' && Array.isArray(raw.books)) return raw.books;
            return [];
        }
        
        function logSupabase(op, result) {
            const msg = '[Supabase ' + op + '] ' + JSON.stringify(result, null, 2);
            console.log(msg);
            const el = document.getElementById('supabase-response');
            if (el) {
                el.textContent = 'Supabase: ' + op + ' → ' + (result.ok ? 'OK' : 'ERRO') + (result.error ? ' ' + JSON.stringify(result.error) : (result.data ? ' ' + JSON.stringify(result.data).slice(0, 200) : ''));
                el.style.display = 'block';
            }
        }
        
        async function getCurrentUser() {
            if (!supabaseClient) return null;
            let { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                const { data, error } = await supabaseClient.auth.refreshSession();
                if (!error && data?.session) session = data.session;
            }
            if (session?.user) return session.user;
            const { data: { user } } = await supabaseClient.auth.getUser();
            return user || null;
        }
        
        async function pushToSupabase(books) {
            if (!supabaseClient) {
                const r = { ok: false, error: 'Supabase não configurado', data: null };
                logSupabase('push', r);
                return r;
            }
            const user = await getCurrentUser();
            if (!user) {
                const r = { ok: false, error: 'Sessão expirada. Faça login novamente.', data: null };
                logSupabase('push', r);
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        title: 'Sessão expirada',
                        text: 'Faça login novamente para sincronizar. A página será recarregada.',
                        icon: 'warning',
                        confirmButtonText: 'OK'
                    }).then(() => location.reload());
                }
                return r;
            }
            let dataPayload = Array.isArray(books) ? books : (books?.books || []);
            if (JSON.stringify(dataPayload).length > 500000) {
                dataPayload = dataPayload.map(b => ({ ...b, pdfUrl: '' }));
            }
            const payload = dataPayload;
            const updated_at = new Date().toISOString();
            let data, error;
            const { data: existing } = await supabaseClient.from('user_reading_data').select('user_id').eq('user_id', user.id).maybeSingle();
            if (existing) {
                const res = await supabaseClient.from('user_reading_data').update({ payload, updated_at }).eq('user_id', user.id).select();
                data = res.data;
                error = res.error;
            } else {
                const res = await supabaseClient.from('user_reading_data').insert({ user_id: user.id, payload, updated_at }).select();
                data = res.data;
                error = res.error;
            }
            const result = { ok: !error, error: error ? { message: error.message, code: error.code, details: error.details } : null, data };
            logSupabase('push', result);
            return result;
        }
        
        async function loadBooksFromStorage() {
            if (SUPABASE_CONFIGURED) {
                if (!supabaseClient) {
                    console.error('Supabase configurado mas biblioteca não carregou. Verifique a conexão e a ordem dos scripts.');
                    return { books: [], fromSupabase: true };
                }
                const user = await getCurrentUser();
                if (user) {
                    try {
                        const response = await supabaseClient
                            .from('user_reading_data')
                            .select('payload')
                            .eq('user_id', user.id)
                            .maybeSingle();
                        const { data, error } = response;
                        logSupabase('load', { ok: !error, error: error ? { message: error.message, code: error.code } : null, rowCount: data ? 1 : 0 });
                        if (!error) {
                            const books = parseDataPayload(data?.payload || []);
                            return { books, fromSupabase: true };
                        }
                    } catch (e) {
                        logSupabase('load', { ok: false, error: String(e) });
                        console.warn('Falha ao carregar do Supabase:', e);
                    }
                    return { books: [], fromSupabase: true };
                }
                logSupabase('load', { ok: true, error: null, msg: 'Sem usuário logado' });
                return { books: [], fromSupabase: true };
            }
            try {
                const url = (DADOS_JSON_FILE || 'dados-leitura.json') + '?t=' + Date.now();
                const res = await fetch(url, { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    const books = parseDataPayload(data);
                    return { books, fromSupabase: false };
                }
            } catch (e) { /* ignorar */ }
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                if (data) return { books: parseDataPayload(JSON.parse(data)), fromSupabase: false };
            } catch (e) { /* ignorar */ }
            return { books: [], fromSupabase: false };
        }
        
        function normalizeBook(book) {
            let genres = Array.isArray(book.genres) ? book.genres : [];
            if (genres.length === 0 && book.genre) {
                genres = [book.genre];
            }
            return {
                ...book,
                pdfUrl: book.pdfUrl || '',
                readingSessions: Array.isArray(book.readingSessions) ? book.readingSessions : [],
                genres: genres.filter(Boolean)
            };
        }
        
        // Classe para gerenciar os livros
        const GOOGLE_BOOKS_API_KEY = (typeof window.GOOGLE_BOOKS_API_KEY !== 'undefined' ? window.GOOGLE_BOOKS_API_KEY : '') || '';
        
        class ReadingTracker {
            constructor(initialBooks) {
                this.books = Array.isArray(initialBooks) ? initialBooks.map(normalizeBook) : [];
                this.selectedBookId = null;
                this.detailFormDirty = false;
                this.googleCoverUrl = '';
                this.googlePdfUrl = '';
                this.init();
            }
            
            init() {
                this.setupEventListeners();
                this.setupStarRating();
                this.setupGenreChips();
                this.setupSessionTab();
                this.renderBooks();
                this.updateUI();
                this.setDefaultDate();
                if (window.innerWidth <= 768) {
                    const firstTab = document.querySelector('.bottom-nav [data-mobile-tab="list"]');
                    if (firstTab) firstTab.classList.add('active');
                }
            }
            
            setupGenreChips() {
                const GENRE_OPTIONS = [
                    { value: 'ficcao', label: 'Ficção' },
                    { value: 'nao-ficcao', label: 'Não Ficção' },
                    { value: 'fantasia', label: 'Fantasia' },
                    { value: 'ciencia', label: 'Ciência' },
                    { value: 'historia', label: 'História' },
                    { value: 'biografia', label: 'Biografia' },
                    { value: 'tecnologia', label: 'Tecnologia' },
                    { value: 'autoajuda', label: 'Autoajuda' }
                ];
                const wrap = document.getElementById('book-genres-wrap');
                wrap.innerHTML = '';
                GENRE_OPTIONS.forEach(({ value, label }) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'genre-chip';
                    btn.setAttribute('data-genre', value);
                    btn.textContent = label;
                    btn.addEventListener('click', (e) => {
                        if (wrap.dataset.didDrag === '1') {
                            delete wrap.dataset.didDrag;
                            return;
                        }
                        btn.classList.toggle('selected');
                    });
                    wrap.appendChild(btn);
                });
                wrap.addEventListener('mousedown', (e) => {
                    const startX = e.pageX;
                    const startScroll = wrap.scrollLeft;
                    delete wrap.dataset.didDrag;
                    const onMove = (e2) => {
                        const dx = startX - e2.pageX;
                        if (Math.abs(dx) > 4) {
                            wrap.dataset.didDrag = '1';
                            wrap.classList.add('dragging');
                            wrap.scrollLeft = startScroll + dx;
                        }
                    };
                    const onUp = () => {
                        wrap.classList.remove('dragging');
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            }
            
            setupStarRating() {
                const container = document.getElementById('star-rating-input');
                const input = document.getElementById('session-rating');
                const starPath = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
                
                for (let i = 1; i <= 5; i++) {
                    const star = document.createElement('span');
                    star.className = 'star';
                    star.setAttribute('data-value', i);
                    star.setAttribute('tabindex', '0');
                    star.setAttribute('role', 'button');
                    star.innerHTML = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${starPath}"/></svg>`;
                    star.addEventListener('click', () => {
                        input.value = i;
                        this.updateStarDisplay(container, parseInt(input.value, 10));
                    });
                    star.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            input.value = i;
                            this.updateStarDisplay(container, parseInt(input.value, 10));
                        }
                    });
                    container.appendChild(star);
                }
                this.updateStarDisplay(container, parseInt(input.value, 10));
            }
            
            updateStarDisplay(container, rating) {
                if (!container) return;
                const stars = container.querySelectorAll('.star');
                stars.forEach((star, index) => {
                    const value = index + 1;
                    star.classList.toggle('filled', value <= rating);
                    star.classList.toggle('empty', value > rating);
                });
            }
            
            setDefaultDate() {
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('session-date').value = today;
            }
            
            setupEventListeners() {
                document.querySelectorAll('.main-nav-tab').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const tab = btn.getAttribute('data-main-tab');
                        document.querySelectorAll('.main-nav-tab').forEach(b => {
                            b.classList.remove('active');
                            b.setAttribute('aria-selected', 'false');
                        });
                        btn.classList.add('active');
                        btn.setAttribute('aria-selected', 'true');
                        document.getElementById('main-tab-dashboard').setAttribute('aria-hidden', tab !== 'dashboard');
                        document.getElementById('main-tab-session').setAttribute('aria-hidden', tab !== 'session');
                        if (tab === 'session') this.populateSessionBookSelect();
                    });
                });
                
                // Formulário de livro
                document.getElementById('book-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveBook();
                });
                
                // Formulário de sessão de leitura
                document.getElementById('reading-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveReadingSession();
                });
                
                // Marcar que há alterações não salvas no painel de detalhes (Nova Leitura)
                document.getElementById('reading-form').addEventListener('input', () => { this.detailFormDirty = true; });
                document.getElementById('reading-form').addEventListener('change', () => { this.detailFormDirty = true; });
                
                // Cards minimizáveis (animação via altura real)
                const COLLAPSE_KEY = 'readingPanelCollapsed';
                const DURATION = 200;
                document.querySelectorAll('.section.collapsible').forEach(section => {
                    const header = section.querySelector('.collapsible-header');
                    const body = section.querySelector('.collapsible-body');
                    const inner = section.querySelector('.collapsible-body-inner');
                    const key = section.dataset.collapseKey;
                    if (!header || !body || !inner || !key) return;
                    const saved = localStorage.getItem(COLLAPSE_KEY);
                    const state = saved ? JSON.parse(saved) : {};
                    if (state[key] === true) {
                        section.classList.add('collapsed');
                        header.setAttribute('aria-expanded', 'false');
                        body.style.height = '0';
                        body.style.overflow = 'hidden';
                    }
                    header.addEventListener('click', () => {
                        const willCollapse = !section.classList.contains('collapsed');
                        if (willCollapse) {
                            const h = inner.scrollHeight;
                            body.style.height = h + 'px';
                            body.style.overflow = 'hidden';
                            body.offsetHeight;
                            body.style.transition = `height ${DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`;
                            body.style.height = '0';
                            section.classList.add('collapsed');
                            header.setAttribute('aria-expanded', 'false');
                            setTimeout(() => {
                                body.style.transition = '';
                                state[key] = true;
                                localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state));
                            }, DURATION);
                        } else {
                            const h = inner.scrollHeight;
                            body.style.height = '0';
                            body.style.overflow = 'hidden';
                            body.offsetHeight;
                            body.style.transition = `height ${DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`;
                            body.style.height = h + 'px';
                            section.classList.remove('collapsed');
                            header.setAttribute('aria-expanded', 'true');
                            setTimeout(() => {
                                body.style.height = '';
                                body.style.overflow = '';
                                body.style.transition = '';
                                state[key] = false;
                                localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state));
                            }, DURATION);
                        }
                    });
                });
                
                // Limpar formulário
                document.getElementById('clear-form').addEventListener('click', () => {
                    document.getElementById('book-form').reset();
                    document.getElementById('book-notes').placeholder = '';
                    if (this.resizeNotesTextarea) this.resizeNotesTextarea();
                    document.getElementById('cover-name').textContent = 'Nenhum arquivo selecionado';
                    document.getElementById('pdf-name').textContent = 'Nenhum arquivo selecionado';
                    document.getElementById('book-search-results').innerHTML = '';
                    this.googleCoverUrl = '';
                    this.googlePdfUrl = '';
                    this.clearGenreChips();
                    this.updateFileConfirmUI();
                });
                
                this.resizeNotesTextarea = () => {
                    const ta = document.getElementById('book-notes');
                    if (!ta) return;
                    const prev = ta.value;
                    ta.style.height = 'auto';
                    ta.value = prev || ta.placeholder || ' ';
                    const extra = 24;
                    ta.style.height = Math.max(80, ta.scrollHeight + extra) + 'px';
                    ta.value = prev;
                };
                document.getElementById('book-notes').addEventListener('keydown', (e) => {
                    if (e.key === 'Tab' && !e.shiftKey) {
                        const ta = document.getElementById('book-notes');
                        const ph = ta.placeholder || '';
                        if (ph) {
                            e.preventDefault();
                            ta.value = ph;
                            this.resizeNotesTextarea();
                        }
                    }
                });
                document.getElementById('book-notes').addEventListener('input', () => this.resizeNotesTextarea());
                document.getElementById('book-notes').addEventListener('focus', () => this.resizeNotesTextarea());
                
                // Busca Google Books
                this.setupGoogleBooksSearch();
                
                // Excluir livro
                document.getElementById('delete-book').addEventListener('click', () => {
                    if (!this.selectedBookId) return;
                    Swal.fire({
                        title: 'Excluir livro?',
                        text: 'Esta ação não pode ser desfeita.',
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Excluir',
                        cancelButtonText: 'Cancelar'
                    }).then((result) => {
                        if (result.isConfirmed) this.deleteBook(this.selectedBookId);
                    });
                });
                
                // Upload de capa (qualquer tamanho; nome longo é truncado na tela, título mostra completo)
                document.getElementById('book-cover').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) this.googleCoverUrl = '';
                    const el = document.getElementById('cover-name');
                    if (file) {
                        el.textContent = file.name;
                        el.title = file.name;
                    } else {
                        el.textContent = 'Nenhum arquivo selecionado';
                        el.removeAttribute('title');
                    }
                    this.updateFileConfirmUI();
                });
                
                // Upload de PDF (qualquer tamanho; nome longo é truncado na tela, título mostra completo)
                document.getElementById('book-pdf').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) this.googlePdfUrl = '';
                    const el = document.getElementById('pdf-name');
                    if (file) {
                        el.textContent = file.name;
                        el.title = file.name;
                    } else {
                        el.textContent = 'Nenhum arquivo selecionado';
                        el.removeAttribute('title');
                    }
                    this.updateFileConfirmUI();
                });
                
                // Tabs
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabId = tab.getAttribute('data-tab');
                        this.switchTab(tabId);
                    });
                });
                
                // Editar anotações do livro
                const btnEditNotes = document.getElementById('btn-edit-notes');
                const btnSaveNotes = document.getElementById('btn-save-notes');
                const btnCancelNotes = document.getElementById('btn-cancel-notes');
                if (btnEditNotes && btnSaveNotes && btnCancelNotes) {
                    btnEditNotes.addEventListener('click', () => this.startEditNotes());
                    btnSaveNotes.addEventListener('click', () => this.saveBookNotes());
                    btnCancelNotes.addEventListener('click', () => this.cancelEditNotes());
                }
                
                // Sincronizar agora (Supabase)
                const syncBtn = document.getElementById('btn-sync-now');
                if (supabaseClient && syncBtn) {
                    syncBtn.style.display = '';
                    syncBtn.addEventListener('click', async () => {
                        syncBtn.disabled = true;
                        const result = await pushToSupabase(this.books);
                        syncBtn.disabled = false;
                        if (result.ok) {
                            updateSyncUI('• Sincronizado com a nuvem', 'Salvo', '');
                            Swal.fire({ title: 'Sincronizado', text: 'Dados enviados para a nuvem com sucesso.', icon: 'success' });
                        } else {
                            const msg = result.error?.message || (typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
                            Swal.fire({
                                title: 'Erro ao sincronizar',
                                html: '<pre style="text-align:left;font-size:12px;overflow:auto;max-height:200px;">' + msg + '</pre><p style="margin-top:12px;font-size:13px;">Confirme: executou o <strong>supabase-schema.sql</strong> no SQL Editor? Tabela <code>user_reading_data</code> existe? E-mail confirmado em Authentication?</p>',
                                icon: 'error'
                            });
                        }
                    });
                }
                // Sair da conta (quando usando Supabase)
                const logoutBtn = document.getElementById('auth-logout');
                if (supabaseClient && logoutBtn) {
                    logoutBtn.style.display = '';
                    logoutBtn.addEventListener('click', async () => {
                        unsubscribeRealtime();
                        await supabaseClient.auth.signOut();
                        location.reload();
                    });
                }
                
                // Mobile: bottom nav tabs
                document.querySelectorAll('.bottom-nav [data-mobile-tab]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const tab = btn.getAttribute('data-mobile-tab');
                        document.querySelectorAll('.bottom-nav [data-mobile-tab]').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        const el = tab === 'more' ? document.getElementById('mobile-more-content') : (tab === 'list' ? document.getElementById('meus-livros') : document.getElementById('mobile-panel-' + tab));
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                });
                
                // Mobile: arrastar para a direita para fechar o detalhe (só horizontal)
                const rightCol = document.getElementById('right-column');
                if (rightCol) {
                    let dragStartX = 0, dragStartY = 0, dragCurrentX = 0;
                    let dragIsHorizontal = false;
                    const onStart = (x, y, target) => {
                        if (!rightCol.classList.contains('mobile-open')) return;
                        if (target && target.closest('input, textarea, select, button, [contenteditable="true"]')) return;
                        rightCol.classList.add('mobile-dragging');
                        dragStartX = x;
                        dragStartY = y;
                        dragCurrentX = x;
                        dragIsHorizontal = false;
                    };
                    const onMove = (x, y) => {
                        if (!rightCol.classList.contains('mobile-dragging')) return;
                        const deltaX = x - dragStartX;
                        const deltaY = y - dragStartY;
                        if (!dragIsHorizontal) {
                            if (Math.abs(deltaX) > Math.abs(deltaY)) dragIsHorizontal = true;
                            else return;
                        }
                        dragCurrentX = x;
                        const delta = Math.max(0, deltaX);
                        rightCol.style.transform = `translateX(${delta}px)`;
                    };
                    const onEnd = () => {
                        if (!rightCol.classList.contains('mobile-dragging')) return;
                        rightCol.classList.remove('mobile-dragging');
                        const delta = dragCurrentX - dragStartX;
                        const threshold = Math.max(140, window.innerWidth * 0.45);
                        if (delta > threshold) {
                            const doClose = () => {
                                this.selectedBookId = null;
                                this.updateUI();
                                rightCol.style.transform = '';
                            };
                            if (this.detailFormDirty) {
                                Swal.fire({
                                    title: 'Sair sem salvar?',
                                    text: 'Você tem alterações não salvas. Deseja realmente sair?',
                                    icon: 'warning',
                                    showCancelButton: true,
                                    confirmButtonText: 'Sair',
                                    cancelButtonText: 'Continuar editando'
                                }).then((result) => {
                                    if (result.isConfirmed) {
                                        this.detailFormDirty = false;
                                        doClose();
                                    } else {
                                        rightCol.style.transform = 'translateX(0)';
                                        setTimeout(() => { rightCol.style.transform = ''; }, 260);
                                    }
                                });
                            } else {
                                doClose();
                            }
                        } else {
                            rightCol.style.transform = 'translateX(0)';
                            setTimeout(() => { rightCol.style.transform = ''; }, 260);
                        }
                    };
                    rightCol.addEventListener('touchstart', (e) => onStart(e.touches[0].clientX, e.touches[0].clientY, e.target), { passive: true });
                    rightCol.addEventListener('touchmove', (e) => {
                        onMove(e.touches[0].clientX, e.touches[0].clientY);
                        if (rightCol.classList.contains('mobile-dragging') && dragIsHorizontal) e.preventDefault();
                    }, { passive: false });
                    rightCol.addEventListener('touchend', onEnd, { passive: true });
                    rightCol.addEventListener('mousedown', (e) => {
                        const t = e.target;
                        if (!t.closest('input, textarea, select, button, [contenteditable="true"]')) e.preventDefault();
                        onStart(e.clientX, e.clientY, e.target);
                    });
                    document.addEventListener('mousemove', (e) => { if (rightCol.classList.contains('mobile-dragging')) onMove(e.clientX, e.clientY); });
                    document.addEventListener('mouseup', () => { if (rightCol.classList.contains('mobile-dragging')) onEnd(); });
                }
                
            }
            
            exportBackup() {
                const backup = {
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    app: 'Painel de Leitura',
                    books: this.books
                };
                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup-leitura-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                Swal.fire({
                    title: 'Backup exportado',
                    text: 'Guarde o arquivo em um lugar seguro (pendrive, nuvem, etc.).',
                    icon: 'success'
                });
            }
            
            importBackupFromFile(file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        const books = parseDataPayload(data);
                        if (books.length === 0 && this.books.length > 0) {
                            const r = await Swal.fire({
                                title: 'Arquivo sem livros',
                                text: 'Deseja mesmo substituir seus dados atuais?',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonText: 'Sim',
                                cancelButtonText: 'Cancelar'
                            });
                            if (!r.isConfirmed) return;
                        } else if (books.length > 0) {
                            const r = await Swal.fire({
                                title: 'Restaurar backup?',
                                text: `${books.length} livro(s). Os dados atuais serão substituídos.`,
                                icon: 'question',
                                showCancelButton: true,
                                confirmButtonText: 'Restaurar',
                                cancelButtonText: 'Cancelar'
                            });
                            if (!r.isConfirmed) return;
                        }
                        this.books = books.map(normalizeBook);
                        this.selectedBookId = null;
                        this.saveToLocalStorage();
                        this.renderBooks();
                        this.updateUI();
                        await Swal.fire({ title: 'Backup restaurado', text: 'Seus dados foram restaurados com sucesso.', icon: 'success' });
                    } catch (err) {
                        Swal.fire({
                            title: 'Arquivo inválido',
                            text: 'Use um backup exportado por este painel.',
                            icon: 'error'
                        });
                    }
                };
                reader.readAsText(file, 'UTF-8');
            }
            
            switchTab(tabId) {
                // Atualizar tabs
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
                
                // Atualizar conteúdo
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(`tab-${tabId}`).classList.add('active');
            }
            
            readFileAsDataURL(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
                    reader.readAsDataURL(file);
                });
            }
            
            getGenresFromForm() {
                const wrap = document.getElementById('book-genres-wrap');
                const selected = wrap.querySelectorAll('.genre-chip.selected[data-genre]');
                return Array.from(selected).map(btn => btn.getAttribute('data-genre')).filter(Boolean);
            }
            
            clearGenreChips() {
                document.getElementById('book-genres-wrap').querySelectorAll('.genre-chip').forEach(btn => {
                    btn.classList.remove('selected');
                });
            }
            
            fillGenreChips(genres) {
                const wrap = document.getElementById('book-genres-wrap');
                wrap.querySelectorAll('.genre-chip').forEach(btn => {
                    const value = btn.getAttribute('data-genre');
                    btn.classList.toggle('selected', (genres || []).includes(value));
                });
            }
            
            mapGoogleCategoriesToGenres(categories, title = '', description = '') {
                const GENRES = ['ficcao', 'nao-ficcao', 'fantasia', 'ciencia', 'historia', 'biografia', 'tecnologia', 'autoajuda'];
                const scores = {};
                GENRES.forEach(g => { scores[g] = 0; });

                const categoryKeywords = {
                    ficcao: ['fiction', 'ficção', 'ficcion', 'novel', 'romance', 'mystery', 'thriller', 'suspense', 'horror', 'drama', 'literary', 'literature', 'literatura', 'young adult', 'juvenile fiction', 'contemporary'],
                    'nao-ficcao': ['non-fiction', 'nonfiction', 'não ficção', 'no ficcion', 'reference', 'referência', 'general'],
                    fantasia: ['fantasy', 'fantasia', 'science fiction', 'sci-fi', 'ficção científica', 'speculative', 'paranormal', 'urban fantasy'],
                    ciencia: ['science', 'ciência', 'ciencia', 'mathematics', 'matemática', 'physics', 'física', 'biology', 'biologia', 'chemistry', 'química', 'nature', 'natureza', 'astronomy', 'astronomia'],
                    historia: ['history', 'história', 'historia', 'historical', 'histórico', 'war', 'guerra', 'political', 'político', 'military', 'militar'],
                    biografia: ['biography', 'biografia', 'autobiography', 'autobiografia', 'memoir', 'memórias', 'life'],
                    tecnologia: ['technology', 'tecnologia', 'computers', 'computação', 'computer', 'programming', 'programação', 'software', 'internet', 'web', 'digital'],
                    autoajuda: ['self-help', 'self help', 'autoajuda', 'psychology', 'psicologia', 'personal development', 'desenvolvimento pessoal', 'business', 'negócios', 'finance', 'finanças', 'economics', 'economia', 'investments', 'investimentos', 'management', 'gestão', 'leadership', 'liderança', 'marketing', 'motivational', 'motivação', 'career', 'carreira']
                };

                const textKeywords = {
                    ficcao: ['romance', 'novel', 'mistério', 'suspense', 'terror', 'drama', 'história de amor'],
                    'nao-ficcao': ['guia ', 'manual ', 'como ', 'introdução', 'fundamentos'],
                    fantasia: ['magia', 'dragões', 'elfos', 'fantasia', 'narnia', 'anéis', 'reino'],
                    ciencia: ['universo', 'evolução', 'átomo', 'genética'],
                    historia: ['história do ', 'história da ', 'história do brasil', 'segunda guerra', 'primeira guerra'],
                    biografia: ['biografia', 'vida de ', 'memórias', 'autobiografia', 'diário de'],
                    tecnologia: ['programação', 'código', 'software', 'python', 'javascript', 'computador', 'algoritmo'],
                    autoajuda: ['pai rico', 'hábitos', 'poder do', 'inteligência', 'sucesso', 'dinheiro', 'investir', 'finanças', 'liderança', 'gestão', 'mindset']
                };

                const cats = Array.isArray(categories) ? categories : (categories ? [categories] : []);

                for (const cat of cats) {
                    const lower = String(cat).toLowerCase();
                    for (const [genre, keywords] of Object.entries(categoryKeywords)) {
                        if (keywords.some(kw => lower.includes(kw))) {
                            scores[genre] += 10;
                            break;
                        }
                    }
                }

                const titleLower = String(title).toLowerCase();
                for (const [genre, keywords] of Object.entries(textKeywords)) {
                    if (keywords.some(kw => titleLower.includes(kw))) scores[genre] += 6;
                }

                const descLower = String(description).slice(0, 400).toLowerCase();
                for (const [genre, keywords] of Object.entries(textKeywords)) {
                    if (keywords.some(kw => descLower.includes(kw))) scores[genre] += 3;
                }

                if (scores.ficcao > 0 && scores['nao-ficcao'] > 0) {
                    if (scores.ficcao >= scores['nao-ficcao']) scores['nao-ficcao'] = 0;
                    else scores.ficcao = 0;
                }

                const ranked = GENRES.filter(g => scores[g] > 0).sort((a, b) => scores[b] - scores[a]);
                const MIN_TAGS = 3;

                if (ranked.length >= MIN_TAGS) return ranked.slice(0, 5);

                const seed = (title + '|' + (cats[0] || '') + '|' + description.slice(0, 50)).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                const FALLBACK_PACKS = [
                    ['historia', 'biografia', 'fantasia'],
                    ['tecnologia', 'ciencia', 'biografia'],
                    ['fantasia', 'historia', 'tecnologia'],
                    ['biografia', 'fantasia', 'ciencia'],
                    ['historia', 'tecnologia', 'fantasia'],
                    ['ciencia', 'fantasia', 'biografia'],
                    ['tecnologia', 'historia', 'fantasia'],
                    ['biografia', 'tecnologia', 'historia'],
                    ['fantasia', 'ciencia', 'historia'],
                    ['historia', 'biografia', 'tecnologia'],
                    ['ciencia', 'historia', 'fantasia'],
                    ['tecnologia', 'fantasia', 'biografia']
                ];
                const pack = FALLBACK_PACKS[seed % FALLBACK_PACKS.length];
                const extra = pack.filter(g => !ranked.includes(g)).slice(0, MIN_TAGS - ranked.length);
                let result = [...ranked, ...extra];

                if (result.includes('ficcao') && result.includes('nao-ficcao')) {
                    result = result.filter(g => g !== 'ficcao');
                }
                return result.slice(0, Math.max(MIN_TAGS, result.length));
            }
            
            updateFileConfirmUI() {
                const hasCover = !!(
                    document.getElementById('book-cover').files[0] ||
                    (this.googleCoverUrl && this.googleCoverUrl.length > 0)
                );
                const hasPdf = !!(
                    document.getElementById('book-pdf').files[0] ||
                    (this.googlePdfUrl && this.googlePdfUrl.length > 0)
                );
                const coverGroup = document.getElementById('form-group-cover');
                const pdfGroup = document.getElementById('form-group-pdf');
                if (coverGroup) coverGroup.classList.toggle('has-file', !!hasCover);
                if (pdfGroup) pdfGroup.classList.toggle('has-file', !!hasPdf);
            }
            
            setupGoogleBooksSearch() {
                const input = document.getElementById('book-search');
                const resultsEl = document.getElementById('book-search-results');
                if (!input || !resultsEl) return;
                let debounceTimer = null;
                input.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    const q = input.value.trim();
                    if (!q) {
                        resultsEl.innerHTML = '';
                        resultsEl.classList.remove('active');
                        return;
                    }
                    debounceTimer = setTimeout(() => this.searchGoogleBooks(q, resultsEl), 400);
                });
                input.addEventListener('blur', () => {
                    setTimeout(() => {
                        resultsEl.classList.remove('active');
                    }, 200);
                });
                input.addEventListener('focus', () => {
                    if (resultsEl.innerHTML) resultsEl.classList.add('active');
                });
            }
            
            async searchGoogleBooks(query, resultsEl) {
                const apiKey = window.GOOGLE_BOOKS_API_KEY;
                if (!apiKey) {
                    resultsEl.innerHTML = '<div class="book-search-item book-search-empty">Configure GOOGLE_BOOKS_API_KEY em config.js</div>';
                    resultsEl.classList.add('active');
                    return;
                }
                resultsEl.innerHTML = '<div class="book-search-item book-search-loading">Buscando...</div>';
                resultsEl.classList.add('active');
                try {
                    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5&key=${apiKey}`;
                    const res = await fetch(url);
                    const data = await res.json();
                    const items = data.items || [];
                    if (items.length === 0) {
                        resultsEl.innerHTML = '<div class="book-search-item book-search-empty">Nenhum resultado encontrado</div>';
                        return;
                    }
                    resultsEl.innerHTML = items.map(item => {
                        const vi = item.volumeInfo || {};
                        const ai = item.accessInfo || {};
                        const title = vi.title || 'Sem título';
                        const authors = Array.isArray(vi.authors) ? vi.authors.join(', ') : (vi.authors || 'Autor desconhecido');
                        const pages = vi.pageCount || '';
                        const thumb = vi.imageLinks?.thumbnail || vi.imageLinks?.smallThumbnail || '';
                        let coverUrl = thumb ? thumb.replace(/^http:/, 'https:') : '';
                        const categories = Array.isArray(vi.categories) ? vi.categories : (vi.mainCategory ? [vi.mainCategory] : []);
                        const pdfLink = (ai.pdf?.isAvailable && ai.pdf?.downloadLink) ? (ai.pdf.downloadLink || '').replace(/^http:/, 'https:') : '';
                        const rawDesc = vi.description || '';
                        const cleaned = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        const cleanDesc = cleaned.slice(0, 50) + (cleaned.length > 50 ? '...' : '');
                        const descAttr = encodeURIComponent(cleanDesc);
                        const catsAttr = encodeURIComponent(JSON.stringify(categories));
                        const pdfAttr = pdfLink.replace(/"/g, '&quot;');
                        return `<div class="book-search-item" data-title="${title.replace(/"/g, '&quot;')}" data-author="${authors.replace(/"/g, '&quot;')}" data-pages="${pages}" data-cover="${coverUrl.replace(/"/g, '&quot;')}" data-categories="${catsAttr}" data-pdf="${pdfAttr}" data-description="${descAttr}">
                            <img src="${coverUrl || 'https://via.placeholder.com/40x60/1a1a1a/555?text=Capa'}" alt="" class="book-search-thumb">
                            <div class="book-search-info">
                                <strong>${title}</strong>
                                <span>${authors}</span>
                                ${pages ? `<span class="book-search-pages">${pages} pág</span>` : ''}
                            </div>
                        </div>`;
                    }).join('');
                    resultsEl.querySelectorAll('.book-search-item[data-title]').forEach(el => {
                        el.addEventListener('click', () => {
                            const title = el.getAttribute('data-title').replace(/&quot;/g, '"');
                            const author = el.getAttribute('data-author').replace(/&quot;/g, '"');
                            const pages = el.getAttribute('data-pages') || '1';
                            const cover = (el.getAttribute('data-cover') || '').replace(/&quot;/g, '"');
                            let categories = [];
                            try {
                                const raw = decodeURIComponent(el.getAttribute('data-categories') || '[]');
                                categories = JSON.parse(raw);
                            } catch (e) {}
                            const pdf = (el.getAttribute('data-pdf') || '').replace(/&quot;/g, '"');
                            let description = '';
                            try {
                                description = decodeURIComponent(el.getAttribute('data-description') || '');
                            } catch (e) {}
                            const placeholder = description
                                ? `O livro "${title}", de ${author}: ${description}`
                                : `O livro "${title}", de ${author}.`;
                            document.getElementById('book-title').value = title;
                            document.getElementById('book-author').value = author;
                            document.getElementById('book-pages').value = pages || '1';
                            document.getElementById('book-notes').placeholder = placeholder;
                            if (typeof this.resizeNotesTextarea === 'function') this.resizeNotesTextarea();
                            this.googleCoverUrl = cover || '';
                            this.googlePdfUrl = pdf || '';
                            this.fillGenreChips(this.mapGoogleCategoriesToGenres(categories, title, description));
                            document.getElementById('cover-name').textContent = cover ? 'Capa do Google Books' : 'Nenhum arquivo selecionado';
                            document.getElementById('pdf-name').textContent = pdf ? 'PDF do Google Books' : 'Nenhum arquivo selecionado';
                            document.getElementById('book-pdf').value = '';
                            document.getElementById('book-search').value = '';
                            resultsEl.innerHTML = '';
                            resultsEl.classList.remove('active');
                            this.updateFileConfirmUI();
                        });
                    });
                } catch (err) {
                    resultsEl.innerHTML = '<div class="book-search-item book-search-empty">Erro ao buscar. Tente novamente.</div>';
                }
            }
            
            setupSessionTab() {
                this.sessionTimerSeconds = 0;
                this.sessionTimerInterval = null;
                this.sessionTimerRunning = false;
                this.sessionYoutubePlayer = null;
                
                const sel = document.getElementById('session-book-select');
                const preview = document.getElementById('session-book-preview');
                if (sel) sel.addEventListener('change', () => this.updateSessionBookPreview());
                
                const playBtn = document.getElementById('session-timer-play');
                const pauseBtn = document.getElementById('session-timer-pause');
                const resetBtn = document.getElementById('session-timer-reset');
                if (playBtn) playBtn.addEventListener('click', () => this.sessionTimerStart());
                if (pauseBtn) pauseBtn.addEventListener('click', () => this.sessionTimerPause());
                if (resetBtn) resetBtn.addEventListener('click', () => this.sessionTimerReset());
                
                const loadBtn = document.getElementById('session-youtube-load');
                const urlInput = document.getElementById('session-youtube-url');
                if (loadBtn && urlInput) loadBtn.addEventListener('click', () => this.sessionYoutubeLoad());
                const ytPlay = document.getElementById('session-youtube-play');
                const ytPause = document.getElementById('session-youtube-pause');
                const ytStop = document.getElementById('session-youtube-stop');
                if (ytPlay) ytPlay.addEventListener('click', () => this.sessionYoutubePlay());
                if (ytPause) ytPause.addEventListener('click', () => this.sessionYoutubePause());
                if (ytStop) ytStop.addEventListener('click', () => this.sessionYoutubeStop());
                
                const finishBtn = document.getElementById('session-finish-btn');
                if (finishBtn) finishBtn.addEventListener('click', () => this.sessionFinish());
                
                window.onYouTubeIframeAPIReady = () => { this.sessionYoutubeApiReady = true; };
            }
            
            populateSessionBookSelect() {
                const sel = document.getElementById('session-book-select');
                if (!sel) return;
                const opts = sel.querySelectorAll('option:not([value=""])');
                opts.forEach(o => o.remove());
                this.books.filter(b => b.status !== 'concluido').forEach(book => {
                    const opt = document.createElement('option');
                    opt.value = book.id;
                    opt.textContent = `${book.title} — ${book.author}`;
                    sel.appendChild(opt);
                });
                this.updateSessionBookPreview();
            }
            
            updateSessionBookPreview() {
                const sel = document.getElementById('session-book-select');
                const preview = document.getElementById('session-book-preview');
                if (!sel || !preview) return;
                const id = sel.value;
                if (!id) {
                    preview.classList.add('hidden');
                    return;
                }
                const book = this.books.find(b => b.id === id);
                if (!book) {
                    preview.classList.add('hidden');
                    return;
                }
                document.getElementById('session-book-cover').src = book.coverUrl || 'https://via.placeholder.com/48x64/1a1a1a/555?text=Capa';
                document.getElementById('session-book-title').textContent = book.title;
                document.getElementById('session-book-author').textContent = book.author;
                document.getElementById('session-book-pages').textContent = `${book.pages} páginas`;
                preview.classList.remove('hidden');
            }
            
            sessionTimerStart() {
                if (this.sessionTimerRunning) return;
                this.sessionTimerRunning = true;
                document.getElementById('session-timer-play').classList.add('hidden');
                document.getElementById('session-timer-pause').classList.remove('hidden');
                this.sessionTimerInterval = setInterval(() => {
                    this.sessionTimerSeconds++;
                    this.sessionTimerUpdateDisplay();
                }, 1000);
            }
            
            sessionTimerPause() {
                if (!this.sessionTimerRunning) return;
                this.sessionTimerRunning = false;
                document.getElementById('session-timer-play').classList.remove('hidden');
                document.getElementById('session-timer-pause').classList.add('hidden');
                if (this.sessionTimerInterval) {
                    clearInterval(this.sessionTimerInterval);
                    this.sessionTimerInterval = null;
                }
            }
            
            sessionTimerReset() {
                this.sessionTimerPause();
                this.sessionTimerSeconds = 0;
                this.sessionTimerUpdateDisplay();
            }
            
            sessionTimerUpdateDisplay() {
                const h = Math.floor(this.sessionTimerSeconds / 3600);
                const m = Math.floor((this.sessionTimerSeconds % 3600) / 60);
                const s = this.sessionTimerSeconds % 60;
                const display = document.getElementById('session-timer-display');
                if (display) display.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            }
            
            extractYoutubeVideoId(url) {
                const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
                return m ? m[1] : null;
            }
            
            sessionYoutubeLoad() {
                const urlInput = document.getElementById('session-youtube-url');
                const embedDiv = document.getElementById('session-youtube-embed');
                const playerWrap = document.getElementById('session-youtube-player');
                if (!urlInput || !embedDiv || !playerWrap) return;
                const id = this.extractYoutubeVideoId(urlInput.value.trim());
                if (!id) {
                    Swal.fire({ title: 'Link inválido', text: 'Cole um link válido do YouTube (ex: youtube.com/watch?v=... ou youtu.be/...)', icon: 'warning' });
                    return;
                }
                embedDiv.innerHTML = '';
                const init = () => {
                    if (this.sessionYoutubePlayer && this.sessionYoutubePlayer.destroy) this.sessionYoutubePlayer.destroy();
                    try {
                        this.sessionYoutubePlayer = new YT.Player('session-youtube-embed', {
                            height: '180',
                            width: '100%',
                            videoId: id,
                            playerVars: { autoplay: 0, modestbranding: 1 }
                        });
                    } catch (e) {
                        Swal.fire({ title: 'Erro', text: 'Falha ao carregar o vídeo. Tente novamente.', icon: 'error' });
                    }
                };
                if (typeof YT !== 'undefined' && YT.Player) {
                    init();
                } else {
                    const check = () => {
                        if (typeof YT !== 'undefined' && YT.Player) init();
                        else setTimeout(check, 200);
                    };
                    window.onYouTubeIframeAPIReady = check;
                    check();
                }
                playerWrap.classList.remove('hidden');
            }
            
            sessionYoutubePlay() {
                if (this.sessionYoutubePlayer && this.sessionYoutubePlayer.playVideo) this.sessionYoutubePlayer.playVideo();
            }
            
            sessionYoutubePause() {
                if (this.sessionYoutubePlayer && this.sessionYoutubePlayer.pauseVideo) this.sessionYoutubePlayer.pauseVideo();
            }
            
            sessionYoutubeStop() {
                if (this.sessionYoutubePlayer && this.sessionYoutubePlayer.stopVideo) this.sessionYoutubePlayer.stopVideo();
            }
            
            sessionFinish() {
                const bookId = document.getElementById('session-book-select')?.value;
                if (!bookId) {
                    Swal.fire({ title: 'Selecione um livro', text: 'Escolha o livro que você estava lendo.', icon: 'info' });
                    return;
                }
                const book = this.books.find(b => b.id === bookId);
                if (!book) return;
                if (book.status === 'concluido') {
                    Swal.fire({ title: 'Livro concluído', text: 'Este livro já foi finalizado.', icon: 'info' });
                    return;
                }
                const timeMin = Math.max(1, Math.floor(this.sessionTimerSeconds / 60));
                const sessions = book.readingSessions || [];
                const lastPage = sessions.length ? Math.max(...sessions.map(s => s.endPage)) : 0;
                const startPage = lastPage;
                Swal.fire({
                    title: 'Registrar sessão',
                    html: `
                        <p style="margin-bottom:16px;color:var(--text-muted);font-size:0.9rem;">Tempo de leitura: <strong>${timeMin} min</strong></p>
                        <div style="text-align:left;">
                            <label style="display:block;margin-bottom:6px;font-size:0.85rem;color:var(--text-muted);">Página inicial</label>
                            <input type="number" id="swal-start-page" value="${startPage}" min="0" max="${book.pages}" style="width:100%;padding:10px 12px;margin-bottom:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);">
                            <label style="display:block;margin-bottom:6px;font-size:0.85rem;color:var(--text-muted);">Página onde parou</label>
                            <input type="number" id="swal-end-page" value="${Math.min(startPage + 10, book.pages)}" min="1" max="${book.pages}" style="width:100%;padding:10px 12px;margin-bottom:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);">
                            <label style="display:block;margin-bottom:6px;font-size:0.85rem;color:var(--text-muted);">Avaliação (1-5)</label>
                            <input type="number" id="swal-rating" value="4" min="1" max="5" style="width:100%;padding:10px 12px;margin-bottom:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);">
                            <label style="display:block;margin-bottom:6px;font-size:0.85rem;color:var(--text-muted);">Observações (opcional)</label>
                            <textarea id="swal-notes" rows="2" style="width:100%;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;color:var(--text);resize:vertical;"></textarea>
                        </div>
                    `,
                    icon: 'info',
                    showCancelButton: true,
                    confirmButtonText: 'Registrar',
                    cancelButtonText: 'Cancelar',
                    preConfirm: () => {
                        const sp = parseInt(document.getElementById('swal-start-page').value);
                        const ep = parseInt(document.getElementById('swal-end-page').value);
                        const r = parseInt(document.getElementById('swal-rating').value);
                        const notes = document.getElementById('swal-notes').value.trim();
                        if (ep > book.pages) {
                            Swal.showValidationMessage(`Página final não pode ser maior que ${book.pages}`);
                            return false;
                        }
                        if (sp >= ep) {
                            Swal.showValidationMessage('Página inicial deve ser menor que a final');
                            return false;
                        }
                        if (r < 1 || r > 5) {
                            Swal.showValidationMessage('Avalie de 1 a 5');
                            return false;
                        }
                        return { startPage: sp, endPage: ep, rating: r, notes };
                    }
                }).then((result) => {
                    if (!result.isConfirmed || !result.value) return;
                    const { startPage: sp, endPage: ep, rating: r, notes } = result.value;
                    this.selectedBookId = bookId;
                    document.getElementById('session-date').value = new Date().toISOString().slice(0, 10);
                    document.getElementById('session-time').value = String(timeMin);
                    document.getElementById('start-page').value = String(sp);
                    document.getElementById('end-page').value = String(ep);
                    document.getElementById('session-rating').value = String(r);
                    this.updateStarDisplay(document.getElementById('star-rating-input'), r);
                    document.getElementById('session-notes').value = notes;
                    this.saveReadingSession();
                    this.sessionTimerReset();
                    document.querySelector('.main-nav-tab[data-main-tab="dashboard"]')?.click();
                });
            }
            
            saveBook() {
                const title = document.getElementById('book-title').value.trim();
                const author = document.getElementById('book-author').value.trim();
                const pages = parseInt(document.getElementById('book-pages').value);
                const genres = this.getGenresFromForm();
                const status = document.getElementById('book-status').value;
                const notes = document.getElementById('book-notes').value.trim();
                const coverFile = document.getElementById('book-cover').files[0];
                const pdfFile = document.getElementById('book-pdf').files[0];
                
                const coverPromise = coverFile ? this.readFileAsDataURL(coverFile) : Promise.resolve(this.googleCoverUrl || '');
                const pdfPromise = pdfFile ? this.readFileAsDataURL(pdfFile) : Promise.resolve(this.googlePdfUrl || '');
                
                Promise.all([coverPromise, pdfPromise])
                    .then(([coverUrl, pdfUrl]) => {
                        this.completeBookSave(title, author, pages, genres, status, notes, coverUrl, pdfUrl);
                    })
                    .catch(() => {
                        this.completeBookSave(title, author, pages, genres, status, notes, '', '');
                    });
            }
            
            completeBookSave(title, author, pages, genres, status, notes, coverUrl, pdfUrl = '') {
                const genresArr = Array.isArray(genres) ? genres : (genres ? [genres] : []);
                if (this.selectedBookId) {
                    const bookIndex = this.books.findIndex(book => book.id === this.selectedBookId);
                    if (bookIndex !== -1) {
                        this.books[bookIndex] = {
                            ...this.books[bookIndex],
                            title,
                            author,
                            pages,
                            genres: genresArr,
                            status,
                            notes,
                            coverUrl: coverUrl || this.books[bookIndex].coverUrl,
                            pdfUrl: pdfUrl || this.books[bookIndex].pdfUrl || ''
                        };
                    }
                } else {
                    this.books.push({
                        id: Date.now().toString(),
                        title,
                        author,
                        pages,
                        genres: genresArr,
                        status,
                        notes,
                        coverUrl: coverUrl || '',
                        pdfUrl: pdfUrl || '',
                        readingSessions: [],
                        createdAt: new Date().toISOString()
                    });
                    this.selectedBookId = this.books[this.books.length - 1].id;
                }
                
                this.saveToLocalStorage();
                this.renderBooks();
                this.updateUI();
                document.getElementById('book-form').reset();
                document.getElementById('book-notes').placeholder = '';
                if (this.resizeNotesTextarea) this.resizeNotesTextarea();
                document.getElementById('cover-name').textContent = 'Nenhum arquivo selecionado';
                document.getElementById('pdf-name').textContent = 'Nenhum arquivo selecionado';
                document.getElementById('book-search-results').innerHTML = '';
                this.googleCoverUrl = '';
                this.googlePdfUrl = '';
                this.updateFileConfirmUI();
                this.clearGenreChips();
                Swal.fire({
                    title: this.selectedBookId ? 'Livro atualizado' : 'Livro cadastrado',
                    text: 'Salvo com sucesso!',
                    icon: 'success'
                });
            }
            
            saveReadingSession() {
                if (!this.selectedBookId) {
                    Swal.fire({ title: 'Selecione um livro', text: 'Escolha um livro na lista para registrar a sessão.', icon: 'info' });
                    return;
                }
                const book = this.books.find(b => b.id === this.selectedBookId);
                if (book && book.status === 'concluido') {
                    Swal.fire({ title: 'Livro concluído', text: 'Este livro já foi finalizado. Não é possível adicionar mais sessões.', icon: 'info' });
                    return;
                }
                
                const date = document.getElementById('session-date').value;
                const time = parseInt(document.getElementById('session-time').value);
                const startPage = parseInt(document.getElementById('start-page').value);
                const endPage = parseInt(document.getElementById('end-page').value);
                const rating = parseInt(document.getElementById('session-rating').value);
                const notes = document.getElementById('session-notes').value.trim();
                
                // Validações
                if (endPage > book.pages) {
                    Swal.fire({ title: 'Página inválida', text: `A página final não pode ser maior que ${book.pages} (total do livro).`, icon: 'warning' });
                    return;
                }
                
                if (startPage >= endPage) {
                    Swal.fire({ title: 'Páginas inválidas', text: 'A página inicial deve ser menor que a página final.', icon: 'warning' });
                    return;
                }
                
                // Criar nova sessão
                const newSession = {
                    id: Date.now().toString(),
                    date,
                    time,
                    startPage,
                    endPage,
                    rating,
                    notes,
                    pagesRead: endPage - startPage
                };
                
                // Adicionar sessão ao livro
                const bookIndex = this.books.findIndex(b => b.id === this.selectedBookId);
                this.books[bookIndex].readingSessions.push(newSession);
                
                // Atualizar status do livro se necessário
                if (endPage === book.pages) {
                    this.books[bookIndex].status = 'concluido';
                } else if (this.books[bookIndex].status === 'nao-iniciado') {
                    this.books[bookIndex].status = 'lendo';
                }
                
                // Salvar no localStorage
                this.saveToLocalStorage();
                
                // Atualizar UI
                this.updateUI();
                this.updateStatsOverview();
                this.renderReadingSessions();
                
                // Limpar formulário
                document.getElementById('reading-form').reset();
                this.setDefaultDate();
                document.getElementById('session-rating').value = '4';
                this.updateStarDisplay(document.getElementById('star-rating-input'), 4);
                this.detailFormDirty = false;
                Swal.fire({ title: 'Sessão registrada', text: 'Sessão de leitura salva com sucesso!', icon: 'success' });
            }
            
            deleteSession(sessionId) {
                if (!this.selectedBookId) return;
                const book = this.books.find(b => b.id === this.selectedBookId);
                if (!book) return;
                Swal.fire({
                    title: 'Excluir sessão?',
                    text: 'Esta sessão de leitura será removida.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Excluir',
                    cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (!result.isConfirmed) return;
                    const bookIndex = this.books.findIndex(b => b.id === this.selectedBookId);
                    this.books[bookIndex].readingSessions = this.books[bookIndex].readingSessions.filter(s => s.id !== sessionId);
                    const pagesRead = this.calculatePagesRead(this.books[bookIndex]);
                    if (this.books[bookIndex].status === 'concluido' && pagesRead < this.books[bookIndex].pages) {
                        this.books[bookIndex].status = 'lendo';
                    }
                    this.saveToLocalStorage();
                    this.updateStatsOverview();
                    this.displayBookDetails();
                    Swal.fire({ title: 'Sessão excluída', text: 'Removida com sucesso.', icon: 'success' });
                });
            }
            
            openEditSessionModal(session) {
                if (!this.selectedBookId) return;
                const book = this.books.find(b => b.id === this.selectedBookId);
                if (!book) return;
                const dateVal = session.date ? new Date(session.date).toISOString().slice(0, 10) : '';
                const ratingOpts = [1, 2, 3, 4, 5].map(n => `<option value="${n}" ${(session.rating || 4) === n ? 'selected' : ''}>${n} estrela${n > 1 ? 's' : ''}</option>`).join('');
                Swal.fire({
                    title: 'Editar sessão',
                    html: `
                        <div class="edit-session-form" style="text-align:left">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                                <div>
                                    <label style="display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:4px;text-transform:uppercase">Data</label>
                                    <input type="date" id="edit-date" value="${dateVal}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:14px">
                                </div>
                                <div>
                                    <label style="display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:4px;text-transform:uppercase">Tempo (min)</label>
                                    <input type="number" id="edit-time" min="1" value="${session.time || 0}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:14px">
                                </div>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
                                <div>
                                    <label style="display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:4px;text-transform:uppercase">Página inicial</label>
                                    <input type="number" id="edit-start" min="0" max="${book.pages}" value="${session.startPage || 0}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:14px">
                                </div>
                                <div>
                                    <label style="display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:4px;text-transform:uppercase">Página final</label>
                                    <input type="number" id="edit-end" min="1" max="${book.pages}" value="${session.endPage || 0}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:14px">
                                </div>
                            </div>
                            <div style="margin-bottom:12px">
                                <label style="display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:4px;text-transform:uppercase">Avaliação</label>
                                <select id="edit-rating" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:14px">${ratingOpts}</select>
                            </div>
                            <div>
                                <label style="display:block;font-size:11px;font-weight:600;color:#888;margin-bottom:4px;text-transform:uppercase">Observações</label>
                                <textarea id="edit-notes" class="edit-session-notes" rows="4" style="width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:14px;resize:none;overflow-y:hidden;min-height:88px">${(session.notes || '').replace(/</g, '&lt;')}</textarea>
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Salvar',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#3b82f6',
                    width: '420px',
                    didOpen: () => {
                        const ta = document.getElementById('edit-notes');
                        if (!ta) return;
                        const adjust = () => {
                            ta.style.height = 'auto';
                            ta.style.height = Math.max(88, ta.scrollHeight + 8) + 'px';
                        };
                        adjust();
                        ta.addEventListener('input', adjust);
                    },
                    preConfirm: () => {
                        const popup = Swal.getPopup();
                        const date = popup.querySelector('#edit-date').value;
                        const time = parseInt(popup.querySelector('#edit-time').value, 10);
                        const startPage = parseInt(popup.querySelector('#edit-start').value, 10);
                        const endPage = parseInt(popup.querySelector('#edit-end').value, 10);
                        const rating = parseInt(popup.querySelector('#edit-rating').value, 10);
                        const notes = (popup.querySelector('#edit-notes').value || '').trim();
                        if (endPage > book.pages) {
                            Swal.showValidationMessage(`Página final não pode ser maior que ${book.pages}`);
                            return false;
                        }
                        if (startPage >= endPage) {
                            Swal.showValidationMessage('Página inicial deve ser menor que a final');
                            return false;
                        }
                        return { date, time, startPage, endPage, rating, notes };
                    }
                }).then((result) => {
                    if (!result.isConfirmed || !result.value) return;
                    const { date, time, startPage, endPage, rating, notes } = result.value;
                    const bookIndex = this.books.findIndex(b => b.id === this.selectedBookId);
                    const sess = this.books[bookIndex].readingSessions.find(s => s.id === session.id);
                    if (!sess) return;
                    sess.date = date;
                    sess.time = time;
                    sess.startPage = startPage;
                    sess.endPage = endPage;
                    sess.rating = rating;
                    sess.notes = notes;
                    sess.pagesRead = endPage - startPage;
                    if (endPage === book.pages) {
                        this.books[bookIndex].status = 'concluido';
                    } else if (this.books[bookIndex].status === 'concluido') {
                        const pagesRead = this.calculatePagesRead(this.books[bookIndex]);
                        if (pagesRead < book.pages) this.books[bookIndex].status = 'lendo';
                    } else if (this.books[bookIndex].status === 'nao-iniciado') {
                        this.books[bookIndex].status = 'lendo';
                    }
                    this.saveToLocalStorage();
                    this.updateStatsOverview();
                    this.displayBookDetails();
                    Swal.fire({ title: 'Sessão atualizada', text: 'Alterações salvas com sucesso.', icon: 'success' });
                });
            }
            
            deleteBook(bookId) {
                this.books = this.books.filter(book => book.id !== bookId);
                if (this.selectedBookId === bookId) {
                    this.selectedBookId = null;
                }
                this.saveToLocalStorage();
                this.renderBooks();
                this.updateUI();
                const meusLivros = document.getElementById('meus-livros');
                if (meusLivros && window.innerWidth <= 768) meusLivros.scrollIntoView({ behavior: 'smooth', block: 'start' });
                Swal.fire({ title: 'Livro excluído', text: 'Removido com sucesso.', icon: 'success' });
            }
            
            selectBook(bookId) {
                this.selectedBookId = bookId;
                this.updateUI();
                this.switchTab('notes');
            }
            
            dataUrlToBlob(dataUrl) {
                const parts = dataUrl.split(',');
                if (parts.length !== 2) return null;
                const mimeMatch = parts[0].match(/:(.*?);/);
                const mime = mimeMatch ? mimeMatch[1] : 'application/pdf';
                const binary = atob(parts[1]);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                return new Blob([bytes], { type: mime });
            }
            
            openBookPdf(book) {
                if (!book || !book.pdfUrl || String(book.pdfUrl).trim() === '') {
                    Swal.fire({ title: 'Sem PDF', text: 'Este livro não tem PDF anexado. Edite o livro e anexe um em "PDF do Livro".', icon: 'info' });
                    return;
                }
                const url = book.pdfUrl.trim();
                if (url.startsWith('data:')) {
                    try {
                        const blob = this.dataUrlToBlob(url);
                        if (!blob) throw new Error('PDF inválido');
                        const blobUrl = URL.createObjectURL(blob);
                        window.open(blobUrl, '_blank', 'noopener');
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                    } catch (e) {
                        Swal.fire({ title: 'Erro ao abrir PDF', text: 'Tente anexar o arquivo novamente.', icon: 'error' });
                    }
                } else {
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.click();
                }
            }
            
            getDataAsJsonPayload() {
                return { version: 1, books: this.books };
            }
            
            exportToJsonFile() {
                const payload = this.getDataAsJsonPayload();
                let json = JSON.stringify(payload, null, 2);
                if (json.length > 500000) {
                    payload.books = this.books.map(b => ({ ...b, pdfUrl: '' }));
                    json = JSON.stringify(payload, null, 2);
                    Swal.fire({ title: 'PDFs omitidos', text: 'O arquivo ficaria muito grande. O JSON foi exportado sem os PDFs anexados.', icon: 'info' });
                }
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = DADOS_JSON_FILE;
                a.click();
                URL.revokeObjectURL(url);
                Swal.fire({ title: 'JSON exportado', text: 'Salve o arquivo como ' + DADOS_JSON_FILE + ' na mesma pasta do HTML para os dados carregarem daqui.', icon: 'success' });
            }
            
            saveToLocalStorage() {
                if (SUPABASE_CONFIGURED && supabaseClient) {
                    updateSyncUI('', 'Enviando…', 'syncing');
                    pushToSupabase(this.books).then(({ ok, error }) => {
                        if (ok) {
                            updateSyncUI('• Sincronizado com a nuvem', 'Salvo', '');
                        } else {
                            const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
                            updateSyncUI('', 'Erro ao sincronizar', 'error');
                            if (!/sessão|login/i.test(String(msg))) {
                                Swal.fire({
                                    title: 'Erro ao sincronizar',
                                    html: '<pre style="text-align:left;font-size:11px;overflow:auto;max-height:180px;">' + msg + '</pre><p style="margin-top:12px;font-size:13px;">1) Execute o supabase-schema.sql no SQL Editor.<br>2) Desative "Confirm email" em Authentication > Providers.<br>3) Confira Site URL em Authentication > URL Configuration.</p>',
                                    icon: 'error'
                                });
                            }
                        }
                    });
                } else if (!SUPABASE_CONFIGURED) {
                    try {
                        const json = JSON.stringify(this.books);
                        localStorage.setItem(STORAGE_KEY, json);
                        localStorage.setItem(BACKUP_KEY, json);
                    } catch (e) {
                        Swal.fire({ title: 'Erro ao salvar', text: 'Exporte o JSON para backup.', icon: 'error' });
                    }
                }
            }
            
            renderBooks() {
                this.updateStatsOverview();
                const container = document.getElementById('books-container');
                
                if (this.books.length === 0) {
                    container.innerHTML = '<div class="no-data">Nenhum livro cadastrado ainda</div>';
                    return;
                }
                
                container.innerHTML = '';
                
                this.books.forEach(book => {
                    // Calcular progresso
                    const totalPages = book.pages;
                    const pagesRead = this.calculatePagesRead(book);
                    const progress = totalPages > 0 ? (pagesRead / totalPages) * 100 : 0;
                    
                    const bookElement = document.createElement('div');
                    bookElement.className = `book-card ${this.selectedBookId === book.id ? 'selected' : ''}`;
                    bookElement.innerHTML = `
                        <div class="book-cover-wrap">
                            <img src="${book.coverUrl || 'https://via.placeholder.com/44x62/1a1a1a/555?text=Capa'}" 
                                 alt="${book.title}" class="book-cover">
                        </div>
                        <div class="book-content">
                            <h4>${book.title}</h4>
                            <p>${book.author}</p>
                            <div class="book-meta">
                                <span>${book.pages} pág</span>
                                <span>${this.getStatusText(book.status)}</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progress}%"></div>
                            </div>
                        </div>
                    `;
                    
                    bookElement.addEventListener('click', () => this.selectBook(book.id));
                    container.appendChild(bookElement);
                });
            }
            
            updateUI() {
                const noBookSelected = document.getElementById('no-book-selected');
                const bookDetails = document.getElementById('book-details');
                const rightCol = document.getElementById('right-column');
                
                if (this.selectedBookId) {
                    noBookSelected.classList.add('hidden');
                    bookDetails.classList.remove('hidden');
                    bookDetails.classList.add('active');
                    this.displayBookDetails();
                } else {
                    noBookSelected.classList.remove('hidden');
                    bookDetails.classList.remove('active');
                    bookDetails.classList.add('hidden');
                }
                
                if (window.innerWidth <= 768 && rightCol) {
                    if (this.selectedBookId) {
                        rightCol.classList.add('mobile-open');
                    } else {
                        rightCol.classList.remove('mobile-open');
                    }
                }
            }
            
            displayBookDetails() {
                const book = this.books.find(b => b.id === this.selectedBookId);
                if (!book) return;
                this.detailFormDirty = false;
                
                // Calcular estatísticas
                const sessionsCount = book.readingSessions.length;
                const pagesRead = this.calculatePagesRead(book);
                const totalTime = this.calculateTotalTime(book);
                const averageRating = this.calculateAverageRating(book);
                const progress = book.pages > 0 ? (pagesRead / book.pages) * 100 : 0;
                
                // Capa: clique abre PDF se houver
                const coverWrap = document.getElementById('detail-cover-wrap');
                const coverImg = document.getElementById('detail-cover');
                coverImg.src = book.coverUrl || 'https://via.placeholder.com/96x134/1a1a1a/666?text=Capa';
                coverWrap.classList.toggle('has-pdf', !!(book.pdfUrl && book.pdfUrl.length > 0));
                coverWrap.title = (book.pdfUrl && book.pdfUrl.length > 0) ? 'Clique para abrir o PDF' : '';
                coverWrap.onclick = null;
                if (book.pdfUrl && book.pdfUrl.length > 0) {
                    const bookId = this.selectedBookId;
                    coverWrap.onclick = (e) => {
                        e.preventDefault();
                        const b = this.books.find(x => x.id === bookId);
                        this.openBookPdf(b);
                    };
                }
                
                document.getElementById('detail-title').textContent = book.title;
                document.getElementById('detail-author').textContent = `por ${book.author}`;
                document.getElementById('detail-pages').textContent = `${book.pages} páginas`;
                document.getElementById('detail-status').textContent = this.getStatusText(book.status);
                const genres = book.genres && book.genres.length ? book.genres : [];
                const detailGenresEl = document.getElementById('detail-genres');
                detailGenresEl.innerHTML = genres.length
                    ? genres.map(g => `<span class="meta-pill">${this.getGenreText(g)}</span>`).join('')
                    : '';
                this.fillGenreChips(genres);
                document.getElementById('detail-progress').style.width = `${progress}%`;
                document.getElementById('detail-progress-percent').textContent = `${progress.toFixed(0)}%`;
                document.getElementById('detail-progress-text').textContent = `${pagesRead}/${book.pages} páginas`;
                document.getElementById('detail-notes').textContent = book.notes || 'Nenhuma anotação disponível.';
                document.getElementById('notes-view-mode').style.display = '';
                document.getElementById('notes-edit-mode').style.display = 'none';
                
                // Atualizar estatísticas
                document.getElementById('stat-sessions').textContent = sessionsCount;
                document.getElementById('stat-pages').textContent = pagesRead;
                document.getElementById('stat-time').textContent = `${totalTime}h`;
                document.getElementById('stat-rating').textContent = averageRating.toFixed(1);
                
                // Atualizar formulário de sessão
                document.getElementById('start-page').value = pagesRead;
                document.getElementById('end-page').min = pagesRead + 1;
                document.getElementById('end-page').max = book.pages;
                
                // Esconder aba "Nova Leitura" se livro concluído
                const tabReading = document.querySelector('.tab[data-tab="reading"]');
                if (tabReading) {
                    const hideReading = book.status === 'concluido';
                    tabReading.style.display = hideReading ? 'none' : '';
                    if (hideReading && tabReading.classList.contains('active')) {
                        const tabSessions = document.querySelector('.tab[data-tab="sessions"]');
                        if (tabSessions) tabSessions.click();
                    }
                }
                
                // Renderizar sessões de leitura
                this.renderReadingSessions();
                
                // Estimativa de conclusão
                this.updateEstimate(book);
            }
            
            startEditNotes() {
                if (!this.selectedBookId) return;
                const book = this.books.find(b => b.id === this.selectedBookId);
                if (!book) return;
                const notesInput = document.getElementById('detail-notes-input');
                const viewMode = document.getElementById('notes-view-mode');
                const editMode = document.getElementById('notes-edit-mode');
                if (!notesInput || !viewMode || !editMode) return;
                notesInput.value = book.notes || '';
                viewMode.style.display = 'none';
                editMode.style.display = 'block';
                notesInput.focus();
            }
            
            cancelEditNotes() {
                const viewMode = document.getElementById('notes-view-mode');
                const editMode = document.getElementById('notes-edit-mode');
                if (viewMode && editMode) {
                    editMode.style.display = 'none';
                    viewMode.style.display = '';
                }
            }
            
            saveBookNotes() {
                if (!this.selectedBookId) return;
                const book = this.books.find(b => b.id === this.selectedBookId);
                if (!book) return;
                const notesInput = document.getElementById('detail-notes-input');
                if (!notesInput) return;
                const notes = notesInput.value.trim();
                book.notes = notes || '';
                this.saveToLocalStorage();
                document.getElementById('detail-notes').textContent = book.notes || 'Nenhuma anotação disponível.';
                this.cancelEditNotes();
                Swal.fire({ title: 'Anotações salvas', icon: 'success', timer: 1500, showConfirmButton: false });
            }
            
            getReadingEstimate(book) {
                const totalPages = Math.max(1, parseInt(book.pages, 10) || 1);
                const sessions = Array.isArray(book.readingSessions) ? book.readingSessions : [];
                const pagesRead = this.calculatePagesRead(book);
                
                if (sessions.length === 0 || pagesRead <= 0) {
                    return { type: 'no_sessions', message: 'Registre sessões de leitura para ver a estimativa de conclusão.' };
                }
                
                if (pagesRead >= totalPages) {
                    const sorted = [...sessions].sort((a, b) => new Date(b.date) - new Date(a.date));
                    const completionSession = sorted.find(s => s.endPage >= totalPages) || sorted[0];
                    return {
                        type: 'completed',
                        completionDate: completionSession ? new Date(completionSession.date) : null
                    };
                }
                
                const sorted = [...sessions].sort((a, b) => new Date(a.date) - new Date(b.date));
                const firstDate = new Date(sorted[0].date);
                const lastDate = new Date(sorted[sorted.length - 1].date);
                const daysSpanMs = Math.max(1, lastDate - firstDate);
                const daysSpan = Math.max(1, Math.ceil(daysSpanMs / (24 * 60 * 60 * 1000)));
                const avgPagesPerDay = pagesRead / daysSpan;
                const remaining = Math.max(0, totalPages - pagesRead);
                
                if (avgPagesPerDay <= 0) {
                    return { type: 'no_sessions', message: 'Registre mais sessões para calcular a estimativa.' };
                }
                
                // Ritmo recente (últimas 5 sessões) — reflete o que você fez nos últimos dias
                const recentCount = Math.min(5, sorted.length);
                const recentSessions = sorted.slice(-recentCount);
                const recentPages = recentSessions.reduce((sum, s) => sum + (s.endPage - s.startPage), 0);
                const recentFirst = new Date(recentSessions[0].date);
                const recentLast = new Date(recentSessions[recentSessions.length - 1].date);
                const recentDays = Math.max(1, Math.ceil((recentLast - recentFirst) / (24 * 60 * 60 * 1000)));
                const recentAvgPagesPerDay = recentPages / recentDays;
                
                // Ritmo considerado: mais peso no recente (estimativa móvel — muda conforme você lê mais ou menos)
                const weightRecent = 0.65;
                const weightOverall = 0.35;
                const consideredPagesPerDay = (recentCount >= 2)
                    ? weightRecent * recentAvgPagesPerDay + weightOverall * avgPagesPerDay
                    : avgPagesPerDay;
                
                if (consideredPagesPerDay <= 0) {
                    return { type: 'no_sessions', message: 'Registre mais sessões para calcular a estimativa.' };
                }
                
                let daysToFinish = Math.ceil(remaining / consideredPagesPerDay);
                daysToFinish = Math.min(Math.max(1, daysToFinish), 365);
                const estimatedDate = new Date();
                estimatedDate.setDate(estimatedDate.getDate() + daysToFinish);
                
                // Intervalo provável (ritmo mais rápido vs mais lento)
                const slowRate = Math.min(avgPagesPerDay, recentAvgPagesPerDay);
                const fastRate = Math.max(avgPagesPerDay, recentAvgPagesPerDay);
                const minDays = fastRate > 0 ? Math.max(1, Math.ceil(remaining / fastRate)) : daysToFinish;
                const maxDays = slowRate > 0 ? Math.min(365, Math.ceil(remaining / slowRate)) : daysToFinish;
                
                return {
                    type: 'estimate',
                    pagesRead,
                    totalPages,
                    remaining,
                    avgPagesPerDay: Math.round(avgPagesPerDay * 10) / 10,
                    recentAvgPagesPerDay: Math.round(recentAvgPagesPerDay * 10) / 10,
                    consideredPagesPerDay: Math.round(consideredPagesPerDay * 10) / 10,
                    daysToFinish,
                    estimatedDate,
                    sessionsCount: sessions.length,
                    minDays,
                    maxDays
                };
            }
            
            updateEstimate(book) {
                const container = document.getElementById('estimate-content');
                if (!container) return;
                
                const est = this.getReadingEstimate(book);
                
                if (est.type === 'no_sessions') {
                    container.innerHTML = `<p class="estimate-muted">${est.message}</p>`;
                    return;
                }
                
                if (est.type === 'completed') {
                    const dateStr = est.completionDate ? est.completionDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
                    container.innerHTML = `
                        <p class="estimate-line"><span class="estimate-date">Livro concluído</span></p>
                        <p class="estimate-line estimate-muted">Em ${dateStr}</p>
                    `;
                    return;
                }
                
                const dateStr = est.estimatedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
                const consideredText = est.consideredPagesPerDay != null
                    ? ` · Ritmo considerado: ${est.consideredPagesPerDay} pág/dia`
                    : '';
                container.innerHTML = `
                    <p class="estimate-line"><span class="estimate-date">Previsão de conclusão:</span> ${dateStr}</p>
                    <p class="estimate-line estimate-muted">Entre ${est.minDays} e ${est.maxDays} dias (${est.remaining} páginas restantes)</p>
                    <p class="estimate-line estimate-muted">Ritmo geral: ${est.avgPagesPerDay} pág/dia · Ritmo recente: ${est.recentAvgPagesPerDay} pág/dia${consideredText}</p>
                    <p class="estimate-line estimate-muted">Estimativa recalculada ao abrir o livro. Com base em ${est.sessionsCount} sessão(ões).</p>
                `;
            }
            
            renderReadingSessions() {
                const container = document.getElementById('sessions-container');
                if (!container) return;
                const book = this.books.find(b => b.id === this.selectedBookId);
                const sessions = Array.isArray(book?.readingSessions) ? book.readingSessions : [];
                if (!book || sessions.length === 0) {
                    container.innerHTML = '<div class="no-data">Nenhuma sessão de leitura registrada</div>';
                    return;
                }
                
                // Ordenar por data: mais recente no topo (desempate: último cadastrado primeiro)
                const sortedSessions = [...sessions]
                    .map((s, i) => ({ s, i, t: new Date(s.date).getTime() }))
                    .sort((a, b) => {
                        const ta = isNaN(a.t) ? 0 : a.t;
                        const tb = isNaN(b.t) ? 0 : b.t;
                        if (tb !== ta) return tb - ta;
                        return b.i - a.i;
                    })
                    .map(x => x.s);
                const lastAddedSession = sessions[sessions.length - 1];
                
                container.innerHTML = '';
                
                sortedSessions.forEach((session) => {
                    const sessionElement = document.createElement('div');
                    sessionElement.className = 'reading-session';
                    
                    const dateObj = new Date(session.date);
                    const formattedDate = dateObj.toLocaleDateString('pt-BR');
                    const starPath = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
                    let starsHtml = '';
                    for (let s = 1; s <= 5; s++) {
                        const filled = s <= session.rating ? 'filled' : 'empty';
                        starsHtml += `<span class="star-svg ${filled}"><svg viewBox="0 0 24 24"><path d="${starPath}"/></svg></span>`;
                    }
                    
                    // Só a última sessão cadastrada pode ser editada e excluída
                    const isLastAdded = lastAddedSession && session === lastAddedSession;
                    const actionsHtml = isLastAdded
                        ? `<div class="session-actions">
                            <button type="button" class="btn-edit-session" aria-label="Editar sessão" title="Editar sessão">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button type="button" class="btn-delete-session" aria-label="Excluir sessão" title="Excluir sessão">×</button>
                        </div>`
                        : '';
                    
                    const notesSafe = (session.notes || 'Sem observações').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    sessionElement.innerHTML = `
                        <div class="reading-session-main">
                            <div class="reading-date">${formattedDate}</div>
                            <h4>Páginas ${session.startPage} a ${session.endPage}</h4>
                            <p>${notesSafe}</p>
                            <div class="reading-info">
                                <span>${session.time} minutos</span>
                                <span class="star-rating star-rating-display">${starsHtml}</span>
                            </div>
                        </div>
                        ${actionsHtml}
                    `;
                    
                    if (isLastAdded) {
                        sessionElement.classList.add('has-delete-btn');
                        const editBtn = sessionElement.querySelector('.btn-edit-session');
                        const delBtn = sessionElement.querySelector('.btn-delete-session');
                        if (editBtn) editBtn.addEventListener('click', () => this.openEditSessionModal(session));
                        if (delBtn) delBtn.addEventListener('click', () => this.deleteSession(session.id));
                    }
                    container.appendChild(sessionElement);
                });
            }
            
            calculatePagesRead(book) {
                if (!book.readingSessions.length) return 0;
                
                // Encontrar a página máxima lida
                const lastSession = book.readingSessions.reduce((max, session) => 
                    session.endPage > max ? session.endPage : max, 0);
                
                return lastSession;
            }
            
            calculateTotalTime(book) {
                if (!book.readingSessions.length) return 0;
                
                const totalMinutes = book.readingSessions.reduce((sum, session) => sum + session.time, 0);
                return (totalMinutes / 60).toFixed(1);
            }
            
            calculateAverageRating(book) {
                if (!book.readingSessions.length) return 0;
                
                const sum = book.readingSessions.reduce((total, session) => total + session.rating, 0);
                return sum / book.readingSessions.length;
            }
            
            updateStatsOverview() {
                const totalBooks = this.books.length;
                let totalPagesRead = 0;
                let totalMinutes = 0;
                this.books.forEach(book => {
                    totalPagesRead += this.calculatePagesRead(book);
                    if (book.readingSessions && book.readingSessions.length) {
                        book.readingSessions.forEach(s => { totalMinutes += s.time || 0; });
                    }
                });
                const completed = this.books.filter(b => b.status === 'concluido').length;
                const totalHours = totalMinutes > 0 ? (totalMinutes / 60).toFixed(1) : '0';
                const elBooks = document.getElementById('stat-total-books');
                const elPages = document.getElementById('stat-total-pages');
                const elCompleted = document.getElementById('stat-completed');
                const elHours = document.getElementById('stat-total-hours');
                if (elBooks) elBooks.textContent = totalBooks;
                if (elPages) elPages.textContent = totalPagesRead;
                if (elCompleted) elCompleted.textContent = completed;
                if (elHours) elHours.textContent = totalHours + 'h';
            }
            
            getStatusText(status) {
                const statusMap = {
                    'nao-iniciado': 'Não Iniciado',
                    'lendo': 'Lendo',
                    'pausado': 'Pausado',
                    'concluido': 'Concluído'
                };
                
                return statusMap[status] || status;
            }
            
            getGenreText(genre) {
                const genreMap = {
                    'ficcao': 'Ficção',
                    'nao-ficcao': 'Não Ficção',
                    'fantasia': 'Fantasia',
                    'ciencia': 'Ciência',
                    'historia': 'História',
                    'biografia': 'Biografia',
                    'tecnologia': 'Tecnologia',
                    'autoajuda': 'Autoajuda'
                };
                
                return genreMap[genre] || genre;
            }
        }
        
        let realtimeChannel = null;
        
        function updateSyncUI(source, status, statusClass) {
            const badge = document.getElementById('sync-badge');
            const statusEl = document.getElementById('sync-status');
            const fallback = document.getElementById('sync-fallback');
            const isSupabase = status !== 'Fonte: dados-leitura.json ou navegador';
            if (badge) {
                badge.style.display = isSupabase ? 'flex' : 'none';
                badge.classList.remove('sync-badge--syncing', 'sync-badge--error');
                if (statusClass === 'syncing') badge.classList.add('sync-badge--syncing');
                else if (statusClass === 'error') badge.classList.add('sync-badge--error');
            }
            if (statusEl) statusEl.textContent = status || 'Tempo real';
            if (fallback) {
                fallback.textContent = isSupabase ? '' : status;
                fallback.style.display = isSupabase ? 'none' : 'block';
            }
        }
        
        function setupRealtimeSubscription(userId, tracker) {
            if (!supabaseClient || realtimeChannel) return;
            const handlePayload = (payload) => {
                const books = parseDataPayload(payload?.new?.payload || []);
                if (books.length >= 0 && tracker) {
                    tracker.books = books.map(normalizeBook);
                    tracker.selectedBookId = null;
                    tracker.renderBooks();
                    tracker.updateUI();
                    updateSyncUI('• Sincronizado com a nuvem', 'Atualizado', '');
                }
            };
            realtimeChannel = supabaseClient
                .channel('user_reading_data_changes')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'user_reading_data',
                    filter: 'user_id=eq.' + userId
                }, handlePayload)
                .subscribe();
        }
        
        function unsubscribeRealtime() {
            if (realtimeChannel && supabaseClient) {
                supabaseClient.removeChannel(realtimeChannel);
                realtimeChannel = null;
            }
        }
        
        async function startApp() {
            const overlay = document.getElementById('auth-overlay');
            const panel = document.getElementById('app-panel');
            if (overlay) overlay.classList.remove('visible');
            if (panel) panel.style.display = '';
            const { books } = await loadBooksFromStorage();
            window.readingTracker = new ReadingTracker(books);
                const user = supabaseClient ? await getCurrentUser() : null;
            if (supabaseClient && user) {
                updateSyncUI('• Sincronizado com a nuvem', '', '');
                setupRealtimeSubscription(user.id, window.readingTracker);
            } else {
                updateSyncUI('', 'Fonte: dados-leitura.json ou navegador', '');
            }
        }
        
        function setupAuthOverlay() {
            const overlay = document.getElementById('auth-overlay');
            const form = document.getElementById('auth-form');
            const emailInput = document.getElementById('auth-email');
            const passwordInput = document.getElementById('auth-password');
            const submitBtn = document.getElementById('auth-submit');
            const errorEl = document.getElementById('auth-error');
            let isSignup = false;
            document.querySelectorAll('[data-auth-tab]').forEach(btn => {
                btn.addEventListener('click', () => {
                    isSignup = btn.getAttribute('data-auth-tab') === 'signup';
                    document.querySelectorAll('[data-auth-tab]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    submitBtn.textContent = isSignup ? 'Criar conta' : 'Entrar';
                    if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
                });
            });
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = emailInput.value.trim();
                const password = passwordInput.value;
                if (!email || !password) return;
                if (errorEl) { errorEl.textContent = ''; errorEl.classList.add('hidden'); }
                submitBtn.disabled = true;
                try {
                    if (isSignup) {
                        const { error } = await supabaseClient.auth.signUp({ email, password });
                        if (error) throw error;
                    } else {
                        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
                        if (error) throw error;
                    }
                    await startApp();
                } catch (err) {
                    if (errorEl) {
                        errorEl.textContent = err.message || 'Erro ao entrar. Tente novamente.';
                        errorEl.classList.remove('hidden');
                    }
                }
                submitBtn.disabled = false;
            });
        }
        
        document.addEventListener('DOMContentLoaded', async () => {
            // Partículas flutuantes no fundo
            const particlesEl = document.getElementById('bg-particles');
            if (particlesEl) {
                const count = 24;
                for (let i = 0; i < count; i++) {
                    const p = document.createElement('span');
                    p.className = 'particle';
                    p.style.left = Math.random() * 100 + '%';
                    p.style.top = Math.random() * 100 + '%';
                    p.style.width = p.style.height = (4 + Math.random() * 8) + 'px';
                    p.style.animationDelay = (Math.random() * 8) + 's';
                    p.style.animationDuration = (12 + Math.random() * 10) + 's';
                    particlesEl.appendChild(p);
                }
            }
            // Partículas na tela de login
            const authParticlesEl = document.getElementById('auth-bg-particles');
            if (authParticlesEl) {
                const count = 18;
                for (let i = 0; i < count; i++) {
                    const p = document.createElement('span');
                    p.className = 'particle auth-particle';
                    p.style.left = Math.random() * 100 + '%';
                    p.style.top = Math.random() * 100 + '%';
                    p.style.width = p.style.height = (4 + Math.random() * 8) + 'px';
                    p.style.animationDelay = (Math.random() * 8) + 's';
                    p.style.animationDuration = (12 + Math.random() * 10) + 's';
                    authParticlesEl.appendChild(p);
                }
            }
            if (SUPABASE_CONFIGURED) {
                if (!supabaseClient) {
                    const msg = document.getElementById('auth-overlay') || document.body;
                    if (msg) {
                        msg.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;max-width:400px;margin:auto"><h2>Supabase não carregou</h2><p>Verifique sua conexão. A biblioteca do Supabase deve carregar antes do app.</p></div>';
                    }
                    return;
                }
                const user = await getCurrentUser();
                const overlay = document.getElementById('auth-overlay');
                if (user) {
                    await startApp();
                } else {
                    if (overlay) overlay.classList.add('visible');
                    setupAuthOverlay();
                }
            } else {
                await startApp();
            }
        });
