# -*- coding: utf-8 -*-
"""
量「逐光而行」艺术字的降饱和/ 降发光效果，以及深色背景上的可读性。

为什么用真截图而不是 canvas 重绘：
  把 svg 序列化成 data URL 再 drawImage 会**丢掉 CSS**（动画态的 opacity、
  CSS 变量驱动的 transform 全部失效）→ 量出来是一片平的灰光，
  「笔画峰值」和「紧邻背景」几乎一样（实测 0.297 vs 0.279），
  看着像「可读性崩了」，其实是量法坏了。
  真截图量的是浏览器最终合成结果，和用户眼睛看到的一致。

两个指标：
  lum  = 笔画亮部像素的平均亮度（0~255）
  sat  = 同批像素的平均 HSV 饱和度
  对比 = 笔画亮部中位数- 周围背景中位数   ← 这一项直接对应「还看得清吗」

⚠️ 本项目硬约定里没有 png 统计库以外的依赖，用受管 venv 的 pillow。
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, "home-art")


def stats(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()

    # 1) 先找出「笔画像素」：整图里亮度显著高于本地背景的
    #    用灰度直方图找一个分割点（Otsu 简化版：均值 + 2.2 倍标准差）
    g = [0.2126 * px[x, y][0] + 0.7152 * px[x, y][1] + 0.0722 * px[x, y][2]
         for y in range(0, h, 2) for x in range(0, w, 2)]
    n = len(g)
    mean = sum(g) / n
    var = sum((v - mean) ** 2 for v in g) / n
    sd = var ** 0.5
    thr = mean + 2.0 * sd

    inks = []
    bgs = []
    step = 2
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, gg, b = px[x, y]
            l = 0.2126 * r + 0.7152 * gg + 0.0722 * b
            mx, mn = max(r, gg, b), min(r, gg, b)
            s = 0.0 if mx == mn else (mx - mn) / (mx + mn if l / 255 < 0.5
                                               else 2 - mx / 255 - mn / 255)
            if l >= thr:
                inks.append((l, s))
            elif l < mean - 0.5 * sd:
                bgs.append(l)

    if not inks or not bgs:
        return None
    inks.sort(key=lambda t: t[0])
    inks2 = inks[int(len(inks) * 0.5):]        # 取亮部一半，避开抗锯齿边
    lum = sum(t[0] for t in inks2) / len(inks2)
    sat = sum(t[1] for t in inks2) / len(inks2)
    ink_med = inks2[len(inks2) // 2][0]
    bgs.sort()
    bg_med = bgs[len(bgs) // 2]
    return dict(lum=lum, sat=sat, ink_med=ink_med, bg_med=bg_med,
                contrast=ink_med - bg_med, ink_px=len(inks), bg_px=len(bgs))


if __name__ == "__main__":
    tag = sys.argv[1] if len(sys.argv) > 1 else "v2-1440.png.brushcrop"
    f = os.path.join(SHOTS, tag if tag.endswith(".png") else tag + "-1440.png")
    s = stats(f)
    if not s:
        print("FAIL  量不到笔画像素：%s" % f)
        sys.exit(1)
    print("%s: lum=%.1f sat=%.3f ink_med=%.1f bg_med=%.1f contrast=%.1f ink_px=%d" %
          (tag, s["lum"], s["sat"], s["ink_med"], s["bg_med"], s["contrast"], s["ink_px"]))
    print("%.1f %.3f %.1f" % (s["lum"], s["sat"], s["contrast"]))
