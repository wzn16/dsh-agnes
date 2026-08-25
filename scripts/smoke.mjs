/**
 * 无依赖冒烟测试:服务端纯函数 + 客户端 bundle 注册/渲染路径。
 * 运行:node scripts/smoke.mjs(需先 pnpm build 生成 lib/)。
 */
import assert from 'node:assert'
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// ---------- 服务端:直接以类型剥离方式加载 TS 源 ----------
const { buildAgnesRequestBody } = await import(join(root, 'src/image.ts'))
const { buildAgnesVideoRequestBody } = await import(join(root, 'src/video.ts'))
const { assertConfig, Config } = await import(join(root, 'src/index.ts'))
const {
  IMAGE_MODEL_CATALOG, IMAGE_MODEL_IDS,
  VIDEO_MODEL_CATALOG, VIDEO_MODEL_IDS,
  imageModelPreset, videoModelPreset,
} = await import(join(root, 'src/models.ts'))

// 模型目录:三个文档模型的单一事实来源
assert.deepEqual(IMAGE_MODEL_IDS, ['agnes-image-2.1-flash'])
assert.deepEqual(VIDEO_MODEL_IDS, ['agnes-video-v2.0', 'agnes-video-2.5-flash'])
assert.equal(VIDEO_MODEL_CATALOG.every((m) => m.label && m.label.length > 0), true)
assert.equal(IMAGE_MODEL_CATALOG.every((m) => m.label && m.label.length > 0), true)
// 各模型推荐默认参数必须能通过整份配置校验(设置页自适应写入的就是这些值)
const presetOf = (videoModel) => ({
  imageModel: IMAGE_MODEL_IDS[0], defaultSize: '1K', defaultRatio: '1:1',
  videoModel,
  videoWidth: 1280, videoHeight: 720, videoNumFrames: 121, videoFrameRate: 24,
  video25Seconds: 5, video25Size: '720P',
})
for (const videoModel of VIDEO_MODEL_IDS) {
  const preset = videoModelPreset(videoModel)
  assert.doesNotThrow(() => assertConfig({ ...presetOf(videoModel), ...preset }))
}
assert.doesNotThrow(() => assertConfig({ ...presetOf(IMAGE_MODEL_IDS[0]), ...imageModelPreset(IMAGE_MODEL_IDS[0]) }))

// 模型来自设置而非硬编码
const imageDefaults = { model: 'agnes-image-9.9-beta', defaultSize: '2K', defaultRatio: '16:9' }
let body = buildAgnesRequestBody({ prompt: 'cat' }, imageDefaults)
assert.equal(body.model, 'agnes-image-9.9-beta')
assert.equal(body.size, '2K')
assert.equal(body.ratio, '16:9')
// 参数覆盖默认;非法参数回退默认
body = buildAgnesRequestBody({ prompt: 'x', size: '4K', ratio: '21:9' }, { model: 'm', defaultSize: '1K', defaultRatio: '1:1' })
assert.equal(body.size, '4K')
body = buildAgnesRequestBody({ prompt: 'x', size: '999' }, { model: 'm', defaultSize: '1K', defaultRatio: '1:1' })
assert.equal(body.size, '1K')
// 图生图走 extra_body.image
body = buildAgnesRequestBody({ prompt: 'e', image: ['https://a.b/c.png'], return_base64: true }, { model: 'm', defaultSize: '1K', defaultRatio: '1:1' })
assert.deepEqual(body.extra_body.image, ['https://a.b/c.png'])
assert.equal(body.extra_body.response_format, 'b64_json')

// 视频:省略参数回退设置默认值;seed 不设默认
const videoDefaults = { model: 'agnes-video-v3.0', width: 1280, height: 720, numFrames: 81, frameRate: 30 }
body = buildAgnesVideoRequestBody({ prompt: 'dog' }, videoDefaults)
assert.equal(body.model, 'agnes-video-v3.0')
assert.equal(body.width, 1280)
assert.equal(body.num_frames, 81)
assert.equal('seed' in body, false)
// 关键帧模式与显式覆盖
body = buildAgnesVideoRequestBody({ prompt: 'k', keyframes: ['https://a/1.png', 'https://a/2.png'], num_frames: 441, frame_rate: 24 }, videoDefaults)
assert.equal(body.num_frames, 441)
assert.deepEqual(body.extra_body, { image: ['https://a/1.png', 'https://a/2.png'], mode: 'keyframes' })
// 非法默认值在请求构建时报错
assert.throws(() => buildAgnesVideoRequestBody({ prompt: 'x' }, { ...videoDefaults, numFrames: 400 }), /8n\+1|441/)
assert.throws(() => buildAgnesVideoRequestBody({ prompt: 'x' }, { ...videoDefaults, frameRate: 90 }), /1–60/)

// 视频 2.5 系列(含 flash):秒数制参数体系自适应
const d25 = { model: 'agnes-video-2.5-flash', width: 1280, height: 720, numFrames: 121, frameRate: 24, seconds25: 5, size25: '720P' }
body = buildAgnesVideoRequestBody({ prompt: 's' }, d25)
assert.equal(body.mode, 'text')
assert.equal(body.seconds, '5')
assert.equal(body.size, '720P')
assert.equal(body.aspect_ratio, '16:9')
assert.equal(['width', 'height', 'num_frames', 'frame_rate', 'negative_prompt'].some((k) => k in body), false)
// 单张 image → keyframe 首帧;两张 keyframes → 首尾帧;三张以上 → reference/images
body = buildAgnesVideoRequestBody({ prompt: 'i', image: 'https://a/1.png' }, d25)
assert.equal(body.mode, 'keyframe')
assert.equal(body.first_frame, 'https://a/1.png')
body = buildAgnesVideoRequestBody({ prompt: 'k', keyframes: ['https://a/1.png', 'https://a/2.png'] }, d25)
assert.equal(body.mode, 'keyframe')
assert.equal(body.last_frame, 'https://a/2.png')
body = buildAgnesVideoRequestBody({ prompt: 'r', keyframes: ['https://a/1.png', 'https://a/2.png', 'https://a/3.png'] }, d25)
assert.equal(body.mode, 'reference')
assert.deepEqual(body.images, ['https://a/1.png', 'https://a/2.png', 'https://a/3.png'])
// flash:size25 ≠ 720P 收敛为 720P;非 flash 保留所选档位
body = buildAgnesVideoRequestBody({ prompt: 'f' }, { ...d25, size25: '2K' })
assert.equal(body.size, '720P')
body = buildAgnesVideoRequestBody({ prompt: 'n' }, { ...d25, model: 'agnes-video-2.5', size25: '960P' })
assert.equal(body.size, '960P')
// 显式帧数/帧率 → 换算整秒并夹到 4–12
body = buildAgnesVideoRequestBody({ prompt: 't', num_frames: 441, frame_rate: 24 }, d25)
assert.equal(body.seconds, '12')
body = buildAgnesVideoRequestBody({ prompt: 't2', num_frames: 81, frame_rate: 30 }, d25)
assert.equal(body.seconds, '4')
// flash reference 图片上限
assert.throws(
  () => buildAgnesVideoRequestBody(
    { prompt: 'x', keyframes: ['https://a/1.png', 'https://a/2.png', 'https://a/3.png', 'https://a/4.png', 'https://a/5.png', 'https://a/6.png'] },
    d25,
  ),
  /最多 5 张/,
)
// 画幅就近匹配(竖版 720×1280 → 9:16)
body = buildAgnesVideoRequestBody({ prompt: 'v' }, { ...d25, width: 720, height: 1280 })
assert.equal(body.aspect_ratio, '9:16')

// assertConfig:插件加载与设置写入共用的校验
const validConfig = {
  imageModel: 'agnes-image-2.1-flash', defaultSize: '1K', defaultRatio: '1:1',
  videoModel: 'agnes-video-v2.0', videoWidth: 1280, videoHeight: 720, videoNumFrames: 121, videoFrameRate: 24,
  video25Seconds: 5, video25Size: '720P',
}
assert.doesNotThrow(() => assertConfig(validConfig))
assert.throws(() => assertConfig({ ...validConfig, imageModel: '' }), /imageModel/)
assert.throws(() => assertConfig({ ...validConfig, videoNumFrames: 120 }), /8n\+1/)
assert.throws(() => assertConfig({ ...validConfig, videoWidth: 0 }), /videoWidth/)
assert.throws(() => assertConfig({ ...validConfig, video25Seconds: 13 }), /video25Seconds/)
assert.throws(() => assertConfig({ ...validConfig, video25Size: '4K' }), /video25Size/)

// schema 默认值 = 文档当前值;配置可覆盖
const resolved = Config({})
assert.equal(resolved.imageModel, 'agnes-image-2.1-flash')
assert.equal(resolved.videoModel, 'agnes-video-v2.0')
assert.equal(resolved.videoWidth, 1280)
assert.equal(resolved.video25Seconds, 5)
assert.equal(resolved.video25Size, '720P')
const overridden = Config({ imageModel: 'agnes-image-3.0-alpha', videoNumFrames: 241 })
assert.equal(overridden.imageModel, 'agnes-image-3.0-alpha')
assert.equal(overridden.videoNumFrames, 241)

console.log('server smoke OK')

// ---------- 客户端:模拟 window/document/React,验证注册与渲染 ----------
const registrations = new Map()
globalThis.window = { __ModuleLoader__: { load(def) { registrations.set(def.id, def.factory) } } }
globalThis.document = {
  documentElement: { lang: 'zh' },
  querySelector: () => null,
  createElement: () => ({ dataset: {} }),
  head: { appendChild: () => {} },
}

new Function(fs.readFileSync(join(root, 'lib/client.js'), 'utf8'))()
const factory = registrations.get('dsh-agnes')
assert.equal(typeof factory, 'function', 'factory 应被注册')

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe, get) => get(),
}

let currentSnap = {
  status: 'ready', writable: true, revision: 7,
  value: {
    imageModel: 'm-img', defaultSize: '1K', defaultRatio: '1:1',
    videoModel: 'm-vid', videoWidth: 1280, videoHeight: 720, videoNumFrames: 121, videoFrameRate: 24,
  },
  base: null, user: null,
}
// 与真实 SettingsScopeController 同形:依赖 this 的类方法。
// 若客户端再把方法作裸引用传给 useSyncExternalStore,这里会像浏览器一样抛错。
class FakeScope {
  subscribe(listener) { if (this === undefined) throw new TypeError('subscribe 丢失 this'); return () => {} }
  getSnapshot() { if (this === undefined) throw new TypeError('getSnapshot 丢失 this'); return currentSnap }
  set(field, value) { if (this === undefined) throw new TypeError('set 丢失 this'); return Promise.resolve() }
  unset(field) { if (this === undefined) throw new TypeError('unset 丢失 this'); return Promise.resolve() }
}
const binder = {
  bind(spec) {
    assert.deepEqual(spec, { namespace: 'agnes' })
    return new FakeScope()
  },
}
let registered = null
let injectFn = null
const ctx = {
  effect() {},
  inject(_services, cb) { cb({ get(n) { return n === 'webUiSettings' ? undefined : binder }, settingsScope: binder }) },
  locale: {
    register(ns, dicts) {
      assert.equal(ns, 'agnes')
      assert.ok(dicts.zh.title && dicts.en.title)
      return () => {}
    },
    bind(ns) { return (k) => `${ns}:${k}` },
  },
  slots: {
    inject(name, fn) {
      assert.equal(name, 'settings.section')
      injectFn = fn
      registered = null
    },
    register(opts, comp) { registered = { opts, comp }; return () => {} },
  },
}

const clientExports = factory((name) => { assert.equal(name, 'react'); return fakeReact })
assert.equal(typeof clientExports.apply, 'function')
assert.deepEqual(clientExports.inject, ['slots', 'locale', 'settingsScope'])
clientExports.apply(ctx)
assert.equal(typeof injectFn, 'function', 'slots.inject 回调应存在')
const disposer = injectFn()
assert.ok(registered, '应完成 settings.section 注册')
assert.equal(registered.opts.id, 'agnes')
assert.equal(registered.opts.name, 'settings.section')
assert.equal(typeof registered.opts.label(), 'string')
assert.equal(typeof disposer, 'function')

// ready 态渲染:header + 两组卡片 + 页脚
let el = registered.comp({}, null)
let kids = el.children.flat().filter(Boolean)
assert.ok(kids.length >= 3, `ready 态应有 header/卡片/页脚,实际 ${kids.length}`)
const cards = kids.filter((k) => k && k.props && String(k.props.className || '').includes('dsh-agnes-card'))
assert.equal(cards.length, 2, '图像/视频两组卡片')
assert.equal(cards[0].children.flat().filter(Boolean).length - 1, 3, '图像组 3 个字段')
assert.equal(cards[1].children.flat().filter(Boolean).length - 1, 4, '视频组 4 个字段(模型/画幅/时长/帧率)')

// 预设路径:1280×720 命中画幅表 → 只出现 select,不出现精确像素输入
function countTypes(node, type, acc = { n: 0, sel: 0 }) {
  if (!node || typeof node !== 'object') return acc
  if (node.props) {
    if (node.type === 'input' && node.props.type === 'number') acc.n += 1
    if (node.type === 'select') acc.sel += 1
  }
  for (const c of [].concat(node.children ?? [])) countTypes(c, type, acc)
  for (const c of [].concat(node.props?.children ?? [])) countTypes(c, type, acc)
  return acc
}
function collectSelects(node, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (node.type === 'select') acc.push(node)
  for (const c of [].concat(node.children ?? [])) collectSelects(c, acc)
  for (const c of [].concat(node.props?.children ?? [])) collectSelects(c, acc)
  return acc
}
function collectTexts(node, acc = []) {
  if (typeof node === 'string') { acc.push(node); return acc }
  if (node === null || node === undefined || typeof node !== 'object') return acc
  for (const c of [].concat(node.children ?? [])) collectTexts(c, acc)
  for (const c of [].concat(node.props?.children ?? [])) collectTexts(c, acc)
  return acc
}
function optionValues(sel) {
  // 仿真元素把 children 放在顶层;真实 React 在 props.children。两处都收并拍平。
  return [].concat(sel.props?.children ?? [], sel.children ?? [])
    .flat(Infinity)
    .filter((o) => o !== null && typeof o === 'object' && o.type === 'option')
    .map((o) => o.props.value)
}
let presetScan = countTypes(el)
assert.ok(presetScan.n === 0, `预设路径不应有数字输入,实际 ${presetScan.n}`)

// 模型字段是下拉选择:目录模型为选项;未知已存值保留为「(当前)」选项
function collectInputs(node, acc = []) {
  if (!node || typeof node !== 'object') return acc
  if (node.type === 'input') acc.push(node)
  for (const c of [].concat(node.children ?? [])) collectInputs(c, acc)
  for (const c of [].concat(node.props?.children ?? [])) collectInputs(c, acc)
  return acc
}
assert.equal(collectInputs(el).some((i) => i.props.type === 'text'), false, '模型不再使用自由文本输入')
const selectsPreset = collectSelects(el)
const imgModelSel = selectsPreset.find((s) => optionValues(s).includes('agnes-image-2.1-flash'))
assert.ok(imgModelSel, '图像模型应为含目录 ID 的下拉框')
const vidModelSel = selectsPreset.find((s) => optionValues(s).includes('agnes-video-v2.0'))
assert.ok(vidModelSel, '视频模型应为含目录 ID 的下拉框')
assert.deepEqual(optionValues(vidModelSel), ['agnes-video-v2.0', 'agnes-video-2.5-flash', 'm-vid'], '未知已存值保留为当前选项')
assert.equal(imgModelSel.props.value, 'm-img')
assert.equal(vidModelSel.props.value, 'm-vid')

// 自定义路径:旧默认 1152×768 不在画幅表 → 显示精确宽高输入
currentSnap = {
  ...currentSnap,
  value: { ...currentSnap.value, videoWidth: 1152, videoHeight: 768 },
}
el = registered.comp({}, null)
let customScan = countTypes(el)
assert.ok(customScan.n >= 2, `自定义路径应出现宽/高数字输入,实际 ${customScan.n}`)

// 恢复预设快照
currentSnap = {
  ...currentSnap,
  value: { ...currentSnap.value, videoWidth: 1280, videoHeight: 720 },
}
el = registered.comp({}, null)
assert.equal(collectSelects(el).length, 8, 'V2.0 路径应有 8 个下拉框(图像 3 + 视频 5)')

// flash 场景:2.5 系列隐藏帧率行;档位锁定单选 720P(禁用),历史非 720P 档位给出收敛提示
currentSnap = {
  ...currentSnap,
  value: {
    ...currentSnap.value,
    videoModel: 'agnes-video-2.5-flash',
    video25Seconds: 5,
    video25Size: '960P',
  },
}
el = registered.comp({}, null)
let flashScan = countTypes(el)
assert.equal(flashScan.n, 0, 'flash 路径不应有数字输入')
const flashSelects = collectSelects(el)
assert.equal(flashSelects.length, 7, 'flash 路径应比 V2.0 路径少一个帧率下拉框')
const tierSel = flashSelects.find((s) => optionValues(s).length === 1 && optionValues(s)[0] === '720P')
assert.ok(tierSel, 'flash 档位应锁定为单选 720P')
assert.equal(tierSel.props.disabled, true, 'flash 档位下拉应禁用')
assert.equal(tierSel.props.value, '720P', 'flash 档位显示值强制 720P')
const flashText = collectTexts(el).join('')
assert.ok(flashText.includes('960P'), '历史保存的 960P 档位应出现在收敛提示里')

// 只读态横幅
currentSnap = { ...currentSnap, writable: false }
el = registered.comp({}, null)
kids = el.children.flat().filter(Boolean)
assert.ok(kids.some((k) => k && k.props && String(k.props.className || '').includes('banner-warn')), '只读态应有横幅')

// 加载态
currentSnap = { status: 'loading', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false }
el = registered.comp({}, null)
assert.equal(el.children.filter(Boolean).length, 1, 'loading 态只有一个横幅')

console.log('client smoke OK')
console.log('ALL SMOKE TESTS PASSED')
