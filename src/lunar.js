// 农历转换库 (1900-2100)
// 基于寿星万年历算法
// 已迁移为 ES 模块；经典脚本经 src/shims.js 的 window.Lunar 垫片访问。

export const Lunar = (function () {
  // 农历数据表 1900-2100
  // 每个元素的二进制位含义:
  // bit 0-3: 闰月月份 (0=无闰月)
  // bit 4-15: 12个月大小月 (1=30天, 0=29天)
  // bit 16-19: 闰月天数 (0=29天, 1=30天)
  const lunarInfo = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x05ac0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x092e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252,
    0x0d520
  ];

  const Gan = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const Zhi = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const Animals = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
  const MonthCN = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];
  const DayCN1 = ['初','初','初','初','初','初','初','初','初','初','十','十','十','十','十','十','十','十','十','二','二','二','二','二','二','二','二','二','二','三'];
  const DayCN2 = ['','一','二','三','四','五','六','七','八','九','十','一','二','三','四','五','六','七','八','九','十','一','二','三','四','五','六','七','八','九','十'];

  function dayCN(day) {
    if (day === 10) return '初十';
    if (day === 20) return '二十';
    if (day === 30) return '三十';
    return DayCN1[day - 1] + DayCN2[day];
  }

  // 返回农历 year 年的总天数
  function lunarYearDays(year) {
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) {
      sum += (lunarInfo[year - 1900] & i) ? 1 : 0;
    }
    return sum + leapDays(year);
  }

  // 返回农历 year 年闰月的天数
  function leapDays(year) {
    if (leapMonth(year)) {
      return (lunarInfo[year - 1900] & 0x10000) ? 30 : 29;
    }
    return 0;
  }

  // 返回农历 year 年闰哪个月 (0=无闰月)
  function leapMonth(year) {
    return lunarInfo[year - 1900] & 0xf;
  }

  // 返回农历 year 年 month 月的天数
  function monthDays(year, month) {
    return (lunarInfo[year - 1900] & (0x10000 >> month)) ? 30 : 29;
  }

  // 公历转农历
  function solar2lunar(year, month, day) {
    // month: 0-indexed (0=Jan), day: 1-indexed
    const baseDate = new Date(1900, 0, 31); // 农历1900年正月初一
    const objDate = new Date(year, month, day);
    let offset = Math.floor((objDate - baseDate) / 86400000);

    let lunarYear, lunarMonth, lunarDay, isLeap = false;

    // 计算农历年
    for (lunarYear = 1900; lunarYear < 2101 && offset > 0; lunarYear++) {
      let daysInYear = lunarYearDays(lunarYear);
      offset -= daysInYear;
    }
    if (offset < 0) {
      offset += lunarYearDays(--lunarYear);
    }

    // 计算农历月
    let leap = leapMonth(lunarYear);
    for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
      if (leap > 0 && lunarMonth === (leap + 1) && !isLeap) {
        --lunarMonth;
        isLeap = true;
        let daysInMonth = leapDays(lunarYear);
        offset -= daysInMonth;
      } else {
        let daysInMonth = monthDays(lunarYear, lunarMonth);
        offset -= daysInMonth;
      }
      if (isLeap && lunarMonth === (leap + 1)) isLeap = false;
    }
    if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
      if (!isLeap) {
        isLeap = true;
      } else {
        isLeap = false;
      }
    }
    if (offset < 0) {
      offset += isLeap ? leapDays(lunarYear) : monthDays(lunarYear, lunarMonth);
      --lunarMonth;
    }

    lunarDay = offset + 1;

    // 天干地支
    const ganIndex = (lunarYear - 4) % 10;
    const zhiIndex = (lunarYear - 4) % 12;
    const ganZhi = Gan[ganIndex] + Zhi[zhiIndex];
    const animal = Animals[zhiIndex];

    // 农历月名
    const monthName = (isLeap ? '闰' : '') + MonthCN[lunarMonth - 1] + '月';
    // 农历日名
    const dayName = dayCN(lunarDay);

    // 是否初一（用于显示月份）
    const isFirstDay = lunarDay === 1;

    return {
      lunarYear,
      lunarMonth,
      lunarDay,
      isLeap,
      monthName,
      dayName,
      ganZhi,
      animal,
      isFirstDay,
      // 显示文本：初一显示月名，其他显示日名
      text: isFirstDay ? monthName : dayName,
      // 完整描述
      full: `${ganZhi}${animal}年 ${monthName}${dayName}`
    };
  }

  // 获取某月第一天的农历信息（用于月视图标题）
  function getMonthLunarInfo(year, month) {
    return solar2lunar(year, month, 1);
  }

  return {
    solar2lunar,
    getMonthLunarInfo,
    dayCN,
    MonthCN
  };
})();
