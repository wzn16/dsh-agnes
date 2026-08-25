/**
 * 支持的模型目录:设置页下拉选项与各模型的推荐默认参数(单一事实来源)。
 * 目录对齐 docs/agnes-ai/ 官方文档的三个接入模型:
 * - Agnes Image 2.1 Flash(agnes-image-2.1-flash)
 * - Agnes Video V2.0(agnes-video-v2.0)
 * - Agnes Video 2.5 Flash(agnes-video-2.5-flash)
 *
 * 运行时参数体系仍按模型名自适应(src/video.ts 的 isVideo25Family / flash 收敛),
 * 这里只负责「设置页选了哪个模型 → 依赖的默认参数应该是什么」。
 */

import type { Video25Size } from './video.ts'

/** 下拉列表中的一个模型条目。 */
export interface AgnesModelOption {
  /** 提交给 API 的模型 ID。 */
  id: string
  /** 设置页显示名。 */
  label: string
}

/** 支持的图像生成模型。 */
export const IMAGE_MODEL_CATALOG: readonly AgnesModelOption[] = [
  { id: 'agnes-image-2.1-flash', label: 'Agnes Image 2.1 Flash' },
]

/** 支持的视频生成模型(下拉顺序即展示顺序)。 */
export const VIDEO_MODEL_CATALOG: readonly AgnesModelOption[] = [
  { id: 'agnes-video-v2.0', label: 'Agnes Video V2.0' },
  { id: 'agnes-video-2.5-flash', label: 'Agnes Video 2.5 Flash' },
]

/** 图像模型 ID 集合,用于判断保存值是否在下拉目录内。 */
export const IMAGE_MODEL_IDS: readonly string[] = IMAGE_MODEL_CATALOG.map((model) => model.id)

/** 视频模型 ID 集合。 */
export const VIDEO_MODEL_IDS: readonly string[] = VIDEO_MODEL_CATALOG.map((model) => model.id)

/**
 * 切换视频模型时,依赖字段自适应到的推荐默认值。
 * 数值取自官方文档的大众场景:
 * - V2.0「推荐参数」标准视频:121 帧 @ 24fps ≈ 5 秒;宽高给 720p/16:9 档位组合,
 *   API 会标准化到最近的 480p/720p/1080p 档;
 * - 2.5 系列:seconds 默认 "5"、size 仅 flash 固定 720P;宽高仅用于就近匹配画幅,
 *   给 16:9 组合 1280×720。
 */
export interface VideoModelPreset {
  videoWidth: number
  videoHeight: number
  videoNumFrames: number
  videoFrameRate: number
  video25Seconds: number
  video25Size: Video25Size
}

/** 视频模型 → 推荐默认参数;未知模型(自定义/未来上游)回退到同一组通用安全值。 */
export function videoModelPreset(_model: string): VideoModelPreset {
  return {
    videoWidth: 1280,
    videoHeight: 720,
    videoNumFrames: 121,
    videoFrameRate: 24,
    video25Seconds: 5,
    video25Size: '720P',
  }
}

/**
 * 切换图像模型时,依赖字段自适应到的推荐默认值。
 * 文档推荐用档位 + 比例获得可预期输出;1K/1:1 是日常生成的中性起点。
 */
export interface ImageModelPreset {
  defaultSize: '1K' | '2K' | '3K' | '4K'
  defaultRatio: string
}

/** 图像模型 → 推荐默认参数。 */
export function imageModelPreset(_model: string): ImageModelPreset {
  return { defaultSize: '1K', defaultRatio: '1:1' }
}
