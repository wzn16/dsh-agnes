# dsh-agnes

基于 [Cordis](https://github.com/deepseek-ai/cordis) 的 DSH 插件(标准 bundle 包),为 DSH 会话提供 Agnes AI 的图像与视频生成工具。

## 功能

- **图像生成**:`agnes_image_generate` 工具,通过 Agnes Image 2.1 Flash API 实现文生图、图生图(参考图)和多图合成。
- **视频生成**:`agnes_video_generate` 工具,通过 Agnes Video V2.0 API 实现文生视频、图生视频和关键帧动画(异步任务 + 轮询查询)。
- **设置面板**:通过 `dsh-settings` 提供配置界面,修改默认尺寸/宽高比无需重启即可生效。

## 安装

本包是一个 [dsh bundle](docs/user/develop/basic/publish.zh.md):manifest 声明 `dsh.bundle`,内含 `cordis.patch.yml` 配置层。用 `dsh plugin add` 把它装进一个 profile 即可。三种方式任选:

### 从 npm 安装(推荐,无需构建授权)

```sh
dsh plugin --profile <你的profile> add dsh-agnes
```

npm 上的包是预构建产物,安装即用。

### 从 GitHub 安装

```sh
dsh plugin --profile <你的profile> add github:chaoliu615/dsh-agnes
```

git 安装拉取的是源码,pnpm 会在装完后运行本包的 `prepare` 脚本现场构建。pnpm ≥10 默认拒绝执行依赖的构建脚本,首次安装会被拦下;按提示把包键加入该 profile 的 `pnpm-workspace.yaml` 后重试:

```yaml
allowBuilds:
  dsh-agnes: true
```

注意:这是**允许本包的代码在你机器上于安装时执行**。建议锁定 commit(`github:chaoliu615/dsh-agnes#<sha>`)以免后续推送悄悄改变实际运行的代码。

### 从 tarball 安装

```sh
pnpm pack   # 仓库内执行,得到 dsh-agnes-x.y.z.tgz
dsh plugin --profile <你的profile> add ./dsh-agnes-x.y.z.tgz
```

需要以下 peer 依赖(DSH 环境已内置):

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-credentials`
- `@deepseek-ai/dsh-llm`
- `@deepseek-ai/dsh-settings`
- `@deepseek-ai/dsh-shell`
- `@deepseek-ai/dsh-tools`

### 凭据

在 DSH 凭据中配置 `AGNES_API_KEY`,用于调用 Agnes API。密钥通过进程环境传递给 curl,不会出现在命令行中。

### 插件配置

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `defaultSize` | `1K` | 调用省略 `size` 时的默认尺寸档位 |
| `defaultRatio` | `1:1` | 调用省略 `ratio` 时的默认宽高比 |

## 工具说明

### agnes_image_generate

- **尺寸档位**:`1K`、`2K`、`3K`、`4K`
- **宽高比**:`1:1`、`3:4`、`4:3`、`16:9`、`9:16`、`2:3`、`3:2`、`21:9`
- **参数**:`prompt`(必填)、`size`、`ratio`、`image`(参考图 URL 数组)、`return_base64`

### agnes_video_generate

- **模型**:Agnes Video V2.0
- **模式**:文生视频(`prompt`)、图生视频(`image`)、关键帧动画(`keyframes`,至少两张)
- **主要参数**:`prompt`、`image`、`keyframes`、`width`(默认 1152)、`height`(默认 768)、`num_frames`(≤441 且遵循 8n+1 规则)、`frame_rate`(1–60)、`seed`、`negative_prompt`、`num_inference_steps`
- 视频生成是异步任务,工具会创建任务后以 5 秒间隔轮询直到完成或失败。

## 开发

```sh
pnpm install        # 安装依赖(含 tsdown / typescript)
pnpm check          # tsc --noEmit 类型检查
pnpm build          # tsdown 构建发布产物到 lib/
```

目录结构:

```
├── src/                # TypeScript 源码(index/image/video)
├── lib/                # 构建产物(git 忽略;npm 发布与运行时入口)
├── cordis.patch.yml    # dsh.bundle 配置层,按包名引用本包
├── tsdown.config.ts    # 构建配置(prepare 脚本复用,自包含)
└── docs/               # DSH 插件开发文档(参考用)
```

本地联调:先 `pnpm build`,再把本目录作为本地依赖装入 profile:

```sh
dsh plugin --profile demo add /path/to/dsh-agnes
dsh --profile demo --dump-config   # 应能看到 "# == dsh-agnes" 层
```

发布到 npm:`pnpm publish`(publish 前自动触发 prepare 构建,`files` 白名单只带 `lib/` 与 `cordis.patch.yml`)。
