/* ============================================================
   SUPABASE LAYER
   ============================================================ */

const SUPABASE_URL = 'https://weagikqpgyeaycttihnv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_YLMqyUhYzEDAhzsDcVA2vg_k11Ndx7e';
const CURRENCY  = ' Dh';   // single place for currency symbol (shown after amount, e.g. "5000 Dh")
const APP_PIN   = '0101';  // PIN required to enter the app (change here if needed)

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TABLE = 'transactions';

async function openDB() {
  return sb;
}

async function dbAdd(record) {
  const { data, error } = await sb.from(TABLE).insert(record).select().single();
  if (error) throw error;
  return data;
}

async function dbPut(record) {
  const { id, ...rest } = record;
  const { data, error } = await sb.from(TABLE).update(rest).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function dbDelete(id) {
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

async function dbGetAll() {
  const { data, error } = await sb.from(TABLE).select('*').order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ============================================================
   CATEGORIES & TRANSACTION TYPES (single place for all labels)
   ============================================================ */

const CATEGORIES = {
  income:  ['Salary', 'Freelance', 'Investment', 'Business', 'Gift', 'Other'],
  expense: ['Food & Dining', 'Transport', 'Entertainment', 'Bills & Utilities',
            'Healthcare', 'Shopping', 'Education', 'Housing', 'Other'],
};

const TRANSACTION_TYPES = {
  income:  { label: 'Income', chartLabel: 'Income', summaryLabel: 'Total Income' },
  expense: { label: 'Expense', chartLabel: 'Expenses', summaryLabel: 'Total Expenses' },
};
const BALANCE_LABEL = 'Balance';
const ALL_TYPES_LABEL = 'All Types';
const ALL_CATEGORIES_LABEL = 'All Categories';

const CAT_ICONS = {
  'Salary':            '💼',
  'Freelance':         '💻',
  'Investment':        '📈',
  'Business':          '🏢',
  'Gift':              '🎁',
  'Food & Dining':     '🍽️',
  'Transport':         '🚗',
  'Entertainment':     '🎬',
  'Bills & Utilities': '⚡',
  'Healthcare':        '🏥',
  'Shopping':          '🛍️',
  'Education':         '📚',
  'Housing':           '🏠',
  'Other':             '📌',
};

/* ============================================================
   APP STATE
   ============================================================ */

const state = {
  transactions: [],
  filters: { type: '', category: '', from: '', to: '' },
  editingId:    null,
  chart:        null,
};

/* ============================================================
   HELPERS
   ============================================================ */

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + CURRENCY;

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

function today() {
  return new Date().toISOString().split('T')[0];
}

/* ============================================================
   CATEGORY SELECT HELPERS
   ============================================================ */

function fillTypeSelect(selectId, includeAll = false) {
  const el = document.getElementById(selectId);
  const options = Object.entries(TRANSACTION_TYPES)
    .map(([value, { label }]) => `<option value="${value}">${label}</option>`)
    .join('');
  el.innerHTML = includeAll ? `<option value="">${ALL_TYPES_LABEL}</option>` + options : options;
}

/** Returns category list for a type (income/expense) or all unique categories when type is empty. */
function getCategoriesForType(type) {
  if (type === 'income' || type === 'expense') return CATEGORIES[type];
  return [...CATEGORIES.income, ...CATEGORIES.expense.filter((c) => !CATEGORIES.income.includes(c))];
}

function fillCategorySelect(type, selectId, selected = '') {
  const el   = document.getElementById(selectId);
  const cats = getCategoriesForType(type);
  el.innerHTML = cats
    .map((c) => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`)
    .join('');
}

function fillFilterCategorySelect() {
  const type = document.getElementById('filterType').value;
  const el   = document.getElementById('filterCategory');
  const cats = getCategoriesForType(type);
  const prev = el.value;
  el.innerHTML =
    `<option value="">${ALL_CATEGORIES_LABEL}</option>` +
    cats.map((c) => `<option value="${c}"${c === prev ? ' selected' : ''}>${c}</option>`).join('');
  if (!cats.includes(prev)) el.value = '';
}

/* ============================================================
   SUMMARY
   ============================================================ */


function updateSummary() {
  const sel         = document.getElementById('summaryMonth');
  const monthFilter = sel.value; // "2026-02" or ""

  const source = monthFilter
    ? state.transactions.filter((t) => t.date.startsWith(monthFilter))
    : state.transactions;

  const income   = source.filter((t) => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
  const expenses = source.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance  = income - expenses;

  document.getElementById('totalIncome').textContent   = fmt(income);
  document.getElementById('totalExpenses').textContent = fmt(expenses);

  const balEl = document.getElementById('balance');
  balEl.textContent = fmt(balance);
  balEl.className   = 'card-value ' + (balance >= 0 ? 'positive' : 'negative');

  /* show selected month label on the cards */
  const label  = monthFilter ? sel.options[sel.selectedIndex].text : '';
  const suffix = label ? ' · ' + label : '';
  document.querySelector('.income-card .card-label').textContent  = TRANSACTION_TYPES.income.summaryLabel  + suffix;
  document.querySelector('.expense-card .card-label').textContent = TRANSACTION_TYPES.expense.summaryLabel + suffix;
  document.querySelector('.balance-card .card-label').textContent = BALANCE_LABEL + suffix;
}

/* ============================================================
   CHART
   ============================================================ */

function populateYearSelect() {
  const el      = document.getElementById('chartYear');
  const curYear = new Date().getFullYear();
  const years   = [...new Set(state.transactions.map((t) => +t.date.slice(0, 4)))];
  if (!years.includes(curYear)) years.push(curYear);
  years.sort((a, b) => b - a);

  const prev = el.value ? +el.value : curYear;
  el.innerHTML = years
    .map((y) => `<option value="${y}"${y === prev ? ' selected' : ''}>${y}</option>`)
    .join('');
}

function getMonthlyData(year) {
  const months = Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));
  state.transactions.forEach((t) => {
    if (+t.date.slice(0, 4) === year) {
      const m = +t.date.slice(5, 7) - 1;
      months[m][t.type] += t.amount;
    }
  });
  return months;
}

function updateChart() {
  const year   = +(document.getElementById('chartYear').value) || new Date().getFullYear();
  const data   = getMonthlyData(year);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const incomeData  = data.map((m) => m.income);
  const expenseData = data.map((m) => m.expense);

  if (state.chart) {
    state.chart.data.datasets[0].data = incomeData;
    state.chart.data.datasets[1].data = expenseData;
    state.chart.update('none');
    return;
  }

  const ctx = document.getElementById('monthlyChart').getContext('2d');
  state.chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        {
          label: TRANSACTION_TYPES.income.chartLabel,
          data: incomeData,
          backgroundColor: 'rgba(0, 200, 150, 0.75)',
          borderColor: '#00C896',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: TRANSACTION_TYPES.expense.chartLabel,
          data: expenseData,
          backgroundColor: 'rgba(255, 107, 107, 0.75)',
          borderColor: '#FF6B6B',
          borderWidth: 1,
          borderRadius: 5,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, padding: 16, font: { size: 12, weight: '600' } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: {
            font: { size: 11 },
            callback: (v) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) + CURRENCY,
          },
        },
      },
    },
  });
}

/* ============================================================
   FILTERING
   ============================================================ */

function filtered() {
  const { type, category, from, to } = state.filters;
  return state.transactions.filter((t) => {
    if (type     && t.type     !== type)     return false;
    if (category && t.category !== category) return false;
    if (from     && t.date     <  from)      return false;
    if (to       && t.date     >  to)        return false;
    return true;
  });
}

/* ============================================================
   RENDER TRANSACTION LIST
   ============================================================ */

function renderList() {
  const list   = filtered().sort((a, b) => b.date.localeCompare(a.date));
  const el     = document.getElementById('transactionList');
  const countEl = document.getElementById('transactionCount');

  countEl.textContent = list.length + ' transaction' + (list.length !== 1 ? 's' : '');

  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No transactions found</p>
        <small>Add your first transaction using the form on the left</small>
      </div>`;
    return;
  }

  el.innerHTML = list.map((t) => `
    <div class="transaction-item ${t.type}" data-id="${t.id}">
      <div class="txn-icon">${CAT_ICONS[t.category] || '📌'}</div>
      <div class="txn-details">
        <div class="txn-top">
          <span class="txn-category">${escHtml(t.category)}</span>
          <span class="txn-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</span>
        </div>
        <div class="txn-bottom">
          <span class="txn-date">${fmtDate(t.date)}</span>
          ${t.description ? `<span class="txn-desc">${escHtml(t.description)}</span>` : ''}
          <span class="txn-badge ${t.type}">${TRANSACTION_TYPES[t.type].label}</span>
        </div>
      </div>
      <div class="txn-actions">
        <button class="btn-edit"   data-action="edit"   data-id="${t.id}" title="Edit">✏️</button>
        <button class="btn-delete" data-action="delete" data-id="${t.id}" title="Delete">🗑️</button>
      </div>
    </div>`).join('');
}

/* prevent XSS when rendering user text */
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ============================================================
   FORM — ADD / EDIT
   ============================================================ */

function resetForm() {
  document.getElementById('transactionForm').reset();
  document.getElementById('txnDate').value = today();
  fillCategorySelect('income', 'txnCategory');
  document.getElementById('formTitle').textContent  = 'Add Transaction';
  document.getElementById('submitBtn').textContent  = 'Add Transaction';
  document.getElementById('cancelEdit').classList.add('hidden');
  state.editingId = null;
}

function startEdit(id) {
  const t = state.transactions.find((x) => x.id === id);
  if (!t) return;

  state.editingId = id;
  document.getElementById('formTitle').textContent  = 'Edit Transaction';
  document.getElementById('submitBtn').textContent  = 'Update Transaction';
  document.getElementById('cancelEdit').classList.remove('hidden');

  document.getElementById('txnType').value   = t.type;
  fillCategorySelect(t.type, 'txnCategory', t.category);
  document.getElementById('txnAmount').value      = t.amount;
  document.getElementById('txnDate').value        = t.date;
  document.getElementById('txnDescription').value = t.description || '';

  document.querySelector('.form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSubmit(e) {
  e.preventDefault();

  const type   = document.getElementById('txnType').value;
  const amount = parseFloat(document.getElementById('txnAmount').value);
  const cat    = document.getElementById('txnCategory').value;
  const date   = document.getElementById('txnDate').value;
  const desc   = document.getElementById('txnDescription').value.trim();

  if (!type || !amount || amount <= 0 || !cat || !date) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const record = { type, amount, category: cat, date, description: desc };

  try {
    if (state.editingId) {
      record.id = state.editingId;
      await dbPut(record);
      const idx = state.transactions.findIndex((t) => t.id === state.editingId);
      if (idx !== -1) state.transactions[idx] = record;
      showToast('Transaction updated.', 'success');
    } else {
      const saved = await dbAdd(record);
      state.transactions.push(saved);
      showToast('Transaction added.', 'success');
    }

    resetForm();
    refresh();
  } catch (err) {
    showToast('Error saving transaction.', 'error');
    console.error(err);
  }
}

async function handleDelete(id) {
  if (!confirm('Delete this transaction? This cannot be undone.')) return;
  try {
    await dbDelete(id);
    state.transactions = state.transactions.filter((t) => t.id !== id);
    showToast('Transaction deleted.', 'success');
    refresh();
  } catch (err) {
    showToast('Error deleting transaction.', 'error');
    console.error(err);
  }
}

/* ============================================================
   REFRESH (re-render everything)
   ============================================================ */

function refresh() {
  updateSummary();
  populateYearSelect();
  updateChart();
  renderList();
}

/* ============================================================
   TOAST
   ============================================================ */

function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className   = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-fade');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2800);
}

/* ============================================================
   INIT
   ============================================================ */

async function init() {
  /* header date */
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  /* open IndexedDB */
  try {
    await openDB();
  } catch (err) {
    showToast('Could not open database.', 'error');
    console.error(err);
    return;
  }

  /* load all transactions */
  state.transactions = await dbGetAll();

  /* set default form date */
  document.getElementById('txnDate').value = today();
  fillTypeSelect('txnType', false);
  fillTypeSelect('filterType', true);
  fillCategorySelect('income', 'txnCategory');
  fillFilterCategorySelect();

  /* ---- event listeners ---- */

  /* type change → refresh categories */
  document.getElementById('txnType').addEventListener('change', (e) =>
    fillCategorySelect(e.target.value, 'txnCategory'));

  /* form submit */
  document.getElementById('transactionForm').addEventListener('submit', handleSubmit);

  /* cancel edit */
  document.getElementById('cancelEdit').addEventListener('click', resetForm);

  /* delegated click on transaction list (edit / delete) */
  document.getElementById('transactionList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'edit')   startEdit(id);
    if (action === 'delete') handleDelete(id);
  });

  /* filter type changes → refresh category dropdown */
  document.getElementById('filterType').addEventListener('change', fillFilterCategorySelect);

  /* apply filters */
  document.getElementById('applyFilter').addEventListener('click', () => {
    state.filters = {
      type:     document.getElementById('filterType').value,
      category: document.getElementById('filterCategory').value,
      from:     document.getElementById('filterFrom').value,
      to:       document.getElementById('filterTo').value,
    };
    renderList();
  });

  /* clear filters */
  document.getElementById('clearFilter').addEventListener('click', () => {
    document.getElementById('filterType').value     = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterFrom').value     = '';
    document.getElementById('filterTo').value       = '';
    fillFilterCategorySelect();
    state.filters = { type: '', category: '', from: '', to: '' };
    renderList();
  });

  /* chart year change */
  document.getElementById('chartYear').addEventListener('change', updateChart);

  /* initial render */
  refresh();
}

/* ============================================================
   PIN GATE — show app only after correct PIN
   ============================================================ */

const pinScreen  = document.getElementById('pinScreen');
const appContent = document.getElementById('appContent');
const pinForm    = document.getElementById('pinForm');
const pinInput   = document.getElementById('pinInput');
const pinError   = document.getElementById('pinError');

function showApp() {
  pinScreen.classList.add('hidden');
  appContent.classList.remove('hidden');
  pinError.textContent = '';
  pinInput.value = '';
}

function showPinError(msg) {
  pinError.textContent = msg;
  pinInput.value = '';
  pinInput.focus();
}

pinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = pinInput.value.trim();
  if (value === APP_PIN) {
    showApp();
    init();
  } else {
    showPinError('Wrong PIN. Try again.');
  }
});

pinInput.addEventListener('input', () => { pinError.textContent = ''; });
pinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pinForm.requestSubmit();
});

/* Only allow digits in PIN field */
pinInput.addEventListener('keypress', (e) => {
  if (!/^\d$/.test(e.key)) e.preventDefault();
});

/* Focus PIN input when screen is shown */
pinInput.focus();
