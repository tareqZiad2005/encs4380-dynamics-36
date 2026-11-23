
const MY_SYSTEM = {
  isExample: true,

  project: "Micromouse",
  actuator: "Left drive motor with its wheel encoder. Input: PWM duty cycle (%). Output: wheel speed (rpm).",
  outputName: "Wheel speed",
  outputUnit: "rpm",

  K: 5.2,      // output units per 1% PWM   (example value)
  tau: 0.09,   // seconds                   (example value)

  source: "Example values for a small 6 V gear motor, not a measurement. Replace with, for example: " +
    "\"PWM step from 0 to 60% on 18 Nov 2026, encoder speed logged every 5 ms, " +
    "K and τ fitted with the tool on this page.\" Or cite the motor datasheet (name, page, table).",

  specWhy: "Example reasoning: the maze controller asks for a new wheel speed every few hundred milliseconds, " +
    "so the speed loop must settle well inside that time. Overshoot makes the two wheels disagree for a moment " +
    "and the mouse drifts sideways, so ζ stays in 0.6–0.8. The PWM must stay inside 0–100%, or the real motor " +
    "behaves slower than the design.",

  setpoint: 300,     // a typical cruising speed, in output units
  zetaTarget: 0.7,
  tsTarget: 0.35,    // s
  Ts: 0.005          // s, controller sampling time (at least 10 samples per τ)
};

(() => {
  "use strict";
  const { $, fmt, show, setStatus } = PID;
  const S = MY_SYSTEM;
  const U_MIN = 0, U_MAX = 100;     // PWM in %
  let K = S.K, tau = S.tau;
  let fitted = null;

  /* ---------- Page text from the config ---------- */
  function fillText() {
    $("msNotice").classList.toggle("hidden", !S.isExample);
    $("msSubtitle").textContent = S.project + ": " + S.outputName.toLowerCase() + " control";
    $("msActuator").textContent = S.actuator;
    $("msSource").textContent = S.source;
    $("msWhy").textContent = S.specWhy;
    $("msOutLabel").textContent = S.outputName + " (" + S.outputUnit + ")";
    document.querySelectorAll(".ms-unit").forEach(e => { e.textContent = S.outputUnit; });
  }

  function showPlant() {
    $("msModel").textContent = "G(s) = " + fmt(K, 3) + " / (" + fmt(tau, 3) + "s + 1)   [" + S.outputUnit + " per % PWM]";
    $("msKShow").textContent = fmt(K, 3) + " " + S.outputUnit + "/%";
    $("msTauShow").textContent = fmt(tau, 3) + " s";
    $("msFull").textContent = fmt(100 * K, 0) + " " + S.outputUnit;
    // Slider ranges follow the plant, so any K and τ give sensible choices
    const ts = $("msTs");
    ts.min = +(0.1 * tau).toPrecision(2); ts.max = +(10 * tau).toPrecision(2); ts.step = +(tau / 100).toPrecision(2);
    const r = $("msR");
    // a round step about 1/100 of the reachable range (95% of full scale)
    const step = Math.pow(10, Math.floor(Math.log10(0.95 * K)));
    r.step = step; r.min = step; r.max = Math.floor(95 * K / step) * step;
  }

  /* ---------- Sliders ---------- */
  const zeta = PID.slider("msZeta", v => fmt(v, 2));
  const tsTarget = PID.slider("msTs", v => fmt(v, 2) + " s");
  const setpoint = PID.slider("msR", v => fmt(v, 0) + " " + S.outputUnit);
  const Ts = () => +$("msSample").value;

  /* ---------- Design from the spec ----------
     τs² + (1 + K·Kp)s + K·Ki = 0  ⇔  s² + 2ζωn·s + ωn² = 0
     ⇒ ωn² = K·Ki/τ  and  2ζωn = (1 + K·Kp)/τ                   */
  function designFromSpec() {
    const wn = 4 / (zeta() * tsTarget());
    const Ki = tau * wn * wn / K;
    let Kp = (2 * zeta() * wn * tau - 1) / K;
    let note = "ωn = 4/(" + fmt(zeta(), 2) + " × " + fmt(tsTarget(), 2) + ") = " + fmt(wn, 2) + " rad/s, so Ki = " +
      fmt(Ki, 3) + " and Kp = " + fmt(Kp, 3) + ".";
    if (Kp < 0) {
      Kp = 0;
      note += " Kp came out negative: the target is slower than the motor on its own, so Kp is set to 0. Choose a shorter settling time.";
    }
    $("msKp").value = +Kp.toFixed(4);
    $("msKi").value = +Ki.toFixed(4);
    $("msDesignNote").textContent = note;
    update();
  }

  /* ---------- Simulate and check ---------- */
  function update() {
    const Kp = +$("msKp").value, Ki = +$("msKi").value;
    const r = setpoint();
    $("msSpecTs").textContent = "≤ " + fmt(tsTarget(), 2) + " s";

    // Closed-loop ζ and ωn from the gains (continuous approximation)
    const wnCl = Ki > 0 ? Math.sqrt(K * Ki / tau) : null;
    const zetaCl = Ki > 0 ? (1 + K * Kp) / (2 * tau * wnCl) : null;
    $("msZetaCl").textContent = show(zetaCl, 2);
    $("msWnCl").textContent = show(wnCl, 2, " rad/s");

    const tEnd = Math.max(5 * tsTarget(), 6 * tau);
    const sim = PID.simulateDigital({
      plant: { type: "first", K, tau }, setpoint: r,
      Kp, Ki, Kd: 0, Ts: Ts(), uMin: U_MIN, uMax: U_MAX, antiWindup: true, tEnd
    });
    const m = PID.metrics(sim.t, sim.y, r);
    const peak = Math.max(...sim.uk);
    // "Within 0–100%" means the controller never had to be clipped
    const clipped = sim.uk.some(u => u >= U_MAX - 1e-9 || u <= U_MIN + 1e-9);

    $("msOs").textContent = show(m.overshoot, 1, "%");
    $("msSettle").textContent = show(m.settle, 3, " s");
    $("msPeak").textContent = fmt(peak, 1) + "%";

    setStatus("msPassZeta", zetaCl != null && zetaCl >= 0.6 - 1e-9 && zetaCl <= 0.8 + 1e-9);
    setStatus("msPassTs", m.settled && m.settle <= tsTarget());
    setStatus("msPassEss", m.settled && Math.abs(m.essPct) <= 1);
    setStatus("msPassPwm", !clipped);

    PID.plot("msPlot", {
      xMax: tEnd, yLabel: S.outputName + " (" + S.outputUnit + ")", yMin: 0,
      series: [{ x: sim.t, y: sim.y, color: "#2563eb", width: 2.6 }],
      hLines: [{ y: r, color: "#94a3b8", label: "setpoint " + fmt(r, 0) }],
      band: m.settled ? { lo: m.yss * 0.98, hi: m.yss * 1.02, from: m.settle } : null,
      vLines: [{ x: tsTarget(), color: "#16a34a", label: "target ts" }]
    });
    PID.plot("msUPlot", {
      xMax: tEnd, yLabel: "PWM (%)", yMin: -5, yMax: 110,
      series: [{ x: sim.tk, y: sim.uk, color: "#d97706", width: 2, step: true }],
      hLines: [{ y: 100, color: "#dc2626", label: "100%" }, { y: 0, color: "#dc2626", label: "0%" }]
    });

    const parts = [];
    if (zetaCl != null && m.overshoot != null && zetaCl >= 0.6) {
      parts.push("With ζ = " + fmt(zetaCl, 2) + " a plain second-order system would overshoot about " +
        fmt(100 * Math.exp(-Math.PI * zetaCl / Math.sqrt(Math.max(1e-6, 1 - zetaCl * zetaCl))), 1) +
        "%; this loop shows " + fmt(m.overshoot, 1) + "% because the PI zero at s = −Ki/Kp adds a little extra.");
    }
    if (clipped) parts.push("The PWM hits a limit, so the real motor would follow the slower clipped command. Lower the setpoint step, or ask for a longer settling time.");
    if (tau / Ts() < 10) parts.push("Ts gives fewer than 10 samples per τ; the digital loop will lag the design. Use a shorter Ts.");
    $("msExplain").textContent = parts.join(" ");

    $("msCode").textContent = PID.arduinoCode({
      title: S.project + " " + S.outputName.toLowerCase() + " PI controller",
      Kp, Ki, Kd: 0, Ts: Ts(), uMin: U_MIN, uMax: U_MAX, antiWindup: true,
      setpoint: r, units: S.outputUnit,
      globals: ["volatile float measuredOutput = 0;   // " + S.outputUnit + ", updated by your encoder/sensor code"],
      readLine: "return measuredOutput;",
      writeLines: ["  analogWrite(9, (int)(u * 255.0 / 100.0));   // u is PWM in %, pin 9 drives the motor"]
    });
  }

  /* ---------- Step-test fitter (Module 1 methods) ---------- */
  function parseLog(text) {
    const pts = [];
    text.split(/\r?\n/).forEach(line => {
      const nums = line.split(/[,;\s\t]+/).filter(Boolean).map(Number);
      if (nums.length >= 2 && nums.every(isFinite)) pts.push([nums[0], nums[1]]);
    });
    return pts;
  }

  function fit() {
    const pts = parseLog($("msLog").value);
    const step = +$("msStep").value;
    const out = $("msFitResult");
    if (pts.length < 20) { out.textContent = "Need at least 20 samples (time, output) to fit."; out.className = "feedback incorrect"; return; }
    if (!(step > 0)) { out.textContent = "Enter the PWM step size in %."; out.className = "feedback incorrect"; return; }

    const t0 = pts[0][0], y0 = pts[0][1];
    const tail = pts.slice(Math.floor(pts.length * 0.9));
    const yss = tail.reduce((a, p) => a + p[1], 0) / tail.length;
    const dy = yss - y0;
    if (Math.abs(dy) < 1e-9) { out.textContent = "The output did not change; check the log."; out.className = "feedback incorrect"; return; }
    const Kfit = dy / step;

    // Method 1: time to reach 63.2% of the change
    const t = pts.map(p => p[0] - t0), y = pts.map(p => p[1]);
    const t63 = PID.crossing(t, y, y0 + 0.632 * dy);

    // Method 2: ln(1 − fraction) against t is a line with slope −1/τ
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(p => {
      const frac = (p[1] - y0) / dy;
      if (frac > 0.1 && frac < 0.9) {
        const x = p[0] - t0, v = Math.log(1 - frac);
        n++; sx += x; sy += v; sxx += x * x; sxy += x * v;
      }
    });
    const slope = n > 2 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : null;
    const tauLog = slope && slope < 0 ? -1 / slope : null;

    const tauFit = tauLog || t63;
    fitted = { K: Kfit, tau: tauFit };
    out.textContent = "K = " + fmt(Kfit, 3) + " " + S.outputUnit + " per %. τ from the 63.2% point: " + show(t63, 3, " s") +
      ". τ from the log method: " + show(tauLog, 3, " s") + ". If the two τ values disagree by more than about 10%, " +
      "the motor is not purely first order (dead time or a second pole); the log method is used.";
    out.className = "feedback correct";
    $("msUseFit").disabled = false;

    // Plot the log with the fitted curve on top
    $("msFitBox").classList.remove("hidden");
    const tm = t[t.length - 1];
    const model = t.map(x => y0 + dy * (1 - Math.exp(-x / tauFit)));
    PID.plot("msFitPlot", {
      xMax: tm, yLabel: S.outputName + " (" + S.outputUnit + ")",
      series: [{ x: t, y: y, color: "#94a3b8", width: 1.6 }, { x: t, y: model, color: "#2563eb", width: 2.6 }],
      points: t63 != null ? [{ x: t63, y: y0 + 0.632 * dy, color: "#0f766e", label: "63.2% at " + fmt(t63, 3) + " s" }] : []
    });
  }

  function demoLog() {
    // A made-up motor (K = 4.8 rpm/%, τ = 0.11 s) with encoder noise
    const lines = ["time_s, speed_rpm"];
    for (let i = 0; i <= 160; i++) {
      const tt = i * 0.005;
      const v = 60 * 4.8 * (1 - Math.exp(-tt / 0.11)) + (Math.random() - 0.5) * 6;
      lines.push(tt.toFixed(3) + ", " + v.toFixed(1));
    }
    $("msLog").value = lines.join("\n");
    $("msStep").value = 60;
    fit();
  }

  $("msStepSketch").textContent = [
    "// Step test: PWM from 0 to STEP %, print time and speed every 5 ms",
    "const int PWM_PIN = 9;",
    "const float STEP = 60;            // %",
    "volatile float measuredOutput = 0; // update this from your encoder code",
    "",
    "void setup() {",
    "  Serial.begin(115200);",
    "  delay(2000);                     // time to open the Serial Monitor",
    "  analogWrite(PWM_PIN, (int)(STEP * 255.0 / 100.0));",
    "  unsigned long start = millis();",
    "  while (millis() - start < 1000) {",
    "    Serial.print((millis() - start) / 1000.0, 3);",
    "    Serial.print(\", \");",
    "    Serial.println(measuredOutput);",
    "    delay(5);",
    "  }",
    "  analogWrite(PWM_PIN, 0);",
    "}",
    "",
    "void loop() {}"
  ].join("\n");

  $("msFit").addEventListener("click", fit);
  $("msDemoLog").addEventListener("click", demoLog);
  $("msUseFit").addEventListener("click", () => {
    if (!fitted) return;
    K = fitted.K; tau = fitted.tau;
    showPlant();
    $("msSource").textContent = "Fitted on this page from the pasted step-test log (63.2% point and log method). " +
      "Copy K = " + fmt(K, 3) + " and τ = " + fmt(tau, 3) + " into mysystem.js and describe the test there.";
    designFromSpec();
  });
  $("msDesign").addEventListener("click", designFromSpec);
  ["msKp", "msKi", "msZeta", "msTs", "msR"].forEach(id => $(id).addEventListener("input", update));
  $("msSample").addEventListener("change", update);
  $("msCopy").addEventListener("click", () => PID.copyText($("msCode").textContent, $("msCopy")));
  window.addEventListener("resize", update);

  // Start from the config
  fillText();
  showPlant();
  PID.setSlider("msZeta", S.zetaTarget);
  PID.setSlider("msTs", S.tsTarget);
  PID.setSlider("msR", S.setpoint);
  $("msSample").value = String(S.Ts);
  designFromSpec();
})();
