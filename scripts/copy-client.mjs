/**
 * 把浏览器半侧(client/client.js,手写的惰性 CJS 工厂最终格式)复制到 lib/client.js。
 * 该文件即 `exports["./client"]` 指向的产物,无需转译;独立成脚本是为了跨平台。
 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const from = join(root, 'client', 'client.js')
const to = join(root, 'lib', 'client.js')
await mkdir(dirname(to), { recursive: true })
await copyFile(from, to)
console.log(`copied ${from} -> ${to}`)
