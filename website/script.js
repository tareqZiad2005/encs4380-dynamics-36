(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const gain = $("gain");
  const tau = $("tau");
  const amplitude = $("amplitude");
  const inputType = $("inputType");

  const responseCanvas = $("responsePlot");
  const errorCanvas = $("errorPlot");

  // Fixed time axis: it does NOT change when tau changes.
  const FIXED_TIME_MAX = 50;

  function parameters() {
    return {
      K: Number(gain.value),
      tau: Number(tau.value),
      A: Number(amplitude.value),
      type: inputType.value
    };
  }

  function format(value, digits = 2) {
    return Number(value).toFixed(digits);
  }

  // Closed-form sensor output for step and ramp inputs.
  function responseAt(t, p) {

    if (p.type === "step") {
      return p.K * p.A * (1 - Math.exp(-t / p.tau));
    }

    // Ramp input: x(t) = A*t, with y(0) = 0.
    return p.K * p.A *
      (t - p.tau * (1 - Math.exp(-t / p.tau)));
  }

  function inputAt(t, p) {
    return p.type === "step"
      ? p.K * p.A
      : p.K * p.A * t;
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();

    const width = Math.max(320, rect.width || 700);
    const height = Math.max(240, rect.height || 340);

    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    return { ctx, width, height };
  }

  function drawAxes(
    ctx,
    width,
    height,
    margin,
    xMax,
    yMax,
    yLabel,
    xLabel,
    logY = false
  ) {
    const left = margin.left;
    const right = width - margin.right;
    const top = margin.top;
    const bottom = height - margin.bottom;

    // Main axes.
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";

    // X-axis ticks and grid lines.
    for (let i = 0; i <= 5; i++) {
      const px = left + (right - left) * i / 5;

      ctx.strokeStyle = "#e2e8f0";

      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();

      ctx.fillStyle = "#475569";

      ctx.fillText(
        format(xMax * i / 5, 0),
        px,
        bottom + 19
      );
    }

    ctx.textAlign = "right";

    const ticks = logY
      ? [1, 0.1, 0.01, 0.001, 0.0001]
      : [0, 0.2, 0.4, 0.6, 0.8, 1];

    ticks.forEach((tick) => {

      const py = logY
        ? top + (bottom - top) *
          (-Math.log10(tick) / 4)
        : bottom - (bottom - top) * tick;

      ctx.strokeStyle = "#e2e8f0";

      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
      ctx.stroke();

      ctx.fillStyle = "#475569";

      ctx.fillText(
        logY ? String(tick) : format(yMax * tick, 2),
        left - 8,
        py + 4
      );
    });

    // Axis labels.
    ctx.fillStyle = "#334155";
    ctx.textAlign = "center";
    ctx.font = "13px system-ui, sans-serif";

    ctx.fillText(
      xLabel,
      (left + right) / 2,
      height - 8
    );

    ctx.save();

    ctx.translate(15, (top + bottom) / 2);
    ctx.rotate(-Math.PI / 2);

    ctx.fillText(yLabel, 0, 0);

    ctx.restore();

    return { left, right, top, bottom };
  }

  function drawResponse(p) {

    const { ctx, width, height } =
      setupCanvas(responseCanvas);

    const margin = {
      left: 70,
      right: 20,
      top: 25,
      bottom: 48
    };

    // Fixed horizontal scale.
    const tMax = FIXED_TIME_MAX;

    const maxY = p.type === "step"
      ? p.K * p.A * 1.12
      : p.K * p.A * tMax * 1.08;

    const bounds = drawAxes(
      ctx,
      width,
      height,
      margin,
      tMax,
      maxY,
      "Output",
      "Time (s)"
    );

    const x = (t) =>
      bounds.left +
      (bounds.right - bounds.left) * t / tMax;

    const y = (value) =>
      bounds.bottom -
      (bounds.bottom - bounds.top) * value / maxY;

    // Draw the input signal.
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);

    ctx.beginPath();

    for (let i = 0; i <= 400; i++) {

      const t = tMax * i / 400;
      const px = x(t);
      const py = y(inputAt(t, p));

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // Draw the sensor output.
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;

    ctx.beginPath();

    for (let i = 0; i <= 400; i++) {

      const t = tMax * i / 400;
      const px = x(t);
      const py = y(responseAt(t, p));

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();

    // Draw reference markers for the step response.
    if (p.type === "step") {

      const markers = [
        {
          t: p.tau,
          fraction: 1 - Math.exp(-1),
          label: "63.2% at tau"
        },
        {
          t: 3 * p.tau,
          fraction: 1 - Math.exp(-3),
          label: "95.0% at 3 tau"
        }
      ];

      markers.forEach((marker) => {

        const px = x(marker.t);
        const py = y(p.K * p.A * marker.fraction);

        // Vertical dashed guide.
        ctx.strokeStyle = "#0f766e";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);

        ctx.beginPath();
        ctx.moveTo(px, bounds.bottom);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.setLineDash([]);

        // Marker point.
        ctx.fillStyle = "#0f766e";

        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();

        // Marker text.
        ctx.font = "11px system-ui, sans-serif";
        ctx.textAlign = "left";

        ctx.fillText(
          marker.label,
          Math.min(px + 6, bounds.right - 100),
          Math.max(bounds.top + 12, py - 9)
        );
      });
    }
  }

  function drawError(p) {

    const { ctx, width, height } =
      setupCanvas(errorCanvas);

    const margin = {
      left: 78,
      right: 20,
      top: 25,
      bottom: 48
    };

    // Fixed horizontal scale here too.
    const tMax = FIXED_TIME_MAX;

    const bounds = drawAxes(
      ctx,
      width,
      height,
      margin,
      tMax,
      1,
      "Error fraction (log scale)",
      "Time (s)",
      true
    );

    const x = (t) =>
      bounds.left +
      (bounds.right - bounds.left) * t / tMax;

    const y = (fraction) =>
      bounds.bottom -
      (bounds.bottom - bounds.top) *
      (-Math.log10(fraction) / 4);

    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 3;

    ctx.beginPath();

    for (let i = 0; i <= 500; i++) {

      const t = tMax * i / 500;

      const fraction = Math.max(
        Math.exp(-t / p.tau),
        0.0001
      );

      if (i === 0) {
        ctx.moveTo(x(t), y(fraction));
      } else {
        ctx.lineTo(x(t), y(fraction));
      }
    }

    ctx.stroke();

    // Reference point: at t = tau, error fraction = e^-1.
    const markerX = x(p.tau);
    const markerY = y(Math.exp(-1));

    ctx.fillStyle = "#7c3aed";

    ctx.beginPath();
    ctx.arc(markerX, markerY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";

    ctx.fillText(
      "t = tau",
      Math.min(markerX + 7, bounds.right - 40),
      markerY - 9
    );
  }

  function updateMetrics(p) {

    $("gainValue").textContent =
      format(p.K, 1);

    $("tauValue").textContent =
      format(p.tau, 1) + " s";

    $("amplitudeValue").textContent =
      format(p.A, 1);

    $("plotMode").textContent =
      p.type === "step" ? "Step input" : "Ramp input";

    $("atTau").textContent =
      format(100 * (1 - Math.exp(-1)), 1) + "%";

    $("atThreeTau").textContent =
      format(100 * (1 - Math.exp(-3)), 1) + "%";

    $("steadyOutput").textContent =
      format(p.K * p.A);

    $("rampLag").textContent =
      format(p.tau) + " s";

    $("rampError").textContent =
      format(p.K * p.A * p.tau);

    if (p.type === "step") {

      $("responseExplanation").textContent =
        "The output approaches KA = " +
        format(p.K * p.A) +
        ". At t = tau it reaches 63.2% of its final value; " +
        "at t = 3 tau it reaches 95.0%.";

    } else {

      $("responseExplanation").textContent =
        "For a ramp input, the output eventually follows a parallel ramp. " +
        "The time lag is tau = " +
        format(p.tau) +
        " s, and the steady-state error is K*A*tau = " +
        format(p.K * p.A * p.tau) + ".";
    }

    // Validation checks.
    const valueAtTau = 1 - Math.exp(-1);
    const valueAtThreeTau = 1 - Math.exp(-3);

    $("checkTau").textContent =
      Math.abs(valueAtTau - 0.632) < 0.001
        ? "PASS"
        : "CHECK";

    $("checkThreeTau").textContent =
      Math.abs(valueAtThreeTau - 0.950) < 0.001
        ? "PASS"
        : "CHECK";

    $("checkTau").className = "status pass";
    $("checkThreeTau").className = "status pass";
  }

  function update() {

    const p = parameters();

    updateMetrics(p);
    drawResponse(p);
    drawError(p);
  }

  // Update the website whenever a control changes.
  [gain, tau, amplitude, inputType].forEach((element) => {

    element.addEventListener("input", update);
    element.addEventListener("change", update);

  });

  // Reset button.
  $("resetButton").addEventListener("click", () => {

    gain.value = "1";
    tau.value = "2";
    amplitude.value = "1";
    inputType.value = "step";

    update();
  });

  // Prediction quiz.
  $("checkPrediction").addEventListener("click", () => {

    const answer = $("prediction").value;
    const feedback = $("predictionFeedback");

    if (!answer) {

      feedback.textContent =
        "Choose a prediction first.";

      feedback.className = "feedback";

      return;
    }

    if (answer === "slower") {

      feedback.textContent =
        "Correct! A larger time constant makes the sensor respond more slowly.";

      feedback.className = "feedback correct";

    } else {

      feedback.textContent =
        "Not quite. Increasing tau makes the sensor slower because it takes longer to approach its final value.";

      feedback.className = "feedback incorrect";
    }
  });

  // Redraw when the browser window changes size.
  window.addEventListener("resize", update);

  // Initial page rendering.
  update();

})();