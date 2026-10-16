/* ============================================================================
 *  滚轮导航：向下滚 → 下一个区域，向上滚 → 上一个区域
 * ----------------------------------------------------------------------------
 *  和键盘导航共用同一套 store 动作（next / prev），因此：
 *    - 转场期间同样被 §14 的 isTransitioning 锁挡住，不会出现场景错乱
 *    - 方向语义和 ← → 完全一致，银河推进方向也自动跟着翻
 *
 *  难点是「一次手势只走一格」。鼠标滚轮一格 deltaY≈100，一下就够；
 *  但触控板惯性会连续吐几十个小 delta，直接判断会一口气跳好几个区域。
 *  这里的做法：
 *    1. deltaMode 归一化（0=像素 1=行 2=页），不同浏览器/设备才有可比性
 *    2. 累积到阈值才触发，中途反向就清零 —— 手抖回拉不会误触发
 *    3. 触发后进入冷却，冷却期间累积量作废
 *  ========================================================================== */

import { useEffect } from 'react'
import { useThemeStore } from '../store/useThemeStore'

/** 累积多少像素算一次切换（鼠标滚轮一格约 100，触控板滑动很容易超过） */
const THRESHOLD = 42
/** 两次触发之间的最小间隔。和转场总时长（约 1.93s）对齐，
 *  否则在转场还没走完时就发下一个请求，会被 store 直接丢弃、手感像失灵 */
const COOLDOWN = 1900
/** 事件间隔超过这个时间就当作「新的一次手势」，之前的累积作废 */
const GESTURE_GAP = 260

export function useWheelNav() {
  useEffect(() => {
    let acc = 0
    let dir = 0
    let lastAt = 0
    let lockUntil = 0
    let resetTimer: number | undefined

    const onWheel = (e: WheelEvent) => {
      // VIEW ALL 面板打开时把滚轮还给面板本身，不做切换
      const st = useThemeStore.getState()
      if (st.viewAll) return
      const el = e.target as HTMLElement | null
      if (el && el.closest('.panel')) return

      const unit0 = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1
      const dy0 = e.deltaY * unit0

      // 内部可滚动的区域（TECH 的新闻列表）优先消费滚轮：
      // 还没滚到边界时让列表自己滚，滚到头/底之后再继续滚才切区域。
      const scroller = el?.closest<HTMLElement>('[data-wheel-scroll]')
      if (scroller && dy0 !== 0) {
        const canScroll = scroller.scrollHeight > scroller.clientHeight + 1
        const atTop = scroller.scrollTop <= 0
        const atBottom =
          scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
        if (canScroll && ((dy0 > 0 && !atBottom) || (dy0 < 0 && !atTop))) return
      }

      // 页面本身没有可滚动内容，这里只是顺手挡掉浏览器可能的整页滚动
      e.preventDefault()

      const dy = dy0
      if (dy === 0) return

      const now = performance.now()
      if (now - lastAt > GESTURE_GAP) acc = 0
      lastAt = now

      const sign = dy > 0 ? 1 : -1
      if (dir !== 0 && sign !== dir) acc = 0 // 反向 → 重新累积
      dir = sign

      if (now < lockUntil) return // 冷却中，只累积不触发
      acc += dy
      if (Math.abs(acc) < THRESHOLD) return

      acc = 0
      lockUntil = now + COOLDOWN
      if (dy > 0) st.next()
      else st.prev()

      // 冷却结束时清空累积，避免惯性尾巴一到点就立刻再触发一次
      window.clearTimeout(resetTimer)
      resetTimer = window.setTimeout(() => {
        acc = 0
        dir = 0
      }, COOLDOWN)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.clearTimeout(resetTimer)
    }
  }, [])
}
