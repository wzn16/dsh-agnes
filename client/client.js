/**
 * dsh-agnes — 浏览器半侧(设置页的「Agnes」标签页)。
 *
 * 以惰性 CJS 工厂格式注册到 DSH 客户端模块系统:
 * Host 扫描到本包 package.json 的 `dsh.client.platform: "web"` 声明后,
 * 经 /plugins/dsh-agnes/client.js 伺服本文件并在浏览器里物化。
 *
 * 本页在设置页贡献一个 `settings.section` 条目(标签页「Agnes」),
 * 通过客户端 settings scope 绑定 Host 端注册的 `agnes` 设置命名空间,
 * 提供图像/视频生成默认参数的暂存-保存-重置编辑流。
 *
 * 模型选择是下拉框,选项对齐 docs/agnes-ai/ 官方文档的三个接入模型
 * (与 Host 端 src/models.ts 目录一致);历史配置里的未知名称会作为
 * 「(当前)」选项保留显示。切换模型时依赖字段自适应到该模型的推荐默认值,
 * 并按参数体系切换表单形态(V2.0 像素/帧数制;2.5 系列秒数制,flash 锁定 720P)。
 *
 * 字段设计对齐 docs/agnes-ai/ 官方文档的大众场景:
 * - 图像:size 档位 + 比例带场景说明,并实时显示组合输出像素(文档尺寸表);
 * - 视频:画幅比例 × 清晰度档位两个预设选择器映射到底层 width/height,
 *   时长用官方推荐帧数预设(81/121/241/441),帧率 24/30 优先,
 *   所有预设都保留「自定义…」回退到精确数字输入。
 *
 * 样式只引用 DSH 真实主题令牌(Theme.listTokens 的 13 个),
 * 派生色调用 color-mix,不携带浅色硬编码回退;根节点声明
 * color-scheme: light dark,原生控件随明暗主题自适应。
 */
(function () {
  'use strict';

  window.__ModuleLoader__.load({
    id: 'dsh-agnes',
    factory: function (require) {
      var module = { exports: {} };
      var exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

      var React = require('react');
      var h = React.createElement;
      var useState = React.useState;
      var useCallback = React.useCallback;
      var useRef = React.useRef;

      /** 与 Host 端 src/index.ts 的 settingsNamespace('agnes') 对应。 */
      var NS = 'agnes';
      var SECTION_ID = 'agnes';
      var SECTION_ORDER = 130;
      var CSS_ID = 'dsh-agnes-settings-styles';

      /** 与 src/image.ts 保持一致的选项。 */
      var SIZE_OPTIONS = ['1K', '2K', '3K', '4K'];
      var RATIO_OPTIONS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'];

      /** 模型下拉目录,与 Host 端 src/models.ts 保持一致(docs/agnes-ai/ 三个接入模型)。 */
      var IMAGE_MODEL_CATALOG = [
        { id: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash' },
      ];
      var VIDEO_MODEL_CATALOG = [
        { id: 'agnes-video-v2.0', label: 'Agnes Video V2.0' },
        { id: 'agnes-video-2.5-flash', label: 'Agnes Video 2.5 Flash' },
      ];

      /**
       * 切换模型时依赖字段自适应到的推荐默认值(与 src/models.ts 的 preset 一致)。
       * 键为底层字段名,值为暂存文本;保存前经 FIELD_BY_NAME 校验。
       */
      var IMAGE_MODEL_PRESET = { defaultSize: '1K', defaultRatio: '1:1' };
      var VIDEO_MODEL_PRESET = {
        videoWidth: '1280',
        videoHeight: '720',
        videoNumFrames: '121',
        videoFrameRate: '24',
        video25Seconds: '5',
        video25Size: '720P',
      };

      /** 图像尺寸档位 × 比例的输出像素表(docs/agnes-ai/Agnes Image 2.1 Flash.md)。 */
      var IMAGE_PIXELS = {
        '1:1': { '1K': '1024×1024', '2K': '2048×2048', '3K': '3072×3072', '4K': '4096×4096' },
        '3:4': { '1K': '864×1152', '2K': '1728×2304', '3K': '2592×3456', '4K': '3456×4608' },
        '4:3': { '1K': '1152×864', '2K': '2304×1728', '3K': '3456×2592', '4K': '4608×3456' },
        '16:9': { '1K': '1312×736', '2K': '2624×1472', '3K': '3936×2208', '4K': '5248×2944' },
        '9:16': { '1K': '736×1312', '2K': '1472×2624', '3K': '2208×3936', '4K': '2944×5248' },
        '2:3': { '1K': '832×1248', '2K': '1664×2496', '3K': '2496×3744', '4K': '3328×4992' },
        '3:2': { '1K': '1248×832', '2K': '2496×1664', '3K': '3744×2496', '4K': '4992×3328' },
        '21:9': { '1K': '1568×672', '2K': '3136×1344', '3K': '4704×2016', '4K': '6272×2688' },
      };

      /** 视频画幅 × 清晰度档位的提交像素;API 会标准化到最近档位(文档:480p/16:9=832×448)。 */
      var VIDEO_TIERS = ['480p', '720p', '1080p'];
      var VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];
      var VIDEO_CANVAS = {
        '480p': { '16:9': [832, 448], '9:16': [448, 832], '1:1': [640, 640], '4:3': [832, 624], '3:4': [624, 832] },
        '720p': { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960], '4:3': [960, 720], '3:4': [720, 960] },
        '1080p': { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1440, 1440], '4:3': [1440, 1080], '3:4': [1080, 1440] },
      };

      /** 官方推荐时长预设:frame_rate 24 下 81≈3s、121≈5s、241≈10s、441≈18s。 */
      var FRAME_PRESETS = ['81', '121', '241', '441'];
      var FPS_PRESETS = ['24', '30'];

      /** Video 2.5 系列(含 flash)的档位与秒数范围,与 Host VIDEO25_SIZES 一致。 */
      var VIDEO25_SIZES = ['720P', '960P', '2K'];
      var VIDEO25_SECONDS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

      // ---- 文案(zh 为键集来源,en 对照补全) ----
      var zh = {
        title: 'Agnes',
        lede: 'Agnes AI 图像与视频生成工具的默认参数。模型从下拉列表选择,切换时其余默认值自动适配;保存后写入 DSH 设置文档(~/.dsh/settings.yaml 的 agnes 段),即时生效。',
        groupImage: '图像生成默认值',
        groupVideo: '视频生成默认值',
        imageModel: '图像模型',
        imageModelHint: '下拉选择目录模型;实际调用的模型随选择写入配置。',
        adaptedNotice: '已按所选模型自适应下方默认参数,可继续微调后保存。',
        defaultSize: '默认尺寸档位',
        defaultSizeHint: '调用省略 size 时使用;搭配下方比例决定输出像素。',
        defaultRatio: '默认宽高比',
        defaultRatioHint: '与尺寸档位配合;需要常见 16:9 显示素材时选 2K + 16:9 后再裁剪。',
        videoModel: '视频模型',
        videoModelHint: '下拉选择目录模型;参数体系按模型自适应:V2.0 用画幅像素与帧数,2.5 Flash 用秒数与分辨率档位(仅 720P)。',
        currentOptionSuffix: '(当前)',
        videoCanvas: '画幅与清晰度',
        videoCanvasHint: '以画幅 × 档位提交宽高,API 会标准化到最近的 480p/720p/1080p 档。',
        videoCanvasHint25: '以画幅 + 档位提交;flash 仅支持 720P,其他档位会自动按 720P 提交。',
        videoCanvasHint25Flash: '以画幅 + 档位提交;flash 仅支持 720P,档位已锁定。',
        flashSizeNote: '已保存的档位 {v} 不被 flash 支持,提交时将按 720P 收敛。',
        videoDuration: '视频时长',
        videoDurationHint: '时长 = 帧数 ÷ 帧率;帧数需 ≤441 且满足 8n+1。',
        videoDuration25: '视频时长',
        videoDurationHint25: '2.5 系列以整秒提交(4–12),按分辨率 × 时长计费;调用方传帧数/帧率时会自动换算。',
        videoFps: '帧率',
        videoFpsHint: '24 电影感、30 更流畅;支持 1–60。',
        videoWidth: '宽度(px)',
        videoWidthHint: '省略 width 时使用的精确像素值。',
        videoHeight: '高度(px)',
        videoHeightHint: '省略 height 时使用的精确像素值。',
        videoNumFrames: '帧数',
        videoNumFramesHint: '≤441 且满足 8n+1(如 81/121/241/441)。',
        videoFrameRate: '帧率',
        videoFrameRateHint: '1–60。',
        customOption: '自定义…',
        tier480p: '480p · 流畅预览',
        tier720p: '720p · 高清(推荐)',
        tier1080p: '1080p · 全高清',
        tier25720P: '720P · 标准(推荐)',
        tier25960P: '960P · 高细节',
        tier252K: '2K · 最高清晰',
        commitAspect: '将提交 {ratio} · {size} · 约{n} 秒',
        durSec: '{n} 秒',
        durSecRec: '{n} 秒(推荐)',
        videoDurationHint25Flash: '2.5 系列以整秒提交(4–12);flash 按时长计费且仅支持 720P 档。',
        ratio169: '16:9 · 横版(演示/YouTube)',
        ratio916: '9:16 · 竖版(短视频)',
        ratio11: '1:1 · 方形(信息流)',
        ratio43: '4:3 · 传统横幅',
        ratio34: '3:4 · 竖版演示',
        dur81: '约 3 秒(81 帧)',
        dur121: '约 5 秒(121 帧·推荐)',
        dur241: '约 10 秒(241 帧)',
        dur441: '约 18 秒(441 帧)',
        fps24: '24 · 电影感(推荐)',
        fps30: '30 · 更流畅',
        size1K: '1K · 日常生成',
        size2K: '2K · 壁纸/封面(推荐)',
        size3K: '3K · 高分辨率',
        size4K: '4K · 印刷级细节',
        imgRatio11: '1:1 · 方形(头像/图标)',
        imgRatio169: '16:9 · 横版(桌面壁纸)',
        imgRatio916: '9:16 · 竖屏(手机壁纸)',
        imgRatio43: '4:3 · 经典横幅',
        imgRatio34: '3:4 · 肖像',
        imgRatio32: '3:2 · 相机原生',
        imgRatio23: '2:3 · 海报/书封',
        imgRatio219: '21:9 · 超宽影院',
        outputPx: '当前组合输出约 {px}',
        commitPx: '将以 {w} × {h} 提交',
        save: '保存',
        saving: '保存中…',
        discard: '放弃修改',
        overridden: '已覆盖',
        reset: '重置',
        loading: '正在读取设置…',
        unavailable: '当前部署未提供可编辑的 agnes 设置命名空间,无法在此修改。',
        readonlyMode: '当前环境的设置为只读,仅可查看。',
        invalidBlock: '存在未通过校验的草稿,请修正后再保存。',
        invalidEmpty: '不能为空。',
        invalidNumber: '需要有效的数值。',
        savedAll: '已保存。',
        saveFailed: '部分修改未能落盘,已保留草稿,请重试。',
        secondsPerVideo: '按当前默认约 {n} 秒',
      };
      var en = {
        title: 'Agnes',
        lede: 'Defaults for the Agnes AI image & video generation tools. Pick models from the dropdowns — remaining defaults adapt automatically; saving persists to the DSH settings document (the "agnes" section of ~/.dsh/settings.yaml) and applies immediately.',
        groupImage: 'Image defaults',
        groupVideo: 'Video defaults',
        imageModel: 'Image model',
        imageModelHint: 'Choose a catalog model; the model actually called follows the selection.',
        adaptedNotice: 'Defaults below were adapted to the selected model; fine-tune before saving.',
        currentOptionSuffix: '(current)',
        defaultSize: 'Default size tier',
        defaultSizeHint: 'Used when a call omits size; paired with the ratio below to decide output pixels.',
        defaultRatio: 'Default aspect ratio',
        defaultRatioHint: 'Paired with the size tier; pick 2K + 16:9 for desktop material, then crop.',
        videoModel: 'Video model',
        videoModelHint: 'Choose a catalog model; parameters adapt per model: V2.0 uses pixel canvas and frames, 2.5 Flash uses seconds and quality tiers (720P only).',
        videoCanvas: 'Canvas & quality',
        videoCanvasHint: 'Width/height are submitted from canvas × tier; the API normalizes to the nearest 480p/720p/1080p preset.',
        videoCanvasHint25: 'Submitted as aspect ratio + tier; flash only supports 720P — other tiers are coerced to 720P.',
        videoCanvasHint25Flash: 'Submitted as aspect ratio + tier; flash only supports 720P, so the tier is locked.',
        flashSizeNote: 'Saved tier {v} is not supported by flash and will be coerced to 720P on submit.',
        videoDuration: 'Duration',
        videoDurationHint: 'duration = frames ÷ fps; frames must be ≤441 and follow 8n+1.',
        videoDuration25: 'Duration',
        videoDurationHint25: 'The 2.5 family submits whole seconds (4–12) and bills per resolution × duration; frame args are converted automatically.',
        videoFps: 'Frame rate',
        videoFpsHint: '24 cinematic, 30 smoother; range 1–60.',
        videoWidth: 'Width (px)',
        videoWidthHint: 'Exact pixel width used when a call omits width.',
        videoHeight: 'Height (px)',
        videoHeightHint: 'Exact pixel height used when a call omits height.',
        videoNumFrames: 'Frames',
        videoNumFramesHint: '≤441 following 8n+1 (81/121/241/441…).',
        videoFrameRate: 'FPS',
        videoFrameRateHint: '1–60.',
        customOption: 'Custom…',
        tier480p: '480p · quick preview',
        tier720p: '720p · HD (recommended)',
        tier1080p: '1080p · Full HD',
        tier25720P: '720P · standard (recommended)',
        tier25960P: '960P · high detail',
        tier252K: '2K · highest clarity',
        commitAspect: 'Will submit {ratio} · {size} · ≈{n}s',
        durSec: '{n}s',
        durSecRec: '{n}s (recommended)',
        videoDurationHint25Flash: 'The 2.5 family submits whole seconds (4–12); flash bills per second and only supports 720P.',
        ratio169: '16:9 · landscape (demo/YouTube)',
        ratio916: '9:16 · vertical (shorts)',
        ratio11: '1:1 · square (feed)',
        ratio43: '4:3 · classic',
        ratio34: '3:4 · portrait demo',
        dur81: '≈3 s (81 frames)',
        dur121: '≈5 s (121 frames · recommended)',
        dur241: '≈10 s (241 frames)',
        dur441: '≈18 s (441 frames)',
        fps24: '24 · cinematic (recommended)',
        fps30: '30 · smoother',
        size1K: '1K · everyday',
        size2K: '2K · wallpaper/cover (recommended)',
        size3K: '3K · high resolution',
        size4K: '4K · print detail',
        imgRatio11: '1:1 · square (avatar/icon)',
        imgRatio169: '16:9 · landscape (desktop wallpaper)',
        imgRatio916: '9:16 · portrait (phone wallpaper)',
        imgRatio43: '4:3 · classic banner',
        imgRatio34: '3:4 · portrait',
        imgRatio32: '3:2 · camera native',
        imgRatio23: '2:3 · poster/book cover',
        imgRatio219: '21:9 · ultra-wide cinema',
        outputPx: 'Current combination outputs ≈ {px}',
        commitPx: 'Will submit {w} × {h}',
        save: 'Save',
        saving: 'Saving…',
        discard: 'Discard',
        overridden: 'Overridden',
        reset: 'Reset',
        loading: 'Loading settings…',
        unavailable: 'This deployment does not expose an editable "agnes" settings namespace.',
        readonlyMode: 'Settings are read-only in this environment.',
        invalidBlock: 'Some drafts failed validation; fix them before saving.',
        invalidEmpty: 'Cannot be empty.',
        invalidNumber: 'A valid number is required.',
        savedAll: 'Saved.',
        saveFailed: 'Some edits did not land; drafts were kept, please retry.',
        secondsPerVideo: '≈ {n}s at current defaults',
      };
      var DICTIONARIES = { zh: zh, en: en };

      function detectLang() {
        try {
          var lang = document.documentElement.lang || 'zh';
          return lang === 'zh' || lang.indexOf('zh-') === 0 ? 'zh' : 'en';
        } catch (_e) { return 'zh'; }
      }

      // ---- 底层字段校验(与 Host 端 schema 一致) ----
      function parseNonEmptyText(text) {
        var trimmed = String(text).trim();
        return trimmed === '' ? undefined : { value: trimmed };
      }
      function parseIntPositive(text) {
        if (!/^\d+$/.test(String(text).trim())) return undefined;
        var n = Number(text);
        return Number.isInteger(n) && n >= 1 ? { value: n } : undefined;
      }
      function parseFrameCount(text) {
        if (!/^\d+$/.test(String(text).trim())) return undefined;
        var n = Number(text);
        // 8n+1 且 ≤441:n≥1 ⇒ n≥9。
        return Number.isInteger(n) && n >= 9 && n <= 441 && (n - 1) % 8 === 0 ? { value: n } : undefined;
      }
      function parseFrameRate(text) {
        var n = Number(text);
        if (!Number.isFinite(n)) return undefined;
        return n >= 1 && n <= 60 ? { value: n } : undefined;
      }
      function parseSizeTier(text) {
        return SIZE_OPTIONS.indexOf(String(text).trim()) >= 0 ? { value: String(text).trim() } : undefined;
      }
      function parseRatio(text) {
        return RATIO_OPTIONS.indexOf(String(text).trim()) >= 0 ? { value: String(text).trim() } : undefined;
      }
      function parseSeconds25(text) {
        if (!/^\d+$/.test(String(text).trim())) return undefined;
        var n = Number(text);
        // 2.5 系列:整数秒 4–12。
        return Number.isInteger(n) && n >= 4 && n <= 12 ? { value: n } : undefined;
      }
      function parseSize25(text) {
        return VIDEO25_SIZES.indexOf(String(text).trim()) >= 0 ? { value: String(text).trim() } : undefined;
      }

      /** 各底层字段规格:key 必须与 Host Config 键一致。 */
      var FIELD_BY_NAME = {
        imageModel: { parse: parseNonEmptyText },
        defaultSize: { parse: parseSizeTier },
        defaultRatio: { parse: parseRatio },
        videoModel: { parse: parseNonEmptyText },
        videoWidth: { parse: parseIntPositive },
        videoHeight: { parse: parseIntPositive },
        videoNumFrames: { parse: parseFrameCount },
        videoFrameRate: { parse: parseFrameRate },
        video25Seconds: { parse: parseSeconds25 },
        video25Size: { parse: parseSize25 },
      };

      function formatValue(value) {
        return value === undefined || value === null ? '' : String(value);
      }

      function userHasKey(userLayer, field) {
        return userLayer !== undefined && userLayer !== null
          && typeof userLayer === 'object'
          && Object.prototype.hasOwnProperty.call(userLayer, field);
      }

      /** 从画幅表反查 (w,h) 对应的 ratio/tier;不匹配返回 null。 */
      function canvasLookup(w, h) {
        if (!Number.isInteger(w) || !Number.isInteger(h)) return null;
        for (var t = 0; t < VIDEO_TIERS.length; t++) {
          var tier = VIDEO_TIERS[t];
          var row = VIDEO_CANVAS[tier];
          for (var r = 0; r < VIDEO_RATIOS.length; r++) {
            var ratio = VIDEO_RATIOS[r];
            if (row[ratio][0] === w && row[ratio][1] === h) return { tier: tier, ratio: ratio };
          }
        }
        return null;
      }

      // ---- 样式:仅使用 Theme.listTokens 暴露的真实令牌 ----
      var CSS_TEXT = [
        '.dsh-agnes-root { display:flex; flex-direction:column; gap:14px; width:100%; box-sizing:border-box; padding:4px 4px 12px 4px; color:var(--dsw-alias-label-primary); color-scheme:light dark; }',
        '.dsh-agnes-root *, .dsh-agnes-root *::before, .dsh-agnes-root *::after { box-sizing:border-box; }',
        '.dsh-agnes-header { display:flex; align-items:flex-start; gap:12px; padding:4px 0 2px 0; }',
        '.dsh-agnes-header-icon { flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color:var(--dsw-alias-brand-primary); margin-top:2px; }',
        '.dsh-agnes-titles { display:flex; flex-direction:column; gap:2px; min-width:0; }',
        '.dsh-agnes-title { margin:0; font-size:18px; font-weight:600; line-height:1.3; color:var(--dsw-alias-label-primary); }',
        '.dsh-agnes-lede { margin:0; font-size:13px; line-height:1.5; color:color-mix(in srgb, var(--dsw-alias-label-secondary), transparent 12%); }',
        '.dsh-agnes-banner { padding:8px 12px; border-radius:8px; font-size:12.5px; line-height:1.5; }',
        '.dsh-agnes-banner-warn { background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); color:var(--dsw-alias-state-warn-primary); border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent); }',
        '.dsh-agnes-banner-error { background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); color:var(--dsw-alias-state-error-primary); border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }',
        '.dsh-agnes-banner-ok { background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); color:var(--dsw-alias-state-success-primary); border:1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); }',
        '.dsh-agnes-card { border:1px solid var(--dsw-alias-border-l2); border-radius:12px; background:var(--dsw-alias-bg-layer-1); overflow:hidden; }',
        '.dsh-agnes-card-head { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13px; font-weight:600; color:var(--dsw-alias-label-secondary); border-bottom:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }',
        '.dsh-agnes-card-head svg { flex-shrink:0; }',
        '.dsh-agnes-field { display:flex; flex-direction:column; gap:4px; padding:12px 14px; }',
        '.dsh-agnes-field + .dsh-agnes-field { border-top:1px solid var(--dsw-alias-border-l1); }',
        '.dsh-agnes-field-head { display:flex; align-items:center; gap:8px; min-height:20px; }',
        '.dsh-agnes-label { flex:1; min-width:0; font-size:13px; font-weight:500; line-height:1.5; color:var(--dsw-alias-label-primary); }',
        '.dsh-agnes-badge { white-space:nowrap; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:0 8px; font-size:11px; font-weight:500; line-height:17px; }',
        '.dsh-agnes-reset { font:inherit; font-size:12px; line-height:1.5; color:var(--dsw-alias-label-secondary); cursor:pointer; background:none; border:none; padding:0; }',
        '.dsh-agnes-reset:hover:not(:disabled) { color:var(--dsw-alias-label-primary); }',
        '.dsh-agnes-reset:disabled { cursor:default; opacity:.45; }',
        '.dsh-agnes-canvas { display:flex; gap:8px; }',
        '.dsh-agnes-canvas > .dsh-agnes-select { flex:1; min-width:0; }',
        '.dsh-agnes-input, .dsh-agnes-select { height:34px; width:100%; font:inherit; font-size:13px; line-height:1.5; color:var(--dsw-alias-label-primary); background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l2); border-radius:8px; padding:0 12px; outline:none; transition:border-color .15s, box-shadow .15s; }',
        '.dsh-agnes-input:focus, .dsh-agnes-select:focus { border-color:var(--dsw-alias-brand-primary); box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }',
        '.dsh-agnes-input[data-invalid="true"] { border-color:var(--dsw-alias-state-error-primary); }',
        '.dsh-agnes-input::placeholder { color:color-mix(in srgb, var(--dsw-alias-label-secondary), transparent 35%); }',
        '.dsh-agnes-hint { font-size:12px; line-height:1.5; color:color-mix(in srgb, var(--dsw-alias-label-secondary), transparent 20%); }',
        '.dsh-agnes-error-text { font-size:12px; line-height:1.5; color:var(--dsw-alias-state-error-primary); }',
        '.dsh-agnes-footer { display:flex; align-items:center; gap:10px; padding-top:2px; }',
        '.dsh-agnes-footer-status { flex:1; min-width:0; font-size:12.5px; color:var(--dsw-alias-state-error-primary); }',
        '.dsh-agnes-btn { height:32px; padding:0 14px; border-radius:8px; font:inherit; font-size:13px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:background .15s,border-color .15s,opacity .15s; }',
        '.dsh-agnes-btn:disabled { opacity:.45; cursor:default; }',
        '.dsh-agnes-btn-primary { border:1px solid transparent; background:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); }',
        '.dsh-agnes-btn-primary:hover:not(:disabled) { filter:brightness(1.08); }',
        '.dsh-agnes-btn-ghost { border:1px solid var(--dsw-alias-border-l2); background:transparent; color:var(--dsw-alias-label-primary); }',
        '.dsh-agnes-btn-ghost:hover:not(:disabled) { background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }',
      ].join('\n');

      function injectStyles() {
        if (typeof document === 'undefined') return;
        var existing = document.querySelector('style[data-plugin-css="' + CSS_ID + '"]');
        if (existing) existing.remove();
        var tag = document.createElement('style');
        tag.dataset.plugin = 'dsh-agnes';
        tag.dataset.pluginCss = CSS_ID;
        tag.textContent = CSS_TEXT;
        document.head.appendChild(tag);
      }

      function removeStyles() {
        if (typeof document === 'undefined') return;
        var tag = document.querySelector('style[data-plugin-css="' + CSS_ID + '"]');
        if (tag) tag.remove();
      }

      // ---- 小图标 ----
      function svgEl(children, size) {
        size = size || 14;
        return h('svg', {
          width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round',
          strokeLinejoin: 'round', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true',
        }, children);
      }
      function IconImage(props) {
        return svgEl([
          h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
          h('circle', { cx: 9, cy: 9, r: 2 }),
          h('path', { d: 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21' }),
        ], props && props.size);
      }
      function IconFilm(props) {
        return svgEl([
          h('rect', { x: 2, y: 4, width: 20, height: 16, rx: 2 }),
          h('path', { d: 'M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5' }),
        ], props && props.size);
      }
      function IconSpark(props) {
        return svgEl([h('path', { d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1' })], props && props.size);
      }

      /**
       * useSyncExternalStore 的兜底:缺失时退化为 useState+useEffect 订阅。
       * 仅在组件渲染内调用。
       */
      function useStore(subscribe, getSnapshot) {
        if (typeof React.useSyncExternalStore === 'function') {
          return React.useSyncExternalStore(subscribe, getSnapshot);
        }
        var pair = useState(getSnapshot);
        var value = pair[0];
        var setValue = pair[1];
        React.useEffect(function () {
          return subscribe(function () { setValue(getSnapshot()); });
        }, [subscribe, getSnapshot]);
        return value;
      }

      /** 把计划写为单字段操作;batch mutate 可用时走一次调用,否则逐字段写入。 */
      async function executePlan(scope, plan) {
        if (typeof scope.mutate === 'function') {
          var result = await scope.mutate(plan.map(function (item) { return item.op; }));
          if (result && result.ok) {
            var landed = {};
            (result.fields || []).forEach(function (entry) {
              if (entry && entry.landed) landed[entry.field] = true;
            });
            return { landedAll: plan.every(function (item) { return landed[item.field]; }) };
          }
          return { landedAll: false, message: result && result.message };
        }
        var allLanded = true;
        for (var i = 0; i < plan.length; i++) {
          var item = plan[i];
          if (item.op.op === 'set') await scope.set(item.field, item.op.value);
          else await scope.unset(item.field);
          var overridden = userHasKey(scope.getSnapshot().user, item.field);
          if (item.op.op === 'set' ? !overridden : overridden) allLanded = false;
        }
        return { landedAll: allLanded };
      }

      /**
       * 「Agnes」设置页组件。
       * 草稿暂存于本地状态;保存经 settings scope 写入并回读确认,
       * 未落盘的草稿保留给用户继续修正。
       * scope 是 bind 门面(this 安全),可直接解引用传给 store 钩子。
       */
      function AgnesSection(props, scope) {
        var t = (props && typeof props.t === 'function')
          ? props.t
          : function (key) {
              var dict = DICTIONARIES[detectLang()] || zh;
              return dict[key] !== undefined ? dict[key] : key;
            };

        var snapshot = useStore(scope.subscribe, scope.getSnapshot);

        // drafts: { field: { text: string, clear: boolean } };clear 表示草拟「重置为继承」。
        var draftsPair = useState({});
        var drafts = draftsPair[0];
        var setDrafts = draftsPair[1];
        var busyPair = useState(false);
        var busy = busyPair[0];
        var setBusy = busyPair[1];
        var statusPair = useState(null); // {kind:'ok'|'error', key:string, message?:string}
        var statusState = statusPair[0];
        var setStatusState = statusPair[1];
        var mountedRef = useRef(true);
        React.useEffect(function () {
          mountedRef.current = true;
          return function () { mountedRef.current = false; };
        }, []);

        var ready = snapshot.status === 'ready' && snapshot.value !== undefined;
        // 解码失败时 status 停在 loading 但 revision 已就位:视为命名空间不可用。
        var decodeStuck = snapshot.status === 'loading' && snapshot.revision !== undefined;
        var writable = snapshot.writable === true;

        var effective = function (field) { return ready ? snapshot.value[field] : undefined; };

        /** 当前字段数值:草稿优先(可解析时),否则生效值;不可得返回 null。 */
        var numericValue = function (field) {
          var draft = drafts[field];
          if (draft && !draft.clear) {
            var raw = String(draft.text).trim();
            if (raw !== '' && /^\d+$/.test(raw)) return Number(raw);
            return null;
          }
          var v = effective(field);
          return typeof v === 'number' ? v : null;
        };
        var textValue = function (field) {
          var draft = drafts[field];
          if (draft && !draft.clear) return draft.text;
          return formatValue(effective(field));
        };
        var hasDraft = function (fields) {
          return fields.some(function (f) { return drafts[f] !== undefined; });
        };
        var anyOverridden = function (fields) {
          return fields.some(function (f) { return userHasKey(snapshot.user, f); });
        };

        // 计算保存计划:无效草稿阻塞保存;与生效值相同的草稿不算修改。
        var invalidExists = false;
        var plan = [];
        Object.keys(drafts).forEach(function (fieldName) {
          var spec = FIELD_BY_NAME[fieldName];
          if (spec === undefined) return;
          var draft = drafts[fieldName];
          if (draft.clear) {
            if (userHasKey(snapshot.user, fieldName)) {
              plan.push({ field: fieldName, op: { op: 'unset', path: [fieldName] } });
            }
            return;
          }
          if (draft.text === formatValue(effective(fieldName))) return;
          var parsed = spec.parse(draft.text);
          if (parsed === undefined) {
            invalidExists = true;
            return;
          }
          plan.push({ field: fieldName, op: { op: 'set', path: [fieldName], value: parsed.value } });
        });

        var stage = useCallback(function (fieldName, text) {
          setStatusState(null);
          setDrafts(function (prev) {
            var next = Object.assign({}, prev);
            next[fieldName] = { text: text, clear: false };
            return next;
          });
        }, []);

        var stageMany = useCallback(function (entries) {
          setStatusState(null);
          setDrafts(function (prev) {
            var next = Object.assign({}, prev);
            entries.forEach(function (pair) {
              next[pair[0]] = { text: pair[1], clear: false };
            });
            return next;
          });
        }, []);

        var stageClearMany = useCallback(function (fields, bases) {
          setStatusState(null);
          setDrafts(function (prev) {
            var next = Object.assign({}, prev);
            fields.forEach(function (f) {
              next[f] = { text: formatValue(bases[f]), clear: true };
            });
            return next;
          });
        }, []);

        var discard = useCallback(function () {
          setDrafts({});
          setStatusState(null);
        }, []);

        var save = useCallback(async function () {
          if (busy || !writable || plan.length === 0 || invalidExists) return;
          var pendingPlan = plan.slice();
          setBusy(true);
          setStatusState(null);
          var outcome = await executePlan(scope, pendingPlan);
          if (!mountedRef.current) return;
          setBusy(false);
          // 回读:落盘的草稿丢弃,未落盘的保留给用户继续修正。
          var freshUser = scope.getSnapshot().user;
          var nextDrafts = {};
          Object.keys(drafts).forEach(function (fieldName) {
            var draft = drafts[fieldName];
            var planned = pendingPlan.some(function (item) { return item.field === fieldName; });
            if (!planned) {
              nextDrafts[fieldName] = draft;
              return;
            }
            var nowOverridden = userHasKey(freshUser, fieldName);
            var wantedSet = draft.clear !== true;
            var landed = wantedSet ? nowOverridden : !nowOverridden;
            if (!landed) nextDrafts[fieldName] = draft;
          });
          setDrafts(nextDrafts);
          if (outcome.landedAll) setStatusState({ kind: 'ok', key: 'savedAll' });
          else setStatusState({ kind: 'error', key: 'saveFailed', message: outcome.message });
        }, [busy, writable, plan, invalidExists, drafts, scope]);

        if (snapshot.status === 'loading' && !decodeStuck) {
          return h('div', { className: 'dsh-agnes-root' },
            h('div', { className: 'dsh-agnes-banner dsh-agnes-banner-warn' }, t('loading')));
        }
        if (!ready || decodeStuck) {
          return h('div', { className: 'dsh-agnes-root' },
            h('div', { className: 'dsh-agnes-banner dsh-agnes-banner-warn' }, t('unavailable')));
        }

        // ---- 行渲染辅助 ----
        var fieldHead = function (labelKey, fields, baseGetter) {
          var overridden = anyOverridden(fields);
          var dirty = hasDraft(fields);
          return h('div', { className: 'dsh-agnes-field-head' },
            h('span', { className: 'dsh-agnes-label' }, t(labelKey)),
            overridden ? h('span', { className: 'dsh-agnes-badge' }, t('overridden')) : null,
            h('button', {
              type: 'button',
              className: 'dsh-agnes-reset',
              disabled: !writable || (!overridden && !dirty),
              onClick: function () { stageClearMany(fields, baseGetter()); },
              title: t('reset'),
            }, t('reset')));
        };
        var hintText = function (key) {
          return h('div', { className: 'dsh-agnes-hint' }, t(key));
        };
        var selectEl = function (value, options, onChange, key, opts) {
          var o = opts || {};
          return h('select', {
            key: key,
            className: 'dsh-agnes-select',
            value: value,
            disabled: !writable || o.disabled === true,
            onChange: function (e) { onChange(e.target.value); },
          }, options.map(function (opt) {
            return h('option', { key: opt.value, value: opt.value }, opt.label);
          }));
        };
        /** 模型下拉选项:目录模型优先;不在目录内的已存值保留为「(当前)」选项。 */
        var modelOptions = function (catalog, current) {
          var options = catalog.map(function (m) {
            return { value: m.id, label: m.label };
          });
          if (current !== undefined && current !== '' && !catalog.some(function (m) { return m.id === current; })) {
            options.push({ value: current, label: current + t('currentOptionSuffix') });
          }
          return options;
        };
        var numberInput = function (field, opts) {
          var o = opts || {};
          var draft = drafts[field];
          var stagedText = draft && !draft.clear ? draft.text : undefined;
          var shownText = stagedText !== undefined ? stagedText : formatValue(effective(field));
          var invalid = stagedText !== undefined && FIELD_BY_NAME[field].parse(stagedText) === undefined;
          return h('input', {
            key: field,
            className: 'dsh-agnes-input',
            type: 'number',
            value: shownText,
            placeholder: o.ph,
            min: o.min,
            max: o.max,
            step: o.step,
            'aria-label': t(o.labelKey || field),
            spellCheck: false,
            'data-invalid': invalid ? 'true' : 'false',
            disabled: !writable,
            onChange: function (e) { stage(field, e.target.value); },
          });
        };

        // ---- 图像组 ----
        var imgModelVal = textValue('imageModel');
        // 切换模型 → 模型名 + 推荐默认参数一起暂存,保存前可继续微调。
        var onImageModelChange = function (v) {
          stage('imageModel', v);
          var preset = IMAGE_MODEL_PRESET;
          stageMany(Object.keys(preset).map(function (field) { return [field, preset[field]]; }));
        };
        var imageAdapted = hasDraft(['imageModel'])
          && Object.keys(IMAGE_MODEL_PRESET).some(function (f) { return drafts[f] !== undefined; });

        var imageSizeOptions = SIZE_OPTIONS.map(function (s) {
          return { value: s, label: t('size' + s) };
        });
        var imageRatioLabelKeys = {
          '1:1': 'imgRatio11', '16:9': 'imgRatio169', '9:16': 'imgRatio916', '4:3': 'imgRatio43',
          '3:4': 'imgRatio34', '3:2': 'imgRatio32', '2:3': 'imgRatio23', '21:9': 'imgRatio219',
        };
        var imageRatioOptions = RATIO_OPTIONS.map(function (r) {
          return { value: r, label: t(imageRatioLabelKeys[r]) };
        });
        var curImgSize = textValue('defaultSize');
        if (SIZE_OPTIONS.indexOf(curImgSize) < 0) curImgSize = '1K';
        var curImgRatio = textValue('defaultRatio');
        if (RATIO_OPTIONS.indexOf(curImgRatio) < 0) curImgRatio = '1:1';
        var imgPx = (IMAGE_PIXELS[curImgRatio] || {})[curImgSize];

        var imageCard = h('div', { className: 'dsh-agnes-card', key: 'image' },
          h('div', { className: 'dsh-agnes-card-head' }, h(IconImage, { size: 14 }), t('groupImage')),
          h('div', { className: 'dsh-agnes-field' },
            fieldHead('imageModel', ['imageModel'], function () { return { imageModel: snapshot.base ? snapshot.base.imageModel : undefined }; }),
            selectEl(
              imgModelVal === '' ? IMAGE_MODEL_CATALOG[0].id : imgModelVal,
              modelOptions(IMAGE_MODEL_CATALOG, imgModelVal),
              onImageModelChange, 'im'),
            imageAdapted ? h('div', { className: 'dsh-agnes-hint' }, t('adaptedNotice')) : null,
            hintText('imageModelHint')),
          h('div', { className: 'dsh-agnes-field' },
            fieldHead('defaultSize', ['defaultSize'], function () { return { defaultSize: snapshot.base ? snapshot.base.defaultSize : undefined }; }),
            selectEl(curImgSize, imageSizeOptions, function (v) { stage('defaultSize', v); }),
            hintText('defaultSizeHint')),
          h('div', { className: 'dsh-agnes-field' },
            fieldHead('defaultRatio', ['defaultRatio'], function () { return { defaultRatio: snapshot.base ? snapshot.base.defaultRatio : undefined }; }),
            selectEl(curImgRatio, imageRatioOptions, function (v) { stage('defaultRatio', v); }),
            h('div', { className: 'dsh-agnes-hint' },
              t('defaultRatioHint'),
              imgPx ? ' · ' + t('outputPx').replace('{px}', imgPx) : null)),
        );

        // ---- 视频组 ----
        // 参数体系按模型名自适应:含 "2.5"(如 agnes-video-2.5 / 2.5-flash)走秒数制。
        // 注意 textValue 含草稿:下拉切换后表单形态立即跟随新模型。
        var vidModelVal = textValue('videoModel');
        var is25 = /2\.5/.test(vidModelVal);
        var isFlash = /flash/i.test(vidModelVal);
        // 切换模型 → 模型名 + 推荐默认参数一起暂存(flash 的 720P 约束也在此收敛)。
        var onVideoModelChange = function (v) {
          stage('videoModel', v);
          var preset = VIDEO_MODEL_PRESET;
          stageMany(Object.keys(preset).map(function (field) { return [field, preset[field]]; }));
        };
        var videoAdapted = hasDraft(['videoModel'])
          && Object.keys(VIDEO_MODEL_PRESET).some(function (f) { return drafts[f] !== undefined; });
        var curW = numericValue('videoWidth');
        var curH = numericValue('videoHeight');
        var matched = canvasLookup(curW, curH);
        var curRatio = matched ? matched.ratio : '16:9';
        var curTier = matched ? matched.tier : '720p';
        var canvasRatioOptions = VIDEO_RATIOS.map(function (r) {
          return { value: r, label: t('ratio' + r.replace(':', '')) };
        });
        var tierLabelKeys = { '480p': 'tier480p', '720p': 'tier720p', '1080p': 'tier1080p' };
        var canvasTierOptions = is25
          ? VIDEO25_SIZES.map(function (s) { return { value: s, label: t('tier25' + s) }; })
          : VIDEO_TIERS.map(function (tier) { return { value: tier, label: t(tierLabelKeys[tier]) }; });
        var applyCanvas = function (ratio, tier) {
          var px = VIDEO_CANVAS[tier][ratio];
          stageMany([['videoWidth', String(px[0])], ['videoHeight', String(px[1])]]);
        };
        var commitW = matched ? VIDEO_CANVAS[curTier][curRatio][0] : curW;
        var commitH = matched ? VIDEO_CANVAS[curTier][curRatio][1] : curH;
        var size25Raw = textValue('video25Size');
        var size25Stored = VIDEO25_SIZES.indexOf(size25Raw) >= 0 ? size25Raw : '720P';
        // flash 锁定 720P:显示值强制 720P;历史保存的其他档位在提交时由 Host 收敛。
        var size25 = isFlash ? '720P' : size25Stored;
        var flashSizeMismatch = isFlash && size25Stored !== '720P';
        var secondsRaw = numericValue('video25Seconds');
        var seconds25Value = typeof secondsRaw === 'number' && secondsRaw >= 4 && secondsRaw <= 12 ? secondsRaw : 5;

        var curFramesRaw = numericValue('videoNumFrames');
        var frameMatch = FRAME_PRESETS.indexOf(String(curFramesRaw)) >= 0 ? String(curFramesRaw) : 'custom';
        var curFps = numericValue('videoFrameRate');
        var fpsMatch = FPS_PRESETS.indexOf(String(curFps)) >= 0 ? String(curFps) : 'custom';
        var durationOptions = FRAME_PRESETS.map(function (f) {
          return { value: f, label: t('dur' + f) };
        }).concat([{ value: 'custom', label: t('customOption') }]);
        var fpsOptions = FPS_PRESETS.map(function (f) {
          return { value: f, label: t('fps' + f) };
        }).concat([{ value: 'custom', label: t('customOption') }]);

        var estimatedSeconds = null;
        if (!is25 && typeof curFps === 'number' && curFps > 0 && typeof curFramesRaw === 'number') {
          estimatedSeconds = Math.round((curFramesRaw / curFps) * 10) / 10;
        }

        var canvasRow = h('div', { className: 'dsh-agnes-field' },
          fieldHead(
            'videoCanvas',
            is25 ? ['videoWidth', 'videoHeight', 'video25Size'] : ['videoWidth', 'videoHeight'],
            function () {
              return {
                videoWidth: snapshot.base ? snapshot.base.videoWidth : undefined,
                videoHeight: snapshot.base ? snapshot.base.videoHeight : undefined,
                video25Size: snapshot.base ? snapshot.base.video25Size : undefined,
              };
            }),
          h('div', { className: 'dsh-agnes-canvas' },
            selectEl(matched ? matched.ratio : 'custom',
              canvasRatioOptions.concat([{ value: 'custom', label: t('customOption') }]),
              function (r) { if (r !== 'custom') applyCanvas(r, curTier); }, 'vr'),
            is25
              ? selectEl(size25,
                  isFlash
                    ? [{ value: '720P', label: t('tier25720P') }]
                    : canvasTierOptions,
                  function (v) { stage('video25Size', v); }, 'vt',
                  isFlash ? { disabled: true } : undefined)
              : selectEl(matched ? matched.tier : 'custom',
                  canvasTierOptions.concat([{ value: 'custom', label: t('customOption') }]),
                  function (tier) { if (tier !== 'custom') applyCanvas(curRatio, tier); }, 'vt')),
          matched || is25 ? null : h('div', { className: 'dsh-agnes-canvas' },
            numberInput('videoWidth', { ph: '1280', min: 1, step: 1, labelKey: 'videoWidth' }),
            numberInput('videoHeight', { ph: '720', min: 1, step: 1, labelKey: 'videoHeight' })),
          h('div', { className: 'dsh-agnes-hint' },
            t(isFlash ? 'videoCanvasHint25Flash' : (is25 ? 'videoCanvasHint25' : 'videoCanvasHint')),
            flashSizeMismatch ? ' ' + t('flashSizeNote').replace('{v}', size25Stored) : null,
            is25
              ? ' · ' + t('commitAspect')
                  .replace('{ratio}', curRatio)
                  .replace('{size}', size25)
                  .replace('{n}', String(seconds25Value))
              : typeof commitW === 'number' && typeof commitH === 'number'
                ? ' · ' + t('commitPx').replace('{w}', String(commitW)).replace('{h}', String(commitH))
                : null));

        var durationRow = is25
          ? h('div', { className: 'dsh-agnes-field' },
              fieldHead('videoDuration25', ['video25Seconds'], function () {
                return { video25Seconds: snapshot.base ? snapshot.base.video25Seconds : undefined };
              }),
              selectEl(String(seconds25Value), VIDEO25_SECONDS.map(function (n) {
                return { value: String(n), label: n === 5 ? t('durSecRec').replace('{n}', String(n)) : t('durSec').replace('{n}', String(n)) };
              }), function (v) { stage('video25Seconds', v); }, 'vd'),
              hintText(isFlash ? 'videoDurationHint25Flash' : 'videoDurationHint25'))
          : h('div', { className: 'dsh-agnes-field' },
              fieldHead('videoDuration', ['videoNumFrames'], function () { return { videoNumFrames: snapshot.base ? snapshot.base.videoNumFrames : undefined }; }),
              selectEl(frameMatch, durationOptions, function (v) {
                if (v === 'custom') stage('videoNumFrames', formatValue(effective('videoNumFrames')));
                else stage('videoNumFrames', v);
              }),
              frameMatch === 'custom'
                ? numberInput('videoNumFrames', { ph: '121', min: 9, max: 441, step: 8, labelKey: 'videoNumFrames' })
                : null,
              h('div', { className: 'dsh-agnes-hint' },
                t('videoDurationHint'),
                estimatedSeconds !== null && !hasDraft(['videoNumFrames'])
                  ? ' · ' + t('secondsPerVideo').replace('{n}', String(estimatedSeconds))
                  : null));

        var fpsRow = is25 ? null : h('div', { className: 'dsh-agnes-field' },
          fieldHead('videoFps', ['videoFrameRate'], function () { return { videoFrameRate: snapshot.base ? snapshot.base.videoFrameRate : undefined }; }),
          selectEl(fpsMatch, fpsOptions, function (v) {
            if (v === 'custom') stage('videoFrameRate', formatValue(effective('videoFrameRate')));
            else stage('videoFrameRate', v);
          }),
          fpsMatch === 'custom'
            ? numberInput('videoFrameRate', { ph: '24', min: 1, max: 60, step: 1, labelKey: 'videoFrameRate' })
            : null,
          hintText('videoFpsHint'));

        var videoCard = h('div', { className: 'dsh-agnes-card', key: 'video' },
          h('div', { className: 'dsh-agnes-card-head' }, h(IconFilm, { size: 14 }), t('groupVideo')),
          h('div', { className: 'dsh-agnes-field' },
            fieldHead('videoModel', ['videoModel'], function () { return { videoModel: snapshot.base ? snapshot.base.videoModel : undefined }; }),
            selectEl(
              vidModelVal === '' ? VIDEO_MODEL_CATALOG[0].id : vidModelVal,
              modelOptions(VIDEO_MODEL_CATALOG, vidModelVal),
              onVideoModelChange, 'vm'),
            videoAdapted ? h('div', { className: 'dsh-agnes-hint' }, t('adaptedNotice')) : null,
            hintText('videoModelHint')),
          canvasRow,
          durationRow,
          fpsRow,
        );

        var statusBanner = null;
        if (statusState !== null) {
          var cls = statusState.kind === 'ok' ? 'dsh-agnes-banner-ok' : 'dsh-agnes-banner-error';
          var statusText = t(statusState.key)
            + (statusState.message ? ' — ' + statusState.message : '');
          statusBanner = h('div', { className: 'dsh-agnes-banner ' + cls }, statusText);
        }

        return h('div', { className: 'dsh-agnes-root' },
          h('div', { className: 'dsh-agnes-header' },
            h('span', { className: 'dsh-agnes-header-icon' }, h(IconSpark, { size: 16 })),
            h('div', { className: 'dsh-agnes-titles' },
              h('h2', { className: 'dsh-agnes-title' }, t('title')),
              h('p', { className: 'dsh-agnes-lede' }, t('lede')))),
          !writable ? h('div', { className: 'dsh-agnes-banner dsh-agnes-banner-warn' }, t('readonlyMode')) : null,
          statusBanner,
          imageCard,
          videoCard,
          h('div', { className: 'dsh-agnes-footer' },
            h('div', { className: 'dsh-agnes-footer-status' },
              invalidExists ? t('invalidBlock') : null),
            h('button', {
              type: 'button',
              className: 'dsh-agnes-btn dsh-agnes-btn-ghost',
              disabled: !busy && Object.keys(drafts).length === 0,
              onClick: discard,
            }, t('discard')),
            h('button', {
              type: 'button',
              className: 'dsh-agnes-btn dsh-agnes-btn-primary',
              disabled: !writable || busy || plan.length === 0 || invalidExists,
              onClick: save,
            }, busy ? t('saving') : t('save'))),
        );
      }

      /** 应用浏览器半侧:注册文案、样式与「Agnes」设置分区。 */
      function apply(ctx) {
        if (ctx.locale && typeof ctx.locale.register === 'function') {
          ctx.effect(function () {
            var off = ctx.locale.register(NS, DICTIONARIES);
            return function () { if (off) off(); };
          }, 'dsh-agnes: dictionaries');
        }
        ctx.effect(function () {
          injectStyles();
          return removeStyles;
        }, 'dsh-agnes: styles');

        ctx.inject(['settingsScope'], function (settingsCtx) {
          // web-ui 全家桶提供支持批量写入的桥接 scope;官方部署回落到 settingsScope。
          var binder = settingsCtx.get('webUiSettings');
          if (binder === undefined || binder === null || typeof binder.bind !== 'function') {
            binder = settingsCtx.settingsScope;
          }
          if (binder === undefined || binder === null || typeof binder.bind !== 'function') return;
          // bind 自身把 scope 的释放挂在调用方 fiber 上,无需手动 dispose。
          // 真实控制器是依赖 this 的类方法;这里包一层箭头式门面,
          // 让组件可以把 subscribe/getSnapshot 作为裸引用交给 useSyncExternalStore。
          var bound = binder.bind({ namespace: NS });
          var scope = {
            subscribe: function (cb) { return bound.subscribe(cb); },
            getSnapshot: function () { return bound.getSnapshot(); },
            set: function (field, value) { return bound.set(field, value); },
            unset: function (field) { return bound.unset(field); },
          };
          if (typeof bound.mutate === 'function') {
            scope.mutate = function (ops) { return bound.mutate(ops); };
          }

          ctx.slots.inject('settings.section', function () {
            return ctx.slots.register({
              name: 'settings.section',
              id: SECTION_ID,
              order: SECTION_ORDER,
              locale: NS,
              label: function () {
                try {
                  var label = ctx.locale.bind(NS)('title');
                  return typeof label === 'string' ? label : 'Agnes';
                } catch (_localeMissing) {
                  return 'Agnes';
                }
              },
            }, function (sectionProps) {
              return AgnesSection(sectionProps || {}, scope);
            });
          });
        });
      }

      exports.inject = ['slots', 'locale', 'settingsScope'];
      exports.apply = apply;
      exports.default = { apply: apply, inject: exports.inject };

      return module.exports;
    },
  });
})();
