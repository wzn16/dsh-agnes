/**
 * dsh-agnes — 浏览器半侧(设置页的「Agnes」标签页)。
 *
 * 以惰性 CJS 工厂格式注册到 DSH 客户端模块系统:
 * Host 扫描到本包 package.json 的 `dsh.client.platform: "web"` 声明后,
 * 经 /plugins/dsh-agnes/client.js 伺服本文件并在浏览器里物化。
 *
 * 本页在设置页贡献一个 `settings.section` 条目(标签页「Agnes」),
 * 通过客户端 settings scope 绑定 Host 端注册的 `agnes` 设置命名空间,
 * 提供图像/视频生成默认参数(含模型名称)的暂存-保存-重置编辑流。
 * 模型名称是自由文本:上游升级版本时在此改名即可,无需改代码。
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

      /** 与 src/image.ts 的 SIZE_TIERS / RATIOS 保持一致的选项。 */
      var SIZE_OPTIONS = ['1K', '2K', '3K', '4K'];
      var RATIO_OPTIONS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'];

      // ---- 文案(zh 为键集来源,en 对照补全) ----
      var zh = {
        title: 'Agnes',
        lede: 'Agnes AI 图像与视频生成工具的默认参数。模型随上游版本升级时在此改名即可,无需更新插件。',
        groupImage: '图像生成默认值',
        groupVideo: '视频生成默认值',
        imageModel: '图像模型名称',
        imageModelHint: '调用 agnes_image_generate 实际使用的模型;升级版本(如 agnes-image-3.x)时改成新名称即可。',
        defaultSize: '默认尺寸档位',
        defaultSizeHint: '工具调用省略 size 时使用;1:1 下 1K≈1024 边长。',
        defaultRatio: '默认宽高比',
        defaultRatioHint: '与尺寸档位配合;需要 16:9 素材选 2K + 16:9 后再裁剪。',
        videoModel: '视频模型名称',
        videoModelHint: '调用 agnes_video_generate 实际使用的模型。',
        videoWidth: '默认宽度(px)',
        videoWidthHint: '省略 width 时使用;不支持的尺寸会被 API 标准化到 480p/720p/1080p 档位。',
        videoHeight: '默认高度(px)',
        videoHeightHint: '省略 height 时使用;同上会被标准化。',
        videoNumFrames: '默认帧数',
        videoNumFramesHint: '必须 ≤441 且满足 8n+1;帧率 24 下 81≈3 秒、121≈5 秒、241≈10 秒、441≈18 秒。',
        videoFrameRate: '默认帧率',
        videoFrameRateHint: '支持 1–60;更流畅的运动用 24 或 30。',
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
        lede: 'Defaults for the Agnes AI image & video generation tools. Point model names at newer upstream versions without touching code.',
        groupImage: 'Image defaults',
        groupVideo: 'Video defaults',
        imageModel: 'Image model',
        imageModelHint: 'The model agnes_image_generate calls; rename it (e.g. agnes-image-3.x) when upstream upgrades.',
        defaultSize: 'Default size tier',
        defaultSizeHint: 'Used when a call omits size; 1K ≈ 1024px side at 1:1.',
        defaultRatio: 'Default aspect ratio',
        defaultRatioHint: 'Paired with the size tier; pick 2K + 16:9 for desktop wallpapers, then crop.',
        videoModel: 'Video model',
        videoModelHint: 'The model agnes_video_generate calls.',
        videoWidth: 'Default width (px)',
        videoWidthHint: 'Used when a call omits width; unsupported sizes are normalized to 480p/720p/1080p tiers.',
        videoHeight: 'Default height (px)',
        videoHeightHint: 'Used when a call omits height; normalized the same way.',
        videoNumFrames: 'Default frame count',
        videoNumFramesHint: 'Must be ≤441 and follow 8n+1; at frame rate 24: 81≈3s, 121≈5s, 241≈10s, 441≈18s.',
        videoFrameRate: 'Default frame rate',
        videoFrameRateHint: 'Supported range 1–60; use 24 or 30 for smoother motion.',
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

      // ---- 字段定义 ----
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

      var GROUPS = [
        { id: 'image', titleKey: 'groupImage' },
        { id: 'video', titleKey: 'groupVideo' },
      ];

      var FIELDS = [
        { field: 'imageModel', group: 'image', kind: 'text', parse: parseNonEmptyText, ph: 'agnes-image-2.1-flash' },
        { field: 'defaultSize', group: 'image', kind: 'select', options: SIZE_OPTIONS, parse: parseNonEmptyText },
        { field: 'defaultRatio', group: 'image', kind: 'select', options: RATIO_OPTIONS, parse: parseNonEmptyText },
        { field: 'videoModel', group: 'video', kind: 'text', parse: parseNonEmptyText, ph: 'agnes-video-v2.0' },
        { field: 'videoWidth', group: 'video', kind: 'number', parse: parseIntPositive, ph: '1152', min: 1, step: 1 },
        { field: 'videoHeight', group: 'video', kind: 'number', parse: parseIntPositive, ph: '768', min: 1, step: 1 },
        { field: 'videoNumFrames', group: 'video', kind: 'number', parse: parseFrameCount, ph: '121', min: 9, max: 441, step: 8 },
        { field: 'videoFrameRate', group: 'video', kind: 'number', parse: parseFrameRate, ph: '24', min: 1, max: 60, step: 1 },
      ];
      var FIELD_BY_NAME = {};
      FIELDS.forEach(function (f) { FIELD_BY_NAME[f.field] = f; });

      function formatValue(value) {
        return value === undefined || value === null ? '' : String(value);
      }

      function userHasKey(userLayer, field) {
        return userLayer !== undefined && userLayer !== null
          && typeof userLayer === 'object'
          && Object.prototype.hasOwnProperty.call(userLayer, field);
      }

      // ---- 样式 ----
      var CSS_TEXT = [
        '.dsh-agnes-root { display:flex; flex-direction:column; gap:14px; width:100%; box-sizing:border-box; padding:4px 4px 12px 4px; color:var(--dsw-alias-label-primary,#0f1115); }',
        '.dsh-agnes-root *, .dsh-agnes-root *::before, .dsh-agnes-root *::after { box-sizing:border-box; }',
        '.dsh-agnes-header { display:flex; align-items:flex-start; gap:12px; padding:4px 0 2px 0; }',
        '.dsh-agnes-header-icon { flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:8px; background:var(--dsw-alias-bg-module-platform,#f5f6f7); color:var(--dsw-alias-label-secondary,#61666b); margin-top:2px; }',
        '.dsh-agnes-titles { display:flex; flex-direction:column; gap:2px; min-width:0; }',
        '.dsh-agnes-title { margin:0; font-size:18px; font-weight:600; line-height:1.3; color:var(--dsw-alias-label-primary,#0f1115); }',
        '.dsh-agnes-lede { margin:0; font-size:13px; line-height:1.5; color:var(--dsw-alias-label-tertiary,#86909c); }',
        '.dsh-agnes-banner { padding:8px 12px; border-radius:8px; font-size:12.5px; line-height:1.5; }',
        '.dsh-agnes-banner-warn { background:var(--dsw-alias-bg-module-platform,#f5f6f7); color:var(--dsw-alias-label-secondary,#61666b); border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08)); }',
        '.dsh-agnes-banner-error { background:var(--dsw-alias-interactive-bg-hover-danger,rgba(239,68,68,.1)); color:var(--dsw-alias-state-error-primary,#dc2626); border:1px solid var(--dsw-alias-state-error-secondary,rgba(220,38,38,.3)); }',
        '.dsh-agnes-banner-ok { background:var(--dsw-alias-state-success-tertiary,rgba(34,197,94,.12)); color:var(--dsw-alias-state-success-primary,#16a34a); border:1px solid var(--dsw-alias-state-success-secondary,rgba(34,197,94,.3)); }',
        '.dsh-agnes-card { border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08)); border-radius:12px; background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.02)); overflow:hidden; }',
        '.dsh-agnes-card-head { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13px; font-weight:600; color:var(--dsw-alias-label-secondary,#61666b); border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06)); background:var(--dsw-alias-bg-layer-2,#ffffff); }',
        '.dsh-agnes-card-head svg { flex-shrink:0; }',
        '.dsh-agnes-field { display:flex; flex-direction:column; gap:4px; padding:12px 14px; }',
        '.dsh-agnes-field + .dsh-agnes-field { border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.06)); }',
        '.dsh-agnes-field-head { display:flex; align-items:center; gap:8px; min-height:20px; }',
        '.dsh-agnes-label { flex:1; min-width:0; font-size:13px; font-weight:500; line-height:1.5; }',
        '.dsh-agnes-badge { white-space:nowrap; background:var(--dsw-alias-bg-module-platform,#f5f6f7); color:var(--dsw-alias-label-secondary,#61666b); border-radius:999px; padding:1px 8px; font-size:11px; font-weight:500; line-height:17px; }',
        '.dsh-agnes-reset { font:inherit; font-size:12px; line-height:1.5; color:var(--dsw-alias-label-secondary,#61666b); cursor:pointer; background:none; border:none; padding:0; }',
        '.dsh-agnes-reset:hover:not(:disabled) { color:var(--dsw-alias-label-primary,#0f1115); }',
        '.dsh-agnes-reset:disabled { cursor:default; opacity:.45; }',
        '.dsh-agnes-input, .dsh-agnes-select { height:34px; width:100%; font:inherit; font-size:13px; line-height:1.5; color:var(--dsw-alias-label-primary,#0f1115); background:var(--dsw-alias-bg-layer-3,#ffffff); border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1)); border-radius:8px; padding:0 12px; outline:none; transition:border-color .15s; }',
        '.dsh-agnes-input:focus, .dsh-agnes-select:focus { border-color:var(--dsw-alias-brand-primary,#3b82f6); }',
        '.dsh-agnes-input[data-invalid="true"] { border-color:var(--dsw-alias-state-error-primary,#dc2626); }',
        '.dsh-agnes-input::placeholder { color:var(--dsw-alias-label-dimmed,#a4abb3); }',
        '.dsh-agnes-hint { font-size:12px; line-height:1.5; color:var(--dsw-alias-label-tertiary,#86909c); }',
        '.dsh-agnes-error-text { font-size:12px; line-height:1.5; color:var(--dsw-alias-state-error-primary,#dc2626); }',
        '.dsh-agnes-footer { display:flex; align-items:center; gap:10px; padding-top:2px; }',
        '.dsh-agnes-footer-status { flex:1; min-width:0; font-size:12.5px; color:var(--dsw-alias-state-error-primary,#dc2626); }',
        '.dsh-agnes-btn { height:32px; padding:0 14px; border-radius:8px; font:inherit; font-size:13px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; transition:background .15s,border-color .15s,opacity .15s; }',
        '.dsh-agnes-btn:disabled { opacity:.45; cursor:default; }',
        '.dsh-agnes-btn-primary { border:1px solid transparent; background:var(--dsw-alias-brand-primary,#3b82f6); color:#fff; }',
        '.dsh-agnes-btn-primary:hover:not(:disabled) { filter:brightness(1.05); }',
        '.dsh-agnes-btn-ghost { border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1)); background:transparent; color:var(--dsw-alias-label-primary,#0f1115); }',
        '.dsh-agnes-btn-ghost:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05)); }',
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

      /** 把计划写为单字段操作;batch 面可用时走一次 mutate,否则逐字段写入并回读确认。 */
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

        var stageClear = useCallback(function (fieldName, baseValue) {
          setStatusState(null);
          setDrafts(function (prev) {
            var next = Object.assign({}, prev);
            next[fieldName] = { text: formatValue(baseValue), clear: true };
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

        var estimatedSeconds = null;
        if (typeof snapshot.value.videoFrameRate === 'number' && snapshot.value.videoFrameRate > 0
          && typeof snapshot.value.videoNumFrames === 'number') {
          estimatedSeconds = Math.round((snapshot.value.videoNumFrames / snapshot.value.videoFrameRate) * 10) / 10;
        }

        var renderField = function (spec) {
          var draft = drafts[spec.field];
          var stagedText = draft && !draft.clear ? draft.text : undefined;
          var shownText = stagedText !== undefined ? stagedText : formatValue(effective(spec.field));
          var invalid = stagedText !== undefined && spec.parse(stagedText) === undefined;
          var overridden = userHasKey(snapshot.user, spec.field);
          var dirtyHere = draft !== undefined;
          var invalidText = spec.kind === 'text' ? t('invalidEmpty') : t('invalidNumber');
          return h('div', { className: 'dsh-agnes-field', key: spec.field },
            h('div', { className: 'dsh-agnes-field-head' },
              h('span', { className: 'dsh-agnes-label' }, t(spec.field)),
              overridden ? h('span', { className: 'dsh-agnes-badge' }, t('overridden')) : null,
              h('button', {
                type: 'button',
                className: 'dsh-agnes-reset',
                disabled: !writable || (!overridden && !dirtyHere),
                onClick: function () { stageClear(spec.field, snapshot.base ? snapshot.base[spec.field] : undefined); },
                title: t('reset'),
              }, t('reset'))),
            spec.kind === 'select'
              ? h('select', {
                  className: 'dsh-agnes-select',
                  value: shownText,
                  disabled: !writable,
                  onChange: function (e) { stage(spec.field, e.target.value); },
                }, spec.options.map(function (option) {
                  return h('option', { key: option, value: option }, option);
                }))
              : h('input', {
                  className: 'dsh-agnes-input',
                  type: spec.kind === 'number' ? 'number' : 'text',
                  value: shownText,
                  placeholder: spec.ph,
                  min: spec.min,
                  max: spec.max,
                  step: spec.step,
                  spellCheck: false,
                  'data-invalid': invalid ? 'true' : 'false',
                  disabled: !writable,
                  onChange: function (e) { stage(spec.field, e.target.value); },
                }),
            h('div', { className: 'dsh-agnes-hint' },
              t(spec.field + 'Hint'),
              spec.field === 'videoNumFrames' && estimatedSeconds !== null && !dirtyHere
                ? ' · ' + t('secondsPerVideo').replace('{n}', String(estimatedSeconds))
                : null),
            invalid ? h('div', { className: 'dsh-agnes-error-text' }, invalidText) : null,
          );
        };

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
          GROUPS.map(function (group) {
            return h('div', { className: 'dsh-agnes-card', key: group.id },
              h('div', { className: 'dsh-agnes-card-head' },
                group.id === 'image' ? h(IconImage, { size: 14 }) : h(IconFilm, { size: 14 }),
                t(group.titleKey)),
              FIELDS.filter(function (spec) { return spec.group === group.id; }).map(renderField));
          }),
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
          var scope = binder.bind({ namespace: NS });

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
