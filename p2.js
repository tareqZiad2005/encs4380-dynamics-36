
(() => {
  "use strict";
  const { $, fmt, show, slider, setSlider } = PID;

  const PLANT = { type: "first", K: 1, tau: 1 };

  const tauS = slider("p2tauS", v => fmt(v, 2) + " s");
  const Kp = slider("p2Kp", v => fmt(v, 1));
  const Ki = slider("p2Ki", v => fmt(v, 1));
  const Kd = slider("p2Kd", v => fmt(v, 2));
  const T = slider("p2T", v => v + " s");

  function run(ts, fast) {
    return PID.simulateContinuous({
      plant: PLANT, setpoint: 1,
      Kp: Kp(), Ki: Ki(), Kd: Kd(),
      tauS: ts, tEnd: T(),
      // the sweep uses a coarser step: it only needs the overshoot
      h: fast ? 0.002 : undefined, plotDt: fast ? 0.02 : undefined
    });
  }

  /* Routh test for this loop. With C(s) = Kp + Ki/s + Kd·s the
     characteristic equation is
        τs·s³ + (1 + τs + Kd)·s² + (1 + Kp)·s + Ki = 0
     and it is stable while (1 + τs + Kd)(1 + Kp) > τs·Ki, so the loop
     turns unstable at τs = (1 + Kd)(1 + Kp) / (Ki − 1 − Kp). */
  function criticalTauS() {
    const d = Ki() - 1 - Kp();
    return d > 0 ? (1 + Kd()) * (1 + Kp()) / d : null;
  }

  function update() {
    const sim = run(tauS(), false);
    const mTrue = PID.metrics(sim.t, sim.y, 1);
    const mSens = PID.metrics(sim.t, sim.ym, 1);

    $("p2osTrue").textContent = show(mTrue.overshoot, 1, "%");
    $("p2osSensor").textContent = show(mSens.overshoot, 1, "%");
    $("p2settle").textContent = show(mTrue.settle, 2, " s");
    const st = $("p2status");
    st.textContent = mTrue.status;
    st.className = mTrue.status === "Settled" ? "good" : mTrue.status === "Unstable" ? "bad" : "warn";
    const crit = criticalTauS();
    $("p2onset").textContent = crit == null ? "never (Ki ≤ 1 + Kp)" : fmt(crit, 2) + " s";

    $("p2pidText").textContent = PID.gainsLabel(Kp(), Ki(), Kd());
    $("p2sensorText").textContent = tauS() > 0 ? "1 / (" + fmt(tauS(), 2) + "s + 1)" : "ideal (τs = 0)";

    PID.plot("p2plot", {
      xMax: T(), yLabel: "Output", yCap: [-1.5, 3],
      series: [
        { x: sim.t, y: sim.y, color: "#2563eb", width: 2.6 },
        { x: sim.t, y: sim.ym, color: "#d97706", width: 2.2, dash: [7, 5] }
      ],
      hLines: [{ y: 1, color: "#94a3b8", label: "r = 1" }]
    });

    $("p2explain").textContent = explain(mTrue, mSens, crit);
    scheduleSweep();
  }

  function explain(mt, ms, crit) {
    if (tauS() === 0) return "With an ideal sensor the controller sees the true output, so both curves are the same.";
    if (mt.status === "Unstable") return "The loop is unstable. The controller reacts to a reading that is " + fmt(tauS(), 2) +
      " s old, so every correction arrives too late and makes the next swing bigger. Lower Ki or use a faster sensor.";
    if (mt.status !== "Settled") return "The loop oscillates. The reading lags the true output, so the controller keeps pushing after it should have stopped." +
      (crit ? " The Routh test puts sustained oscillation at τs = " + fmt(crit, 2) + " s." : "");
    let s = "The true output overshoots by " + fmt(mt.overshoot, 1) + "%, but the sensor only shows " + fmt(ms.overshoot, 1) + "%. ";
    s += "The controller can only control what the sensor says: a slow sensor hides part of the overshoot from it, and from you.";
    return s;
  }

  // Sweep τs and plot overshoot against it. Debounced, because it runs
  // about 30 simulations and the user may still be dragging a slider.
  let sweepTimer = null;
  function scheduleSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 120);
  }

  function sweep() {
    const xs = [], ys = [];
    let firstBad = null;
    for (let ts = 0; ts <= 1.5 + 1e-9; ts += 0.05) {
      const s = run(ts, true);
      const m = PID.metrics(s.t, s.y, 1);
      if (m.status === "Settled") { xs.push(ts); ys.push(m.overshoot); }
      else if (firstBad == null) firstBad = ts;
    }
    const cur = run(tauS(), true);
    const mc = PID.metrics(cur.t, cur.y, 1);
    const yTop = Math.max(20, ...ys) * 1.1;

    PID.plot("p2sweep", {
      xMax: 1.5, xLabel: "Sensor time constant τs (s)", yLabel: "Overshoot (%)",
      yMin: 0, yMax: yTop,
      series: [{ x: xs, y: ys, color: "#2563eb", width: 2.4 }],
      band: firstBad != null ? { lo: 0, hi: yTop, from: firstBad - 0.025, color: "rgba(220,38,38,0.10)" } : null,
      points: mc.status === "Settled"
        ? [{ x: tauS(), y: mc.overshoot, color: "#d97706", label: fmt(mc.overshoot, 1) + "%" }]
        : [{ x: tauS(), y: yTop * 0.92, color: "#dc2626", label: "does not settle" }]
    });
  }

  $("p2reset").addEventListener("click", () => {
    setSlider("p2Kp", 2); setSlider("p2Ki", 6); setSlider("p2Kd", 0); setSlider("p2tauS", 0.1);
    update();
  });

  PID.predictBox({
    select: "p2predict", button: "p2predictBtn", feedback: "p2predictFb", correct: "grows",
    apply: () => {
      setSlider("p2Kp", 2); setSlider("p2Ki", 6); setSlider("p2Kd", 0);
      setSlider("p2tauS", 0.1);
      const s1 = run(0.1, false), a = PID.metrics(s1.t, s1.y, 1);
      setSlider("p2tauS", 0.4);
      const s2 = run(0.4, false), b = PID.metrics(s2.t, s2.y, 1);
      update();
      return "The true overshoot went from " + fmt(a.overshoot, 1) + "% to " + fmt(b.overshoot, 1) +
        "%. The gains did not change, but every correction now comes later, so the output swings further before the controller reacts.";
    }
  });

  ["p2tauS", "p2Kp", "p2Ki", "p2Kd", "p2T"].forEach(id => $(id).addEventListener("input", update));
  window.addEventListener("resize", update);
  update();
})();
