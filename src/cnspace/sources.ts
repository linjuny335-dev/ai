/* ============================================================================
 *  cnspace/sources.ts —— 四个官方来源的展示元信息（前端）
 * ----------------------------------------------------------------------------
 *  ⚠️ 这里只有「颜色 / 简称」这类纯展示信息，
 *     来源全称、栏目名、原文链接一律以服务端返回的真实数据为准（见 lib/cnspace.ts）。
 *     不在前端写死任何一条内容。
 * ========================================================================== */

import type { CnSourceId } from '../lib/cnspace'

export interface CnSourceMeta {
  id: CnSourceId
  /** 卡片上的小标签文字（官方简称） */
  chip: string
  /** 每个来源一个色，方便一眼分辨「这条是谁家的」 */
  accent: string
  /** 官网站点，用于面板页脚 */
  site: string
}

export const CN_SOURCES: CnSourceMeta[] = [
  { id: 'CNSA', chip: '国家航天局', accent: '#6f9cff', site: 'https://www.cnsa.gov.cn/' },
  { id: 'CMSE', chip: '中国载人航天', accent: '#57d6c8', site: 'https://www.cmse.gov.cn/' },
  { id: 'NAOC', chip: '国家天文台', accent: '#b18bfa', site: 'https://nao.cas.cn/' },
  {
    id: 'CASC',
    chip: '航天科技集团',
    accent: '#f0b070',
    site: 'https://www.spacechina.com/n25/index.html',
  },
]

const BY_ID = new Map(CN_SOURCES.map((s) => [s.id, s]))

export function cnSourceMeta(id: CnSourceId): CnSourceMeta {
  return BY_ID.get(id) ?? { id, chip: id, accent: '#a091ff', site: '' }
}
