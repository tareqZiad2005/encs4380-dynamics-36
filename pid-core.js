window.PID = (() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const fmt = (v, d = 2) => Number(v).toFixed(d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ------------------------------------------------------------------
     1. PLANT MODELS
     First order  τ·ẏ + y = K·u               state x = [y]
     Second order ÿ + 2ζωn·ẏ + ωn²·y = K·ωn²·u  state x = [y, ẏ]
  ------------------------------------------------------------------ */
  function plantDerivative(plant, x, u) {
    if (plant.type === "first") {
      return [(plant.K * u - x[0]) / plant.tau];
    }
    const w = plant.wn, z = plant.zeta;
    return [x[1], w * w * (plant.K * u - x[0]) - 2 * z * w * x[1]];
  }

  function plantStates(plant) {
    return plant.type === "first" ? 1 : 2;
  }

  function plantLabel(plant) {
    const n = v => +v.toFixed(2);   // 4.00 → 4, 2.50 → 2.5
    if (plant.type === "first") {
      return "G(s) = " + n(plant.K) + " / (" + n(plant.tau) + "s + 1)";
    }
    return "G(s) = " + n(plant.K * plant.wn * plant.wn) +
      " / (s² + " + n(2 * plant.zeta * plant.wn) + "s + " + n(plant.wn * plant.wn) + ")";
  }

  /* One RK4 step for any state vector: x(t+h) from x(t).
     f(x) must return dx/dt as an array of the same length. */
  function rk4(f, x, h) {
    const add = (a, b, s) => a.map((v, i) => v + s * b[i]);
    const k1 = f(x);
    const k2 = f(add(x, k1, h / 2));
    const k3 = f(add(x, k2, h / 2));
    const k4 = f(add(x, k3, h));
    return x.map((v, i) => v + h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
  }

 
  const TF = 0.01;   // derivative filter time constant (s)
  const H = 0.0005;  // RK4 step (s) — small enough for the fastest gains on the sliders

  function simulateContinuous(o) {
    const plant = o.plant;
    const n = plantStates(plant);
    const r = o.setpoint;
    const tauS = o.tauS || 0;
    const uMax = o.uMax != null ? o.uMax : Infinity;
    const uMin = o.uMin != null ? o.uMin : -uMax;
    const antiWindup = o.antiWindup !== false;
    const T = o.tEnd;
    // RK4 is only stable if h is small compared with the fastest mode of
    // the loop. A big Kd on a fast plant creates a mode near K·Kd/(τ·Tf),
    // so the step shrinks for those settings.
    const g = plant.type === "first" ? plant.K / plant.tau : plant.K * plant.wn;
    const fastest = (1 + g * o.Kd) / TF + g * o.Kp + (plant.type === "first" ? 1 / plant.tau : 2 * plant.wn);
    const plotDt = o.plotDt || 0.005;          // one stored point every 5 ms
    const every = Math.ceil(plotDt / Math.min(o.h || H, 1.2 / fastest));
    const h = plotDt / every;                  // h divides plotDt exactly

    // Controller output for a given state (also used by the solver)
    function control(X) {
      const ym = tauS > 0 ? X[n] : X[0];
      const e = r - ym;
      const I = X[n + 1], xf = X[n + 2];
      const uRaw = o.Kp * e + o.Ki * I + o.Kd * (e - xf) / TF;
      return { e, uRaw, u: clamp(uRaw, uMin, uMax) };
    }

    function f(X) {
      const c = control(X);
      const dx = plantDerivative(plant, X.slice(0, n), c.u);
      const dym = tauS > 0 ? (X[0] - X[n]) / tauS : 0;
      // Anti-windup (clamping): stop integrating while the actuator is
      // saturated and the error would push it further into the limit.
      const pushing = (c.uRaw > uMax && c.e > 0) || (c.uRaw < uMin && c.e < 0);
      const dI = antiWindup && pushing ? 0 : c.e;
      const dxf = (c.e - X[n + 2]) / TF;
      return [...dx, dym, dI, dxf];
    }

    // Start at rest. xf starts equal to the first error, so the step in
    // the setpoint does not produce a "derivative kick" at t = 0.
    let X = new Array(n).fill(0).concat([0, 0, r]);
    const out = { t: [], y: [], ym: [], u: [], r };

    const steps = Math.ceil(T / h);
    for (let i = 0; i <= steps; i++) {
      if (i % every === 0) {
        const c = control(X);
        out.t.push(i * h);
        out.y.push(X[0]);
        out.ym.push(tauS > 0 ? X[n] : X[0]);
        out.u.push(c.u);
      }
      X = rk4(f, X, h);
      if (!isFinite(X[0]) || Math.abs(X[0]) > 1e6) { out.blewUp = true; break; }
    }
    return out;
  }

  /* ------------------------------------------------------------------
     3. DIGITAL PID (P3, My system)

     u[k] = Kp·e[k] + Ki·Ts·Σe[j] + Kd·(e[k] − e[k−1])/Ts

     The controller runs once every Ts seconds and holds u constant in
     between (zero-order hold), exactly like analogWrite() on an Arduino.
     The plant keeps moving continuously, so it is solved with RK4 using
     small sub-steps inside each sample period.

     digitalPidStep() is written line for line like the generated
     Arduino code, so the simulation and the code always agree.
  ------------------------------------------------------------------ */
  function digitalPidStep(c, mem, e) {
    if (mem.first) { mem.prevE = e; mem.first = false; } // no kick on the first sample
    mem.sum += e;                                       // Σ e[j]
    let u = c.Kp * e + c.Ki * c.Ts * mem.sum + c.Kd * (e - mem.prevE) / c.Ts;
    if (c.antiWindup && ((u > c.uMax && e > 0) || (u < c.uMin && e < 0))) {
      mem.sum -= e;                                     // anti-windup: undo this sample's sum
      u = c.Kp * e + c.Ki * c.Ts * mem.sum + c.Kd * (e - mem.prevE) / c.Ts;
    }
    mem.prevE = e;
    return clamp(u, c.uMin, c.uMax);
  }

  function simulateDigital(o) {
    const plant = o.plant;
    const n = plantStates(plant);
    const c = {
      Kp: o.Kp, Ki: o.Ki, Kd: o.Kd, Ts: o.Ts,
      uMax: o.uMax, uMin: o.uMin != null ? o.uMin : -o.uMax,
      antiWindup: !!o.antiWindup
    };
    const sub = Math.max(1, Math.ceil(o.Ts / 0.001)); // ≈1 ms RK4 sub-steps
    const h = o.Ts / sub;
    const mem = { sum: 0, prevE: 0, first: true };
    let x = new Array(n).fill(0);
    let u = 0;
    const out = { t: [], y: [], u: [], tk: [], uk: [], r: o.setpoint };

    const samples = Math.ceil(o.tEnd / o.Ts);
    for (let k = 0; k <= samples; k++) {
      // Sample: read y, compute and hold u
      const e = o.setpoint - x[0];
      u = digitalPidStep(c, mem, e);
      out.tk.push(k * o.Ts);
      out.uk.push(u);
      // Plant runs for one sample period with u held constant
      for (let j = 0; j < sub; j++) {
        const t = k * o.Ts + j * h;
        if (j % Math.max(1, Math.round(sub / 8)) === 0 || sub < 8) {
          out.t.push(t); out.y.push(x[0]); out.u.push(u);
        }
        x = rk4(xx => plantDerivative(plant, xx, u), x, h);
      }
      if (!isFinite(x[0]) || Math.abs(x[0]) > 1e6) { out.blewUp = true; break; }
    }
    return out;
  }

  /* ------------------------------------------------------------------
     4. METRICS read off the simulated curve
     Final value yss = average of the last 5% of the window.
     Rise time 10–90% of yss, overshoot relative to yss,
     settling time = last time the curve leaves the ±2% band around yss.
  ------------------------------------------------------------------ */
  function crossing(t, y, level) {
    for (let i = 1; i < y.length; i++) {
      if ((y[i - 1] - level) * (y[i] - level) <= 0 && y[i] !== y[i - 1]) {
        return t[i - 1] + (level - y[i - 1]) * (t[i] - t[i - 1]) / (y[i] - y[i - 1]);
      }
    }
    return null;
  }

  function metrics(t, y, r) {
    const N = y.length;
    const tail = Math.max(2, Math.floor(N * 0.05));
    let yss = 0;
    for (let i = N - tail; i < N; i++) yss += y[i];
    yss /= tail;

    const ref = Math.abs(yss) > 0.05 * Math.abs(r) ? Math.abs(yss) : Math.abs(r);
    const band = 0.02 * ref;

    let ymax = -Infinity, ipk = 0, biggest = 0;
    for (let i = 0; i < N; i++) {
      if (y[i] > ymax) { ymax = y[i]; ipk = i; }
      biggest = Math.max(biggest, Math.abs(y[i]));
    }

    // Is the last 10% of the window inside the band?
    const last = Math.floor(N * 0.9);
    let tailSwing = 0;
    for (let i = last; i < N; i++) tailSwing = Math.max(tailSwing, Math.abs(y[i] - yss));
    const settled = tailSwing <= band;

    // Growing oscillation = unstable
    const half = Math.floor(N / 2);
    let swingA = 0, swingB = 0;
    for (let i = Math.floor(N * 0.3); i < half; i++) swingA = Math.max(swingA, Math.abs(y[i] - yss));
    for (let i = Math.floor(N * 0.8); i < N; i++) swingB = Math.max(swingB, Math.abs(y[i] - yss));
    const unstable = !isFinite(yss) || biggest > 20 * Math.max(1, Math.abs(r)) ||
      (!settled && swingB > 1.05 * swingA && swingB > band * 5);

    // Not settled: count how often the tail crosses its own average.
    // Several crossings = oscillating; none = just slow.
    let crossings = 0, mean = 0;
    const from = Math.floor(N * 0.6);
    for (let i = from; i < N; i++) mean += y[i];
    mean /= (N - from);
    for (let i = from + 1; i < N; i++) if ((y[i - 1] - mean) * (y[i] - mean) < 0) crossings++;
    const oscillating = !settled && !unstable && crossings >= 3;

    let settle = null;
    if (settled) {
      settle = 0;
      for (let i = N - 1; i >= 0; i--) {
        if (Math.abs(y[i] - yss) > band) { settle = t[Math.min(N - 1, i + 1)]; break; }
      }
    }

    const t10 = crossing(t, y, 0.1 * yss);
    const t90 = crossing(t, y, 0.9 * yss);
    const overshoot = settled && yss !== 0 ? Math.max(0, (ymax - yss) / Math.abs(yss) * 100) : null;

    return {
      yss,
      settled,
      unstable,
      oscillating,
      status: unstable ? "Unstable" : settled ? "Settled" : oscillating ? "Oscillating" : "Still settling",
      rise: settled && t10 != null && t90 != null ? t90 - t10 : null,
      overshoot,
      peakTime: overshoot != null && overshoot > 0.1 ? t[ipk] : null,
      settle,
      ess: settled ? r - yss : null,
      essPct: settled && r !== 0 ? (r - yss) / r * 100 : null,
      t63: crossing(t, y, 0.632 * yss)
    };
  }

  /* ------------------------------------------------------------------
     5. PLOTTING — same look as the Homework 1 charts
     series: [{ x:[], y:[], color, width, dash:[..], step:true, dots:true }]
     hLines: [{ y, color, dash, label }]   band: { lo, hi, from, color }
  ------------------------------------------------------------------ */
  function setupCanvas(canvas) {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(300, r.width || 700);
    const h = Math.max(200, r.height || 300);
    const d = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w, h };
  }

  function niceStep(span, count) {
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function plot(canvasId, o) {
    const canvas = $(canvasId);
    if (!canvas) return null;
    const { ctx, w, h } = setupCanvas(canvas);
    const m = { l: 56, r: 16, t: 14, b: 40 };
    const L = m.l, R = w - m.r, T = m.t, B = h - m.b;

    const xMin = o.xMin || 0, xMax = o.xMax;
    let yMin = o.yMin, yMax = o.yMax;
    if (yMin == null || yMax == null) {
      let lo = Infinity, hi = -Infinity;
      o.series.forEach(s => s.y.forEach(v => { if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
      (o.hLines || []).forEach(l => { lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); });
      if (o.yCap) { lo = Math.max(lo, o.yCap[0]); hi = Math.min(hi, o.yCap[1]); }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      if (hi - lo < 1e-9) { hi = lo + 1; }
      const pad = (hi - lo) * 0.08;
      if (yMin == null) yMin = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
      if (yMax == null) yMax = hi + pad;
    }

    const X = v => L + (R - L) * (v - xMin) / (xMax - xMin);
    const Y = v => B - (B - T) * (v - yMin) / (yMax - yMin);

    // grid and tick labels
    ctx.font = "11px Arial";
    ctx.lineWidth = 1;
    const xs = niceStep(xMax - xMin, 5), ys = niceStep(yMax - yMin, 4);
    ctx.textAlign = "center";
    for (let v = Math.ceil(xMin / xs) * xs; v <= xMax + 1e-9; v += xs) {
      ctx.strokeStyle = "#e5eaf1";
      ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), B); ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText(+v.toFixed(4) + "", X(v), B + 16);
    }
    ctx.textAlign = "right";
    for (let v = Math.ceil(yMin / ys) * ys; v <= yMax + 1e-9; v += ys) {
      ctx.strokeStyle = "#eef1f5";
      ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(R, Y(v)); ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.fillText(+v.toFixed(4) + "", L - 6, Y(v) + 4);
    }
    ctx.strokeStyle = "#64748b";
    ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, B); ctx.lineTo(R, B); ctx.stroke();

    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.fillText(o.xLabel || "Time (s)", (L + R) / 2, h - 6);
    ctx.save();
    ctx.translate(13, (T + B) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(o.yLabel || "", 0, 0);
    ctx.restore();

    // everything below is clipped to the plot area
    ctx.save();
    ctx.beginPath(); ctx.rect(L, T, R - L, B - T); ctx.clip();

    if (o.band) {
      ctx.fillStyle = o.band.color || "rgba(22,163,74,0.10)";
      const x0 = X(o.band.from != null ? o.band.from : xMin);
      ctx.fillRect(x0, Y(o.band.hi), R - x0, Y(o.band.lo) - Y(o.band.hi));
    }

    (o.hLines || []).forEach(l => {
      ctx.strokeStyle = l.color || "#94a3b8";
      ctx.lineWidth = 1.2;
      ctx.setLineDash(l.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(L, Y(l.y)); ctx.lineTo(R, Y(l.y)); ctx.stroke();
      ctx.setLineDash([]);
      if (l.label) {
        ctx.fillStyle = l.color || "#64748b";
        ctx.textAlign = "right";
        ctx.fillText(l.label, R - 4, Y(l.y) - 4);
      }
    });

    (o.vLines || []).forEach(l => {
      ctx.strokeStyle = l.color || "#94a3b8";
      ctx.lineWidth = 1.2;
      ctx.setLineDash(l.dash || [3, 4]);
      ctx.beginPath(); ctx.moveTo(X(l.x), T); ctx.lineTo(X(l.x), B); ctx.stroke();
      ctx.setLineDash([]);
      if (l.label) {
        ctx.fillStyle = l.color || "#64748b";
        ctx.textAlign = "left";
        ctx.fillText(l.label, X(l.x) + 4, T + 12);
      }
    });

    o.series.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2.4;
      ctx.setLineDash(s.dash || []);
      ctx.beginPath();
      for (let i = 0; i < s.x.length; i++) {
        const px = X(s.x[i]), py = Y(clamp(s.y[i], yMin - 10 * (yMax - yMin), yMax + 10 * (yMax - yMin)));
        if (i === 0) ctx.moveTo(px, py);
        else if (s.step) { ctx.lineTo(px, Y(s.y[i - 1])); ctx.lineTo(px, py); }
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.dots) {
        ctx.fillStyle = s.color;
        for (let i = 0; i < s.x.length; i++) {
          ctx.beginPath(); ctx.arc(X(s.x[i]), Y(s.y[i]), 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
    });

    (o.points || []).forEach(p => {
      ctx.fillStyle = p.color || "#0f766e";
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r || 5, 0, Math.PI * 2); ctx.fill();
      if (p.label) {
        ctx.font = "11px Arial";
        ctx.textAlign = X(p.x) > (L + R) / 2 ? "right" : "left";
        ctx.fillText(p.label, X(p.x) + (X(p.x) > (L + R) / 2 ? -8 : 8), Y(p.y) - 8);
      }
    });

    ctx.restore();
    return { X, Y, L, R, T, B, yMin, yMax };
  }

  /* ------------------------------------------------------------------
     6. ARDUINO CODE — the same algorithm as digitalPidStep()
  ------------------------------------------------------------------ */
  function arduinoCode(c) {
    const ms = Math.round(c.Ts * 1000);
    const f = v => Number(v).toFixed(4);
    const lines = [
      "// " + (c.title || "Digital PID") + " — generated by the ENCS4380 PID toolkit",
      "// u[k] = Kp*e[k] + Ki*Ts*sum(e) + Kd*(e[k] - e[k-1])/Ts",
      "",
      "const float Kp = " + f(c.Kp) + ";",
      "const float Ki = " + f(c.Ki) + ";",
      "const float Kd = " + f(c.Kd) + ";",
      "const float Ts = " + f(c.Ts) + ";            // sampling time (s)",
      "const unsigned long TS_MS = " + ms + ";       // the same, in ms",
      "const float U_MIN = " + f(c.uMin) + ";",
      "const float U_MAX = " + f(c.uMax) + ";",
      "const bool ANTI_WINDUP = " + (c.antiWindup ? "true" : "false") + ";",
      "",
      "float setpoint = " + f(c.setpoint) + ";" + (c.units ? "      // " + c.units : ""),
      "float errorSum = 0;      // sum of e[j]",
      "float prevError = 0;     // e[k-1]",
      "bool firstSample = true;",
      "unsigned long lastSample = 0;",
      ...(c.globals ? [""].concat(c.globals) : []),
      "",
      "float readSensor() {",
      "  " + (c.readLine || "return analogRead(A0) * (5.0 / 1023.0);   // replace with your sensor reading"),
      "}",
      "",
      "void writeActuator(float u) {",
      ...(c.writeLines || (c.uMin < 0
        ? ["  // u can be negative: an H-bridge needs a direction pin and a PWM pin",
           "  digitalWrite(8, u >= 0 ? HIGH : LOW);",
           "  analogWrite(9, (int)(255.0 * fabs(u) / U_MAX));"]
        : ["  analogWrite(9, (int)(255.0 * u / U_MAX));   // U_MAX = full PWM (255)"])),
      "}",
      "",
      "void setup() {",
      "  Serial.begin(115200);",
      ...(c.uMin < 0 && !c.writeLines ? ["  pinMode(8, OUTPUT);"] : []),
      "  lastSample = millis();",
      "}",
      "",
      "void loop() {",
      "  if (millis() - lastSample < TS_MS) return;   // wait for the next sample",
      "  lastSample += TS_MS;",
      "",
      "  float y = readSensor();",
      "  float e = setpoint - y;",
      "  if (firstSample) { prevError = e; firstSample = false; }   // no derivative kick",
      "",
      "  errorSum += e;",
      "  float u = Kp * e + Ki * Ts * errorSum + Kd * (e - prevError) / Ts;",
      "",
      "  // Anti-windup: while the output is saturated, stop adding to the sum",
      "  if (ANTI_WINDUP && ((u > U_MAX && e > 0) || (u < U_MIN && e < 0))) {",
      "    errorSum -= e;",
      "    u = Kp * e + Ki * Ts * errorSum + Kd * (e - prevError) / Ts;",
      "  }",
      "",
      "  u = constrain(u, U_MIN, U_MAX);",
      "  prevError = e;",
      "  writeActuator(u);",
      "",
      "  Serial.print(y); Serial.print(','); Serial.println(u);   // log for plotting",
      "}"
    ];
    return lines.join("\n");
  }

  /* Copy text to the clipboard, with a fallback for older phones */
  function copyText(text, button) {
    const done = () => {
      const old = button.textContent;
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = old; }, 1500);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, () => fallback());
    } else fallback();
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { button.textContent = "Select the code and copy it"; }
      ta.remove();
    }
  }

  /* ------------------------------------------------------------------
     Small UI helpers shared by the pages
  ------------------------------------------------------------------ */
  // Wire a slider to its <output> label; returns a getter for the value.
  function slider(id, format) {
    const el = $(id), out = $(id + "Val");
    const show = () => { if (out) out.textContent = format(+el.value); };
    el.addEventListener("input", show);
    show();
    return () => +el.value;
  }

  function setSlider(id, value) {
    const el = $(id);
    el.value = value;
    el.dispatchEvent(new Event("input"));
  }

  function setStatus(id, ok) {
    const e = $(id);
    if (!e) return;
    e.textContent = ok ? "PASS" : "FAIL";
    e.className = "status " + (ok ? "pass" : "fail");
  }

  // Format a metric, or "—" if it could not be measured. Values that round
  // to zero are shown as 0 (avoids "-0.0%").
  const show = (v, d, unit) => {
    if (v == null) return "—";
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    return fmt(v, d) + (unit || "");
  };

  // Short label for the diagrams: "Kp 9 · Ki 30 · Kd 0.8"
  const gainsLabel = (kp, ki, kd) => "Kp " + +kp.toFixed(2) + " · Ki " + +ki.toFixed(2) + " · Kd " + +kd.toFixed(2);

  // "Predict, then check": the user picks an answer, then the page makes
  // the change itself and explains what happened using measured numbers.
  function predictBox(o) {
    $(o.button).addEventListener("click", () => {
      const answer = $(o.select).value;
      const fb = $(o.feedback);
      if (!answer) { fb.textContent = "Choose a prediction first."; fb.className = "feedback"; return; }
      const story = o.apply();   // changes the sliders, returns a sentence with the numbers
      const ok = answer === o.correct;
      fb.textContent = (ok ? "Correct. " : "Not quite. ") + story;
      fb.className = "feedback " + (ok ? "correct" : "incorrect");
    });
  }

  return {
    $, fmt, clamp, show, gainsLabel,
    plantDerivative, plantLabel, rk4,
    simulateContinuous, simulateDigital, digitalPidStep,
    metrics, crossing, plot, arduinoCode, copyText,
    slider, setSlider, setStatus, predictBox,
    TF
  };
})();
