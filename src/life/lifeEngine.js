/* lifeEngine.js — 生活工作台状态引擎（本地优先，window.__storage 耐用存储，可挂云端 SDK）*/
'use strict';
import * as XLSX from 'xlsx';

/* ================= Database SDK Integration ================= */
  var DB_MONEY = 'VnQXwpyhkgbQPgEE0t4Rct';
  var DB_HABIT = 'HeHNFNHcNejy6SOFCSaWkZ';
  var DB_PLAN = 'xhzEvQacAkiBzzUStjJ57x';
  var DB_FITNESS = 'adMAn2vpgAUrXSPKKMJYUb';
  var DB_SHOPPING = '8CRwXzpTYQPUGsSGvXLnIQ';
  var DB_MEDIA = 'd1tDLyWNKbyqIlHRjxahwz';
  var DATABASE_ID = 'VnQXwpyhkgbQPgEE0t4Rct'; // 主库（记账理财）
  var ONLINE = false, LOCAL_ONLY = false;
  try { if (window.__SMART_PAGE__ && window.__SMART_PAGE__.database) { var db = window.__SMART_PAGE__.database; ONLINE = true; } } catch(e) {}

  function goLocalOnly(reason){
    LOCAL_ONLY = true;
    console.warn("[database] " + reason);
    setSyncState('offline', LANG==='en' ? 'Offline' : '离线模式');
    showSyncBanner(LANG==='en' ? 'Cloud write failed. Your data is kept safely on this device. Click retry to resync.' : '云端保存失败，数据已安全保存在本机，不会丢失。点击重试，网络恢复后自动合并。');
  }

  function dbFetchAll(databaseId, cb){
    if (!ONLINE || LOCAL_ONLY) { if(cb) cb(null); return; }
    var all = [], cursor = null;
    function fetchPage(){
      db.query({ databaseId: databaseId, pageSize: 100, startCursor: cursor /* databaseId:'VnQXwpyhkgbQPgEE0t4Rct' */ }).then(function(result){
        all = all.concat(result.results || []);
        if (result.hasMore && result.nextCursor) { cursor = result.nextCursor; fetchPage(); }
        else { if(cb) cb(all); }
      }).catch(function(err){ if(cb) cb(null, (err && err.message) || '网络错误'); });
    }
    fetchPage();
  }

  function dbAdd(databaseId, props, cb){
    if (!ONLINE || LOCAL_ONLY) { if(cb) cb(null); return; }
    try {
      db.addRecord({ databaseId: databaseId, properties: props /* databaseId:'VnQXwpyhkgbQPgEE0t4Rct' */ }).then(function(result){
        if(cb) cb(result.id || null);
      }).catch(function(err){ goLocalOnly("写入失败"); if(cb) cb(null); });
    } catch(e){ goLocalOnly("写入异常"); if(cb) cb(null); }
  }

  function dbUpdate(databaseId, recordId, props){
    if (!ONLINE || LOCAL_ONLY) return;
    try {
      db.updateRecord({ databaseId: databaseId /* databaseId:'VnQXwpyhkgbQPgEE0t4Rct' */, recordId: recordId, properties: props }).catch(function(err){ goLocalOnly("更新失败"); });
    } catch(e){ goLocalOnly("更新异常"); }
  }

  function dbDelete(databaseId, recordId){
    if (!ONLINE || LOCAL_ONLY) return;
    try {
      db.deleteRecord({ databaseId: databaseId /* databaseId:'VnQXwpyhkgbQPgEE0t4Rct' */, recordId: recordId }).catch(function(err){ goLocalOnly("删除失败"); });
    } catch(e){ goLocalOnly("删除异常"); }
  }

  function setSyncState(mode, label){
    // 浮动同步标签（syncPill）已移除，此函数保留仅为兼容旧调用；状态提示由顶部 syncBanner 承担
    void mode; void label;
  }
  function showSyncBanner(msg){
    var b = document.getElementById('syncBanner');
    if(!b) return;
    var t = document.getElementById('syncBannerMsg');
    if(t && msg) t.textContent = msg;
    b.hidden = false;
  }
  function hideSyncBanner(){ var b = document.getElementById('syncBanner'); if(b) b.hidden = true; }
  function retrySync(){
    hideSyncBanner();
    setSyncState('syncing', LANG==='en' ? 'Syncing…' : '同步中…');
    LOCAL_ONLY = false;
    pullAllRemote(function(ok){
      if(!ok){
        setSyncState('offline', LANG==='en' ? 'Offline' : '离线模式');
        showSyncBanner(LANG==='en' ? 'Cannot reach the cloud. Data is kept safely on this device. Check your connection and retry.' : '暂时无法连接云端，数据已保存在本机。请检查网络后点击重试。');
      } else {
        setSyncState('online', LANG==='en' ? 'Synced' : '已同步');
        hideSyncBanner();
      }
    });
  }
  var _freshTimer = null;
  function subscribeUpdates(){
    if(!db || typeof db.onUpdated !== 'function') return;
    try{
      db.onUpdated(function(payload){
        var ids = (payload && payload.databaseIds) || [];
        var mine = [DB_MONEY, DB_HABIT, DB_PLAN, DB_FITNESS, DB_SHOPPING, DB_MEDIA];
        if(!ids.some(function(id){ return mine.indexOf(id) !== -1; })) return;
        if(_freshTimer) clearTimeout(_freshTimer);
        _freshTimer = setTimeout(function(){
          _freshTimer = null;
          if(ONLINE && !LOCAL_ONLY) pullAllRemote(function(){ saveState(); renderAll(); });
        }, 400);
      });
    }catch(e){}
  }

  function pullAllRemote(cb){
    // 修复（v3.17.26）：ONLINE 为 false 意味着云端 SDK 从未接入（window.__SMART_PAGE__
    // 无任何注入点），此时不存在「云端同步」概念——数据本来就只存本机。
    // 原先此处回调 cb(false)，retrySync 据此展示「云端同步失败」横幅且永无消失路径。
    // 现改为：静默返回，不显示失败横幅（横幅仅在有云端接入但读写失败时出现）。
    if (!ONLINE || LOCAL_ONLY) { setSyncState('online', LANG==='en' ? 'Saved locally' : '已保存到本机'); if(cb) cb(true); return; }
    setSyncState('syncing', LANG==='en' ? 'Syncing…' : '同步中…');
    var pending = 6, done = 0, changed = false, failed = 0, lastErr = '';
    function oneDone(c, fail, errMsg){
      done++; if(c) changed = true; if(fail){ failed++; if(errMsg) lastErr = errMsg; }
      if(done>=pending){
        if(failed>0){
          setSyncState('offline', LANG==='en' ? 'Offline' : '离线模式');
          // 给出明确错误原因，而非笼统的「部分云端数据读取失败」
          showSyncBanner(LANG==='en'
            ? ('Cloud sync failed: ' + (lastErr || 'some data could not be loaded') + '. Local copy is shown. Tap retry to resync.')
            : ('云端同步失败：' + (lastErr || '部分数据读取失败') + '。当前展示本机已有内容，点击重试。'));
        } else {
          setSyncState('online', LANG==='en' ? 'Synced' : '已同步');
          hideSyncBanner();
        }
        if(cb) cb(failed === 0);
      }
    }
    dbFetchAll(DB_MONEY, function(rows, err){ if(rows && rows.length){ mergeMoney(rows); oneDone(true,false); } else oneDone(false, !Array.isArray(rows), err); });
    dbFetchAll(DB_HABIT, function(rows, err){ if(rows && rows.length){ mergeHabit(rows); oneDone(true,false); } else oneDone(false, !Array.isArray(rows), err); });
    dbFetchAll(DB_PLAN, function(rows, err){ if(rows && rows.length){ mergePlan(rows); oneDone(true,false); } else oneDone(false, !Array.isArray(rows), err); });
    dbFetchAll(DB_FITNESS, function(rows, err){ if(rows && rows.length){ mergeFitness(rows); oneDone(true,false); } else oneDone(false, !Array.isArray(rows), err); });
    dbFetchAll(DB_SHOPPING, function(rows, err){ if(rows && rows.length){ mergeShopping(rows); oneDone(true,false); } else oneDone(false, !Array.isArray(rows), err); });
    dbFetchAll(DB_MEDIA, function(rows, err){ if(rows && rows.length){ mergeMedia(rows); oneDone(true,false); } else oneDone(false, !Array.isArray(rows), err); });
  }

  function mergeMoney(rows){
    if(!rows || !rows.length) return;
    var remoteRecords = rows.map(function(r){
      var d = r["日期"] ? String(r["日期"]).slice(0,10) : isoDate();
      var cat = r["分类"] || "其他";
      var amt = Number(r["金额"]) || 0;
      var note = r["备注"] || "";
      var isIncome = note.indexOf("收入：") === 0;
      return {id:(r._id||r.record_id||uid()),type:'money',date:d,createdAt:Date.now(),sample:false,remoteId:(r._id||r.record_id),data:{flow:isIncome?'income':'expense',amount:amt,category:cat,note:isIncome?note.slice(3):note}};
    });
    // 合并策略（v3.17.27 修复数据丢失）：
    // - 云端记录按 remoteId 匹配本地：有匹配则以云端为准（多端同步的最新值）；
    // - 云端有、本地无 remoteId 匹配 → 其他设备新增，加入；
    // - 本地无 remoteId（离线期间添加尚未上传）→ 无条件保留，绝不因云端覆盖而丢失。
    // 原实现 `filter + concat(remoteRecords)` 会把这些离线新账目整体抹掉。
    var byRemote = {};
    remoteRecords.forEach(function(r){ byRemote[r.remoteId] = r; });
    var localPending = state.records.filter(function(r){ return r.type==='money' && !r.remoteId; });
    var remoteIds = new Set(remoteRecords.map(function(r){ return r.remoteId; }).filter(Boolean));
    var localSynced = state.records.filter(function(r){
      return r.type==='money' && r.remoteId && !remoteIds.has(r.remoteId);
    });
    state.records = state.records.filter(function(r){ return r.type!=='money'; })
      .concat(localSynced)          // 云端已删除的本地记录，同步删除
      .concat(remoteRecords)        // 云端记录（含他端新增）
      .concat(localPending);        // 离线未上传的本地记录，保留并等待后续上传
    // 离线记录补推云端，避免它们因云端从未收到而长期滞留本地
    localPending.forEach(function(r){ pushMoney(r); });
  }

  function mergeHabit(rows){
    if(!rows) return;
    var remoteEntries = {};
    rows.forEach(function(r){
      var d = r["日期"] ? String(r["日期"]).slice(0,10) : isoDate();
      var hname = r["习惯"] || "";
      var val = Number(r["数值"]) || 0;
      if(!remoteEntries[hname]) remoteEntries[hname] = {};
      remoteEntries[hname][d] = val;
    });
    state.habits.forEach(function(h){
      var remote = remoteEntries[h.name];
      if(remote){
        h.entries = Object.assign({}, remote);
        h.sample = false;
      }
    });
  }

  function mergePlan(rows){
    if(!rows) return;
    var remoteRecords = rows.map(function(r){
      var d = r["日期"] ? String(r["日期"]).slice(0,10) : isoDate();
      var title = r["内容"] || "";
      var list = r["类型"] || "生活";
      var status = r["状态"] || "待完成";
      var pmap = {'高':'high','普通':'normal','低':'low'};
      var time = r["时间"] || "";
      var prio = pmap[r["优先级"]] || 'normal';
      var note = r["备注"] || "";
      return {id:(r._id||r.record_id||uid()),type:'planner',date:d,createdAt:Date.now(),sample:false,remoteId:(r._id||r.record_id),data:{title:title,list:list,done:(status==='已完成'),time:time,priority:prio,note:note}};
    });
    state.records = state.records.filter(function(r){return r.type!=='planner';}).concat(remoteRecords);
  }

  function mergeFitness(rows){
    if(!rows) return;
    var remoteRecords = rows.map(function(r){
      var d = r["日期"] ? String(r["日期"]).slice(0,10) : isoDate();
      return {id:(r._id||r.record_id||uid()),type:'fitness',date:d,createdAt:Date.now(),sample:false,remoteId:(r._id||r.record_id),data:{weight:Number(r["体重"])||0,bodyFat:r["体脂率"]?Number(r["体脂率"]):null,calories:Number(r["摄入"])||0,duration:Number(r["运动"])||0,note:r["备注"]||""}};
    });
    state.records = state.records.filter(function(r){return r.type!=='fitness';}).concat(remoteRecords);
  }

  function mergeShopping(rows){
    if(!rows) return;
    var remoteRecords = rows.map(function(r){
      return {id:(r._id||r.record_id||uid()),type:'home',date:isoDate(),createdAt:Date.now(),sample:false,remoteId:(r._id||r.record_id),data:{name:r["物品名称"]||"",quantity:String(r["数量"]||""),category:r["分类"]||"日用品",price:Number(r["预估价格"])||0,priority:r["优先级"]||"normal",note:r["备注"]||"",bought:(r["是否已买"]==="已买")}};
    });
    state.records = state.records.filter(function(r){return r.type!=='home';}).concat(remoteRecords);
  }

  function mergeMedia(rows){
    if(!rows) return;
    var typeMap = {'书籍':'书','电影':'电影','电视剧':'剧','动漫':'番'};
    var statusMap = {'想看':'想看','在看':'在看','看过':'看完'};
    state.mediaItems = rows.map(function(r){
      var type = typeMap[r["类型"]] || '电影';
      var status = statusMap[r["状态"]] || '想看';
      return {id:(r._id||r.record_id||uid()),name:r["标题"]||"",type:type,status:status,rating:Number(r["评分"])||0,review:r["短评"]||"",date:isoDate(),cover:r["封面"]||"",sample:false,remoteId:(r._id||r.record_id)};
    });
  }

  function pushMoney(rec){
    if (!ONLINE || LOCAL_ONLY) return;
    var props = {};
    props["日期"] = { date: rec.date };
    props["分类"] = { text: rec.data.category || "" };
    props["金额"] = { currency: rec.data.amount || 0 };
    props["备注"] = { text: (rec.data.flow==='income'?'收入：':'') + (rec.data.note||"") };
    dbAdd(DB_MONEY, props, function(rid){ if(rid) rec.remoteId = rid; });
  }

  function pushHabit(h, date){
    if (!ONLINE || LOCAL_ONLY) return;
    var props = {};
    props["日期"] = { date: date };
    props["习惯"] = { text: h.name || "" };
    props["数值"] = { number: Number(h.entries[date]||0) };
    props["备注"] = { text: h.unit || "" };
    dbAdd(DB_HABIT, props);
  }

  function pushPlan(rec){
    if (!ONLINE || LOCAL_ONLY) return;
    var props = {};
    props["日期"] = { date: rec.date };
    props["内容"] = { text: rec.data.title || "" };
    props["类型"] = { text: rec.data.list || "" };
    props["状态"] = { text: rec.data.done ? "已完成" : "待完成" };
    props["时间"] = { text: rec.data.time || "" };
    props["优先级"] = { text: ({high:'高',normal:'普通',low:'低'})[rec.data.priority] || "普通" };
    props["备注"] = { text: rec.data.note || "" };
    dbAdd(DB_PLAN, props, function(rid){ if(rid) rec.remoteId = rid; });
  }

  function pushFitness(rec){
    if (!ONLINE || LOCAL_ONLY) return;
    var props = {};
    props["日期"] = { date: rec.date };
    props["体重"] = { number: rec.data.weight || 0 };
    props["体脂率"] = { number: rec.data.bodyFat || 0 };
    props["摄入"] = { number: Number(rec.data.calories) || 0 };
    props["运动"] = { number: Number(rec.data.duration) || 0 };
    props["备注"] = { text: rec.data.note || "" };
    dbAdd(DB_FITNESS, props, function(rid){ if(rid) rec.remoteId = rid; });
  }

  function pushShopping(rec){
    if (!ONLINE || LOCAL_ONLY) return;
    var qty = parseInt(rec.data.quantity) || 0;
    var props = {};
    props["物品名称"] = { text: rec.data.name || "" };
    props["数量"] = { number: qty };
    props["预估价格"] = { currency: rec.data.price || 0 };
    props["是否已买"] = { select: rec.data.bought ? "已买" : "待买" };
    props["分类"] = { text: rec.data.category || "" };
    props["优先级"] = { text: rec.data.priority || "normal" };
    props["备注"] = { text: rec.data.note || "" };
    dbAdd(DB_SHOPPING, props, function(rid){ if(rid) rec.remoteId = rid; });
  }

  function pushMedia(item){
    if (!ONLINE || LOCAL_ONLY) return;
    var typeMap = {'书':'书籍','电影':'电影','剧':'电视剧','番':'动漫'};
    var statusMap = {'想看':'想看','在看':'在看','看完':'看过','弃了':'在看'};
    var props = {};
    props["标题"] = { text: item.name || "" };
    props["类型"] = { select: typeMap[item.type] || "电影" };
    props["状态"] = { select: statusMap[item.status] || "想看" };
    props["评分"] = { number: item.rating || 0 };
    props["短评"] = { text: item.review || "" };
    props["封面"] = { text: item.cover || "" };
    dbAdd(DB_MEDIA, props, function(rid){ if(rid) item.remoteId = rid; });
  }

  function updateRemoteMoney(rec){
    if (!ONLINE || LOCAL_ONLY || !rec.remoteId) return;
    var props = {};
    props["分类"] = { text: rec.data.category || "" };
    props["金额"] = { currency: rec.data.amount || 0 };
    props["备注"] = { text: (rec.data.flow==='income'?'收入：':'') + (rec.data.note||"") };
    dbUpdate(DB_MONEY, rec.remoteId, props);
  }
  function deleteRemoteMoney(rid){ if(rid) dbDelete(DB_MONEY, rid); }

  function updateRemotePlan(rec){
    if (!ONLINE || LOCAL_ONLY || !rec.remoteId) return;
    var props = {};
    props["状态"] = { text: rec.data.done ? "已完成" : "待完成" };
    props["时间"] = { text: rec.data.time || "" };
    props["优先级"] = { text: ({high:'高',normal:'普通',low:'低'})[rec.data.priority] || "普通" };
    props["备注"] = { text: rec.data.note || "" };
    dbUpdate(DB_PLAN, rec.remoteId, props);
  }
  function deleteRemotePlan(rid){ if(rid) dbDelete(DB_PLAN, rid); }

  function updateRemoteFitness(rec){
    if (!ONLINE || LOCAL_ONLY || !rec.remoteId) return;
    var props = {};
    props["体重"] = { number: rec.data.weight || 0 };
    props["体脂率"] = { number: rec.data.bodyFat || 0 };
    props["摄入"] = { number: Number(rec.data.calories) || 0 };
    props["运动"] = { number: Number(rec.data.duration) || 0 };
    props["备注"] = { text: rec.data.note || "" };
    dbUpdate(DB_FITNESS, rec.remoteId, props);
  }
  function deleteRemoteFitness(rid){ if(rid) dbDelete(DB_FITNESS, rid); }

  function updateRemoteShopping(rec){
    if (!ONLINE || LOCAL_ONLY || !rec.remoteId) return;
    var props = {};
    props["是否已买"] = { select: rec.data.bought ? "已买" : "待买" };
    props["分类"] = { text: rec.data.category || "" };
    props["优先级"] = { text: rec.data.priority || "normal" };
    dbUpdate(DB_SHOPPING, rec.remoteId, props);
  }
  function deleteRemoteShopping(rid){ if(rid) dbDelete(DB_SHOPPING, rid); }

  function updateRemoteMedia(item){
    if (!ONLINE || LOCAL_ONLY || !item.remoteId) return;
    var typeMap = {'书':'书籍','电影':'电影','剧':'电视剧','番':'动漫'};
    var statusMap = {'想看':'想看','在看':'在看','看完':'看过','弃了':'在看'};
    var props = {};
    props["状态"] = { select: statusMap[item.status] || "想看" };
    props["评分"] = { number: item.rating || 0 };
    props["短评"] = { text: item.review || "" };
    props["封面"] = { text: item.cover || "" };
    dbUpdate(DB_MEDIA, item.remoteId, props);
  }
  function deleteRemoteMedia(rid){ if(rid) dbDelete(DB_MEDIA, rid); }

  // 仅中文：移除英文切换，LANG 恒为 zh（EN_I18N / dynamicTranslators 等英文字典保留但永不启用）
  const LANG = 'zh';
  document.documentElement.lang = LANG;
  const EN_I18N = {
    "日常集 · 生活工作台":"Daily Atlas · Life Workbench","日常集——把财务、习惯、健康、日程与待买清单安放在一个地方。":"Daily Atlas brings your finances, habits, health, schedule, and shopping list into one calm place.",
    "日":"D","日常集":"Daily Atlas","生活工作台":"Life Workbench","生活有迹可循":"A life you can trace","自定义":"Customize","自定义工作台外观":"Customize workbench appearance","主导航":"Main navigation","手机导航":"Mobile navigation","语言 / Language":"Language",
    "今日总览":"Today","生活模块":"LIFE","记账理财":"Money","习惯健康":"Habits & Health","减脂健身":"Fitness","日程统筹":"Planner","待买清单":"Shopping List","书影音":"Media Log","数据":"DATA","时光档案":"Life Archive",
    "本机安全保存":"Saved safely on this device","每次修改立即保存；换设备前请导出备份。":"Every change is saved instantly. Export a backup before switching devices.","距备份提醒还有 20 条":"20 entries until the next backup reminder","今天，慢慢来":"Take today at your own pace","已自动保存":"Autosaved","保存失败":"Save failed","清空示例":"Clear samples","导入":"Import","导出备份":"Export backup",
    "数据暂时存不下了":"Your data could not be saved","请先导出备份，再清理浏览器空间。刚才的修改仍保留在当前页面。":"Export a backup first, then free up browser storage. Your latest changes are still available on this page.","发现本地数据损坏":"Corrupted local data found","已为你打开安全空白页，请导入之前的备份恢复。":"A safe blank workspace has been opened. Import a previous backup to restore your data.","导入备份":"Import backup","该给生活存个档了":"Time to archive your life","新增记录已达到 20 条，建议现在导出一份备份。":"You have added 20 entries. We recommend exporting a backup now.","立即导出":"Export now",
    "今日生活指数":"TODAY'S LIFE SCORE","三件要事，一点运动，留一笔清楚账。":"Three priorities, a little movement, and one clear entry.","快速开始":"QUICK START","记下一件小事":"Capture one small thing","输入时自动保存":"Saved as you type","记一笔":"Add transaction","支出或收入":"Expense or income","排日程":"Plan task","待办与提醒":"Tasks and reminders","记体重":"Log weight","减脂趋势":"Fitness trend","待买物品":"Shopping item","采购清单":"Shopping list",
    "本月支出":"Monthly spending","预算余量充足":"Plenty of budget left","今日习惯":"Today's habits","从一件小事开始":"Start with one small thing","今日待办":"Today's tasks","0 件":"0 tasks","节奏刚刚好":"A comfortable pace","今日节奏":"TODAY'S RHYTHM","待办清单":"Task list","查看全部":"View all","连续发生":"KEEP IT GOING","习惯打卡":"Habit check-in","管理":"Manage","生活脉络":"LIFE THREAD","最近记录":"Recent entries","进入档案":"Open archive","轻提醒":"GENTLE NOTE","规律不是把每天塞满，而是知道什么值得留下。":"Routine is not about filling every day. It is about knowing what is worth keeping.","根据你的记录生成":"Generated from your entries",
    "导出 Excel":"Export Excel","收支手账":"MONEY JOURNAL","记一笔账":"Add a transaction","草稿自动保存":"Draft autosaved","草稿已保存":"Draft saved","草稿保存失败":"Draft save failed","支出":"Expense","收入":"Income","金额":"Amount","分类":"Category","日期":"Date","备注":"Note","这笔钱花在了哪里":"What was this money for?","记下这笔":"Save transaction","本月收入":"Monthly income","本月剩余":"Monthly balance","月度对比":"MONTHLY COMPARISON","暂无对比":"No comparison yet","有了上月数据后，这里会显示变化":"Changes will appear once last month's data is available","月度预算":"MONTHLY BUDGET","花得明白，不必紧绷":"Spend with clarity, not pressure","预算 ¥":"Budget ¥","已使用 0%":"0% used","剩余 ¥0":"¥0 left","消费结构":"SPENDING BREAKDOWN","钱花在了哪里":"Where your money went","流水":"TRANSACTIONS","最近账目":"Recent transactions","全部分类":"All categories","消费结构饼图":"Spending breakdown pie chart","暂无支出":"No spending yet",
    "吃饭":"Dining","交通":"Transport","购物":"Shopping","娱乐":"Entertainment","房租":"Rent","看病":"Healthcare","学习":"Learning","其他":"Other","工资":"Salary","奖金":"Bonus","兼职":"Side income","理财":"Investments",
    "今天打卡":"TODAY'S CHECK-IN","完成一点，就算前进":"Every small completion counts","每次点击立即保存":"Every click saves instantly","新增习惯":"Add habit","今日完成":"Completed today","最佳连续":"Best streak","0 天":"0 days","近 30 天完成率":"30-day completion","30 天热力图":"30-DAY HEATMAP","坚持，是有形状的":"Consistency has a shape","手机可横向滑动":"Swipe horizontally on mobile","喝水":"Drink water","睡觉":"Sleep","运动":"Exercise","看书":"Read","冥想":"Meditate","杯":"cups","小时":"hours","次":"times","分钟":"minutes","页":"pages","目标":"Target","连续":"streak","已完成":"Completed","待完成":"To do","待打卡":"Not checked in","未完成":"Not completed","删除习惯":"Delete habit",
    "目标设置":"Goal settings","每日记录":"DAILY LOG","体重与体脂":"Weight & body fat","体重 kg":"Weight kg","体脂率 %":"Body fat %","摄入热量 kcal":"Calories kcal","运动分钟":"Exercise minutes","睡眠、饮食或身体感受":"Sleep, meals, or how your body feels","保存今日数据":"Save today's data","当前体重":"Current weight","距离目标":"To goal","10 斤":"5.0 kg","当前 BMI":"Current BMI","目标进度":"GOAL PROGRESS","稳稳向 55 kg 前进":"Moving steadily toward 55 kg","起点 60 kg":"Start 60 kg","目标 55 kg":"Goal 55 kg","体重趋势":"WEIGHT TREND","日波动与 7 天平均":"Daily changes and 7-day average","体重":"Weight","7 日平均":"7-day average","本周计划":"WEEKLY PLAN","运动与三餐安排":"Movement and meal plan","新增计划":"Add plan","身体日志":"BODY LOG","再记录一天，就能看到趋势":"Log one more day to see your trend","删除计划":"Delete plan",
    "力量训练 2 次":"2 strength sessions","每次 30–40 分钟":"30–40 minutes each","中低强度有氧 3 次":"3 low-to-moderate cardio sessions","快走、骑行或游泳":"Brisk walking, cycling, or swimming","每餐一掌心蛋白质":"One palm of protein per meal","鱼、蛋、瘦肉或豆制品":"Fish, eggs, lean meat, or tofu","午晚餐蔬菜占一半":"Fill half your lunch and dinner with vegetables","优先深色蔬菜":"Choose dark leafy vegetables first","主食不过度削减":"Do not cut carbs too aggressively","每餐约一拳头":"About one fist-sized serving per meal","睡够 7 小时":"Get 7 hours of sleep","恢复也是减脂计划":"Recovery is part of the plan","饮食":"Nutrition","恢复":"Recovery","无补充说明":"No additional notes","按自己的节奏完成":"Complete it at your own pace",
    "提醒事项":"REMINDERS","添加待办":"Add task","要做什么":"Task","写下一件具体的事":"Write down one specific task","时间":"Time","清单":"List","生活":"Life","工作":"Work","家庭":"Family","个人":"Personal","优先级":"Priority","普通":"Normal","高优先级":"High priority","低优先级":"Low priority","地点、准备事项或补充说明":"Location, preparation, or notes","到时间提醒我":"Remind me when it is due","加入日程":"Add to planner","今天":"Today","昨天":"Yesterday","已逾期":"Overdue","未来 7 天":"Next 7 days","一周日历":"WEEK CALENDAR","接下来七天":"The next seven days","智能清单":"SMART LIST","我的提醒事项":"My reminders","全部":"All","计划内":"Scheduled","全天":"All day","到时提醒":"Reminder on","留白":"Open","切换完成状态":"Toggle completion","删除":"Delete",
    "想买先记下":"SAVE IT FOR LATER","添加待买物品":"Add shopping item","物品名称":"Item name","例如：洗衣液、燕麦奶":"For example: detergent or oat milk","数量":"Quantity","2 盒":"2 cartons","食品":"Food","日用品":"Household","家居":"Home","数码":"Electronics","药品":"Medicine","预计单价 ¥":"Estimated unit price ¥","有空买":"When convenient","急需":"Urgent","等等再买":"Wait before buying","品牌、规格或购买渠道":"Brand, size, or where to buy","加入待买清单":"Add to shopping list","预计预算":"Estimated budget","本月买到":"Bought this month","需要的时候再买":"Buy it when you need it","待买":"To buy","已买":"Bought","数量未填":"No quantity","未分类":"Uncategorized","待定":"TBD","预计":"Estimate","燕麦奶":"Oat milk","无糖款":"Unsweetened","洗衣液":"Laundry detergent","1 瓶":"1 bottle","补充装":"Refill pack",
    "我的精神收藏":"MY MEDIA SHELF","记下一部作品":"Add a title","名字":"Title","电影、剧、书或番的名字":"Film, show, book, or anime title","类型":"Type","电影":"Film","剧":"Series","书":"Book","番":"Anime","状态":"Status","想看":"Want to watch","在看":"In progress","看完":"Finished","弃了":"Dropped","我的评分":"My rating","暂不评分":"Not rated yet","记录日期":"Log date","一句话短评":"One-line review","这一部为什么值得记住":"Why is this one worth remembering?","可选封面":"Optional cover","自动压缩保存，也可以只写名字":"Compressed and saved automatically; a title alone is fine","加入我的书影音":"Add to media log","今年看完":"Finished this year","0 部":"0 titles","平均评分":"Average rating","最爱类型":"Favorite type","年度统计":"YEAR IN REVIEW","，我的精神足迹":", my media journey","适合截图分享":"Ready to screenshot and share","书影音收藏":"Media collection","封面墙":"Cover wall","列表":"List","全部状态":"All statuses","全部评分":"All ratings","5 星":"5 stars","4 星以上":"4+ stars","3 星以上":"3+ stars","未评分":"Not rated","封面":" cover","宇宙探索编辑部":"Journey to the West","漫长的季节":"The Long Season","献给阿尔吉侬的花束":"Flowers for Algernon","葬送的芙莉莲":"Frieren: Beyond Journey's End","机器人之梦":"Robot Dreams","荒诞又真诚，浪漫得很具体。":"Absurd yet sincere, with a wonderfully tangible sense of romance.","往前看，别回头。":"Keep moving forward. Do not look back.","聪明与幸福之间，并没有简单答案。":"There is no simple answer between intelligence and happiness.","时间把告别变成了理解。":"Time turns farewell into understanding.",
    "所有日常，都有出处":"EVERY DAY LEAVES A TRACE","按日期折叠的生活记录":"A life log grouped by date","财务":"Money","健康":"Health","日程":"Planner","记账":"Money","习惯":"Habits","条记录":"entries","生活记录":"Life entry","一笔收支":"Transaction","一项日程":"Task","身体记录":"Body log",
    "习惯设置":"HABIT SETTINGS","新增自己的习惯":"Create your own habit","习惯名称":"Habit name","例如：早睡、拉伸、背单词":"For example: sleep early, stretch, or learn words","打卡方式":"Tracking method","完成 / 未完成":"Done / not done","计数累加":"Counter","填写数值":"Numeric value","主题色":"Theme color","鼠尾草绿":"Sage green","暮色紫":"Twilight plum","陶土橙":"Terracotta","燕麦色":"Oat","每日目标":"Daily target","单位":"Unit","次 / 分钟 / 页":"times / minutes / pages","当前习惯":"Current habits","删除后历史打卡也会一起移除":"Deleting a habit also removes its check-in history","取消":"Cancel","添加习惯":"Add habit","关闭":"Close",
    "周计划":"WEEKLY PLAN","添加运动或饮食计划":"Add an exercise or nutrition plan","类别":"Category","其他":"Other","计划名称":"Plan name","例如：慢跑 2 次":"For example: jog twice","补充说明":"Additional notes","频次、时长或具体做法":"Frequency, duration, or details","现有周计划":"Current weekly plan","可随时删除不再需要的项目":"Remove plans you no longer need at any time","添加计划":"Add plan",
    "减脂档案":"FITNESS PROFILE","身高 cm":"Height cm","目标 kg":"Goal kg","年龄":"Age","生理性别":"Sex","女":"Female","男":"Male","日常活动":"Daily activity","久坐":"Sedentary","轻度活动":"Lightly active","中度活动":"Moderately active","高强度活动":"Highly active","保存目标":"Save goal",
    "工作台外观":"WORKBENCH APPEARANCE","把它变成你的日常集":"Make this workbench yours","页面名称":"Page name","头像文字":"Avatar text","副标题":"Tagline","森林绿":"Forest green","陶土棕":"Clay brown","深海蓝":"Deep sea blue","恢复默认":"Restore defaults","保存外观":"Save appearance",
    "午饭":"Lunch","公交":"Bus","买衣服":"Clothes","电影票":"Movie ticket","整理本周生活清单":"Organize this week's life list","先处理最重要的三件事":"Start with the three most important things","预约牙科检查":"Book a dental checkup","带上医保卡":"Bring insurance card","周末采购":"Weekend shopping","按待买清单购买":"Shop from the list","状态平稳":"Feeling steady",
    "今天的节奏很好，也记得留一点空白。":"You found a good rhythm today. Remember to leave a little breathing room.","已经在稳稳推进，继续保持自己的节奏。":"You are making steady progress. Keep your own pace.","今天先从一件小事开始，慢慢来就好。":"Start with one small thing today. Take it slowly.","已超出本月预算":"Over this month's budget","今天全部完成":"Everything completed today","第一条记录，会从这里开始":"Your first entry will appear here","生活已经积攒了一些痕迹，趁现在为它存一份备份。":"Your life has gathered a few traces. This is a good time to save a backup.","你不是在追赶完美，而是在让好习惯慢慢变得自然。":"You are not chasing perfection; you are letting good habits become natural.","这个分类还没有流水":"No transactions in this category yet","今天还没记账":"No transaction logged today","有空时补一笔，让月度趋势保持完整。":"Add one when you have time to keep your monthly trend complete.","已新增 20 笔账目":"20 transactions added","建议现在导出一次备份。":"We recommend exporting a backup now.","先看消费结构，再决定哪些支出可以放慢一点。":"Review the spending breakdown, then decide what can wait.",
    "目标已达成，进入稳定期":"Goal reached. You are now in the maintenance phase.","多记录几天后估算达成时间":"Log a few more days to estimate your goal date","今天还没称重":"No weight logged today","尽量在相似时间、相似状态下记录，关注 7 天平均线。":"Log under similar conditions and focus on the 7-day average.","不用追赶，选一项适合今天状态的完成。":"No need to catch up. Choose one plan that fits how you feel today.","今天已记录，本周计划也完成了":"Today's data is logged and this week's plan is complete","做得很好，记得给身体留恢复时间。":"Well done. Remember to leave time for recovery.","还没有周计划，点击右上角新增一项":"No weekly plan yet. Add one from the top right.","记录体重和体脂，关注趋势而不是单日数字":"Log weight and body fat, and focus on the trend rather than a single day.","这个智能清单里暂时没有事项":"No items in this smart list yet","待买清单已经清空":"Your shopping list is clear","这里还没有物品":"No items here yet","这个筛选条件下还没有作品":"No titles match these filters","这个范围还没有记录":"No entries in this range","建议现在导出备份":"Export a backup now","还没有习惯":"No habits yet","还没有周计划":"No weekly plan yet",
    "存不下了，先导出备份":"Storage is full. Export a backup first.","已经攒到 20 笔，记得导出备份":"You have reached 20 transactions. Remember to export a backup.","已立即保存到本机":"Saved to this device instantly","记录已删除":"Entry deleted","备份格式不正确":"Invalid backup format","备份中有损坏的记录，请换一份备份重试":"The backup contains corrupted entries. Try another backup.","备份已导出，请妥善保存":"Backup exported. Keep it somewhere safe.","Excel 已导出":"Excel file exported","备份导入成功":"Backup imported successfully","导入失败，请检查备份文件":"Import failed. Check the backup file.","封面读取失败":"Could not read the cover image","封面格式不支持":"Unsupported cover image format","封面图片请控制在 12MB 以内":"Keep the cover image under 12 MB","封面已压缩，可以保存了":"Cover compressed and ready to save","已加入书影音清单":"Added to your media log","新习惯已加入":"New habit added","新计划已加入":"New plan added","目标设置已更新":"Goal settings updated","完成一项，心里轻一点":"One task done, one less thing on your mind","习惯已删除":"Habit deleted","计划已删除":"Plan deleted","买到了，已移入完成":"Bought and moved to completed","已从书影音清单移除":"Removed from your media log","已恢复默认外观":"Default appearance restored","月度预算已更新":"Monthly budget updated","示例内容已清空":"Sample content cleared","另一个页面的数据已同步":"Data from another tab has been synced","工作台外观已更新":"Workbench appearance updated","请输入有效金额":"Enter a valid amount","请记录今天的体重":"Log today's weight"
  };
  const I18N = {zh:Object.fromEntries(Object.keys(EN_I18N).map(key=>[key,key])),en:EN_I18N};
  const t = (key, vars={}) => String(I18N[LANG][key] ?? key).replace(/\{(\w+)\}/g,(_,name)=>vars[name] ?? '');
  const dynamicTranslators = [
    [/^距备份提醒还有 (\d+) 条$/,m=>`${m[1]} entries until the next backup reminder`],
    [/^(\d+) 月 (\d+) 日 · 星期([日一二三四五六])$/,m=>new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',weekday:'long'}).format(new Date(new Date().getFullYear(),Number(m[1])-1,Number(m[2])))],
    [/^(\d+) 月 (\d+) 日$/,m=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(new Date(new Date().getFullYear(),Number(m[1])-1,Number(m[2])))],
    [/^还可安排 (.+)$/,m=>`${m[1]} available`],[/^已经完成 (\d+) 件$/,m=>`${m[1]} completed`],[/^(\d+) 件$/,m=>`${m[1]} tasks`],
    [/^比上月(多|少)花了 (.+)$/,m=>`${m[1]==='多'?'Spent':'Saved'} ${m[2]} ${m[1]==='多'?'more':'versus last month'}`],[/^([↑↓]) (\d+)% · 上月 (.+)$/,m=>`${m[1]} ${m[2]}% · Last month ${m[3]}`],
    [/^已使用 (-?\d+)%$/,m=>`${m[1]}% used`],[/^剩余 (.+)$/,m=>`${m[1]} left`],[/^本月支出已超预算 (.+)$/,m=>`Monthly spending is ${m[1]} over budget`],
    [/^目标 (.+) (.+) · 连续 (\d+) 天$/,m=>`Target ${m[1]} ${translateText(m[2])} · ${m[3]}-day streak`],[/^(\d+) 天$/,m=>`${m[1]} days`],[/^(\d+)：(.+)$/,m=>`${m[1]}: ${translateText(m[2])}`],
    [/^起点 (.+) kg$/,m=>`Start ${m[1]} kg`],[/^目标 (.+) kg$/,m=>`Goal ${m[1]} kg`],[/^按当前趋势，约还需 (\d+) 天$/,m=>`About ${m[1]} days at the current trend`],
    [/^按 Mifflin–St Jeor 公式估算，当前每日消耗约 (\d+) kcal。记录饮食后可判断热量缺口。$/,m=>`Estimated daily expenditure is about ${m[1]} kcal using the Mifflin–St Jeor formula. Log meals to assess your calorie deficit.`],
    [/^当前估算每日热量缺口 (-?\d+) kcal，不在健康建议的 500–750 kcal 范围内，请调整饮食或运动。$/,m=>`Your estimated daily calorie deficit is ${m[1]} kcal, outside the recommended 500–750 kcal range. Adjust food intake or exercise.`],
    [/^当前估算每日热量缺口 (-?\d+) kcal，在建议的 500–750 kcal 范围内。$/,m=>`Your estimated daily calorie deficit is ${m[1]} kcal, within the recommended 500–750 kcal range.`],
    [/^本周计划还有 (\d+) 项$/,m=>`${m[1]} items remain in this week's plan`],[/^(\d+) \/ (\d+) 已完成$/,m=>`${m[1]} / ${m[2]} completed`],[/^(\d+) 项$/,m=>`${m[1]} items`],[/^(\d+) 件待完成$/,m=>`${m[1]} to do`],
    [/^(\d+) 部$/,m=>`${m[1]} titles`],[/^(\d+) 星$/,m=>`${m[1]} stars`],[/^(\d+) 条记录$/,m=>`${m[1]} entries`],[/^“(.+)”$/,m=>`“${translateText(m[1])}”`],
    [/^将导入 (\d+) 条记录，并替换当前数据。是否继续？$/,m=>`Import ${m[1]} entries and replace the current data?`],[/^将清空 (\d+) 条示例记录和示例打卡，你自己的内容会保留。是否继续？$/,m=>`Clear ${m[1]} sample entries and sample check-ins? Your own content will be kept.`],
    [/^确定删除“(.+)”吗？删除后无法撤回。$/,m=>`Delete “${translateText(m[1])}”? This cannot be undone.`],[/^确定删除习惯“(.+)”吗？历史打卡也会一起删除。$/,m=>`Delete the habit “${translateText(m[1])}” and all of its history?`],[/^确定删除计划“(.+)”吗？$/,m=>`Delete the plan “${translateText(m[1])}”?`],[/^确定从清单中删除“(.+)”吗？$/,m=>`Remove “${translateText(m[1])}” from the list?`],
    [/^(.+)，完成得漂亮$/,m=>`${translateText(m[1])} completed — nicely done`]
  ];
  function translateText(value){
    if(LANG!=='en') return String(value ?? '');
    const source=String(value ?? ''),trimmed=source.trim();
    if(!trimmed)return source;
    let translated=EN_I18N[trimmed];
    if(!translated){for(const [pattern,format] of dynamicTranslators){const match=trimmed.match(pattern);if(match){translated=format(match);break;}}}
    if(!translated&&trimmed.includes(' · ')){const parts=trimmed.split(' · '),mapped=parts.map(part=>EN_I18N[part]||part);if(mapped.some((part,index)=>part!==parts[index]))translated=mapped.join(' · ');}
    if(!translated)return source;
    return source.replace(trimmed,translated);
  }
  function localizeSubtree(root){
    if(LANG!=='en'||!root)return;
    const translateAttributes=element=>{
      if(!(element instanceof Element)||element.closest('[data-user-content]'))return;
      ['placeholder','title','aria-label','alt','data-title'].forEach(name=>{if(element.hasAttribute(name))element.setAttribute(name,translateText(element.getAttribute(name)));});
      if(element.tagName==='META'&&element.getAttribute('name')==='description')element.setAttribute('content',translateText(element.getAttribute('content')));
    };
    if(root.nodeType===Node.TEXT_NODE){const parent=root.parentElement;if(parent&&!parent.closest('script,style,[data-user-content]')){const translated=translateText(root.nodeValue);if(translated!==root.nodeValue)root.nodeValue=translated;}return;}
    if(!(root instanceof Element)&&root!==document)return;
    if(root instanceof Element)translateAttributes(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;while((node=walker.nextNode())){
      if(node.nodeType===Node.ELEMENT_NODE)translateAttributes(node);
      else if(!node.parentElement?.closest('script,style,[data-user-content]')){
        const option=node.parentElement?.closest('option');if(option&&!option.hasAttribute('value'))option.setAttribute('value',option.value);
        const translated=translateText(node.nodeValue);if(translated!==node.nodeValue)node.nodeValue=translated;
      }
    }
  }
  function startI18n(){
    // 仅中文：语言切换按钮已移除，不再绑定 data-lang 点击、不再启动英文 MutationObserver
    localizeSubtree(document);
  }
  const nativeConfirm=window.confirm.bind(window);window.confirm=message=>nativeConfirm(translateText(message));

  const STORAGE_KEY = 'richangji-state-v1';
  const EXPENSE_CATEGORIES = ['吃饭','交通','购物','娱乐','房租','看病','学习','其他'];
  const INCOME_CATEGORIES = ['工资','奖金','兼职','理财','其他'];
  // 账单 Excel 导入：表格「记账分类」→ 应用内分类映射（与导出表结构兼容，未匹配项归入“其他”）
  const IMPORT_CATEGORY_MAP_EXPENSE = {'早午晚餐':'吃饭','水果零食':'吃饭','餐饮':'吃饭','咖啡奶茶':'吃饭','交通':'交通','公交地铁':'交通','打车租车':'交通','购物':'购物','服装':'购物','娱乐':'娱乐','医疗':'看病','水电燃气':'房租','住房':'房租','教育':'学习','培训考试':'学习','快递':'其他','通讯':'其他','生活日用':'其他','美容':'其他','转账':'其他','消费':'其他','消费还款':'其他','花呗':'其他','其他':'其他'};
  const IMPORT_CATEGORY_MAP_INCOME = {'薪资':'工资','奖金':'奖金','收转账':'其他','红包':'其他','收红包':'其他','股票':'理财','理财':'理财','其他':'其他'};
  const CATEGORY_COLORS = ['#b65f42','#627a67','#7d5b75','#a57c45','#5f7188','#c58d69','#879a75','#8e8478'];
  // 分类 → 稳定颜色：饼图/图例/明细徽章共用，保证同一分类全页同色
  const categoryColor = function(cat){
    const list=[...EXPENSE_CATEGORIES,...INCOME_CATEGORIES];
    const idx=list.indexOf(cat);
    return CATEGORY_COLORS[idx>=0?idx:list.length] || '#8e8478';
  };
  const TYPE_META = {
    work:{label:'上班',icon:'i-clock',tone:'plum'},
    money:{label:'财务',icon:'i-wallet',tone:'terracotta'},fitness:{label:'健康',icon:'i-fitness',tone:'sage'},
    planner:{label:'日程',icon:'i-calendar',tone:'plum'},home:{label:'待买',icon:'i-cart',tone:'sand'}
  };
  // 上班日历状态 → 中文标签（上班数据来自 window.allData，经本地同步/服务器推送而来）
  const WORK_STATUS_LABELS = { work:'上班', rest:'休息', trip:'出差', leave:'请假', annual:'年假', sick:'病假', personal:'事假' };
  const HABIT_DEFS = [
    {key:'water',name:'喝水',nameEn:'Drink water',type:'counter',target:8,unit:'杯',unitEn:'cups',tone:'sage'},
    {key:'sleep',name:'睡觉',nameEn:'Sleep',type:'number',target:7,unit:'小时',unitEn:'hours',tone:'plum'},
    {key:'exercise',name:'运动',nameEn:'Exercise',type:'check',target:1,unit:'次',unitEn:'times',tone:'terracotta'},
    {key:'reading',name:'看书',nameEn:'Read',type:'check',target:1,unit:'次',unitEn:'times',tone:'sand'},
    {key:'meditation',name:'冥想',nameEn:'Meditate',type:'check',target:1,unit:'次',unitEn:'times',tone:'sage'}
  ];
  const resolveHabitName = def => (LANG==='en'&&def.nameEn)?def.nameEn:def.name;
  const resolveHabitUnit = def => (LANG==='en'&&def.unitEn)?def.unitEn:def.unit;
  const DEFAULT_PLAN = [
    {id:'move-1',group:'运动',title:'力量训练 2 次',titleEn:'Strength training ×2',note:'每次 30–40 分钟',noteEn:'30–40 min each',done:false},
    {id:'move-2',group:'运动',title:'中低强度有氧 3 次',titleEn:'Moderate cardio ×3',note:'快走、骑行或游泳',noteEn:'Walk / cycle / swim',done:false},
    {id:'meal-1',group:'饮食',title:'每餐一掌心蛋白质',titleEn:'Palm-size protein per meal',note:'鱼、蛋、瘦肉或豆制品',noteEn:'Fish, eggs, lean meat or tofu',done:false},
    {id:'meal-2',group:'饮食',title:'午晚餐蔬菜占一半',titleEn:'Veggies = half the plate',note:'优先深色蔬菜',noteEn:'Prefer dark greens',done:false},
    {id:'meal-3',group:'饮食',title:'主食不过度削减',titleEn:"Don't cut carbs too much",note:'每餐约一拳头',noteEn:'~one fist per meal',done:false},
    {id:'meal-4',group:'恢复',title:'睡够 7 小时',titleEn:'Sleep 7+ hours',note:'恢复也是减脂计划',noteEn:'Rest is part of fat loss',done:false}
  ];

  const isoDate = (date = new Date()) => {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0,10);
  };
  const shiftDate = (days, base = new Date()) => { const d = new Date(base); d.setDate(d.getDate()+days); return isoDate(d); };
  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const money = value => `¥${Number(value||0).toLocaleString(LANG==='en'?'en-US':'zh-CN',{maximumFractionDigits:2})}`;
  const escapeHtml = value => String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const userHtml = value => `<span data-user-content>${escapeHtml(value)}</span>`;
  const localizedHtml = value => escapeHtml(translateText(value));
  const icon = id => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const sum = (items, pick) => items.reduce((total,item)=>total+Number(pick(item)||0),0);
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

  function sampleFitness() {
    const weights = [61.2,61,60.9,60.7,60.8,60.5,60.4,60.3,60.2,60.1,60.2,60.1,60,60];
    return weights.map((weight,index)=>({id:uid(),type:'fitness',date:shiftDate(index-13),createdAt:Date.now()-100000+index,sample:true,data:{weight,bodyFat:Number((29.2-index*.07).toFixed(1)),calories:1650+(index%3)*60,duration:index%2?35:20,note:index===13?'状态平稳':''}}));
  }

  function makeInitialState() {
    const today=isoDate();
    const habits=HABIT_DEFS.map((def,index)=>{
      const entries={};
      for(let day=29;day>=0;day--){
        const date=shiftDate(-day);
        if((day+index)%5!==0){
          entries[date]=def.type==='counter'?6+(day%3):def.type==='number'?6.5+(day%3)*.5:1;
        }
      }
      if(def.key==='water') entries[today]=5;
      if(def.key==='sleep') entries[today]=7.5;
      if(def.key==='exercise') entries[today]=1;
      delete entries[today];
      return {...def,id:`habit-${def.key}`,entries,sample:true};
    });
    return {
      version:2,
      records:[
        {id:uid(),type:'money',date:today,createdAt:Date.now()-1000,sample:true,data:{flow:'expense',amount:32,category:'吃饭',note:'午饭'}},
        {id:uid(),type:'money',date:today,createdAt:Date.now()-2000,sample:true,data:{flow:'expense',amount:6,category:'交通',note:'公交'}},
        {id:uid(),type:'money',date:shiftDate(-2),createdAt:Date.now()-3000,sample:true,data:{flow:'income',amount:12000,category:'工资',note:'工资'}},
        {id:uid(),type:'money',date:shiftDate(-3),createdAt:Date.now()-4000,sample:true,data:{flow:'expense',amount:158,category:'购物',note:'买衣服'}},
        {id:uid(),type:'money',date:shiftDate(-4),createdAt:Date.now()-5000,sample:true,data:{flow:'expense',amount:45,category:'娱乐',note:'电影票'}},
        ...sampleFitness(),
        {id:uid(),type:'planner',date:today,createdAt:Date.now()-6000,sample:true,data:{title:'整理本周生活清单',titleEn:'Review weekly checklist',time:'10:30',priority:'high',list:'生活',note:'先处理最重要的三件事',remind:true,done:false}},
        {id:uid(),type:'planner',date:shiftDate(1),createdAt:Date.now()-7000,sample:true,data:{title:'预约牙科检查',titleEn:'Book dental checkup',time:'15:00',priority:'normal',list:'个人',note:'带上医保卡',remind:true,done:false}},
        {id:uid(),type:'planner',date:shiftDate(3),createdAt:Date.now()-8000,sample:true,data:{title:'周末采购',titleEn:'Weekend groceries',time:'11:00',priority:'low',list:'家庭',note:'按待买清单购买',remind:false,done:false}},
        {id:uid(),type:'home',date:today,createdAt:Date.now()-9000,sample:true,data:{name:'燕麦奶',quantity:'2 盒',category:'食品',price:18,priority:'high',note:'无糖款',bought:false}},
        {id:uid(),type:'home',date:shiftDate(-2),createdAt:Date.now()-10000,sample:true,data:{name:'洗衣液',quantity:'1 瓶',category:'日用品',price:39,priority:'normal',note:'补充装',bought:true,boughtDate:shiftDate(-1)}}
      ],
      habits,
      mediaItems:[
        {id:uid(),name:'宇宙探索编辑部',type:'电影',status:'看完',rating:5,review:'荒诞又真诚，浪漫得很具体。',date:today,cover:'',sample:true},
        {id:uid(),name:'漫长的季节',type:'剧',status:'看完',rating:5,review:'往前看，别回头。',date:shiftDate(-18),cover:'',sample:true},
        {id:uid(),name:'献给阿尔吉侬的花束',type:'书',status:'看完',rating:5,review:'聪明与幸福之间，并没有简单答案。',date:shiftDate(-35),cover:'',sample:true},
        {id:uid(),name:'葬送的芙莉莲',type:'番',status:'在看',rating:4,review:'时间把告别变成了理解。',date:shiftDate(-7),cover:'',sample:true},
        {id:uid(),name:'机器人之梦',type:'电影',status:'想看',rating:0,review:'',date:shiftDate(-2),cover:'',sample:true}
      ],
      drafts:{},
      settings:{budget:5000,recordsSinceExport:0,moneySinceExport:0,lastExportAt:null,archiveFilter:'all',moneyFilter:'all',plannerFilter:'all',shoppingFilter:'pending',mediaView:'wall',mediaStatusFilter:'all',mediaRatingFilter:0,hiddenHabitKeys:[],collapsedPanels:{},brand:{name:'日常集',avatar:'日',tagline:'生活有迹可循',theme:'plum'},fitnessProfile:{height:165,target:55,startWeight:60,age:30,sex:'female',activity:1.375},weeklyPlan:DEFAULT_PLAN.map(x=>({...x}))}
    };
  }

  function normalizeHabit(habit,index) {
    const def=HABIT_DEFS.find(item=>item.key===habit.key) || HABIT_DEFS[index] || {key:`custom-${index}`,name:habit.name||'习惯',type:'check',target:1,unit:'次',tone:habit.tone||'sage'};
    const entries={...(habit.entries||{})};
    (habit.completedDates||[]).forEach(date=>{entries[date]=1;});
    return {...def,...habit,id:habit.id||`habit-${def.key}`,entries};
  }

  function normalizeState(candidate) {
    if(!candidate||!Array.isArray(candidate.records)) throw new Error('备份格式不正确');
    const validTypes=new Set(Object.keys(TYPE_META));
    const validRecords=candidate.records.every(record=>record&&validTypes.has(record.type)&&/^\d{4}-\d{2}-\d{2}$/.test(record.date)&&record.data&&typeof record.data==='object');
    if(!validRecords) throw new Error('备份中有损坏的记录，请换一份备份重试');
    const defaults=makeInitialState();
    const existing=(Array.isArray(candidate.habits)?candidate.habits:[]).map(normalizeHabit);
    const hiddenHabitKeys=new Set(Array.isArray(candidate.settings?.hiddenHabitKeys)?candidate.settings.hiddenHabitKeys:[]);
    const defaultHabits=HABIT_DEFS.filter(def=>!hiddenHabitKeys.has(def.key)).map(def=>{
      const match=existing.find(h=>h.key===def.key || h.name===def.name || (def.key==='reading'&&h.name?.includes('阅读')) || (def.key==='water'&&h.name?.includes('水')));
      return match?{...def,...match,entries:match.entries||{}}:{...def,id:`habit-${def.key}`,entries:{},sample:false};
    });
    const defaultIds=new Set(defaultHabits.map(h=>h.id)),defaultKeys=new Set(HABIT_DEFS.map(h=>h.key));
    const customHabits=existing.filter(h=>!defaultIds.has(h.id)&&!defaultKeys.has(h.key)).map((h,index)=>({...h,key:h.key||`custom-${index}-${uid()}`,type:['check','counter','number'].includes(h.type)?h.type:'check',target:Number(h.target||1),unit:h.unit||'次',entries:h.entries||{},sample:Boolean(h.sample)}));
    const habits=[...defaultHabits,...customHabits];
    const shouldRefreshSamples=Number(candidate.version||1)<2&&candidate.records.some(record=>record.sample);
    const sourceRecords=shouldRefreshSamples
      ? [...candidate.records.filter(record=>!record.sample),...defaults.records.filter(record=>record.sample)]
      : candidate.records;
    const records=sourceRecords.map(record=>{
      const data={...(record.data||{})};
      if(record.type==='money'){
        const map={餐饮:'吃饭',居住:'房租',健康:'看病'};
        data.category=map[data.category]||data.category||'其他';
      }
      if(record.type==='home'){
        data.category=data.category||data.location||'其他'; data.price=Number(data.price||0); data.bought=Boolean(data.bought);
      }
      if(record.type==='planner'){data.list=data.list||'生活';data.note=data.note||'';data.remind=Boolean(data.remind);}
      return {...record,id:record.id||uid(),data};
    });
    const mediaItems=(Array.isArray(candidate.mediaItems)?candidate.mediaItems:defaults.mediaItems).filter(item=>item&&item.name).map(item=>({id:item.id||uid(),name:String(item.name),type:['电影','剧','书','番'].includes(item.type)?item.type:'电影',status:['想看','在看','看完','弃了'].includes(item.status)?item.status:'想看',rating:clamp(Number(item.rating||0),0,5),review:String(item.review||''),date:/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')?item.date:isoDate(),cover:typeof item.cover==='string'?item.cover:'',sample:Boolean(item.sample)}));
    return {
      version:2,records,habits,mediaItems,
      drafts:candidate.drafts&&typeof candidate.drafts==='object'?candidate.drafts:{},
      settings:{...defaults.settings,...(candidate.settings||{}),brand:{...defaults.settings.brand,...(candidate.settings?.brand||{})},fitnessProfile:{...defaults.settings.fitnessProfile,...(candidate.settings?.fitnessProfile||{})},weeklyPlan:Array.isArray(candidate.settings?.weeklyPlan)?candidate.settings.weeklyPlan:DEFAULT_PLAN.map(x=>({...x}))}
    };
  }

  let dataCorrupted=false;
  function loadState(){
    try{window.__storage.remove('richangji-state-v0');}catch(e){}
    // v3.17.38 读写配对：优先 __storage.get（与 saveState 的 set 成对），旧数据/接口差异则回退 getRaw → localStorage
    let parsedState=null;try{parsedState=window.__storage.get(STORAGE_KEY);}catch(e){}
    if(parsedState&&typeof parsedState==='object') return normalizeState(parsedState);
    const raw=window.__storage.getRaw(STORAGE_KEY)||localStorage.getItem(STORAGE_KEY);
    if(!raw) return makeInitialState();
    try{return normalizeState(JSON.parse(raw));}
    catch(error){dataCorrupted=true;return makeInitialState();}
  }

  let state=loadState();
  let toastTimer;
  let pendingMediaCover='';
  function saveState(showSaved=false){
    try{
      window.__storage.set(STORAGE_KEY,state);
      document.querySelector('.save-state')?.classList.remove('error');
      document.getElementById('saveText').textContent='已自动保存';
      if(showSaved) pulseSaved();
      return true;
    }catch(error){
      document.querySelector('.save-state')?.classList.add('error');
      document.getElementById('saveText').textContent='保存失败';
      toast('存储空间不足，无法保存');
      return false;
    }
  }
  function pulseSaved(){const el=document.querySelector('.save-state');if(!el)return;el.animate?.([{opacity:.5},{opacity:1}],{duration:350});}
  // v3.17.35 空值加固：安卓 WebView 在「进程恢复 / 页面重挂载 / 数据恢复」等场景下，生活工作台 markup 可能尚未就绪或被整体替换，此时 #toast / #confetti 取不到；原实现直接 el.textContent 会抛 "Cannot set properties of null" 并弹出致命错误浮层。现改为：宿主缺失时动态创建（提示仍可见），彻底消除该崩溃。
  function ensureOverlayHost(id,className,fallbackStyle){let el=document.getElementById(id);if(el)return el;try{el=document.createElement('div');el.id=id;el.className=className;if(id==='toast'){el.setAttribute('role','status');el.setAttribute('aria-live','polite');}else{el.setAttribute('aria-hidden','true');}const host=document.querySelector('.life-app')||document.body;if(!host)return null;if(host===document.body&&fallbackStyle)el.style.cssText=fallbackStyle;host.appendChild(el);}catch(e){console.warn('[life] overlay host create failed:',e&&e.message);return null;}return el;}
  function toast(message){const text=translateText(message),el=ensureOverlayHost('toast','toast');if(!el){console.warn('[life] toast skipped:',text);return;}el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400);}
  function celebrate(){const box=ensureOverlayHost('confetti','confetti','position:fixed;inset:0;pointer-events:none;z-index:9998');if(!box)return;box.innerHTML=Array.from({length:16},(_,i)=>`<i style="--x:${45+Math.random()*10}%;--dx:${(Math.random()-.5)*240}px;--dy:${-70-Math.random()*170}px;--c:${['#b65f42','#627a67','#a57c45','#7d5b75'][i%4]}"></i>`).join('');setTimeout(()=>{box.innerHTML='';},900);}

  function sortedRecords(type,ascending=false){return state.records.filter(r=>!type||r.type===type).sort((a,b)=>(ascending?1:-1)*(a.date.localeCompare(b.date)||(a.createdAt||0)-(b.createdAt||0)));}
  // 上班数据：复用上班日历本地同步/服务器推送的 window.allData（{日期: {status,note,...}}），
  // 转成与生活记录同构的 work 记录（只读展示，不写入 state.records，本地保存仍由上班日历侧负责）。
  function workRecords(){
    const all=window.allData||{};
    return Object.keys(all).map(date=>{
      const d=all[date]||{};
      return {id:`work-${date}`,type:'work',date,createdAt:Date.parse(`${date}T00:00:00`)||0,sample:false,data:{status:d.status||null,note:d.note||'',tags:d.tags||[],color:d.color||''}};
    }).filter(r=>r.data.status).sort((a,b)=>b.date.localeCompare(a.date));
  }
  function addRecord(type,date,data){
    state.records.push({id:uid(),type,date:date||isoDate(),createdAt:Date.now(),sample:false,data});
    var rec=state.records[state.records.length-1];
    if(type==='money')pushMoney(rec);
    if(type==='planner')pushPlan(rec);
    if(type==='fitness')pushFitness(rec);
    if(type==='home')pushShopping(rec);
    state.settings.recordsSinceExport=Number(state.settings.recordsSinceExport||0)+1;
    if(type==='money') state.settings.moneySinceExport=Number(state.settings.moneySinceExport||0)+1;
    const saved=saveState(true);renderAll();
    if(!saved)return false;
    toast('已立即保存');
    return true;
  }
  function deleteRecord(id){const target=state.records.find(r=>r.id===id);if(!target||!confirm(LANG==='en'?`Delete “${titleFor(target)}”? This cannot be undone.`:`确定删除“${titleFor(target)}”吗？删除后无法撤回。`))return;if(target.remoteId){if(target.type==='money')deleteRemoteMoney(target.remoteId);if(target.type==='planner')deleteRemotePlan(target.remoteId);if(target.type==='fitness')deleteRemoteFitness(target.remoteId);if(target.type==='home')deleteRemoteShopping(target.remoteId);}state.records=state.records.filter(r=>r.id!==id);const saved=saveState();renderAll();if(saved)toast('记录已删除');}
  // 生活模块切换后由外壳触发的刷新钩子（LifeWorkbench 注册）：
  // 修复「切到记账页显示旧数据」——switchView 是纯 DOM 切换，原先不重跑渲染。
  let _viewRefreshHook = null;
  function setViewRefreshHook(fn){ _viewRefreshHook = typeof fn === 'function' ? fn : null; }
  function switchView(view){
    const target=document.getElementById(`view-${view}`);
    if(!target)return;
    document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el===target));
    document.querySelectorAll('[data-nav]:not([data-work-sub])').forEach(el=>el.classList.toggle('active',el.dataset.nav===view));
    const viewTitle = document.getElementById('viewTitle');
    if (viewTitle) viewTitle.textContent=target.dataset.title||'日常集';
    if(location.hash!==`#${view}`)history.replaceState(null,'',`#${view}`);
    if (typeof _viewRefreshHook === 'function') _viewRefreshHook(view);
    scrollTo({top:0,behavior:'smooth'});
  }
  function formatDateHeading(value){if(value===isoDate())return t('今天');if(value===shiftDate(-1))return t('昨天');const date=new Date(`${value}T00:00:00`);return LANG==='en'?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric'}).format(date):`${date.getMonth()+1} 月 ${date.getDate()} 日`;}
  function titleFor(record){const d=record.data||{},local=value=>record.sample?translateText(value):value;if(record.type==='work')return WORK_STATUS_LABELS[d.status]||'上班';if(record.type==='money')return d.note?local(d.note):t(d.category||'一笔收支');if(record.type==='planner')return d.title?local(d.title):t('一项日程');if(record.type==='fitness')return d.note?local(d.note):t('身体记录');if(record.type==='home')return d.name?local(d.name):t('待买物品');return t('生活记录');}
  function detailFor(record){const d=record.data||{};if(record.type==='work'){const note=d.note||'',tags=(d.tags||[]).filter(Boolean);return [note,...tags].filter(Boolean).join(' · ')||'';}if(record.type==='money')return`${t(d.category||'其他')} · ${t(d.flow==='income'?'收入':'支出')}`;if(record.type==='planner')return`${t(d.list||'生活')} · ${d.time||t('全天')} · ${t(d.done?'已完成':'待完成')}`;if(record.type==='fitness')return`${d.bodyFat?`${LANG==='en'?'Body fat':'体脂'} ${d.bodyFat}% · `:''}${d.duration||0} ${LANG==='en'?'min exercise':'分钟运动'}`;if(record.type==='home')return`${record.sample?translateText(d.quantity||'数量未填'):(d.quantity||t('数量未填'))} · ${t(d.category||'未分类')} · ${t(d.bought?'已买':'待买')}`;return'';}
  function valueFor(record){const d=record.data||{};if(record.type==='work')return WORK_STATUS_LABELS[d.status]||'';if(record.type==='money')return`${d.flow==='income'?'+':'-'}${money(d.amount)}`;if(record.type==='fitness'&&d.weight)return`${d.weight} kg`;if(record.type==='planner')return d.time||'';if(record.type==='home')return d.price?money(d.price):'';return'';}
  function recordDetailHtml(record){if(record.type==='work')return userHtml(detailFor(record));if(record.type!=='home')return escapeHtml(detailFor(record));const d=record.data||{},quantity=record.sample?localizedHtml(d.quantity||'数量未填'):userHtml(d.quantity||t('数量未填'));return`${quantity} · ${localizedHtml(d.category||'未分类')} · ${t(d.bought?'已买':'待买')}`;}
  function recordTitleHtml(record){if(record.sample)return localizedHtml(titleFor(record));const raw=titleFor(record);const translated=translateText(raw);return translated!==raw?translated:userHtml(raw);}
  function empty(message){return`<div class="empty-state">${localizedHtml(message)}</div>`;}
  function taskRow(record,deletable=false){const d=record.data;const overdue=!d.done&&record.date<isoDate(),title=record.sample?(LANG==='en'&&d.titleEn?d.titleEn:localizedHtml(d.title)):userHtml(d.title),note=record.sample?localizedHtml(d.note||''):userHtml(d.note||'');return`<div class="task-row ${d.done?'done':''} ${overdue?'overdue':''}"><button class="check-btn ${d.done?'checked':''}" data-action="toggle-task" data-id="${record.id}" aria-label="${t('切换完成状态')}">${d.done?icon('i-check'):''}</button><span class="task-title">${title} <i class="list-tag">${localizedHtml(d.list||'生活')}</i><small>${note}${d.remind?` · ${t('到时提醒')}`:''}</small></span><span class="task-time">${overdue?t('已逾期'):escapeHtml(d.time||t('全天'))}</span><span class="priority-flag ${d.priority==='high'?'high':''}"></span>${deletable?`<button class="delete-btn" data-action="delete" data-id="${record.id}" aria-label="${t('删除')}">${icon('i-trash')}</button>`:''}</div>`;}
  // 记账行（v3.17.27 展示优化）：分类徽章 + 备注主行 + 日期/流向次行 + 右对齐金额。
  // 分类徽章颜色与消费结构饼图同源（categoryColor），全页视觉一致。
  function moneyRow(r){
    const d=r.data||{},isIncome=d.flow==='income';
    const badge=`<span class="money-badge" style="background:${categoryColor(d.category)}">${escapeHtml(d.category||'其他')}</span>`;
    const title=r.sample?localizedHtml(d.note||d.category||'一笔收支'):userHtml(d.note||d.category||'一笔收支');
    const meta=`${escapeHtml(r.date)} · ${isIncome?t('收入'):t('支出')}`;
    const amount=`<span class="money-amount ${isIncome?'income':'expense'}">${isIncome?'+':'−'}${money(d.amount)}</span>`;
    return `<div class="money-row"><div class="money-main">${badge}<span class="money-text"><strong>${title}</strong><small>${meta}</small></span></div>${amount}<button class="delete-btn" data-action="delete" data-id="${r.id}" aria-label="${t('删除')}">${icon('i-trash')}</button></div>`;
  }
  function recordRow(record){const meta=TYPE_META[record.type]||TYPE_META.home;const flowClass=record.type==='money'?record.data.flow:'';return`<div class="record-row"><span class="record-icon ${meta.tone}">${icon(meta.icon)}</span><span class="record-main"><strong>${recordTitleHtml(record)}</strong><small>${escapeHtml(formatDateHeading(record.date))} · ${recordDetailHtml(record)}</small></span><span class="record-amount ${flowClass}">${escapeHtml(valueFor(record))}</span><button class="delete-btn" data-action="delete" data-id="${record.id}" aria-label="${t('删除')}">${icon('i-trash')}</button></div>`;}

  function habitNameHtml(habit){const def=HABIT_DEFS.find(d=>d.key===habit.key);if(def)return escapeHtml(resolveHabitName(def));return habit.sample?localizedHtml(habit.name):userHtml(habit.name);}
  function habitDone(habit,date=isoDate()){return Number(habit.entries?.[date]||0)>=Number(habit.target||1);}
  function habitStreak(habit){let streak=0;const cursor=new Date();while(habitDone(habit,isoDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}return streak;}
  function habitBestStreak(habit){let best=0,current=0;Object.keys(habit.entries||{}).sort().forEach((date,index,dates)=>{if(!habitDone(habit,date)){current=0;return;}const previous=dates[index-1];current=previous&&Math.round((new Date(date)-new Date(previous))/86400000)===1?current+1:1;best=Math.max(best,current);});return best;}

  // 主页「今日工作」卡片：直接展示当天上班情况（状态 + 待办 + 打卡），
  // 数据来自 window.allData / window.allTodos / window.allReminderRecords，
  // 与时光档案的 workRecords() 同源，只读不写。
  function renderWorkToday(){
    const today=isoDate();
    const day=(window.allData&&window.allData[today])||{};
    const status=day.status||null;
    const statusLabel=WORK_STATUS_LABELS[status]||(LANG==='en'?'Unset':'待记录');
    const statusText=WORK_STATUS_LABELS[status]||'待记录';
    const note=day.note||'';
    const tags=(day.tags||[]).filter(Boolean).slice(0,3);
    let todoTotal=0,todoDone=0;
    const weekDay=new Date(today+'T00:00:00').getDay();
    (window.allTodos||[]).forEach(todo=>{
      const hit=todo.type==='once'?todo.date===today:((todo.weekdays||[]).includes(weekDay));
      if(!hit)return;
      todoTotal++;
      const done=todo.type==='once'?Boolean(todo.done):Boolean(todo.weeklyDone&&todo.weeklyDone[today]);
      if(done)todoDone++;
    });
    let clockinDone=0,clockinTotal=0;
    const enabledReminders=(window.allReminders||[]).filter(r=>r&&r.enabled);
    if(enabledReminders.length){
      clockinTotal=enabledReminders.length;
      const recs=(window.allReminderRecords||{})[today]||{};
      clockinDone=enabledReminders.filter(r=>recs[r.id]&&recs[r.id].confirmed).length;
    }
    const title=document.getElementById('workTodayTitle');
    if(title)title.textContent=statusLabel;
    const body=document.getElementById('workTodayBody');
    if(!body)return;
    const parts=[];
    parts.push(`<span class="work-line-item">${status?escapeHtml(statusText):(LANG==='en'?'Not recorded yet':'今天还没有标记状态')}</span>`);
    if(note)parts.push(`<span class="work-line-item">${userHtml(note)}</span>`);
    parts.push(`<span class="work-line-item">${todoTotal?`${LANG==='en'?'Todos':'待办'} ${todoTotal} · ${LANG==='en'?'done':'完成'} ${todoDone}`:(LANG==='en'?'No todos today':'今日暂无待办')}</span>`);
    if(clockinTotal)parts.push(`<span class="work-line-item">${LANG==='en'?'Check-ins':'打卡'} ${clockinDone}/${clockinTotal}</span>`);
    tags.forEach(tag=>parts.push(`<span class="work-tag-chip">${userHtml(tag)}</span>`));
    body.innerHTML=parts.join('');
  }

  function renderDashboard(){
    const today=isoDate(),month=today.slice(0,7);
    renderWorkToday();
    const monthExpense=sum(state.records.filter(r=>r.type==='money'&&r.date.startsWith(month)&&r.data.flow==='expense'),r=>r.data.amount);
    const todayTasks=sortedRecords('planner').filter(r=>r.date===today),doneTasks=todayTasks.filter(r=>r.data.done).length;
    const completed=state.habits.filter(h=>habitDone(h)).length;
    const fitnessToday=state.records.some(r=>r.type==='fitness'&&r.date===today);
    const habitRatio=state.habits.length?completed/state.habits.length:0;
    const taskRatio=todayTasks.length?doneTasks/todayTasks.length:0;
    const score=Math.min(100,Math.max(60,Math.round(60+habitRatio*20+taskRatio*12+(fitnessToday?8:0))));
    document.getElementById('lifeScore').textContent=score;
    document.getElementById('heroSummary').textContent=t(score>=85?'今天的节奏很好，也记得留一点空白。':score>=70?'已经在稳稳推进，继续保持自己的节奏。':'今天先从一件小事开始，慢慢来就好。');
    document.getElementById('monthExpense').textContent=money(monthExpense);
    document.getElementById('budgetHint').textContent=monthExpense>state.settings.budget?'已超出本月预算':`还可安排 ${money(Math.max(0,state.settings.budget-monthExpense))}`;
    document.getElementById('habitProgress').textContent=`${completed} / ${state.habits.length}`;
    document.getElementById('habitHint').textContent=completed===state.habits.length?'今天全部完成':'从一件小事开始';
    document.getElementById('taskProgress').textContent=`${todayTasks.filter(r=>!r.data.done).length} 件`;
    document.getElementById('taskHint').textContent=doneTasks?`已经完成 ${doneTasks} 件`:'节奏刚刚好';
    document.getElementById('dashboardTasks').innerHTML=todayTasks.length?todayTasks.slice(0,4).map(r=>taskRow(r)).join(''):empty('今天还没有待办，给自己留点空间');
    document.getElementById('dashboardHabits').innerHTML=state.habits.slice(0,5).map(h=>`<div class="habit-pill"><span class="habit-dot ${h.tone}"></span><strong>${habitNameHtml(h)}</strong><small>${t(habitDone(h)?'已完成':'待打卡')}</small><button class="check-btn ${habitDone(h)?'checked':''}" data-action="habit-quick" data-id="${h.id}">${habitDone(h)?icon('i-check'):''}</button></div>`).join('');
    const recent=sortedRecords().slice(0,5);document.getElementById('recentRecords').innerHTML=recent.length?recent.map(r=>{const meta=TYPE_META[r.type]||TYPE_META.home;return`<div class="timeline-item"><span class="record-icon ${meta.tone}">${icon(meta.icon)}</span><span><strong>${recordTitleHtml(r)}</strong><small>${escapeHtml(formatDateHeading(r.date))} · ${t(meta.label)}</small></span><span class="record-value">${escapeHtml(valueFor(r))}</span></div>`;}).join(''):empty('第一条记录，会从这里开始');
    document.getElementById('insightText').textContent=completed?'你不是在追赶完美，而是在让好习惯慢慢变得自然。':'规律不是把每天塞满，而是知道什么值得留下。';
  }

  function previousMonthKey(){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return isoDate(d).slice(0,7);}
  function renderMoneyPie(expenses){
    const byCategory={};expenses.forEach(r=>byCategory[r.data.category]=(byCategory[r.data.category]||0)+Number(r.data.amount||0));
    const entries=Object.entries(byCategory).sort((a,b)=>b[1]-a[1]),total=sum(entries,e=>e[1]);
    const svg=document.getElementById('moneyPie'),legend=document.getElementById('moneyLegend'),share=document.getElementById('moneyShare'),shareBar=document.getElementById('moneyShareBar');
    // 主题适配（v3.17.31）：轨道/中心圆/文字颜色全部取自主题令牌，暗色下不再出现白底圆与浅色轨道
    // 注意：令牌定义在 .life-app 作用域上（非 :root），必须从 .life-app 元素取
    const lifeEl=document.querySelector('.life-app');
    const cs=lifeEl?getComputedStyle(lifeEl):getComputedStyle(document.documentElement);
    const token=(name,fallback)=>cs.getPropertyValue(name).trim()||fallback;
    const trackColor=token('--tint-6','#eee7df'),holeColor=token('--life-card','#ffffff');
    const labelText=token('--muted','#9a9288'),valueText=token('--ink','#3d3830');
    if(!total){svg.innerHTML=`<circle cx="110" cy="110" r="72" fill="${trackColor}"/><text x="110" y="115" text-anchor="middle" fill="${labelText}" font-size="12">${t('暂无支出')}</text>`;legend.innerHTML='';if(share)share.hidden=true;return;}
    const circumference=2*Math.PI*72;let offset=0;
    svg.innerHTML=`<circle cx="110" cy="110" r="72" fill="none" stroke="${trackColor}" stroke-width="34"/>`+entries.map(([category,value])=>{const color=categoryColor(category),length=value/total*circumference;const item=`<circle cx="110" cy="110" r="72" fill="none" stroke="${color}" stroke-width="34" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"/>`;offset+=length;return item;}).join('')+`<circle cx="110" cy="110" r="40" fill="${holeColor}" fill-opacity=".92"/><text x="110" y="102" text-anchor="middle" fill="${labelText}" font-size="10" font-weight="400">${t('本月支出')}</text><text x="110" y="124" text-anchor="middle" fill="${valueText}" font-size="20" font-weight="500" letter-spacing="-0.5">${escapeHtml(money(total))}</text>`;
    // v3.17.34 消费占比恢复：图例重新显示百分比（.legend-item b 样式仍在），饼图下方新增堆叠占比条（与预算进度条同风格）
    legend.innerHTML=entries.map(([category,value])=>`<div class="legend-item"><i style="background:${categoryColor(category)}"></i><span>${escapeHtml(category)}</span><b>${Math.round(value/total*100)}%</b></div>`).join('');
    if(share&&shareBar){
      if(shareBar.childElementCount!==entries.length){
        shareBar.innerHTML=entries.map(([category])=>`<i data-cat="${escapeHtml(category)}" style="background:${categoryColor(category)}"></i>`).join('');
      }else{
        [...shareBar.children].forEach((el,i)=>el.style.background=categoryColor(entries[i][0]));
      }
      const segs=entries.map(([,value])=>Math.max(value/total*100,0));
      // 避免四舍五入后总和不等于 100：最后一段吃掉剩余份额
      const segSum=sum(segs,s=>s);segs[segs.length-1]+=100-segSum;
      [...shareBar.children].forEach((el,i)=>el.style.flexGrow=String(Math.max(segs[i],0.001)));
      share.hidden=false;
    }
  }
  function renderMoney(){
    const month=isoDate().slice(0,7),prev=previousMonthKey(),records=sortedRecords('money');
    const monthly=records.filter(r=>r.date.startsWith(month)),expenses=monthly.filter(r=>r.data.flow==='expense');
    const expense=sum(expenses,r=>r.data.amount),income=sum(monthly.filter(r=>r.data.flow==='income'),r=>r.data.amount),remain=income-expense;
    const prevExpense=sum(records.filter(r=>r.date.startsWith(prev)&&r.data.flow==='expense'),r=>r.data.amount);
    const incomeEl=document.getElementById('moneyIncome'),expenseEl=document.getElementById('moneyExpense'),balanceEl=document.getElementById('moneyBalance');
    incomeEl.textContent=money(income);expenseEl.textContent=money(expense);balanceEl.textContent=money(remain);
    // 易读性增强（v3.17.27）：红=支出，绿=收入；剩余为负红色警示
    incomeEl.classList.toggle('metric-income',income>0);expenseEl.classList.toggle('metric-expense',expense>0);balanceEl.classList.toggle('negative',remain<0);
    if(prevExpense){const diff=expense-prevExpense,pct=Math.abs(diff/prevExpense*100).toFixed(0);document.getElementById('monthCompare').textContent=`比上月${diff>=0?'多':'少'}花了 ${money(Math.abs(diff))}`;document.getElementById('monthCompareDetail').textContent=`${diff>=0?'↑':'↓'} ${pct}% · 上月 ${money(prevExpense)}`;}else{document.getElementById('monthCompare').textContent='暂无对比';document.getElementById('monthCompareDetail').textContent='有了上月数据后，这里会显示变化';}
    const used=state.settings.budget?Math.round(expense/state.settings.budget*100):0;document.getElementById('budgetInput').value=state.settings.budget;document.getElementById('budgetBar').style.width=`${Math.min(100,used)}%`;document.getElementById('budgetUsedText').textContent=`已使用 ${used}%`;document.getElementById('budgetRemainText').textContent=`剩余 ${money(state.settings.budget-expense)}`;
    const alert=document.getElementById('moneyAlert'),todayCount=records.filter(r=>r.date===isoDate()&&r.type==='money').length;
    if(expense>state.settings.budget){alert.className='module-alert';alert.innerHTML=`<div><strong>本月支出已超预算 ${money(expense-state.settings.budget)}</strong><span>先看消费结构，再决定哪些支出可以放慢一点。</span></div>`;}else if(!todayCount){alert.className='module-alert good';alert.innerHTML='<div><strong>今天还没记账</strong><span>有空时补一笔，让月度趋势保持完整。</span></div>';}else if(state.settings.moneySinceExport>=20){alert.className='module-alert';alert.innerHTML='<div><strong>已新增 20 笔账目</strong><span>建议现在导出一次备份。</span></div>';}else alert.innerHTML='';
    const categories=[...new Set([...EXPENSE_CATEGORIES,...INCOME_CATEGORIES])];
    document.getElementById('moneyFilter').innerHTML='<option value="all">全部分类</option>'+categories.map(c=>`<option ${state.settings.moneyFilter===c?'selected':''}>${c}</option>`).join('');
    // 流水明细：按日期分组，组头显示日期 + 当日小计，组内用 moneyRow（分类徽章 + 备注 + 流向色金额）
    const filtered=records.filter(r=>state.settings.moneyFilter==='all'||r.data.category===state.settings.moneyFilter).slice(0,120);
    if(filtered.length){
      const groups=groupByDate(filtered);
      document.getElementById('moneyList').innerHTML=Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(date=>{
        const items=groups[date].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
        const dayExp=sum(items.filter(r=>r.data.flow==='expense'),r=>r.data.amount);
        const dayInc=sum(items.filter(r=>r.data.flow==='income'),r=>r.data.amount);
        const sub=(dayInc>0?`+${money(dayInc)} `:'')+(dayExp>0?`−${money(dayExp)}`:'');
        return `<div class="money-day"><div class="money-day-head"><strong>${escapeHtml(formatDateHeading(date))}</strong><span>${escapeHtml(date.slice(5))}</span><b>${escapeHtml(sub)}</b></div>${items.map(moneyRow).join('')}</div>`;
      }).join('');
    }else{
      document.getElementById('moneyList').innerHTML=empty('这个分类还没有流水');
    }
    renderMoneyPie(expenses);
  }

  function renderHabits(){
    const today=isoDate(),done=state.habits.filter(h=>habitDone(h)).length,maxStreak=Math.max(0,...state.habits.map(habitBestStreak));
    const dates=Array.from({length:30},(_,i)=>shiftDate(i-29));let completedCells=0;
    state.habits.forEach(h=>dates.forEach(d=>{if(habitDone(h,d))completedCells++;}));
    document.getElementById('habitsDone').textContent=`${done} / ${state.habits.length}`;document.getElementById('habitsStreak').textContent=`${maxStreak} 天`;document.getElementById('habitRate').textContent=state.habits.length?`${Math.round(completedCells/(state.habits.length*30)*100)}%`:'0%';
    document.getElementById('dailyHabitList').innerHTML=state.habits.map(h=>{const value=Number(h.entries?.[today]||0),isDone=habitDone(h),pulse=!isDone&&new Date().getHours()>=20,isBuiltIn=HABIT_DEFS.some(def=>def.key===h.key)||h.sample,hdef=HABIT_DEFS.find(d=>d.key===h.key),unit=h.type==='check'?localizedHtml('次'):hdef?escapeHtml(resolveHabitUnit(hdef)):isBuiltIn?localizedHtml(h.unit):userHtml(h.unit);let control='';if(h.type==='counter')control=`<div class="counter-control"><button data-action="habit-minus" data-id="${h.id}">${icon('i-minus')}</button><strong>${value}</strong><button data-action="habit-plus" data-id="${h.id}">${icon('i-plus')}</button></div>`;else if(h.type==='number')control=`<div class="sleep-control"><input data-action="habit-number" data-id="${h.id}" type="number" min="0" max="9999" step="0.1" value="${value||''}" placeholder="0"><span>${unit}</span></div>`;else control=`<button class="habit-check ${isDone?'checked':''}" data-action="habit-toggle" data-id="${h.id}">${isDone?icon('i-check'):''}</button>`;return`<div class="daily-habit ${isDone?'done':''} ${pulse?'pulse':''}"><button class="habit-card-delete" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('删除习惯')}">${icon('i-trash')}</button><div><h3>${habitNameHtml(h)}</h3><p>${LANG==='en'?`Target ${h.target} ${unit} · ${habitStreak(h)}-day streak`:`目标 ${h.target} ${unit} · 连续 ${habitStreak(h)} 天`}</p></div><div class="habit-action"><span class="habit-state">${t(isDone?'已完成':'待完成')}</span>${control}</div></div>`;}).join('');
    const header=`<div class="heatmap-header"><span></span>${dates.map((d,i)=>`<span>${i%5===0?new Date(`${d}T00:00:00`).getDate():''}</span>`).join('')}</div>`;
    document.getElementById('habitHeatmap').innerHTML=header+state.habits.map(h=>`<div class="heatmap-row"><span class="heatmap-name">${habitNameHtml(h)}<i class="streak-badge">${LANG==='en'?`${habitStreak(h)} days`:`${habitStreak(h)} 天`}</i></span>${dates.map(date=>{const value=Number(h.entries?.[date]||0);return`<span class="heat-cell ${habitDone(h,date)?'done':value?'partial':''}" title="${date}${LANG==='en'?': ':'：'}${value||t('未完成')}"></span>`;}).join('')}</div>`).join('');
  }

  function fitnessStats(){
    const records=sortedRecords('fitness',true).filter(r=>r.data.weight),profile=state.settings.fitnessProfile;
    const current=records.at(-1)?.data.weight||profile.startWeight||60,start=profile.startWeight||records[0]?.data.weight||current,target=profile.target||55,height=profile.height||165;
    const bmi=current/((height/100)**2);let dailyRate=0;
    if(records.length>=2){const first=records[0],last=records.at(-1),days=Math.max(1,(new Date(last.date)-new Date(first.date))/86400000);dailyRate=(first.data.weight-last.data.weight)/days;}
    const bmr=10*current+6.25*height-5*(profile.age||30)+(profile.sex==='male'?5:-161),tdee=bmr*Number(profile.activity||1.375);
    const calorieRecords=records.filter(r=>Number(r.data.calories)>0),avgIntake=calorieRecords.length?sum(calorieRecords,r=>r.data.calories)/calorieRecords.length:0,deficit=avgIntake?tdee-avgIntake:0;
    if(dailyRate<=0&&deficit>0)dailyRate=deficit/7700;
    const remaining=Math.max(0,current-target),days=remaining&&dailyRate>0?Math.ceil(remaining/dailyRate):null;
    return{records,profile,current,start,target,bmi,bmr,tdee,avgIntake,deficit,remaining,days};
  }
  function drawWeightChart(records){
    const svg=document.getElementById('weightChart'),points=records.slice(-30);
    if(points.length<2){svg.innerHTML='<text x="380" y="140" text-anchor="middle" fill="#8f8579" font-size="14" font-family="Inter, PingFang SC, sans-serif">再记录一天，就能看到趋势</text>';return;}
    const values=points.map(r=>Number(r.data.weight)),averages=values.map((_,i)=>{const slice=values.slice(Math.max(0,i-6),i+1);return sum(slice,x=>x)/slice.length;});
    const rawMin=Math.min(...values,...averages),rawMax=Math.max(...values,...averages),step=Math.max(.2,Math.ceil((rawMax-rawMin)/4*10)/10),axisMin=Math.floor((rawMin-step)*10)/10,axisMax=Math.ceil((rawMax+step)*10)/10;
    const w=760,h=280,pad={l:62,r:24,t:20,b:42},x=i=>pad.l+i*(w-pad.l-pad.r)/(points.length-1),y=v=>pad.t+(axisMax-v)*(h-pad.t-pad.b)/(axisMax-axisMin),path=arr=>arr.map((v,i)=>`${i?'L':'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    const ticks=4,grid=Array.from({length:ticks+1},(_,i)=>{const gy=pad.t+i*(h-pad.t-pad.b)/ticks,val=axisMax-i*(axisMax-axisMin)/ticks;return`<line x1="${pad.l}" x2="${w-pad.r}" y1="${gy}" y2="${gy}" stroke="#e7dfd5" stroke-width="1"/><text x="${pad.l-12}" y="${gy+4}" text-anchor="end" fill="#81776d" font-size="11" font-weight="500" font-family="Inter, PingFang SC, sans-serif">${val.toFixed(1)}</text>`;}).join('');
    const labelEvery=Math.max(1,Math.ceil(points.length/5)),labels=points.map((r,i)=>(i%labelEvery===0||i===points.length-1)?`<text x="${x(i)}" y="${h-12}" text-anchor="middle" fill="#81776d" font-size="10" font-weight="500" font-family="Inter, PingFang SC, sans-serif">${r.date.slice(5).replace('-','/')}</text>`:'').join('');
    svg.innerHTML=`${grid}<path d="${path(values)}" fill="none" stroke="var(--plum)" stroke-width="3" vector-effect="non-scaling-stroke"/><path d="${path(averages)}" fill="none" stroke="#b65f42" stroke-width="2.5" stroke-dasharray="7 5" vector-effect="non-scaling-stroke"/>${values.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="#fff" stroke="var(--plum)" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}${labels}`;
  }
  function renderFitness(){
    const s=fitnessStats(),latest=s.records.at(-1),today=s.records.some(r=>r.date===isoDate());
    document.getElementById('latestWeight').textContent=`${Number(s.current).toFixed(1)} kg`;document.getElementById('weightRemain').textContent=LANG==='en'?`${s.remaining.toFixed(1)} kg`:`${(s.remaining*2).toFixed(1)} 斤`;document.getElementById('currentBmi').textContent=s.bmi.toFixed(1);
    const progress=s.start===s.target?100:clamp((s.start-s.current)/(s.start-s.target)*100,0,100);document.getElementById('fitnessPercent').textContent=`${Math.round(progress)}%`;document.getElementById('fitnessProgressBar').style.width=`${progress}%`;document.getElementById('fitnessStartText').textContent=`起点 ${s.start} kg`;document.getElementById('fitnessTargetText').textContent=`目标 ${s.target} kg`;document.getElementById('fitnessEstimate').textContent=s.remaining<=0?'目标已达成，进入稳定期':s.days?`按当前趋势，约还需 ${s.days} 天`:'多记录几天后估算达成时间';
    const advice=document.getElementById('calorieAdvice');if(!s.avgIntake){advice.className='health-note';advice.textContent=`按 Mifflin–St Jeor 公式估算，当前每日消耗约 ${Math.round(s.tdee)} kcal。记录饮食后可判断热量缺口。`;}else if(s.deficit<500||s.deficit>750){advice.className='health-note warning';advice.textContent=`当前估算每日热量缺口 ${Math.round(s.deficit)} kcal，不在健康建议的 500–750 kcal 范围内，请调整饮食或运动。`;}else{advice.className='health-note';advice.textContent=`当前估算每日热量缺口 ${Math.round(s.deficit)} kcal，在建议的 500–750 kcal 范围内。`}
    const alert=document.getElementById('fitnessAlert'),planLeft=state.settings.weeklyPlan.filter(x=>!x.done).length;alert.className=`module-alert ${today&&planLeft===0?'good':''}`;alert.innerHTML=!today?'<div><strong>今天还没称重</strong><span>尽量在相似时间、相似状态下记录，关注 7 天平均线。</span></div>':planLeft?`<div><strong>本周计划还有 ${planLeft} 项</strong><span>不用追赶，选一项适合今天状态的完成。</span></div>`:'<div><strong>今天已记录，本周计划也完成了</strong><span>做得很好，记得给身体留恢复时间。</span></div>';
    drawWeightChart(s.records);const donePlan=state.settings.weeklyPlan.filter(x=>x.done).length;document.getElementById('planProgress').textContent=LANG==='en'?`${donePlan} / ${state.settings.weeklyPlan.length} completed`:`${donePlan} / ${state.settings.weeklyPlan.length} 已完成`;document.getElementById('weeklyPlan').innerHTML=state.settings.weeklyPlan.length?state.settings.weeklyPlan.map(item=>{const isDefault=DEFAULT_PLAN.some(plan=>plan.id===item.id),title=isDefault?(LANG==='en'&&item.titleEn?item.titleEn:localizedHtml(item.title)):userHtml(item.title),note=isDefault?(LANG==='en'&&item.noteEn?item.noteEn:localizedHtml(item.note)):userHtml(item.note);return`<div class="plan-item ${item.done?'done':''}"><button class="check-btn ${item.done?'checked':''}" data-action="toggle-plan" data-id="${item.id}">${item.done?icon('i-check'):''}</button><span><strong>${title}</strong><small>${t(item.group)} · ${note}</small></span><button class="plan-delete" data-action="delete-plan" data-id="${item.id}" aria-label="${t('删除计划')}">${icon('i-trash')}</button></div>`;}).join(''):empty('还没有周计划，点击右上角新增一项');
    document.getElementById('fitnessList').innerHTML=s.records.length?s.records.slice().reverse().slice(0,20).map(recordRow).join(''):empty('记录体重和体脂，关注趋势而不是单日数字');
  }

  function groupByDate(records){return records.reduce((groups,r)=>{(groups[r.date]||=[]).push(r);return groups;},{});}
  // 周历偏移：相对本周的周数（-1=上周，0=本周，1=下周…）；跨页保留在模块状态（随 state.settings 持久化）
  let plannerWeekOffset=0;
  // 周历选中日期：点击周内日期 → 仅显示该日日程；再点取消。null=显示整周
  let plannerWeekPicked=null;
  function plannerWeekBase(){const d=new Date();d.setDate(d.getDate()+plannerWeekOffset*7);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d;}
  function plannerWeekRange(){const base=plannerWeekBase();const days=Array.from({length:7},(_,i)=>shiftDate(i,base));const monthA=Number(days[0].slice(5,7)),monthB=Number(days[6].slice(5,7)),yearA=Number(days[0].slice(0,4)),yearB=Number(days[6].slice(0,4));let label;if(plannerWeekOffset===0){label=t('接下来七天');}else if(yearA===yearB&&monthA===monthB){label=`${yearA} 年 ${monthA} 月`;}else{label=`${yearA}/${monthA} – ${yearB}/${monthB}`;}return{days,label};}
  function renderPlanner(){
    const records=sortedRecords('planner'),today=isoDate(),weekEnd=shiftDate(6),filter=state.settings.plannerFilter;
    const range=plannerWeekRange();
    document.getElementById('plannerToday').textContent=records.filter(r=>r.date===today&&!r.data.done).length;document.getElementById('plannerOverdue').textContent=records.filter(r=>r.date<today&&!r.data.done).length;document.getElementById('plannerWeek').textContent=records.filter(r=>r.date>=today&&r.date<=weekEnd&&!r.data.done).length;
    const weekHead=document.getElementById('plannerWeekHead');if(weekHead)weekHead.textContent=range.label;
    document.getElementById('weekStrip').innerHTML=range.days.map((date,i)=>{const d=new Date(`${date}T00:00:00`),count=records.filter(r=>r.date===date&&!r.data.done).length,weekdays=LANG==='en'?['Sun','Mon','Tue','Wed','Thu','Fri','Sat']:['日','一','二','三','四','五','六'];const isToday=date===today,isPicked=plannerWeekPicked===date;return`<button type="button" class="week-day ${isToday?'today':''} ${isPicked?'picked':''}" data-planner-day="${date}" aria-label="${date}"><span>${weekdays[d.getDay()]}</span><strong>${d.getDate()}</strong><small>${count?(LANG==='en'?`${count} items`:`${count} 项`):t('留白')}</small></button>`;}).join('');
    document.querySelectorAll('[data-planner-filter]').forEach(b=>b.classList.toggle('active',b.dataset.plannerFilter===filter));
    const filtered=records.filter(r=>filter==='all'||(filter==='today'&&r.date===today&&!r.data.done)||(filter==='scheduled'&&r.date>=today&&!r.data.done)||(filter==='done'&&r.data.done)).filter(r=>plannerWeekPicked?r.date===plannerWeekPicked:true);const groups=groupByDate(filtered);
    const hint=document.getElementById('plannerWeekHint');if(hint){hint.textContent=plannerWeekPicked?(LANG==='en'?`Showing ${plannerWeekPicked} · click again to show the week`:`已筛选 ${plannerWeekPicked} · 再点一次取消`):t('点击日期查看当天日程，再次点击取消');}
    document.getElementById('plannerList').innerHTML=Object.keys(groups).length?Object.entries(groups).map(([date,items],i)=>`<details class="date-group" ${i<3?'open':''}><summary><strong>${formatDateHeading(date)}</strong><span>${items.filter(x=>!x.data.done).length} 件待完成</span></summary><div class="group-body">${items.map(r=>taskRow(r,true)).join('')}</div></details>`).join(''):empty(plannerWeekPicked?(LANG==='en'?'No items on this day':'这一天没有日程'):'这个智能清单里暂时没有事项');
  }

  function renderHome(){
    const records=sortedRecords('home'),filter=state.settings.shoppingFilter,month=isoDate().slice(0,7),pending=records.filter(r=>!r.data.bought),bought=records.filter(r=>r.data.bought);
    document.getElementById('homeTotal').textContent=pending.length;document.getElementById('homeBudget').textContent=money(sum(pending,r=>r.data.price));document.getElementById('homeBought').textContent=bought.filter(r=>(r.data.boughtDate||r.date).startsWith(month)).length;
    document.querySelectorAll('[data-shopping-filter]').forEach(b=>b.classList.toggle('active',b.dataset.shoppingFilter===filter));const filtered=records.filter(r=>filter==='all'||(filter==='pending'&&!r.data.bought)||(filter==='bought'&&r.data.bought));
    document.getElementById('homeList').innerHTML=filtered.length?filtered.map(r=>{const name=r.sample?localizedHtml(r.data.name):userHtml(r.data.name),quantity=r.sample?localizedHtml(r.data.quantity||'数量未填'):userHtml(r.data.quantity||t('数量未填')),note=r.data.note?(r.sample?` · ${localizedHtml(r.data.note)}`:` · ${userHtml(r.data.note)}`):'';return`<div class="shopping-row ${r.data.bought?'bought':''}"><button class="check-btn ${r.data.bought?'checked':''}" data-action="toggle-shopping" data-id="${r.id}">${r.data.bought?icon('i-check'):''}</button><span class="shopping-main"><strong>${r.data.priority==='high'?'<i class="urgent-dot"></i>':''}${name}</strong><small>${quantity} · ${localizedHtml(r.data.category||'其他')}${note}</small></span><span class="shopping-price"><strong>${r.data.price?money(r.data.price):t('待定')}</strong><small>${t(r.data.bought?'已买':'预计')}</small></span><button class="delete-btn" data-action="delete" data-id="${r.id}" aria-label="${t('删除')}">${icon('i-trash')}</button></div>`;}).join(''):empty(filter==='pending'?'待买清单已经清空':'这里还没有物品');
  }

  function renderMedia(){
    const year=String(new Date().getFullYear()),items=[...(state.mediaItems||[])].sort((a,b)=>b.date.localeCompare(a.date)),finished=items.filter(item=>item.status==='看完'&&item.date.startsWith(year)),rated=finished.filter(item=>item.rating>0);
    const average=rated.length?sum(rated,item=>item.rating)/rated.length:0,typeCounts={};finished.forEach(item=>typeCounts[item.type]=(typeCounts[item.type]||0)+1);const favorite=Object.entries(typeCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
    document.getElementById('mediaYear').textContent=year;document.getElementById('mediaFinished').textContent=`${finished.length} 部`;document.getElementById('mediaAverage').textContent=average?`${average.toFixed(1)} ★`:'—';document.getElementById('mediaFavorite').textContent=favorite;
    const distribution=Array.from({length:5},(_,i)=>rated.filter(item=>item.rating===i+1).length),max=Math.max(1,...distribution);document.getElementById('ratingDistribution').innerHTML=distribution.map((count,i)=>`<div class="rating-bar"><b>${count}</b><span style="--h:${Math.max(4,count/max*72)}px"></span><small>${i+1} 星</small></div>`).join('');
    document.querySelectorAll('[data-media-view]').forEach(button=>button.classList.toggle('active',button.dataset.mediaView===state.settings.mediaView));document.getElementById('mediaStatusFilter').value=state.settings.mediaStatusFilter;document.getElementById('mediaRatingFilter').value=String(state.settings.mediaRatingFilter||0);
    const filtered=items.filter(item=>(state.settings.mediaStatusFilter==='all'||item.status===state.settings.mediaStatusFilter)&&(!Number(state.settings.mediaRatingFilter)||item.rating>=Number(state.settings.mediaRatingFilter)));
    const collection=document.getElementById('mediaCollection');collection.className=state.settings.mediaView==='list'?'media-list':'media-wall';collection.innerHTML=filtered.length?filtered.map(item=>{const name=item.sample?localizedHtml(item.name):userHtml(item.name),plainName=item.sample?translateText(item.name):item.name,review=item.sample?localizedHtml(item.review):userHtml(item.review);return`<article class="media-card"><div class="media-cover">${item.cover?`<img src="${item.cover}" alt="${escapeHtml(plainName)}${t('封面')}">`:`<div class="media-placeholder">${name}</div>`}</div><div class="media-card-body"><h3 title="${escapeHtml(plainName)}" ${item.sample?'':'data-user-content'}>${name}</h3><div class="media-meta"><span>${t(item.type)} · ${t(item.status)}</span><span class="stars">${item.rating?'★'.repeat(item.rating):t('未评分')}</span></div>${item.review?`<p class="media-review">“${review}”</p>`:''}</div><button class="media-delete" data-action="delete-media" data-id="${item.id}" aria-label="${t('删除')}">${icon('i-trash')}</button></article>`;}).join(''):empty('这个筛选条件下还没有作品');
  }

  function renderArchive(){const filter=state.settings.archiveFilter||'all',records=filter==='work'?workRecords():(filter==='all'?[...workRecords(),...sortedRecords()]:sortedRecords().filter(r=>filter==='all'||r.type===filter)),groups=groupByDate(records);document.querySelectorAll('#archiveFilters button').forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));document.getElementById('archiveList').innerHTML=Object.keys(groups).length?Object.entries(groups).map(([date,items],i)=>`<details class="archive-day" ${i<3?'open':''}><summary><strong>${formatDateHeading(date)}</strong><span>${LANG==='en'?`${items.length} entries`:`${items.length} 条记录`}</span></summary><div class="group-body">${items.map(r=>{const meta=TYPE_META[r.type]||TYPE_META.home;return`<div class="archive-record"><span class="type-tag">${t(meta.label)}</span><span><strong>${recordTitleHtml(r)}</strong><small>${recordDetailHtml(r)}</small></span><span>${escapeHtml(valueFor(r))}</span></div>`;}).join('')}</div></details>`).join(''):empty('这个范围还没有记录');}
  function renderBackupStatus(){document.getElementById('clearSamplesBtn').hidden=!state.records.some(r=>r.sample)&&!state.habits.some(h=>h.sample)&&!state.mediaItems.some(item=>item.sample);}
  function renderHabitManageList(){const list=document.getElementById('habitManageList');list.innerHTML=state.habits.length?state.habits.map(h=>{const isBuiltIn=HABIT_DEFS.some(def=>def.key===h.key)||h.sample,hdef=HABIT_DEFS.find(d=>d.key===h.key),unit=h.type==='check'?localizedHtml('次'):hdef?escapeHtml(resolveHabitUnit(hdef)):isBuiltIn?localizedHtml(h.unit):userHtml(h.unit);return`<div class="custom-manage-row"><span><strong>${habitNameHtml(h)}</strong><small>${t(h.type==='check'?'完成 / 未完成':h.type==='counter'?'计数累加':'填写数值')} · ${LANG==='en'?'Target':'目标'} ${h.target} ${unit}</small></span><button type="button" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('删除习惯')}">${icon('i-trash')}</button></div>`;}).join(''):empty('还没有习惯');}
  function openHabitSettings(){renderHabitManageList();document.getElementById('habitSettings').hidden=false;setTimeout(()=>document.getElementById('habitSettingsForm').elements.name.focus(),80);}
  function closeHabitSettings(){document.getElementById('habitSettings').hidden=true;}
  function renderPlanManageList(){const list=document.getElementById('planManageList');list.innerHTML=state.settings.weeklyPlan.length?state.settings.weeklyPlan.map(item=>{const isDefault=DEFAULT_PLAN.some(plan=>plan.id===item.id),title=isDefault?(LANG==='en'&&item.titleEn?item.titleEn:localizedHtml(item.title)):userHtml(item.title),note=isDefault?(LANG==='en'&&item.noteEn?item.noteEn:localizedHtml(item.note||'无补充说明')):userHtml(item.note||t('无补充说明'));return`<div class="custom-manage-row"><span><strong>${title}</strong><small>${t(item.group)} · ${note}</small></span><button type="button" data-action="delete-plan" data-id="${item.id}" aria-label="${t('删除计划')}">${icon('i-trash')}</button></div>`;}).join(''):empty('还没有周计划');}
  function openPlanSettings(){renderPlanManageList();document.getElementById('planSettings').hidden=false;setTimeout(()=>document.getElementById('planSettingsForm').elements.title.focus(),80);}
  function closePlanSettings(){document.getElementById('planSettings').hidden=true;}
  function openFitnessProfile(){const form=document.getElementById('fitnessProfileForm'),profile=state.settings.fitnessProfile;['height','target','age','sex','activity'].forEach(key=>form.elements[key].value=profile[key]);document.getElementById('fitnessProfileSettings').hidden=false;setTimeout(()=>form.elements.height.focus(),80);}
  function closeFitnessProfile(){document.getElementById('fitnessProfileSettings').hidden=true;}

  function applyBrand(){
    const brand=state.settings.brand||{name:'日常集',avatar:'日',tagline:'生活有迹可循',theme:'plum'},isDefault=brand.name==='日常集'&&brand.avatar==='日'&&brand.tagline==='生活有迹可循';
    const themes={plum:{primary:'#4d3045',soft:'#e8dfe5'},forest:{primary:'#365f53',soft:'#dfe9e4'},clay:{primary:'#8f4f3b',soft:'#f0ddd6'},navy:{primary:'#344b63',soft:'#dde4eb'}};
    const theme=themes[brand.theme]||themes.plum;
    document.documentElement.style.setProperty('--plum',theme.primary);document.documentElement.style.setProperty('--plum-soft',theme.soft);document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.primary);
    const avatar=document.getElementById('brandAvatar'),name=document.getElementById('brandName'),tagline=document.getElementById('brandTagline');[avatar,name,tagline].forEach(element=>element.toggleAttribute('data-user-content',!isDefault));avatar.textContent=isDefault?t('日'):(brand.avatar||'日');name.textContent=isDefault?t('日常集'):(brand.name||'日常集');tagline.textContent=isDefault?t('生活有迹可循'):(brand.tagline||'生活有迹可循');document.title=`${isDefault?t('日常集'):(brand.name||'日常集')} · ${t('生活工作台')}`;
  }
  function openBrandSettings(){const brand=state.settings.brand;const form=document.getElementById('brandForm');const isDefault=brand.name==='日常集'&&brand.avatar==='日'&&brand.tagline==='生活有迹可循';form.elements.name.value=isDefault&&LANG==='en'?'Daily Atlas':brand.name;form.elements.avatar.value=isDefault&&LANG==='en'?'D':brand.avatar;form.elements.tagline.value=isDefault&&LANG==='en'?'A life you can trace':brand.tagline;const radio=form.querySelector(`[name="theme"][value="${brand.theme}"]`);if(radio)radio.checked=true;updateBrandPreview();document.getElementById('brandSettings').hidden=false;setTimeout(()=>{localizeSubtree(document.getElementById('brandSettings'));form.elements.name.focus();},80);}
  function updateBrandPreview(){const form=document.getElementById('brandForm'),defName=LANG==='en'?'Daily Atlas':'日常集',defAvatar=LANG==='en'?'D':'日',defTagline=LANG==='en'?'A life you can trace':'生活有迹可循',values={name:form.elements.name.value||defName,avatar:form.elements.avatar.value||defAvatar,tagline:form.elements.tagline.value||defTagline},isDefault=(LANG==='en'?values.name==='Daily Atlas'&&values.avatar==='D'&&values.tagline==='A life you can trace':values.name===defName&&values.avatar===defAvatar&&values.tagline===defTagline);[['previewName','name'],['previewAvatar','avatar'],['previewTagline','tagline']].forEach(([id,key])=>{const element=document.getElementById(id);element.toggleAttribute('data-user-content',!isDefault);element.textContent=isDefault?t(values[key]):values[key];});}
  function closeBrandSettings(){document.getElementById('brandSettings').hidden=true;}
  function renderAll(){applyBrand();renderDashboard();renderMoney();renderHabits();renderFitness();renderPlanner();renderHome();renderMedia();renderArchive();renderBackupStatus();}

  function setDateDefaults(){document.querySelectorAll('input[type="date"][name="date"]').forEach(input=>{if(!input.value)input.value=isoDate();});}
  function serializeForm(form){const values={};Array.from(form.elements).forEach(field=>{if(!field.name||field.type==='submit'||(field.type==='radio'&&!field.checked))return;values[field.name]=field.type==='checkbox'?field.checked:field.value;});return values;}
  function restoreDrafts(){document.querySelectorAll('form[data-draft]').forEach(form=>{const draft=state.drafts[form.dataset.draft];if(!draft)return;Object.entries(draft).forEach(([name,value])=>form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach(field=>{if(field.type==='radio')field.checked=field.value===value;else if(field.type==='checkbox')field.checked=Boolean(value);else field.value=value;}));});updateMoneyCategories();}
  function clearDraft(form){delete state.drafts[form.dataset.draft];form.reset();setDateDefaults();updateMoneyCategories();saveState();}
  function updateMoneyCategories(){const form=document.getElementById('moneyForm'),flow=form?.querySelector('[name="flow"]:checked')?.value||'expense',select=document.getElementById('moneyCategory');if(!select)return;const current=select.value,categories=flow==='income'?INCOME_CATEGORIES:EXPENSE_CATEGORIES;select.innerHTML=categories.map(c=>`<option ${c===current?'selected':''}>${c}</option>`).join('');}

  function downloadBlob(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function exportExcel(kind){
    let headers=[],rows=[],name=LANG==='en'?'daily-atlas':'日常集';
    if(kind==='money'){headers=LANG==='en'?['Date','Type','Category','Amount','Note']:['日期','类型','分类','金额','备注'];rows=sortedRecords('money').map(r=>[r.date,t(r.data.flow==='income'?'收入':'支出'),t(r.data.category),r.data.amount,r.sample?translateText(r.data.note||''):r.data.note||'']);name=LANG==='en'?'transactions':'记账流水';}
    else{headers=LANG==='en'?['Date','Weight (kg)','Body fat (%)','Calories (kcal)','Exercise (min)','Note']:['日期','体重(kg)','体脂率(%)','摄入热量(kcal)','运动分钟','备注'];rows=sortedRecords('fitness').map(r=>[r.date,r.data.weight||'',r.data.bodyFat||'',r.data.calories||'',r.data.duration||'',r.sample?translateText(r.data.note||''):r.data.note||'']);name=LANG==='en'?'fitness-log':'减脂记录';}
    const html=`<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>${rows.map(row=>`<tr>${row.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;downloadBlob(html,'application/vnd.ms-excel',`${name}-${isoDate()}.xls`);toast('Excel 已导出');
  }

  /* ================= 账单 Excel 导入 =================
     目标表格结构：账单日期(datetime) | 分类筛选(枚举) | 记账分类(枚举) | 收支类型(支出|收入) | 备注(可空) | 金额(文本)
     校验规则：表头缺失/文件损坏→失败提示；金额必须为正数；日期必须合法；收支类型仅支出/收入。
     去重规则：同「日期+收支类型+记账分类+备注+金额」视为重复，整表已存在则中止，部分重复自动跳过。 */
  function parseBillXlsx(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('文件读取失败，请重新选择'));
      reader.onload=()=>{
        try{
          const wb=XLSX.read(new Uint8Array(reader.result),{type:'array',cellDates:false});
          const sheetName=wb.SheetNames[0];if(!sheetName)throw new Error('表格为空，没有工作表');
          const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:'',raw:true});
          if(!rows.length)throw new Error('表格中没有数据行');
          resolve(rows);
        }catch(error){reject(error);}
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function excelDateToISO(value,rowNo){
    // 兼容：日期对象 / Excel 序列号(1900 起算) / 'YYYY-MM-DD[ HH:mm:ss]' / 'YYYY/M/D[ H:m]' 字符串
    if(value instanceof Date&&!isNaN(value))return isoDate(value);
    if(typeof value==='number'&&isFinite(value)&&value>0&&value<80000){
      const days=Math.floor(value),ms=Math.round((value-days)*86400000);
      return isoDate(new Date(Date.UTC(1899,11,30)+days*86400000+ms));
    }
    const text=String(value||'').trim();
    if(!text)return null;
    const match=text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    if(!match)return null;
    const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    return isNaN(d)?null:isoDate(d);
  }

  function parseImportRow(row,rowNo){
    const errors=[];
    const date=excelDateToISO(row['账单日期'],rowNo);
    if(!date)errors.push(`第 ${rowNo} 行：账单日期无效「${String(row['账单日期']??'').trim()}」`);
    const flowText=String(row['收支类型']??'').trim();
    const flow=flowText==='收入'?'income':flowText==='支出'?'expense':null;
    if(!flow)errors.push(`第 ${rowNo} 行：收支类型必须是“支出”或“收入”`);
    const amountText=String(row['金额']??'').trim().replace(/[¥,\s元]/g,'');
    const amount=Number(amountText);
    if(!amountText||!isFinite(amount)||amount<=0)errors.push(`第 ${rowNo} 行：金额无效「${String(row['金额']??'').trim()}」`);
    const rawCategory=String(row['记账分类']??'').trim()||String(row['分类筛选']??'').trim();
    const categoryMap=flow==='income'?IMPORT_CATEGORY_MAP_INCOME:IMPORT_CATEGORY_MAP_EXPENSE;
    const category=categoryMap[rawCategory]||'其他';
    const note=String(row['备注']??'').trim();
    if(errors.length)return{errors};
    return{date,flow,amount,category,note};
  }

  async function importMoneyExcel(file){
    if(!file)return;
    const nameExt=(file.name||'').toLowerCase();
    if(!/\.(xlsx|xls)$/.test(nameExt))return toast('请选择 .xlsx 或 .xls 格式的账单表格');
    try{
      const rows=await parseBillXlsx(file);
      let parsed=0,invalid=0,firstError='';
      const incoming=[];
      rows.forEach((row,index)=>{
        const result=parseImportRow(row,index+2);
        if(result.errors){invalid++;if(!firstError)firstError=result.errors[0];return;}
        parsed++;incoming.push(result);
      });
      if(!parsed){
        toast(invalid?`导入失败：${invalid} 行数据无效（${firstError}）`:'导入失败：没有可导入的有效数据');
        return;
      }
      // 文件内部重复（同一行完全一致的去重提示，不影响导入）
      const seen=new Set();
      incoming.forEach(item=>{
        const key=`${item.date}|${item.flow}|${item.category}|${item.note}|${item.amount}`;
        if(seen.has(key))item.dupInFile=true;else seen.add(key);
      });
      const fresh=incoming.filter(item=>!item.dupInFile);
      // 与已有账目去重：同「日期+收支类型+分类+备注+金额」视为重复
      const existingKeys=new Set(state.records.filter(r=>r.type==='money'&&!r.sample).map(r=>`${r.date}|${r.data.flow}|${r.data.category}|${r.data.note||''}|${r.data.amount}`));
      const unique=fresh.filter(item=>!existingKeys.has(`${item.date}|${item.flow}|${item.category}|${item.note}|${item.amount}`));
      const skipped=fresh.length-unique.length;
      if(!unique.length){
        toast(`导入取消：${fresh.length} 条账单均已存在，未重复导入`);
        return;
      }
      unique.forEach(item=>{
        const record={id:uid(),type:'money',date:item.date,createdAt:Date.now(),sample:false,data:{flow:item.flow,amount:item.amount,category:item.category,note:item.note}};
        state.records.push(record);pushMoney(record);
      });
      state.settings.recordsSinceExport=Number(state.settings.recordsSinceExport||0)+unique.length;
      state.settings.moneySinceExport=Number(state.settings.moneySinceExport||0)+unique.length;
      const saved=saveState();renderAll();
      let message=`导入成功：新增 ${unique.length} 条账单`;
      if(skipped)message+=`，跳过重复 ${skipped} 条`;
      if(invalid)message+=`，无效 ${invalid} 行`;
      toast(message);
      if(!saved)toast('保存失败：数据仅存在于当前页面，请清理存储空间');
    }catch(error){
      console.error('[import-money]',error);
      toast(`导入失败：${error&&error.message?error.message:'表格无法解析，请确认是有效的 Excel 账单文件'}`);
    }
  }

  function compressCover(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('封面读取失败'));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('封面格式不支持'));image.onload=()=>{const maxWidth=360,maxHeight=480,ratio=Math.min(maxWidth/image.width,maxHeight/image.height,1),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.72));};image.src=reader.result;};reader.readAsDataURL(file);});}

  function resetMediaCover(){pendingMediaCover='';const input=document.getElementById('mediaCoverInput'),preview=document.getElementById('mediaCoverPreview');input.value='';input.closest('.cover-upload').classList.remove('has-cover');preview.style.backgroundImage='';}

  function bindForms(){
    document.querySelectorAll('form[data-draft]').forEach(form=>form.addEventListener('input',()=>{state.drafts[form.dataset.draft]=serializeForm(form);const saved=saveState(true);const status=document.querySelector(`[data-draft-for="${form.dataset.draft}"]`);if(status){status.textContent=saved?'草稿已保存':'草稿保存失败';if(saved)setTimeout(()=>status.textContent='草稿自动保存',900);}}));
    document.getElementById('moneyForm').addEventListener('change',e=>{if(e.target.name==='flow')updateMoneyCategories();});
    document.getElementById('moneyForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(!(Number(data.amount)>0))return toast('请输入有效金额');if(addRecord('money',data.date,{flow:data.flow,amount:Number(data.amount),category:data.category,note:data.note.trim()}))clearDraft(e.currentTarget);});
    document.getElementById('fitnessForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(!(Number(data.weight)>0))return toast('请记录今天的体重');if(addRecord('fitness',data.date,{weight:Number(data.weight),bodyFat:data.bodyFat?Number(data.bodyFat):null,calories:Number(data.calories||0),duration:Number(data.duration||0),note:data.note.trim()}))clearDraft(e.currentTarget);});
    document.getElementById('plannerForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(addRecord('planner',data.date,{title:data.title.trim(),time:data.time,priority:data.priority,list:data.list,note:data.note.trim(),remind:data.remind==='1',done:false}))clearDraft(e.currentTarget);});
    document.getElementById('homeForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));if(addRecord('home',isoDate(),{name:data.name.trim(),quantity:data.quantity.trim(),category:data.category,price:Number(data.price||0),priority:data.priority,note:data.note.trim(),bought:false}))clearDraft(e.currentTarget);});
    document.getElementById('mediaCoverInput').addEventListener('change',async e=>{const[file]=e.target.files;if(!file)return;if(file.size>12*1024*1024){toast('封面图片请控制在 12MB 以内');e.target.value='';return;}try{pendingMediaCover=await compressCover(file);const preview=document.getElementById('mediaCoverPreview');preview.style.backgroundImage=`url(${pendingMediaCover})`;preview.closest('.cover-upload').classList.add('has-cover');toast('封面已压缩，可以保存了');}catch(error){toast(error.message);resetMediaCover();}});
    document.getElementById('importMoneyInput').addEventListener('change',e=>{const[file]=e.target.files;if(file)importMoneyExcel(file);e.target.value='';});
    document.getElementById('mediaForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));var newItem={id:uid(),name:data.name.trim(),type:data.type,status:data.status,rating:Number(data.rating||0),review:data.review.trim(),date:data.date,cover:pendingMediaCover,sample:false};state.mediaItems.push(newItem);pushMedia(newItem);state.settings.recordsSinceExport=Number(state.settings.recordsSinceExport||0)+1;const saved=saveState(true);renderAll();if(saved){clearDraft(e.currentTarget);resetMediaCover();toast('已加入书影音清单');}});
    document.getElementById('habitTypeSelect').addEventListener('change',e=>{const form=document.getElementById('habitSettingsForm'),isCheck=e.target.value==='check';form.elements.target.value=isCheck?'1':form.elements.target.value;form.elements.unit.value=isCheck?'次':form.elements.unit.value;document.getElementById('habitTargetFields').classList.toggle('is-check',isCheck);});
    document.getElementById('habitSettingsForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),isCheck=data.type==='check';state.habits.push({id:uid(),key:`custom-${uid()}`,name:data.name.trim(),type:data.type,target:isCheck?1:Math.max(.1,Number(data.target||1)),unit:isCheck?'次':data.unit.trim()||'次',tone:data.tone,entries:{},sample:false});const saved=saveState();renderAll();renderHabitManageList();if(saved){e.currentTarget.reset();document.getElementById('habitTypeSelect').dispatchEvent(new Event('change'));toast('新习惯已加入');}});
    document.getElementById('planSettingsForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));state.settings.weeklyPlan.push({id:uid(),group:data.group,title:data.title.trim(),note:data.note.trim()||'按自己的节奏完成',done:false});const saved=saveState();renderFitness();renderPlanManageList();if(saved){e.currentTarget.reset();toast('新计划已加入');}});
    document.getElementById('fitnessProfileForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));state.settings.fitnessProfile={...state.settings.fitnessProfile,height:Number(data.height),target:Number(data.target),age:Number(data.age),sex:data.sex,activity:Number(data.activity)};const saved=saveState();renderFitness();closeFitnessProfile();if(saved)toast('目标设置已更新');});
  }

  function updateHabit(id,operation,value){const h=state.habits.find(x=>x.id===id);if(!h)return;const today=isoDate(),current=Number(h.entries[today]||0);if(operation==='plus')h.entries[today]=current+1;if(operation==='minus')h.entries[today]=Math.max(0,current-1);if(operation==='toggle')h.entries[today]=habitDone(h)?0:1;if(operation==='quick')h.entries[today]=habitDone(h)?0:Number(h.target||1);if(operation==='number')h.entries[today]=clamp(Number(value||0),0,9999);pushHabit(h,today);const justDone=habitDone(h),saved=saveState();renderAll();if(saved&&justDone){celebrate();const name=HABIT_DEFS.some(def=>def.key===h.key)||h.sample?translateText(h.name):h.name;toast(LANG==='en'?`${name} completed — nicely done`:`${h.name}，完成得漂亮`);}}
  function toggleTask(id){const task=state.records.find(r=>r.id===id&&r.type==='planner');if(!task)return;task.data.done=!task.data.done;updateRemotePlan(task);const saved=saveState();renderAll();if(saved&&task.data.done){celebrate();toast('完成一项，心里轻一点');}}

  function bindEvents(){
    document.getElementById('brandSettingsBtn').addEventListener('click',openBrandSettings);
    document.getElementById('brandForm').addEventListener('input',updateBrandPreview);
    document.getElementById('brandForm').addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));state.settings.brand={name:data.name.trim()||'日常集',avatar:data.avatar.trim()||'日',tagline:data.tagline.trim()||'生活有迹可循',theme:data.theme||'plum'};const saved=saveState();applyBrand();closeBrandSettings();if(saved)toast('工作台外观已更新');});
    document.getElementById('brandSettings').addEventListener('click',event=>{if(event.target.id==='brandSettings')closeBrandSettings();});
    document.getElementById('habitSettings').addEventListener('click',event=>{if(event.target.id==='habitSettings')closeHabitSettings();});
    document.getElementById('planSettings').addEventListener('click',event=>{if(event.target.id==='planSettings')closePlanSettings();});
    document.getElementById('fitnessProfileSettings').addEventListener('click',event=>{if(event.target.id==='fitnessProfileSettings')closeFitnessProfile();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeBrandSettings();closeHabitSettings();closePlanSettings();closeFitnessProfile();}});
    // v3.17.35 异常隔离：单个动作失败不应升级为未捕获错误（致命浮层）
    document.addEventListener('click',event=>{try{
      const nav=event.target.closest('[data-nav]');if(nav){const sub=nav.dataset.workSub;if(sub){switchView('work');if(typeof window.__workSubActivate==='function')window.__workSubActivate(sub);}else{switchView(nav.dataset.nav);}return;}
      const quick=event.target.closest('[data-quick]');if(quick){switchView(quick.dataset.quick);setTimeout(()=>document.querySelector(`#view-${quick.dataset.quick} input:not([type="radio"])`)?.focus(),200);}
      const action=event.target.closest('[data-action]');if(!action)return;const id=action.dataset.id,type=action.dataset.action;
      if(type==='delete')deleteRecord(id);if(type==='toggle-task')toggleTask(id);
      if(type==='habit-plus')updateHabit(id,'plus');if(type==='habit-minus')updateHabit(id,'minus');if(type==='habit-toggle')updateHabit(id,'toggle');if(type==='habit-quick')updateHabit(id,'quick');
      if(type==='toggle-plan'){const item=state.settings.weeklyPlan.find(x=>x.id===id);if(item){item.done=!item.done;const saved=saveState();renderFitness();if(saved&&item.done)celebrate();}}
      if(type==='delete-habit-custom'){const habit=state.habits.find(h=>h.id===id);if(habit&&confirm(LANG==='en'?`Delete the habit “${habit.name}” and all of its history?`:`确定删除习惯“${habit.name}”吗？历史打卡也会一起删除。`)){state.habits=state.habits.filter(h=>h.id!==id);if(HABIT_DEFS.some(def=>def.key===habit.key)){state.settings.hiddenHabitKeys=[...new Set([...(state.settings.hiddenHabitKeys||[]),habit.key])];}const saved=saveState();renderAll();renderHabitManageList();if(saved)toast('习惯已删除');}}
      if(type==='delete-plan'){const item=state.settings.weeklyPlan.find(x=>x.id===id);if(item&&confirm(LANG==='en'?`Delete the plan “${item.title}”?`:`确定删除计划“${item.title}”吗？`)){state.settings.weeklyPlan=state.settings.weeklyPlan.filter(x=>x.id!==id);const saved=saveState();renderFitness();renderPlanManageList();if(saved)toast('计划已删除');}}
      if(type==='toggle-shopping'){const item=state.records.find(r=>r.id===id&&r.type==='home');if(item){item.data.bought=!item.data.bought;item.data.boughtDate=item.data.bought?isoDate():null;updateRemoteShopping(item);const saved=saveState();renderAll();if(saved&&item.data.bought){celebrate();toast('买到了，已移入完成');}}}
      if(type==='delete-media'){const item=state.mediaItems.find(media=>media.id===id);if(item&&confirm(LANG==='en'?`Remove “${item.name}” from the list?`:`确定从清单中删除“${item.name}”吗？`)){if(item.remoteId)deleteRemoteMedia(item.remoteId);state.mediaItems=state.mediaItems.filter(media=>media.id!==id);const saved=saveState();renderMedia();if(saved)toast('已从书影音清单移除');}}
      if(type==='open-habit-settings')openHabitSettings();if(type==='close-habit-settings')closeHabitSettings();if(type==='open-plan-settings')openPlanSettings();if(type==='close-plan-settings')closePlanSettings();if(type==='open-fitness-profile')openFitnessProfile();if(type==='close-fitness-profile')closeFitnessProfile();
      if(type==='export-money')exportExcel('money');if(type==='export-fitness')exportExcel('fitness');if(type==='import-money'){const input=document.getElementById('importMoneyInput');if(input)input.click();}if(type==='close-brand')closeBrandSettings();if(type==='reset-brand'){state.settings.brand={name:'日常集',avatar:'日',tagline:'生活有迹可循',theme:'plum'};saveState();applyBrand();openBrandSettings();toast('已恢复默认外观');}
      }catch(err){console.warn('[life] action failed:',err&&err.message);}
    });
    document.addEventListener('change',event=>{if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);});
    document.getElementById('budgetInput').addEventListener('change',e=>{state.settings.budget=Math.max(0,Number(e.target.value||0));const saved=saveState();renderAll();if(saved)toast('月度预算已更新');});
    document.getElementById('moneyFilter').addEventListener('change',e=>{state.settings.moneyFilter=e.target.value;saveState();renderMoney();});
    document.getElementById('plannerFilters').addEventListener('click',e=>{const b=e.target.closest('[data-planner-filter]');if(!b)return;state.settings.plannerFilter=b.dataset.plannerFilter;saveState();renderPlanner();});
    // 周历导航：上一周 / 本周 / 下一周
    const plannerWeekNav=document.getElementById('plannerWeekNav');
    if(plannerWeekNav)plannerWeekNav.addEventListener('click',e=>{const b=e.target.closest('[data-planner-week]');if(!b)return;plannerWeekOffset=b.dataset.plannerWeek==='prev'?plannerWeekOffset-1:b.dataset.plannerWeek==='next'?plannerWeekOffset+1:0;plannerWeekPicked=null;saveState();renderPlanner();});
    // 周历日期点选：点击显示当天日程，再点取消
    document.getElementById('weekStrip').addEventListener('click',e=>{const d=e.target.closest('[data-planner-day]');if(!d)return;plannerWeekPicked=plannerWeekPicked===d.dataset.plannerDay?null:d.dataset.plannerDay;renderPlanner();});
    document.getElementById('shoppingFilters').addEventListener('click',e=>{const b=e.target.closest('[data-shopping-filter]');if(!b)return;state.settings.shoppingFilter=b.dataset.shoppingFilter;saveState();renderHome();});
    document.getElementById('archiveFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.settings.archiveFilter=b.dataset.filter;saveState();renderArchive();});
    document.querySelectorAll('[data-media-view]').forEach(button=>button.addEventListener('click',()=>{state.settings.mediaView=button.dataset.mediaView;saveState();renderMedia();}));
    document.getElementById('mediaStatusFilter').addEventListener('change',e=>{state.settings.mediaStatusFilter=e.target.value;saveState();renderMedia();});
    document.getElementById('mediaRatingFilter').addEventListener('change',e=>{state.settings.mediaRatingFilter=Number(e.target.value);saveState();renderMedia();});
    var retryBtn = document.getElementById('syncRetryBtn');
    if(retryBtn) retryBtn.addEventListener('click', retrySync);
    document.getElementById('clearSamplesBtn').addEventListener('click',()=>{const recordSamples=state.records.filter(r=>r.sample).length,mediaSamples=state.mediaItems.filter(item=>item.sample).length,sampleCount=recordSamples+mediaSamples;if(!sampleCount&&!state.habits.some(h=>h.sample))return;if(!confirm(`将清空 ${sampleCount} 条示例记录和示例打卡，你自己的内容（含自建计划）会完整保留。是否继续？`))return;state.records=state.records.filter(r=>!r.sample);state.mediaItems=state.mediaItems.filter(item=>!item.sample);state.habits.forEach(h=>{if(h.sample){h.entries={};h.sample=false;}});const saved=saveState();renderAll();if(saved)toast('示例内容已清空');});
    window.addEventListener('storage',e=>{if(e.key!==STORAGE_KEY||!e.newValue)return;try{state=normalizeState(JSON.parse(e.newValue));renderAll();toast('另一个页面的数据已同步');}catch{}});
  }

  /* ===== 卡片式输入区统一折叠（v3.17.29）=====
     所有 .form-panel（记账/体重/日程/待买/书影音）头部注入 chevron，
     点击 panel-head 切换展开/收起；折叠状态按面板 id 持久化到 state.settings.collapsedPanels。
     由于 bindEvents 只执行一次而 renderAll 是纯重渲染，面板事件用 document 级委托 + 一次性初始化。 */
  let formPanelTogglesInitialized=false;
  function initFormPanelToggles(){
    if(formPanelTogglesInitialized)return;
    formPanelTogglesInitialized=true;
    const apply=(panel,on)=>{panel.classList.toggle('collapsed',on);};
    document.querySelectorAll('.form-panel').forEach(panel=>{
      const head=panel.querySelector('.panel-head');
      if(!head)return;
      const titleWrap=head.querySelector('div');
      let chevron=document.createElement('i');
      chevron.className='collapse-chevron';
      chevron.setAttribute('aria-hidden','true');
      chevron.innerHTML=icon('i-chevron');
      if(titleWrap)titleWrap.appendChild(chevron);
      head.setAttribute('role','button');
      head.setAttribute('tabindex','0');
      head.setAttribute('aria-expanded','true');
      const key=panel.id||head.querySelector('h2')?.textContent?.trim()||'panel';
      const savedCollapsed=state.settings.collapsedPanels&&state.settings.collapsedPanels[key];
      apply(panel,!!savedCollapsed);
      head.setAttribute('aria-expanded',String(!savedCollapsed));
      head.addEventListener('click',event=>{
        if(event.target.closest('button,input,select,label,textarea,a'))return;
        const on=!panel.classList.contains('collapsed');
        apply(panel,on);
        if(!state.settings.collapsedPanels)state.settings.collapsedPanels={};
        state.settings.collapsedPanels[key]=on;
        head.setAttribute('aria-expanded',String(!on));
        saveState();
      });
      head.addEventListener('keydown',event=>{
        if(event.key!=='Enter'&&event.key!==' ')return;
        event.preventDefault();
        head.click();
      });
    });
  }


  function init(){subscribeUpdates();setSyncState('syncing', LANG==='en' ? 'Syncing…' : '同步中…');const now=new Date(),weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];document.getElementById('todayLabel').textContent=LANG==='en'?new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',weekday:'long'}).format(now):`${now.getMonth()+1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;setDateDefaults();updateMoneyCategories();restoreDrafts();bindForms();bindEvents();initFormPanelToggles();renderAll();switchView(document.getElementById(`view-${location.hash.slice(1)}`)?location.hash.slice(1):'dashboard');if(!dataCorrupted)saveState();pullAllRemote(function(ok){ if(ok){ saveState(); renderAll(); } });}
  // v3.17.35 markup 就绪检查：WebView 恢复 / 二次挂载等场景下，markup 可能晚于 initLife 就绪；
  // 原实现会因 getElementById 返回 null 抛错并弹出致命浮层。此处改为有限重试 + 明确告警。
  function initLife(){
    startI18n();
    initWhenReady(0);
  }
  function initWhenReady(attempt){
    if(document.getElementById('todayLabel')){init();return;}
    if(attempt>=8){console.warn("[life] 生活工作台 markup 未就绪，初始化已跳过（请重新打开应用）");return;}
    setTimeout(()=>initWhenReady(attempt+1),120);
  }
  if (typeof window !== 'undefined') {
    // v3.17.37 融合：对外暴露统一提示入口，工作模块（src/utils.js 的 showToast）委托到此处，
    // 两区域共用同一实现、同一宿主 #toast、同一套样式与时长。
    window.__lifeToast = toast;
    // 供上班日历侧（App.vue / renderer.js）反向调用，切到生活工作台的某个模块视图
    window.__lifeSwitchView = switchView;
    // 供 renderer.js 在上班数据（window.allData）同步/刷新后重渲染时光档案，使「上班」数据实时
    window.__lifeRefreshArchive = () => { renderArchive(); renderWorkToday(); };
    // 上班日历标记/待办/打卡变更后，主页「今日工作」卡片即时刷新（由各 store save 后调用）
    window.__lifeRefreshWorkToday = renderWorkToday;
  }
  export { initLife, renderAll, switchView, toast, setViewRefreshHook };
