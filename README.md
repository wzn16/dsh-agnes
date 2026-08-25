# dsh-agnes

基于 [Cordis](https://github.com/chaoliu615/dsh-agnes) 的 DSH 插件（标准 bundle 包），为 DSH 会话提供 Agnes AI 的图像与视频生成工具，并在设置页提供「Agnes」标签页调整默认参数。

| | |
|---|---|
| 版本 | 0.6.0 |
| 许可证 | MIT |
| 运行环境 | Node.js ≥ 20 |
| 平台 | Host（Node.js）+ Web 客户端（浏览器设置页） |

---

## 功能

- **图像生成**：`agnes_image_generate` 工具，通过 Agnes 图像 API 实现文生图、图生图（参考图）和多图合成。
- **视频生成**：`agnes_video_generate` 工具，通过 Agnes 视频 API 实现文生视频、图生视频和关键帧动画（异步任务 + 轮询查询）；按模型名自适应 V2.0 与 Video 2.5 / 2.5-flash 两代参数体系。
- **设置面板**：设置页出现「Agnes」标签页，模型以下拉选择（目录对齐官方文档的三个接入模型），切换模型时其余默认值自适应；修改保存后落盘到 `~/.dsh/settings.yaml`，无需重启即对后续工具调用生效。

---

## 安装

本包是一个 dsh bundle：manifest 声明 `dsh.bundle`，内含 `cordis.patch.yml` 配置层。用 `dsh plugin add` 把它装进一个 profile 即可。三种方式任选：

### 从 npm 安装（推荐，无需构建授权）

```bash
dsh plugin --profile web add dsh-agnes
```

npm 上的包是预构建产物，安装即用。

### 从 GitHub 安装

```bash
dsh plugin --profile web add github:chaoliu615/dsh-agnes
```

git 安装拉取的是源码，pnpm 会在装完后运行本包的 `prepare` 脚本现场构建。pnpm ≥10 默认拒绝执行依赖的构建脚本，首次安装会被拦下；按提示把包键加入该 profile 的 `pnpm-workspace.yaml` 后重试：

```yaml
allowBuilds:
  dsh-agnes: true
```

> 注意：这是允许本包的代码在你机器上于安装时执行。建议锁定 commit（`github:chaoliu615/dsh-agnes#<sha>`）以免后续推送悄悄改变实际运行的代码。

### 从 tarball 安装

```bash
pnpm pack   # 仓库内执行，得到 dsh-agnes-x.y.z.tgz
dsh plugin --profile web add ./dsh-agnes-x.y.z.tgz
```

需要以下 peer 依赖（DSH 环境已内置）：

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-credentials`
- `@deepseek-ai/dsh-llm`
- `@deepseek-ai/dsh-settings`
- `@deepseek-ai/dsh-shell`
- `@deepseek-ai/dsh-tools`

---

## 凭据

在 DSH 凭据中配置 `AGNES_API_KEY`，用于调用 Agnes API。可用来源：

- 启动环境变量；
- `$DSH_HOME/.credentials.yaml`；
- 项目 / user 级 `.env`；
- 设置页「Agnes」标签页保存。

密钥通过进程环境传递给 curl（请求体经 stdin 写入），均不会出现在命令行中。未配置密钥时工具会抛出带指引的错误，不会发起请求。

---

## 设置页：「Agnes」标签页

插件装载后，DSH 设置页会出现「Agnes」标签页（浏览器半侧由 `lib/client.js` 提供，经 `/plugins/dsh-agnes/client.js` 伺服）。

> 注意：Host 只在扫描到 `dsh.client` 声明时才把浏览器半侧编入启动图，且扫描结果在进程内缓存。给已安装的旧版本追加浏览器半侧后，需要重启一次 web profile（`dsh web`）才能让标签页出现；全新安装则无需额外操作。

模型是下拉选择，选项对齐 `docs/agnes-ai/` 的三个接入模型（目录见 `src/models.ts`，与浏览器半侧保持一致）：

- 图像：`agnes-image-2.1-flash`（Agnes Image 2.1 Flash）
- 视频：`agnes-video-v2.0`（Agnes Video V2.0）、`agnes-video-2.5-flash`（Agnes Video 2.5 Flash）

**默认配置自适应**：切换模型时，依赖字段自动暂存为该模型的推荐默认值（视频统一为 16:9 · 1280×720 · 约 5 秒），表单形态也随参数体系切换——V2.0 显示画幅像素/帧数/帧率，2.5 Flash 切换为整秒时长并把分辨率档位锁定为 720P（flash 上游唯一支持档）；历史保存的其他档位在提交时由 Host 按 720P 收敛。自适应结果可继续微调后保存。

可调整的默认参数：

| 分组 | 字段 | 默认值 | 说明 |
|---|---|---|---|
| 图像 | 图像模型 | `agnes-image-2.1-flash` | 下拉选择；历史配置中的未知模型名会保留为「(当前)」选项 |
| 图像 | 默认尺寸档位 | `1K`（1K · 日常生成） | 1K–4K；与比例组合的输出像素实时显示在页面上 |
| 图像 | 默认宽高比 | `1:1`（方形） | 8 种比例均带场景标签（壁纸/头像/海报等） |
| 视频 | 视频模型 | `agnes-video-v2.0` | 下拉选择；切换即自适应下方默认值与表单形态 |
| 视频 | 画幅与清晰度 | 16:9 · 横版 + 720p · 高清（提交 1280×720） | V2.0：预设映射到底层 width/height，API 再标准化到最近档；2.5 系列：提交 aspect_ratio + size（720P/960P/2K，flash 锁定 720P）。非预设组合自动显示「自定义…」精确像素输入 |
| 视频 | 视频时长 | V2.0：约 5 秒（121 帧）；2.5：5 秒 | V2.0 用官方推荐帧数预设 81/121/241/441 + 自定义（8n+1）；2.5 系列为整秒选择器（4–12） |
| 视频 | 帧率（V2.0） | 24 · 电影感 | 24/30 预设 + 自定义（1–60）；时长提示随帧率联动；2.5 系列隐藏该行 |

设置页 UI 只引用 DSH 官方主题令牌（`Theme.listTokens` 的别名集），派生色用 `color-mix`，根节点声明 `color-scheme: light dark`，明暗主题下原生控件与配色自动跟随，不携带浅色硬编码回退。文案内置中英双语字典。

---

## 配置落盘

设置页的修改经 settings scope 写入 DSH 用户设置文档，持久化到 `~/.dsh/settings.yaml` 的 `agnes:` 段（DSH 标准设置文件；文件后端为原子写入）：

```yaml
agnes:
  imageModel: agnes-image-2.1-flash
  defaultSize: 1K
  defaultRatio: 1:1
  videoModel: agnes-video-2.5-flash
  videoWidth: 1280
  videoHeight: 720
  videoNumFrames: 121
  videoFrameRate: 24
  video25Seconds: 5
  video25Size: 720P
```

只写用户改过的字段；未覆盖的字段回落到组装层 config 或 schema 默认值。设置保存经 revision 栅校验，非法取值（如帧数不满足 8n+1）会在保存时报错而不是静默生效。等价的持久化方式是在 profile 的插件行里写 config（组装层），或直接编辑该文件；设置页的「重置」会清除覆盖、回到组装值/默认值。

工具每次调用都读取设置的解析值，模型名与默认参数不硬编码在代码里——修改即时生效，无需重启。

### 目录之外的模型名

Host 端按非空字符串校验模型名：历史配置里的旧名称（如 `agnes-video-2.5`）与未来上游新 ID 仍可解码运行，只是不在下拉列表中（显示为「(当前)」）。要让新模型进入下拉目录，更新插件版本即可；运行时参数体系本就按模型名自适应（名字含 `2.5` 走秒数制，含 `flash` 收敛 720P）。

---

## 工具说明

### `agnes_image_generate`

调用 Agnes 图像 API（`POST /v1/images/generations`，同步返回）。模型读自设置的图像模型名称。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `prompt` | string | ✅ | 生成/编辑指令。文生图 = 主体+场景+风格+光照+构图+质量；图生图 = 改变要求+新风格+保留元素；多图合成 = 每张参考图的角色+组合关系 |
| `size` | string | — | 尺寸档位：`1K` / `2K` / `3K` / `4K`；不要传精确像素（会被标准化）；省略或非法时回退设置默认值 |
| `ratio` | string | — | 宽高比：`1:1` `3:4` `4:3` `16:9` `9:16` `2:3` `3:2` `21:9`；省略时同上 |
| `image` | string[] | — | 参考图：公共 HTTPS URL 或 `data:image/*;base64,…` Data URI；多张即多图合成 |
| `return_base64` | boolean | — | `true` 时返回 `b64_json` 而非 URL；大图可能超出捕获上限，优先用 URL |

输出值：`created` / `url` / `b64_json` / `revised_prompt`；渲染文本同时标注本次实际生效的模型与尺寸。

### `agnes_video_generate`

调用 Agnes 视频 API，支持三种模式：文生视频（仅 `prompt`）、图生视频（`image` 单张公共 HTTPS 图片 URL）、关键帧动画（`keyframes` ≥2 张，帧间平滑过渡）；`image` 与 `keyframes` 互斥。模型读自设置的视频模型名称。

**异步任务流程**：

```
execute → POST /v1/videos 创建任务（取 video_id / task_id）
        → 每 5 秒 GET /agnesapi?video_id=…&model_name=… 轮询
        → completed：返回视频 URL；failed：返回 error 详情
        → 总预算 900 秒，超时会提示携带 video_id 稍后重查
```

**双参数体系自适应**（按设置中的模型名分发）：模型名含 `2.5`（如 `agnes-video-2.5` / `agnes-video-2.5-flash`）时自动切换到秒数制 OpenAI Videos 兼容体系——

- `seconds`：整数秒 4–12（默认读设置 `video25Seconds`；显式传 num_frames/frame_rate 时按「帧数 ÷ 帧率」四舍五入并夹取）；
- `size`：720P/960P/2K（读设置 `video25Size`；flash 仅支持 720P，其他值自动收敛）；
- `aspect_ratio`：由设置的 width/height 就近匹配白名单（21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16）；
- 媒体映射：单张 `image` → keyframe 首帧；恰好两张 `keyframes` → keyframe 首尾帧；三张以上 → reference 的 images（flash 上限 5 张，超出报错）；
- 查询统一附带 `model_name`；width/height/num_frames/negative_prompt 等 2.5 不接受的字段不会提交。

主要参数（V2.0 系列）：`width` / `height`（正整数，API 会标准化到 480p/720p/1080p 档位）、`num_frames`（≤441 且遵循 8n+1 规则，24fps 下 81≈3s / 121≈5s / 241≈10s / 441≈18s）、`frame_rate`（1–60）、`seed`（固定可复现）、`negative_prompt`（仅 V2.0 生效）、`num_inference_steps`；省略几何/时长参数时使用设置默认值。

输出值：`video_id` / `task_id` / `status` / `progress` / `seconds` / `size` / `url`（顶层与 `metadata.url` 兼容）/ `size_mapping` / `error`。

---

## 开发

```bash
pnpm install        # 安装依赖（含 tsdown / typescript）
pnpm check          # tsc --noEmit 类型检查
pnpm build          # tsdown 构建产物到 lib/，并复制浏览器半侧到 lib/client.js
pnpm test           # 无依赖冒烟测试（服务端纯函数 + 客户端 bundle 注册/渲染）
```

冒烟测试模拟 window/document/React 运行，覆盖请求体构建（双参数体系、参数回退、flash 收敛）、`assertConfig` 校验、模型目录预设，以及客户端注册与各表单形态渲染。

目录结构：

```
├── src/                # TypeScript 源码（index/image/video/models）
├── client/client.js    # 浏览器半侧源码（手写的惰性 CJS 工厂最终格式）
├── scripts/            # 构建辅助（copy-client.mjs）与冒烟测试（smoke.mjs）
├── lib/                # 构建产物（git 内跟踪；npm 发布与运行时入口）
├── cordis.patch.yml    # dsh.bundle 配置层，按包名引用本包
├── tsdown.config.ts    # 构建配置（prepare 脚本复用，自包含）
└── docs/
    ├── user/           # DSH 插件开发文档（已入库）
    └── agnes-ai/       # 上游模型 API 文档本地副本（被 .gitignore 忽略，仅本地参考）
```

产物入口（`package.json` `exports`）：`.` → `lib/index.js`（Host），`./client` → `lib/client.js`（Web）。

本地联调：先 `pnpm build`，再把本目录作为本地依赖装入 profile：

```bash
dsh plugin --profile demo add /path/to/dsh-agnes
dsh --profile demo --dump-config   # 应能看到 "# == dsh-agnes" 层
```

发布到 npm：`pnpm publish`（publish 前自动触发 prepare 构建，files 白名单只带 `lib/` 与 `cordis.patch.yml`）。

---

## License

[MIT](LICENSE)
