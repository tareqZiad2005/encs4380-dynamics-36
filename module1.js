(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const gain = $("gain");
  const tau = $("tau");
  const amplitude = $("amplitude");
  const inputType = $("inputType");
  const responseCanvas = $("responsePlot");
  const errorCanvas = $("errorPlot");
  const FIXED_TIME_MAX = 50;
  // everything from this line and before was to get the HTML elements and set up the canvas for plotting.

  function parameters() {
    return {
      K: Number(gain.value),
      tau: Number(tau.value),
      A: Number(amplitude.value),
      type: inputType.value
    };
  } //this function just reads the values form the sliders and returns them as an object with properties K, tau, A, and type.

  function format(value, digits = 2) {
    return Number(value).toFixed(digits);
  }

  //now that we have the values we just aply the formulas for the step and ramp responses to get the output at time t.
  function responseAt(t, p) {
    if (p.type === "step") {
      return p.K * p.A * (1 - Math.exp(-t / p.tau));
    }

    return p.K * p.A *
      (t - p.tau * (1 - Math.exp(-t / p.tau)));
  }

  function inputAt(t, p) {
    return p.type === "step"
      ? p.K * p.A
      : p.K * p.A * t;
      //if t then the input is a step function, so the output is just K*A. If t is not then the input is a ramp function, so the output is K*A*t.
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

    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();

    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";

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
        ? top + (bottom - top) * (-Math.log10(tick) / 4)
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
    const { ctx, width, height } = setupCanvas(responseCanvas);

    const margin = {
      left: 70,
      right: 20,
      top: 25,
      bottom: 48
    };

    const tMax = FIXED_TIME_MAX;

const maxY = p.type === "step" ? 10.08 : 486;

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

        ctx.strokeStyle = "#0f766e";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);

        ctx.beginPath();
        ctx.moveTo(px, bounds.bottom);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.setLineDash([]);

        ctx.fillStyle = "#0f766e";
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();

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
    const { ctx, width, height } = setupCanvas(errorCanvas);

    const margin = {
      left: 78,
      right: 20,
      top: 25,
      bottom: 48
    };

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
    $("gainValue").textContent = format(p.K, 1);
    $("tauValue").textContent = format(p.tau, 1) + " s";
    $("amplitudeValue").textContent = format(p.A, 1);
    $("plotMode").textContent = p.type === "step" ? "Step input" : "Ramp input";
    $("atTau").textContent = format(100 * (1 - Math.exp(-1)), 1) + "%";
    $("atThreeTau").textContent = format(100 * (1 - Math.exp(-3)), 1) + "%";
    $("steadyOutput").textContent = format(p.K * p.A);
    $("rampLag").textContent = format(p.tau) + " s";
    $("rampError").textContent = format(p.K * p.A * p.tau);

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

    const valueAtTau = 1 - Math.exp(-1);
const valueAtThreeTau = 1 - Math.exp(-3);

const ok1 = Math.abs(valueAtTau - 0.632) < 0.001;
const ok2 = Math.abs(valueAtThreeTau - 0.950) < 0.001;

$("checkTau").textContent = ok1 ? "PASS" : "CHECK";
$("checkThreeTau").textContent = ok2 ? "PASS" : "CHECK";

$("checkTau").className = "status " + (ok1 ? "pass" : "fail");
$("checkThreeTau").className = "status " + (ok2 ? "pass" : "fail");

$("dash1Value").textContent =
  "Calculated: " + valueAtTau.toFixed(3) + " / " +
  valueAtThreeTau.toFixed(3);

const dash1 = $("dash1");
const ok = ok1 && ok2;

dash1.textContent = ok ? "PASS" : "CHECK";
dash1.className = "status " + (ok ? "pass" : "fail");
  }

  function update() {
    const p = parameters();
    updateMetrics(p);
    drawResponse(p);
    drawError(p);
  }

  [gain, tau, amplitude, inputType].forEach((element) => {
    element.addEventListener("input", update);
    element.addEventListener("change", update);
  });

  $("resetButton").addEventListener("click", () => {
    gain.value = "1";
    tau.value = "2";
    amplitude.value = "1";
    inputType.value = "step";
    update();
  });

  $("checkPrediction").addEventListener("click", () => {
    const answer = $("prediction").value;
    const feedback = $("predictionFeedback");

    if (!answer) {
      feedback.textContent = "Choose a prediction first.";
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

  window.addEventListener("resize", update);
  update();

})();