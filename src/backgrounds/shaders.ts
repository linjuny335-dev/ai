/* ============================================================================
 *  NebulaField 的 GLSL
 * ----------------------------------------------------------------------------
 *  所有位置计算都发生在顶点着色器里 —— CPU 每帧只更新几个 uniform。
 *  所以粒子数开到 10 万也不掉帧，而且「换运动方式」= 改这里的数学，不改 JS。
 * ========================================================================== */

/* ---------------------------------------------------------------- 星点层 */

export const STAR_VERT = /* glsl */ `
attribute vec3 aSeed;    // 每颗粒子的随机种子 0..1
attribute float aScale;  // 尺寸倍率
attribute float aIndex;  // 粒子序号，用来做密度的平滑增减

uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uRadius;
uniform float uThickness;
uniform float uArms;
uniform float uSwirl;
uniform float uSpin;
uniform float uDrift;
uniform float uRise;
uniform float uBrightness;
uniform float uPhotoMix;
uniform float uParallax;
uniform float uPulse;
uniform float uActive;    // 当前「点亮」的粒子数（用于密度转场）
uniform float uSpread;   // 手势：0 = 原本完整的银河（握拳聚拢回来），1 = 整片解体扩散
uniform float uBig;       // 大亮星占比，可实时调
uniform float uTexMix;    // 两张底图的混合比
uniform vec2  uTilt;
uniform vec2  uMouse;
uniform vec3  uColorCore;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform sampler2D uTexA;
uniform sampler2D uTexB;

varying vec3 vColor;
varying float vAlpha;

const float TAU = 6.28318530718;

void main() {
  float t = uTime;

  // 密度：序号超过 uActive 的粒子体积收缩为 0（平滑淡出，不硬切）
  float vis = smoothstep(uActive + 8.0, uActive - 8.0, aIndex);

  // ── 半径：幂律分布，中心更密
  float r = pow(aSeed.x, 0.68) * uRadius;

  // ── 旋臂角度：悬臂基准角 + 缠绕 + 差速自转（内圈快、外圈慢）
  float armIndex = floor(aSeed.y * uArms);
  float armOffset = (armIndex / max(uArms, 0.001)) * TAU;
  float theta = armOffset + r * uSwirl * 0.62 + t * uSpin * (2.4 - r * 0.16);

  // ── 云状扰动：两段不同频率的正弦叠加，让旋臂边缘有流体质感
  float wobble = sin(t * 0.22 + aSeed.z * TAU) * 0.5 + sin(t * 0.09 + aSeed.x * 12.0) * 0.5;
  float rr = r + wobble * uDrift * (0.25 + r * 0.09);

  // ── 手势「张开手掌 = 银河解体扩散」：uSpread 由手势内核给出（0..1，已带惯性）。
  //    四个动作叠加，才读得出「整片银河正在解体、变成大量星尘向宇宙扩散」：
  //      1) 旋臂被打散 —— 每颗按自己的种子多转一个角度，旋臂结构溶解；
  //      2) 飞行距离分档  —— fly = seed² 让少数星尘飞很远、多数留在原地附近；
  //      3) 纵向撑开    —— 主要靠「上下」长出去（盘面是斜的，纵向最宽裕）；
  //      4) 核球瓦解    —— 见下面 vAlpha 那里，**这是最关键的一下**。
  //
  //    ⚠️ **径向不能无限放大**：相机在 z=6 / fov=45，可见的半宽只有约 3.98
  //    世界单位，而星系半径就是 3.9 —— 横向最多只能温和膨胀到 ~1.4 倍，
  //    再大粒子就全飞出画面，银河看起来就变成「消失了」而不是「解体了」。
  //    所以「解体」主要靠**打散结构 + 瓦解核球**，横向只做有限膨胀。
  //    ⚠️ smoothstep 塑形：两端软、中段猛。避免在 0/1 附近出现「突然炸开」的突变感。
  //    ⚠️ 只能改这里的几何，不要去重建 BufferGeometry / 改粒子数。
  float sp = clamp(uSpread, 0.0, 1.0);
  float sps = sp * sp * (3.0 - 2.0 * sp);
  float fly = aSeed.z * aSeed.z;   // 0..1，平方分布 → 大多数近、少数远
  rr *= 1.0 + 0.42 * sps;
  rr += r * fly * 1.05 * sps;
  // 旋臂溶解：每颗按自己的种子多转一个角度（±1.9 弧度 ≈ ±110°），旋臂的
  // 「条带感」被打散，变成漫天星尘。只放大半径的话，外面看着只是
  // 「银河变大了」，不像解体 —— 这一步才是「解体」读起来最关键的一下。
  theta += (aSeed.z - 0.5) * 3.8 * sps;

  vec3 p;
  p.x = cos(theta) * rr;
  p.z = sin(theta) * rr;

  // ── 垂直厚度：核球厚、外缘薄（指数衰减）
  float bulge = exp(-r * 0.42) * uThickness;
  float off = aSeed.z * 2.0 - 1.0;
  p.y = (off * off * sign(off)) * bulge * 0.9
      + sin(t * 0.18 + aSeed.y * 21.0) * uRise * bulge * 0.5;
  p.y *= 1.0 + 1.85 * sps;   // 纵向撑开：主要往「上下」长，读起来最像整片盘面被掀开
  p.y += off * fly * uRadius * 0.55 * sps;   // 再给每颗一个自身的上下偏移，避免只有整体放大

  // ── 鼠标视差：越靠外位移越大，形成纵深
  p.xy += uMouse * uParallax * (0.55 + rr * 0.055);

  // ── 主题切换瞬间的轻微整体收缩
  p *= 1.0 - 0.05 * uPulse;

  // ── 盘面倾角（让我们斜着看这个星系）
  float cx = cos(uTilt.x), sx = sin(uTilt.x);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);
  float cz = cos(uTilt.y), sz = sin(uTilt.y);
  p = vec3(p.x * cz - p.y * sz, p.x * sz + p.y * cz, p.z);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // 大亮星：按种子抽出一小撮放大 3 倍左右
  float big = step(1.0 - uBig, fract(aSeed.z * 7.13 + aSeed.x * 3.71));
  // ⚠️ 散开时**不要**把粒子调小调暗 —— 那只会让星尘直接消失，读起来是
  //    「银河变淡了」而不是「银河解体了」。这里让每颗基本保持原样，
  //    只把「大亮星」的额外放大收掉：星点不再是一颗颗亮钉子，而是均匀星尘。
  float s = aScale * (1.0 + big * 2.2 * (1.0 - 0.75 * sps));

  gl_PointSize = vis < 0.001
    ? 0.0
    : clamp(uSize * s * uPixelRatio * (1.0 / max(0.0001, -mv.z)), 1.0, 42.0);

  // ── 颜色 = 主题色径向渐变 × 底图照片取色
  float rf = clamp(r / uRadius, 0.0, 1.0);
  vec3 base = mix(uColorCore, uColorMid, smoothstep(0.0, 0.42, rf));
  base = mix(base, uColorEdge, smoothstep(0.42, 1.0, rf));

  vec2 uv = aSeed.xy * 0.86 + 0.07;
  vec3 photo = mix(texture2D(uTexA, uv).rgb, texture2D(uTexB, uv).rgb, uTexMix) * 1.35;
  vColor = mix(base, photo, uPhotoMix * 0.85) * uBrightness;
  // 核球只做很轻的提亮 —— 提过头会糊成一团死白
  vColor += uColorCore * exp(-r * 2.8) * 0.16 * uBrightness;
  // ⚠️ **核球瓦解**（第 4 下，最关键）：中心那团最亮的核球是「银河」这个
  //    意象的锚点 —— 它不弱化，粒子散开再多也还是读成「一张完整的银河」，
  //    因为眼睛先抓的是最亮的中心。散开时把它压到 15%，
  //    画面就从「一个有核的星系」变成「一片无方向的星尘」—— 这才叫解体。
  vColor *= 1.0 - 0.85 * sps * exp(-rf * 4.5);

  // 外缘淡出，避免出现生硬的圆形边界
  // ⚠️ rf 用的是**原始半径 r**，不是散开后的 rr —— 所以外缘淡出跟着「它从哪来」
  //    走，而不是在扩散后的新边缘上切出一圈生硬的圆边。
  vAlpha = (1.0 - rf * 0.5) * smoothstep(1.0, 0.84, rf) * vis;
  // 只做很轻的减淡（0.10）：主体亮度交给上面的「核球瓦解」，那样才有方向性 ——
  // 整体压暗只会读成「银河变淡了」，压暗中心才读成「银河散开了」。
  vAlpha = max(vAlpha, 0.05 * vis) * (1.0 - 0.10 * sps);
}
`

export const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float d2 = dot(d, d);
  if (d2 > 0.25) discard;
  float soft = smoothstep(0.25, 0.015, d2);   // 软边圆盘
  float core = pow(soft, 5.0);                // 中心高光
  gl_FragColor = vec4(vColor * (0.5 + core * 2.0), soft * vAlpha);
}
`

/* ---------------------------------------------------------------- 雾霭层 */

/** 大尺寸低透明度的一层，堆叠出星云棉絮感。数量很少，代价极低。 */
export const HAZE_VERT = /* glsl */ `
attribute vec3 aSeed;
attribute float aScale;
attribute float aIndex;

uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform float uRadius;
uniform float uThickness;
uniform float uPhotoMix;
uniform float uParallax;
uniform float uPulse;
uniform float uActive;
uniform float uSpread;    // 手势：0 = 原本完整的银河，1 = 整片解体扩散
uniform float uTexMix;
uniform vec2  uTilt;
uniform vec2  uMouse;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform sampler2D uTexA;
uniform sampler2D uTexB;

varying vec3 vColor;
varying float vAlpha;

const float TAU = 6.28318530718;

void main() {
  float t = uTime;
  float vis = smoothstep(uActive + 30.0, uActive - 30.0, aIndex);

  float r = sqrt(aSeed.x) * uRadius * 1.15;
  // 手势「张开手掌 = 解体扩散」：雾霭要散得比星点更开、更纵向，
  // 它才像被吹散的那层棉絮；两个材质的形变保持同一份 uSpread，
  // 这样星点和星云永远是一起解体，不会出现「星动了、雾没动」的割裂感。
  float sp = clamp(uSpread, 0.0, 1.0);
  float sps = sp * sp * (3.0 - 2.0 * sp);
  float fly = aSeed.z * aSeed.z;
  float rr = r * (1.0 + 0.85 * sps) + r * fly * 2.0 * sps;
  float theta = aSeed.y * TAU + r * 0.32 + t * 0.012
              + (aSeed.z - 0.5) * 3.4 * sps;

  vec3 p;
  p.x = cos(theta) * rr;
  p.z = sin(theta) * rr;
  p.y = (aSeed.z * 2.0 - 1.0) * uThickness * 0.85 * exp(-r * 0.2)
      * (1.0 + 3.2 * sps);

  p.xy += uMouse * uParallax * 0.6;
  p *= 1.0 - 0.04 * uPulse;

  float cx = cos(uTilt.x), sx = sin(uTilt.x);
  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  gl_PointSize = vis < 0.001
    ? 0.0
    : clamp(uSize * aScale * (1.0 + 0.45 * sps) * uPixelRatio * (1.0 / max(0.0001, -mv.z)), 6.0, 190.0);

  vec2 uv = aSeed.xy * 0.9 + 0.05;
  vec3 photo = mix(texture2D(uTexA, uv).rgb, texture2D(uTexB, uv).rgb, uTexMix);
  vColor = mix(mix(uColorMid, uColorEdge, 0.5), photo * 1.8, uPhotoMix * 0.7);
  // 散开时雾霭变淡：摊薄后不该再糊住星点，银河主体才透出来
  vAlpha = 0.022 * (1.0 - 0.72 * sps) * smoothstep(1.15, 0.9, r / uRadius) * vis;
}
`

export const HAZE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float d2 = dot(d, d);
  if (d2 > 0.25) discard;
  float soft = pow(smoothstep(0.25, 0.0, d2), 2.4);
  gl_FragColor = vec4(vColor, soft * vAlpha);
}
`

/* ---------------------------------------------------------------- 底图 */

export const BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * 全屏银河底图：带极慢的推近（Ken Burns）、暗角与中央暗袋。
 *
 * 由 GalaxyLayer 单层使用：uTexA / uTexB 指向同一张照片，uMix 恒为 0。
 * 「换区」交给两个 GalaxyLayer 重叠做交叉溶解（见 GalaxyWorld），
 * 这样每层还能各自带 scale / x / y，看起来像镜头穿过云层。
 * uOpacity 就是这层在交叉溶解里的权重。
 *
 * ⚠️ **uSpread：手势「解体」时，这张底图照片也必须一起变化。**
 *    实测教训：粒子层已经在按 uSpread 散开解体了，但只要这张照片不动，
 *    它就一直是画面的主角 —— 眼睛读到的是「一张完整的银河 + 几个点动了」，
 *    完全不是「银河正在解体」。所以这里让照片：
 *      ① 整体降亮（-72%）—— 星云棉絮被吹散，密度下降；
 *      ② 跟着**推近**（z × 1.28）—— 镜头像往云层里钻，越解体越深入；
 *      ③ 旋臂纹理的对比拉低 —— 结构溶解，只剩弥散辉光。
 *    这三样都是**跟着 uSpread 连续插值**，所以聚拢时会原路长回来。
 */
export const BACKDROP_FRAG = /* glsl */ `
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform float uOpacity;
uniform float uGain;
uniform float uTime;
uniform float uAspect;
uniform vec2  uMouse;
uniform vec3  uTint;
uniform float uSpread;

varying vec2 vUv;

void main() {
  float sp = clamp(uSpread, 0.0, 1.0);
  float sps = sp * sp * (3.0 - 2.0 * sp);

  // 解体时镜头往云层里推得更快（Ken Burns 的幅度被手势放大）
  float z = 1.0 + 0.035 * sin(uTime * 0.05) + 0.28 * sps;
  vec2 uv = (vUv - 0.5) / z + 0.5;
  uv += uMouse * 0.014;

  vec3 a = texture2D(uTexA, clamp(uv, 0.0, 1.0)).rgb;
  vec3 b = texture2D(uTexB, clamp(uv, 0.0, 1.0)).rgb;
  vec3 c = mix(a, b, uMix);

  c *= uTint * uGain;

  // 解体时把对比往中间压：亮处不刺、暗处不死，旋臂的「条带感」溶解掉，
  // 只剩弥散的星云辉光 —— 这是「整片银河散成星尘」在照片这一层的表现。
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(lum), 0.55 * sps);
  c *= 1.0 - 0.72 * sps;

  c = pow(max(c, 0.0), vec3(1.42));   // 压中间调，让粒子和文字都跳出来

  // 四周暗角
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
  float vig = smoothstep(1.4, 0.2, length(q));
  c *= 0.26 + 0.74 * vig;

  // 中间再压一层柔和的暗袋，给文案腾出可读区域
  float pocket = smoothstep(1.25, 0.0, length((vUv - vec2(0.5, 0.5)) * vec2(uAspect, 1.0) * 1.6));
  c *= 1.0 - 0.34 * pocket;

  gl_FragColor = vec4(c, uOpacity);
}
`
