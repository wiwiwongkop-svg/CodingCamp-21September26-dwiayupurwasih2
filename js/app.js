/* ============================================================
   app.js — Expense & Budget Visualizer
   Author: dwiayupurwasih
   Features:
     - Add / delete transactions (income & expense)
     - LocalStorage persistence
     - Custom categories (add / delete)
     - Monthly summary view  [Optional Challenge]
     - Sort by date, amount, category  [Optional Challenge]
     - Highlight spending over set limit  [Optional Challenge]
     - Dark / light mode toggle  [Optional Challenge]
     - Pie chart: expenses by category (vanilla canvas)
     - Bar chart: monthly income vs expense (vanilla canvas)
   ============================================================ */

'use strict';

/* ── CONSTANTS ────────────────────────────────────────────── */
const LS_KEYS = {
  transactions: 'bv_transactions',
  categories:   'bv_categories',
  budget:       'bv_budget',
  theme:        'bv_theme',
};

const DEFAULT_CATEGORIES = [
  'Food & Drink', 'Transport', 'Housing', 'Health',
  'Entertainment', 'Shopping', 'Education', 'Salary',
  'Freelance', 'Other',
];

const CHART_COLORS = [
  '#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1',
  '#14b8a6','#e11d48','#0ea5e9','#d97706','#7c3aed',
];

const CATEGORY_ICONS = {
  'Food & Drink':  '🍜',
  'Transport':     '🚗',
  'Housing':       '🏠',
  'Health':        '💊',
  'Entertainment': '🎮',
  'Shopping':      '🛍️',
  'Education':     '📚',
  'Salary':        '💼',
  'Freelance':     '💻',
  'Other':         '📌',
};

/* ── STATE ────────────────────────────────────────────────── */
let transactions = [];
let categories   = [];
let budgetLimit  = null;
let pendingDeleteId = null;

/* ── DOM REFERENCES ───────────────────────────────────────── */
const $ = id => document.getElementById(id);

const dom = {
  // Summary
  totalIncome:    $('totalIncome'),
  totalExpense:   $('totalExpense'),
  balance:        $('balance'),
  budgetDisplay:  $('budgetDisplay'),
  budgetAlert:    $('budgetAlert'),

  // Form
  txForm:         $('transactionForm'),
  txDesc:         $('txDesc'),
  txAmount:       $('txAmount'),
  txType:         $('txType'),
  txCategory:     $('txCategory'),
  txDate:         $('txDate'),

  // Categories
  newCatInput:    $('newCategoryInput'),
  addCatBtn:      $('addCategoryBtn'),
  categoryList:   $('categoryList'),

  // Transactions list
  txList:         $('transactionList'),
  emptyState:     $('emptyState'),
  sortSelect:     $('sortSelect'),
  filterCategory: $('filterCategory'),

  // Charts
  categoryChart:       $('categoryChart'),
  categoryChartEmpty:  $('categoryChartEmpty'),
  monthlyChart:        $('monthlyChart'),
  monthlyChartEmpty:   $('monthlyChartEmpty'),
  monthFilter:         $('monthFilter'),

  // Monthly summary
  monthIncome:  $('monthIncome'),
  monthExpense: $('monthExpense'),
  monthNet:     $('monthNet'),

  // Budget modal
  openBudgetModal: $('openBudgetModal'),
  budgetModal:     $('budgetModal'),
  budgetInput:     $('budgetInput'),
  saveBudget:      $('saveBudget'),
  clearBudget:     $('clearBudget'),
  closeModal:      $('closeModal'),

  // Delete modal
  deleteModal:   $('deleteModal'),
  confirmDelete: $('confirmDelete'),
  cancelDelete:  $('cancelDelete'),

  // Theme
  toggleTheme: $('toggleTheme'),
};

/* ══════════════════════════════════════════════════════════
   LOCALSTORE HELPERS
══════════════════════════════════════════════════════════ */
function saveTransactions() {
  localStorage.setItem(LS_KEYS.transactions, JSON.stringify(transactions));
}

function saveCategories() {
  localStorage.setItem(LS_KEYS.categories, JSON.stringify(categories));
}

function saveBudget() {
  localStorage.setItem(LS_KEYS.budget, JSON.stringify(budgetLimit));
}

function loadFromStorage() {
  // Transactions
  const rawTx = localStorage.getItem(LS_KEYS.transactions);
  transactions = rawTx ? JSON.parse(rawTx) : [];

  // Categories
  const rawCats = localStorage.getItem(LS_KEYS.categories);
  categories = rawCats ? JSON.parse(rawCats) : [...DEFAULT_CATEGORIES];

  // Budget
  const rawBudget = localStorage.getItem(LS_KEYS.budget);
  budgetLimit = rawBudget !== null ? JSON.parse(rawBudget) : null;

  // Theme
  const savedTheme = localStorage.getItem(LS_KEYS.theme) || 'light';
  applyTheme(savedTheme);
}

/* ══════════════════════════════════════════════════════════
   THEME — Dark / Light toggle
══════════════════════════════════════════════════════════ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  dom.toggleTheme.textContent = theme === 'dark' ? '☀️' : '🌙';
  dom.toggleTheme.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  localStorage.setItem(LS_KEYS.theme, theme);
}

dom.toggleTheme.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Redraw charts so colours adapt
  drawCategoryChart();
  drawMonthlyChart();
});

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
function formatRp(amount) {
  return 'Rp ' + Math.abs(amount).toLocaleString('id-ID');
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getYearMonth(dateStr) {
  // dateStr = 'YYYY-MM-DD'
  return dateStr.slice(0, 7); // 'YYYY-MM'
}

function formatMonthLabel(ym) {
  // ym = 'YYYY-MM'
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

function getCategoryIcon(cat) {
  return CATEGORY_ICONS[cat] || '🏷️';
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

/* ══════════════════════════════════════════════════════════
   CATEGORIES
══════════════════════════════════════════════════════════ */
function renderCategories() {
  // Populate category select in transaction form
  dom.txCategory.innerHTML = '';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    dom.txCategory.appendChild(opt);
  });

  // Populate filter select
  const current = dom.filterCategory.value;
  dom.filterCategory.innerHTML = '<option value="all">All Categories</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    dom.filterCategory.appendChild(opt);
  });
  if (current && current !== 'all') dom.filterCategory.value = current;

  // Render category tags
  dom.categoryList.innerHTML = '';
  categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'category-tag';
    li.innerHTML = `
      <span>${getCategoryIcon(cat)} ${cat}</span>
      <button aria-label="Remove ${cat}" data-cat="${cat}">✕</button>
    `;
    li.querySelector('button').addEventListener('click', () => deleteCategory(cat));
    dom.categoryList.appendChild(li);
  });
}

function addCategory() {
  const name = dom.newCatInput.value.trim();
  if (!name) return;
  if (categories.map(c => c.toLowerCase()).includes(name.toLowerCase())) {
    alert('Category already exists.');
    return;
  }
  categories.push(name);
  saveCategories();
  renderCategories();
  dom.newCatInput.value = '';
}

function deleteCategory(cat) {
  const inUse = transactions.some(tx => tx.category === cat);
  if (inUse) {
    alert(`Cannot delete "${cat}" — it is used by existing transactions.`);
    return;
  }
  categories = categories.filter(c => c !== cat);
  saveCategories();
  renderCategories();
}

dom.addCatBtn.addEventListener('click', addCategory);
dom.newCatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addCategory(); }
});

/* ══════════════════════════════════════════════════════════
   TRANSACTION FORM
══════════════════════════════════════════════════════════ */
// Set today as default date
dom.txDate.value = getTodayString();

dom.txForm.addEventListener('submit', e => {
  e.preventDefault();

  const desc   = dom.txDesc.value.trim();
  const amount = parseFloat(dom.txAmount.value);
  const type   = dom.txType.value;
  const cat    = dom.txCategory.value;
  const date   = dom.txDate.value;

  // Validation
  if (!desc)            { shakeField(dom.txDesc);   return; }
  if (!amount || amount <= 0) { shakeField(dom.txAmount); return; }
  if (!date)            { shakeField(dom.txDate);   return; }

  const tx = {
    id:       generateId(),
    desc,
    amount,
    type,
    category: cat,
    date,
  };

  transactions.unshift(tx);
  saveTransactions();
  renderAll();

  // Reset form
  dom.txDesc.value   = '';
  dom.txAmount.value = '';
  dom.txDate.value   = getTodayString();
});

function shakeField(el) {
  el.style.borderColor = '#ef4444';
  el.focus();
  setTimeout(() => { el.style.borderColor = ''; }, 1500);
}

/* ══════════════════════════════════════════════════════════
   DELETE TRANSACTION
══════════════════════════════════════════════════════════ */
function openDeleteModal(id) {
  pendingDeleteId = id;
  dom.deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  pendingDeleteId = null;
  dom.deleteModal.classList.add('hidden');
}

dom.confirmDelete.addEventListener('click', () => {
  if (!pendingDeleteId) return;
  transactions = transactions.filter(tx => tx.id !== pendingDeleteId);
  saveTransactions();
  closeDeleteModal();
  renderAll();
});

dom.cancelDelete.addEventListener('click', closeDeleteModal);

dom.deleteModal.addEventListener('click', e => {
  if (e.target === dom.deleteModal) closeDeleteModal();
});

/* ══════════════════════════════════════════════════════════
   BUDGET MODAL
══════════════════════════════════════════════════════════ */
dom.openBudgetModal.addEventListener('click', () => {
  dom.budgetInput.value = budgetLimit !== null ? budgetLimit : '';
  dom.budgetModal.classList.remove('hidden');
  dom.budgetInput.focus();
});

dom.saveBudget.addEventListener('click', () => {
  const val = parseFloat(dom.budgetInput.value);
  if (!val || val <= 0) { shakeField(dom.budgetInput); return; }
  budgetLimit = val;
  saveBudget();
  dom.budgetModal.classList.add('hidden');
  renderAll();
});

dom.clearBudget.addEventListener('click', () => {
  budgetLimit = null;
  saveBudget();
  dom.budgetModal.classList.add('hidden');
  renderAll();
});

dom.closeModal.addEventListener('click', () => {
  dom.budgetModal.classList.add('hidden');
});

dom.budgetModal.addEventListener('click', e => {
  if (e.target === dom.budgetModal) dom.budgetModal.classList.add('hidden');
});

dom.budgetInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') dom.saveBudget.click();
});

/* ══════════════════════════════════════════════════════════
   SUMMARY CARDS
══════════════════════════════════════════════════════════ */
function renderSummary() {
  const totalIncome  = transactions
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalExpense = transactions
    .filter(tx => tx.type === 'expense')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const bal = totalIncome - totalExpense;

  dom.totalIncome.textContent  = formatRp(totalIncome);
  dom.totalExpense.textContent = formatRp(totalExpense);
  dom.balance.textContent      = formatRp(bal);

  // Colour balance red if negative
  dom.balance.style.color = bal < 0 ? 'var(--clr-expense)' : '';

  // Budget display & alert
  if (budgetLimit !== null) {
    dom.budgetDisplay.textContent = formatRp(budgetLimit);
    if (totalExpense > budgetLimit) {
      dom.budgetAlert.classList.remove('hidden');
    } else {
      dom.budgetAlert.classList.add('hidden');
    }
  } else {
    dom.budgetDisplay.textContent = 'Not Set';
    dom.budgetAlert.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════════
   MONTHLY SUMMARY VIEW
══════════════════════════════════════════════════════════ */
function buildMonthOptions() {
  // Collect all unique YYYY-MM values from transactions + current month
  const months = new Set();
  months.add(getTodayString().slice(0, 7));
  transactions.forEach(tx => months.add(getYearMonth(tx.date)));

  // Sort descending
  const sorted = [...months].sort((a, b) => b.localeCompare(a));

  const current = dom.monthFilter.value;
  dom.monthFilter.innerHTML = '';
  sorted.forEach(ym => {
    const opt = document.createElement('option');
    opt.value = ym;
    opt.textContent = formatMonthLabel(ym);
    dom.monthFilter.appendChild(opt);
  });

  // Restore or default to latest
  if (current && sorted.includes(current)) {
    dom.monthFilter.value = current;
  } else {
    dom.monthFilter.value = sorted[0];
  }
}

function renderMonthlySummary() {
  const ym = dom.monthFilter.value;
  if (!ym) return;

  const monthTx = transactions.filter(tx => getYearMonth(tx.date) === ym);

  const income  = monthTx.filter(tx => tx.type === 'income')
                          .reduce((s, tx) => s + tx.amount, 0);
  const expense = monthTx.filter(tx => tx.type === 'expense')
                          .reduce((s, tx) => s + tx.amount, 0);
  const net     = income - expense;

  dom.monthIncome.textContent  = formatRp(income);
  dom.monthExpense.textContent = formatRp(expense);
  dom.monthNet.textContent     = formatRp(net);
  dom.monthNet.style.color     = net < 0 ? 'var(--clr-expense)' : 'var(--clr-income)';
}

dom.monthFilter.addEventListener('change', () => {
  renderMonthlySummary();
  drawMonthlyChart();
});

/* ══════════════════════════════════════════════════════════
   TRANSACTION LIST — Render with sort & filter
══════════════════════════════════════════════════════════ */
function getSortedFiltered() {
  const sort   = dom.sortSelect.value;
  const filter = dom.filterCategory.value;

  let list = [...transactions];

  // Filter
  if (filter !== 'all') {
    list = list.filter(tx => tx.category === filter);
  }

  // Sort
  switch (sort) {
    case 'date-desc':
      list.sort((a, b) => b.date.localeCompare(a.date));
      break;
    case 'date-asc':
      list.sort((a, b) => a.date.localeCompare(b.date));
      break;
    case 'amount-desc':
      list.sort((a, b) => b.amount - a.amount);
      break;
    case 'amount-asc':
      list.sort((a, b) => a.amount - b.amount);
      break;
    case 'category-asc':
      list.sort((a, b) => a.category.localeCompare(b.category));
      break;
    default:
      break;
  }

  return list;
}

function renderTransactionList() {
  const list = getSortedFiltered();

  // Compute total expense so far for over-limit highlighting
  const totalExpense = transactions
    .filter(tx => tx.type === 'expense')
    .reduce((s, tx) => s + tx.amount, 0);

  dom.txList.innerHTML = '';

  if (list.length === 0) {
    dom.emptyState.classList.remove('hidden');
    dom.txList.appendChild(dom.emptyState);
    return;
  }

  dom.emptyState.classList.add('hidden');

  list.forEach(tx => {
    const isIncome  = tx.type === 'income';
    const overLimit = !isIncome && budgetLimit !== null && totalExpense > budgetLimit;

    const item = document.createElement('div');
    item.className = 'transaction-item' + (overLimit ? ' over-limit' : '');
    item.setAttribute('data-id', tx.id);

    item.innerHTML = `
      <div class="tx-icon tx-icon--${tx.type}">
        ${getCategoryIcon(tx.category)}
      </div>
      <div class="tx-info">
        <p class="tx-desc" title="${escapeHtml(tx.desc)}">${escapeHtml(tx.desc)}</p>
        <p class="tx-meta">${tx.category} · ${formatDate(tx.date)}</p>
      </div>
      <span class="tx-amount tx-amount--${tx.type}">
        ${isIncome ? '+' : '-'}${formatRp(tx.amount)}
      </span>
      <button class="tx-delete" aria-label="Delete transaction" title="Delete">🗑️</button>
    `;

    item.querySelector('.tx-delete').addEventListener('click', () => {
      openDeleteModal(tx.id);
    });

    dom.txList.appendChild(item);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('default', { day: 'numeric', month: 'short', year: 'numeric' });
}

dom.sortSelect.addEventListener('change', renderTransactionList);
dom.filterCategory.addEventListener('change', renderTransactionList);

/* ══════════════════════════════════════════════════════════
   CHART: EXPENSES BY CATEGORY (Pie / Donut — vanilla canvas)
══════════════════════════════════════════════════════════ */
function drawCategoryChart() {
  const canvas = dom.categoryChart;
  const ctx    = canvas.getContext('2d');

  // High-DPI scaling
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const size = Math.min(rect.width, 220);
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  // Aggregate expenses by category
  const expenseTx = transactions.filter(tx => tx.type === 'expense');
  const catMap    = {};
  expenseTx.forEach(tx => {
    catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
  });
  const entries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    dom.categoryChartEmpty.classList.remove('hidden');
    return;
  }
  dom.categoryChartEmpty.classList.add('hidden');

  const total  = entries.reduce((s, [, v]) => s + v, 0);
  const cx     = size / 2;
  const cy     = size / 2;
  const radius = size * 0.42;
  const inner  = radius * 0.58; // donut hole
  let   start  = -Math.PI / 2;

  // Draw slices
  entries.forEach(([cat, val], i) => {
    const slice = (val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    start += slice;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--bg-surface').trim() || '#fff';
  ctx.fill();

  // Centre label
  ctx.fillStyle = getComputedStyle(document.documentElement)
                    .getPropertyValue('--txt-primary').trim() || '#0f172a';
  ctx.font      = `bold ${Math.round(size * 0.09)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entries.length + ' cats', cx, cy);

  // Legend (below chart, drawn as text list)
  drawPieLegend(ctx, entries, total, size);
}

function drawPieLegend(ctx, entries, total, size) {
  const startY  = size * 0.92;
  // We draw the legend outside the canvas — use DOM instead for readability
  // (canvas legend would be clipped). The panel title + chart description suffices.
  // However we can add a small external legend list:
  let legend = document.getElementById('categoryLegend');
  if (!legend) {
    legend = document.createElement('ul');
    legend.id = 'categoryLegend';
    legend.style.cssText = [
      'list-style:none','margin-top:0.75rem','display:flex',
      'flex-wrap:wrap','gap:0.375rem 0.875rem','font-size:0.75rem',
      'color:var(--txt-secondary)',
    ].join(';');
    dom.categoryChart.parentElement.insertAdjacentElement('afterend', legend);
  }
  legend.innerHTML = entries.slice(0, 8).map(([cat, val], i) => `
    <li style="display:flex;align-items:center;gap:0.3rem;">
      <span style="width:10px;height:10px;border-radius:2px;background:${CHART_COLORS[i % CHART_COLORS.length]};flex-shrink:0;display:inline-block;"></span>
      ${escapeHtml(cat)} (${((val / total) * 100).toFixed(1)}%)
    </li>
  `).join('');
}

/* ══════════════════════════════════════════════════════════
   CHART: MONTHLY INCOME vs EXPENSE (Bar — vanilla canvas)
══════════════════════════════════════════════════════════ */
function drawMonthlyChart() {
  const canvas = dom.monthlyChart;
  const ctx    = canvas.getContext('2d');
  const ym     = dom.monthFilter.value;

  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W    = rect.width  || 320;
  const H    = 190;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (!ym) return;

  const monthTx = transactions.filter(tx => getYearMonth(tx.date) === ym);

  if (monthTx.length === 0) {
    dom.monthlyChartEmpty.classList.remove('hidden');
    return;
  }
  dom.monthlyChartEmpty.classList.add('hidden');

  // Aggregate by day-of-month
  const daysInMonth = new Date(
    Number(ym.slice(0, 4)),
    Number(ym.slice(5, 7)),
    0
  ).getDate();

  const incomeByDay  = new Array(daysInMonth).fill(0);
  const expenseByDay = new Array(daysInMonth).fill(0);

  monthTx.forEach(tx => {
    const day = parseInt(tx.date.slice(8, 10), 10) - 1;
    if (tx.type === 'income')  incomeByDay[day]  += tx.amount;
    else                       expenseByDay[day] += tx.amount;
  });

  const maxVal = Math.max(...incomeByDay, ...expenseByDay, 1);

  // Chart area
  const padL = 10, padR = 10, padT = 16, padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Only show days that have data (to avoid a crowded 31-bar chart)
  const activeDays = [];
  for (let i = 0; i < daysInMonth; i++) {
    if (incomeByDay[i] > 0 || expenseByDay[i] > 0) activeDays.push(i);
  }

  // Fallback: if no active days somehow
  if (activeDays.length === 0) {
    dom.monthlyChartEmpty.classList.remove('hidden');
    return;
  }

  const groupCount  = activeDays.length;
  const groupWidth  = chartW / groupCount;
  const barWidth    = Math.max(4, Math.min(groupWidth * 0.36, 28));
  const gap         = Math.min(barWidth * 0.4, 6);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDark ? '#94a3b8' : '#64748b';

  // Grid lines
  for (let g = 0; g <= 4; g++) {
    const y = padT + (chartH / 4) * g;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Bars
  activeDays.forEach((dayIdx, i) => {
    const incomeH  = (incomeByDay[dayIdx]  / maxVal) * chartH;
    const expenseH = (expenseByDay[dayIdx] / maxVal) * chartH;
    const cx       = padL + (i + 0.5) * groupWidth;

    // Income bar
    if (incomeByDay[dayIdx] > 0) {
      ctx.fillStyle = '#22c55e';
      roundRect(ctx,
        cx - gap / 2 - barWidth,
        padT + chartH - incomeH,
        barWidth, incomeH, 3
      );
    }

    // Expense bar
    if (expenseByDay[dayIdx] > 0) {
      ctx.fillStyle = '#ef4444';
      roundRect(ctx,
        cx + gap / 2,
        padT + chartH - expenseH,
        barWidth, expenseH, 3
      );
    }

    // Day label
    ctx.fillStyle    = labelColor;
    ctx.font         = `${Math.max(9, Math.min(11, groupWidth * 0.45))}px sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(dayIdx + 1, cx, padT + chartH + 4);
  });

  // Legend
  ctx.font         = '11px sans-serif';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#22c55e';
  ctx.fillRect(padL, 4, 10, 8);
  ctx.fillStyle = labelColor;
  ctx.textAlign = 'left';
  ctx.fillText('Income', padL + 13, 8);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(padL + 70, 4, 10, 8);
  ctx.fillStyle = labelColor;
  ctx.fillText('Expense', padL + 83, 8);
}

function roundRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/* ══════════════════════════════════════════════════════════
   RENDER ALL — Master render call
══════════════════════════════════════════════════════════ */
function renderAll() {
  renderCategories();
  renderSummary();
  buildMonthOptions();
  renderMonthlySummary();
  renderTransactionList();
  drawCategoryChart();
  drawMonthlyChart();
}

/* ══════════════════════════════════════════════════════════
   RESPONSIVE CHART REDRAW
══════════════════════════════════════════════════════════ */
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawCategoryChart();
    drawMonthlyChart();
  }, 150);
});

/* ══════════════════════════════════════════════════════════
   KEYBOARD ACCESSIBILITY — Close modals on Escape
══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    dom.budgetModal.classList.add('hidden');
    closeDeleteModal();
  }
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
function init() {
  loadFromStorage();
  renderAll();
}

init();
