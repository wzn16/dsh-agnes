/**
 * `agnes_image_generate` 工具：通过 Agnes AI 图像 API 实现文生图、图生图和多图合成。
 * 请求体写入 curl 标准输入，密钥通过进程环境传递，均不进入命令行。
 * 模型名称与默认 size/ratio 来自设置命名空间(设置页的 Agnes 标签页),不硬编码,
 * 上游模型升级时改设置即可。
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
// 仅用于类型：引入 shell 的 Context 合并。
import type {} from '@deepseek-ai/dsh-shell'

/** Agnes 图像 API 端点。 */
export const AGNES_API_URL = 'https://api.agnes-ai.cn/v1/images/generations'

/** 图像生成模型的文档默认值;仅作 schema 默认,实际模型始终读自设置。 */
export const DEFAULT_IMAGE_MODEL = 'agnes-image-2.1-flash'

/** 凭据引用。 */
export const AGNES_API_KEY_REF = 'AGNES_API_KEY'

/** 支持的尺寸档位；不支持的精确尺寸由 API 标准化。 */
export const SIZE_TIERS = ['1K', '2K', '3K', '4K'] as const

/** 支持的宽高比。 */
export const RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9'] as const

/** 成员查找集合，避免每次调用都做类型转换。 */
const SIZE_TIERS_SET: ReadonlySet<string> = new Set(SIZE_TIERS)

/** 成员查找集合，避免每次调用都做类型转换。 */
const RATIOS_SET: ReadonlySet<string> = new Set(RATIOS)

/** 工具调用的协作式超时预算；API 可能需要几十秒。 */
export const AGNES_TOOL_TIMEOUT_MS = 360_000

/** curl 网络超时。 */
export const AGNES_CURL_TIMEOUT_S = 300

/** JSON 响应捕获上限。 */
export const AGNES_STDOUT_MAX_BYTES = 32 * 1024 * 1024

/** curl 的 `-w` 标记行，用于携带 HTTP 状态码。 */
export const AGNES_STATUS_MARKER = '\n__AGNES_STATUS__'

/** 已验证的工具参数。 */
export interface AgnesImageArgs {
  /** 图像生成或编辑指令。 */
  prompt: string
  /** 尺寸档位；未提供时回退到配置默认值。 */
  size?: string
  /** 宽高比；未提供时回退到配置默认值。 */
  ratio?: string
  /** 参考图像：公共 HTTPS URL 或 Data URI。 */
  image?: string[]
  /** 请求 Base64 输出（`b64_json`）而非 URL。 */
  return_base64?: boolean
}

/** 调用时由设置命名空间解析出的默认值;模型名随上游升级在设置中修改。 */
export interface AgnesDefaults {
  /** 图像生成模型名称。 */
  model: string
  /** 默认尺寸档位。 */
  defaultSize: string
  /** 默认宽高比。 */
  defaultRatio: string
}

/** 参数与默认值合并后的生效请求设置。 */
export interface ResolvedImageSettings {
  /** 实际使用的模型。 */
  model: string
  /** 实际使用的尺寸档位。 */
  size: string
  /** 实际使用的宽高比。 */
  ratio: string
}

/** 工具规范化结果值，只含 API 实际返回的字段。 */
export interface AgnesImageValue {
  /** 生成时间 Unix 时间戳。 */
  created?: number
  /** 生成图像的公共 URL。 */
  url?: string
  /** 图像的 Base64 数据。 */
  b64_json?: string
  /** API 修订后的提示词。 */
  revised_prompt?: string
}

/** 一个已接受的参考图像条目。 */
const IMAGE_PATTERN = /^(https?:\/\/|data:image\/)/

/**
 * 合并工具参数与设置默认值,得到本次调用的生效设置。
 * 未提供或不在支持列表内的参数回退到设置值。
 */
export function resolveImageSettings(args: AgnesImageArgs, defaults: AgnesDefaults): ResolvedImageSettings {
  return {
    model: defaults.model,
    size: args.size !== undefined && SIZE_TIERS_SET.has(args.size) ? args.size : defaults.defaultSize,
    ratio: args.ratio !== undefined && RATIOS_SET.has(args.ratio) ? args.ratio : defaults.defaultRatio,
  }
}

/**
 * 根据参数和默认值构建 API 请求体。
 */
export function buildAgnesRequestBody(args: AgnesImageArgs, defaults: AgnesDefaults): Record<string, unknown> {
  const images = Array.isArray(args.image) ? args.image : []
  const wantBase64 = args.return_base64 === true
  const resolved = resolveImageSettings(args, defaults)
  const extra: Record<string, unknown> = { response_format: wantBase64 ? 'b64_json' : 'url' }
  if (images.length > 0) {
    for (const image of images) {
      if (typeof image !== 'string' || !IMAGE_PATTERN.test(image)) {
        throw new Error(`无效的 image 输入 "${image.slice(0, 64)}":必须是公共 HTTPS URL 或 data:image/*;base64,... Data URI。`)
      }
    }
    extra.image = images
  }
  const body: Record<string, unknown> = {
    model: resolved.model,
    prompt: args.prompt,
    size: resolved.size,
    ratio: resolved.ratio,
    extra_body: extra,
  }
  if (images.length === 0 && wantBase64) body.return_base64 = true
  return body
}

/**
 * 将 curl 标准输出拆分为响应体和末尾状态码。
 * 标记含原始换行符，而 JSON 不含，故拆分无歧义。
 */
export function splitAgnesStatus(stdout: string): { jsonText: string; status: number | null } {
  const markerIndex = stdout.lastIndexOf(AGNES_STATUS_MARKER)
  if (markerIndex === -1) return { jsonText: stdout, status: null }
  const status = Number(stdout.slice(markerIndex + AGNES_STATUS_MARKER.length).trim())
  return { jsonText: stdout.slice(0, markerIndex), status: Number.isFinite(status) ? status : null }
}

/**
 * 解析 API 响应体为规范化结果值。
 * @throws 响应体形状不符时抛出面向模型的错误。
 */
export function parseAgnesResponse(jsonText: string): AgnesImageValue {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText) as unknown
  } catch (_jsonParseFailure) {
    throw new Error(`Agnes API 返回了无法解析的内容:${jsonText.slice(0, 500)}`)
  }
  const record = parsed as { created?: unknown; data?: unknown } | null
  const data = record !== null && typeof record === 'object' && Array.isArray(record.data)
    ? record.data as unknown[]
    : undefined
  const item = data === undefined || data.length === 0 ? undefined : data[0]
  if (item === undefined || typeof item !== 'object' || item === null) {
    throw new Error(`Agnes API 未返回图像数据:${jsonText.slice(0, 500)}`)
  }
  const fields = item as Record<string, unknown>
  const value: AgnesImageValue = {}
  if (typeof record?.created === 'number') value.created = record.created
  if (typeof fields.url === 'string' && fields.url !== '') value.url = fields.url
  if (typeof fields.b64_json === 'string' && fields.b64_json !== '') value.b64_json = fields.b64_json
  if (typeof fields.revised_prompt === 'string' && fields.revised_prompt !== '') value.revised_prompt = fields.revised_prompt
  return value
}

/**
 * 将规范化结果值渲染为面向模型的内容。
 * 模型与尺寸显示本次实际生效值(含设置回退),而非硬编码常量。
 */
export function renderAgnesValue(args: AgnesImageArgs, value: AgnesImageValue, defaults: AgnesDefaults): ContentBlock[] {
  const lines: string[] = []
  if (value.url !== undefined) lines.push(`生成结果 URL:${value.url}`)
  if (value.b64_json !== undefined) lines.push(`生成结果 Base64(${value.b64_json.length} 字符,字段 b64_json)`)
  if (value.revised_prompt !== undefined) lines.push(`修正后提示词:${value.revised_prompt}`)
  const resolved = resolveImageSettings(args, defaults)
  lines.push(`模型:${resolved.model} | 尺寸:${resolved.size} ${resolved.ratio}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

/** 工具描述;模型名不写入描述,避免设置改名后误导调用方。 */
const TOOL_DESCRIPTION = [
  '调用 Agnes AI 图像生成 API 进行文生图、图生图或多图合成。',
  '文生图仅需 prompt(可加 size/ratio);图生图/多图合成需在 image 中传入一张或多张参考图',
  '(公共 HTTPS URL 或 data:image/*;base64,... Data URI),并在 prompt 中描述变换或组合要求,尽量保留原始构图。',
  'size 使用档位 1K/2K/3K/4K,ratio 支持 1:1、3:4、4:3、16:9、9:16、2:3、3:2、21:9;',
  '不要传 1920x1080 这类精确尺寸(会被标准化)。省略 size/ratio 时使用用户设置的默认值。',
  '默认返回图像 URL;设置 return_base64: true 时返回 b64_json。',
  '推荐提示词结构:文生图 = 主体+场景+风格+光照+构图+质量;图生图 = 改变要求+新风格+添加/移除元素+保留元素;',
  '多图合成 = 每张参考图的角色+目标场景+组合关系+风格/光照/构图。',
].join('')

/**
 * 在上下文中注册 `agnes_image_generate` 工具。
 * 注册挂载在调用插件的 fiber 上，随其一同移除。
 * @param defaults 返回当前设置解析值的 thunk,每次执行与渲染时读取。
 */
export function applyAgnesImageTool(ctx: Context, defaults: () => AgnesDefaults): void {
  ctx.tools.register(defineTool({
    name: 'agnes_image_generate',
    description: TOOL_DESCRIPTION,
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: '图像生成或编辑的文本指令。文生图:主体+场景+风格+光照+构图+质量要求;图生图:改变要求+新风格+要添加/移除的元素+要保留的元素;多图合成:说明每张参考图的角色、目标场景、组合关系与风格。',
      },
      size: {
        type: 'string',
        enum: [...SIZE_TIERS],
        description: '输出尺寸档位。1:1 时对应 1024/2048/3072/4096 边长,其他 ratio 按比例换算;需要 1920x1080/2560x1440 这类 16:9 素材时用 2K + 16:9 再裁剪;省略时用设置默认值。',
      },
      ratio: {
        type: 'string',
        enum: [...RATIOS],
        description: '与 size 档位配合的宽高比;省略时用设置默认值。',
      },
      image: {
        type: 'array',
        items: { type: 'string' },
        description: '图生图/多图合成的输入图像:公共 HTTPS URL 或 data:image/*;base64,... Data URI;多图合成时传多张。',
      },
      return_base64: {
        type: 'boolean',
        description: '为 true 时返回 b64_json 图像数据而非 URL,适用于内嵌或交给其他服务处理;大图 Base64 可能超出捕获上限,优先用 URL。',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          created: { type: 'number' },
          url: { type: 'string' },
          b64_json: { type: 'string' },
          revised_prompt: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (args, value) => renderAgnesValue(args as AgnesImageArgs, value, defaults()),
    },
    timeoutMs: AGNES_TOOL_TIMEOUT_MS,
    // 仅读取外部 API，不修改父级拥有的状态。
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const credentials = ctx.get('credentials')
      if (credentials === undefined) {
        throw new Error('凭据服务不可用:无法解析 AGNES_API_KEY。')
      }
      const resolvedKey = await credentials.resolve(credentialRef(AGNES_API_KEY_REF))
      if (resolvedKey === undefined) {
        throw new Error('未配置 AGNES_API_KEY:请写入启动环境、$DSH_HOME/.credentials.yaml 或项目/user 的 .env,或在设置页的 Agnes 标签页中保存。')
      }
      const currentDefaults = defaults()
      if (typeof currentDefaults.model !== 'string' || currentDefaults.model.trim() === '') {
        throw new Error('图像模型名为空:请在设置页的 Agnes 标签页中填写 imageModel。')
      }
      const body = buildAgnesRequestBody(args, currentDefaults)
      const shell = ctx.shell
      const spec = shell.resolve({
        command: `curl -sS --max-time ${AGNES_CURL_TIMEOUT_S} -X POST ${AGNES_API_URL} -H "Authorization: Bearer $AGNES_API_KEY" -H "Content-Type: application/json" --data-binary @- -w '\\n__AGNES_STATUS__%{http_code}'`,
        stdin: JSON.stringify(body),
        env: { [AGNES_API_KEY_REF]: resolvedKey.value },
        stdoutMaxBytes: AGNES_STDOUT_MAX_BYTES,
        timeoutMs: AGNES_TOOL_TIMEOUT_MS,
        signal: exec.signal,
      })
      const result = await shell.run(spec)
      if (result.timedOut || result.aborted) {
        throw new Error(`图像生成请求${result.timedOut ? '超时' : '被取消'}(${result.timeoutMs}ms),请稍后重试或降低 size 档位。`)
      }
      if (result.exitCode !== 0) {
        throw new Error(`Agnes API 请求失败(exit ${result.exitCode}):${result.stderr.text.slice(0, 500)}`)
      }
      if (result.stdout.truncated) {
        throw new Error('Agnes API 响应过大,超出捕获上限;请使用 URL 输出(默认)或改用更小的 size 档位。')
      }
      const { jsonText, status } = splitAgnesStatus(result.stdout.text)
      if (status !== null && (status < 200 || status >= 300)) {
        throw new Error(`Agnes API 返回 HTTP ${status}:${jsonText.slice(0, 800)}`)
      }
      return parseAgnesResponse(jsonText)
    },
  }))
}
