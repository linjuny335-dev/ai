/* ============================================================================
 *  cnspace/cli.js —— 命令行跑一次聚合（不经过 Vite）
 * ----------------------------------------------------------------------------
 *  用途：
 *    1. 开发时快速验证四个官网还解析得出来（页面改版第一时间能发现）；
 *    2. 生成/刷新 snapshot.json（真实数据快照，实时抓取失败时的兜底）。
 *
 *  用法：
 *    node server/cnspace/cli.js              # 只打印，不写快照
 *    node server/cnspace/cli.js --snapshot   # 顺便写快照
 *    node server/cnspace/cli.js --json       # 输出完整 JSON（调试前端用）
 * ========================================================================== */

import { getFeed } from './store.js'
import fs from 'node:fs'
import path from 'node:path'

const argv = process.argv.slice(2)
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

const pad = (s, n) => String(s ?? '').padEnd(n, ' ')
const cut = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''))

;(async () => {
  const t0 = Date.now()
  const { feed, fromCache, snapshot } = await getFeed({ force: true })
  console.log(`\n抓取完成：${feed.items.length} 条，耗时 ${Date.now() - t0}ms` +
    `（内部 ${feed.tookMs}ms）  fromCache=${fromCache} snapshot=${snapshot}\n`)

  console.log('────────── 来源状态 ──────────')
  for (const s of feed.sources) {
    console.log(
      `${s.ok ? '✅' : '❌'} ${pad(s.name, 12)} ${String(s.count).padStart(3)} 条  最新=${s.latest || '—'}`,
    )
    console.log(`   成功栏目：${s.columns.join(' / ') || '（无）'}`)
    if (s.failedColumns.length) console.log(`   失败栏目：${s.failedColumns.join(' / ')}`)
  }

  console.log('\n────────── 板块计数 ──────────')
  console.log(JSON.stringify(feed.counts.byCategory))
  console.log(JSON.stringify(feed.counts.bySource))

  for (const cat of ['photon', 'foundry', 'cortex', 'blueyard', 'tech']) {
    const list = feed.items.filter((i) => i.categories.includes(cat))
    console.log(`\n────────── ${cat}  ${list.length} 条（前 4）──────────`)
    for (const it of list.slice(0, 4)) {
      console.log(`  [${it.publishDate || '无日期'}] ${cut(it.title, 40)}`)
      console.log(
        `      ${it.source} · ${it.column} · ${it.contentType}` +
          ` · 摘要${it.summary ? it.summary.length + '字' : '无'} · 图${it.image ? '有' : '无'}`,
      )
      console.log(`      ${it.sourceUrl}`)
    }
  }

  const noSummary = feed.items.filter((i) => !i.summary)
  const noImage = feed.items.filter((i) => !i.image)
  const noDate = feed.items.filter((i) => !i.publishDate)
  console.log(`\n────────── 字段完整度 ──────────`)
  console.log(`  缺摘要 ${noSummary.length} 条 · 缺配图 ${noImage.length} 条 · 缺日期 ${noDate.length} 条`)
  if (noDate.length) for (const i of noDate.slice(0, 3)) console.log(`    无日期：${i.title}`)

  if (argv.includes('--snapshot')) {
    const file = path.join(HERE, 'snapshot.json')
    fs.writeFileSync(file, JSON.stringify(feed, null, 0), 'utf8')
    console.log(`\n已写入快照：${file}（${(fs.statSync(file).size / 1024).toFixed(0)} KB）`)
  }
  if (argv.includes('--json')) {
    console.log('\n────────── JSON ──────────')
    console.log(JSON.stringify(feed, null, 2))
  }
})().catch((e) => {
  console.error('FAILED: ' + (e?.stack || e))
  process.exit(1)
})
