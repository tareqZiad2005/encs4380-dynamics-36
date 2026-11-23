(() => {
  "use strict";
  const { $, fmt } = PID;

  const U_MAX = 10;          // actuator limit for this challenge
  const ESS_LIMIT = 1;       // "zero" steady-state error means within 1%

  let plant = null, spec = null, solution = null;
  let roundBest = 0, sessionPoints = 0, rounds = 0, checkedThisRound = false, revealed = false;

  function noise() { return (Math.random() - 0.5) * 0.025; } // same as module4.js

  // Same random ranges as module4.js
  function randomPlant() {
    if (Math.random() < 0.5) {
      return { type: "first", tau: +(0.5 + Math.random() * 4.5).toFixed(2), K: +(0.7 + Math.random() * 1.8).toFixed(2) };
    }
    return { type: "second", zeta: +(0.2 + Math.random() * 0.7).toFixed(2), wn: +(1 + Math.random() * 3.5).toFixed(2), K: +(0.7 + Math.random() * 1.8).toFixed(2) };
  }

  // How long the plant takes to settle on its own (2% rule of thumb)
  function openLoopSettling(p) {
    return p.type === "first" ? 3.9 * p.tau : 4 / (p.zeta * p.wn);
  }

  function simTime(p) {
    const base = p.type === "first" ? Math.max(8, 4 * p.tau) : Math.max(10, Math.min(20, 8 / (p.zeta * p.wn)));
    return spec ? Math.max(base, 3 * spec.tsMax) : base;
  }

  function closedLoop(g, fast) {
    return PID.simulateContinuous({
      plant, setpoint: 1, Kp: g.Kp, Ki: g.Ki, Kd: g.Kd,
      uMax: U_MAX, tEnd: simTime(plant),
      h: fast ? 0.002 : undefined, plotDt: fast ? 0.01 : 0.005
    });
  }

  // Candidate gains, scaled to the plant so the grid fits any K, τ, ωn
  function gainGrid(p) {
    const k = 1 / p.K, list = [];
    if (p.type === "first") {
      [0.5, 1, 2, 4, 8].forEach(a => [0.5, 1, 2, 4, 8].forEach(b =>
        list.push({ Kp: a * k, Ki: b * k / p.tau, Kd: 0 })));
    } else {
      [0.5, 1, 2, 4].forEach(a => [0.25, 0.5, 1, 2, 4].forEach(b => [0, 0.25, 0.5, 1].forEach(c =>
        list.push({ Kp: a * k, Ki: b * k * p.wn, Kd: c * k / p.wn }))));
    }
    return list;
  }

  // Run the grid a few simulations at a time so the page stays responsive
  function findBest(osMax, done) {
    const grid = gainGrid(plant);
    let i = 0, best = null;
    function chunk() {
      const stop = Math.min(grid.length, i + 6);
      for (; i < stop; i++) {
        const s = closedLoop(grid[i], true);
        const m = PID.metrics(s.t, s.y, 1);
        if (m.settled && m.overshoot <= osMax && Math.abs(m.essPct) <= ESS_LIMIT && (!best || m.settle < best.ts)) {
          best = Object.assign({ ts: m.settle }, grid[i]);
        }
      }
      if (i < grid.length) setTimeout(chunk, 0); else done(best);
    }
    chunk();
  }

  function newRound() {
    if (checkedThisRound) { sessionPoints += roundBest; rounds++; }
    roundBest = 0; checkedThisRound = false; revealed = false;
    updateScore();

    plant = randomPlant();
    spec = null;
    const osMax = [5, 10, 15][Math.floor(Math.random() * 3)];

    $("p4kind").textContent = "Checking that the spec is achievable…";
    ["p4check", "p4solution", "p4new"].forEach(id => { $(id).disabled = true; });
    $("p4closedBox").classList.add("hidden");
    $("p4hint").classList.add("hidden");
    $("p4hintBtn").textContent = "Show a hint";
    $("p4result").textContent = "Choose gains and a prediction, then check your design.";
    $("p4result").className = "feedback";
    ["p4passOS", "p4passTs", "p4passEss"].forEach(id => { $(id).textContent = "Not checked"; $(id).className = "pending"; });

    findBest(osMax, best => {
      if (!best) { newRound(); return; }            // rare: try another plant
      // Settling limit: twice as fast as the plant alone, unless that is
      // not reachable, then 30% slower than the best design found.
      const tsMax = Math.ceil(Math.max(0.5 * openLoopSettling(plant), 1.3 * best.ts) * 10) / 10;
      spec = { osMax, tsMax };
      solution = best;
      $("p4specOS").textContent = "≤ " + osMax + "%";
      $("p4specTs").textContent = "≤ " + fmt(tsMax, 1) + " s";
      $("p4kind").textContent = "Mystery plant";
      ["p4check", "p4solution", "p4new"].forEach(id => { $(id).disabled = false; });
      drawOpenLoop();
    });
  }

  function drawOpenLoop() {
    const T = Math.min(25, Math.max(6, 1.6 * openLoopSettling(plant)));
    const t = [], y = [];
    let x = plant.type === "first" ? [0] : [0, 0];
    const h = 0.002, every = Math.round(T / 240 / h);
    for (let i = 0; i <= Math.ceil(T / h); i++) {
      if (i % every === 0) { t.push(i * h); y.push(x[0] + noise()); }
      x = PID.rk4(xx => PID.plantDerivative(plant, xx, 1), x, h);
    }
    PID.plot("p4open", {
      xMax: T, yLabel: "Plant output", yMin: 0, yMax: plant.K * 1.9,
      series: [{ x: t, y: y, color: "#64748b", width: 2 }]
    });
  }

  function readGains() {
    return { Kp: +$("p4Kp").value, Ki: +$("p4Ki").value, Kd: +$("p4Kd").value };
  }

  function setPass(id, ok) {
    $(id).textContent = ok ? "PASS" : "FAIL";
    $(id).className = "status " + (ok ? "pass" : "fail");
  }

  function check() {
    const prediction = $("p4predict").value;
    if (!prediction) {
      $("p4result").textContent = "Make your prediction first: will the design meet the spec?";
      $("p4result").className = "feedback";
      return;
    }
    const g = readGains();
    if ([g.Kp, g.Ki, g.Kd].some(v => !(v >= 0))) {
      $("p4result").textContent = "Gains must be zero or positive numbers.";
      $("p4result").className = "feedback incorrect";
      return;
    }

    const sim = closedLoop(g, false);
    const m = PID.metrics(sim.t, sim.y, 1);
    const pass = {
      os: m.settled && m.overshoot <= spec.osMax,
      ts: m.settled && m.settle <= spec.tsMax,
      ess: m.settled && Math.abs(m.essPct) <= ESS_LIMIT
    };
    setPass("p4passOS", pass.os);
    setPass("p4passTs", pass.ts);
    setPass("p4passEss", pass.ess);
    const points = [pass.os, pass.ts, pass.ess].filter(Boolean).length;

    // Score: the best result of each round counts
    if (!revealed) {
      checkedThisRound = true;
      roundBest = Math.max(roundBest, points);
      updateScore();
    }

    // Was the prediction right?
    const failed = Object.keys(pass).filter(k => !pass[k]);
    const right = prediction === "all" ? failed.length === 0 : failed.includes(prediction);
    const measured = m.settled
      ? "Measured: overshoot " + fmt(m.overshoot, 1) + "%, settling " + fmt(m.settle, 2) + " s, error " + fmt(Math.abs(m.essPct), 2) + "%."
      : "The loop did not settle (" + m.status.toLowerCase() + ").";
    $("p4result").textContent = (right ? "Your prediction was right. " : "Your prediction was wrong. ") +
      points + " of 3 parts met. " + measured + (revealed ? " (Solution shown: this round's score is frozen.)" : "");
    $("p4result").className = "feedback " + (points === 3 ? "correct" : "incorrect");

    $("p4closedBox").classList.remove("hidden");
    const T = simTime(plant);
    PID.plot("p4closed", {
      xMax: T, yLabel: "Output y", yCap: [-1, 2.5],
      series: [{ x: sim.t, y: sim.y, color: "#2563eb", width: 2.6 }],
      hLines: [
        { y: 1, color: "#94a3b8", label: "r = 1" },
        { y: 1 + spec.osMax / 100, color: "#dc2626", label: "overshoot limit" }
      ],
      band: { lo: 0.98, hi: 1.02, from: spec.tsMax },
      vLines: [{ x: spec.tsMax, color: "#16a34a", label: "settling limit" }]
    });
  }

  function updateScore() {
    const total = sessionPoints + (checkedThisRound ? roundBest : 0);
    const n = rounds + (checkedThisRound ? 1 : 0);
    $("p4score").textContent = total + " / " + 3 * n;
  }

  function showSolution() {
    revealed = true;
    const p = plant.type === "first"
      ? "First order: K = " + fmt(plant.K) + ", τ = " + fmt(plant.tau) + " s."
      : "Second order: K = " + fmt(plant.K) + ", ζ = " + fmt(plant.zeta) + ", ωn = " + fmt(plant.wn) + " rad/s.";
    $("p4result").textContent = "The plant was " + p.charAt(0).toLowerCase() + p.slice(1) + " One design that meets the spec: Kp = " + fmt(solution.Kp) +
      ", Ki = " + fmt(solution.Ki) + ", Kd = " + fmt(solution.Kd) + " (settles in " + fmt(solution.ts) +
      " s). Other designs work too. This round's score is now frozen.";
    $("p4result").className = "feedback";
  }

  function toggleHint() {
    const box = $("p4hint");
    if (box.classList.contains("hidden")) {
      box.textContent = plant.type === "first"
        ? "No overshoot on its own, so it is first order. Read K from the final value and τ from the 63.2% point (Module 1). " +
          "With PI the loop's characteristic equation is τs² + (1 + K·Kp)s + K·Ki = 0, so pick ζ and ωn, then Ki = τωn²/K and Kp = (2ζωnτ − 1)/K."
        : "It overshoots on its own, so it is second order. Overshoot gives ζ and peak time gives ωn (Module 4). " +
          "Use Kd to add damping, Ki to remove the error, and keep Ki modest or the overshoot returns.";
      box.classList.remove("hidden");
      $("p4hintBtn").textContent = "Hide the hint";
    } else {
      box.classList.add("hidden");
      $("p4hintBtn").textContent = "Show a hint";
    }
  }

  $("p4check").addEventListener("click", check);
  $("p4new").addEventListener("click", newRound);
  $("p4solution").addEventListener("click", showSolution);
  $("p4hintBtn").addEventListener("click", toggleHint);
  window.addEventListener("resize", () => { if (spec) drawOpenLoop(); });
  newRound();
})();
