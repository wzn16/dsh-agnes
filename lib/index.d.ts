import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-tools";
import { Context } from "@deepseek-ai/cordis";
import "@deepseek-ai/dsh-llm";
//#region src/image.d.ts
/** 支持的尺寸档位；不支持的精确尺寸由 API 标准化。 */
declare const SIZE_TIERS: readonly ["1K", "2K", "3K", "4K"];
/** 支持的宽高比。 */
declare const RATIOS: readonly ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"];
//#endregion
//#region src/video.d.ts
/** Video 2.5 系列支持的输出分辨率档位(docs/agnes-ai/Agnes Video 2.5.md)。 */
declare const VIDEO25_SIZES: readonly ["720P", "960P", "2K"];
/** Video 2.5 输出档位类型。 */
type Video25Size = (typeof VIDEO25_SIZES)[number];
//#endregion
//#region src/models.d.ts
/** 下拉列表中的一个模型条目。 */
interface AgnesModelOption {
  /** 提交给 API 的模型 ID。 */
  id: string;
  /** 设置页显示名。 */
  label: string;
}
/** 支持的图像生成模型。 */
declare const IMAGE_MODEL_CATALOG: readonly AgnesModelOption[];
/** 支持的视频生成模型(下拉顺序即展示顺序)。 */
declare const VIDEO_MODEL_CATALOG: readonly AgnesModelOption[];
/** 图像模型 ID 集合,用于判断保存值是否在下拉目录内。 */
declare const IMAGE_MODEL_IDS: readonly string[];
/** 视频模型 ID 集合。 */
declare const VIDEO_MODEL_IDS: readonly string[];
/**
 * 切换视频模型时,依赖字段自适应到的推荐默认值。
 * 数值取自官方文档的大众场景:
 * - V2.0「推荐参数」标准视频:121 帧 @ 24fps ≈ 5 秒;宽高给 720p/16:9 档位组合,
 *   API 会标准化到最近的 480p/720p/1080p 档;
 * - 2.5 系列:seconds 默认 "5"、size 仅 flash 固定 720P;宽高仅用于就近匹配画幅,
 *   给 16:9 组合 1280×720。
 */
interface VideoModelPreset {
  videoWidth: number;
  videoHeight: number;
  videoNumFrames: number;
  videoFrameRate: number;
  video25Seconds: number;
  video25Size: Video25Size;
}
/** 视频模型 → 推荐默认参数;未知模型(自定义/未来上游)回退到同一组通用安全值。 */
declare function videoModelPreset(_model: string): VideoModelPreset;
/**
 * 切换图像模型时,依赖字段自适应到的推荐默认值。
 * 文档推荐用档位 + 比例获得可预期输出;1K/1:1 是日常生成的中性起点。
 */
interface ImageModelPreset {
  defaultSize: '1K' | '2K' | '3K' | '4K';
  defaultRatio: string;
}
/** 图像模型 → 推荐默认参数。 */
declare function imageModelPreset(_model: string): ImageModelPreset;
//#endregion
//#region src/index.d.ts
declare const name = "dsh-agnes";
/**
 * 插件注册工具前需等待 tools 服务就绪;
 * 工具执行经属性访问(ctx.shell)使用 shell 服务发起 curl,必须在 inject 中声明,
 * 否则运行时报 `cannot get property "shell" without inject`。
 */
declare const inject: readonly ["tools", "shell"];
/** 设置命名空间；浏览器端会再次声明。 */
declare const AGNES_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** 支持的尺寸档位。 */
type AgnesSizeTier = typeof SIZE_TIERS[number];
/** 支持的宽高比。 */
type AgnesRatio = typeof RATIOS[number];
/**
 * 插件配置。
 * 模型名称在设置页以下拉选择三个目录模型(docs/agnes-ai/):
 * agnes-image-2.1-flash / agnes-video-v2.0 / agnes-video-2.5-flash。
 * Host 端仍按非空自由字符串校验:历史配置里的旧名称(如 agnes-video-2.5)
 * 与未来上游新 ID 仍可解码运行,只是不在下拉列表中;切换模型时依赖默认参数自适应。
 */
interface Config {
  /** 图像生成模型名称,调用省略时也作为工具实际使用的模型。 */
  imageModel: string;
  /** 调用省略 `size` 时的默认尺寸档位。 */
  defaultSize: AgnesSizeTier;
  /** 调用省略 `ratio` 时的默认宽高比。 */
  defaultRatio: AgnesRatio;
  /** 视频生成模型名称。 */
  videoModel: string;
  /** 调用省略 `width` 时的默认视频宽度;API 会标准化到 480p/720p/1080p 档位。 */
  videoWidth: number;
  /** 调用省略 `height` 时的默认视频高度。 */
  videoHeight: number;
  /** 调用省略 `num_frames` 时的默认帧数;必须 ≤441 且满足 8n+1。 */
  videoNumFrames: number;
  /** 调用省略 `frame_rate` 时的默认帧率,支持 1–60。 */
  videoFrameRate: number;
  /** Video 2.5 系列(含 flash)默认时长,整数秒 4–12。 */
  video25Seconds: number;
  /** Video 2.5 系列输出分辨率档位;flash 仅支持 720P(构建时自动收敛)。 */
  video25Size: Video25Size;
}
/** schema 无法表达的跨字段约束(如 8n+1 帧数)统一在这里校验。@throws 不合法时抛出带字段名的错误。 */
declare function assertConfig(config: Config): void;
declare const Config: z<Config>;
/**
 * 注册工具并连接设置命名空间。
 * 每次调用读取命名空间的解析值，因此设置修改无需重启即可生效；
 * 模型名称与默认参数同样来自该命名空间，不硬编码在工具内。
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { AGNES_SETTINGS_NAMESPACE, type AgnesModelOption, AgnesRatio, AgnesSizeTier, Config, IMAGE_MODEL_CATALOG, IMAGE_MODEL_IDS, type ImageModelPreset, VIDEO_MODEL_CATALOG, VIDEO_MODEL_IDS, type VideoModelPreset, apply, assertConfig, imageModelPreset, inject, name, videoModelPreset };