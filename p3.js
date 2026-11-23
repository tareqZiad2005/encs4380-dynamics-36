/*
  The controller runs u[k] = Kp·e[k] + Ki·Ts·Σe[j] + Kd·(e[k] − e[k−1])/Ts
  once per sample (PID.simulateDigital in pid-core.js). We compare it with
  the ideal continuous controller, sweep Ts, and generate the Arduino code.
*/
(() => {
  "use strict";
  const { $, fmt, show, slider, setSlider } = PID;

  // The Ts slider moves through these values (a plain slider would makethe small, useful values impossible to pick on a phone)
  const TS_VALUES = [0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.75, 1.0];

  const TsIndex = slider("p3Ts", i => fmt(TS_VALUES[i], 3) + " s");
  const Kp = slider("p3Kp", v => fmt(v, 1));
  const Ki = slider("p3Ki", v => fmt(v, 1));
  const Kd = slider("p3Kd", v => fmt(v, 2));
  const umax = slider("p3umax", v => fmt(v, 1));
  const K = slider("p3K", v => fmt(v, 1));
  const tau = slider("p3tau", v => fmt(v, 1) + " s");
  const Ts = () => TS_VALUES[TsIndex()];
  const aw = () => $("p3aw").checked;
  const tEnd = () => Math.max(6, 4 * tau());

  function settings(ts) {
    return {
      plant: { type: "first", K: K(), tau: tau() },
      setpoint: 1,
      Kp: Kp(), Ki: Ki(), Kd: Kd(),
      Ts: ts, uMax: umax(), uMin: -umax(),
      antiWindup: aw(), tEnd: tEnd()
    };
  }

  function update() {
    const dig = PID.simulateDigital(settings(Ts()));
    const ana = PID.simulateContinuous(settings(0));
    const m = PID.metrics(dig.t, dig.y, 1);

    $("p3os").textContent = show(m.overshoot, 1, "%");
    $("p3settle").textContent = show(m.settle, 2, " s");
    $("p3ess").textContent = show(m.essPct, 1, "%");
    $("p3ratio").textContent = fmt(tau() / Ts(), 0);
    const st = $("p3status");
    st.textContent = m.status;
    st.className = m.status === "Settled" ? "good" : m.status === "Unstable" ? "bad" : "warn";

    PID.plot("p3plot", {
      xMax: tEnd(), yLabel: "Output y", yCap: [-1.5, 3],
      series: [
        { x: ana.t, y: ana.y, color: "#94a3b8", width: 2, dash: [6, 5] },
        { x: dig.t, y: dig.y, color: "#2563eb", width: 2.6 }
      ],
      hLines: [{ y: 1, color: "#94a3b8", label: "r = 1" }]
    });

    PID.plot("p3uplot", {
      xMax: tEnd(), yLabel: "u",
      yMin: -umax() * 1.15, yMax: umax() * 1.15,
      series: [{ x: dig.tk, y: dig.uk, color: "#d97706", width: 2, step: true, dots: dig.tk.length <= 200 }],
      hLines: [
        { y: umax(), color: "#dc2626", label: "+" + fmt(umax(), 1) },
        { y: -umax(), color: "#dc2626", label: "−" + fmt(umax(), 1) }
      ]
    });

    $("p3explain").textContent = explain(m, dig);

    $("p3code").textContent = PID.arduinoCode({
      title: "P3 digital PID", Kp: Kp(), Ki: Ki(), Kd: Kd(), Ts: Ts(),
      uMin: -umax(), uMax: umax(), antiWindup: aw(), setpoint: 1
    });

    scheduleSweep();
  }

  function explain(m, dig) {
    const saturated = dig.uk.some(u => Math.abs(u) >= umax() - 1e-9);
    const parts = [];
    parts.push("The controller samples " + fmt(tau() / Ts(), 0) + " times per plant time constant.");
    if (m.status === "Unstable") {
      parts.push("That is too few: between samples the controller is blind, so it holds a push that is already wrong. The loop breaks.");
      if (K() * Kd() / tau() > 0.8) parts.push("Kd is also large: (e[k] − e[k−1])/Ts turns every small jump between samples into a big kick.");
    } else if (m.status !== "Settled") {
      parts.push("The response oscillates. Shorten Ts or lower the gains.");
    } else if (tau() / Ts() < 10) {
      parts.push("Below about 10 samples per τ the stair steps become coarse and the overshoot grows (compare with the grey ideal curve).");
    } else {
      parts.push("That is fast enough for the digital loop to behave almost like the ideal one.");
    }
    if (saturated) {
      parts.push(aw()
        ? "u hits its limit; anti-windup stops the sum from growing meanwhile, so there is no stored-up push afterwards."
        : "u hits its limit, but the sum keeps growing while it is stuck (windup). That stored push makes the output overshoot. Turn on anti-windup.");
    }
    return parts.join(" ");
  }

  let sweepTimer = null;
  function scheduleSweep() {
    clearTimeout(sweepTimer);
    sweepTimer = setTimeout(sweep, 120);
  }

  function sweep() {
    const xs = [], ys = [];
    let firstBad = null;
    TS_VALUES.forEach(ts => {
      const s = PID.simulateDigital(settings(ts));
      const m = PID.metrics(s.t, s.y, 1);
      if (m.status === "Settled") { xs.push(ts); ys.push(m.overshoot); }
      else if (firstBad == null) firstBad = ts;
    });
    const top = Math.max(10, ...ys) * 1.15;
    const cur = PID.metrics(...pick(PID.simulateDigital(settings(Ts()))));
    PID.plot("p3sweep", {
      xMax: 1, xLabel: "Sampling time Ts (s)", yLabel: "Overshoot (%)",
      yMin: 0, yMax: top,
      series: [{ x: xs, y: ys, color: "#2563eb", width: 2.4, dots: true }],
      band: firstBad != null ? { lo: 0, hi: top, from: firstBad, color: "rgba(220,38,38,0.10)" } : null,
      points: cur.status === "Settled"
        ? [{ x: Ts(), y: cur.overshoot, color: "#d97706", label: "Ts = " + fmt(Ts(), 3) + " s" }]
        : [{ x: Ts(), y: top * 0.9, color: "#dc2626", label: "does not settle" }]
    });
  }

  // [t, y, r] in the order PID.metrics expects
  function pick(sim) { return [sim.t, sim.y, 1]; }

  function reset() {
    setSlider("p3Ts", 2); setSlider("p3Kp", 4); setSlider("p3Ki", 6); setSlider("p3Kd", 0.1);
    setSlider("p3umax", 2); setSlider("p3K", 1); setSlider("p3tau", 1);
    $("p3aw").checked = false;
  }

  $("p3reset").addEventListener("click", () => { reset(); update(); });
  $("p3copy").addEventListener("click", () => PID.copyText($("p3code").textContent, $("p3copy")));

  PID.predictBox({
    select: "p3predict", button: "p3predictBtn", feedback: "p3predictFb", correct: "more",
    apply: () => {
      reset();
      setSlider("p3Ts", TS_VALUES.indexOf(0.02));
      const a = PID.metrics(...pick(PID.simulateDigital(settings(0.02))));
      setSlider("p3Ts", TS_VALUES.indexOf(0.3));
      const b = PID.metrics(...pick(PID.simulateDigital(settings(0.3))));
      update();
      return "Overshoot went from " + show(a.overshoot, 1, "%") + " at Ts = 0.02 s to " + show(b.overshoot, 1, "%") +
        " at Ts = 0.3 s. Holding u for longer is like adding a delay of about Ts/2, and delay in a loop always costs damping.";
    }
  });

  PID.predictBox({
    select: "p3predict2", button: "p3predict2Btn", feedback: "p3predict2Fb", correct: "less",
    apply: () => {
      reset();
      const a = PID.metrics(...pick(PID.simulateDigital(settings(0.02))));
      $("p3aw").checked = true;
      const b = PID.metrics(...pick(PID.simulateDigital(settings(0.02))));
      update();
      return "Overshoot went from " + show(a.overshoot, 1, "%") + " to " + show(b.overshoot, 1, "%") +
        ". Without anti-windup the sum kept growing while u was stuck at 2, and that stored push had to be unwound by overshooting.";
    }
  });

  ["p3Ts", "p3Kp", "p3Ki", "p3Kd", "p3umax", "p3K", "p3tau"].forEach(id => $(id).addEventListener("input", update));
  $("p3aw").addEventListener("change", update);
  window.addEventListener("resize", update);
  update();
})();
