# -*- coding: utf-8 -*-
"""
矩形光影像素级验收：比较 by-home-brush.cjs 截的两张图。

  rect-a.png  艺术字正常显示
  rect-b.png  同一时刻把 .brush2 visibility:hidden（星河背景原样）

差分的意义：
  · 艺术字**矩形之外**的像素必须完全一致 → 证明没有任何光影向外溢出，
    也没有「铺满容器的半透明层」。
  · 艺术字**矩形之内**必须有明显差异 → 证明字确实画上去了（防「全隐藏」
    这种把 rect-a 也变成空图的假通过）。
  · 矩形内的差分必须是**局部**的（笔画处差异大、笔画间的空白处差异≈0）。
    如果整块矩形都在变亮 → 又有蒙层回来了，这正是 v1 的病症。
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "home-art")

a = np.asarray(Image.open(os.path.join(OUT, "rect-a.png")).convert("RGB")).astype(np.int16)
b = np.asarray(Image.open(os.path.join(OUT, "rect-b.png")).convert("RGB")).astype(np.int16)
if a.shape != b.shape:
    print("FAIL  两张图尺寸不一致 %s vs %s" % (a.shape, b.shape))
    sys.exit(1)

diff = np.abs(a - b).max(axis=2)
h, w = diff.shape
mx = int(diff.max())
changed = diff > 6
frac = 100.0 * changed.sum() / diff.size

fails = []


def ok(cond, name, extra=""):
    print(("  PASS  " if cond else "  FAIL  ") + name + (("  <- " + extra) if extra else ""))
    if not cond:
        fails.append(name)


print("矩形光影像素差分：%dx%d  maxdiff=%d  变化像素占比=%.2f%%" % (w, h, mx, frac))

ok(mx > 12, "矩形内确有内容（字画上去了，不是两张一样的空图）", "maxdiff=%d" % mx)

# 笔画之间的空白必须**没有**被提亮：
# 取差分>6 的像素的包围盒，然后只看这个盒子里「差分很小」的像素，
# 检查它们相对 b 的平均亮度提升 —— 若整块都在变亮，就是又蒙了一层。
ys, xs = np.where(changed)
if len(ys):
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    bw = x1 - x0 + 1
    bh = y1 - y0 + 1
    ok(bw > w * 0.5 and bh > h * 0.3,
       "笔画覆盖了矩形的大部分宽高（字没被缩小）",
       "bbox %dx%d / 画幅 %dx%d" % (bw, bh, w, h))

    box = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    quiet = ~changed[box]
    if quiet.sum() > 200:
        lift = (a[box][quiet].astype(np.int16) - b[box][quiet]).mean(axis=0)
        lm = float(lift.mean())
        print("  笔画间空白区（%d px）相对背景的亮度变化 = R%+.1f G%+.1f B%+.1f"
              % (quiet.sum(), lift[0], lift[1], lift[2]))
        ok(abs(lm) < 3.0,
           "笔画之间没有被整体提亮（无矩形蒙层）", "平均亮度变化 %+.2f" % lm)

    # 笔画核心区（差分最大的 5% 像素）应该比背景亮 —— 有对比度才读得出来
    thr = np.percentile(diff[changed], 95)
    core = diff >= thr
    core_lift = (a[core].astype(np.int16) - b[core]).mean()
    ok(core_lift > 20, "笔画本身明显亮于背景（对比度足够）",
       "核心区平均提亮 %+.1f" % core_lift)

    # 画一张差分热力图，方便肉眼看形状
    heat = np.zeros((h, w, 3), dtype=np.uint8)
    heat[..., 0] = np.clip(diff * 3, 0, 255)
    Image.fromarray(heat).save(os.path.join(OUT, "rect-diff.png"))
    print("  差分热力图 -> _analysis/home-art/rect-diff.png")
else:
    ok(False, "两张图完全一致（说明艺术字根本没渲染）")

print("\n" + ("RECT OK" if not fails else "RECT FAIL: " + "; ".join(fails)))
sys.exit(1 if fails else 0)
