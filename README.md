# 体验地址
http://zwdsprompt.top/

# 紫微斗术在线排盘｜生成 AI 提示词

- 项目类型：纯前端静态站点（无需构建，直接打开 `index.html` 即可）
- 核心能力：紫微斗数排盘、三方四正高亮与连线、虚岁小限/大限/流年高亮、提示词生成与一键复制
- 技术栈与依赖：原生 HTML/CSS/JS，`Air Datepicker`（日期选择），`iztro`（紫微斗数计算引擎）

## 功能概览
- 排盘输入：支持阳历/农历生日、时辰（子到亥）、性别选择
- 占卜范围：人生（默认）、大限（支持选择年龄区间）、流年（支持选择年份）
- 宫格展示：十二宫信息（主星、辅星、杂耀、长生/博士/将前/岁前等 12 神）、大限区间、小限年龄列表
- 三方四正：点击宫位或根据范围自动高亮命宫的三方四正，并以虚线连接
- 高亮逻辑：
  - 虚岁小限：按虚岁高亮当前宫位并标注「小限」
  - 大限：按年龄高亮对应宫位并标注「大限」
  - 流年：按年份高亮对应宫位并标注「流年」
- 中央概览：显示基础信息（阳历/农历、四柱、时段、星座、生肖、命主/身主、五行局、命宫/身宫地支）
- 提示词生成：
  - 给 AI 设置身份的单行提示词，一键复制
  - 根据命盘生成的多行提示词，包含每宫三方四正信息，一键复制
  - 主题模板（婚姻、事业、财运、健康、学业）选择并复制
- 本地存储：`Shift + L` 快捷保存最近一次排盘到 `localStorage`，页面初始化尝试加载
- 移动端优化：阻止双击缩放，日期选择器中文本地化

## 目录结构
```
.
├─ index.html            # 页面结构与依赖引入
├─ assets/
│  ├─ style.css          # 页面样式
│  ├─ app.js             # 页面逻辑（排盘、渲染、高亮、复制等）
│  ├─ air-datepicker.css # 日期选择器样式
│  ├─ air-datepicker.js  # 日期选择器脚本
│  └─ iztro.min.js       # 紫微斗数计算引擎（UMD）
└─ favicon.ico
```

## 快速开始
- 本地打开：双击或用浏览器打开 `index.html`
- 建议方式：使用任意静态服务（端口不限）
  - Node：`npx serve .`
  - Python：`python3 -m http.server 8080`
- 访问后，输入出生信息，点击「排盘并分析」，即可看到宫格与提示词区域。

## 使用说明
- 日期类型：
  - 选择「阳历」时，使用 `Air Datepicker` 选择日期（不含具体时间）；时辰通过下拉框选择
  - 选择「农历」时，手动输入农历生日（示例：`2000-7-17`），可勾选「闰月」
- 占卜范围：
  - 人生：默认展示当前虚岁的小限宫位、高亮当前大限与流年宫位
  - 大限：从两排方块中选择年龄区间，自动将三方四正指向该大限所在宫
  - 流年：从两排年份中选择目标年，自动将三方四正指向该年对应宫位
- 提示词复制：
  - 「第一步」设置 AI 身份的单行提示词，可直接复制到对话框
  - 「第二步」命盘提示词为多行文本，包含所有宫位的关键信息
  - 「第三步」可选择主题模板或自拟问题，将文本复制到对话框

## 开发与代码结构
- 入口与渲染主流程：
  - `renderAll`：整合计算结果并渲染各区域 `assets/app.js:509`
  - `computeAstrolabe`：调用 `iztro` 进行紫微斗数排盘 `assets/app.js:461`
  - 初始化逻辑：加载最近保存的星盘或以当前日期预填 `assets/app.js:308`
- 宫格与交互：
  - 宫格渲染与点击事件：`renderGrid`、`attachGridClick` `assets/app.js:753`、`assets/app.js:813`
  - 三方四正高亮与连线：`highlightSanfang`、`drawSanfangLines` `assets/app.js:825`、`assets/app.js:883`
  - 中央概览与三方信息：`renderCenter`、`showSanfangInfo` `assets/app.js:1206`、`assets/app.js:852`
- 高亮逻辑（范围驱动）：
  - 范围路由：`applyDivinationScope` `assets/app.js:646`
  - 小限（虚岁）：`highlightCurrentXiaoxian` `assets/app.js:924`
  - 大限（年龄段）：`highlightCurrentDecadal` `assets/app.js:1035` 起
  - 流年（年份）：`highlightCurrentYearly` `assets/app.js:1038`
- 选择器渲染：
  - 大限选择器：`renderDecadalPicker` `assets/app.js:553`
  - 年份选择器：`renderYearPicker` `assets/app.js:597`
- 提示词生成：
  - 每宫三方四正文本：`buildCopyText` `assets/app.js:1278`
  - 主题模板与复制：`TOPIC_TEMPLATES` 与相关事件 `assets/app.js:247` 起
- 本命四化：
  - 计算与标签渲染：`computeOriginMutagen`、`renderMutagenRow` `assets/app.js:1345`、`assets/app.js:1402`

## 依赖说明
- `iztro`：紫微斗数排盘引擎，UMD 版本通过 `<script src="./assets/iztro.min.js"></script>` 引入
- `Air Datepicker`：提升日期选择体验，支持中文本地化；若未加载则回退为原生文本输入
- 无构建依赖：项目未使用打包器或框架，纯原生运行

## 常见问题
- 排盘失败：检查是否正确填写日期与时辰；确认 `iztro.min.js` 已加载
- 农历输入：格式为 `YYYY-M-D`，如 `2000-7-17`；若为闰月请勾选
- 年份/年龄列表：界面控制最多显示 10 个选择项，便于移动端操作
- 复制失败：部分浏览器可能限制剪贴板权限，系统会尝试降级（`document.execCommand('copy')`）

## 隐私与本地数据
- 本地保存使用 `localStorage`，键名为 `astrolabe:last`
- 不会上传任何个人数据，所有计算在浏览器本地完成

## 文档与后续
- 按约定，后续的「文档驱动开发」材料将位于 `api-doc/` 目录，并以步骤化说明推动迭代
- 如需新增功能或调整交互，可在 `assets/app.js` 中对应函数处扩展

## 许可证
- 暂未声明许可证；如需公开发布，请根据项目需要添加合适的 License

