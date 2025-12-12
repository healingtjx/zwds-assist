// 中文注释：页面逻辑脚本
// - 负责：表单事件、调用 iztro 计算星盘、渲染概览与十二宫宫格、保存/加载

(function () {
  // 调试开关（默认输出 JSON）
  var DEBUG = true;
  function safeStringify(val) {
    try {
      var cache = new Set();
      return JSON.stringify(val, function (k, v) {
        if (typeof v === 'function') return '[Function]';
        if (typeof v === 'undefined') return null;
        if (typeof v === 'object' && v !== null) {
          if (cache.has(v)) return '[Circular]';
          cache.add(v);
        }
        return v;
      }, 2);
    } catch (e) { return String(val); }
  }
  function dlog() {
    if (!DEBUG) return;
    try {
      var args = Array.prototype.slice.call(arguments);
      if (args.length === 0) return;
      var head = typeof args[0] === 'string' ? args.shift() : '';
      var body = args.map(function (a) { return safeStringify(a); }).join(' ');
      if (head) console.log(head + ' ' + body);
      else console.log(body);
    } catch (e) {}
  }
  // 中文注释：阻止移动端“双击放大”行为（不影响单指滚动与正常点击）
  (function preventDoubleTapZoom() {
    var lastTouchEnd = 0; // 中文注释：记录上一次 touchend 时间戳
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      // 中文注释：两次 touchend 间隔小于 300ms，认为是双击，阻止默认缩放
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });
  })();
  /**
   * 将时辰索引映射为中文描述
   */
  var HOURS = [
    { name: '子时', range: '23:00~01:00' },
    { name: '丑时', range: '01:00~03:00' },
    { name: '寅时', range: '03:00~05:00' },
    { name: '卯时', range: '05:00~07:00' },
    { name: '辰时', range: '07:00~09:00' },
    { name: '巳时', range: '09:00~11:00' },
    { name: '午时', range: '11:00~13:00' },
    { name: '未时', range: '13:00~15:00' },
    { name: '申时', range: '15:00~17:00' },
    { name: '酉时', range: '17:00~19:00' },
    { name: '戌时', range: '19:00~21:00' },
    { name: '亥时', range: '21:00~23:00' },
  ];

  // DOM 获取
  var form = document.getElementById('astrolabe-form');
  var solarRow = document.getElementById('solar-row');
  var lunarRow = document.getElementById('lunar-row');
  var decadalPickerRow = document.getElementById('decadal-picker-row');
  var yearPickerRow = document.getElementById('year-picker-row');
  var decadalPicker = document.getElementById('decadalPicker');
  var yearPicker = document.getElementById('yearPicker');
  var overviewEl = document.getElementById('overview');
  var gridEl = document.getElementById('grid');
  var resetBtn = document.getElementById('resetBtn');
  var genderSelect = document.getElementById('gender'); // 中文注释：性别选择器
  var copyLineInput = document.getElementById('copyLine');
  var copyLineBtn = document.getElementById('copyLineBtn');
  var copyBlockArea = document.getElementById('copyBlock');
  var copyBlockBtn = document.getElementById('copyBlockBtn');
  var copyTopicArea = document.getElementById('copyTopic');
  var copyTopicBtn = document.getElementById('copyTopicBtn');

  // 中文注释：初始化 Air Datepicker（用于阳历生日日期+时间选择）
  (function initAirDatepicker() {
    try {
      var solarInput = document.getElementById('solarDate');
      if (!solarInput) return;
      // 保护：库未加载则跳过
      if (typeof window.AirDatepicker !== 'function') {
        dlog('AirDatepicker 未加载，保持原生输入', {});
        return;
      }
      var picker = new window.AirDatepicker(solarInput, {
        timepicker: false,           // 仅选择到“日”，不选择时间
        autoClose: true,             // 选择后自动关闭
        dateFormat: 'yyyy-MM-dd',    // 格式：仅日期
        // 中文注释：中文本地化
        locale: {
          days: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'],
          daysShort: ['日','一','二','三','四','五','六'],
          daysMin: ['日','一','二','三','四','五','六'],
          months: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
          monthsShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
          today: '今天',
          clear: '清除',
          dateFormat: 'yyyy-MM-dd',
          firstDay: 1
        },
        // 中文注释：仅日期选择，不同步时辰索引（时辰由下拉框选择）
      });
      // 设置默认值为当前时间，保持与原逻辑一致（便于初次排盘）
      try { picker.selectDate(new Date()); } catch (e) {}
      dlog('AirDatepicker 初始化完成', {});
    } catch (e) {
      dlog('AirDatepicker 初始化失败', e);
    }
  })();

  /**
   * 切换日期类型显示
   */
  form.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'dateType') {
      var type = e.target.value;
      if (type === 'solar') {
        solarRow.classList.remove('hidden');
        lunarRow.classList.add('hidden');
      } else {
        solarRow.classList.add('hidden');
        lunarRow.classList.remove('hidden');
      }
    }
    if (e.target && e.target.name === 'divType') {
      var divType = e.target.value;
      if (yearPickerRow) yearPickerRow.classList.toggle('hidden', divType !== 'year');
      if (decadalPickerRow) decadalPickerRow.classList.toggle('hidden', divType !== 'decadal');
    }
  });

  /**
   * 表单提交：调用 iztro 进行排盘
   */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      var formData = readForm();
      var astrolabe = computeAstrolabe(formData);
      // 合并策略：以当前表单为主，缺失字段从上一次选择补全
      var lastPl = window.__last_payload__ || {};
      var merged = Object.assign({}, formData);
      merged.divType = merged.divType || lastPl.divType || 'life';
      if (merged.divType === 'year') {
        if (typeof merged.targetYear !== 'number') {
          merged.targetYear = (typeof lastPl.targetYear === 'number') ? lastPl.targetYear : (new Date().getFullYear());
        }
      } else if (merged.divType === 'decadal') {
        var curAge = astrolabe.virtualAge || deriveAge(astrolabe);
        if (typeof merged.targetAge !== 'number') {
          merged.targetAge = (typeof lastPl.targetAge === 'number') ? lastPl.targetAge : curAge;
        }
      } else {
        merged.targetYear = null;
        merged.targetAge = null;
      }
      window.__last_payload__ = merged; // 更新最近一次选择，避免回跳
      renderAll(astrolabe, merged);
    } catch (err) {
      alert('排盘失败：' + (err && err.message ? err.message : String(err)));
      console.error(err);
    }
  });

  /**
   * 重置表单与结果（若按钮存在）
   */
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      form.reset();
      overviewEl.innerHTML = '';
      gridEl.innerHTML = '';
    });
  }
  // 中文注释：监听性别变化，按当前范围选择重算星盘并保持选择项
  if (genderSelect) {
    genderSelect.addEventListener('change', function () {
      try {
        var formData = readForm();
        var lastPl = window.__last_payload__ || {};
        var astNew = computeAstrolabe(formData);
        var pl = Object.assign({}, lastPl, formData);
        // 中文注释：若当前是流年或大限，保留对应目标值
        if (pl.divType !== 'year') pl.targetYear = null;
        if (pl.divType !== 'decadal') pl.targetAge = null;
        window.__last_payload__ = pl;
        renderAll(astNew, pl);
      } catch (e) {}
    });
  }

  // 中文注释：全局提示框（Toast）实现
  var __toastEl__ = null;
  function ensureToastEl() {
    if (__toastEl__) return __toastEl__;
    var el = document.createElement('div');
    el.id = 'globalToast';
    el.className = 'toast';
    document.body.appendChild(el);
    __toastEl__ = el;
    return el;
  }
  function showToast(msg, type) {
    try {
      var el = ensureToastEl();
      el.textContent = String(msg || '');
      el.classList.remove('success', 'error', 'show');
      if (type === 'error') el.classList.add('error'); else el.classList.add('success');
      void el.offsetWidth; // 强制重绘以触发过渡动画
      el.classList.add('show');
      clearTimeout(el.__timer__);
      el.__timer__ = setTimeout(function () { el.classList.remove('show'); }, 2000);
    } catch (e) { console.log('toast 显示失败', e); }
  }

  function copyText(str) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(String(str || '')).then(function(){ showToast('已复制', 'success'); }).catch(function(){ showToast('复制失败', 'error'); });
      } else {
        var ta = document.createElement('textarea');
        ta.value = String(str || '');
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); showToast('已复制', 'success'); } catch (e) { showToast('复制失败', 'error'); }
        document.body.removeChild(ta);
      }
    } catch (e) { showToast('复制失败', 'error'); }
  }

  if (copyLineBtn && copyLineInput) {
    copyLineBtn.addEventListener('click', function(){ copyText(copyLineInput.value); });
  }
  if (copyBlockBtn && copyBlockArea) {
    copyBlockBtn.addEventListener('click', function(){ copyText(copyBlockArea.value); });
  }
  if (copyTopicBtn && copyTopicArea) {
    copyTopicBtn.addEventListener('click', function(){ copyText(copyTopicArea.value); });
  }

  // 中文注释：第三步主题选择，点击切换预设提示词
  var topicPicker = document.getElementById('topicPicker');
  var TOPIC_TEMPLATES = {
    '婚姻': [
      '我的婚姻是否和谐？请结合夫妻宫和福德宫分析。',
    ].join('\n'),
    '事业': [
      '今年我在工作中是否会遇到对事业有重大影响的贵人？',
    ].join('\n'),
    '财运': [
      '我的财运如何？请结合财帛宫和田宅宫分析。',
    ].join('\n'),
    '健康': [
      '我的健康需要注意哪些方面？请结合疾厄宫和命宫分析。',
    ].join('\n'),
    '学业': [
      '我的考试运如何？请结合文昌、文曲星和官禄宫分析。',
    ].join('\n'),
  };
  if (topicPicker) {
    var topicItems = topicPicker.querySelectorAll('.pick-item');
    topicItems.forEach(function (el) {
      el.addEventListener('click', function () {
        var topic = el.dataset.topic || '';
        var tpl = TOPIC_TEMPLATES[topic] || '';
        if (copyTopicArea) copyTopicArea.value = tpl;
        topicItems.forEach(function (n) { n.classList.remove('active'); });
        el.classList.add('active');
        showToast('已选择：' + topic, 'success');
      });
    });
    // 中文注释：默认选中项（若存在 active），初始化文本
    var def = topicPicker.querySelector('.pick-item.active');
    if (def && copyTopicArea) {
      var topicDef = def.dataset.topic || '';
      var tplDef = TOPIC_TEMPLATES[topicDef] || '';
      copyTopicArea.value = tplDef;
    }
  }
  /**
   * 快捷键：Shift+L 保存当前星盘
   */
  document.addEventListener('keydown', function (e) {
    if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      try {
        var data = window.__last_astrolabe__;
        if (!data) {
          alert('当前没有可保存的星盘，请先排盘');
          return;
        }
        localStorage.setItem('astrolabe:last', JSON.stringify(data));
        alert('已保存到本地：astrolabe:last');
      } catch (err) {
        console.error(err);
      }
    }
  });

  /**
   * 页面初始化：尝试加载最近保存的星盘
   */
  (function init() {
    try {
      var raw = localStorage.getItem('astrolabe:last');
      if (raw) {
        var astrolabe = JSON.parse(raw);
        renderAll(astrolabe);
      } else {
        // 中文注释：默认使用“当前日期与时辰”作为初始值，但不自动排盘
        var dtSolar = form.querySelector('input[name="dateType"][value="solar"]');
        if (dtSolar) dtSolar.checked = true;
        solarRow.classList.remove('hidden');
        lunarRow.classList.add('hidden');
        var solarInput = document.getElementById('solarDate');
        if (solarInput) {
          var now = new Date();
          var y = now.getFullYear();
          var m = String(now.getMonth() + 1).padStart(2, '0');
          var d = String(now.getDate()).padStart(2, '0');
          solarInput.value = y + '-' + m + '-' + d;
        }
        var hourSelect = document.getElementById('hourIndex');
        if (hourSelect) {
          var hh = (new Date()).getHours();
          var hourIdx = (hh === 23 || hh === 0) ? 0 : Math.floor((hh + 1) / 2);
          hourSelect.value = String(hourIdx); // 中文注释：按当前小时换算对应时辰索引（子=0…亥=11）
        }
        var genderSelect = document.getElementById('gender');
        if (genderSelect) genderSelect.value = '男';
        // 中文注释：初始化时在复制区展示操作提示，并生成默认宫格
        if (copyBlockArea) copyBlockArea.value = '欢迎使用紫微斗数提示词生成！提供您的出生年月日时（阳历/阴历）及性别，确认信息后点击【排盘分析】按钮，立即获取专属命盘提示词。';
        var payload = readForm();
        var astrolabeDefault = computeAstrolabe(payload);
        renderAll(astrolabeDefault, { __init__: true });
      }
    } catch (err) {
      console.warn('加载本地星盘失败', err);
    }
  })();

  // 全局测试函数：检查小限高亮状态
  window.testXiaoxian = function() {
    var astrolabe = window.__last_astrolabe__;
    if (!astrolabe) {
      console.error('没有星盘数据，请先排盘');
      return;
    }
    console.log('=== 小限高亮测试（使用虚岁） ===');
    console.log('1. 周岁:', astrolabe.actualAge);
    console.log('2. 虚岁:', astrolabe.virtualAge);
    console.log('3. 当前使用年龄:', astrolabe.virtualAge || astrolabe.actualAge, '（虚岁优先）');
    console.log('4. 所有宫位的小限年龄:');
    var currentAge = astrolabe.virtualAge || astrolabe.actualAge;
    astrolabe.palaces.forEach(function(p) {
      var hasCurrentAge = p.ages && p.ages.indexOf(currentAge) !== -1;
      console.log('  ', p.name, '(索引', p.index + '):', p.ages, hasCurrentAge ? '<-- 当前虚岁匹配' : '');
    });
    console.log('5. 具有 xiaoxian-active 类的元素:');
    var activeElems = document.querySelectorAll('.xiaoxian-active');
    console.log('  找到', activeElems.length, '个元素');
    activeElems.forEach(function(el) {
      console.log('  -', el.dataset.palaceName, '（order:', el.dataset.palaceOrder, '）');
    });
    if (activeElems.length === 0) {
      console.error('⚠️ 没有找到高亮的宫位！');
      console.log('尝试重新高亮...');
      highlightCurrentXiaoxian(astrolabe);
    }
  };

  /**
   * 读取表单数据
   */
  function readForm() {
    var dateType = form.querySelector('input[name="dateType"]:checked').value;
    // 中文注释：兼容 Air Datepicker 的“日期+时间”格式，仅提取日期部分传入引擎
    var solarDateRaw = document.getElementById('solarDate').value;
    var solarDate = (function (s) {
      if (!s) return '';
      var parts = String(s).split(' ');
      return parts[0]; // 仅返回 'yyyy-MM-dd'
    })(solarDateRaw);
    var lunarDate = document.getElementById('lunarDate').value;
    var isLeapMonth = document.getElementById('isLeapMonth').checked;
    var hourIndex = Number(document.getElementById('hourIndex').value);
    var gender = document.getElementById('gender').value;
    var divType = (function(){ var r = form.querySelector('input[name="divType"]:checked'); return r ? r.value : 'life'; })();
    var targetYearVal = document.getElementById('targetYear') ? document.getElementById('targetYear').value : '';
    var targetAgeVal = document.getElementById('targetAge') ? document.getElementById('targetAge').value : '';
    var targetYear = targetYearVal ? Number(targetYearVal) : null;
    var targetAge = targetAgeVal ? Number(targetAgeVal) : null;

    return { dateType: dateType, solarDate: solarDate, lunarDate: lunarDate, isLeapMonth: isLeapMonth, hourIndex: hourIndex, gender: gender, divType: divType, targetYear: targetYear, targetAge: targetAge };
  }

  /**
   * 计算虚岁（根据出生日期和当前日期）
   * 公式：虚岁 = 当前年份（公历） - 出生年份（公历） + 1
   * 注意：
   * 1. 出生即 1 岁
   * 2. 每过一个农历新年（春节）加 1 岁
   * 3. 为简化，此处使用公历年份近似计算（误差在春节前后几天）
   */
  function calculateVirtualAge(solarDateStr) {
    if (!solarDateStr) return null;
    try {
      var parts = solarDateStr.split('-');
      if (parts.length !== 3) return null;
      var birthYear = parseInt(parts[0], 10);
      var currentYear = new Date().getFullYear();
      var virtualAge = currentYear - birthYear + 1;
      dlog('虚岁计算', { solarDate: solarDateStr, birthYear: birthYear, currentYear: currentYear, virtualAge: virtualAge });
      return virtualAge;
    } catch (e) {
      console.error('虚岁计算失败', e);
      return null;
    }
  }

  /**
   * 计算周岁（根据出生日期和当前日期）
   * 公式：周岁 = 当前年份 - 出生年份，但需考虑是否过生日
   */
  function calculateActualAge(solarDateStr) {
    if (!solarDateStr) return null;
    try {
      var parts = solarDateStr.split('-');
      if (parts.length !== 3) return null;
      var birthYear = parseInt(parts[0], 10);
      var birthMonth = parseInt(parts[1], 10) - 1; // 月份从0开始
      var birthDay = parseInt(parts[2], 10);
      
      var birthDate = new Date(birthYear, birthMonth, birthDay);
      var now = new Date();
      
      var age = now.getFullYear() - birthDate.getFullYear();
      var monthDiff = now.getMonth() - birthDate.getMonth();
      
      // 如果还没有过生日，年龄减1
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
        age -= 1;
      }
      
      dlog('周岁计算', { solarDate: solarDateStr, birthYear: birthYear, actualAge: age });
      return age >= 0 ? age : null;
    } catch (e) {
      console.error('周岁计算失败', e);
      return null;
    }
  }

  /**
   * 计算星盘（调用 iztro）
   */
  function computeAstrolabe(payload) {
    if (!window.iztro || !window.iztro.astro) throw new Error('未加载 iztro 库');
    var daylightSaving = true; // 默认开启夏令时兼容（与官方示例一致）

    var res = null;
    if (payload.dateType === 'solar') {
      if (!payload.solarDate) throw new Error('请填写阳历生日');
      // 通过阳历获取完整星盘（含 index/ages）
      res = window.iztro.astro.astrolabeBySolarDate(payload.solarDate, payload.hourIndex, payload.gender, daylightSaving, 'zh-CN');
    } else {
      if (!payload.lunarDate) throw new Error('请填写农历生日');
      // 通过农历获取完整星盘（内部转换为阳历）
      res = window.iztro.astro.astrolabeByLunarDate(payload.lunarDate, payload.hourIndex, payload.gender, payload.isLeapMonth, daylightSaving, 'zh-CN');
    }
    
    // 计算虚岁和周岁并添加到结果中
    if (res && res.solarDate) {
      res.virtualAge = calculateVirtualAge(res.solarDate);
      // 计算周岁：直接根据阳历日期计算实际年龄
      res.actualAge = calculateActualAge(res.solarDate);
      dlog('星盘计算完成', { 
        solarDate: res.solarDate, 
        age: res.age, 
        actualAge: res.actualAge,
        virtualAge: res.virtualAge 
      });
      // 补充：使用功能接口计算当前日期的 decadal/yearly 索引
      try {
        if (typeof res.horoscope === 'function') {
          var now = new Date();
          var hs = res.horoscope(now);
          if (hs && hs.decadal) res.decadal = hs.decadal;
          if (hs && hs.yearly) res.yearly = hs.yearly;
          dlog('补充 horoscope 成功（当前年）', { date: now.toISOString(), decadal: res.decadal, yearly: res.yearly });
        } else {
          dlog('horoscope 方法不可用，跳过补充');
        }
      } catch (e) {
        dlog('补充 horoscope 失败', e);
      }
    }
    
    return res;
  }

  /**
   * 渲染概览与宫格
   */
  function renderAll(astrolabe, payload) {
    window.__last_astrolabe__ = astrolabe; // 缓存最近一次结果用于保存
    window.__last_payload__ = payload; // 缓存请求参数
    window.__origin_mut__ = computeOriginMutagen(astrolabe); // 计算本命四化
    dlog('astrolabe overview', {
      age: astrolabe.age,
      decadal: astrolabe.decadal,
      yearly: astrolabe.yearly,
    });
    renderOverview(astrolabe);
    renderGrid(astrolabe);
    renderCenter(astrolabe);
    renderPickers(astrolabe, payload);
    // 默认高亮命宫的三方四正：依据返回的 palace.index 寻找“命宫”索引
    var soulIdx = null;
    try {
      (astrolabe.palaces || []).forEach(function (p) {
        if (p && p.name === '命宫') soulIdx = Number(p.index);
      });
    } catch (e) {}
    if (soulIdx == null || isNaN(soulIdx)) soulIdx = 0;
    highlightSanfang(soulIdx);
    // 依据占卜范围应用高亮逻辑
    applyDivinationScope(astrolabe, payload);
    // 中文注释：填充复制区块（每一个宫位的三方四正）；首次进入页面渲染宫格但不覆盖提示文案
    var shouldFillCopy = !(payload && payload.__init__ === true);
    if (shouldFillCopy) {
      try {
        var text = buildCopyText(astrolabe, soulIdx);
        if (copyBlockArea) copyBlockArea.value = text;
      } catch (e) {}
    }
  }

  function renderPickers(astrolabe, payload) {
    try {
      renderDecadalPicker(astrolabe, payload);
      renderYearPicker(astrolabe, payload);
      var t = payload && payload.divType ? payload.divType : 'life';
      if (yearPickerRow) yearPickerRow.classList.toggle('hidden', t !== 'year');
      if (decadalPickerRow) decadalPickerRow.classList.toggle('hidden', t !== 'decadal');
    } catch (e) {}
  }

  function renderDecadalPicker(astrolabe, payload) {
    if (!decadalPicker) return;
    decadalPicker.innerHTML = '';
    var palaces = Array.isArray(astrolabe && astrolabe.palaces) ? astrolabe.palaces : [];
    var currentAge = astrolabe.virtualAge || deriveAge(astrolabe);
    var selectedAge = (payload && typeof payload.targetAge === 'number') ? Number(payload.targetAge) : currentAge;
    var items = [];
    palaces.forEach(function (p) {
      var rng = null;
      if (p && p.decadal && Array.isArray(p.decadal.range)) rng = p.decadal.range;
      else if (p && p.stage && Array.isArray(p.stage.range)) rng = p.stage.range;
      if (!rng) return;
      var start = Number(rng[0]);
      var end = Number(rng[1]);
      if (isNaN(start) || isNaN(end)) return;
      // 保留所有大限区间（包括 >100 岁）
      items.push({ start: start, end: end });
    });
    items.sort(function (a, b) { return a.start - b.start; });
    // 中文注释：控制选择项不超过10个，淘汰更大的（根据起始年龄升序裁剪）
    if (items.length > 10) items = items.slice(0, 10);
    items.forEach(function (it) {
      var el = document.createElement('div');
      el.className = 'pick-item-daxiang';
      el.dataset.ageStart = String(it.start);
      el.dataset.ageEnd = String(it.end);
      el.textContent = it.start + '-' + it.end;
      if (selectedAge >= it.start && selectedAge <= it.end) el.classList.add('active');
      el.addEventListener('click', function () {
        // 中文注释：点击后按当前表单（含性别）重算星盘，并保持目标年龄
        var age = Number(el.dataset.ageStart);
        var formData = readForm();
        var astNew = computeAstrolabe(formData);
        var lastPl = window.__last_payload__ || {};
        var pl = Object.assign({}, lastPl, formData, { divType: 'decadal', targetAge: age });
        window.__last_payload__ = pl;
        renderAll(astNew, pl);
        decadalPicker.querySelectorAll('.pick-item-daxiang').forEach(function (n) { n.classList.remove('active'); });
        el.classList.add('active');
      });
      decadalPicker.appendChild(el);
    });
  }

  function renderYearPicker(astrolabe, payload) {
    if (!yearPicker) return;
    var now = new Date();
    var baseYear = now.getFullYear();
    var selectedYear = (payload && typeof payload.targetYear === 'number') ? Number(payload.targetYear) : baseYear;
    // 仅首次生成年份列表并缓存
    if (!Array.isArray(window.__year_picker_years__) || window.__year_picker_years__.length === 0) {
      var list = [];
      for (var i = -6; i < 6; i++) list.push(baseYear + i);
      // 中文注释：控制选择项不超过10个，淘汰更大的（升序裁剪前10个）
      list.sort(function (a, b) { return a - b; });
      if (list.length > 10) list = list.slice(0, 10);
      window.__year_picker_years__ = list;
    }
    var years = window.__year_picker_years__;
    // 中文注释：二次保护，确保缓存年份不超过10个
    if (years.length > 10) years = years.slice(0, 10);
    // 若已渲染过，更新选中态即可
    if (yearPicker.children && yearPicker.children.length === years.length) {
      Array.prototype.forEach.call(yearPicker.children, function (child) {
        var y = Number(child.dataset.year);
        if (y === selectedYear) child.classList.add('active'); else child.classList.remove('active');
      });
      return;
    }
    // 初次渲染 DOM
    yearPicker.innerHTML = '';
    years.forEach(function (y) {
      var el = document.createElement('div');
      el.className = 'pick-item';
      el.dataset.year = String(y);
      el.textContent = String(y);
      if (y === selectedYear) el.classList.add('active');
      el.addEventListener('click', function () {
        // 中文注释：点击年份后按当前表单（含性别）重算星盘，并保持目标年份
        var yr = Number(el.dataset.year);
        var formData = readForm();
        var astNew = computeAstrolabe(formData);
        var lastPl = window.__last_payload__ || {};
        var pl = Object.assign({}, lastPl, formData, { divType: 'year', targetYear: yr });
        window.__last_payload__ = pl;
        renderAll(astNew, pl);
        yearPicker.querySelectorAll('.pick-item').forEach(function (n) { n.classList.remove('active'); });
        el.classList.add('active');
      });
      yearPicker.appendChild(el);
    });
  }

  // 依据占卜范围应用高亮逻辑
  function applyDivinationScope(astrolabe, payload) {
    var t = payload && payload.divType ? payload.divType : 'life';
    if (t === 'life') {
      highlightCurrentXiaoxian(astrolabe, null);
      highlightCurrentDecadal(astrolabe, null);
      highlightCurrentYearly(astrolabe, null);
      return;
    }
    if (t === 'year') {
      var y = payload && typeof payload.targetYear === 'number' ? payload.targetYear : (new Date().getFullYear());
      var idx = null;
      try {
        if (astrolabe && typeof astrolabe.horoscope === 'function') {
          var anchor = lunarYearAnchorDate(y);
          var hs = astrolabe.horoscope(anchor);
          if (hs && hs.yearly && typeof hs.yearly.index === 'number') idx = Number(hs.yearly.index);
          dlog('占卜-某一年 horoscope（按农历锚点）', { year: y, anchor: anchor.toISOString(), yearly: hs && hs.yearly, decadal: hs && hs.decadal });
        }
      } catch (e) { dlog('占卜-某一年 horoscope 失败', e); }
      var ageForYear = virtualAgeForYear(astrolabe && astrolabe.solarDate, y);
      dlog('占卜-某一年 年龄计算', { year: y, virtualAge: ageForYear });
      highlightCurrentXiaoxian(astrolabe, ageForYear);
      highlightCurrentDecadal(astrolabe, ageForYear);
      highlightCurrentYearly(astrolabe, idx);
      if (idx != null && !isNaN(idx)) {
        highlightSanfang(idx);
        dlog('三方四正指向流年', { year: y, orderIdx: idx });
      }
      return;
    }
    if (t === 'decadal') {
      var a = payload && typeof payload.targetAge === 'number' ? payload.targetAge : (astrolabe.virtualAge || deriveAge(astrolabe));
      // 清理流年标签与样式
      try {
        gridEl.querySelectorAll('.cell').forEach(function (el) {
          el.classList.remove('yearly-active');
          var tli = el.querySelector('.title .tag-liunian');
          if (tli && tli.parentNode) tli.parentNode.removeChild(tli);
        });
      } catch (e) {}
      // 清理小限标签与样式
      try {
        gridEl.querySelectorAll('.cell').forEach(function (el) {
          el.classList.remove('age-active');
          el.classList.remove('xiaoxian-active');
          var txi = el.querySelector('.title .tag-xiaoxian');
          if (txi && txi.parentNode) txi.parentNode.removeChild(txi);
        });
      } catch (e) {}
      // 高亮当前选择的大限
      highlightCurrentDecadal(astrolabe, a);
      // 将三方四正指向该大限所在宫位
      try {
        var palaces = Array.isArray(astrolabe && astrolabe.palaces) ? astrolabe.palaces : [];
        var targetIdx = null;
        palaces.forEach(function (p) {
          var rng = null;
          if (p && p.decadal && Array.isArray(p.decadal.range)) rng = p.decadal.range;
          else if (p && p.stage && Array.isArray(p.stage.range)) rng = p.stage.range;
          if (!rng) return;
          var s = Number(rng[0]);
          var e = Number(rng[1]);
          if (!isNaN(s) && !isNaN(e) && a >= s && a <= e) {
            targetIdx = Number(p.index);
          }
        });
        if (targetIdx != null && !isNaN(targetIdx)) {
          highlightSanfang(targetIdx);
          dlog('三方四正指向大限', { age: a, orderIdx: targetIdx });
        }
      } catch (e) {}
      return;
    }
  }

  /**
   * 概览信息渲染
   */
  function buildOverviewHTML(astrolabe) {
    var kvs = [
      ['阳历', astrolabe.solarDate],
      ['农历', astrolabe.lunarDate],
      ['四柱', astrolabe.chineseDate],
      ['时辰', astrolabe.time],
      ['时段', astrolabe.timeRange],
      ['星座', astrolabe.sign],
      ['生肖', astrolabe.zodiac],
      ['命主', astrolabe.soul],
      ['身主', astrolabe.body],
      ['五行局', astrolabe.fiveElementsClass],
      ['命宫地支', astrolabe.earthlyBranchOfSoulPalace],
      ['身宫地支', astrolabe.earthlyBranchOfBodyPalace],
    ];
    return kvs
      .map(function (kv) {
        return '<div class="kv"><div class="k">' + escapeHtml(kv[0]) + '</div><div class="v">' + escapeHtml(kv[1] || '-') + '</div></div>';
      })
      .join('');
  }
  function renderOverview(astrolabe) {
    // overviewEl.innerHTML = buildOverviewHTML(astrolabe);
  }

  /**
   * 宫格渲染（十二宫）
   */
  function renderGrid(astrolabe) {
    var PERIMETER_CELL_INDEX = [12,8,4,0,1,2,3,7,11,15,14,13];
    window.__PERIMETER_CELL_INDEX__ = PERIMETER_CELL_INDEX;

    var palaces = Array.isArray(astrolabe.palaces) ? astrolabe.palaces : [];
    var cells = new Array(16).fill(null);
    palaces.forEach(function (p) {
      var i = Number(p.index);
      if (isNaN(i) || i < 0 || i >= 12) return;
      var domIdx = PERIMETER_CELL_INDEX[i];
      cells[domIdx] = p;
    });

    gridEl.innerHTML = cells
      .map(function (p) {
        if (!p) return '<div class="cell spacer"></div>';
        var muts = palaceMutagenTags(p, window.__origin_mut__);
        var orderIdx = Number(p.index);
        return renderPalaceCell(p, muts, orderIdx);
      })
      .join('');

    // 绑定点击事件：高亮该宫的三方四正
    attachGridClick();
  }

  // 单宫渲染
  function renderPalaceCell(p, muts, orderIdx) {
    var meta = [];
    if (p.isBodyPalace) meta.push('<span class="tag">身宫</span>');
    if (p.isOriginalPalace) meta.push('<span class="tag">来因宫</span>');
    meta.push('<span class="tag">天干：' + escapeHtml(p.heavenlyStem || '-') + '</span>');
    meta.push('<span class="tag">地支：' + escapeHtml(p.earthlyBranch || '-') + '</span>');
    dlog('renderPalaceCell', { name: p.name, orderIdx: orderIdx, stage: p.stage, ages: p.ages });

    return [
      '<div class="cell" data-palace-order="' + String(orderIdx) + '" data-palace-name="' + escapeHtml(p.name) + '">',
      '<div class="title">' + escapeHtml(p.name) + '</div>',
      '<div class="meta">' + meta.join('') + '</div>',
      renderMutagenRow(muts),
      renderStars('主星', p.majorStars),
      renderStars('辅星', p.minorStars),
      renderStars('杂耀', p.adjectiveStars),
      '<div class="stars">',
      badge('长生12神：' + safeStr(p.changsheng12)),
      badge('博士12神：' + safeStr(p.boshi12)),
      badge('将前12神：' + safeStr(p.jiangqian12)),
      badge('岁前12神：' + safeStr(p.suiqian12)),
      '</div>',
      '<div class="stars">',
      badge('大限：' + getDecadalRangeFromAstrolabe(orderIdx, p)),
      badge('小限年龄：' + (Array.isArray(p.ages) ? p.ages.join(', ') : '-')),
      '</div>',
      '</div>',
    ].join('');
  }

  /**
   * 宫格点击事件：显示三方四正
   */
  function attachGridClick() {
    gridEl.onclick = function (e) {
      var cell = e.target.closest('.cell');
      if (!cell || !cell.dataset || !cell.dataset.palaceOrder) return;
      var idx = Number(cell.dataset.palaceOrder);
      highlightSanfang(idx);
    };
  }

  /**
   * 高亮指定宫位的三方四正并在中心区展示
   */
  function highlightSanfang(orderIdx) {
    var perIdx = window.__PERIMETER_CELL_INDEX__ || [];
    if (perIdx.length !== 12) return;
    // 三方（±4）、对宫（+6）
    var a = orderIdx;
    var b = (orderIdx + 4) % 12;
    var c = (orderIdx + 8) % 12;
    var d = (orderIdx + 6) % 12;
    var targets = [a, b, d, c];
    // 清除旧高亮
    var cells = gridEl.querySelectorAll('.cell');
    cells.forEach(function (el) { el.classList.remove('active'); });
    // 设置高亮
    targets.forEach(function (t) {
      var el = gridEl.querySelector('.cell[data-palace-order="' + String(t) + '"]');
      if (el) el.classList.add('active');
    });
    // 中央展示三方四正名单
    showSanfangInfo(targets);
    // 绘制虚线连接
    drawSanfangLines(targets);
    window.__last_highlight_targets__ = targets;
  }

  /**
   * 在中心层展示三方四正的宫位与主星概览
   */
  function showSanfangInfo(orderIdxList) {
    var el = document.querySelector('.center-overlay');
    if (!el) return;
    var target = el.querySelector('.sanfang-section');
    if (!target) target = el.querySelector('.center-content');
    var items = orderIdxList.map(function (idx) {
      var cell = gridEl.querySelector('.cell[data-palace-order="' + String(idx) + '"]');
      if (!cell) return null;
      var name = cell.dataset.palaceName || '';
      // 简要主星
      var starsRow = cell.querySelector('.stars'); // 第一条是"主星"行
      var mainStars = '-';
      if (starsRow) {
        var spans = starsRow.querySelectorAll('.star');
        if (spans.length > 1) {
          var names = [];
          for (var i = 1; i < spans.length; i++) names.push(spans[i].textContent.trim());
          mainStars = names.join('、');
        }
      }
      return { name: name, stars: mainStars };
    }).filter(Boolean);
    var html = '<div class="title">三方四正</div>' + items.map(function (it) {
      return '<div class="kv"><div class="k">' + escapeHtml(it.name) + '</div><div class="v">' + escapeHtml(it.stars) + '</div></div>';
    }).join('');
    if (target) target.innerHTML = html;
  }

  /**
   * 绘制三方四正虚线连接（a -> b -> d -> c -> a）
   */
  function drawSanfangLines(orderIdxList) {
    // 中文注释：按需求连线——本宫到官禄/财帛/迁移，以及官禄到财帛
    var svg = ensureLinesLayer();
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var gridRect = gridEl.getBoundingClientRect();
    var anchors = orderIdxList.map(function (idx) {
      var cell = gridEl.querySelector('.cell[data-palace-order="' + String(idx) + '"]');
      return getCellAnchorPoint(cell, gridRect);
    });
    // 期望列表为 [a(本宫), b(三方1=+4), d(对宫=+6), c(三方2=+8)]
    var a = anchors[0], b = anchors[1], d = anchors[2], c = anchors[3];
    var pairs = [
      [a, c], // 命宫→官禄
      [a, b], // 命宫→财帛
      [a, d], // 命宫→迁移
      [c, b], // 官禄→财帛
    ];
    pairs.forEach(function (pair) {
      var p1 = pair[0], p2 = pair[1];
      if (!p1 || !p2) return;
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y);
      path.setAttribute('class', 'sf-path');
      svg.appendChild(path);
    });
    // 端点圆
    [a, b, c, d].forEach(function (p) {
      if (!p) return;
      var cEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      cEl.setAttribute('cx', p.x);
      cEl.setAttribute('cy', p.y);
      cEl.setAttribute('r', 3.5);
      cEl.setAttribute('class', 'sf-point');
      svg.appendChild(cEl);
    });
  }

  /**
   * 根据命主虚岁高亮当前小限宫位（边框红色）
   * 紫微斗数使用虚岁计算
   */
  function highlightCurrentXiaoxian(astrolabe, overrideAge) {
    // 使用虚岁：当前年份 - 出生年份 + 1
    var currentAge = (typeof overrideAge === 'number' && overrideAge > 0) ? overrideAge : (astrolabe.virtualAge || deriveAge(astrolabe));
    
    if (!currentAge || currentAge < 0) {
      dlog('highlightCurrentXiaoxian: 无效年龄', { virtualAge: astrolabe.virtualAge, age: astrolabe.age });
      return;
    }
    
    dlog('highlightCurrentXiaoxian 开始', { 
      virtualAge: astrolabe.virtualAge, 
      currentAge: currentAge,
      solarDate: astrolabe.solarDate 
    });
    
    var palaces = astrolabe.palaces || [];
    var cells = gridEl.querySelectorAll('.cell');
    cells.forEach(function (el) {
      el.classList.remove('age-active');
      el.classList.remove('xiaoxian-active');
      // 清理标题中的“小限”标签
      var t = el.querySelector('.title .tag-xiaoxian');
      if (t && t.parentNode) t.parentNode.removeChild(t);
    });
    
    // 遍历所有宫位，查找包含当前虚岁的宫位
    palaces.forEach(function (p) {
      if (!Array.isArray(p.ages)) return;
      
      // 检查当前虚岁是否在该宫位的小限年龄列表中
      if (p.ages.indexOf(currentAge) !== -1) {
        var orderIdx = Number(p.index);
        dlog('找到匹配宫位', { 
          palace: p.name, 
          index: p.index, 
          orderIdx: orderIdx, 
          virtualAge: currentAge, 
          ages: p.ages 
        });
        
        if (!isNaN(orderIdx) && orderIdx >= 0) {
          var cell = gridEl.querySelector('.cell[data-palace-order="' + String(orderIdx) + '"]');
          if (cell) {
            cell.classList.add('xiaoxian-active');
            // 在标题旁添加“小限”标签徽标
            var titleEl = cell.querySelector('.title');
            if (titleEl && !titleEl.querySelector('.tag-xiaoxian')) {
              var badge = document.createElement('span');
              badge.className = 'tag tag-xiaoxian';
              badge.textContent = '小限';
              titleEl.appendChild(badge);
            }
            dlog('小限宫位高亮成功', { 
              palace: p.name, 
              orderIdx: orderIdx, 
              virtualAge: currentAge 
            });
          } else {
            dlog('未找到对应 DOM 元素', { orderIdx: orderIdx });
          }
        }
      }
    });
  }

  /**
   * 按命主虚岁高亮对应大限宫位：为标题添加“<span>大限</span>”标签
   */
  function highlightCurrentDecadal(astrolabe, overrideAge) {
    try {
      var currentAge = (typeof overrideAge === 'number' && overrideAge > 0) ? overrideAge : (astrolabe.virtualAge || deriveAge(astrolabe));
      if (!currentAge || currentAge < 0) {
        dlog('highlightCurrentDecadal: 无效年龄', { virtualAge: astrolabe.virtualAge, age: astrolabe.age });
        return;
      }
      var palaces = Array.isArray(astrolabe.palaces) ? astrolabe.palaces : [];
      // 清理旧的大限标签
      var cells = gridEl.querySelectorAll('.cell');
      cells.forEach(function (el) {
        el.classList.remove('decadal-active');
        var t = el.querySelector('.title .tag-daxian');
        if (t && t.parentNode) t.parentNode.removeChild(t);
      });
      palaces.forEach(function (p) {
        var rng = null;
        if (p && p.decadal && Array.isArray(p.decadal.range)) rng = p.decadal.range;
        else if (p && p.stage && Array.isArray(p.stage.range)) rng = p.stage.range;
        if (!rng) return;
        var start = Number(rng[0]);
        var end = Number(rng[1]);
        if (isNaN(start) || isNaN(end)) return;
        if (currentAge >= start && currentAge <= end) {
          var orderIdx = Number(p.index);
          var cell = gridEl.querySelector('.cell[data-palace-order="' + String(orderIdx) + '"]');
          if (cell) {
            var titleEl = cell.querySelector('.title');
            if (titleEl && !titleEl.querySelector('.tag-daxian')) {
              var badge = document.createElement('span');
              badge.className = 'tag tag-daxian';
              badge.textContent = '大限';
              titleEl.appendChild(badge);
            }
            dlog('大限宫位高亮成功', { palace: p.name, index: p.index, range: rng, currentAge: currentAge });
          }
        }
      });
    } catch (e) {
      dlog('highlightCurrentDecadal 错误', e);
    }
  }

  /**
   * 高亮当前流年宫位：依据 astrolabe.yearly.index，在标题旁添加“流年”标签
   */
  function highlightCurrentYearly(astrolabe, overrideIdx) {
    try {
      var y = astrolabe && astrolabe.yearly;
      var idx = (typeof overrideIdx === 'number') ? Number(overrideIdx) : ((y && typeof y.index === 'number') ? Number(y.index) : null);
      dlog('流年高亮开始', { yearly: y, idx: idx });
      if (idx == null || isNaN(idx)) {
        dlog('highlightCurrentYearly: yearly.index 缺失或非法', y);
        return;
      }
      // 清理旧的流年标签
      var cells = gridEl.querySelectorAll('.cell');
      cells.forEach(function (el) {
        el.classList.remove('yearly-active');
        var t = el.querySelector('.title .tag-liunian');
        if (t && t.parentNode) t.parentNode.removeChild(t);
      });
      // 追加标签
      var cell = gridEl.querySelector('.cell[data-palace-order="' + String(idx) + '"]');
      if (cell) {
        var titleEl = cell.querySelector('.title');
        if (titleEl && !titleEl.querySelector('.tag-liunian')) {
          var badge = document.createElement('span');
          badge.className = 'tag tag-liunian';
          badge.textContent = '流年';
          titleEl.appendChild(badge);
        }
        cell.classList.add('yearly-active');
        dlog('流年宫位高亮成功', { index: idx, palaceName: cell.dataset && cell.dataset.palaceName });
        var count = gridEl.querySelectorAll('.tag-liunian').length;
        dlog('流年标签数量统计', { count: count });
      } else {
        dlog('highlightCurrentYearly: 未找到对应 DOM', { index: idx });
      }
    } catch (e) {
      dlog('highlightCurrentYearly 错误', e);
    }
  }

  /**
   * 计算年龄：优先使用 astrolabe.age；否则根据 astrolabe.solarDate 计算
   */
  function deriveAge(astrolabe) {
    try {
      var aObj = astrolabe && astrolabe.age;
      if (aObj && typeof aObj === 'object' && typeof aObj.nominalAge === 'number' && !isNaN(aObj.nominalAge)) {
        dlog('deriveAge 使用 nominalAge', { nominalAge: aObj.nominalAge });
        return Math.floor(aObj.nominalAge);
      }
      var a = aObj;
      if (typeof a === 'number' && !isNaN(a) && a > 0) return Math.floor(a) + 1;
      var sd = astrolabe && astrolabe.solarDate;
      if (!sd) return null;
      var parts = String(sd).split('-');
      if (parts.length < 3) return null;
      var y = Number(parts[0]);
      var m = Number(parts[1]) - 1;
      var d = Number(parts[2]);
      if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
      var birth = new Date(y, m, d);
      var now = new Date();
      var age = now.getFullYear() - birth.getFullYear();
      var mm = now.getMonth() - birth.getMonth();
      if (mm < 0 || (mm === 0 && now.getDate() < birth.getDate())) age -= 1;
      var ageXu = age + 1;
      dlog('deriveAge 计算', { solarDate: sd, age: age, ageXu: ageXu });
      return age > 0 ? ageXu : null;
    } catch (e) {
      dlog('deriveAge 错误', e);
      return null;
    }
  }

  // 计算目标年份的虚岁：year - 出生年 + 1
  function virtualAgeForYear(solarDate, year) {
    try {
      if (!solarDate || !year) return null;
      var parts = String(solarDate).split('-');
      if (parts.length < 1) return null;
      var birthYear = Number(parts[0]);
      if (isNaN(birthYear)) return null;
      var ageXu = Number(year) - birthYear + 1;
      return ageXu > 0 ? ageXu : null;
    } catch (e) { return null; }
  }

  // 计算“农历年锚点”日期：用于按农历年定位流年
  // 简化策略：取公历该年的 8 月 1 日（保证处于该农历年中段，避免跨年边界）
  // 若需更严谨，可改为立春（2 月 4 日）或精确春节日期
  function lunarYearAnchorDate(year) {
    try {
      var y = Number(year);
      if (isNaN(y)) return new Date();
      return new Date(y, 7, 1); // 月份从 0 开始，7 表示 8 月
    } catch (e) {
      return new Date(year, 7, 1);
    }
  }

  /**
   * 获取宫格中心点（相对 grid 容器坐标）
   */
  function getCellCenter(cell, gridRect) {
    if (!cell) return null;
    var r = cell.getBoundingClientRect();
    return { x: r.left - gridRect.left + r.width / 2, y: r.top - gridRect.top + r.height / 2 };
  }

  /**
   * 获取线的起始锚点：
   * 情况1：角上宫位，取靠近中间的角（如左上→右下角）
   * 情况2：边上宫位，取面向中间的边的中点（如上边→底部中心）
   */
  function getCellAnchorPoint(cell, gridRect) {
    if (!cell) return null;
    var r = cell.getBoundingClientRect();
    var x0 = r.left - gridRect.left;
    var y0 = r.top - gridRect.top;
    var x1 = x0 + r.width;
    var y1 = y0 + r.height;
    var cx = (x0 + x1) / 2;
    var cy = (y0 + y1) / 2;
    var rowH = gridEl.clientHeight / 4;
    var colW = gridEl.clientWidth / 4;
    // 中文注释：改用“中心点”判断是否为角与边，以避免右下/左下误判为居中
    var row = Math.floor(cy / rowH + 1e-6);
    var col = Math.floor(cx / colW + 1e-6);
    var isCorner = (row === 0 || row === 3) && (col === 0 || col === 3);
    if (isCorner) {
      if (row === 0 && col === 0) return { x: x1, y: y1 }; // 左上→右下角
      if (row === 0 && col === 3) return { x: x0, y: y1 }; // 右上→左下角
      if (row === 3 && col === 0) return { x: x1, y: y0 }; // 左下→右上角
      if (row === 3 && col === 3) return { x: x0, y: y0 }; // 右下→左上角
    }
    // 边上宫位：选择面向中心的边中点
    if (row === 0) return { x: cx, y: y1 };      // 顶边 → 底部居中
    if (row === 3) return { x: cx, y: y0 };      // 底边 → 顶部居中
    if (col === 0) return { x: x1, y: cy };      // 左边 → 右侧居中
    if (col === 3) return { x: x0, y: cy };      // 右边 → 左侧居中
    // 兜底：中心点
    return { x: cx, y: cy };
  }

  // 保留：不再使用锚点折线

  /**
   * 创建或复用 SVG 覆盖层
   */
  function ensureLinesLayer() {
    var svg = gridEl.querySelector('.sanfang-lines');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'sanfang-lines');
      gridEl.appendChild(svg);
    }
    svg.setAttribute('width', gridEl.clientWidth);
    svg.setAttribute('height', gridEl.clientHeight);
    svg.setAttribute('viewBox', '0 0 ' + gridEl.clientWidth + ' ' + gridEl.clientHeight);
    return svg;
  }

  // 监听窗口尺寸变化，重绘虚线
  window.addEventListener('resize', function () {
    if (window.__last_highlight_targets__) drawSanfangLines(window.__last_highlight_targets__);
  });

  /**
   * 中心概览覆盖层，近似紫微派中部信息区
   */
  function renderCenter(astrolabe) {
    var el = document.querySelector('.center-overlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'center-overlay';
      gridEl.appendChild(el);
    }
    // 新增：中心内容容器，独立于 overlay 的大小与样式，始终居中显示
    var inner = el.querySelector('.center-content');
    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'center-content';
      el.appendChild(inner);
    }
    // 中文注释：在三方四正上方显示“基础信息”（来源于 buildOverviewHTML），满足“用户的基础信息需要显示到三方四正上面”的需求
    inner.innerHTML = [
      '<div class="title">基础信息</div>',
      '<div class="overview-section">', buildOverviewHTML(astrolabe), '</div>',
      '<div class="sanfang-section"></div>',
    ].join('');
  }

  /**
   * 渲染星曜列表
   */
  function renderStars(label, list) {
    if (!Array.isArray(list) || list.length === 0) return '<div class="stars"><span class="star">' + label + '：-</span></div>';
    var items = list.map(function (s) {
      var brightness = s.brightness ? ('·' + s.brightness) : '';
      var clsType = ' ' + mapStarTypeClass(s.type);
      var clsBright = ' ' + mapBrightnessClass(s.brightness);
      return '<span class="star' + clsType + clsBright + '">' + escapeHtml(s.name + brightness) + '</span>';
    });
    return '<div class="stars"><span class="star">' + label + '：</span>' + items.join('') + '</div>';
  }

  /**
   * 渲染大限信息
   */
  function renderDecadalRange(stage) {
    if (!stage || !stage.range) return '-';
    return stage.range[0] + ' - ' + stage.range[1];
  }

  /**
   * 获取指定宫位对应的大限范围（优先使用 palace.stage.range；否则根据当前年龄与大限索引推算）
   */
  function getDecadalRangeFromAstrolabe(orderIdx, palace) {
    // 优先使用宫位的 decadal.range
    if (palace && palace.decadal && palace.decadal.range) {
      var r1 = palace.decadal.range;
      return r1[0] + ' - ' + r1[1];
    }
    // 次级使用 palace.stage.range
    var direct = renderDecadalRange(palace && palace.stage);
    if (direct !== '-') return direct;
    dlog('getDecadalRange inputs', { orderIdx: orderIdx, palaceDecadal: palace && palace.decadal, palaceStage: palace && palace.stage });
    return '-';
  }

  /**
   * 生成徽标样式文本
   */
  function badge(text) {
    return '<span class="star">' + escapeHtml(text) + '</span>';
  }

  // 已移除：流年宫名展示，现按需求显示大限范围

  /**
   * 生成复制用的文本（每一个宫位的三方四正）
   */
  function buildCopyText(astrolabe, soulIdx) {
    var palaces = Array.isArray(astrolabe && astrolabe.palaces) ? astrolabe.palaces : [];
    function joinStars(arr) {
      if (!Array.isArray(arr) || arr.length === 0) return '无';
      var names = arr.map(function (s) {
        var brightness = s && s.brightness ? ('·' + s.brightness) : '';
        return String(s && s.name ? s.name : '-') + brightness;
      });
      return names.join('、');
    }
    // 中文注释：将占位符“-”统一替换为“无”，仅在 buildCopyText 内生效
    function n2w(v) {
      var t = String(v == null ? '-' : v);
      return (t === '-' || t.trim() === '-') ? '无' : t;
    }
    // 中文注释：统一宫位名称格式为“xxx宫”，若已包含“宫”后缀则不重复追加
    function formatPalaceName(name) {
      var n = (name || '').trim();
      if (!n) return '无';
      if (n.endsWith('宫')) return n;
      return n + '宫';
    }
    // 中文注释：计算指定宫位的三方四正（顺序：本宫 a、三方1 b=+4、对宫 d=+6、三方2 c=+8）
    function triadFor(orderIdx) {
      try {
        var a = orderIdx;
        var b = (orderIdx + 4) % 12;
        var c = (orderIdx + 8) % 12;
        var d = (orderIdx + 6) % 12;
        var idxs = [a, b, d, c];
        return idxs.map(function (idx) {
          var p = palaces.find(function (pp) { return Number(pp.index) === idx; });
          if (!p) return null;
          return formatPalaceName(p.name || '-') + '（主星：' + joinStars(p.majorStars) + '）';
        }).filter(Boolean);
      } catch (e) { return []; }
    }
    var lines = palaces.map(function (p) {
      var orderIdx = Number(p.index);
      var dRange = getDecadalRangeFromAstrolabe(orderIdx, p);
      var ages = Array.isArray(p.ages) ? p.ages.join(', ') : '-';
      var triad = triadFor(orderIdx);
      var parts = [
        n2w(formatPalaceName(p.name)),
        '天干：' + n2w(p.heavenlyStem || '-'),
        '地支：' + n2w(p.earthlyBranch || '-'),
        '主星：' + n2w(joinStars(p.majorStars)),
        '辅星：' + n2w(joinStars(p.minorStars)),
        '杂耀：' + n2w(joinStars(p.adjectiveStars)),
        '长生12神：' + n2w(p.changsheng12 || '-'),
        '博士12神：' + n2w(p.boshi12 || '-'),
        '将前12神：' + n2w(p.jiangqian12 || '-'),
        '岁前12神：' + n2w(p.suiqian12 || '-'),
        '大限：' + n2w(dRange),
        '小限年龄：' + n2w(ages),
        '三方四正：' + (triad.length ? triad.join('，') : '无')
      ];
      return parts.join(' | ');
    });
    // 中文注释：头部显示命主的虚岁与性别信息
    var vAge = (typeof astrolabe.virtualAge === 'number') ? astrolabe.virtualAge : deriveAge(astrolabe);
    var gender = astrolabe && astrolabe.gender ? astrolabe.gender : ((window.__last_payload__ && window.__last_payload__.gender) ? window.__last_payload__.gender : '-');
    var header = '命主:虚岁' + n2w(vAge) + '，性别:' + n2w(gender);
    return [header, lines.join('\n')].join('\n');
  }

  /**
   * 计算本命四化（以年干为准）
   */
  function computeOriginMutagen(astrolabe) {
    // 解析四柱字符串，获取年干（第一个干支的第一个字）
    var stem = null;
    try {
      var first = String(astrolabe.chineseDate || '').split(/\s+/)[0] || '';
      stem = first.charAt(0) || null;
    } catch (e) {}
    // 年干与四化对应星曜（顺序：禄、权、科、忌）
    var MAP = {
      '甲': ['廉贞','破军','武曲','太阳'],
      '乙': ['天机','天梁','紫微','太阴'],
      '丙': ['天同','天机','文昌','廉贞'],
      '丁': ['太阴','天同','天机','巨门'],
      '戊': ['贪狼','太阴','右弼','天机'],
      '己': ['武曲','贪狼','天梁','文曲'],
      '庚': ['太阳','武曲','太阴','天同'],
      '辛': ['巨门','太阳','文曲','文昌'],
      '壬': ['天梁','紫微','左辅','武曲'],
      '癸': ['破军','巨门','太阴','贪狼'],
    };
    var stars = MAP[stem] || null;
    if (!stem || !stars) return { stem: stem, stars: null, starToType: {} };
    var starToType = {};
    ['禄','权','科','忌'].forEach(function (t, i) { starToType[stars[i]] = t; });
    return { stem: stem, stars: stars, starToType: starToType };
  }

  /**
   * 将本命四化格式化为字符串展示
   */
  function formatOriginMutagen(origin) {
    if (!origin || !origin.stars) return '-';
    var types = ['禄','权','科','忌'];
    return types.map(function (t, i) { return t + '·' + origin.stars[i]; }).join('  ');
  }

  /**
   * 计算指定宫位有哪些四化（根据宫内星曜命中年干四化）
   */
  function palaceMutagenTags(palace, origin) {
    var res = [];
    if (!origin || !origin.starToType) return res;
    var set = new Set();
    (palace.majorStars || []).forEach(function (s) { set.add(s.name); });
    (palace.minorStars || []).forEach(function (s) { set.add(s.name); });
    (palace.adjectiveStars || []).forEach(function (s) { set.add(s.name); });
    Object.keys(origin.starToType).forEach(function (star) {
      if (set.has(star)) res.push(origin.starToType[star]);
    });
    return res;
  }

  /**
   * 渲染四化标签行
   */
  function renderMutagenRow(muts) {
    if (!muts || muts.length === 0) return '';
    var html = muts.map(function (t) {
      var cls = 'mut-' + (t === '禄' ? 'lu' : t === '权' ? 'quan' : t === '科' ? 'ke' : 'ji');
      return '<span class="mut-tag ' + cls + '">' + t + '</span>';
    }).join('');
    return '<div class="mut-row">' + html + '</div>';
  }

  // 星曜类型 -> 样式类
  function mapStarTypeClass(t) {
    if (!t) return 'adjective';
    switch (t) {
      case 'major': return 'major';
      case 'soft': return 'soft';
      case 'tough': return 'tough';
      case 'tianma': return 'tianma';
      case 'helper': return 'helper';
      case 'flower': return 'flower';
      case 'adjective': return 'adjective';
      default: return 'adjective';
    }
  }

  // 亮度 -> 样式类
  function mapBrightnessClass(b) {
    if (!b) return '';
    if (b === '庙') return 'b-miao';
    if (b === '旺') return 'b-wang';
    if (b === '平') return 'b-ping';
    if (b === '陷') return 'b-xian';
    if (b === '得') return 'b-de';
    return '';
  }

  /**
   * 安全输出字符串
   */
  function safeStr(v) { return (v == null) ? '-' : String(v); }

  /**
   * HTML 转义，避免 XSS
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
