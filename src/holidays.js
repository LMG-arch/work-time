// 中国法定节假日数据 2025-2027
// type: "holiday" = 放假, "workday" = 调休上班
// 已迁移为 ES 模块；经典脚本经 src/shims.js 的 window.HOLIDAYS / window.FIXED_HOLIDAYS 垫片访问。

export const HOLIDAYS = {
  // ===== 2025 =====
  // 元旦
  "2025-01-01": { name: "元旦", type: "holiday" },
  // 春节
  "2025-01-28": { name: "春节", type: "holiday" },
  "2025-01-29": { name: "春节", type: "holiday" },
  "2025-01-30": { name: "春节", type: "holiday" },
  "2025-01-31": { name: "春节", type: "holiday" },
  "2025-02-01": { name: "春节", type: "holiday" },
  "2025-02-02": { name: "春节", type: "holiday" },
  "2025-02-03": { name: "春节", type: "holiday" },
  "2025-01-26": { name: "春节调休", type: "workday" },
  "2025-02-08": { name: "春节调休", type: "workday" },
  // 清明节
  "2025-04-04": { name: "清明节", type: "holiday" },
  "2025-04-05": { name: "清明节", type: "holiday" },
  "2025-04-06": { name: "清明节", type: "holiday" },
  // 劳动节
  "2025-05-01": { name: "劳动节", type: "holiday" },
  "2025-05-02": { name: "劳动节", type: "holiday" },
  "2025-05-03": { name: "劳动节", type: "holiday" },
  "2025-05-04": { name: "劳动节", type: "holiday" },
  "2025-05-05": { name: "劳动节", type: "holiday" },
  "2025-04-27": { name: "劳动节调休", type: "workday" },
  // 端午节
  "2025-05-31": { name: "端午节", type: "holiday" },
  "2025-06-01": { name: "端午节", type: "holiday" },
  "2025-06-02": { name: "端午节", type: "holiday" },
  // 中秋+国庆
  "2025-10-01": { name: "国庆节", type: "holiday" },
  "2025-10-02": { name: "国庆节", type: "holiday" },
  "2025-10-03": { name: "国庆节", type: "holiday" },
  "2025-10-04": { name: "中秋节", type: "holiday" },
  "2025-10-05": { name: "国庆节", type: "holiday" },
  "2025-10-06": { name: "国庆节", type: "holiday" },
  "2025-10-07": { name: "国庆节", type: "holiday" },
  "2025-09-28": { name: "国庆调休", type: "workday" },
  "2025-10-11": { name: "国庆调休", type: "workday" },

  // ===== 2026 =====
  // 元旦
  "2026-01-01": { name: "元旦", type: "holiday" },
  "2026-01-02": { name: "元旦", type: "holiday" },
  "2026-01-03": { name: "元旦", type: "holiday" },
  // 春节 (2026年2月17日除夕)
  "2026-02-17": { name: "除夕", type: "holiday" },
  "2026-02-18": { name: "春节", type: "holiday" },
  "2026-02-19": { name: "春节", type: "holiday" },
  "2026-02-20": { name: "春节", type: "holiday" },
  "2026-02-21": { name: "春节", type: "holiday" },
  "2026-02-22": { name: "春节", type: "holiday" },
  "2026-02-23": { name: "春节", type: "holiday" },
  "2026-02-14": { name: "春节调休", type: "workday" },
  "2026-02-28": { name: "春节调休", type: "workday" },
  // 清明节
  "2026-04-04": { name: "清明节", type: "holiday" },
  "2026-04-05": { name: "清明节", type: "holiday" },
  "2026-04-06": { name: "清明节", type: "holiday" },
  // 劳动节
  "2026-05-01": { name: "劳动节", type: "holiday" },
  "2026-05-02": { name: "劳动节", type: "holiday" },
  "2026-05-03": { name: "劳动节", type: "holiday" },
  "2026-05-04": { name: "劳动节", type: "holiday" },
  "2026-05-05": { name: "劳动节", type: "holiday" },
  "2026-04-26": { name: "劳动节调休", type: "workday" },
  // 端午节
  "2026-06-19": { name: "端午节", type: "holiday" },
  "2026-06-20": { name: "端午节", type: "holiday" },
  "2026-06-21": { name: "端午节", type: "holiday" },
  // 中秋节
  "2026-09-25": { name: "中秋节", type: "holiday" },
  "2026-09-26": { name: "中秋节", type: "holiday" },
  // 国庆节
  "2026-10-01": { name: "国庆节", type: "holiday" },
  "2026-10-02": { name: "国庆节", type: "holiday" },
  "2026-10-03": { name: "国庆节", type: "holiday" },
  "2026-10-04": { name: "国庆节", type: "holiday" },
  "2026-10-05": { name: "国庆节", type: "holiday" },
  "2026-10-06": { name: "国庆节", type: "holiday" },
  "2026-10-07": { name: "国庆节", type: "holiday" },
  "2026-09-27": { name: "中秋节/国庆调休", type: "workday" },
  "2026-10-10": { name: "国庆调休", type: "workday" },

  // ===== 2027 =====
  // 元旦
  "2027-01-01": { name: "元旦", type: "holiday" },
  "2027-01-02": { name: "元旦", type: "holiday" },
  "2027-01-03": { name: "元旦", type: "holiday" },
  // 春节 (2027年2月6日除夕)
  "2027-02-06": { name: "除夕", type: "holiday" },
  "2027-02-07": { name: "春节", type: "holiday" },
  "2027-02-08": { name: "春节", type: "holiday" },
  "2027-02-09": { name: "春节", type: "holiday" },
  "2027-02-10": { name: "春节", type: "holiday" },
  "2027-02-11": { name: "春节", type: "holiday" },
  "2027-02-12": { name: "春节", type: "holiday" },
  "2027-01-31": { name: "春节调休", type: "workday" },
  "2027-02-14": { name: "春节调休", type: "workday" },
  // 清明节
  "2027-04-03": { name: "清明节", type: "holiday" },
  "2027-04-04": { name: "清明节", type: "holiday" },
  "2027-04-05": { name: "清明节", type: "holiday" },
  // 劳动节
  "2027-05-01": { name: "劳动节", type: "holiday" },
  "2027-05-02": { name: "劳动节", type: "holiday" },
  "2027-05-03": { name: "劳动节", type: "holiday" },
  "2027-05-04": { name: "劳动节", type: "holiday" },
  "2027-05-05": { name: "劳动节", type: "holiday" },
  "2027-04-25": { name: "劳动节调休", type: "workday" },
  // 端午节
  "2027-05-31": { name: "端午节", type: "holiday" },
  "2027-06-01": { name: "端午节", type: "holiday" },
  "2027-06-02": { name: "端午节", type: "holiday" },
  // 中秋节
  "2027-09-23": { name: "中秋节", type: "holiday" },
  "2027-09-24": { name: "中秋节", type: "holiday" },
  "2027-09-25": { name: "中秋节", type: "holiday" },
  // 国庆节
  "2027-10-01": { name: "国庆节", type: "holiday" },
  "2027-10-02": { name: "国庆节", type: "holiday" },
  "2027-10-03": { name: "国庆节", type: "holiday" },
  "2027-10-04": { name: "国庆节", type: "holiday" },
  "2027-10-05": { name: "国庆节", type: "holiday" },
  "2027-10-06": { name: "国庆节", type: "holiday" },
  "2027-10-07": { name: "国庆节", type: "holiday" },
  "2027-09-26": { name: "国庆调休", type: "workday" },
  "2027-10-09": { name: "国庆调休", type: "workday" },
};

// 固定节日（每年相同日期）
export const FIXED_HOLIDAYS = {
  "01-01": "元旦",
  "03-08": "妇女节",
  "03-12": "植树节",
  "04-01": "愚人节",
  "05-01": "劳动节",
  "05-04": "青年节",
  "06-01": "儿童节",
  "07-01": "建党节",
  "08-01": "建军节",
  "09-10": "教师节",
  "10-01": "国庆节",
  "10-31": "万圣节",
  "12-24": "平安夜",
  "12-25": "圣诞节",
};
