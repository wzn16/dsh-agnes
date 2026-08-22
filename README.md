# dsh-agnes

基于 [Cordis](https://github.com/deepseek-ai/cordis) 的 DSH 插件(标准 bundle 包),为 DSH 会话提供 Agnes AI 的图像与视频生成工具,并在设置页提供「Agnes」标签页调整默认参数。

## 功能

- **图像生成**:`agnes_image_generate` 工具,通过 Agnes 图像 API 实现文生图、图生图(参考图)和多图合成。
- **视频生成**:`agnes_video_generate` 工具,通过 Agnes 视频 API 实现文生视频、图生视频和关键帧动画(异步任务 + 轮询查询)。
- **设置面板**:设置页出现「Agnes」标签页,可调整图像/视频的默认参数与模型名称;修改无需重启即对后续工具调用生效。

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

## 设置页:「Agnes」标签页

插件装载后,DSH 设置页会出现「Agnes」标签页(浏览器半侧由 `lib/client.js` 提供,经 `/plugins/dsh-agnes/client.js` 伺服)。可调整的默认参数:

> 注意:Host 只在扫描到 `dsh.client` 声明时才把浏览器半侧编入启动图,且扫描结果在进程内缓存。给已安装的旧版本追加浏览器半侧后,需要重启一次 web profile(`dsh web`)才能让标签页出现;全新安装则无需额外操作。

| 分组 | 字段 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 图像 | 图像模型名称 | `agnes-image-2.1-flash` | 工具实际调用的模型 |
| 图像 | 默认尺寸档位 | `1K` | 调用省略 `size` 时使用 |
| 图像 | 默认宽高比 | `1:1` | 调用省略 `ratio` 时使用 |
| 视频 | 视频模型名称 | `agnes-video-v2.0` | 工具实际调用的模型 |
| 视频 | 默认宽度 / 高度 | `1152` / `768` | 调用省略时使用;会被 API 标准化到 480p/720p/1080p 档位 |
| 视频 | 默认帧数 | `121` | ≤441 且满足 8n+1;帧率 24 下约 5 秒 |
| 视频 | 默认帧率 | `24` | 支持 1–60 |

### 模型升级不硬编码

模型名称是自由字符串字段:Agnes 上游发布新版本(如 `agnes-image-3.x`)时,在设置页改个名字即可切换,无需更新或重建插件。文档当前值只作为 schema 默认值存在;工具描述里也不写死模型名,避免改名后误导调用方。设置保存经 revision 栅校验,非法取值(如帧数不满足 8n+1)会在保存时报错而不是静默生效。

等价的持久化方式是在 profile 的插件行里写 `config`(组装层),或直接改用户设置文档;设置页的「重置」会清除覆盖、回到组装值/默认值。

## 工具说明

### agnes_image_generate

- **尺寸档位**:`1K`、`2K`、`3K`、`4K`
- **宽高比**:`1:1`、`3:4`、`4:3`、`16:9`、`9:16`、`2:3`、`3:2`、`21:9`
- **参数**:`prompt`(必填)、`size`、`ratio`、`image`(参考图 URL 数组)、`return_base64`;省略 `size`/`ratio` 时使用设置默认值
- **模型**:读自设置的图像模型名称

### agnes_video_generate

- **模式**:文生视频(`prompt`)、图生视频(`image`)、关键帧动画(`keyframes`,至少两张)
- **主要参数**:`prompt`、`image`、`keyframes`、`width`、`height`、`num_frames`(≤441 且遵循 8n+1 规则)、`frame_rate`(1–60)、`seed`、`negative_prompt`、`num_inference_steps`;省略几何/时长参数时使用设置默认值
- **模型**:读自设置的视频模型名称
- 视频生成是异步任务,工具会创建任务后以 5 秒间隔轮询直到完成或失败。

## 开发

```sh
pnpm install        # 安装依赖(含 tsdown / typescript)
pnpm check          # tsc --noEmit 类型检查
pnpm build          # tsdown 构建产物到 lib/,并复制浏览器半侧到 lib/client.js
pnpm test           # 无依赖冒烟测试(服务端纯函数 + 客户端 bundle 注册/渲染)
```

目录结构:

```
├── src/                # TypeScript 源码(index/image/video)
├── client/client.js    # 浏览器半侧源码(手写的惰性 CJS 工厂最终格式)
├── scripts/            # 构建辅助与冒烟测试
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
