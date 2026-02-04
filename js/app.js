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
        
        async function pushToSupabase(books) {
            if (!supabaseClient) {
                const r = { ok: false, error: 'Supabase não configurado', data: null };
                logSupabase('push', r);
                return r;
            }
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                const r = { ok: false, error: 'Faça login para sincronizar', data: null };
                logSupabase('push', r);
                return r;
            }
            let dataPayload = Array.isArray(books) ? books : (books?.books || []);
            if (JSON.stringify(dataPayload).length > 500000) {
                dataPayload = dataPayload.map(b => ({ ...b, pdfUrl: '' }));
            }
            const row = { user_id: user.id, payload: dataPayload, updated_at: new Date().toISOString() };
            const response = await supabaseClient.from('user_reading_data').upsert(row, {
                onConflict: 'user_id',
                ignoreDuplicates: false
            }).select();
            const { data, error } = response;
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
                const { data: { user } } = await supabaseClient.auth.getUser();
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
        class ReadingTracker {
            constructor(initialBooks) {
                this.books = Array.isArray(initialBooks) ? initialBooks.map(normalizeBook) : [];
                this.selectedBookId = null;
                this.detailFormDirty = false;
                this.init();
            }
            
            init() {
                this.setupEventListeners();
                this.setupStarRating();
                this.setupGenreChips();
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
                
                // Limpar formulário
                document.getElementById('clear-form').addEventListener('click', () => {
                    document.getElementById('book-form').reset();
                    document.getElementById('cover-name').textContent = 'Nenhum arquivo selecionado';
                    document.getElementById('pdf-name').textContent = 'Nenhum arquivo selecionado';
                    this.clearGenreChips();
                });
                
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
                    const el = document.getElementById('cover-name');
                    if (file) {
                        el.textContent = file.name;
                        el.title = file.name;
                    } else {
                        el.textContent = 'Nenhum arquivo selecionado';
                        el.removeAttribute('title');
                    }
                });
                
                // Upload de PDF (qualquer tamanho; nome longo é truncado na tela, título mostra completo)
                document.getElementById('book-pdf').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    const el = document.getElementById('pdf-name');
                    if (file) {
                        el.textContent = file.name;
                        el.title = file.name;
                    } else {
                        el.textContent = 'Nenhum arquivo selecionado';
                        el.removeAttribute('title');
                    }
                });
                
                // Tabs
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.addEventListener('click', () => {
                        const tabId = tab.getAttribute('data-tab');
                        this.switchTab(tabId);
                    });
                });
                
                // Exportar dados no formato dados-leitura.json (mesmo diretório)
                document.getElementById('export-json').addEventListener('click', () => this.exportToJsonFile());
                document.getElementById('export-backup').addEventListener('click', () => this.exportBackup());
                
                // Restaurar backup (arquivo)
                document.getElementById('import-backup-file').addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) this.importBackupFromFile(file);
                    e.target.value = '';
                });
                
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
                        const el = tab === 'more' ? document.getElementById('mobile-more-content') : document.getElementById('mobile-panel-' + tab);
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
                
                // Mobile: Sincronizar agora (Supabase)
                const syncBtnMobile = document.getElementById('btn-sync-now-mobile');
                if (supabaseClient && syncBtnMobile) {
                    syncBtnMobile.style.display = '';
                    syncBtnMobile.addEventListener('click', async () => {
                        syncBtnMobile.disabled = true;
                        const result = await pushToSupabase(this.books);
                        syncBtnMobile.disabled = false;
                        if (result.ok) {
                            updateSyncUI('• Sincronizado com a nuvem', 'Salvo', '');
                            Swal.fire({ title: 'Sincronizado', text: 'Dados enviados para a nuvem.', icon: 'success' });
                        } else {
                            const msg = result.error?.message || (typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
                            Swal.fire({ title: 'Erro ao sincronizar', html: '<pre style="font-size:11px;overflow:auto;">' + msg + '</pre>', icon: 'error' });
                        }
                    });
                }
                // Mobile: exportar JSON e backup (seção Mais)
                document.getElementById('export-json-mobile')?.addEventListener('click', () => this.exportToJsonFile());
                document.getElementById('export-backup-mobile')?.addEventListener('click', () => this.exportBackup());
                document.getElementById('import-backup-file-mobile')?.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) this.importBackupFromFile(file);
                    e.target.value = '';
                });
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
            
            saveBook() {
                const title = document.getElementById('book-title').value.trim();
                const author = document.getElementById('book-author').value.trim();
                const pages = parseInt(document.getElementById('book-pages').value);
                const genres = this.getGenresFromForm();
                const status = document.getElementById('book-status').value;
                const notes = document.getElementById('book-notes').value.trim();
                const coverFile = document.getElementById('book-cover').files[0];
                const pdfFile = document.getElementById('book-pdf').files[0];
                
                const coverPromise = coverFile ? this.readFileAsDataURL(coverFile) : Promise.resolve('');
                const pdfPromise = pdfFile ? this.readFileAsDataURL(pdfFile) : Promise.resolve('');
                
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
                document.getElementById('cover-name').textContent = 'Nenhum arquivo selecionado';
                document.getElementById('pdf-name').textContent = 'Nenhum arquivo selecionado';
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
                
                const date = document.getElementById('session-date').value;
                const time = parseInt(document.getElementById('session-time').value);
                const startPage = parseInt(document.getElementById('start-page').value);
                const endPage = parseInt(document.getElementById('end-page').value);
                const rating = parseInt(document.getElementById('session-rating').value);
                const notes = document.getElementById('session-notes').value.trim();
                
                // Validações
                const book = this.books.find(b => b.id === this.selectedBookId);
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
                this.renderReadingSessions();
                
                // Limpar formulário
                document.getElementById('reading-form').reset();
                this.setDefaultDate();
                document.getElementById('session-rating').value = '4';
                this.updateStarDisplay(document.getElementById('star-rating-input'), 4);
                this.detailFormDirty = false;
                Swal.fire({ title: 'Sessão registrada', text: 'Sessão de leitura salva com sucesso!', icon: 'success' });
            }
            
            deleteBook(bookId) {
                this.books = this.books.filter(book => book.id !== bookId);
                
                if (this.selectedBookId === bookId) {
                    this.selectedBookId = null;
                }
                
                this.saveToLocalStorage();
                this.renderBooks();
                this.updateUI();
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
                    const statusEl = document.getElementById('sync-status');
                    if (statusEl) { statusEl.textContent = 'Enviando…'; statusEl.className = 'sync-status syncing'; }
                    pushToSupabase(this.books).then(({ ok, error }) => {
                        if (ok) {
                            updateSyncUI('• Sincronizado com a nuvem', 'Salvo', '');
                        } else {
                            const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
                            updateSyncUI('', 'Erro ao sincronizar', 'error');
                            console.error('Sync Supabase:', error);
                            Swal.fire({
                                title: 'Erro ao sincronizar',
                                html: '<pre style="text-align:left;font-size:11px;overflow:auto;max-height:180px;">' + msg + '</pre><p style="margin-top:12px;font-size:13px;">1) Execute o supabase-schema.sql no SQL Editor.<br>2) Desative "Confirm email" em Authentication > Providers.<br>3) Confira as políticas RLS.</p>',
                                icon: 'error'
                            });
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
                
                // Atualizar estatísticas
                document.getElementById('stat-sessions').textContent = sessionsCount;
                document.getElementById('stat-pages').textContent = pagesRead;
                document.getElementById('stat-time').textContent = `${totalTime}h`;
                document.getElementById('stat-rating').textContent = averageRating.toFixed(1);
                
                // Atualizar formulário de sessão
                document.getElementById('start-page').value = pagesRead;
                document.getElementById('end-page').min = pagesRead + 1;
                document.getElementById('end-page').max = book.pages;
                
                // Renderizar sessões de leitura
                this.renderReadingSessions();
                
                // Estimativa de conclusão
                this.updateEstimate(book);
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
                const book = this.books.find(b => b.id === this.selectedBookId);
                
                if (!book || book.readingSessions.length === 0) {
                    container.innerHTML = '<div class="no-data">Nenhuma sessão de leitura registrada</div>';
                    return;
                }
                
                // Ordenar por data (mais recente primeiro)
                const sortedSessions = [...book.readingSessions].sort((a, b) => new Date(b.date) - new Date(a.date));
                
                container.innerHTML = '';
                
                sortedSessions.forEach(session => {
                    const sessionElement = document.createElement('div');
                    sessionElement.className = 'reading-session';
                    
                    // Formatar data
                    const dateObj = new Date(session.date);
                    const formattedDate = dateObj.toLocaleDateString('pt-BR');
                    
                    // SVG estrela (path)
                    const starPath = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
                    let starsHtml = '';
                    for (let s = 1; s <= 5; s++) {
                        const filled = s <= session.rating ? 'filled' : 'empty';
                        starsHtml += `<span class="star-svg ${filled}"><svg viewBox="0 0 24 24"><path d="${starPath}"/></svg></span>`;
                    }
                    
                    sessionElement.innerHTML = `
                        <div class="reading-date">${formattedDate}</div>
                        <h4>Páginas ${session.startPage} a ${session.endPage}</h4>
                        <p>${session.notes || 'Sem observações'}</p>
                        <div class="reading-info">
                            <span>${session.time} minutos</span>
                            <span class="star-rating star-rating-display">${starsHtml}</span>
                        </div>
                    `;
                    
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
            const sourceEl = document.getElementById('sync-source');
            const statusEl = document.getElementById('sync-status');
            if (sourceEl) sourceEl.textContent = source;
            if (statusEl) {
                statusEl.textContent = status;
                statusEl.className = 'sync-status' + (statusClass ? ' ' + statusClass : '');
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
            if (overlay) overlay.classList.remove('visible');
            const { books } = await loadBooksFromStorage();
            window.readingTracker = new ReadingTracker(books);
            const { data: { user } } = supabaseClient ? await supabaseClient.auth.getUser() : { data: { user: null } };
            if (supabaseClient && user) {
                updateSyncUI('• Sincronizado com a nuvem', '', '');
                setupRealtimeSubscription(user.id, window.readingTracker);
                const backupSpan = document.querySelector('.footer-backup span');
                if (backupSpan) backupSpan.innerHTML = 'Dados sincronizados na nuvem (Supabase). Exporte o JSON para backup local.';
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
            if (SUPABASE_CONFIGURED) {
                if (!supabaseClient) {
                    const msg = document.getElementById('auth-overlay') || document.body;
                    if (msg) {
                        msg.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;max-width:400px;margin:auto"><h2>Supabase não carregou</h2><p>Verifique sua conexão. A biblioteca do Supabase deve carregar antes do app.</p></div>';
                    }
                    return;
                }
                const { data: { user } } = await supabaseClient.auth.getUser();
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
