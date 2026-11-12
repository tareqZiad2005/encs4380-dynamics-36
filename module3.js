(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const fmt = (v, d = 3) => Number(v).toFixed(d);

  function canvas(id) {
    const c = $(id);
    const r = c.getBoundingClientRect();
    const w = Math.max(320, r.width || 700);
    const h = Math.max(220, r.height || 300);
    const d = window.devicePixelRatio || 1;

    c.width = w * d;
    c.height = h * d;

    const x = c.getContext("2d");
    x.setTransform(d, 0, 0, d, 0, 0);

    return { x, w, h };
  }

  function plot(id, series, xmax, ymin, ymax, xlabel, ylabel) {
    const c = canvas(id);
    const ctx = c.x, w = c.w, h = c.h;
    const m = { l: 60, r: 18, t: 18, b: 42 };
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
      let x = L + (R - L) * i / 5;

      ctx.strokeStyle = "#e5eaf1";
      ctx.beginPath();
      ctx.moveTo(x, T);
      ctx.lineTo(x, B);
      ctx.stroke();

      ctx.fillText(fmt(xmax * i / 5, 1), x, B + 17);
    }

    ctx.textAlign = "right";

    for (let i = 0; i <= 4; i++) {
      let v = ymin + (ymax - ymin) * i / 4;
      let y = B - (B - T) * i / 4;

      ctx.fillText(fmt(v, 1), L - 7, y + 4);

      ctx.strokeStyle = "#eef1f5";
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(R, y);
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.fillText(xlabel, (L + R) / 2, h - 5);

    ctx.save();
    ctx.translate(13, (T + B) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(ylabel, 0, 0);
    ctx.restore();

    series.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2.5;
      ctx.beginPath();

      s.points.forEach((p, i) => {
        let x = L + (R - L) * p[0] / xmax;
        let y = B - (B - T) * (p[1] - ymin) / (ymax - ymin);

        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });

      ctx.stroke();
    });

    return { ctx, L, R, T, B };
  }

  function response(t, z, w, K) {
    if (z < 1 - 1e-5) {
      let wd = w * Math.sqrt(1 - z * z);
      let theta = Math.acos(z);

      return K * (
        1 - Math.exp(-z * w * t) /
        Math.sqrt(1 - z * z) *
        Math.sin(wd * t + theta)
      );
    }

    if (z > 1 + 1e-5) {
      let a = -w * (z - Math.sqrt(z * z - 1));
      let b = -w * (z + Math.sqrt(z * z - 1));

      return K * (
        1 + (b * Math.exp(a * t) - a * Math.exp(b * t)) /
        (a - b)
      );
    }

    return K * (1 - (1 + w * t) * Math.exp(-w * t));
  }

  function roots(z, w) {
    if (z < 1) {
      return [
        { re: -z * w, im: w * Math.sqrt(1 - z * z) },
        { re: -z * w, im: -w * Math.sqrt(1 - z * z) }
      ];
    }

    if (z > 1) {
      return [
        { re: -w * (z - Math.sqrt(z * z - 1)), im: 0 },
        { re: -w * (z + Math.sqrt(z * z - 1)), im: 0 }
      ];
    }

    return [
      { re: -w, im: 0 },
      { re: -w, im: 0 }
    ];
  }


function metrics(z, w, K, pts, dt) {
  let max = Math.max(...pts.map(p => p[1]));
  let os = Math.max(0, (max / K - 1) * 100);

  let tpeak = z < 1
    ? Math.PI / (w * Math.sqrt(1 - z * z))
    : null;

  let t10 = pts.find(p => p[1] >= 0.1 * K)?.[0];
  let t90 = pts.find(p => p[1] >= 0.9 * K)?.[0];

  let settle = null;

  for (let i = pts.length - 1; i >= 0; i--) {
    if (Math.abs(pts[i][1] - K) > 0.02 * K) {
      settle = pts[i][0] + dt;
      break;
    }
  }

  return {
    os,
    peak: tpeak,
    rise: t10 != null && t90 != null ? t90 - t10 : null,
    settle
  };
}


  function drawPoles(rs) {
    let c = canvas("m3poles");
    let ctx = c.x;
    let L = 60, R = c.w - 20;
    let T = 20, B = c.h - 42, lim = 12;

    ctx.strokeStyle = "#64748b";
    ctx.beginPath();
    ctx.moveTo(L, (T + B) / 2);
    ctx.lineTo(R, (T + B) / 2);
    ctx.moveTo((L + R) / 2, T);
    ctx.lineTo((L + R) / 2, B);
    ctx.stroke();

    ctx.fillStyle = "#64748b";
    ctx.font = "11px Arial";
    ctx.fillText("Real", R - 25, B + 18);
    ctx.fillText("Imaginary", L + 5, T + 12);

    rs.forEach(p => {
      let x = (L + R) / 2 + p.re / lim * (R - L) / 2;
      let y = (T + B) / 2 - p.im / lim * (B - T) / 2;

      ctx.fillStyle = "#2563eb";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    return c;
  }

  function update() {
    let z = +$("m3zeta").value;
    let w = +$("m3wn").value;
    let K = +$("m3gain").value;

    let Tmax = Math.min(30, Math.max(6, 8 / (z * w)));
    let N = 600, dt = Tmax / N, pts = [];

    for (let i = 0; i <= N; i++) {
      let t = i * dt;
      pts.push([t, response(t, z, w, K)]);
    }

    $("m3zetaVal").textContent = fmt(z, 2);
    $("m3wnVal").textContent = fmt(w, 2) + " rad/s";
    $("m3gainVal").textContent = fmt(K, 2);

    $("m3type").textContent =
      z < 0.999 ? "Underdamped" :
      z > 1.001 ? "Overdamped" :
      "Critically damped";

    let m = metrics(z, w, K, pts, dt);

    $("m3rise").textContent =
      m.rise == null ? "—" : fmt(m.rise, 2) + " s";

    $("m3peak").textContent =
      m.peak == null ? "No peak" : fmt(m.peak, 2) + " s";

    $("m3overshoot").textContent = fmt(m.os, 1) + "%";

    $("m3settle").textContent =
      m.settle == null ? "—" : fmt(m.settle, 2) + " s";

    plot(
  "m3response",
  [{ points: pts, color: "#2563eb" }],
  Tmax,
  0,
  6,
  "Time (s)",
  "Output"
);

    let rs = roots(z, w);
    drawPoles(rs);

    $("m3poleText").textContent =
      "Poles: " +
      rs.map(p =>
        p.im === 0
          ? fmt(p.re, 3)
          : fmt(p.re, 3) +
            (p.im >= 0 ? " + j" : " − j") +
            fmt(Math.abs(p.im), 3)
      ).join(" , ");

    updateStateSpace();
  }

  function updateStateSpace() {
    let m = +$("m3mass").value;
    let b = +$("m3damping").value;
    let k = +$("m3stiffness").value;

    let A21 = -k / m;
    let A22 = -b / m;
    let wn = Math.sqrt(k / m);
    let z = b / (2 * Math.sqrt(m * k));
    let disc = z * z - 1;

    $("m3massVal").textContent = fmt(m, 2);
    $("m3dampingVal").textContent = fmt(b, 2);
    $("m3stiffnessVal").textContent = fmt(k, 2);

    $("m3matrixA").textContent =
      "[[ 0, 1 ], [ " + fmt(A21, 3) +
      ", " + fmt(A22, 3) + " ]]";

    $("m3matrixB").textContent =
      "[[ 0 ], [ " + fmt(1 / m, 3) + " ]]";

    let rs = roots(z, wn);

    let eigen = rs.map(p =>
      p.im === 0
        ? fmt(p.re, 3)
        : fmt(p.re, 3) +
          (p.im >= 0 ? " + j" : " − j") +
          fmt(Math.abs(p.im), 3)
    ).join(" , ");

    $("m3eigen").textContent = eigen;

    const h = 0.01, N = 1000;
    let x = 0, v = 0, pts = [];

    const f = (x, v) => [v, (1 - b * v - k * x) / m];

    for (let i = 0; i <= N; i++) {
      pts.push([x, v]);

      let q1 = f(x, v);
      let q2 = f(x + h * q1[0] / 2, v + h * q1[1] / 2);
      let q3 = f(x + h * q2[0] / 2, v + h * q2[1] / 2);
      let q4 = f(x + h * q3[0], v + h * q3[1]);

      x += h * (q1[0] + 2 * q2[0] + 2 * q3[0] + q4[0]) / 6;
      v += h * (q1[1] + 2 * q2[1] + 2 * q3[1] + q4[1]) / 6;
    }

    let xmax = Math.max(0.5, ...pts.map(p => Math.abs(p[0]))) * 1.15;
    let ymax = Math.max(0.5, ...pts.map(p => Math.abs(p[1]))) * 1.15;

    plot(
      "m3phase",
      [{ points: pts, color: "#0f766e" }],
      xmax,
      -ymax,
      ymax,
      "Displacement x₁",
      "Velocity x₂"
    );

    let expected =
      Math.abs(m - 1) < 1e-9 &&
      Math.abs(b - 2) < 1e-9 &&
      Math.abs(k - 4) < 1e-9;

    const ok =
  expected &&
  Math.abs(rs[0].re + 1) < 0.001 &&
  Math.abs(Math.abs(rs[0].im) - 1.732) < 0.002;

setStatus("m3checkEigen", ok);
setStatus("dash6", ok);

$("dash6Value").textContent =
  "Calculated: " + eigen;
  }

  function setStatus(id, ok) {
    let e = $(id);
    e.textContent = ok ? "PASS" : "CHECK";
    e.className = "status " + (ok ? "pass" : "fail");
  }

  [$("m3zeta"), $("m3wn"), $("m3gain")].forEach(e =>
    e.addEventListener("input", update)
  );

  [$("m3mass"), $("m3damping"), $("m3stiffness")].forEach(e =>
    e.addEventListener("input", updateStateSpace)
  );

  $("m3check").addEventListener("click", () => {
    let a = $("m3prediction").value;
    let ok = a === "less";

    $("m3feedback").textContent = !a
      ? "Choose a prediction first."
      : ok
        ? "Correct! More damping reduces overshoot; at critical damping there is no overshoot."
        : "Not quite. Increasing ζ toward 1 reduces oscillation and overshoot.";

    $("m3feedback").className =
      "feedback " + (ok ? "correct" : "incorrect");
  });

  
function validations() {
  // Test 4: overshoot when zeta = 0.5.
  let os = Math.exp(
    -Math.PI * 0.5 / Math.sqrt(1 - 0.25)
  ) * 100;

  let ok4 = Math.abs(os - 16.3) < 0.2;

  setStatus("m3checkOS", ok4);
  setStatus("dash4", ok4);

  $("dash4Value").textContent =
    "Calculated: " + os.toFixed(2) + "%";

  // Test 5: critically damped response.
  let critical = [];

  for (let i = 0; i <= 1000; i++) {
    critical.push(response(i * 0.03, 1, 2, 1));
  }

  let criticalOS = Math.max(
    0,
    (Math.max(...critical) - 1) * 100
  );

  let ok5 = criticalOS < 0.01;

  setStatus("m3checkCritical", ok5);
  setStatus("dash5", ok5);

  $("dash5Value").textContent =
    "Calculated: " + criticalOS.toFixed(3) + "%";

  updateStateSpace();

  // Test 6 is checked inside updateStateSpace().
}


  window.addEventListener("resize", update);

  update();
  validations();
})();