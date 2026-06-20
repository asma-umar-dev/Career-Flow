/* ===================================================================
   CareerFlow — Application Logic
   Plain JavaScript (no frameworks). All data persisted in LocalStorage.
   =================================================================== */

(function () {
  'use strict';

  /* ===============================================================
     1. CONSTANTS & STORAGE KEYS
     =============================================================== */
  const STORAGE_KEYS = {
    APPLICATIONS: 'careerflow_applications',
    SETTINGS: 'careerflow_settings',
    THEME: 'careerflow_theme'
  };

  const STATUS_LIST = [
    'Wishlist',
    'Applied',
    'Under Review',
    'Assessment',
    'Interview Scheduled',
    'Final Interview',
    'Offer Received',
    'Accepted',
    'Rejected'
  ];

  // Statuses considered "positive funnel progress" (used for interview/offer rate calcs)
  const INTERVIEW_STATUSES = ['Interview Scheduled', 'Final Interview', 'Offer Received', 'Accepted'];
  const OFFER_STATUSES = ['Offer Received', 'Accepted'];
  const REJECTED_STATUS = 'Rejected';
  const APPLIED_STAGE_STATUSES = STATUS_LIST.filter((s) => s !== 'Wishlist');

  const MOTIVATIONAL_QUOTES = [
    'Every application is a step closer.',
    'Consistency beats intensity. Keep showing up.',
    'Rejection is redirection — the right offer is still ahead.',
    'Small daily progress adds up to big career moves.',
    'You are not behind. You are building momentum.',
    'The right opportunity is one application away.',
    'Discipline today, dream job tomorrow.',
    'Your next "yes" is closer than it feels.',
    'Track it, refine it, land it.',
    'Great careers are built one thoughtful application at a time.'
  ];

  const DEFAULT_SETTINGS = {
    displayName: 'Asma',
    dailyGoal: 2,
    weeklyGoal: 5
  };

  /* ===============================================================
     2. STATE
     =============================================================== */
  let applications = [];
  let settings = { ...DEFAULT_SETTINGS };

  // Filter / sort state for Applications view
  const uiState = {
    search: '',
    company: '',
    status: '',
    workType: '',
    sort: 'latest',
    layout: 'grid', // 'grid' | 'list'
    activeChip: ''
  };

  // Calendar state
  const calState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() // 0-indexed
  };

  // Pending confirm action (used by the generic confirm dialog)
  let pendingConfirmAction = null;
  // Id of application currently open in the details modal
  let activeDetailsId = null;

  /* ===============================================================
     3. STORAGE HELPERS
     =============================================================== */
  function loadApplications() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.APPLICATIONS);
      applications = raw ? JSON.parse(raw) : [];
    } catch (e) {
      applications = [];
    }
  }

  function saveApplications() {
    localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(applications));
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }

  function loadTheme() {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    }
  }

  function saveTheme(isDark) {
    localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
  }

  /* ===============================================================
     4. UTILITIES
     =============================================================== */
  function uid() {
    return 'app_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function statusToClass(status) {
    return 'badge-' + status.toLowerCase().replace(/\s+/g, '-');
  }

  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function formatDate(dateStr, opts) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    const options = opts || { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleDateString('en-US', options);
  }

  function shortDate(dateStr) {
    return formatDate(dateStr, { month: 'short', day: 'numeric' });
  }

  function daysBetween(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target - today) / 86400000);
  }

  function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  }

  function todayISO() {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d - tz).toISOString().slice(0, 10);
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // Re-render Lucide icons after DOM updates (icons are injected via data-lucide attrs)
  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }


  /* ===============================================================
     5. TOAST NOTIFICATIONS
     =============================================================== */
  const TOAST_ICONS = {
    success: 'check-circle-2',
    danger: 'trash-2',
    info: 'info'
  };

  function showToast(message, type) {
    type = type || 'success';
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
      '<span class="toast-icon"><i data-lucide="' + TOAST_ICONS[type] + '"></i></span>' +
      '<span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);
    refreshIcons();

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 280);
    }, 3200);
  }

  /* ===============================================================
     6. NAVIGATION / VIEW SWITCHING
     =============================================================== */
  const VIEW_META = {
    dashboard: { title: 'Dashboard', subtitle: 'A clear view of your job search, today.' },
    applications: { title: 'Applications', subtitle: 'Manage and track every opportunity in your pipeline.' },
    analytics: { title: 'Analytics', subtitle: 'Understand your job search performance at a glance.' },
    calendar: { title: 'Calendar', subtitle: 'Interviews, deadlines, and reminders in one timeline.' },
    settings: { title: 'Settings', subtitle: 'Personalize your CareerFlow workspace.' }
  };

  function switchView(viewName) {
    document.querySelectorAll('[data-view-panel]').forEach((panel) => {
      panel.hidden = panel.id !== 'view-' + viewName;
    });
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === viewName);
    });

    const meta = VIEW_META[viewName];
    if (meta) {
      document.getElementById('viewTitle').textContent = meta.title;
      document.getElementById('viewSubtitle').textContent = meta.subtitle;
    }

    closeSidebarMobile();

    // Render the relevant view's data fresh each time it's opened
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'applications') renderApplicationsView();
    if (viewName === 'analytics') renderAnalytics();
    if (viewName === 'calendar') renderCalendar();
    if (viewName === 'settings') renderSettingsView();

    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function initNavigation() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    document.querySelectorAll('[data-view-link]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.dataset.viewLink));
    });
    document.getElementById('settingsShortcut').addEventListener('click', () => switchView('settings'));
  }

  /* ===============================================================
     7. SIDEBAR (MOBILE) + THEME TOGGLE
     =============================================================== */
  function openSidebarMobile() {
    document.getElementById('sidebar').classList.add('is-open');
    document.getElementById('sidebarOverlay').classList.add('is-visible');
  }
  function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('is-open');
    document.getElementById('sidebarOverlay').classList.remove('is-visible');
  }

  function initSidebarToggle() {
    document.getElementById('sidebarToggle').addEventListener('click', openSidebarMobile);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebarMobile);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebarMobile);
  }

  function setTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    saveTheme(isDark);

    document.getElementById('themeToggle').setAttribute('aria-pressed', String(isDark));
    const settingsToggle = document.getElementById('settingsThemeToggle');
    if (settingsToggle) settingsToggle.setAttribute('aria-pressed', String(isDark));

    const icon = document.querySelector('#themeToggle i');
    if (icon) icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    refreshIcons();

    // Redraw charts since colors/gradients depend on CSS variables computed at render time
    if (!document.getElementById('view-analytics').hidden) renderAnalytics();
  }

  function initThemeToggle() {
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('themeToggle').setAttribute('aria-pressed', String(isDark));
    document.querySelector('#themeToggle i').setAttribute('data-lucide', isDark ? 'sun' : 'moon');

    document.getElementById('themeToggle').addEventListener('click', () => {
      setTheme(!document.documentElement.classList.contains('dark'));
    });
    document.getElementById('settingsThemeToggle').addEventListener('click', () => {
      setTheme(!document.documentElement.classList.contains('dark'));
    });
  }

  /* ===============================================================
     8. DASHBOARD VIEW
     =============================================================== */
  function computeStats() {
    const total = applications.length;
    const applied = applications.filter((a) => APPLIED_STAGE_STATUSES.includes(a.status)).length;
    const interviews = applications.filter((a) => INTERVIEW_STATUSES.includes(a.status)).length;
    const offers = applications.filter((a) => OFFER_STATUSES.includes(a.status)).length;
    const rejected = applications.filter((a) => a.status === REJECTED_STATUS).length;
    const successRate = applied > 0 ? Math.round((offers / applied) * 100) : 0;
    return { total, applied, interviews, offers, rejected, successRate };
  }

  const STAT_CARD_DEFS = [
    { key: 'total', label: 'Total Applications', icon: 'briefcase', cls: 'stat-icon-maroon' },
    { key: 'applied', label: 'Applied Jobs', icon: 'send', cls: 'stat-icon-blue' },
    { key: 'interviews', label: 'Interviews Scheduled', icon: 'users', cls: 'stat-icon-teal' },
    { key: 'offers', label: 'Offers Received', icon: 'award', cls: 'stat-icon-green' },
    { key: 'rejected', label: 'Rejected Applications', icon: 'x-circle', cls: 'stat-icon-red' },
    { key: 'successRate', label: 'Success Rate', icon: 'trending-up', cls: 'stat-icon-gold', suffix: '%' }
  ];

  function renderStatsGrid(stats) {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = STAT_CARD_DEFS.map((def) => `
      <div class="stat-card">
        <div class="stat-card-icon ${def.cls}"><i data-lucide="${def.icon}"></i></div>
        <div class="stat-card-value">${stats[def.key]}${def.suffix || ''}</div>
        <div class="stat-card-label">${def.label}</div>
      </div>
    `).join('');
    refreshIcons();
  }

  function renderRecentActivity() {
    const list = document.getElementById('recentList');
    const recent = [...applications]
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, 6);

    if (recent.length === 0) {
      list.innerHTML = '<div class="empty-mini">No activity yet. Add your first application to get started.</div>';
      return;
    }

    list.innerHTML = recent.map((app) => `
      <div class="recent-item" data-open-id="${app.id}">
        <div class="recent-item-logo">${initials(app.company)}</div>
        <div class="recent-item-info">
          <div class="recent-item-title">${escapeHtml(app.jobTitle)}</div>
          <div class="recent-item-sub">${escapeHtml(app.company)} • ${escapeHtml(app.location || 'Location N/A')}</div>
        </div>
        <span class="badge ${statusToClass(app.status)}">${app.status}</span>
      </div>
    `).join('');

    list.querySelectorAll('[data-open-id]').forEach((el) => {
      el.addEventListener('click', () => openDetailsModal(el.dataset.openId));
    });
  }

  function renderUpcoming() {
    const list = document.getElementById('upcomingList');
    const items = [];

    applications.forEach((app) => {
      if (app.interviewDate) {
        const d = daysBetween(app.interviewDate);
        if (d !== null && d >= 0) items.push({ type: 'interview', date: app.interviewDate, days: d, app });
      }
      if (app.deadline) {
        const d = daysBetween(app.deadline);
        if (d !== null && d >= 0 && !['Accepted', 'Rejected'].includes(app.status)) {
          items.push({ type: 'deadline', date: app.deadline, days: d, app });
        }
      }
    });

    items.sort((a, b) => a.days - b.days);
    const top = items.slice(0, 6);

    if (top.length === 0) {
      list.innerHTML = '<div class="empty-mini">Nothing upcoming. You\'re all caught up.</div>';
      return;
    }

    list.innerHTML = top.map((item) => {
      const d = new Date(item.date + 'T00:00:00');
      const day = d.getDate();
      const mon = d.toLocaleDateString('en-US', { month: 'short' });
      const labelText = item.type === 'interview' ? 'Interview' : 'Deadline';
      const dayWord = item.days === 0 ? 'Today' : item.days === 1 ? 'Tomorrow' : `In ${item.days} days`;
      return `
        <div class="upcoming-item" data-open-id="${item.app.id}" style="cursor:pointer">
          <div class="upcoming-date-badge"><span class="day">${day}</span><span class="mon">${mon}</span></div>
          <div class="upcoming-item-info">
            <div class="upcoming-item-title">${escapeHtml(item.app.company)} — ${escapeHtml(item.app.jobTitle)}</div>
            <div class="upcoming-item-sub">${dayWord}</div>
            <span class="upcoming-tag ${item.type}">${labelText}</span>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-open-id]').forEach((el) => {
      el.addEventListener('click', () => openDetailsModal(el.dataset.openId));
    });
  }

  function renderGoalsAndQuote() {
    const today = todayISO();
    const startOfWeek = new Date();
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday start

    const dailyCount = applications.filter((a) => a.applicationDate === today).length;
    const weeklyCount = applications.filter((a) => {
      if (!a.applicationDate) return false;
      const d = new Date(a.applicationDate + 'T00:00:00');
      return d >= startOfWeek;
    }).length;

    const dailyGoal = settings.dailyGoal || 1;
    const weeklyGoal = settings.weeklyGoal || 1;

    document.getElementById('dailyCount').textContent = dailyCount;
    document.getElementById('dailyTarget').textContent = dailyGoal;
    document.getElementById('weeklyCount').textContent = weeklyCount;
    document.getElementById('weeklyTarget').textContent = weeklyGoal;

    document.getElementById('dailyFill').style.width = Math.min(100, (dailyCount / dailyGoal) * 100) + '%';
    document.getElementById('weeklyFill').style.width = Math.min(100, (weeklyCount / weeklyGoal) * 100) + '%';

    document.getElementById('sidebarGoalCount').textContent = `${weeklyCount} / ${weeklyGoal}`;
    document.getElementById('sidebarGoalFill').style.width = Math.min(100, (weeklyCount / weeklyGoal) * 100) + '%';
  }

  function setRandomQuote() {
    const q = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    document.getElementById('motivationalQuote').textContent = `"${q}"`;
  }

  function renderDashboard() {
    const stats = computeStats();
    renderStatsGrid(stats);
    renderRecentActivity();
    renderUpcoming();
    renderGoalsAndQuote();
  }

  /* ===============================================================
     9. APPLICATIONS VIEW — FILTER / SORT / RENDER
     =============================================================== */
  function populateCompanyFilter() {
    const select = document.getElementById('filterCompany');
    const current = select.value;
    const companies = [...new Set(applications.map((a) => a.company).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All companies</option>' +
      companies.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = companies.includes(current) ? current : '';
  }

  function populateStatusFilter() {
    const select = document.getElementById('filterStatus');
    const current = select.value;
    select.innerHTML = '<option value="">All statuses</option>' +
      STATUS_LIST.map((s) => `<option value="${s}">${s}</option>`).join('');
    select.value = current;
  }

  function renderStatusChips() {
    const row = document.getElementById('statusChipRow');
    const counts = {};
    STATUS_LIST.forEach((s) => (counts[s] = 0));
    applications.forEach((a) => { if (counts[a.status] !== undefined) counts[a.status]++; });

    const chips = ['<button class="status-chip' + (uiState.activeChip === '' ? ' is-active' : '') + '" data-chip="">All (' + applications.length + ')</button>']
      .concat(STATUS_LIST.map((s) =>
        `<button class="status-chip${uiState.activeChip === s ? ' is-active' : ''}" data-chip="${s}">${s} (${counts[s]})</button>`
      ));
    row.innerHTML = chips.join('');

    row.querySelectorAll('[data-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.activeChip = btn.dataset.chip;
        document.getElementById('filterStatus').value = btn.dataset.chip;
        uiState.status = btn.dataset.chip;
        renderApplicationsGrid();
        renderStatusChips();
      });
    });
  }

  function getFilteredSortedApplications() {
    let list = [...applications];

    if (uiState.search.trim()) {
      const q = uiState.search.trim().toLowerCase();
      list = list.filter((a) =>
        (a.company || '').toLowerCase().includes(q) ||
        (a.jobTitle || '').toLowerCase().includes(q) ||
        (a.location || '').toLowerCase().includes(q)
      );
    }
    if (uiState.company) list = list.filter((a) => a.company === uiState.company);
    if (uiState.status) list = list.filter((a) => a.status === uiState.status);
    if (uiState.workType) list = list.filter((a) => a.workType === uiState.workType);

    switch (uiState.sort) {
      case 'oldest':
        list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'deadline':
        list.sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        });
        break;
      case 'latest':
      default:
        list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
    }
    return list;
  }

  function renderApplicationCard(app) {
    const deadlineDays = app.deadline ? daysBetween(app.deadline) : null;
    let deadlineLabel = '';
    if (deadlineDays !== null) {
      if (deadlineDays < 0) deadlineLabel = 'Past due';
      else if (deadlineDays === 0) deadlineLabel = 'Today';
      else deadlineLabel = `${deadlineDays}d left`;
    }

    return `
      <div class="app-card" data-card-id="${app.id}">
        <div class="app-card-top">
          <div class="app-card-logo">${initials(app.company)}</div>
          <div class="app-card-heading">
            <div class="app-card-company" title="${escapeHtml(app.company)}">${escapeHtml(app.company)}</div>
            <div class="app-card-title" title="${escapeHtml(app.jobTitle)}">${escapeHtml(app.jobTitle)}</div>
          </div>
        </div>

        <span class="badge ${statusToClass(app.status)} app-card-badge">${app.status}</span>

        <div class="app-card-meta">
          <span class="app-card-meta-item"><i data-lucide="map-pin"></i>${escapeHtml(app.location || 'Not specified')}</span>
          <span class="app-card-meta-item"><i data-lucide="home"></i>${escapeHtml(app.workType || '—')}</span>
          <span class="app-card-meta-item"><i data-lucide="clock"></i>${escapeHtml(app.jobType || '—')}</span>
        </div>

        <div class="app-card-footer">
          <div>
            <div class="app-card-salary">${escapeHtml(app.salaryRange || 'Salary not listed')}</div>
            <div class="app-card-dates">
              <span>Applied: <strong>${shortDate(app.applicationDate)}</strong></span>
              ${app.deadline ? `<span>Deadline: <strong>${deadlineLabel}</strong></span>` : ''}
            </div>
          </div>
          <div class="app-card-actions">
            <button data-action="view" title="View details"><i data-lucide="eye"></i></button>
            <button data-action="edit" title="Edit"><i data-lucide="pencil"></i></button>
            <button data-action="duplicate" title="Duplicate"><i data-lucide="copy"></i></button>
            <button data-action="delete" class="danger" title="Delete"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      </div>
    `;
  }

  function renderApplicationsGrid() {
    const grid = document.getElementById('applicationsGrid');
    const emptyState = document.getElementById('applicationsEmpty');
    const filtered = getFilteredSortedApplications();

    document.getElementById('resultsCount').textContent =
      `${filtered.length} application${filtered.length === 1 ? '' : 's'}`;

    grid.classList.toggle('is-list', uiState.layout === 'list');

    if (applications.length === 0) {
      grid.style.display = 'none';
      emptyState.hidden = false;
      return;
    }

    grid.style.display = 'grid';

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-illustration"><i data-lucide="search-x"></i></div>
          <h3>No matching applications</h3>
          <p>Try adjusting your search or filters to find what you're looking for.</p>
        </div>
      `;
      emptyState.hidden = true;
      refreshIcons();
      return;
    }

    emptyState.hidden = true;
    grid.innerHTML = filtered.map((app, idx) => {
      // Stagger card entrance animation slightly for a premium feel
      return renderApplicationCard(app).replace(
        '<div class="app-card"',
        `<div class="app-card" style="animation-delay:${Math.min(idx, 8) * 35}ms"`
      );
    }).join('');

    refreshIcons();
    bindApplicationCardEvents();
  }

  function bindApplicationCardEvents() {
    document.querySelectorAll('#applicationsGrid .app-card').forEach((card) => {
      const id = card.dataset.cardId;

      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return; // handled separately
        openDetailsModal(id);
      });

      card.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'view') openDetailsModal(id);
          if (action === 'edit') openFormModal(id);
          if (action === 'duplicate') duplicateApplication(id);
          if (action === 'delete') confirmDeleteApplication(id);
        });
      });
    });
  }

  function renderApplicationsView() {
    populateCompanyFilter();
    populateStatusFilter();
    document.getElementById('filterCompany').value = uiState.company;
    document.getElementById('filterStatus').value = uiState.status;
    document.getElementById('filterWorkType').value = uiState.workType;
    document.getElementById('sortBy').value = uiState.sort;
    renderStatusChips();
    renderApplicationsGrid();
  }

  function initApplicationsToolbar() {
    document.getElementById('globalSearch').addEventListener('input', debounce((e) => {
      uiState.search = e.target.value;
      if (document.getElementById('view-applications').hidden) switchView('applications');
      else renderApplicationsGrid();
    }, 220));

    document.getElementById('filterCompany').addEventListener('change', (e) => {
      uiState.company = e.target.value;
      renderApplicationsGrid();
    });
    document.getElementById('filterStatus').addEventListener('change', (e) => {
      uiState.status = e.target.value;
      uiState.activeChip = e.target.value;
      renderApplicationsGrid();
      renderStatusChips();
    });
    document.getElementById('filterWorkType').addEventListener('change', (e) => {
      uiState.workType = e.target.value;
      renderApplicationsGrid();
    });
    document.getElementById('sortBy').addEventListener('change', (e) => {
      uiState.sort = e.target.value;
      renderApplicationsGrid();
    });
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
      uiState.search = '';
      uiState.company = '';
      uiState.status = '';
      uiState.workType = '';
      uiState.sort = 'latest';
      uiState.activeChip = '';
      document.getElementById('globalSearch').value = '';
      renderApplicationsView();
    });

    document.getElementById('gridViewBtn').addEventListener('click', () => {
      uiState.layout = 'grid';
      document.getElementById('gridViewBtn').classList.add('is-active');
      document.getElementById('listViewBtn').classList.remove('is-active');
      renderApplicationsGrid();
    });
    document.getElementById('listViewBtn').addEventListener('click', () => {
      uiState.layout = 'list';
      document.getElementById('listViewBtn').classList.add('is-active');
      document.getElementById('gridViewBtn').classList.remove('is-active');
      renderApplicationsGrid();
    });

    document.getElementById('emptyAddBtn').addEventListener('click', () => openFormModal());
  }

  /* ===============================================================
     10. APPLICATION FORM MODAL (Add / Edit)
     =============================================================== */
  const formFields = [
    'companyName', 'jobTitle', 'location', 'workType', 'jobType',
    'salaryRange', 'status', 'applicationDate', 'interviewDate',
    'deadline', 'jobUrl', 'notes'
  ];

  function openModal(overlayId) {
    document.getElementById(overlayId).classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(overlayId) {
    document.getElementById(overlayId).classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function openFormModal(editId) {
    const form = document.getElementById('applicationForm');
    form.reset();
    document.getElementById('appId').value = '';

    if (editId) {
      const app = applications.find((a) => a.id === editId);
      if (!app) return;
      document.getElementById('formModalTitle').textContent = 'Edit Application';
      document.getElementById('appId').value = app.id;
      document.getElementById('companyName').value = app.company || '';
      document.getElementById('jobTitle').value = app.jobTitle || '';
      document.getElementById('location').value = app.location || '';
      document.getElementById('workType').value = app.workType || 'Remote';
      document.getElementById('jobType').value = app.jobType || 'Full-time';
      document.getElementById('salaryRange').value = app.salaryRange || '';
      document.getElementById('status').value = app.status || 'Applied';
      document.getElementById('applicationDate').value = app.applicationDate || '';
      document.getElementById('interviewDate').value = app.interviewDate || '';
      document.getElementById('deadline').value = app.deadline || '';
      document.getElementById('jobUrl').value = app.jobUrl || '';
      document.getElementById('notes').value = app.notes || '';
    } else {
      document.getElementById('formModalTitle').textContent = 'New Application';
      document.getElementById('applicationDate').value = todayISO();
      document.getElementById('status').value = 'Applied';
    }

    openModal('formModalOverlay');
    setTimeout(() => document.getElementById('companyName').focus(), 50);
  }

  function closeFormModal() {
    closeModal('formModalOverlay');
  }

  function handleFormSubmit(e) {
    e.preventDefault();

    const company = document.getElementById('companyName').value.trim();
    const jobTitle = document.getElementById('jobTitle').value.trim();
    if (!company || !jobTitle) return;

    const id = document.getElementById('appId').value;
    const now = new Date().toISOString();

    const data = {
      company,
      jobTitle,
      location: document.getElementById('location').value.trim(),
      workType: document.getElementById('workType').value,
      jobType: document.getElementById('jobType').value,
      salaryRange: document.getElementById('salaryRange').value.trim(),
      status: document.getElementById('status').value,
      applicationDate: document.getElementById('applicationDate').value,
      interviewDate: document.getElementById('interviewDate').value,
      deadline: document.getElementById('deadline').value,
      jobUrl: document.getElementById('jobUrl').value.trim(),
      notes: document.getElementById('notes').value.trim(),
      updatedAt: now
    };

    if (id) {
      const idx = applications.findIndex((a) => a.id === id);
      if (idx !== -1) {
        applications[idx] = { ...applications[idx], ...data };
        showToast('Application updated successfully', 'success');
      }
    } else {
      applications.unshift({ id: uid(), createdAt: now, ...data });
      showToast('Application added successfully', 'success');
    }

    saveApplications();
    closeFormModal();
    refreshAllViews();
  }

  function initFormModal() {
    document.getElementById('addApplicationBtn').addEventListener('click', () => openFormModal());
    document.getElementById('closeFormModal').addEventListener('click', closeFormModal);
    document.getElementById('cancelFormBtn').addEventListener('click', closeFormModal);
    document.getElementById('formModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'formModalOverlay') closeFormModal();
    });
    document.getElementById('applicationForm').addEventListener('submit', handleFormSubmit);
  }

  /* ===============================================================
     11. APPLICATION DETAILS MODAL
     =============================================================== */
  function openDetailsModal(id) {
    const app = applications.find((a) => a.id === id);
    if (!app) return;
    activeDetailsId = id;

    document.getElementById('detailsModalTitle').textContent = app.company;
    document.getElementById('detailsModalSubtitle').textContent = app.jobTitle;

    const rows = [
      { label: 'Status', icon: 'badge-check', value: `<span class="badge ${statusToClass(app.status)}">${app.status}</span>` },
      { label: 'Location', icon: 'map-pin', value: escapeHtml(app.location || 'Not specified') },
      { label: 'Work Type', icon: 'home', value: escapeHtml(app.workType || '—') },
      { label: 'Job Type', icon: 'briefcase', value: escapeHtml(app.jobType || '—') },
      { label: 'Salary Range', icon: 'wallet', value: escapeHtml(app.salaryRange || 'Not listed') },
      { label: 'Application Date', icon: 'calendar', value: formatDate(app.applicationDate) },
      { label: 'Interview Date', icon: 'users', value: formatDate(app.interviewDate) },
      { label: 'Deadline', icon: 'clock', value: formatDate(app.deadline) }
    ];

    let html = '<div class="details-grid">' + rows.map((r) => `
      <div class="detail-item">
        <span class="detail-item-label"><i data-lucide="${r.icon}"></i>${r.label}</span>
        <span class="detail-item-value">${r.value}</span>
      </div>
    `).join('') + '</div>';

    if (app.jobUrl) {
      html += `<a class="detail-link" href="${escapeHtml(app.jobUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i>View job posting</a>`;
    }

    html += `<div class="detail-notes">
      <div class="detail-notes-label">Personal Notes</div>
      ${app.notes ? escapeHtml(app.notes) : '<span style="color:var(--ink-faint)">No notes added yet.</span>'}
    </div>`;

    document.getElementById('detailsBody').innerHTML = html;
    refreshIcons();
    openModal('detailsModalOverlay');
  }

  function closeDetailsModal() {
    closeModal('detailsModalOverlay');
    activeDetailsId = null;
  }

  function initDetailsModal() {
    document.getElementById('closeDetailsModal').addEventListener('click', closeDetailsModal);
    document.getElementById('detailsModalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'detailsModalOverlay') closeDetailsModal();
    });
    document.getElementById('detailsEditBtn').addEventListener('click', () => {
      const id = activeDetailsId;
      closeDetailsModal();
      openFormModal(id);
    });
    document.getElementById('detailsDuplicateBtn').addEventListener('click', () => {
      duplicateApplication(activeDetailsId);
      closeDetailsModal();
    });
    document.getElementById('detailsDeleteBtn').addEventListener('click', () => {
      const id = activeDetailsId;
      closeDetailsModal();
      confirmDeleteApplication(id);
    });
  }

  /* ===============================================================
     12. CRUD OPERATIONS: DUPLICATE / DELETE
     =============================================================== */
  function duplicateApplication(id) {
    const app = applications.find((a) => a.id === id);
    if (!app) return;
    const now = new Date().toISOString();
    const copy = { ...app, id: uid(), company: app.company + ' (Copy)', createdAt: now, updatedAt: now, status: 'Wishlist' };
    applications.unshift(copy);
    saveApplications();
    refreshAllViews();
    showToast('Application duplicated', 'success');
  }

  function confirmDeleteApplication(id) {
    const app = applications.find((a) => a.id === id);
    if (!app) return;
    showConfirmDialog(
      'Delete this application?',
      `This will permanently remove "${app.jobTitle}" at ${app.company}. This action cannot be undone.`,
      () => {
        applications = applications.filter((a) => a.id !== id);
        saveApplications();
        refreshAllViews();
        showToast('Application deleted', 'danger');
      }
    );
  }

  /* ===============================================================
     13. GENERIC CONFIRM DIALOG
     =============================================================== */
  function showConfirmDialog(title, message, onConfirm) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    pendingConfirmAction = onConfirm;
    openModal('confirmOverlay');
  }

  function initConfirmDialog() {
    document.getElementById('confirmCancelBtn').addEventListener('click', () => {
      closeModal('confirmOverlay');
      pendingConfirmAction = null;
    });
    document.getElementById('confirmOkBtn').addEventListener('click', () => {
      if (typeof pendingConfirmAction === 'function') pendingConfirmAction();
      closeModal('confirmOverlay');
      pendingConfirmAction = null;
    });
    document.getElementById('confirmOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'confirmOverlay') {
        closeModal('confirmOverlay');
        pendingConfirmAction = null;
      }
    });
  }

  /* ===============================================================
     14. ESC KEY CLOSES ANY OPEN MODAL
     =============================================================== */
  function initEscKeyHandler() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      ['formModalOverlay', 'detailsModalOverlay', 'confirmOverlay'].forEach((id) => {
        const el = document.getElementById(id);
        if (el.classList.contains('is-open')) closeModal(id);
      });
      pendingConfirmAction = null;
    });
  }

  /* ===============================================================
     15. ANALYTICS VIEW
     =============================================================== */
  function getStatusColor(status) {
    const map = {
      'Wishlist': 'var(--status-wishlist)',
      'Applied': 'var(--status-applied)',
      'Under Review': 'var(--status-review)',
      'Assessment': 'var(--status-assessment)',
      'Interview Scheduled': 'var(--status-interview)',
      'Final Interview': 'var(--status-final)',
      'Offer Received': 'var(--status-offer)',
      'Accepted': 'var(--status-accepted)',
      'Rejected': 'var(--status-rejected)'
    };
    return map[status] || 'var(--maroon-500)';
  }

  function renderRateCards(stats) {
    const total = stats.total || 0;
    const interviewRate = total > 0 ? Math.round((stats.interviews / total) * 100) : 0;
    const rejectionRate = total > 0 ? Math.round((stats.rejected / total) * 100) : 0;
    const offerRate = total > 0 ? Math.round((stats.offers / total) * 100) : 0;

    const cards = [
      { label: 'Success Rate', value: stats.successRate },
      { label: 'Interview Rate', value: interviewRate },
      { label: 'Rejection Rate', value: rejectionRate },
      { label: 'Offer Rate', value: offerRate }
    ];

    document.getElementById('analyticsRateGrid').innerHTML = cards.map((c) => `
      <div class="rate-card">
        <div class="rate-card-label">${c.label}</div>
        <div class="rate-card-value">${c.value}%</div>
        <div class="progress-track"><div class="progress-fill" style="width:${c.value}%"></div></div>
      </div>
    `).join('');
  }

  function renderMonthlyChart() {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), count: 0 });
    }

    applications.forEach((app) => {
      if (!app.applicationDate) return;
      const d = new Date(app.applicationDate + 'T00:00:00');
      const match = months.find((m) => m.year === d.getFullYear() && m.month === d.getMonth());
      if (match) match.count++;
    });

    const max = Math.max(1, ...months.map((m) => m.count));

    document.getElementById('monthlyChart').innerHTML = months.map((m) => `
      <div class="bar-col">
        <span class="bar-col-value">${m.count}</span>
        <div class="bar-col-track">
          <div class="bar-col-fill" style="height:${(m.count / max) * 100}%"></div>
        </div>
        <span class="bar-col-label">${m.label}</span>
      </div>
    `).join('');
  }

  function renderDonutChart() {
    const counts = {};
    STATUS_LIST.forEach((s) => (counts[s] = 0));
    applications.forEach((a) => { if (counts[a.status] !== undefined) counts[a.status]++; });

    const total = applications.length;
    const svg = document.getElementById('donutChart');
    const legend = document.getElementById('donutLegend');

    if (total === 0) {
      svg.innerHTML = `<circle cx="60" cy="60" r="50" fill="none" stroke="var(--border-soft)" stroke-width="16" />`;
      legend.innerHTML = '<div class="empty-mini" style="padding:0">No data yet</div>';
      return;
    }

    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    let segments = '';
    let legendHtml = '';

    STATUS_LIST.forEach((status) => {
      const count = counts[status];
      if (count === 0) return;
      const fraction = count / total;
      const dash = fraction * circumference;
      const color = getStatusColor(status);

      segments += `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="16"
        stroke-dasharray="${dash} ${circumference - dash}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 60 60)" stroke-linecap="butt" />`;
      offset += dash;

      legendHtml += `
        <div class="donut-legend-item">
          <span class="donut-legend-dot" style="background:${color}"></span>
          <span>${status}</span>
          <span class="donut-legend-count">${count}</span>
        </div>
      `;
    });

    svg.innerHTML = `<circle cx="60" cy="60" r="${radius}" fill="none" stroke="var(--border-soft)" stroke-width="16" />` + segments;
    legend.innerHTML = legendHtml;
  }

  function renderFunnelChart() {
    const total = applications.length || 0;
    const stages = [
      { label: 'Applied', count: applications.filter((a) => APPLIED_STAGE_STATUSES.includes(a.status)).length },
      { label: 'Under Review', count: applications.filter((a) => ['Under Review', 'Assessment', 'Interview Scheduled', 'Final Interview', 'Offer Received', 'Accepted'].includes(a.status)).length },
      { label: 'Interviewing', count: applications.filter((a) => INTERVIEW_STATUSES.includes(a.status)).length },
      { label: 'Offers', count: applications.filter((a) => OFFER_STATUSES.includes(a.status)).length },
      { label: 'Accepted', count: applications.filter((a) => a.status === 'Accepted').length }
    ];
    const max = Math.max(1, total);

    document.getElementById('funnelChart').innerHTML = stages.map((s) => `
      <div class="funnel-row">
        <span class="funnel-label">${s.label}</span>
        <div class="funnel-track">
          <div class="funnel-fill" style="width:${Math.max((s.count / max) * 100, s.count > 0 ? 6 : 0)}%">
            ${s.count > 0 ? `<span>${s.count}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderAnalytics() {
    const stats = computeStats();
    renderRateCards(stats);
    renderMonthlyChart();
    renderDonutChart();
    renderFunnelChart();
  }

  /* ===============================================================
     16. CALENDAR VIEW
     =============================================================== */
  function getEventsForDate(dateObj) {
    const interviews = [];
    const deadlines = [];
    applications.forEach((app) => {
      if (app.interviewDate) {
        const d = new Date(app.interviewDate + 'T00:00:00');
        if (isSameDay(d, dateObj)) interviews.push(app);
      }
      if (app.deadline) {
        const d = new Date(app.deadline + 'T00:00:00');
        if (isSameDay(d, dateObj)) deadlines.push(app);
      }
    });
    return { interviews, deadlines };
  }

  function renderCalendarGrid() {
    const { year, month } = calState;
    document.getElementById('calendarMonthLabel').textContent =
      new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    const cells = [];

    // Leading muted days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push({ day: daysInPrevMonth - i, muted: true, dateObj: new Date(year, month - 1, daysInPrevMonth - i) });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, muted: false, dateObj: new Date(year, month, d) });
    }
    // Trailing days to complete the grid (multiple of 7)
    let trailing = 1;
    while (cells.length % 7 !== 0) {
      cells.push({ day: trailing, muted: true, dateObj: new Date(year, month + 1, trailing) });
      trailing++;
    }

    document.getElementById('calendarGrid').innerHTML = cells.map((cell) => {
      const { interviews, deadlines } = getEventsForDate(cell.dateObj);
      const isToday = isSameDay(cell.dateObj, today);
      let dots = '';
      if (interviews.length) dots += '<span class="cal-dot interview"></span>';
      if (deadlines.length) dots += '<span class="cal-dot deadline"></span>';

      return `
        <div class="cal-day${cell.muted ? ' is-muted' : ''}${isToday ? ' is-today' : ''}">
          <span class="cal-day-num">${cell.day}</span>
          <div class="cal-day-dot-row">${dots}</div>
        </div>
      `;
    }).join('');
  }

  function renderCalendarSideLists() {
    const upcomingInterviews = applications
      .filter((a) => a.interviewDate && daysBetween(a.interviewDate) >= 0)
      .sort((a, b) => new Date(a.interviewDate) - new Date(b.interviewDate))
      .slice(0, 6);

    const upcomingDeadlines = applications
      .filter((a) => a.deadline && daysBetween(a.deadline) >= 0 && !['Accepted', 'Rejected'].includes(a.status))
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 6);

    const interviewsEl = document.getElementById('calInterviews');
    interviewsEl.innerHTML = upcomingInterviews.length === 0
      ? '<div class="empty-mini">No interviews scheduled</div>'
      : upcomingInterviews.map((a) => `
        <div class="reminder-item" data-open-id="${a.id}" style="cursor:pointer">
          <span class="reminder-icon interview"><i data-lucide="users"></i></span>
          <div class="reminder-info">
            <div class="reminder-title">${escapeHtml(a.company)} — ${escapeHtml(a.jobTitle)}</div>
            <div class="reminder-sub">${a.workType || ''}</div>
          </div>
          <span class="reminder-date">${shortDate(a.interviewDate)}</span>
        </div>
      `).join('');

    const deadlinesEl = document.getElementById('calDeadlines');
    deadlinesEl.innerHTML = upcomingDeadlines.length === 0
      ? '<div class="empty-mini">No deadlines pending</div>'
      : upcomingDeadlines.map((a) => `
        <div class="reminder-item" data-open-id="${a.id}" style="cursor:pointer">
          <span class="reminder-icon deadline"><i data-lucide="clock"></i></span>
          <div class="reminder-info">
            <div class="reminder-title">${escapeHtml(a.company)} — ${escapeHtml(a.jobTitle)}</div>
            <div class="reminder-sub">${a.status}</div>
          </div>
          <span class="reminder-date">${shortDate(a.deadline)}</span>
        </div>
      `).join('');

    document.querySelectorAll('#calInterviews [data-open-id], #calDeadlines [data-open-id]').forEach((el) => {
      el.addEventListener('click', () => openDetailsModal(el.dataset.openId));
    });

    refreshIcons();
  }

  function renderCalendar() {
    renderCalendarGrid();
    renderCalendarSideLists();
  }

  function initCalendarControls() {
    document.getElementById('calPrev').addEventListener('click', () => {
      calState.month--;
      if (calState.month < 0) { calState.month = 11; calState.year--; }
      renderCalendarGrid();
    });
    document.getElementById('calNext').addEventListener('click', () => {
      calState.month++;
      if (calState.month > 11) { calState.month = 0; calState.year++; }
      renderCalendarGrid();
    });
    document.getElementById('calTodayBtn').addEventListener('click', () => {
      const now = new Date();
      calState.year = now.getFullYear();
      calState.month = now.getMonth();
      renderCalendarGrid();
    });
  }

  /* ===============================================================
     17. SETTINGS VIEW
     =============================================================== */
  function renderSettingsView() {
    document.getElementById('displayNameInput').value = settings.displayName;
    document.getElementById('dailyGoalInput').value = settings.dailyGoal;
    document.getElementById('weeklyGoalInput').value = settings.weeklyGoal;
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('settingsThemeToggle').setAttribute('aria-pressed', String(isDark));
  }

  function applyDisplayName() {
    const avatar = document.getElementById('userAvatar');
    avatar.textContent = initials(settings.displayName);
    avatar.title = settings.displayName;
  }

  function initSettingsView() {
    document.getElementById('saveNameBtn').addEventListener('click', () => {
      const val = document.getElementById('displayNameInput').value.trim();
      if (!val) return;
      settings.displayName = val;
      saveSettings();
      applyDisplayName();
      showToast('Display name updated', 'success');
    });

    document.getElementById('saveGoalsBtn').addEventListener('click', () => {
      const daily = parseInt(document.getElementById('dailyGoalInput').value, 10);
      const weekly = parseInt(document.getElementById('weeklyGoalInput').value, 10);
      settings.dailyGoal = daily > 0 ? daily : 1;
      settings.weeklyGoal = weekly > 0 ? weekly : 1;
      saveSettings();
      showToast('Goals updated', 'success');
    });

    document.getElementById('exportDataBtn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ applications, settings }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'careerflow-backup.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully', 'success');
    });

    document.getElementById('resetDataBtn').addEventListener('click', () => {
      showConfirmDialog(
        'Reset all data?',
        'This will permanently delete every application and restore default settings. This cannot be undone.',
        () => {
          applications = [];
          settings = { ...DEFAULT_SETTINGS };
          saveApplications();
          saveSettings();
          applyDisplayName();
          refreshAllViews();
          renderSettingsView();
          showToast('All data has been reset', 'danger');
        }
      );
    });
  }

  /* ===============================================================
     18. CROSS-VIEW REFRESH
     =============================================================== */
  function refreshAllViews() {
    // Re-render whichever view is currently visible, plus always-relevant chrome
    const visibleView = Array.from(document.querySelectorAll('[data-view-panel]'))
      .find((p) => !p.hidden);
    if (!visibleView) return;

    const viewName = visibleView.id.replace('view-', '');
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'applications') renderApplicationsView();
    if (viewName === 'analytics') renderAnalytics();
    if (viewName === 'calendar') renderCalendar();

    // Sidebar weekly progress should always stay current
    renderGoalsAndQuote();
  }

  /* ===============================================================
     19. SEED DATA (first-time experience)
     =============================================================== */
  function seedSampleData() {
    const now = new Date();
    const iso = (offsetDays) => {
      const d = new Date(now);
      d.setDate(d.getDate() + offsetDays);
      const tz = d.getTimezoneOffset() * 60000;
      return new Date(d - tz).toISOString().slice(0, 10);
    };

    const samples = [
      {
        company: 'Nimbus Technologies', jobTitle: 'Senior Product Designer', location: 'Lahore, Pakistan',
        workType: 'Hybrid', jobType: 'Full-time', salaryRange: 'PKR 250k – 320k', status: 'Interview Scheduled',
        applicationDate: iso(-12), interviewDate: iso(3), deadline: iso(10),
        notes: 'Referred by Bilal. Strong portfolio match — focus on systems thinking in interview.', jobUrl: ''
      },
      {
        company: 'Horizon Labs', jobTitle: 'Frontend Engineer', location: 'Remote',
        workType: 'Remote', jobType: 'Full-time', salaryRange: 'USD 60k – 75k', status: 'Under Review',
        applicationDate: iso(-7), interviewDate: '', deadline: iso(5),
        notes: 'Take-home assignment submitted. Awaiting review feedback.', jobUrl: ''
      },
      {
        company: 'Vertex Capital', jobTitle: 'Operations Analyst', location: 'Karachi, Pakistan',
        workType: 'On-site', jobType: 'Full-time', salaryRange: 'PKR 120k – 150k', status: 'Applied',
        applicationDate: iso(-3), interviewDate: '', deadline: iso(14),
        notes: '', jobUrl: ''
      },
      {
        company: 'Lumen Studio', jobTitle: 'UI/UX Designer', location: 'Islamabad, Pakistan',
        workType: 'Hybrid', jobType: 'Contract', salaryRange: 'PKR 90k – 110k', status: 'Offer Received',
        applicationDate: iso(-30), interviewDate: iso(-10), deadline: iso(2),
        notes: 'Offer received — negotiating start date and remote flexibility.', jobUrl: ''
      },
      {
        company: 'Atlas Robotics', jobTitle: 'Mechanical Engineer Intern', location: 'Remote',
        workType: 'Remote', jobType: 'Internship', salaryRange: 'Stipend based', status: 'Rejected',
        applicationDate: iso(-40), interviewDate: '', deadline: '',
        notes: 'Good experience for next cycle — revisit feedback before reapplying.', jobUrl: ''
      },
      {
        company: 'Bright Path Consulting', jobTitle: 'Business Analyst', location: 'Dubai, UAE',
        workType: 'On-site', jobType: 'Full-time', salaryRange: 'AED 12k – 15k / mo', status: 'Wishlist',
        applicationDate: '', interviewDate: '', deadline: iso(20),
        notes: 'Strong brand — tailor resume around client-facing analytics work before applying.', jobUrl: ''
      }
    ];

    applications = samples.map((s, idx) => ({
      id: uid(),
      createdAt: new Date(now.getTime() - idx * 86400000).toISOString(),
      updatedAt: new Date(now.getTime() - idx * 86400000).toISOString(),
      ...s
    }));
    saveApplications();
  }

  /* ===============================================================
     20. MISC UI WIRING
     =============================================================== */
  function initQuoteRefresh() {
    document.getElementById('refreshQuote').addEventListener('click', setRandomQuote);
  }

  /* ===============================================================
     21. BOOTSTRAP
     =============================================================== */
  function init() {
    loadTheme();
    loadApplications();
    loadSettings();

    // First-time visitors get a small set of realistic sample applications
    // so the dashboard, analytics, and calendar feel alive immediately.
    const hasVisited = localStorage.getItem('careerflow_seeded');
    if (!hasVisited && applications.length === 0) {
      seedSampleData();
      localStorage.setItem('careerflow_seeded', 'true');
    }

    applyDisplayName();
    setRandomQuote();

    initNavigation();
    initSidebarToggle();
    initThemeToggle();
    initApplicationsToolbar();
    initFormModal();
    initDetailsModal();
    initConfirmDialog();
    initEscKeyHandler();
    initCalendarControls();
    initSettingsView();
    initQuoteRefresh();

    refreshIcons();
    switchView('dashboard');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
