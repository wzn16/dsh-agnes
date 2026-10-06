import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ApiSite } from './http.ts'

import { applyAgnesImageTool, DEFAULT_IMAGE_MODEL, RATIOS, SIZE_TIERS } from './image.ts'
import { applyAgnesVideoTool, DEFAULT_VIDEO_MODEL, VIDEO25_SIZES, type Video25Size } from './video.ts'
import { IMAGE_MODEL_IDS, VIDEO_MODEL_IDS } from './models.ts'

export { IMAGE_MODEL_CATALOG, IMAGE_MODEL_IDS, VIDEO_MODEL_CATALOG, VIDEO_MODEL_IDS } from './models.ts'
export { imageModelPreset, videoModelPreset, type ImageModelPreset, type VideoModelPreset } from './models.ts'
export type { AgnesModelOption } from './models.ts'
export const name = 'dsh-agnes'

/**
 * 插件注册工具前需等待 tools 服务就绪(0.2.x 起 HTTP 请求走 node 原生 fetch,
 * 不再依赖 shell 服务)。
 */
export const inject = ['tools'] as const

/** 支持的尺寸档位。 */
export type AgnesSizeTier = typeof SIZE_TIERS[number]

/** 支持的宽高比。 */
export type AgnesRatio = typeof RATIOS[number]

/**
 * 插件配置。
 * 模型名称在设置页以下拉选择三个目录模型(docs/agnes-ai/):
 * agnes-image-2.1-flash / agnes-video-v2.0 / agnes-video-2.5-flash。
 * Host 端仍按非空自由字符串校验:历史配置里的旧名称(如 agnes-video-2.5)
 * 与未来上游新 ID 仍可解码运行,只是不在下拉列表中;切换模型时依赖默认参数自适应。
 */
export interface Config {
  /** 图像生成模型名称,调用省略时也作为工具实际使用的模型。 */
  imageModel: string
  /** 调用省略 `size` 时的默认尺寸档位。 */
  defaultSize: AgnesSizeTier
  /** 调用省略 `ratio` 时的默认宽高比。 */
  defaultRatio: AgnesRatio
  /** 视频生成模型名称。 */
  videoModel: string
  /** 调用省略 `width` 时的默认视频宽度;API 会标准化到 480p/720p/1080p 档位。 */
  videoWidth: number
  /** 调用省略 `height` 时的默认视频高度。 */
  videoHeight: number
  /** 调用省略 `num_frames` 时的默认帧数;必须 ≤441 且满足 8n+1。 */
  videoNumFrames: number
  /** 调用省略 `frame_rate` 时的默认帧率,支持 1–60。 */
  videoFrameRate: number
  /** Video 2.5 系列(含 flash)默认时长,整数秒 4–12。 */
  video25Seconds: number
  /** Video 2.5 系列输出分辨率档位;flash 仅支持 720P(构建时自动收敛)。 */
  video25Size: Video25Size
  /** API 站点:china=国内站,international=国际站。 */
  apiSite: ApiSite
}

/** schema 无法表达的跨字段约束(如 8n+1 帧数)统一在这里校验。@throws 不合法时抛出带字段名的错误。 */
export function assertConfig(config: Config): void {
  if (typeof config.imageModel !== 'string' || config.imageModel.trim() === '') {
    throw new Error(`imageModel 必须是非空字符串,目录模型:${IMAGE_MODEL_IDS.join(' / ')}。`)
  }
  if (typeof config.videoModel !== 'string' || config.videoModel.trim() === '') {
    throw new Error(`videoModel 必须是非空字符串,目录模型:${VIDEO_MODEL_IDS.join(' / ')}。`)
  }
  for (const key of ['videoWidth', 'videoHeight'] as const) {
    const value = config[key]
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${key} 必须是正整数,收到 ${value}。`)
    }
  }
  const frames = config.videoNumFrames
  if (!Number.isInteger(frames) || frames < 9 || frames > 441 || frames % 8 !== 1) {
    throw new Error(`videoNumFrames 必须是 ≤441 且满足 8n+1 的整数(如 81/121/241/441),收到 ${frames}。`)
  }
  const rate = config.videoFrameRate
  if (!Number.isFinite(rate) || rate < 1 || rate > 60) {
    throw new Error(`videoFrameRate 必须在 1–60 之间,收到 ${rate}。`)
  }
  const seconds25 = config.video25Seconds
  if (!Number.isInteger(seconds25) || seconds25 < 4 || seconds25 > 12) {
    throw new Error(`video25Seconds 必须是 4–12 的整数秒,收到 ${seconds25}。`)
  }
  if (!(VIDEO25_SIZES as readonly string[]).includes(config.video25Size)) {
    throw new Error(`video25Size 必须是 ${VIDEO25_SIZES.join('/')} 之一,收到 ${config.video25Size}。`)
  }
  if (config.apiSite !== 'china' && config.apiSite !== 'international') {
    throw new Error(`apiSite 必须是 china/international 之一,收到 ${config.apiSite}。`)
  }
}

export const Config: z<Config> = z.object({
  imageModel: z.string().default(DEFAULT_IMAGE_MODEL).description(`图像生成模型(下拉:${IMAGE_MODEL_IDS.join('/')})`),
  defaultSize: z.union([...SIZE_TIERS]).default('1K').description('调用省略 size 时的默认尺寸档位'),
  defaultRatio: z.union([...RATIOS]).default('1:1').description('调用省略 ratio 时的默认宽高比'),
  videoModel: z.string().default(DEFAULT_VIDEO_MODEL).description(`视频生成模型(下拉:${VIDEO_MODEL_IDS.join('/')})`),
  videoWidth: z.number().min(1).max(8192).default(1280).description('调用省略 width 时的默认视频宽度(16:9 · 720p)'),
  videoHeight: z.number().min(1).max(8192).default(720).description('调用省略 height 时的默认视频高度(16:9 · 720p)'),
  videoNumFrames: z.number().min(9).max(441).default(121).description('调用省略 num_frames 时的默认帧数,需满足 8n+1'),
  videoFrameRate: z.number().min(1).max(60).default(24).description('调用省略 frame_rate 时的默认帧率'),
  video25Seconds: z.number().min(4).max(12).default(5).description('Video 2.5 系列默认时长(整数秒)'),
  video25Size: z.union([...VIDEO25_SIZES]).default('720P').description('Video 2.5 系列输出分辨率档位;flash 仅支持 720P'),
  apiSite: z.union(['china', 'international']).default('china').description('API 站点:china=国内站(默认),international=国际站(apihub)'),
})

// ===================== 设置存储（0.2.x 自建路由 + 覆盖文件） =====================
// 0.1.x 的 installSettingsSection/settingsNamespace 已在 0.2.x 移除。
// 参照 dsh-task-capsule 的成熟模式:插件自管覆盖文件 + webServer 前缀路由,
// 设置页(客户端半侧)经 /dsh-agnes/config/status|mutate 读写。

/** 用户覆盖层落盘位置(~/.dsh/dsh-agnes.json)。 */
const USER_STORE_PATH = path.join(os.homedir(), '.dsh', 'dsh-agnes.json')

/** 允许写入覆盖层的字段白名单(与 Config 一一对应)。 */
const CONFIG_KEYS = [
  'apiSite',
  'imageModel', 'defaultSize', 'defaultRatio',
  'videoModel', 'videoWidth', 'videoHeight',
  'videoNumFrames', 'videoFrameRate', 'video25Seconds', 'video25Size',
] as const

/** 读取用户覆盖层;文件缺失/损坏时返回空对象(回落 patch config 与 schema 默认值)。 */
function readUserLayer(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(USER_STORE_PATH, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch { /* 缺失或坏文件都按无覆盖处理 */ }
  return {}
}

/** 原子写覆盖层(临时文件 + rename)。 */
function writeUserLayer(user: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(USER_STORE_PATH), { recursive: true })
  const tmp = `${USER_STORE_PATH}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(user, null, 2) + '\n')
  fs.renameSync(tmp, USER_STORE_PATH)
}

/** 组装设置页快照:base(patch config/默认) + user(覆盖) → value(生效值)。 */
function buildSnapshot(base: Config) {
  const user = readUserLayer()
  const value = { ...base, ...user } as Config
  assertConfig(value)
  return { status: 'ready', writable: true, base, user, value }
}

/** 读取请求体(JSON);空体返回 {}。 */
function readBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try { resolve(JSON.parse(text)) } catch (e) { reject(new Error('请求体不是合法 JSON')) }
    })
    req.on('error', reject)
  })
}

/** 输出 JSON 响应。 */
function sendJson(res: any, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * 注册工具(0.2.x 起:插件 config schema 由宿主 SettingsForms 直接投影为设置表单,
 * 不再需要 0.1.x 的 installSettingsSection;config 变更经 cordis 语义重新 apply,
 * 因此工具始终读取当前 config,修改默认参数无需重启即生效)。
 * 设置页数据经自建路由读写用户覆盖层,同样即时生效。
 */
export function apply(ctx: Context, config: Config): void {
  assertConfig(config)
  const source = () => {
    try {
      const merged = { ...config, ...readUserLayer() } as Config
      assertConfig(merged)
      return merged
    } catch {
      return config
    }
  }
  applyAgnesImageTool(ctx, () => {
    const current = source()
    return { model: current.imageModel, defaultSize: current.defaultSize, defaultRatio: current.defaultRatio, apiSite: current.apiSite }
  })
  applyAgnesVideoTool(ctx, () => {
    const current = source()
    return {
      model: current.videoModel,
      width: current.videoWidth,
      height: current.videoHeight,
      numFrames: current.videoNumFrames,
      frameRate: current.videoFrameRate,
      seconds25: current.video25Seconds,
      size25: current.video25Size,
      apiSite: current.apiSite,
    }
  })

  // 设置页数据路由:status 读快照,mutate 应用 set/unset 操作后落盘并返回新快照。
  ctx.inject(['webServer'], (wsCtx: any) => {
    wsCtx.effect(() => wsCtx.webServer.register({
      kind: 'prefix',
      path: '/dsh-agnes/config',
      async handler(req: any, res: any) {
        try {
          const url = new URL(req.url || '/', 'http://dsh.internal')
          const method = url.pathname.replace(/^\/dsh-agnes\/config\/?/, '').split('/')[0] || ''
          if (method === 'status') {
            return sendJson(res, 200, { ok: true, data: buildSnapshot(config) })
          }
          if (method === 'mutate') {
            const payload = await readBody(req)
            const ops = Array.isArray(payload && payload.ops) ? payload.ops : []
            const user = readUserLayer()
            for (const op of ops as any[]) {
              if (!op || typeof op !== 'object') continue
              if (op.op !== 'set' && op.op !== 'unset') continue
              if (typeof op.field !== 'string' || !(CONFIG_KEYS as readonly string[]).includes(op.field)) continue
              if (op.op === 'set') user[op.field] = op.value
              else delete user[op.field]
            }
            const merged = { ...config, ...user } as Config
            try {
              assertConfig(merged)
            } catch (e) {
              // 非法组合不落盘,让错误在保存时就暴露而非静默生效。
              return sendJson(res, 400, {
                ok: false,
                error: { code: 'invalid-config', message: (e as Error).message },
              })
            }
            writeUserLayer(user)
            return sendJson(res, 200, { ok: true, data: buildSnapshot(config) })
          }
          return sendJson(res, 404, {
            ok: false,
            error: { code: 'method-not-found', message: 'unknown method: ' + method },
          })
        } catch (e) {
          return sendJson(res, 500, {
            ok: false,
            error: { code: 'internal', message: (e as Error).message },
          })
        }
      },
    }), 'dsh-agnes: /dsh-agnes/config HTTP route')
  })
}
