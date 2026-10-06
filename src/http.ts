/**
 * Agnes API HTTP 访问层(0.2.x 适配):以 node 原生 fetch 取代宿主 shell+curl,
 * 不再耦合 dsh-shell 服务 API;超时/取消/体积上限语义与原实现对齐。
 */

/** 与原 shell.run 结果契约对齐的字段子集,调用方错误处理无需改写。 */
export interface ApiResult {
  /** HTTP 2xx。 */
  ok: boolean
  /** HTTP 状态码。 */
  status: number
  /** 响应体文本;截断时为空串。 */
  text: string
  /** 响应体超出上限被截断。 */
  truncated: boolean
  /** 请求超时。 */
  timedOut: boolean
  /** 请求被外部取消。 */
  aborted: boolean
}

/** API 站点:china=国内站,international=国际站。 */
export type ApiSite = 'china' | 'international'

/** 各站点 API 主机。 */
const API_HOSTS: Record<ApiSite, string> = {
  china: 'https://api.agnes-ai.cn',
  international: 'https://apihub.agnes-ai.com',
}

/** 按站点解析 API 完整端点;未知站点回落国内站。 */
export function apiEndpoint(site: string, path: string): string {
  const host = API_HOSTS[site as ApiSite] ?? API_HOSTS.china
  return host + path
}

/** 统一执行带 Bearer 认证的 JSON API 请求。 */
async function requestJson(
  method: 'GET' | 'POST',
  url: string,
  apiKey: string,
  body: string | undefined,
  timeoutMs: number,
  signal: AbortSignal,
  maxBytes: number,
): Promise<ApiResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
    })
    const text = await res.text()
    const truncated = Buffer.byteLength(text, 'utf8') > maxBytes
    return {
      ok: res.ok,
      status: res.status,
      text: truncated ? '' : text,
      truncated,
      timedOut: false,
      aborted: false,
    }
  } catch (error) {
    const err = error as Error
    if (err.name === 'TimeoutError') {
      return { ok: false, status: 0, text: '', truncated: false, timedOut: true, aborted: false }
    }
    if (err.name === 'AbortError') {
      return { ok: false, status: 0, text: '', truncated: false, timedOut: false, aborted: true }
    }
    throw new Error(`Agnes API 网络请求失败:${err.message}`)
  }
}

/** POST JSON 并返回统一结果。 */
export function postJson(
  url: string,
  apiKey: string,
  body: string,
  timeoutMs: number,
  signal: AbortSignal,
  maxBytes: number,
): Promise<ApiResult> {
  return requestJson('POST', url, apiKey, body, timeoutMs, signal, maxBytes)
}

/** GET 请求(query 已拼进 url)并返回统一结果。 */
export function getJson(
  url: string,
  apiKey: string,
  timeoutMs: number,
  signal: AbortSignal,
  maxBytes: number,
): Promise<ApiResult> {
  return requestJson('GET', url, apiKey, undefined, timeoutMs, signal, maxBytes)
}
