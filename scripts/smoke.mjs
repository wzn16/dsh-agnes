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

// assertConfig:插件加载与设置写入共用的校验
const validConfig = {
  imageModel: 'agnes-image-2.1-flash', defaultSize: '1K', defaultRatio: '1:1',
  videoModel: 'agnes-video-v2.0', videoWidth: 1152, videoHeight: 768, videoNumFrames: 121, videoFrameRate: 24,
}
assert.doesNotThrow(() => assertConfig(validConfig))
assert.throws(() => assertConfig({ ...validConfig, imageModel: '' }), /imageModel/)
assert.throws(() => assertConfig({ ...validConfig, videoNumFrames: 120 }), /8n\+1/)
assert.throws(() => assertConfig({ ...validConfig, videoWidth: 0 }), /videoWidth/)

// schema 默认值 = 文档当前值;配置可覆盖
const resolved = Config({})
assert.equal(resolved.imageModel, 'agnes-image-2.1-flash')
assert.equal(resolved.videoModel, 'agnes-video-v2.0')
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
    videoModel: 'm-vid', videoWidth: 1152, videoHeight: 768, videoNumFrames: 121, videoFrameRate: 24,
  },
  base: null, user: null,
}
const binder = {
  bind(spec) {
    assert.deepEqual(spec, { namespace: 'agnes' })
    return { subscribe: () => () => {}, getSnapshot: () => currentSnap }
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
assert.equal(cards[1].children.flat().filter(Boolean).length - 1, 5, '视频组 5 个字段')

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
