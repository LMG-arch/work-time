// stats.js — Monthly statistics view

// 导出统计为图片
export async function exportStatsAsImage(stats, viewYear, viewMonth) {
  const year = (viewYear != null) ? viewYear : (window.currentYear || new Date().getFullYear())
  const month = (viewMonth != null) ? viewMonth : (window.currentMonth || new Date().getMonth())
  const { workDays, restDays, tripDays, leaveDays, annualDays, sickDays, personalDays, noStatus, sortedTags, dayRecords, holidayCount, workdayCount } = stats;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // 动态分辨率：基于设备像素比，但限制在 2-4 之间避免低端设备渲染失败
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(2, Math.min(4, Math.ceil(dpr * 2)));
  const W = 480;
  const totalDays = workDays + restDays + tripDays + leaveDays + annualDays + sickDays + personalDays;
  const rowsNeeded = 7 + sortedTags.length + dayRecords.length + (holidayCount || workdayCount ? 2 : 0);
  const avgRowHeight = dayRecords.some(r => r.note && r.note.length > 20 || r.tags.length > 3) ? 30 : 22;
  const H = Math.max(600, rowsNeeded * avgRowHeight + 200);
  canvas.width = W * scale; canvas.height = H * scale;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#f5f5f5'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.fillRect(10, 10, W - 20, H - 20);

  let y = 40;
  ctx.fillStyle = '#333'; ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${year}年${month + 1}月 统计报告`, W / 2, y);

  y += 30;
  ctx.textAlign = 'left'; ctx.font = '14px sans-serif';
  const statCards = [
    { label: '上班', value: workDays, color: '#4CAF50' },
    { label: '休息', value: restDays, color: '#2196F3' },
    { label: '出差', value: tripDays, color: '#FF9800' },
  ];
  if (leaveDays) statCards.push({ label: '请假', value: leaveDays, color: '#9C27B0' });
  if (annualDays) statCards.push({ label: '年假', value: annualDays, color: '#00BCD4' });
  if (sickDays) statCards.push({ label: '病假', value: sickDays, color: '#FF5722' });
  if (personalDays) statCards.push({ label: '事假', value: personalDays, color: '#795548' });
  statCards.push({ label: '未记录', value: noStatus, color: '#999' });

  const cardW = (W - 40) / Math.min(statCards.length, 4);
  for (let i = 0; i < statCards.length; i++) {
    const s = statCards[i];
    const col = i % 4;
    const row = Math.floor(i / 4);
    const cx = 20 + col * cardW;
    const cy = y + row * 50;
    ctx.fillStyle = s.color; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(String(s.value), cx + cardW / 2 - 10, cy + 20);
    ctx.fillStyle = '#666'; ctx.font = '11px sans-serif';
    ctx.fillText(s.label, cx + cardW / 2 - 10, cy + 36);
  }

  y += Math.ceil(statCards.length / 4) * 50 + 15;

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
    for (let idx = 0; idx < dayRecords.length; idx++) {
      const r = dayRecords[idx];
      if (y > H - 30) {
        ctx.fillStyle = '#999';
        const remaining = dayRecords.length - idx;
        ctx.fillText(`... 还有 ${remaining} 条记录`, 20, y);
        break;
      }
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

  // Export image
  const fileName = `上班日历_${year}年${month + 1}月统计.png`;

  if (isCapacitorPlatform()) {
    // Android: share image (user can save to gallery)
    try {
      const { Filesystem, Share } = window.Capacitor.Plugins;

      // Convert canvas to blob
      const dataUrl = canvas.toDataURL('image/png');
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], fileName, { type: 'image/png' });

      if (Share) {
        await Share.share({
          title: '上班日历统计',
          text: `${year}年${month + 1}月考勤统计`,
          files: [file]
        });
      } else if (Filesystem) {
        // Fallback: save to app directory
        const base64Data = dataUrl.split(',')[1];
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: 'DOCUMENTS'
        });
        showToast('图片已保存，可从文件管理器查看');
      }
    } catch (e) {
      console.error('[Stats] Export error:', e);
      if (e.message && e.message.includes('canceled')) {
        // User canceled share, do nothing
      } else {
        showToast('导出失败，请截图保存');
      }
    }
  } else {
    // Web/Electron: download via link
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('统计图片已导出');
  }
}
