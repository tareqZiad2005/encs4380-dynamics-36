/*
  validation2.js — the three Homework 2 validation checks.
  Plant K/(τs + 1) with K = 1, τ = 1 s. Values are measured from the
  RK4 simulation (or from the closed-loop state matrix), never copied.
*/
(() => {
  "use strict";
  const { $, fmt, setStatus } = PID;
  const PLANT = { type: "first", K: 1, tau: 1 };

  /* ---- Check 1: P only, Kp = 9 ---- */
  const s1 = PID.simulateContinuous({ plant: PLANT, setpoint: 1, Kp: 9, Ki: 0, Kd: 0, tEnd: 3 });
  const m1 = PID.metrics(s1.t, s1.y, 1);
  // Closed-loop τ read off the curve: time to reach 63.2% of the final value
  $("v1aVal").textContent = "Calculated: " + fmt(m1.t63, 3) + " s";
  setStatus("v1a", Math.abs(m1.t63 - 0.1) < 0.002);
  $("v1bVal").textContent = "Calculated: " + fmt(m1.essPct, 2) + "%";
  setStatus("v1b", Math.abs(m1.essPct - 10) < 0.1);

  /* ---- Check 2: PI with Kp = 1, Ki = 1 ----
     States: y and I = ∫e dt, with e = r − y.
        ẏ = (K·(Kp·e + Ki·I) − y)/τ   →  ẏ = −(1 + K·Kp)/τ · y + K·Ki/τ · I + …
        İ = e                          →  İ = −y + …
     so the closed-loop state matrix is
        A = [ −(1 + K·Kp)/τ   K·Ki/τ ]
            [      −1           0    ]
     Its eigenvalues are the closed-loop poles: s² − tr(A)·s + det(A) = 0,
     so ωn = √det(A) and ζ = −tr(A)/(2ωn). */
  const K = 1, tau = 1, Kp = 1, Ki = 1;
  const A = [[-(1 + K * Kp) / tau, K * Ki / tau], [-1, 0]];
  const tr = A[0][0] + A[1][1];
  const det = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  const wn = Math.sqrt(det);
  const zeta = -tr / (2 * wn);
  const disc = tr * tr / 4 - det;
  const eig = disc >= 0
    ? [tr / 2 + Math.sqrt(disc), tr / 2 - Math.sqrt(disc)].map(v => fmt(v, 3)).join(", ")
    : fmt(tr / 2, 3) + " ± j" + fmt(Math.sqrt(-disc), 3);

  $("v2aVal").textContent = "Calculated: " + fmt(wn, 3) + " rad/s";
  setStatus("v2a", Math.abs(wn - 1) < 0.001);
  $("v2bVal").textContent = "Calculated: " + fmt(zeta, 3);
  setStatus("v2b", Math.abs(zeta - 1) < 0.001);

  // Cross-check with the simulation: ζ = 1 means no overshoot
  const s2 = PID.simulateContinuous({ plant: PLANT, setpoint: 1, Kp, Ki, Kd: 0, tEnd: 12 });
  const m2 = PID.metrics(s2.t, s2.y, 1);
  $("v2note").textContent =
    "A = [[" + fmt(A[0][0], 0) + ", " + fmt(A[0][1], 0) + "], [" + fmt(A[1][0], 0) + ", " + fmt(A[1][1], 0) +
    "]], eigenvalues " + eig + " (a double pole, so ζ = 1). The simulated step has " + fmt(m2.overshoot, 2) +
    "% overshoot, as ζ = 1 predicts. These are the same eigenvalue ideas as the Module 3 state-space panel.";

  /* ---- Check 3: any PI controller gives zero steady-state error ---- */
  function testRandomPI() {
    const rows = [];
    let worst = 0;
    for (let i = 0; i < 5; i++) {
      const kp = +(0.5 + Math.random() * 4.5).toFixed(2);
      const ki = +(1 + Math.random() * 9).toFixed(2);
      // Run long enough for the slowest closed-loop pole to die out.
      // Poles: roots of s² + (1 + Kp)s + Ki = 0 (K = τ = 1); the slow one
      // decays as e^(−slow·t), so 10/slow leaves less than 0.01% of it.
      const b = 1 + kp, disc = b * b - 4 * ki;
      const slow = disc > 0 ? (b - Math.sqrt(disc)) / 2 : b / 2;
      const s = PID.simulateContinuous({ plant: PLANT, setpoint: 1, Kp: kp, Ki: ki, Kd: 0, tEnd: 10 / slow + 2, h: 0.005, plotDt: 0.02 });
      const m = PID.metrics(s.t, s.y, 1);
      const err = Math.abs(m.essPct);
      worst = Math.max(worst, isFinite(err) ? err : Infinity);
      rows.push("Kp = " + kp + ", Ki = " + ki + ": " + fmt(err, 3) + "%");
    }
    $("v3Val").textContent = "Calculated: largest error " + fmt(worst, 3) + "%";
    setStatus("v3", worst < 0.1);
    $("v3note").textContent = "Tested: " + rows.join(" · ") +
      ". The integral keeps changing u while any error is left, so the only place the loop can rest is e = 0.";
  }

  testRandomPI();
  $("v3again").addEventListener("click", testRandomPI);
})();
