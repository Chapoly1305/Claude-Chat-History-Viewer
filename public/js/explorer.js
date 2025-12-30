// Explorer functionality for Claude Chat History Viewer

(function() {
    'use strict';

    // State
    let currentFolder = '';
    let searchTerm = '';
    let dateRangeStart = null;
    let dateRangeEnd = null;
    let selectedChatId = null;
    let chatCache = {};
    let ignoreWarmup = true;

    // DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const chatList = document.getElementById('chat-list');
    const searchInput = document.getElementById('search-input');
    const visibleCount = document.getElementById('visible-count');
    const emptyState = document.getElementById('empty-state');

    // Detail Panel Elements
    const detailEmpty = document.getElementById('detail-empty');
    const detailContent = document.getElementById('detail-content');
    const detailLoading = document.getElementById('detail-loading');
    const detailTitle = document.getElementById('detail-title');
    const detailProject = document.getElementById('detail-project');
    const detailCount = document.getElementById('detail-count');
    const detailLink = document.getElementById('detail-link');
    const detailDownload = document.getElementById('detail-download');
    const detailMessages = document.getElementById('detail-messages');

    // Initialize
    function init() {
        initTheme();

        // Check URL for initial folder and chat
        const urlParams = new URLSearchParams(window.location.search);
        const folderParam = urlParams.get('folder');
        const chatParam = urlParams.get('chat');

        if (folderParam) {
            selectFolder(folderParam, false);
        }

        if (chatParam) {
            const [projectDir, chatId] = chatParam.split('/');
            if (projectDir && chatId) {
                selectChat(projectDir, chatId, false);
            }
        }

        // Set up search with debounce
        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleSearch, 200));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    handleSearch();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput?.focus();
            }
        });

        // Connect TimeSlider if available
        if (window.TimeSlider) {
            window.TimeSlider.onRangeChange(function(startDate, endDate) {
                dateRangeStart = startDate;
                dateRangeEnd = endDate;
                filterChats();
            });
        }

        // Apply initial filters (including warmup filter)
        filterChats();
    }

    // Theme Management
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

        const toggleInput = document.getElementById('theme-toggle-input');
        if (toggleInput) {
            toggleInput.checked = savedTheme === 'light';
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        const darkIcon = document.getElementById('dark-icon');
        const lightIcon = document.getElementById('light-icon');

        if (darkIcon && lightIcon) {
            if (theme === 'light') {
                darkIcon.classList.remove('active');
                lightIcon.classList.add('active');
            } else {
                darkIcon.classList.add('active');
                lightIcon.classList.remove('active');
            }
        }
    }

    window.toggleTheme = function() {
        const toggleInput = document.getElementById('theme-toggle-input');
        const newTheme = toggleInput?.checked ? 'light' : 'dark';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    };

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Select folder
    window.selectFolder = function(path, updateUrl = true) {
        currentFolder = path;

        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.path === path) {
                item.classList.add('active');
            }
        });

        dateRangeStart = null;
        dateRangeEnd = null;

        if (window.TimeSlider) {
            window.TimeSlider.filterByFolder(path);
        }

        filterChats();

        if (updateUrl) {
            const url = new URL(window.location);
            if (path) {
                url.searchParams.set('folder', path);
            } else {
                url.searchParams.delete('folder');
            }
            window.history.pushState({}, '', url);
        }

        if (window.innerWidth <= 600) {
            closeSidebar();
        }
    };

    // Toggle month group
    window.toggleMonth = function(monthKey) {
        const group = document.querySelector(`.month-group[data-month="${monthKey}"]`);
        if (group) {
            group.classList.toggle('collapsed');
        }
    };

    // Handle search
    function handleSearch() {
        searchTerm = searchInput?.value.toLowerCase() || '';
        filterChats();
    }

    // Toggle warmup filter
    window.toggleWarmupFilter = function() {
        const checkbox = document.getElementById('ignore-warmup');
        ignoreWarmup = checkbox?.checked ?? true;
        filterChats();
    };

    // Filter chats
    function filterChats() {
        const cards = document.querySelectorAll('.chat-card');
        const monthGroups = document.querySelectorAll('.month-group');
        let visibleCards = 0;
        const monthCounts = {};

        cards.forEach(card => {
            const project = card.dataset.project || '';
            const title = (card.dataset.title || '').toLowerCase();
            const searchable = (card.dataset.searchable || '').toLowerCase();
            const cardDateStr = card.dataset.date;

            const matchesFolder = !currentFolder || project === currentFolder;

            const matchesSearch = !searchTerm ||
                title.includes(searchTerm) ||
                searchable.includes(searchTerm) ||
                project.toLowerCase().includes(searchTerm);

            // Check warmup filter
            const isWarmup = card.dataset.warmup === 'true';
            const matchesWarmup = !ignoreWarmup || !isWarmup;

            let matchesDateRange = true;
            if (dateRangeStart || dateRangeEnd) {
                const cardDate = new Date(cardDateStr);
                if (!isNaN(cardDate)) {
                    if (dateRangeStart && cardDate < dateRangeStart) {
                        matchesDateRange = false;
                    }
                    if (dateRangeEnd && cardDate > dateRangeEnd) {
                        matchesDateRange = false;
                    }
                }
            }

            if (matchesFolder && matchesSearch && matchesDateRange && matchesWarmup) {
                card.style.display = '';
                visibleCards++;

                const monthGroup = card.closest('.month-group');
                if (monthGroup) {
                    const month = monthGroup.dataset.month;
                    monthCounts[month] = (monthCounts[month] || 0) + 1;
                }
            } else {
                card.style.display = 'none';
            }
        });

        monthGroups.forEach(group => {
            const month = group.dataset.month;
            const count = monthCounts[month] || 0;
            const countEl = group.querySelector('.month-count');

            if (count > 0) {
                group.style.display = '';
                if (countEl) {
                    countEl.textContent = `(${count})`;
                }
            } else {
                group.style.display = 'none';
            }
        });

        if (visibleCount) {
            visibleCount.textContent = visibleCards;
        }

        if (emptyState) {
            emptyState.style.display = visibleCards === 0 ? '' : 'none';
        }
    }

    // Select and load chat
    window.selectChat = async function(projectDir, chatId, updateUrl = true) {
        selectedChatId = `${projectDir}/${chatId}`;

        // Update active state in list
        document.querySelectorAll('.chat-card').forEach(card => {
            card.classList.remove('active');
            if (card.dataset.projectDir === projectDir && card.dataset.chatId === chatId) {
                card.classList.add('active');
            }
        });

        // Show loading state
        if (detailEmpty) detailEmpty.style.display = 'none';
        if (detailContent) detailContent.style.display = 'none';
        if (detailLoading) detailLoading.style.display = 'flex';

        // Update URL
        if (updateUrl) {
            const url = new URL(window.location);
            url.searchParams.set('chat', selectedChatId);
            window.history.pushState({}, '', url);
        }

        try {
            // Check cache first
            let data;
            if (chatCache[selectedChatId]) {
                data = chatCache[selectedChatId];
            } else {
                const response = await fetch(`/api/chat/${projectDir}/${chatId}`);
                if (!response.ok) throw new Error('Failed to load chat');
                data = await response.json();
                chatCache[selectedChatId] = data;
            }

            renderChatDetail(data);
        } catch (error) {
            console.error('Error loading chat:', error);
            if (detailLoading) detailLoading.style.display = 'none';
            if (detailEmpty) {
                detailEmpty.style.display = 'flex';
                detailEmpty.querySelector('.detail-empty-text').textContent = 'Failed to load chat';
            }
        }
    };

    // Render chat detail
    function renderChatDetail(data) {
        if (detailLoading) detailLoading.style.display = 'none';
        if (detailContent) detailContent.style.display = 'flex';

        // Update header
        if (detailTitle) detailTitle.textContent = data.title || 'Chat';
        if (detailProject) detailProject.textContent = data.projectName;
        if (detailCount) detailCount.textContent = `${data.messageCount} messages`;
        if (detailLink) detailLink.href = `/chat/${data.projectDir}/${data.chatId}`;
        if (detailDownload) detailDownload.href = `/download/${data.projectDir}/${data.chatId}`;

        // Render messages
        if (detailMessages) {
            detailMessages.innerHTML = data.messages.map((msg, idx) => `
                <div class="detail-message" id="msg-${idx}">
                    <div class="detail-message-role">
                        <span class="role-badge ${msg.role}">${capitalize(msg.role)}</span>
                        ${msg.timestamp ? `<span class="msg-time">${formatTime(msg.timestamp)}</span>` : ''}
                    </div>
                    <div class="detail-message-content">
                        ${msg.htmlContent || escapeHtml(msg.content) || '<em>No content</em>'}
                    </div>
                </div>
            `).join('');

            // Scroll to top
            detailMessages.scrollTop = 0;
        }
    }

    // Helper functions
    function capitalize(str) {
        return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    }

    function formatTime(timestamp) {
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } catch {
            return '';
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Toggle sidebar (mobile)
    window.toggleSidebar = function() {
        sidebar?.classList.toggle('open');
        sidebarOverlay?.classList.toggle('visible');
    };

    function closeSidebar() {
        sidebar?.classList.remove('open');
        sidebarOverlay?.classList.remove('visible');
    }

    // Toggle folder expand/collapse
    window.toggleFolderExpand = function(path, event) {
        event.stopPropagation();
        const folderItem = document.querySelector(`.folder-item[data-path="${path}"]`);
        if (folderItem) {
            folderItem.classList.toggle('expanded');
            const toggle = folderItem.querySelector('.folder-toggle');
            if (toggle) {
                toggle.classList.toggle('expanded');
            }
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
