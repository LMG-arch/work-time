// stats.js — Monthly statistics view

function renderStats() {
  updateMonthLabel();
  const container = document.getElementById('stats-content');
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  let workDays = 0, restDays = 0, tripDays = 0, holidayCount = 0, workdayCount = 0;
  const dayRecords = [];
  const tagCounts = {};

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = dateToStr(currentYear, currentMonth, day);
    const d = allData[dateStr];
    const status = d ? d.status : null;
    const note = d ? (d.note || '') : '';
    const tags = d ? (d.tags || []) : [];
    const holiday = getHolidayInfo(dateStr);

    if (status === 'work') workDays++;
    else if (status === 'rest') restDays++;
    else if (status === 'trip') tripDays++;
    if (holiday && holiday.type === 'holiday') holidayCount++;
    if (holiday && holiday.type === 'workday') workdayCount++;

    for (const t of tags) { tagCounts[t] = (tagCounts[t] || 0) + 1; }

    if (status || note || tags.length > 0 || holiday) {
      dayRecords.push({ day, dateStr, status, note, tags, holiday });
    }
  }

  const totalRecorded = workDays + restDays + tripDays;
  const noStatus = daysInMonth - totalRecorded;
  const workPct = daysInMonth ? Math.round(workDays / daysInMonth * 100) : 0;
  const restPct = daysInMonth ? Math.round(restDays / daysInMonth * 100) : 0;
  const tripPct = daysInMonth ? Math.round(tripDays / daysInMonth * 100) : 0;

  let html = '';

  // Summary cards
  html += `<div class="stats-cards">
    <div class="stat-card work"><div class="stat-num">${workDays}</div><div class="stat-label">上班</div></div>
    <div class="stat-card rest"><div class="stat-num">${restDays}</div><div class="stat-label">休息</div></div>
    <div class="stat-card trip"><div class="stat-num">${tripDays}</div><div class="stat-label">出差</div></div>
    <div class="stat-card total"><div class="stat-num">${noStatus}</div><div class="stat-label">未记录</div></div>
  </div>`;

  // Holiday stats
  if (holidayCount > 0 || workdayCount > 0) {
    html += `<div class="ratio-section">
      <div class="theme-title">节假日信息</div>
      <div class="holiday-stats">
        ${holidayCount ? `<span class="hs-item holiday-day">放假 ${holidayCount} 天</span>` : ''}
        ${workdayCount ? `<span class="hs-item workday-day">调休上班 ${workdayCount} 天</span>` : ''}
      </div>
    </div>`;
  }

  // Ratio bar
  if (totalRecorded > 0) {
    html += `<div class="ratio-section">
      <div class="ratio-bar">
        ${workDays ? `<div class="ratio-seg work" style="width:${workPct}%">${workPct}%</div>` : ''}
        ${restDays ? `<div class="ratio-seg rest" style="width:${restPct}%">${restPct}%</div>` : ''}
        ${tripDays ? `<div class="ratio-seg trip" style="width:${tripPct}%">${tripPct}%</div>` : ''}
      </div>
      <div class="ratio-legend">
        <span class="legend-item work">上班 ${workDays}天</span>
        <span class="legend-item rest">休息 ${restDays}天</span>
        <span class="legend-item trip">出差 ${tripDays}天</span>
      </div>
    </div>`;
  }

  // Tag stats
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (sortedTags.length > 0) {
    html += `<div class="ratio-section">
      <div class="theme-title">标签统计</div>
      <div class="tag-stats-list">`;
    for (const [tag, count] of sortedTags) {
      html += `<div class="tag-stat-item"><span class="tag-chip static">${escapeHtml(tag)}</span><span class="tag-stat-count">${count}次</span></div>`;
    }
    html += '</div></div>';
  }

  // Day-by-day list
  if (dayRecords.length > 0) {
    html += `<div class="records-title">本月记录 (${dayRecords.length}天)</div>`;
    html += '<div class="records-list">';
    for (const r of dayRecords) {
      const d = new Date(r.dateStr + 'T00:00:00');
      const weekday = WEEKDAYS_CN[d.getDay()];
      const statusText = STATUS_LABELS[r.status] || '未标记';
      const statusClass = r.status || 'none';
      const holidayTag = r.holiday ? `<span class="record-holiday ${r.holiday.type}">${r.holiday.name}</span>` : '';
      html += `<div class="record-item">
        <div class="record-head">
          <span class="record-date">${r.day}日 周${weekday} ${holidayTag}</span>
          <span class="record-status ${statusClass}">${statusText}</span>
        </div>
        ${r.tags && r.tags.length > 0 ? `<div class="record-tags">${r.tags.map(t => `<span class="tag-chip static">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${r.note ? `<div class="record-note">${escapeHtml(r.note)}</div>` : ''}
      </div>`;
    }
    html += '</div>';
  } else {
    html += '<div class="empty-tip">本月暂无记录</div>';
  }

  container.innerHTML = html;
}
