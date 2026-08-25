import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

import { applyAgnesImageTool, DEFAULT_IMAGE_MODEL, RATIOS, SIZE_TIERS } from './image.ts'
import { applyAgnesVideoTool, DEFAULT_VIDEO_MODEL, VIDEO25_SIZES, type Video25Size } from './video.ts'
import { IMAGE_MODEL_IDS, VIDEO_MODEL_IDS } from './models.ts'

export { IMAGE_MODEL_CATALOG, IMAGE_MODEL_IDS, VIDEO_MODEL_CATALOG, VIDEO_MODEL_IDS } from './models.ts'
export { imageModelPreset, videoModelPreset, type ImageModelPreset, type VideoModelPreset } from './models.ts'
export type { AgnesModelOption } from './models.ts'
export const name = 'dsh-agnes'

/**
 * 插件注册工具前需等待 tools 服务就绪;
 * 工具执行经属性访问(ctx.shell)使用 shell 服务发起 curl,必须在 inject 中声明,
 * 否则运行时报 `cannot get property "shell" without inject`。
 */
export const inject = ['tools', 'shell'] as const

/** 设置命名空间；浏览器端会再次声明。 */
export const AGNES_SETTINGS_NAMESPACE = settingsNamespace('agnes')

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
})

/**
 * 注册工具并连接设置命名空间。
 * 每次调用读取命名空间的解析值，因此设置修改无需重启即可生效；
 * 模型名称与默认参数同样来自该命名空间，不硬编码在工具内。
 */
export function apply(ctx: Context, config: Config): void {
  assertConfig(config)
  let source = () => config
  installSettingsSection(ctx, AGNES_SETTINGS_NAMESPACE, Config, config, {
    setSource: (current) => { source = current },
    onChange: () => {},
    // 拒绝 schema 表达不了的取值组合,让非法写入在保存时报错而非静默生效。
    validate: assertConfig,
  })
  applyAgnesImageTool(ctx, () => {
    const current = source()
    return { model: current.imageModel, defaultSize: current.defaultSize, defaultRatio: current.defaultRatio }
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
    }
  })
}
