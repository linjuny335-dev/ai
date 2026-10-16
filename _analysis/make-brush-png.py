# -*- coding: utf-8 -*-
"""
参考图 → 透明背景的低饱和银灰蓝书法 PNG / WebP（v2：融入星河版）。

输入：用户上传的黑墨狂草「逐光而行」（1774×887，白底）
输出：public/brush/zhu-guang-er-xing.png + .webp（真正透明、无矩形光影）

===========================================================================
一、为什么「alpha = 1 − 亮度」而不是「把白像素设成透明」
===========================================================================
最直觉的做法是抠掉白底，但那样**一定会留白边**：墨迹边缘是抗锯齿的灰阶，
JPEG 压缩又在边缘加了振铃（ringing），这些像素是「白底与黑墨的混合」——
直接丢弃白分量，边缘就留下一圈发亮的白边（深色背景上非常明显）。

这里采用：
    alpha = 1 - luminance        <- 用亮度直接当**不透明度**
    RGB   = 目标低饱和银灰蓝      <- 颜色**不取自原图**

因为原图是「黑墨」（中性灰阶，颜色信息本来就等于亮度），把颜色换成我们想要的
银灰蓝、把亮度交给 alpha，就**在数学上不可能出现白边**：
所有半透明像素的颜色都是同一个银灰蓝，只是更透明 → 边缘自然融进背景。

飞白 / 干笔纹理的保留：飞白在原图里表现为「笔画内部被擦除的白」，
这些像素亮度高 → alpha 低 → 天然变成半透明的镂空，纹理完整保留。

===========================================================================
二、v2 新增：颜色不是一块平色，而是按「墨层厚度」分层
===========================================================================
用户 2026-10-15 反馈：整体偏亮、冷白刺眼，像一张发光图片贴在页面上。
这一版按用户给的四个色号分层，而不是整张一个颜色：

    dens = 高斯模糊后的 alpha        = 局部墨层厚度（笔画厚薄）
    core = smoothstep(0.70, 0.94, dens)  = 只有很实的笔画核心才有
    thin = a * (1 - dens)              = 「细」结构特征（见下）

    笔画实心core  → INK_MAIN  #A8B5C8 雾蓝灰（主体，全部笔画都是这个调）
    笔画核心c ore → 混向 INK_HIGH #C0C7D2 柔和银灰（**只混 45%**，且只出现在
                     最实的那一小撮 → 自然读成「局部轻微高光」而非整体提亮）
    下半部笔画    → 混向 INK_DARK #7F91AB 深灰蓝（压住底部，避免整块发白）
    细线/装饰星轨 → TRAIL     #777B9B 灰紫蓝，且 **alpha 只留 42%**
                     （用户要求「降低其余装饰轨道的亮度和透明度」）

`thin` 的判据：`a` 高但 `dens` 低 ⇒ 这是一个**又实又细**的结构 = 细线/星轨；
粗笔画的 `dens` 也高，所以天然被排除。这个判据不需要任何手工描线。

===========================================================================
三、v2 新增：ALPHA_FLOOR（去背景残留的关键）
===========================================================================
v1 的 alpha 直方图里，81% 是 0，但仍有 **1.68% 的像素落在 alpha 1~40**——
那是白底上极淡的压缩噪点与墨迹外围的空气。单个几乎看不见，
叠在深色星河背景上就会读成「字周围有一层发灰的矩形」。
这一版把 alpha < ALPHA_FLOOR 的像素**直接归零**，只留笔画、星轨和星芒。

⚠️ 不是靠降整张图的 opacity 来掩盖（用户明令禁止，那样会丢笔画质感），
   而是把「本该全透明的噪点」真的清成全透明。
===========================================================================
"""
import os

import numpy as np
from PIL import Image, ImageFilter

SRC = r"C:\Users\YLJBO\.workbuddy\clipboard-images\clipboard-2026-10-15T06-47-31-931Z-96e6233b.jpg"
HERE = os.path.dirname(os.path.abspath(__file__))
DST_DIR = os.path.abspath(os.path.join(HERE, "..", "public", "brush"))

# ---- 用户指定的目标色号（2026-10-15）-------------------------------------
INK_MAIN = (168, 181, 200)   # #A8B5C8 雾蓝灰：主体笔画
INK_HIGH = (192, 199, 210)   # #C0C7D2 柔和银灰：局部高光（只混一点）
INK_DARK = (127, 145, 171)   # #7F91AB 深灰蓝：笔画暗部 / 下半部
TRAIL = (119, 123, 155)      # #777B9B 灰紫蓝：星轨细线

# ---- alpha 提取参数 ------------------------------------------------------
BG_LEVEL = 247.0     # 背景亮度基准（原图四角实测 252~255，取 247 留余量）
INK_REACH = 46.0     # 完全不透明处的亮度：越大笔画越「淡」一点
ALPHA_GAMMA = 1.12   # >1 压中间调：飞白镂空保持通透，不要糊成一片
ALPHA_BOOST = 0.90   # 整体不透明度（比 v1 的 0.94 再低一档）
ALPHA_FLOOR = 6      # <= 此值的 alpha 直接归零：清掉背景残留噪点（v2 新增）
FEATHER = 0.5        # 极轻羽化（px），消 JPEG 振铃的硬台阶

# ---- 分层参数 -----------------------------------------------------------
DENS_SIGMA = 9.0     # 算「墨层厚度」的高斯半径：要大于笔画最细处的宽度
CORE_LO, CORE_HI = 0.70, 0.94   # core 的 smoothstep 区间
CORE_MIX = 0.45      # 高光最多混 45%（再多就读成「整条笔画提亮」了）
DARK_LO, DARK_HI = 0.46, 0.95   # 下半部压暗的 smoothstep 区间
DARK_MIX = 0.55      # 底部最多混 55% 深灰蓝
THIN_MIX = 1.0       # 细线换成 TRAIL 的比例
TRAIL_ALPHA = 0.42   # 细线/star轨 只保留 42% 不透明度


def smoothstep(lo, hi, x):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def main():
    src = Image.open(SRC)
    if src.mode != "L":
        src = src.convert("L")
    w, h = src.size

    # ---- ① alpha = 1 − 亮度 ----------------------------------------------
    lum = np.asarray(src).astype(np.float64)
    span = BG_LEVEL - INK_REACH
    a01 = np.clip((BG_LEVEL - lum) / span, 0.0, 1.0) ** ALPHA_GAMMA
    a01 *= ALPHA_BOOST

    # ---- ② ALPHA_FLOOR：清掉背景残留 ------------------------------------
    before = int((a01 > 0).sum())
    a01[a01 * 255.0 < ALPHA_FLOOR] = 0.0
    cleared = before - int((a01 > 0).sum())

    alpha = Image.fromarray((a01 * 255.0).round().astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))
    a = np.asarray(alpha).astype(np.float64) / 255.0
    a01 = a

    # ---- ③ 局部墨层厚度 dens = 高斯模糊(alpha) ---------------------------
    dens_img = alpha.filter(ImageFilter.GaussianBlur(DENS_SIGMA))
    dens = np.asarray(dens_img).astype(np.float64) / 255.0

    core = smoothstep(CORE_LO, CORE_HI, dens)          # 只出现在笔画最实处
    thin = a01 * np.clip(1.0 - dens * 2.2, 0.0, 1.0)   # 又实又细 => 装饰星轨

    ty = (np.arange(h, dtype=np.float64) / max(1, h - 1))[:, None]
    darken = smoothstep(DARK_LO, DARK_HI, ty) * DARK_MIX  # 下半部压暗

    base = np.empty((h, w, 3), dtype=np.float64)
    for i in range(3):
        c = np.full((h, w), INK_MAIN[i], dtype=np.float64)
        c = c + (INK_HIGH[i] - INK_MAIN[i]) * (core * CORE_MIX)
        c = c + (INK_DARK[i] - c) * darken
        c = c + (TRAIL[i] - c) * (thin * THIN_MIX)
        base[:, :, i] = c

    out_a = np.clip(a01 * (1.0 - (1.0 - TRAIL_ALPHA) * thin), 0.0, 1.0)
    out_a[out_a * 255.0 < ALPHA_FLOOR] = 0.0

    rgba = np.dstack([
        np.clip(np.round(base), 0, 255).astype(np.uint8),
        np.clip(np.round(out_a * 255.0), 0, 255).astype(np.uint8),
    ])
    img = Image.fromarray(rgba, "RGBA")
    alpha_img = Image.fromarray(
        (np.clip(out_a * 255.0, 0, 255)).round().astype(np.uint8), "L")

    # ---- ④ 裁掉透明边，保留原有宽幅构图比例 ------------------------------
    bbox = alpha_img.point(lambda v: 255 if v > ALPHA_FLOOR else 0).getbbox()
    if bbox:
        pad = 6
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(w, bbox[2] + pad), min(h, bbox[3] + pad))
        img = img.crop(bbox)

    os.makedirs(DST_DIR, exist_ok=True)
    png = os.path.join(DST_DIR, "zhu-guang-er-xing.png")
    webp = os.path.join(DST_DIR, "zhu-guang-er-xing.webp")
    img.save(png, "PNG", optimize=True)
    img.save(webp, "WEBP", lossless=True, quality=92, method=6)

    # ---- ⑤ 自检 -----------------------------------------------------------
    chk = np.asarray(Image.open(png)).astype(np.int32)
    out_w, out_h = chk.shape[1], chk.shape[0]
    al = chk[..., 3]
    tot = al.size
    corners = [chk[0, 0, 3], chk[0, out_w - 1, 3],
               chk[out_h - 1, 0, 3], chk[out_h - 1, out_w - 1, 3]]

    print("裁剪后尺寸 = %dx%d  (宽高比 %.3f)" % (out_w, out_h, out_w / out_h))
    print("四角 alpha =", corners, "(必须全 0 = 真透明无白边)")
    print("ALPHA_FLOOR 清除的像素 = %d (%.2f%% 的图从「有灰雾」变成全透明)"
          % (cleared, 100.0 * cleared / (w * h)))
    print("完全不透明像素 = %.2f%%" % (100.0 * (al > 200).sum() / tot))
    print("半透明(1~200)   = %.2f%%  <- 飞白与抗锯齿" % (100.0 * ((al > 0) & (al <= 200)).sum() / tot))

    # 矩形光影自检：矩形蒙层的特征不是「有像素」，而是**大片均匀的低 alpha 雾**。
    # 所以这里量的是「alpha 落在 1~ALPHA_FLOOR 以上、200 以下的像素占比」——
    # 纯笔画区的边缘过渡只占很少，超过 40% 就说明背景被蒙了一层灰。
    gh, gw = 6, 16
    worst = 0.0
    worst_at = ""
    for j in range(gh):
        for i in range(gw):
            blk = al[j * out_h // gh:(j + 1) * out_h // gh,
                     i * out_w // gw:(i + 1) * out_w // gw]
            if blk.size == 0:
                continue
            haze = ((blk > 0) & (blk < 200)).sum()
            frac = float(haze) / blk.size
            if frac > worst:
                worst, worst_at = frac, "r%d c%d" % (j, i)
    print("网格最高半透明雾占比 = %.1f%% @ %s (纯笔画区 <20%%；>40%% 说明有矩形蒙层)"
          % (100.0 * worst, worst_at))

    # 白边自检：「alpha 低但颜色很亮」= 白边特征
    rgb = chk[..., :3]
    halo = int(((al > 4) & (al < 200) & (rgb[..., 0] > 205)).sum())
    print("白边特征像素 =", halo, "(必须 0)")

    # 纯白大面积自检
    near_white = int(((al > 200) & (rgb[..., 0] > 225)
                      & (rgb[..., 2] > 232)).sum())
    print("大面积近白笔画像素 = %d (%.3f%%) (必须 0)"
          % (near_white, 100.0 * near_white / tot))

    # 平均色（只看笔画像素）—— 应落在 #A8B5C8 附近
    m = al > 200
    if m.any():
        mean_rgb = rgb[m].mean(axis=0)
        print("笔画实心平均色 = (%d, %d, %d)  目标 #A8B5C8 = (168,181,200)"
              % tuple(int(v) for v in mean_rgb))

    print("PNG  = %s (%.1f kB)" % (png, os.path.getsize(png) / 1024.0))
    print("WebP = %s (%.1f kB)" % (webp, os.path.getsize(webp) / 1024.0))


if __name__ == "__main__":
    main()
