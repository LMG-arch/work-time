// stats.js — Monthly statistics view

function renderStats() {
  updateMonthLabel();
  const container = document.getElementById('stats-content');
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);

  let workDays = 0, restDays = 0, tripDays = 0, leaveDays = 0, annualDays = 0, sickDays = 0, personalDays = 0, holidayCount = 0, workdayCount = 0;
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
    else if (status === 'leave') leaveDays++;
    else if (status === 'annual') annualDays++;
    else if (status === 'sick') sickDays++;
    else if (status === 'personal') personalDays++;
    if (holiday && holiday.type === 'holiday') holidayCount++;
    if (holiday && holiday.type === 'workday') workdayCount++;

    for (const t of tags) { tagCounts[t] = (tagCounts[t] || 0) + 1; }

    if (status || note || tags.length > 0 || holiday) {
      dayRecords.push({ day, dateStr, status, note, tags, holiday });
    }
  }

  const totalRecorded = workDays + restDays + tripDays + leaveDays + annualDays + sickDays + personalDays;
  const noStatus = daysInMonth - totalRecorded;
  const workPct = daysInMonth ? Math.round(workDays / daysInMonth * 100) : 0;
  const restPct = daysInMonth ? Math.round(restDays / daysInMonth * 100) : 0;
  const tripPct = daysInMonth ? Math.round(tripDays / daysInMonth * 100) : 0;
  const leavePct = daysInMonth ? Math.round(leaveDays / daysInMonth * 100) : 0;
  const annualPct = daysInMonth ? Math.round(annualDays / daysInMonth * 100) : 0;
  const sickPct = daysInMonth ? Math.round(sickDays / daysInMonth * 100) : 0;
  const personalPct = daysInMonth ? Math.round(personalDays / daysInMonth * 100) : 0;

  let html = '';

  // Export button
  html += `<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
    <button id="export-stats-btn" class="settings-action-btn" style="font-size:11px;padding:4px 10px;">📊 导出统计图片</button>
  </div>`;

  // Summary cards
  html += `<div class="stats-cards">
    <div class="stat-card work"><div class="stat-num">${workDays}</div><div class="stat-label">上班</div></div>
    <div class="stat-card rest"><div class="stat-num">${restDays}</div><div class="stat-label">休息</div></div>
    <div class="stat-card trip"><div class="stat-num">${tripDays}</div><div class="stat-label">出差</div></div>
    ${leaveDays > 0 ? `<div class="stat-card leave"><div class="stat-num">${leaveDays}</div><div class="stat-label">请假</div></div>` : ''}
    ${annualDays > 0 ? `<div class="stat-card annual"><div class="stat-num">${annualDays}</div><div class="stat-label">年假</div></div>` : ''}
    ${sickDays > 0 ? `<div class="stat-card sick"><div class="stat-num">${sickDays}</div><div class="stat-label">病假</div></div>` : ''}
    ${personalDays > 0 ? `<div class="stat-card personal"><div class="stat-num">${personalDays}</div><div class="stat-label">事假</div></div>` : ''}
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
        ${leaveDays ? `<div class="ratio-seg leave" style="width:${leavePct}%">${leavePct}%</div>` : ''}
        ${annualDays ? `<div class="ratio-seg annual" style="width:${annualPct}%">${annualPct}%</div>` : ''}
        ${sickDays ? `<div class="ratio-seg sick" style="width:${sickPct}%">${sickPct}%</div>` : ''}
        ${personalDays ? `<div class="ratio-seg personal" style="width:${personalPct}%">${personalPct}%</div>` : ''}
      </div>
      <div class="ratio-legend">
        <span class="legend-item work">上班 ${workDays}天</span>
        <span class="legend-item rest">休息 ${restDays}天</span>
        <span class="legend-item trip">出差 ${tripDays}天</span>
        ${leaveDays ? `<span class="legend-item leave">请假 ${leaveDays}天</span>` : ''}
        ${annualDays ? `<span class="legend-item annual">年假 ${annualDays}天</span>` : ''}
        ${sickDays ? `<span class="legend-item sick">病假 ${sickDays}天</span>` : ''}
        ${personalDays ? `<span class="legend-item personal">事假 ${personalDays}天</span>` : ''}
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

  // 绑定导出按钮
  const exportBtn = document.getElementById('export-stats-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportStatsAsImage({ workDays, restDays, tripDays, leaveDays, annualDays, sickDays, personalDays, noStatus, sortedTags, dayRecords, holidayCount, workdayCount });
    });
  }
}

// 导出统计为图片
function exportStatsAsImage(stats) {
  const { workDays, restDays, tripDays, leaveDays, annualDays, sickDays, personalDays, noStatus, sortedTags, dayRecords, holidayCount, workdayCount } = stats;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const W = 400;
  const totalDays = workDays + restDays + tripDays + leaveDays + annualDays + sickDays + personalDays;
  const rowsNeeded = 7 + sortedTags.length + dayRecords.length + (holidayCount || workdayCount ? 2 : 0);
  const H = Math.max(600, rowsNeeded * 22 + 200);
  canvas.width = W; canvas.height = H;

  // Background
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(10, 10, W - 20, H - 20);

  let y = 40;
  ctx.fillStyle = '#333'; ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${currentYear}年${currentMonth + 1}月 统计报告`, W / 2, y);

  y += 30;
  ctx.textAlign = 'left'; ctx.font = '14px sans-serif';
  const stats = [
    { label: '上班', value: workDays, color: '#4CAF50' },
    { label: '休息', value: restDays, color: '#2196F3' },
    { label: '出差', value: tripDays, color: '#FF9800' },
  ];
  if (leaveDays) stats.push({ label: '请假', value: leaveDays, color: '#9C27B0' });
  if (annualDays) stats.push({ label: '年假', value: annualDays, color: '#00BCD4' });
  if (sickDays) stats.push({ label: '病假', value: sickDays, color: '#FF5722' });
  if (personalDays) stats.push({ label: '事假', value: personalDays, color: '#795548' });
  stats.push({ label: '未记录', value: noStatus, color: '#999' });

  const cardW = (W - 40) / Math.min(stats.length, 4);
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = 20 + col * cardW;
    const cy = y + row * 50;
    ctx.fillStyle = s.color; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(String(s.value), cx + cardW / 2 - 10, cy + 20);
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif';
    ctx.fillText(s.label, cx + cardW / 2 - 10, cy + 36);
  }

  y += Math.ceil(stats.length / 4) * 50 + 15;

  // Holiday info
  if (holidayCount || workdayCount) {
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('节假日信息', 20, y); y += 18;
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#666';
    if (holidayCount) ctx.fillText(`放假 ${holidayCount} 天`, 20, y);
    if (workdayCount) ctx.fillText(`调休上班 ${workdayCount} 天`, 120, y);
    y += 20;
  }

  // Tags
  if (sortedTags.length > 0) {
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('标签统计', 20, y); y += 18;
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#666';
    for (const [tag, count] of sortedTags) {
      ctx.fillText(`${tag}: ${count}次`, 20, y);
      y += 18;
    }
    y += 10;
  }

  // Day records
  if (dayRecords.length > 0) {
    ctx.fillStyle = '#333'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`逐日记录 (${dayRecords.length}天)`, 20, y); y += 18;
    ctx.font = '11px sans-serif';
    for (const r of dayRecords) {
      if (y > H - 30) break;
      const d = new Date(r.dateStr + 'T00:00:00');
      const weekday = WEEKDAYS_CN[d.getDay()];
      const statusText = STATUS_LABELS[r.status] || '未标记';
      ctx.fillStyle = '#333';
      ctx.fillText(`${r.day}日 周${weekday}`, 20, y);
      ctx.fillStyle = '#666';
      ctx.fillText(statusText + (r.tags.length > 0 ? ' | ' + r.tags.join(',') : '') + (r.note ? ' | ' + r.note : ''), 90, y);
      y += 18;
    }
  }

  // Watermark
  ctx.fillStyle = '#ccc'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('上班日历 · ' + new Date().toLocaleDateString('zh-CN'), W / 2, H - 15);

  // Download
  const link = document.createElement('a');
  link.download = `上班日历_${currentYear}年${currentMonth + 1}月统计.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('统计图片已导出');
}
