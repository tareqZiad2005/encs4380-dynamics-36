
(() => {
  "use strict";
  const { $, fmt, show, slider, setSlider } = PID;

  // Each slider shows its value next to its label
  const K = slider("p1K", v => fmt(v, 1));
  const tau = slider("p1tau", v => fmt(v, 1) + " s");
  const zeta = slider("p1zeta", v => fmt(v, 2));
  const wn = slider("p1wn", v => fmt(v, 1) + " rad/s");
  const Kp = slider("p1Kp", v => fmt(v, 1));
  const Ki = slider("p1Ki", v => fmt(v, 1));
  const Kd = slider("p1Kd", v => fmt(v, 2));
  const r = slider("p1r", v => fmt(v, 1));
  const umax = slider("p1umax", v => fmt(v, 1));
  const T = slider("p1T", v => v + " s");

  function plant() {
    return $("p1plant").value === "first"
      ? { type: "first", K: K(), tau: tau() }
      : { type: "second", K: K(), zeta: zeta(), wn: wn() };
  }

  function run() {
    return PID.simulateContinuous({
      plant: plant(),
      setpoint: r(),
      Kp: Kp(), Ki: Ki(), Kd: Kd(),
      uMax: umax(),
      tEnd: T()
    });
  }

  function update() {
    const first = $("p1plant").value === "first";
    $("p1tauBox").classList.toggle("hidden", !first);
    $("p1zetaBox").classList.toggle("hidden", first);
    $("p1wnBox").classList.toggle("hidden", first);

    const p = plant();
    const sim = run();
    const m = PID.metrics(sim.t, sim.y, r());

    // Time spent at the limit and the largest |u|
    const dt = sim.t[1] - sim.t[0];
    let atLimit = 0, upeak = 0;
    sim.u.forEach(u => {
      upeak = Math.max(upeak, Math.abs(u));
      if (Math.abs(u) >= umax() - 1e-9) atLimit += dt;
    });

    // Metric cards
    $("p1rise").textContent = show(m.rise, 3, " s");
    $("p1os").textContent = show(m.overshoot, 1, "%");
    $("p1settle").textContent = show(m.settle, 2, " s");
    $("p1ess").textContent = show(m.essPct, 1, "%");
    $("p1upeak").textContent = fmt(upeak, 2);
    $("p1sat").textContent = fmt(atLimit, 2) + " s";
    const st = $("p1status");
    st.textContent = m.status;
    st.className = m.status === "Settled" ? "good" : m.status === "Unstable" ? "bad" : "warn";

    // Block diagram labels
    $("p1pidText").textContent = PID.gainsLabel(Kp(), Ki(), Kd());
    $("p1limText").textContent = "limit ±" + fmt(umax(), 1);
    $("p1plantText").textContent = PID.plantLabel(p);

    // Output plot with the ±2% band around the final value
    const band = m.settled ? 0.02 * Math.abs(m.yss) : 0;
    PID.plot("p1plot", {
      xMax: T(),
      yLabel: "Output y",
      yCap: [-2 * r(), 3 * r()],
      series: [{ x: sim.t, y: sim.y, color: "#2563eb", width: 2.6 }],
      hLines: [{ y: r(), color: "#94a3b8", label: "r = " + fmt(r(), 1) }],
      band: m.settled ? { lo: m.yss - band, hi: m.yss + band, from: m.settle } : null,
      vLines: m.settle != null && m.settle > 0 ? [{ x: m.settle, color: "#16a34a", label: "ts = " + fmt(m.settle, 2) + " s" }] : []
    });

    // Control signal with its limits
    PID.plot("p1uplot", {
      xMax: T(),
      yLabel: "u",
      yMin: -umax() * 1.15, yMax: umax() * 1.15,
      series: [{ x: sim.t, y: sim.u, color: "#d97706", width: 2.2 }],
      hLines: [
        { y: umax(), color: "#dc2626", label: "+" + fmt(umax(), 1) },
        { y: -umax(), color: "#dc2626", label: "−" + fmt(umax(), 1) }
      ]
    });

    $("p1explain").textContent = explain(p, m, atLimit);
  }

  
  function explain(p, m, atLimit) {
    const parts = [];
    if (m.status === "Unstable") return "The loop is unstable: the oscillation grows. Lower Ki or Kp, or add Kd on the second-order plant.";
    if (Ki() === 0) {
      const essTheory = 100 / (1 + p.K * Kp());
      parts.push("With no I term the loop must keep an error to produce any u: " +
        "e_ss = 1/(1 + K·Kp) = " + fmt(essTheory, 1) + "% of r.");
      if (p.type === "first" && Kd() === 0) {
        parts.push("The closed loop is first order with τ = τ/(1 + K·Kp) = " + fmt(p.tau / (1 + p.K * Kp()), 3) + " s.");
      }
    } else {
      parts.push("The I term keeps growing while any error remains, so the loop only rests at e = 0.");
    }
    if (Kd() > 0 && p.type === "first") parts.push("On a first-order plant D slows the loop rather than damping it.");
    if (Kd() > 0 && p.type === "second") parts.push("D adds damping to the plant's own 2ζωn term, so the oscillation dies faster.");
    if (atLimit > 0.001) parts.push("u sat at its limit for " + fmt(atLimit, 2) + " s, so the response is slower than the linear theory predicts.");
    if (m.status === "Oscillating") parts.push("It has not settled in the time shown; increase the time or add damping.");
    if (m.status === "Still settling") parts.push("It has not reached its final value yet; show more time.");
    return parts.join(" ");
  }

  // Guided tour: P → PI → PID, with the numbers the brief describes
  const tour = {
    1: { plant: "first", K: 1, tau: 1, Kp: 9, Ki: 0, Kd: 0, T: 4,
      text: "Step 1 · P only on the first-order plant (K = 1, τ = 1 s). Kp = 9 makes the loop ten times faster (τ = 0.1 s), but it settles 10% short of the setpoint." },
    2: { plant: "first", K: 1, tau: 1, Kp: 9, Ki: 30, Kd: 0, T: 4,
      text: "Step 2 · Add Ki = 30. The steady-state error is gone. The price is overshoot: the integral keeps pushing until the output has already passed r." },
    3: { plant: "second", K: 1, zeta: 0.5, wn: 2, Kp: 4, Ki: 0, Kd: 0, T: 8,
      text: "Step 3 · Switch to the second-order plant from Module 3 (ζ = 0.5, ωn = 2). P only, Kp = 4: a large overshoot and a 20% error." },
    4: { plant: "second", K: 1, zeta: 0.5, wn: 2, Kp: 4, Ki: 3, Kd: 0, T: 8,
      text: "Step 4 · Add Ki = 3. The error is removed, but the oscillation is still large and settling takes longer." },
    5: { plant: "second", K: 1, zeta: 0.5, wn: 2, Kp: 4, Ki: 3, Kd: 0.8, T: 8,
      text: "Step 5 · Add Kd = 0.8. D reacts to how fast the error is changing and brakes early: overshoot falls from about 40% to under 10%, and it settles faster." }
  };

  function applyPreset(s) {
    $("p1plant").value = s.plant;
    setSlider("p1K", s.K);
    if (s.tau != null) setSlider("p1tau", s.tau);
    if (s.zeta != null) setSlider("p1zeta", s.zeta);
    if (s.wn != null) setSlider("p1wn", s.wn);
    setSlider("p1Kp", s.Kp);
    setSlider("p1Ki", s.Ki);
    setSlider("p1Kd", s.Kd);
    setSlider("p1T", s.T);
    setSlider("p1r", 1);
    setSlider("p1umax", 20);
    update();
  }

  document.querySelectorAll("#p1tour button").forEach(b => {
    b.addEventListener("click", () => {
      const s = tour[b.dataset.step];
      applyPreset(s);
      document.querySelectorAll("#p1tour button").forEach(x => x.classList.toggle("active", x === b));
      $("p1tourText").textContent = s.text;
    });
  });

  // Predict, then check: adding Ki removes the P-only error
  PID.predictBox({
    select: "p1predict", button: "p1predictBtn", feedback: "p1predictFb", correct: "gone",
    apply: () => {
      applyPreset(tour[1]);
      const sim1 = run();
      const before = PID.metrics(sim1.t, sim1.y, 1);
      applyPreset(tour[2]);
      const sim2 = run();
      const after = PID.metrics(sim2.t, sim2.y, 1);
      return "With Ki = 0 the error was " + fmt(before.essPct, 1) + "%; with Ki = 30 it is " +
        fmt(Math.abs(after.essPct), 1) + "%. The integral grows as long as any error is left, so the loop can only stop at e = 0. " +
        "The cost: overshoot went from " + fmt(before.overshoot, 1) + "% to " + fmt(after.overshoot, 1) + "%.";
    }
  });

  ["p1plant", "p1K", "p1tau", "p1zeta", "p1wn", "p1Kp", "p1Ki", "p1Kd", "p1r", "p1umax", "p1T"]
    .forEach(id => $(id).addEventListener("input", update));
  $("p1plant").addEventListener("change", update);
  window.addEventListener("resize", update);
  update();
})();
