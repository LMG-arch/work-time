// todos.js — Todo CRUD, rendering, modal

let _editingTodoId = null; // null = add mode, non-null = edit mode

async function loadTodos() {
  allTodos = await window.calendarAPI.getTodos();
}

function getTodosForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  return allTodos.filter(t => {
    if (t.type === 'once') return t.date === dateStr;
    if (t.type === 'weekly') return (t.weekdays || []).includes(weekday);
    return false;
  });
}

function isTodoDone(todo, dateStr) {
  if (todo.type === 'once') return !!todo.done;
  return !!(todo.weeklyDone && todo.weeklyDone[dateStr]);
}

async function toggleTodoDone(todo, dateStr) {
  if (todo.type === 'once') {
    await window.calendarAPI.updateTodo(todo.id, { done: !todo.done });
    todo.done = !todo.done;
  } else {
    const wd = todo.weeklyDone || {};
    wd[dateStr] = !wd[dateStr];
    await window.calendarAPI.updateTodo(todo.id, { weeklyDone: wd });
    todo.weeklyDone = wd;
  }
}

function renderTodoList(dateStr) {
  const container = document.getElementById('todo-list');
  container.innerHTML = '';
  const todos = getTodosForDate(dateStr);
  if (todos.length === 0) {
    container.innerHTML = '<div class="todo-empty">暂无待办</div>';
    return;
  }
  for (const todo of todos) {
    const done = isTodoDone(todo, dateStr);
    const remindIcon = todo.remind ? ' ⏰' : '';
    const item = document.createElement('div');
    item.className = 'todo-item' + (done ? ' done' : '');
    item.innerHTML = `
      <span class="todo-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
      <span class="todo-text">${escapeHtml(todo.text)}${remindIcon}</span>
      <span class="todo-edit" data-id="${todo.id}" title="编辑">✎</span>
      <span class="todo-del" data-id="${todo.id}">&times;</span>
    `;
    container.appendChild(item);
  }
  container.querySelectorAll('.todo-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const todo = allTodos.find(t => t.id === btn.dataset.id);
      if (todo) {
        await toggleTodoDone(todo, dateStr);
        renderTodoList(dateStr);
        renderCalendar();
      }
    });
  });
  container.querySelectorAll('.todo-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.calendarAPI.deleteTodo(btn.dataset.id);
      allTodos = allTodos.filter(t => t.id !== btn.dataset.id);
      renderTodoList(dateStr);
      renderCalendar();
      showToast('已删除待办');
    });
  });
  container.querySelectorAll('.todo-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const todo = allTodos.find(t => t.id === btn.dataset.id);
      if (todo) openEditTodoModal(todo);
    });
  });
}

// --- Todo Modal ---

function initLunarSelects() {
  const monthSel = document.getElementById('todo-lunar-month');
  const daySel = document.getElementById('todo-lunar-day');
  monthSel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = Lunar.MonthCN[m - 1] + '月';
    monthSel.appendChild(opt);
  }
  updateLunarDays();
  monthSel.addEventListener('change', updateLunarDays);
}

function updateLunarDays() {
  const daySel = document.getElementById('todo-lunar-day');
  const month = parseInt(document.getElementById('todo-lunar-month').value);
  let maxDays = 30;
  daySel.innerHTML = '';
  for (let d = 1; d <= maxDays; d++) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = Lunar.dayCN(d);
    daySel.appendChild(opt);
  }
}

// 农历转公历：遍历当月每一天找到对应农历日期
function lunarToSolar(year, lunarMonth, lunarDay) {
  // 遍历全年找到匹配的农历日期
  for (let m = 0; m < 12; m++) {
    const dim = getDaysInMonth(year, m);
    for (let d = 1; d <= dim; d++) {
      const lunar = Lunar.solar2lunar(year, m, d);
      if (lunar.lunarMonth === lunarMonth && lunar.lunarDay === lunarDay && !lunar.isLeap) {
        return dateToStr(year, m, d);
      }
    }
  }
  return null;
}

function openTodoModal() {
  _editingTodoId = null;
  const modal = document.getElementById('todo-modal');
  document.getElementById('todo-modal-title').textContent = '添加待办';
  document.getElementById('todo-text-input').value = '';
  document.getElementById('todo-date-input').value = selectedDate || '';
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.type-btn[data-type="once"]').classList.add('active');
  document.getElementById('todo-once-row').style.display = '';
  document.getElementById('todo-weekly-row').style.display = 'none';
  document.getElementById('todo-lunar-row').style.display = 'none';
  document.querySelectorAll('.wd-btn').forEach(b => b.classList.remove('active'));
  // Reset calendar type to solar
  document.querySelectorAll('.calendar-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.calendar-type-btn[data-caltype="solar"]').classList.add('active');
  // Reset remind fields
  document.getElementById('todo-remind-select').value = '';
  document.getElementById('todo-remind-time').value = '09:00';
  document.getElementById('todo-remind-time').style.display = 'none';
  // Show lunar hint for selected date
  updateLunarHint();
  modal.style.display = 'flex';
}

function openEditTodoModal(todo) {
  _editingTodoId = todo.id;
  const modal = document.getElementById('todo-modal');
  document.getElementById('todo-modal-title').textContent = '编辑待办';
  document.getElementById('todo-text-input').value = todo.text || '';

  // Set type
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  const typeBtn = document.querySelector(`.type-btn[data-type="${todo.type}"]`);
  if (typeBtn) typeBtn.classList.add('active');
  document.getElementById('todo-once-row').style.display = todo.type === 'once' ? '' : 'none';
  document.getElementById('todo-weekly-row').style.display = todo.type === 'weekly' ? '' : 'none';
  document.getElementById('todo-lunar-row').style.display = 'none';

  // Set date for once type
  if (todo.type === 'once') {
    document.getElementById('todo-date-input').value = todo.date || '';
    // Set calendar type
    document.querySelectorAll('.calendar-type-btn').forEach(b => b.classList.remove('active'));
    if (todo.lunarMonth) {
      document.querySelector('.calendar-type-btn[data-caltype="lunar"]').classList.add('active');
      document.getElementById('todo-once-row').style.display = 'none';
      document.getElementById('todo-lunar-row').style.display = '';
      document.getElementById('todo-lunar-month').value = todo.lunarMonth;
      updateLunarDays();
      document.getElementById('todo-lunar-day').value = todo.lunarDay;
    } else {
      document.querySelector('.calendar-type-btn[data-caltype="solar"]').classList.add('active');
    }
    updateLunarHint();
  }

  // Set weekdays for weekly type
  document.querySelectorAll('.wd-btn').forEach(b => b.classList.remove('active'));
  if (todo.type === 'weekly' && todo.weekdays) {
    todo.weekdays.forEach(wd => {
      const btn = document.querySelector(`.wd-btn[data-wd="${wd}"]`);
      if (btn) btn.classList.add('active');
    });
  }

  // Set remind
  document.getElementById('todo-remind-select').value = todo.remind || '';
  document.getElementById('todo-remind-time').value = todo.remindTime || '09:00';
  document.getElementById('todo-remind-time').style.display = todo.remind ? '' : 'none';

  modal.style.display = 'flex';
}

function closeTodoModal() {
  document.getElementById('todo-modal').style.display = 'none';
}

function updateLunarHint() {
  const dateVal = document.getElementById('todo-date-input').value;
  const hint = document.getElementById('todo-date-lunar-hint');
  if (dateVal) {
    const parts = dateVal.split('-');
    const lunar = Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    hint.textContent = lunar.full;
  } else {
    hint.textContent = '';
  }
}

function setupTodoModal() {
  const modal = document.getElementById('todo-modal');
  const typeBtns = document.querySelectorAll('.type-btn');
  const wdBtns = document.querySelectorAll('.wd-btn');

  initLunarSelects();

  // Toggle remind time visibility based on selection
  const remindSelect = document.getElementById('todo-remind-select');
  const remindTimeRow = document.getElementById('todo-remind-time');
  remindSelect.addEventListener('change', () => {
    remindTimeRow.style.display = remindSelect.value ? '' : 'none';
  });

  typeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      typeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('todo-once-row').style.display = btn.dataset.type === 'once' ? '' : 'none';
      document.getElementById('todo-lunar-row').style.display = (btn.dataset.type === 'once' && document.querySelector('.calendar-type-btn[data-caltype="lunar"]').classList.contains('active')) ? '' : 'none';
      document.getElementById('todo-weekly-row').style.display = btn.dataset.type === 'weekly' ? '' : 'none';
    });
  });

  // Calendar type toggle (solar/lunar)
  document.querySelectorAll('.calendar-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.calendar-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isLunar = btn.dataset.caltype === 'lunar';
      document.getElementById('todo-once-row').style.display = isLunar ? 'none' : '';
      document.getElementById('todo-lunar-row').style.display = isLunar ? '' : 'none';
    });
  });

  // Update lunar hint when date changes
  document.getElementById('todo-date-input').addEventListener('change', updateLunarHint);

  wdBtns.forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  document.getElementById('todo-modal-cancel').addEventListener('click', closeTodoModal);

  document.getElementById('todo-modal-confirm').addEventListener('click', async () => {
    const text = document.getElementById('todo-text-input').value.trim();
    if (!text) { showToast('请输入待办内容'); return; }
    const type = document.querySelector('.type-btn.active').dataset.type;
    const updates = { text, type };
    if (type === 'once') {
      const isLunar = document.querySelector('.calendar-type-btn[data-caltype="lunar"]').classList.contains('active');
      if (isLunar) {
        const lunarMonth = parseInt(document.getElementById('todo-lunar-month').value);
        const lunarDay = parseInt(document.getElementById('todo-lunar-day').value);
        const dateVal = lunarToSolar(currentYear, lunarMonth, lunarDay);
        if (!dateVal) { showToast('找不到对应的公历日期'); return; }
        updates.date = dateVal;
        updates.lunarMonth = lunarMonth;
        updates.lunarDay = lunarDay;
      } else {
        const dateVal = document.getElementById('todo-date-input').value;
        if (!dateVal) { showToast('请选择日期'); return; }
        updates.date = dateVal;
        delete updates.lunarMonth;
        delete updates.lunarDay;
      }
      if (!_editingTodoId) updates.done = false;
    } else {
      const days = [];
      wdBtns.forEach(b => { if (b.classList.contains('active')) days.push(parseInt(b.dataset.wd)); });
      if (days.length === 0) { showToast('请选择重复星期'); return; }
      updates.weekdays = days;
      if (!_editingTodoId) updates.weeklyDone = {};
    }
    // Save remind settings
    const remindSelect = document.getElementById('todo-remind-select').value;
    const remindTime = document.getElementById('todo-remind-time').value;
    if (remindSelect) {
      updates.remind = remindSelect;
      updates.remindTime = remindTime;
      if (!_editingTodoId) updates.reminded = false;
    } else {
      updates.remind = '';
      updates.remindTime = '';
    }

    if (_editingTodoId) {
      // Edit mode: update existing todo
      const existing = allTodos.find(t => t.id === _editingTodoId);
      if (existing) {
        // Preserve done state and weeklyDone for edit
        if (type === 'weekly') {
          updates.weeklyDone = existing.weeklyDone || {};
        }
        await window.calendarAPI.updateTodo(_editingTodoId, updates);
        Object.assign(existing, updates);
        showToast('待办已更新');
      }
    } else {
      // Add mode: create new todo
      const saved = await window.calendarAPI.addTodo(updates);
      allTodos.push(saved);
      showToast('待办已添加');
    }
    closeTodoModal();
    if (selectedDate) renderTodoList(selectedDate);
    renderCalendar();
    scheduleTodoReminders();
  });
}

// --- Todo View ---

function renderTodoView() {
  updateMonthLabel();
  const container = document.getElementById('todo-view-content');
  if (allTodos.length === 0) {
    container.innerHTML = '<div class="empty-tip">暂无待办事项</div>';
    return;
  }

  const filters = [
    { key: 'all', label: '全部' },
    { key: 'undone', label: '未完成' },
    { key: 'done', label: '已完成' },
  ];
  let html = '<div class="todo-filter-bar">';
  for (const f of filters) {
    html += `<span class="todo-filter-tab${todoFilter === f.key ? ' active' : ''}" data-filter="${f.key}">${f.label}</span>`;
  }
  html += '</div>';

  html += '<div class="todo-view-list">';
  const onceTodos = allTodos.filter(t => t.type === 'once' && (todoFilter === 'all' || (todoFilter === 'done' ? !!t.done : !t.done)));
  const weeklyTodos = allTodos.filter(t => t.type === 'weekly');

  if (onceTodos.length > 0) {
    html += '<div class="todo-group-title">指定日期</div>';
    for (const todo of onceTodos.sort((a, b) => (a.date || '').localeCompare(b.date || ''))) {
      const done = !!todo.done;
      let dateDisplay = todo.date || '';
      if (todo.date) {
        const parts = todo.date.split('-');
        const lunar = Lunar.solar2lunar(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        dateDisplay = `${todo.date} ${lunar.full}`;
      }
      const remindLabel = todo.remind ? (todo.remind === 'same' ? ` ⏰${todo.remindTime}准时` : ` ⏰提前${todo.remind === '120' ? '2小时' : todo.remind === '1440' ? '1天' : todo.remind + '分钟'}`) : '';
      html += `<div class="todo-view-item${done ? ' done' : ''}" data-id="${todo.id}">
        <span class="todo-view-check" data-id="${todo.id}">${done ? '✓' : ''}</span>
        <div class="todo-view-info">
          <span class="todo-view-text">${escapeHtml(todo.text)}</span>
          <span class="todo-view-date">${dateDisplay}${remindLabel}</span>
        </div>
        <span class="todo-view-edit" data-id="${todo.id}" title="编辑">✎</span>
        <span class="todo-view-del" data-id="${todo.id}">&times;</span>
      </div>`;
    }
  }

  if (weeklyTodos.length > 0) {
    html += '<div class="todo-group-title">每周重复</div>';
    const wdNames = WEEKDAYS_CN;
    for (const todo of weeklyTodos) {
      const days = (todo.weekdays || []).map(d => '周' + wdNames[d]).join('、');
      const todayStr = getTodayStr();
      const todayDone = todo.weeklyDone && todo.weeklyDone[todayStr];
      const remindLabel = todo.remind ? (todo.remind === 'same' ? ` ⏰${todo.remindTime}准时` : ` ⏰提前${todo.remind === '120' ? '2小时' : todo.remind === '1440' ? '1天' : todo.remind + '分钟'}`) : '';
      html += `<div class="todo-view-item${todayDone ? ' done' : ''}" data-id="${todo.id}">
        <span class="todo-view-check" data-id="${todo.id}" data-type="weekly">${todayDone ? '✓' : ''}</span>
        <div class="todo-view-info">
          <span class="todo-view-text">${escapeHtml(todo.text)}${remindLabel}</span>
          <span class="todo-view-date">${days}</span>
        </div>
        <span class="todo-view-edit" data-id="${todo.id}" title="编辑">✎</span>
        <span class="todo-view-del" data-id="${todo.id}">&times;</span>
      </div>`;
    }
  }

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.todo-view-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const todo = allTodos.find(t => t.id === btn.dataset.id);
      if (!todo) return;
      if (todo.type === 'once') {
        await window.calendarAPI.updateTodo(todo.id, { done: !todo.done });
        todo.done = !todo.done;
      } else if (todo.type === 'weekly') {
        const todayStr = getTodayStr();
        const wd = todo.weeklyDone || {};
        wd[todayStr] = !wd[todayStr];
        await window.calendarAPI.updateTodo(todo.id, { weeklyDone: wd });
        todo.weeklyDone = wd;
      }
      renderTodoView();
      renderCalendar();
    });
  });

  container.querySelectorAll('.todo-view-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.calendarAPI.deleteTodo(btn.dataset.id);
      allTodos = allTodos.filter(t => t.id !== btn.dataset.id);
      renderTodoView();
      renderCalendar();
      showToast('已删除待办');
    });
  });

  container.querySelectorAll('.todo-view-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const todo = allTodos.find(t => t.id === btn.dataset.id);
      if (todo) openEditTodoModal(todo);
    });
  });

  container.querySelectorAll('.todo-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      todoFilter = tab.dataset.filter;
      renderTodoView();
    });
  });
}
