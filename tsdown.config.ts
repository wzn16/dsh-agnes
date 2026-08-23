import { defineConfig } from 'tsdown'

/**
 * 构建发布产物到 lib/。
 * - ESM 单入口,内部模块(image/video)打包进 index.js;
 * - dependencies/peerDependencies 自动外部化,不打进产物;
 * - dts 生成 lib/index.d.ts;
 * - 浏览器半侧不参与打包:client/client.js 已是惰性 CJS 工厂最终格式,
 *   由 build 脚本的 copy-client 步骤原样复制为 lib/client.js(exports["./client"]);
 * - prepare 脚本在 git 安装时运行本配置,自包含、不依赖 monorepo 环境。
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  outDir: 'lib',
  // 固定输出 .js / .d.ts(默认会得到 .mjs / .d.mts),与 package.json 的入口声明一致。
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  dts: true,
  clean: true,
  target: 'node20',
})
