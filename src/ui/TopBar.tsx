/* ============================================================================
 *  TopBar + VIEW ALL 面板
 * ========================================================================== */

import { AnimatePresence, motion } from 'framer-motion'
import { CHAPTER_THEMES } from '../config/themes'
import { useThemeStore } from '../store/useThemeStore'
import GlassButton from './glass/GlassButton'

export default function TopBar() {
  const index = useThemeStore((s) => s.index)
  const go = useThemeStore((s) => s.go)
  const viewAll = useThemeStore((s) => s.viewAll)
  const setViewAll = useThemeStore((s) => s.setViewAll)

  return (
    <>
      <div className="topbar">
        {/* 同样是液态玻璃：和顶部导航、卡片共用一套质感。
            ⚠️ 这里**不要**再往这一簇里加按钮：宽屏下 PHOTON / TECH 的正文
               从 x=200 开始（padding-left: 200px），而矮视口下正文头部会被
               顶进顶部这条横带里 —— 这一簇一旦超过 172px 就会压住标题。
               「返回主页」因此放在右上角的空白边距带，见 ui/BackHome.tsx。 */}
        <GlassButton className="topbar__btn" onClick={() => setViewAll(true)}>
          All {CHAPTER_THEMES.length}
        </GlassButton>
      </div>

      <AnimatePresence>
        {viewAll && (
          <motion.div
            className="panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            onClick={() => setViewAll(false)}
          >
            <motion.div
              className="panel__inner glass"
              initial={{ opacity: 0, y: 22, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="panel__head">
                <h2 className="panel__title">All states</h2>
                <button type="button" className="ghostBtn" onClick={() => setViewAll(false)}>
                  Close
                </button>
              </div>

              {/* 面板里只列章节：编号 01~05 是叙事线的一部分，不能被首页顶掉 */}
              <div className="panel__grid">
                {CHAPTER_THEMES.map(({ theme: t, index: i }, n) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`panel__card glass${i === index ? ' is-active' : ''}`}
                    onClick={() => {
                      go(i)
                      setViewAll(false)
                    }}
                  >
                    <span className="panel__idx">
                      {String(n + 1).padStart(2, '0')} / {t.nav.toUpperCase()}
                    </span>
                    <h3 className="panel__name">{t.headline[1] || t.headline[0]}</h3>
                    {t.navCn ? <p className="panel__cn">{t.navCn}</p> : null}
                    <p className="panel__desc">{t.summary}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
