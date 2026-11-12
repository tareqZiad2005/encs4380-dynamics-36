(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const tau = $("m2tau"), freq = $("m2freq"), amp = $("m2amp");
  const fmt = (v, d = 2) => Number(v).toFixed(d);

  function canvas(id) {
    const c = $(id), r = c.getBoundingClientRect();
    const w = Math.max(320, r.width || 700);
    const h = Math.max(220, r.height || 330);
    const d = window.devicePixelRatio || 1;

    c.width = w * d;
    c.height = h * d;

    const x = c.getContext("2d");
    x.setTransform(d, 0, 0, d, 0, 0);
    return {x, w, h};
  }

  function axes(ctx, w, h, xmax, ymin, ymax, xlab, ylab) {
    const m = {l: 58, r: 18, t: 18, b: 42};
    const L = m.l, R = w - m.r;
    const T = m.t, B = h - m.b;

    ctx.strokeStyle = "#64748b";
    ctx.beginPath();
    ctx.moveTo(L, T);
    ctx.lineTo(L, B);
    ctx.lineTo(R, B);
    ctx.stroke();

    ctx.font = "11px Arial";
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";

    for (let i = 0; i <= 5; i++) {
      const px = L + (R - L) * i / 5;

      ctx.strokeStyle = "#e5eaf1";
      ctx.beginPath();
      ctx.moveTo(px, T);
      ctx.lineTo(px, B);
      ctx.stroke();

      ctx.fillText(fmt(xmax * i / 5, 1), px, B + 17);
    }

    ctx.textAlign = "left";
    ctx.fillText(xlab, (L + R) / 2 - 25, h - 5);

    ctx.save();
    ctx.translate(13, (T + B) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(ylab, 0, 0);
    ctx.restore();

    return {L, R, T, B};
  }

  function line(ctx, pts, color, width = 2) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();

    pts.forEach((p, i) => {
      if (i) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
    });

    ctx.stroke();
  }

  function setStatus(id, ok) {
    const e = $(id);
    e.textContent = ok ? "PASS" : "CHECK";
    e.className = "status " + (ok ? "pass" : "fail");
  }

  function update() {
    const t = +tau.value;
    const f = +freq.value;
    const A = +amp.value;

    const w = 2 * Math.PI * f;
    const q = w * t;

    const M = 1 / Math.sqrt(1 + q * q);
    const phase = Math.atan(q);
    const cutoff = 1 / t;
    const delta = (M - 1) * 100;

    $("m2tauVal").textContent = fmt(t) + " s";
    $("m2freqVal").textContent = fmt(f) + " Hz";
    $("m2ampVal").textContent = fmt(A, 1);

    $("m2ratio").textContent = fmt(M, 3);
    $("m2phase").textContent =
      fmt(phase * 180 / Math.PI, 1) + "°";

    $("m2cutoff").textContent = fmt(cutoff) + " rad/s";
    $("m2error").textContent = fmt(delta, 1) + "%";

    // Draw input and output sine waves.
    const a = canvas("m2timePlot");
    const period = 1 / f;
    const tmax = 3 * period;

    const b = axes(
      a.x, a.w, a.h, tmax,
      -1.25 * A, 1.25 * A,
      "Time (s)", "Amplitude"
    );

    const inp = [];
    const out = [];

    for (let i = 0; i <= 500; i++) {
      const tt = tmax * i / 500;
      const x = b.L + (b.R - b.L) * tt / tmax;
      const scale = (b.B - b.T) / 7.5;

inp.push([
  x,
  b.T + (3.75 - A * Math.sin(w * tt)) * scale
]);

out.push([
  x,
  b.T + (
    3.75 - A * M * Math.sin(w * tt - phase)
  ) * scale
]);
    }

    line(a.x, inp, "#d97706", 2);
    line(a.x, out, "#2563eb", 3);

    // Draw Bode magnitude response.
    const z = canvas("m2bodePlot");

    const bb = axes(
      z.x, z.w, z.h, 2, -40, 0,
      "log₁₀(ωτ)", "Magnitude (dB)"
    );

    const pts = [];

    for (let i = 0; i <= 400; i++) {
      const lx = -2 + 4 * i / 400;
      const qq = Math.pow(10, lx);

      const db = 20 * Math.log10(
        1 / Math.sqrt(1 + qq * qq)
      );

      const x = bb.L + (bb.R - bb.L) * i / 400;
      const y = bb.B - (bb.B - bb.T) * (db + 40) / 40;

      pts.push([x, y]);
    }

    line(z.x, pts, "#2563eb", 2.5);

    // Mark the cutoff frequency.
    const cx = bb.L + (bb.R - bb.L) / 2;

    z.x.strokeStyle = "#d97706";
    z.x.setLineDash([5, 4]);
    z.x.beginPath();
    z.x.moveTo(cx, bb.T);
    z.x.lineTo(cx, bb.B);
    z.x.stroke();
    z.x.setLineDash([]);

    z.x.fillStyle = "#b45309";
    z.x.fillText(
      "Cutoff: ωτ = 1",
      Math.min(cx + 6, bb.R - 95),
      bb.T + 14
    );

    // Validation checks.
    const Mref = 1 / Math.sqrt(1 + 0.4 * 0.4);
    const phref = Math.atan(0.4) * 180 / Math.PI;

    const tauMax =
      Math.sqrt(1 / (0.95 * 0.95) - 1) /
      (2 * Math.PI * 100);

    const ph50 =
      Math.atan(2 * Math.PI * 50 * tauMax) *
      180 / Math.PI;

    setStatus("m2checkAmp", Math.abs(Mref - 0.93) < 0.005);
    setStatus("m2checkPhase", Math.abs(phref - 21.8) < 0.3);
    setStatus("m2checkTau", Math.abs(tauMax - 0.00052) < 0.00003);
    setStatus("m2check50", Math.abs(ph50 - 9.3) < 0.5);

    setStatus(
      "dash2",
      Math.abs(Mref - 0.93) < 0.005 &&
      Math.abs(phref - 21.8) < 0.3
    );

    setStatus(
      "dash3",
      Math.abs(tauMax - 0.00052) < 0.00003 &&
      Math.abs(ph50 - 9.3) < 0.5
    );
    $("dash2Value").textContent =
  "Calculated: " + Mref.toFixed(3) +
  " / " + phref.toFixed(1) + "°";

$("dash3Value").textContent =
  "Calculated: " + (tauMax * 1000).toFixed(2) +
  " ms / " + ph50.toFixed(1) + "°";
  }

  // Update plots when sliders change.
  [tau, freq, amp].forEach(e => {
    e.addEventListener("input", update);
  });

  // Check the prediction.
  $("m2check").addEventListener("click", () => {
    const answer = $("m2prediction").value;
    const ok = answer === "decrease";
    const feedback = $("m2feedback");

    feedback.textContent = !answer
      ? "Choose a prediction first."
      : ok
        ? "Correct! Higher frequency makes ωτ larger, so M becomes smaller."
        : "Not quite. M = 1/√(1+(ωτ)²), so increasing frequency decreases M.";

    feedback.className =
      "feedback " + (ok ? "correct" : "incorrect");
  });

  window.addEventListener("resize", update);

  update();
})();