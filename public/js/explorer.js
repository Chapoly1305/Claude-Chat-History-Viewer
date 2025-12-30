// Explorer functionality for Claude Chat History Viewer

(function() {
    'use strict';

    // State
    let currentFolder = '';
    let searchTerm = '';
    let dateRangeStart = null;
    let dateRangeEnd = null;

    // DOM Elements
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const chatList = document.getElementById('chat-list');
    const searchInput = document.getElementById('search-input');
    const breadcrumb = document.getElementById('breadcrumb');
    const visibleCount = document.getElementById('visible-count');
    const emptyState = document.getElementById('empty-state');

    // Navigation context - save before leaving, restore on return
    function saveNavigationContext() {
        sessionStorage.setItem('returnContext', JSON.stringify({
            folder: currentFolder,
            scrollY: window.scrollY,
            dateRange: { start: dateRangeStart, end: dateRangeEnd }
        }));
    }

    function restoreNavigationContext() {
        const contextStr = sessionStorage.getItem('returnContext');
        if (contextStr) {
            try {
                const context = JSON.parse(contextStr);
                // Restore scroll position after a brief delay to let DOM render
                if (context.scrollY) {
                    setTimeout(() => window.scrollTo(0, context.scrollY), 100);
                }
                // Restore date range if time slider is available
                if (context.dateRange && context.dateRange.start) {
                    dateRangeStart = new Date(context.dateRange.start);
                    dateRangeEnd = context.dateRange.end ? new Date(context.dateRange.end) : null;
                }
            } catch (e) {
                console.error('Failed to restore navigation context:', e);
            }
            sessionStorage.removeItem('returnContext');
        }
    }

    // Initialize
    function init() {
        // Initialize theme from localStorage
        initTheme();

        // Check URL for initial folder
        const urlParams = new URLSearchParams(window.location.search);
        const folderParam = urlParams.get('folder');
        if (folderParam) {
            selectFolder(folderParam, false);
        }

        // Restore navigation context from previous session
        restoreNavigationContext();

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
            // Ctrl/Cmd + K to focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput?.focus();
            }
        });

        // Save navigation context when clicking chat links
        document.querySelectorAll('.chat-link').forEach(link => {
            link.addEventListener('click', saveNavigationContext);
        });

        // Connect TimeSlider range change to filtering
        if (window.TimeSlider) {
            window.TimeSlider.onRangeChange(function(startDate, endDate) {
                dateRangeStart = startDate;
                dateRangeEnd = endDate;
                filterChats();
            });

            // Restore date range selection if available
            if (dateRangeStart) {
                window.TimeSlider.setSelection(dateRangeStart, dateRangeEnd);
            }
        }
    }

    // Theme Management
    function initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

        // Update toggle checkbox state
        const toggleInput = document.getElementById('theme-toggle-input');
        if (toggleInput) {
            toggleInput.checked = savedTheme === 'light';
        }
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);

        // Update icon states
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

    // Toggle theme (called from HTML)
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

        // Update active state in sidebar
        document.querySelectorAll('.folder-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.path === path) {
                item.classList.add('active');
            }
        });

        // Update breadcrumb
        updateBreadcrumb(path);

        // Clear date range when folder changes
        dateRangeStart = null;
        dateRangeEnd = null;

        // Update time slider to show only this folder's data
        if (window.TimeSlider) {
            window.TimeSlider.filterByFolder(path);
        }

        // Filter chats
        filterChats();

        // Update URL
        if (updateUrl) {
            const url = new URL(window.location);
            if (path) {
                url.searchParams.set('folder', path);
            } else {
                url.searchParams.delete('folder');
            }
            window.history.pushState({}, '', url);
        }

        // Close sidebar on mobile
        if (window.innerWidth <= 600) {
            closeSidebar();
        }
    };

    // Update breadcrumb
    function updateBreadcrumb(path) {
        if (!breadcrumb) return;

        if (!path) {
            breadcrumb.innerHTML = '<span class="breadcrumb-item active" data-path="">All Conversations</span>';
        } else {
            breadcrumb.innerHTML = `
                <span class="breadcrumb-item" data-path="" onclick="selectFolder('')">All Conversations</span>
                <span class="breadcrumb-separator">›</span>
                <span class="breadcrumb-item active" data-path="${path}">${path}</span>
            `;
        }
    }

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

    // Filter chats based on folder, search, and date range
    function filterChats() {
        const cards = document.querySelectorAll('.explorer-chat-card');
        const monthGroups = document.querySelectorAll('.month-group');
        let visibleCards = 0;
        const monthCounts = {};

        // First pass: filter cards
        cards.forEach(card => {
            const project = card.dataset.project || '';
            const title = (card.dataset.title || '').toLowerCase();
            const searchable = (card.dataset.searchable || '').toLowerCase();
            const cardDateStr = card.dataset.date;

            // Check folder filter
            const matchesFolder = !currentFolder || project === currentFolder;

            // Check search filter
            const matchesSearch = !searchTerm ||
                title.includes(searchTerm) ||
                searchable.includes(searchTerm) ||
                project.toLowerCase().includes(searchTerm);

            // Check date range filter
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

            if (matchesFolder && matchesSearch && matchesDateRange) {
                card.style.display = '';
                visibleCards++;

                // Count for month group
                const monthGroup = card.closest('.month-group');
                if (monthGroup) {
                    const month = monthGroup.dataset.month;
                    monthCounts[month] = (monthCounts[month] || 0) + 1;
                }
            } else {
                card.style.display = 'none';
            }
        });

        // Second pass: update month groups visibility and counts
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

        // Update visible count
        if (visibleCount) {
            visibleCount.textContent = visibleCards;
        }

        // Show/hide empty state
        if (emptyState) {
            emptyState.style.display = visibleCards === 0 ? '' : 'none';
        }
    }

    // Toggle sidebar (mobile)
    window.toggleSidebar = function() {
        sidebar?.classList.toggle('open');
        sidebarOverlay?.classList.toggle('visible');
    };

    // Close sidebar (mobile)
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
