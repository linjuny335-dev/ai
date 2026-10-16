/* ============================================================================
 *  sources.ts —— 数据源注册表
 * ----------------------------------------------------------------------------
 *  三个源的唯一汇总处。界面只从这里读 SOURCES，不认识具体是哪个站点。
 *
 *  当前主题是**航天**：每个源的 feed 都已经限定到航天领域 ——
 *      Hacker News  → 航天新闻（Algolia 关键词检索：rocket / NASA / satellite）
 *      GitHub       → 航天开源项目（topic:space / topic:satellite / topic:remote-sensing）
 *      Hugging Face → 卫星遥感 AI 模型（search=satellite / remote sensing）
 *
 *  想加第四个源：写一个导出了 SourceDef 的文件，然后加进下面的数组即可 ——
 *  选项卡、feed 切换、搜索、自动刷新、错误态全都是现成的。
 * ========================================================================== */

import { GITHUB_SOURCE } from './github'
import { HN_SOURCE } from './hn'
import { HF_SOURCE } from './huggingface'
import type { SourceDef, SourceId } from './techTypes'

/** 顺序 = 界面上选项卡的顺序：先新闻，再项目，最后模型 */
export const SOURCES: readonly SourceDef[] = [HN_SOURCE, GITHUB_SOURCE, HF_SOURCE]

/** 默认打开哪个源：新闻最贴近「最新航天动态」，所以先给新闻 */
export const DEFAULT_SOURCE_ID: SourceId = 'hn'

export function sourceById(id: SourceId): SourceDef {
  return SOURCES.find((s) => s.id === id) ?? SOURCES[0]
}
