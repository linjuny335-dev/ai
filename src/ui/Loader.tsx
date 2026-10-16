/* ============================================================================
 *  Loader —— 首屏载入进度
 * ========================================================================== */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function Loader() {
  const [pct, setPct] = useState(0)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    const t0 = performance.now()
    const DURATION = 1250
    let raf = 0

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION)
      setPct(Math.round((1 - Math.pow(1 - p, 2.4)) * 100))
      if (p < 1) {
        raf = requestAnimationFrame(step)
      } else {
        setGone(true)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <AnimatePresence>
      {!gone && (
        <motion.div
          className="loader"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <p className="loader__pct">{String(pct).padStart(3, '0')}%</p>
          <div className="loader__bar">
            <div className="loader__fill" style={{ width: `${pct}%` }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
