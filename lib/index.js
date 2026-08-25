import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/image.ts
/** Agnes 图像 API 端点。 */
const AGNES_API_URL = "https://api.agnes-ai.cn/v1/images/generations";
/** 图像生成模型的文档默认值;仅作 schema 默认,实际模型始终读自设置。 */
const DEFAULT_IMAGE_MODEL = "agnes-image-2.1-flash";
/** 凭据引用。 */
const AGNES_API_KEY_REF = "AGNES_API_KEY";
/** 支持的尺寸档位；不支持的精确尺寸由 API 标准化。 */
const SIZE_TIERS = [
	"1K",
	"2K",
	"3K",
	"4K"
];
/** 支持的宽高比。 */
const RATIOS = [
	"1:1",
	"3:4",
	"4:3",
	"16:9",
	"9:16",
	"2:3",
	"3:2",
	"21:9"
];
/** 成员查找集合，避免每次调用都做类型转换。 */
const SIZE_TIERS_SET = new Set(SIZE_TIERS);
/** 成员查找集合，避免每次调用都做类型转换。 */
const RATIOS_SET = new Set(RATIOS);
/** 工具调用的协作式超时预算；API 可能需要几十秒。 */
const AGNES_TOOL_TIMEOUT_MS = 36e4;
/** JSON 响应捕获上限。 */
const AGNES_STDOUT_MAX_BYTES = 33554432;
/** curl 的 `-w` 标记行，用于携带 HTTP 状态码。 */
const AGNES_STATUS_MARKER = "\n__AGNES_STATUS__";
/** 一个已接受的参考图像条目。 */
const IMAGE_PATTERN = /^(https?:\/\/|data:image\/)/;
/**
* 合并工具参数与设置默认值,得到本次调用的生效设置。
* 未提供或不在支持列表内的参数回退到设置值。
*/
function resolveImageSettings(args, defaults) {
	return {
		model: defaults.model,
		size: args.size !== void 0 && SIZE_TIERS_SET.has(args.size) ? args.size : defaults.defaultSize,
		ratio: args.ratio !== void 0 && RATIOS_SET.has(args.ratio) ? args.ratio : defaults.defaultRatio
	};
}
/**
* 根据参数和默认值构建 API 请求体。
*/
function buildAgnesRequestBody(args, defaults) {
	const images = Array.isArray(args.image) ? args.image : [];
	const wantBase64 = args.return_base64 === true;
	const resolved = resolveImageSettings(args, defaults);
	const extra = { response_format: wantBase64 ? "b64_json" : "url" };
	if (images.length > 0) {
		for (const image of images) if (typeof image !== "string" || !IMAGE_PATTERN.test(image)) throw new Error(`无效的 image 输入 "${image.slice(0, 64)}":必须是公共 HTTPS URL 或 data:image/*;base64,... Data URI。`);
		extra.image = images;
	}
	const body = {
		model: resolved.model,
		prompt: args.prompt,
		size: resolved.size,
		ratio: resolved.ratio,
		extra_body: extra
	};
	if (images.length === 0 && wantBase64) body.return_base64 = true;
	return body;
}
/**
* 将 curl 标准输出拆分为响应体和末尾状态码。
* 标记含原始换行符，而 JSON 不含，故拆分无歧义。
*/
function splitAgnesStatus(stdout) {
	const markerIndex = stdout.lastIndexOf(AGNES_STATUS_MARKER);
	if (markerIndex === -1) return {
		jsonText: stdout,
		status: null
	};
	const status = Number(stdout.slice(markerIndex + 17).trim());
	return {
		jsonText: stdout.slice(0, markerIndex),
		status: Number.isFinite(status) ? status : null
	};
}
/**
* 解析 API 响应体为规范化结果值。
* @throws 响应体形状不符时抛出面向模型的错误。
*/
function parseAgnesResponse(jsonText) {
	let parsed;
	try {
		parsed = JSON.parse(jsonText);
	} catch (_jsonParseFailure) {
		throw new Error(`Agnes API 返回了无法解析的内容:${jsonText.slice(0, 500)}`);
	}
	const record = parsed;
	const data = record !== null && typeof record === "object" && Array.isArray(record.data) ? record.data : void 0;
	const item = data === void 0 || data.length === 0 ? void 0 : data[0];
	if (item === void 0 || typeof item !== "object" || item === null) throw new Error(`Agnes API 未返回图像数据:${jsonText.slice(0, 500)}`);
	const fields = item;
	const value = {};
	if (typeof record?.created === "number") value.created = record.created;
	if (typeof fields.url === "string" && fields.url !== "") value.url = fields.url;
	if (typeof fields.b64_json === "string" && fields.b64_json !== "") value.b64_json = fields.b64_json;
	if (typeof fields.revised_prompt === "string" && fields.revised_prompt !== "") value.revised_prompt = fields.revised_prompt;
	return value;
}
/**
* 将规范化结果值渲染为面向模型的内容。
* 模型与尺寸显示本次实际生效值(含设置回退),而非硬编码常量。
*/
function renderAgnesValue(args, value, defaults) {
	const lines = [];
	if (value.url !== void 0) lines.push(`生成结果 URL:${value.url}`);
	if (value.b64_json !== void 0) lines.push(`生成结果 Base64(${value.b64_json.length} 字符,字段 b64_json)`);
	if (value.revised_prompt !== void 0) lines.push(`修正后提示词:${value.revised_prompt}`);
	const resolved = resolveImageSettings(args, defaults);
	lines.push(`模型:${resolved.model} | 尺寸:${resolved.size} ${resolved.ratio}`);
	return [{
		type: "text",
		text: lines.join("\n")
	}];
}
/** 工具描述;模型名不写入描述,避免设置改名后误导调用方。 */
const TOOL_DESCRIPTION$1 = [
	"调用 Agnes AI 图像生成 API 进行文生图、图生图或多图合成。",
	"文生图仅需 prompt(可加 size/ratio);图生图/多图合成需在 image 中传入一张或多张参考图",
	"(公共 HTTPS URL 或 data:image/*;base64,... Data URI),并在 prompt 中描述变换或组合要求,尽量保留原始构图。",
	"size 使用档位 1K/2K/3K/4K,ratio 支持 1:1、3:4、4:3、16:9、9:16、2:3、3:2、21:9;",
	"不要传 1920x1080 这类精确尺寸(会被标准化)。省略 size/ratio 时使用用户设置的默认值。",
	"默认返回图像 URL;设置 return_base64: true 时返回 b64_json。",
	"推荐提示词结构:文生图 = 主体+场景+风格+光照+构图+质量;图生图 = 改变要求+新风格+添加/移除元素+保留元素;",
	"多图合成 = 每张参考图的角色+目标场景+组合关系+风格/光照/构图。"
].join("");
/**
* 在上下文中注册 `agnes_image_generate` 工具。
* 注册挂载在调用插件的 fiber 上，随其一同移除。
* @param defaults 返回当前设置解析值的 thunk,每次执行与渲染时读取。
*/
function applyAgnesImageTool(ctx, defaults) {
	ctx.tools.register(defineTool({
		name: "agnes_image_generate",
		description: TOOL_DESCRIPTION$1,
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "图像生成或编辑的文本指令。文生图:主体+场景+风格+光照+构图+质量要求;图生图:改变要求+新风格+要添加/移除的元素+要保留的元素;多图合成:说明每张参考图的角色、目标场景、组合关系与风格。"
			},
			size: {
				type: "string",
				enum: [...SIZE_TIERS],
				description: "输出尺寸档位。1:1 时对应 1024/2048/3072/4096 边长,其他 ratio 按比例换算;需要 1920x1080/2560x1440 这类 16:9 素材时用 2K + 16:9 再裁剪;省略时用设置默认值。"
			},
			ratio: {
				type: "string",
				enum: [...RATIOS],
				description: "与 size 档位配合的宽高比;省略时用设置默认值。"
			},
			image: {
				type: "array",
				items: { type: "string" },
				description: "图生图/多图合成的输入图像:公共 HTTPS URL 或 data:image/*;base64,... Data URI;多图合成时传多张。"
			},
			return_base64: {
				type: "boolean",
				description: "为 true 时返回 b64_json 图像数据而非 URL,适用于内嵌或交给其他服务处理;大图 Base64 可能超出捕获上限,优先用 URL。"
			}
		},
		output: {
			schema: {
				type: "object",
				properties: {
					created: { type: "number" },
					url: { type: "string" },
					b64_json: { type: "string" },
					revised_prompt: { type: "string" }
				},
				additionalProperties: false
			},
			render: (args, value) => renderAgnesValue(args, value, defaults())
		},
		timeoutMs: AGNES_TOOL_TIMEOUT_MS,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const credentials = ctx.get("credentials");
			if (credentials === void 0) throw new Error("凭据服务不可用:无法解析 AGNES_API_KEY。");
			const resolvedKey = await credentials.resolve(credentialRef(AGNES_API_KEY_REF));
			if (resolvedKey === void 0) throw new Error("未配置 AGNES_API_KEY:请写入启动环境、$DSH_HOME/.credentials.yaml 或项目/user 的 .env,或在设置页的 Agnes 标签页中保存。");
			const currentDefaults = defaults();
			if (typeof currentDefaults.model !== "string" || currentDefaults.model.trim() === "") throw new Error("图像模型名为空:请在设置页的 Agnes 标签页中填写 imageModel。");
			const body = buildAgnesRequestBody(args, currentDefaults);
			const shell = ctx.shell;
			const spec = shell.resolve({
				command: `curl -sS --max-time 300 -X POST ${AGNES_API_URL} -H "Authorization: Bearer $AGNES_API_KEY" -H "Content-Type: application/json" --data-binary @- -w '\\n__AGNES_STATUS__%{http_code}'`,
				stdin: JSON.stringify(body),
				env: { [AGNES_API_KEY_REF]: resolvedKey.value },
				stdoutMaxBytes: AGNES_STDOUT_MAX_BYTES,
				timeoutMs: AGNES_TOOL_TIMEOUT_MS,
				signal: exec.signal
			});
			const result = await shell.run(spec);
			if (result.timedOut || result.aborted) throw new Error(`图像生成请求${result.timedOut ? "超时" : "被取消"}(${result.timeoutMs}ms),请稍后重试或降低 size 档位。`);
			if (result.exitCode !== 0) throw new Error(`Agnes API 请求失败(exit ${result.exitCode}):${result.stderr.text.slice(0, 500)}`);
			if (result.stdout.truncated) throw new Error("Agnes API 响应过大,超出捕获上限;请使用 URL 输出(默认)或改用更小的 size 档位。");
			const { jsonText, status } = splitAgnesStatus(result.stdout.text);
			if (status !== null && (status < 200 || status >= 300)) throw new Error(`Agnes API 返回 HTTP ${status}:${jsonText.slice(0, 800)}`);
			return parseAgnesResponse(jsonText);
		}
	}));
}
//#endregion
//#region src/video.ts
/** Agnes 视频 API 端点:创建任务。 */
const AGNES_VIDEO_API_URL = "https://api.agnes-ai.cn/v1/videos";
/** Agnes 视频 API 端点:按 video_id 查询结果(推荐)。 */
const AGNES_VIDEO_QUERY_URL = "https://api.agnes-ai.cn/agnesapi";
/** 视频生成模型的文档默认值;仅作 schema 默认,实际模型始终读自设置。 */
const DEFAULT_VIDEO_MODEL = "agnes-video-v2.0";
/** 轮询查询结果的时间间隔。 */
const AGNES_VIDEO_POLL_INTERVAL_MS = 5e3;
/** 工具调用的协作式超时预算;视频生成可能需要数分钟。 */
const AGNES_VIDEO_TOOL_TIMEOUT_MS = 9e5;
/** JSON 响应捕获上限。 */
const AGNES_VIDEO_STDOUT_MAX_BYTES = 33554432;
/** Video 2.5 系列支持的输出分辨率档位(docs/agnes-ai/Agnes Video 2.5.md)。 */
const VIDEO25_SIZES = [
	"720P",
	"960P",
	"2K"
];
/** 2.5-flash 仅支持的档位;其他取值会被 API 以 400 拒绝,构建时直接收敛。 */
const VIDEO25_FLASH_ONLY_SIZE = "720P";
/** 2.5 系列画幅白名单及宽高比值;提交时就近匹配。 */
const VIDEO25_ASPECT_TABLE = [
	{
		ratio: "21:9",
		value: 21 / 9
	},
	{
		ratio: "16:9",
		value: 16 / 9
	},
	{
		ratio: "4:3",
		value: 4 / 3
	},
	{
		ratio: "1:1",
		value: 1
	},
	{
		ratio: "3:4",
		value: 3 / 4
	},
	{
		ratio: "9:16",
		value: 9 / 16
	}
];
/**
* 按模型名判断参数体系:名字含 "2.5"(如 agnes-video-2.5 / agnes-video-2.5-flash)
* 走秒数制 OpenAI Videos 兼容体系;其余走 V2.0 的 width/height/num_frames 体系。
*/
function isVideo25Family(model) {
	return /2\.5/.test(model);
}
/**
* 把任意宽高就近匹配到 2.5 系列画幅白名单。
* 宽高不合法时回退 16:9(文档默认比例)。
*/
function nearestAspect25(width, height) {
	const target = typeof width === "number" && width > 0 && typeof height === "number" && height > 0 ? width / height : 16 / 9;
	let best = VIDEO25_ASPECT_TABLE[1];
	for (const row of VIDEO25_ASPECT_TABLE) if (Math.abs(row.value - target) < Math.abs(best.value - target)) best = row;
	return best.ratio;
}
/**
* 帧数/帧率 → 2.5 系列整数秒:四舍五入后夹到 4–12。
* 帧率非法时按 24 兜底,帧数非法时按 121 兜底(≈5 秒)。
*/
function secondsFromFrameTiming(numFrames, frameRate) {
	const fps = typeof frameRate === "number" && Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 24;
	return Math.min(12, Math.max(4, Math.round((typeof numFrames === "number" && Number.isFinite(numFrames) && numFrames > 0 ? numFrames : 121) / fps)));
}
/** 参考图片必须是可以被 API 直接抓取的公共 URL。 */
const VIDEO_IMAGE_PATTERN = /^https?:\/\//;
/**
* 合并工具参数与设置默认值:参数省略的字段落回到设置值,
* 再走同一套校验,因此设置里的非法取值与非法参数报同样的错。
*/
function resolveWithDefaults(args, defaults) {
	return {
		...args,
		width: args.width ?? defaults.width,
		height: args.height ?? defaults.height,
		num_frames: args.num_frames ?? defaults.numFrames,
		frame_rate: args.frame_rate ?? defaults.frameRate
	};
}
/**
* 根据参数构建 V2.0 体系创建任务的 API 请求体。
* @throws 参数或设置默认值不合法时抛出面向模型的错误。
*/
function buildAgnesVideoV2RequestBody(args, defaults) {
	const effective = resolveWithDefaults(args, defaults);
	const body = {
		model: defaults.model,
		prompt: effective.prompt
	};
	if (effective.width !== void 0) {
		if (!Number.isInteger(effective.width) || effective.width <= 0) throw new Error(`无效的 width ${effective.width}:必须是正整数(可在设置页的 Agnes 标签页调整默认值)。`);
		body.width = effective.width;
	}
	if (effective.height !== void 0) {
		if (!Number.isInteger(effective.height) || effective.height <= 0) throw new Error(`无效的 height ${effective.height}:必须是正整数(可在设置页的 Agnes 标签页调整默认值)。`);
		body.height = effective.height;
	}
	if (effective.num_frames !== void 0) {
		if (!Number.isInteger(effective.num_frames) || effective.num_frames < 1 || effective.num_frames > 441 || effective.num_frames % 8 !== 1) throw new Error(`无效的 num_frames ${effective.num_frames}:必须 ≤ 441 且满足 8n+1(如 81/121/241/441)。`);
		body.num_frames = effective.num_frames;
	}
	if (effective.frame_rate !== void 0) {
		if (effective.frame_rate < 1 || effective.frame_rate > 60) throw new Error(`无效的 frame_rate ${effective.frame_rate}:支持范围为 1–60。`);
		body.frame_rate = effective.frame_rate;
	}
	if (effective.seed !== void 0) body.seed = effective.seed;
	if (typeof effective.negative_prompt === "string" && effective.negative_prompt !== "") body.negative_prompt = effective.negative_prompt;
	if (effective.num_inference_steps !== void 0) {
		if (!Number.isInteger(effective.num_inference_steps) || effective.num_inference_steps <= 0) throw new Error(`无效的 num_inference_steps ${effective.num_inference_steps}:必须是正整数。`);
		body.num_inference_steps = effective.num_inference_steps;
	}
	const keyframes = Array.isArray(effective.keyframes) ? effective.keyframes.filter((item) => typeof item === "string") : [];
	const image = typeof effective.image === "string" && effective.image !== "" ? effective.image : void 0;
	if (keyframes.length > 0) {
		if (image !== void 0) throw new Error("image 与 keyframes 不能同时使用:图生视频传单张 image,关键帧动画传 keyframes 数组。");
		for (const url of keyframes) if (!VIDEO_IMAGE_PATTERN.test(url)) throw new Error(`无效的关键帧图片 "${url.slice(0, 64)}":必须是公共 HTTPS 图片 URL。`);
		body.extra_body = {
			image: keyframes,
			mode: "keyframes"
		};
	} else if (image !== void 0) {
		if (!VIDEO_IMAGE_PATTERN.test(image)) throw new Error(`无效的 image "${image.slice(0, 64)}":必须是公共 HTTPS 图片 URL。`);
		body.image = image;
	}
	return body;
}
/**
* 根据参数构建 Video 2.5 系列(含 2.5-flash)创建任务的 API 请求体。
*
* 2.5 是秒数制的 OpenAI Videos 兼容体系:mode(text/keyframe/reference)+
* seconds("4"–"12" 字符串)+ size(720P/960P/2K)+ aspect_ratio 白名单;
* 提交 width/height/num_frames/fps 等字段会被 API 以 400 拒绝,因此这里:
* - 调用方显式传了 num_frames/frame_rate 时换算为就近整秒,否则用设置的 video25Seconds;
* - aspect_ratio 由设置中的 width/height 就近匹配;
* - 工具的 image/keyframes 参数映射:keyframes 恰好两张 → keyframe 首尾帧,
*   单张 image → keyframe 首帧,三张以上 → reference/images;
* - flash 收敛:size 强制 720P、reference 图片 ≤5(超出直接报错而非静默截断)。
* @throws 参数不合法或超出 flash 限制时抛出面向模型的错误。
*/
function buildAgnesVideo25RequestBody(args, defaults) {
	const isFlash = /flash/i.test(defaults.model);
	const size = isFlash ? VIDEO25_FLASH_ONLY_SIZE : VIDEO25_SIZES.includes(defaults.size25) ? defaults.size25 : "720P";
	const effective = resolveWithDefaults(args, defaults);
	const keyframes = Array.isArray(effective.keyframes) ? effective.keyframes.filter((item) => typeof item === "string") : [];
	const image = typeof effective.image === "string" && effective.image !== "" ? effective.image : void 0;
	if (keyframes.length > 0 && image !== void 0) throw new Error("image 与 keyframes 不能同时使用:图生视频传单张 image,关键帧动画传 keyframes 数组。");
	for (const url of [...keyframes, ...image === void 0 ? [] : [image]]) if (!VIDEO_IMAGE_PATTERN.test(url)) throw new Error(`无效的关键帧图片 "${url.slice(0, 64)}":必须是公共 HTTPS 图片 URL。`);
	let mode;
	const media = {};
	if (keyframes.length >= 2) {
		if (keyframes.length === 2) {
			mode = "keyframe";
			media.first_frame = keyframes[0];
			media.last_frame = keyframes[1];
		} else {
			mode = "reference";
			if (isFlash && keyframes.length > 5) throw new Error(`${defaults.model} 的 reference 图片最多 5 张,收到 ${keyframes.length} 张;请减少关键帧数量。`);
			media.images = keyframes;
		}
	} else if (image !== void 0) {
		mode = "keyframe";
		media.first_frame = image;
	} else mode = "text";
	const seconds = args.num_frames !== void 0 || args.frame_rate !== void 0 ? secondsFromFrameTiming(effective.num_frames, effective.frame_rate) : Number.isInteger(defaults.seconds25) && defaults.seconds25 >= 4 && defaults.seconds25 <= 12 ? defaults.seconds25 : 5;
	const body = {
		model: defaults.model,
		prompt: effective.prompt,
		mode,
		seconds: String(seconds),
		size,
		aspect_ratio: nearestAspect25(effective.width, effective.height)
	};
	Object.assign(body, media);
	if (effective.seed !== void 0) {
		if (!Number.isInteger(effective.seed)) throw new Error(`无效的 seed ${effective.seed}:必须是整数。`);
		body.seed = effective.seed;
	}
	return body;
}
/**
* 构建创建任务请求体的统一入口:按设置中的模型名分发到对应参数体系。
*/
function buildAgnesVideoRequestBody(args, defaults) {
	return isVideo25Family(defaults.model) ? buildAgnesVideo25RequestBody(args, defaults) : buildAgnesVideoV2RequestBody(args, defaults);
}
/**
* 解析创建任务响应。
* @throws 响应体形状不符时抛出面向模型的错误。
*/
function parseAgnesVideoTask(jsonText) {
	let parsed;
	try {
		parsed = JSON.parse(jsonText);
	} catch (_jsonParseFailure) {
		throw new Error(`Agnes API 返回了无法解析的内容:${jsonText.slice(0, 500)}`);
	}
	const record = parsed;
	if (record === null || typeof record !== "object") throw new Error(`Agnes API 未返回有效的任务信息:${jsonText.slice(0, 500)}`);
	const value = {};
	if (typeof record.id === "string") value.id = record.id;
	if (typeof record.task_id === "string") value.task_id = record.task_id;
	if (typeof record.video_id === "string") value.video_id = record.video_id;
	if (typeof record.status === "string") value.status = record.status;
	return value;
}
/**
* 解析查询结果响应。
* @throws 响应体形状不符时抛出面向模型的错误。
*/
function parseAgnesVideoQuery(jsonText) {
	let parsed;
	try {
		parsed = JSON.parse(jsonText);
	} catch (_jsonParseFailure) {
		throw new Error(`Agnes API 返回了无法解析的内容:${jsonText.slice(0, 500)}`);
	}
	const record = parsed;
	if (record === null || typeof record !== "object") throw new Error(`Agnes API 未返回有效的视频信息:${jsonText.slice(0, 500)}`);
	const value = {};
	if (typeof record.video_id === "string") value.video_id = record.video_id;
	if (typeof record.task_id === "string") value.task_id = record.task_id;
	if (typeof record.status === "string") value.status = record.status;
	if (typeof record.progress === "number") value.progress = record.progress;
	if (typeof record.seconds === "string") value.seconds = record.seconds;
	if (typeof record.size === "string") value.size = record.size;
	if (typeof record.url === "string" && record.url !== "") value.url = record.url;
	if (record.size_mapping !== null && typeof record.size_mapping === "object") value.size_mapping = record.size_mapping;
	const metadata = record.metadata;
	if (metadata !== null && typeof metadata === "object") {
		const meta = metadata;
		if (value.url === void 0 && typeof meta.url === "string" && meta.url !== "") value.url = meta.url;
		if (value.size_mapping === void 0 && meta.size_mapping !== null && typeof meta.size_mapping === "object") value.size_mapping = meta.size_mapping;
	}
	if (record.error !== void 0) value.error = record.error;
	return value;
}
/**
* 将规范化结果值渲染为面向模型的内容。
* 模型显示本次实际生效值(读自设置),而非硬编码常量。
*/
function renderAgnesVideoValue(args, value, model) {
	const lines = [];
	lines.push(`状态:${value.status ?? "unknown"} | 进度:${value.progress ?? 0}%`);
	if (value.size !== void 0) lines.push(`分辨率:${value.size}`);
	if (value.seconds !== void 0) lines.push(`时长:${value.seconds} 秒`);
	if (value.url !== void 0) lines.push(`视频 URL:${value.url}`);
	const sizeMapping = value.size_mapping;
	if (sizeMapping !== null && typeof sizeMapping === "object" && !Array.isArray(sizeMapping) && typeof sizeMapping.message === "string") lines.push(`尺寸标准化:${sizeMapping.message}`);
	if (value.status === "failed") {
		const err = value.error;
		lines.push(`任务失败:${typeof err === "string" ? err : JSON.stringify(err ?? "(无错误详情)")}`);
	}
	lines.push(`模型:${model} | video_id:${value.video_id ?? value.task_id ?? "未知"}`);
	return [{
		type: "text",
		text: lines.join("\n")
	}];
}
/**
* 执行一次 curl 请求,拆分响应体与末尾状态码并做统一错误处理。
* 密钥通过进程环境传递,不进入命令行;请求体可经 stdin 传入。
*/
async function runCurl(shell, apiKey, command, signal, stdin) {
	const spec = shell.resolve({
		command,
		stdin,
		env: { [AGNES_API_KEY_REF]: apiKey },
		stdoutMaxBytes: AGNES_VIDEO_STDOUT_MAX_BYTES,
		timeoutMs: 6e4,
		signal
	});
	const result = await shell.run(spec);
	if (result.timedOut || result.aborted) throw new Error(`视频 API 请求${result.timedOut ? "超时" : "被取消"}(${result.timeoutMs}ms),请稍后重试。`);
	if (result.exitCode !== 0) throw new Error(`Agnes API 请求失败(exit ${result.exitCode}):${result.stderr.text.slice(0, 500)}`);
	if (result.stdout.truncated) throw new Error("Agnes API 响应过大,超出捕获上限。");
	const { jsonText, status } = splitAgnesStatus(result.stdout.text);
	if (status !== null && (status < 200 || status >= 300)) throw new Error(`Agnes API 返回 HTTP ${status}:${jsonText.slice(0, 800)}`);
	return jsonText;
}
/** 等待指定时长,提前触发 abort 时立即返回。 */
function sleep(ms, signal) {
	return new Promise((resolve) => {
		if (signal.aborted) {
			resolve();
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			resolve();
		}, { once: true });
	});
}
/**
* 按 video_id 轮询查询结果,直到任务完成或失败。
* 查询统一附带 model_name:2.5 系列的 keyframe/reference 模式必须携带,
* V2.0 亦支持该参数,无副作用。
* @throws 超过总预算或调用被取消时抛出面向模型的错误。
*/
async function pollAgnesVideo(shell, apiKey, videoId, model, signal) {
	const deadline = Date.now() + AGNES_VIDEO_TOOL_TIMEOUT_MS;
	const queryCommand = `curl -sS --max-time 60 -G ${AGNES_VIDEO_QUERY_URL} --data-urlencode "video_id=${videoId}" --data-urlencode "model_name=${model}" -H "Authorization: Bearer $AGNES_API_KEY" -w '\\n__AGNES_STATUS__%{http_code}'`;
	let value;
	for (;;) {
		if (signal.aborted) throw new Error(`视频生成查询被取消(video_id=${videoId})。`);
		value = parseAgnesVideoQuery(await runCurl(shell, apiKey, queryCommand, signal));
		if (value.status === "completed" || value.status === "failed") return value;
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error(`视频生成超时(超过 ${AGNES_VIDEO_TOOL_TIMEOUT_MS}ms),任务仍处于 ${value.status ?? "unknown"} 状态;可使用 video_id=${videoId} 稍后重新查询。`);
		await sleep(Math.min(AGNES_VIDEO_POLL_INTERVAL_MS, remaining), signal);
	}
}
/** 工具描述;模型名不写入描述,避免设置改名后误导调用方。 */
const TOOL_DESCRIPTION = [
	"调用 Agnes Video API 生成视频,支持三种模式:文生视频(仅传 prompt)、图生视频(image 传单张公共 HTTPS 图片 URL)",
	"和关键帧动画(keyframes 传两张以上公共 HTTPS 图片 URL,在关键帧之间生成平滑过渡)。",
	"参数体系按设置中的模型名自动适配:V2.0 系列用 width/height/num_frames/frame_rate(num_frames ≤441 且满足 8n+1,",
	"frame_rate 24 时 81≈3 秒、121≈5 秒、241≈10 秒、441≈18 秒);2.5 系列(含 2.5-flash)自动换算为 seconds(4–12 整秒)、",
	"分辨率档位与画幅白名单,并省略其不接受字段;2.5-flash 仅 720P 档、reference 图片最多 5 张。",
	"视频生成是异步任务,工具会先创建任务再轮询查询结果,完成后直接返回视频 URL(metadata.url);失败时返回 error 详情。",
	"宽高省略时使用用户设置的默认值;V2.0 提交的尺寸会被 API 标准化到 480p/720p/1080p 档位,以返回的 size 与 metadata.size_mapping 为准。",
	"提示词结构:文生视频 = 主体+动作+场景+镜头运动+光线+风格;图生视频 = 描述应运动与应保持稳定的元素;关键帧 = 描述关键帧之间的过渡关系。",
	"设置 seed 可复现结果,negative_prompt 仅 V2.0 系列生效(2.5 系列不支持该字段)。"
].join("");
/**
* 在上下文中注册 `agnes_video_generate` 工具。
* 注册挂载在调用插件的 fiber 上,随其一同移除。
* @param defaults 返回当前设置解析值的 thunk,每次执行与渲染时读取。
*/
function applyAgnesVideoTool(ctx, defaults) {
	ctx.tools.register(defineTool({
		name: "agnes_video_generate",
		description: TOOL_DESCRIPTION,
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "视频内容的文本描述。文生视频:主体+动作+场景+镜头运动+光线+风格;图生视频:描述应运动的元素与应保持稳定的元素;关键帧动画:描述关键帧之间的过渡关系。"
			},
			image: {
				type: "string",
				description: "图生视频模式的输入图片 URL(公共 HTTPS 图片),生成以该图片为第一帧的动态视频;与 keyframes 互斥。"
			},
			keyframes: {
				type: "array",
				items: { type: "string" },
				description: "关键帧动画模式的输入图片 URL 数组(公共 HTTPS 图片,至少两张),在关键帧之间生成平滑过渡;与 image 互斥。"
			},
			width: {
				type: "integer",
				description: "视频宽度,省略时用设置默认值;V2.0 系列会被 API 标准化到 480p/720p/1080p 档位,2.5 系列仅取其画幅比例。"
			},
			height: {
				type: "integer",
				description: "视频高度,省略时用设置默认值;标准化行为同 width。"
			},
			num_frames: {
				type: "integer",
				description: "视频帧数,V2.0 系列 ≤441 且满足 8n+1(如 81/121/241/441),省略时用设置默认值;2.5 系列换算为最接近的整秒(4–12)。"
			},
			frame_rate: {
				type: "number",
				description: "视频帧率,V2.0 系列支持 1–60,省略时用设置默认值;更流畅的运动用 24 或 30;2.5 系列仅参与秒数换算。"
			},
			seed: {
				type: "integer",
				description: "随机种子,设置固定值可复现生成结果。"
			},
			negative_prompt: {
				type: "string",
				description: "反向提示词,描述需要避免的内容;仅 V2.0 系列支持,2.5 系列会忽略。"
			},
			num_inference_steps: {
				type: "integer",
				description: "推理步数,一般不需要设置。"
			}
		},
		output: {
			schema: {
				type: "object",
				properties: {
					video_id: { type: "string" },
					task_id: { type: "string" },
					status: { type: "string" },
					progress: { type: "number" },
					seconds: { type: "string" },
					size: { type: "string" },
					url: { type: "string" },
					size_mapping: { type: "json" },
					error: { type: "json" }
				},
				additionalProperties: false
			},
			render: (args, value) => renderAgnesVideoValue(args, value, defaults().model)
		},
		timeoutMs: AGNES_VIDEO_TOOL_TIMEOUT_MS,
		isConcurrencySafe: () => true,
		async execute(args, exec) {
			const credentials = ctx.get("credentials");
			if (credentials === void 0) throw new Error("凭据服务不可用:无法解析 AGNES_API_KEY。");
			const resolvedKey = await credentials.resolve(credentialRef(AGNES_API_KEY_REF));
			if (resolvedKey === void 0) throw new Error("未配置 AGNES_API_KEY:请写入启动环境、$DSH_HOME/.credentials.yaml 或项目/user 的 .env,或在设置页的 Agnes 标签页中保存。");
			const currentDefaults = defaults();
			if (typeof currentDefaults.model !== "string" || currentDefaults.model.trim() === "") throw new Error("视频模型名为空:请在设置页的 Agnes 标签页中填写 videoModel。");
			const body = buildAgnesVideoRequestBody(args, currentDefaults);
			const shell = ctx.shell;
			const createCommand = `curl -sS --max-time 60 -X POST ${AGNES_VIDEO_API_URL} -H "Authorization: Bearer $AGNES_API_KEY" -H "Content-Type: application/json" --data-binary @- -w '\\n__AGNES_STATUS__%{http_code}'`;
			const task = parseAgnesVideoTask(await runCurl(shell, resolvedKey.value, createCommand, exec.signal, JSON.stringify(body)));
			const videoId = task.video_id ?? task.task_id ?? task.id;
			if (videoId === void 0) throw new Error(`Agnes API 未返回 video_id/task_id:${JSON.stringify(task)}`);
			return await pollAgnesVideo(shell, resolvedKey.value, videoId, currentDefaults.model, exec.signal);
		}
	}));
}
//#endregion
//#region src/models.ts
/** 支持的图像生成模型。 */
const IMAGE_MODEL_CATALOG = [{
	id: "agnes-image-2.1-flash",
	label: "Agnes Image 2.1 Flash"
}];
/** 支持的视频生成模型(下拉顺序即展示顺序)。 */
const VIDEO_MODEL_CATALOG = [{
	id: "agnes-video-v2.0",
	label: "Agnes Video V2.0"
}, {
	id: "agnes-video-2.5-flash",
	label: "Agnes Video 2.5 Flash"
}];
/** 图像模型 ID 集合,用于判断保存值是否在下拉目录内。 */
const IMAGE_MODEL_IDS = IMAGE_MODEL_CATALOG.map((model) => model.id);
/** 视频模型 ID 集合。 */
const VIDEO_MODEL_IDS = VIDEO_MODEL_CATALOG.map((model) => model.id);
/** 视频模型 → 推荐默认参数;未知模型(自定义/未来上游)回退到同一组通用安全值。 */
function videoModelPreset(_model) {
	return {
		videoWidth: 1280,
		videoHeight: 720,
		videoNumFrames: 121,
		videoFrameRate: 24,
		video25Seconds: 5,
		video25Size: "720P"
	};
}
/** 图像模型 → 推荐默认参数。 */
function imageModelPreset(_model) {
	return {
		defaultSize: "1K",
		defaultRatio: "1:1"
	};
}
//#endregion
//#region src/index.ts
const name = "dsh-agnes";
/**
* 插件注册工具前需等待 tools 服务就绪;
* 工具执行经属性访问(ctx.shell)使用 shell 服务发起 curl,必须在 inject 中声明,
* 否则运行时报 `cannot get property "shell" without inject`。
*/
const inject = ["tools", "shell"];
/** 设置命名空间；浏览器端会再次声明。 */
const AGNES_SETTINGS_NAMESPACE = settingsNamespace("agnes");
/** schema 无法表达的跨字段约束(如 8n+1 帧数)统一在这里校验。@throws 不合法时抛出带字段名的错误。 */
function assertConfig(config) {
	if (typeof config.imageModel !== "string" || config.imageModel.trim() === "") throw new Error(`imageModel 必须是非空字符串,目录模型:${IMAGE_MODEL_IDS.join(" / ")}。`);
	if (typeof config.videoModel !== "string" || config.videoModel.trim() === "") throw new Error(`videoModel 必须是非空字符串,目录模型:${VIDEO_MODEL_IDS.join(" / ")}。`);
	for (const key of ["videoWidth", "videoHeight"]) {
		const value = config[key];
		if (!Number.isInteger(value) || value < 1) throw new Error(`${key} 必须是正整数,收到 ${value}。`);
	}
	const frames = config.videoNumFrames;
	if (!Number.isInteger(frames) || frames < 9 || frames > 441 || frames % 8 !== 1) throw new Error(`videoNumFrames 必须是 ≤441 且满足 8n+1 的整数(如 81/121/241/441),收到 ${frames}。`);
	const rate = config.videoFrameRate;
	if (!Number.isFinite(rate) || rate < 1 || rate > 60) throw new Error(`videoFrameRate 必须在 1–60 之间,收到 ${rate}。`);
	const seconds25 = config.video25Seconds;
	if (!Number.isInteger(seconds25) || seconds25 < 4 || seconds25 > 12) throw new Error(`video25Seconds 必须是 4–12 的整数秒,收到 ${seconds25}。`);
	if (!VIDEO25_SIZES.includes(config.video25Size)) throw new Error(`video25Size 必须是 ${VIDEO25_SIZES.join("/")} 之一,收到 ${config.video25Size}。`);
}
const Config = z.object({
	imageModel: z.string().default(DEFAULT_IMAGE_MODEL).description(`图像生成模型(下拉:${IMAGE_MODEL_IDS.join("/")})`),
	defaultSize: z.union([...SIZE_TIERS]).default("1K").description("调用省略 size 时的默认尺寸档位"),
	defaultRatio: z.union([...RATIOS]).default("1:1").description("调用省略 ratio 时的默认宽高比"),
	videoModel: z.string().default(DEFAULT_VIDEO_MODEL).description(`视频生成模型(下拉:${VIDEO_MODEL_IDS.join("/")})`),
	videoWidth: z.number().min(1).max(8192).default(1280).description("调用省略 width 时的默认视频宽度(16:9 · 720p)"),
	videoHeight: z.number().min(1).max(8192).default(720).description("调用省略 height 时的默认视频高度(16:9 · 720p)"),
	videoNumFrames: z.number().min(9).max(441).default(121).description("调用省略 num_frames 时的默认帧数,需满足 8n+1"),
	videoFrameRate: z.number().min(1).max(60).default(24).description("调用省略 frame_rate 时的默认帧率"),
	video25Seconds: z.number().min(4).max(12).default(5).description("Video 2.5 系列默认时长(整数秒)"),
	video25Size: z.union([...VIDEO25_SIZES]).default("720P").description("Video 2.5 系列输出分辨率档位;flash 仅支持 720P")
});
/**
* 注册工具并连接设置命名空间。
* 每次调用读取命名空间的解析值，因此设置修改无需重启即可生效；
* 模型名称与默认参数同样来自该命名空间，不硬编码在工具内。
*/
function apply(ctx, config) {
	assertConfig(config);
	let source = () => config;
	installSettingsSection(ctx, AGNES_SETTINGS_NAMESPACE, Config, config, {
		setSource: (current) => {
			source = current;
		},
		onChange: () => {},
		validate: assertConfig
	});
	applyAgnesImageTool(ctx, () => {
		const current = source();
		return {
			model: current.imageModel,
			defaultSize: current.defaultSize,
			defaultRatio: current.defaultRatio
		};
	});
	applyAgnesVideoTool(ctx, () => {
		const current = source();
		return {
			model: current.videoModel,
			width: current.videoWidth,
			height: current.videoHeight,
			numFrames: current.videoNumFrames,
			frameRate: current.videoFrameRate,
			seconds25: current.video25Seconds,
			size25: current.video25Size
		};
	});
}
//#endregion
export { AGNES_SETTINGS_NAMESPACE, Config, IMAGE_MODEL_CATALOG, IMAGE_MODEL_IDS, VIDEO_MODEL_CATALOG, VIDEO_MODEL_IDS, apply, assertConfig, imageModelPreset, inject, name, videoModelPreset };
