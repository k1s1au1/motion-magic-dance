/** أدوات رسم مشتركة لرفع جودة جرافيكس ألعاب الأطفال */

/** كرة ثلاثية الأبعاد بإضاءة وظل وانعكاس */
export function drawSphere(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  opts?: { glow?: string; rim?: boolean },
) {
  ctx.save();
  if (opts?.glow) {
    ctx.shadowBlur = r * 1.2;
    ctx.shadowColor = opts.glow;
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.25, color);
  g.addColorStop(1, shade(color, -0.55));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (opts?.rim !== false) {
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.97, Math.PI * 0.15, Math.PI * 0.95);
    ctx.stroke();
  }

  // لمعة علوية
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.42, r * 0.24, r * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** هالة ضوئية ناعمة */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.5, withAlpha(color, alpha * 0.35));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** ظل أرضي بيضاوي */
export function groundShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, alpha = 0.35) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** شعاع نيون بثلاث طبقات (توهج + جسم + قلب أبيض) */
export function neonBeam(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 3;
  ctx.strokeStyle = withAlpha(color, 0.25);
  ctx.lineWidth = width * 3;
  line(ctx, x1, y1, x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  line(ctx, x1, y1, x2, y2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(1, width * 0.3);
  line(ctx, x1, y1, x2, y2);
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** تظليل حواف الشاشة لعمق سينمائي */
export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.55) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.8);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** غبار/جسيمات معلقة في الهواء تعطي إحساس العمق */
export function airDust(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, color = "255,255,255") {
  ctx.save();
  for (let i = 0; i < 26; i++) {
    const seed = i * 37.13;
    const x = ((Math.sin(seed) * 0.5 + 0.5) * w + now * 0.008 * ((i % 3) + 1)) % w;
    const y = ((Math.cos(seed) * 0.5 + 0.5) * h + now * 0.012 * ((i % 4) + 1)) % h;
    ctx.globalAlpha = 0.05 + (i % 5) * 0.03;
    ctx.fillStyle = `rgba(${color},1)`;
    ctx.beginPath();
    ctx.arc(x, y, ((i % 3) + 1) * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function withAlpha(color: string, a: number) {
  if (color.startsWith("#")) {
    const { r, g, b } = hexRgb(color);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

export function shade(color: string, amount: number) {
  if (!color.startsWith("#")) return color;
  const { r, g, b } = hexRgb(color);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function hexRgb(hex: string) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
