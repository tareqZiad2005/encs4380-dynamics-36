(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const fmt = (v, d = 2) => Number(v).toFixed(d);

  let sensor = null;
  let score = 0, rounds = 0, revealed = false;

  function noise() {
    return (Math.random() - 0.5) * 0.025;
  }

  function first(t, s) {
    return s.K * (1 - Math.exp(-t / s.tau));
  }

  function second(t, s) {
    let z = s.zeta, w = s.wn, K = s.K;

    if (z < 1) {
      let wd = w * Math.sqrt(1 - z * z);
      let th = Math.acos(z);

      return K * (
        1 - Math.exp(-z * w * t) /
        Math.sqrt(1 - z * z) * Math.sin(wd * t + th)
      );
    }

    if (Math.abs(z - 1) < 1e-6) {
      return K * (1 - (1 + w * t) * Math.exp(-w * t));
    }

    let a = -w * (z - Math.sqrt(z * z - 1));
    let b = -w * (z + Math.sqrt(z * z - 1));

    return K * (
      1 + (b * Math.exp(a * t) - a * Math.exp(b * t)) / (a - b)
    );
  }

  function canvas(id) {
    let c = $(id);
    let r = c.getBoundingClientRect();
    let w = Math.max(320, r.width || 700);
    let h = Math.max(220, r.height || 330);
    let d = window.devicePixelRatio || 1;

    c.width = w * d;
    c.height = h * d;

    let x = c.getContext("2d");
    x.setTransform(d, 0, 0, d, 0, 0);

    return { x, w, h };
  }

  function draw(id, series, tmax, ymax) {
    let c = canvas(id);
    let ctx = c.x;
    let L = 55, R = c.w - 15;
    let T = 15, B = c.h - 38;

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

      ctx.strokeStyle = "#e8edf3";
      ctx.beginPath();
      ctx.moveTo(x, T);
      ctx.lineTo(x, B);
      ctx.stroke();

      ctx.fillText(fmt(tmax * i / 5, 1), x, B + 17);
    }

    series.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width || 2.3;
      ctx.beginPath();

      s.points.forEach((p, i) => {
        let x = L + (R - L) * p[0] / tmax;
        let y = B - (B - T) * p[1] / ymax;

        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });

      ctx.stroke();
    });

    ctx.fillStyle = "#64748b";
    ctx.fillText("Time (s)", (L + R) / 2, c.h - 4);
  }

  function makeSensor() {
    let isFirst = Math.random() < 0.55;

    if (isFirst) {
      sensor = {
        type: "first",
        tau: +(0.5 + Math.random() * 4.5).toFixed(2),
        K: +(0.7 + Math.random() * 1.8).toFixed(2),
        tmax: 12
      };
    } else {
      sensor = {
        type: "second",
zeta: +(0.2 + Math.random() * 0.7).toFixed(2),
        wn: +(1 + Math.random() * 3.5).toFixed(2),
        K: +(0.7 + Math.random() * 1.8).toFixed(2),
        tmax: 8
      };
    }

    revealed = false;

    $("m4kind").textContent = isFirst
      ? "First-order mystery sensor"
      : "Second-order mystery sensor";

    $("m4firstGuess").classList.toggle("hidden", !isFirst);
    $("m4secondGuess").classList.toggle("hidden", isFirst);
    $("m4reveal").classList.add("hidden");

    $("m4result").textContent =
      "Study the response and enter your estimate.";

    $("m4result").className = "feedback";

    $("m4hint").textContent = isFirst
      ? "Hint: For a first-order step response, τ is the time at which the output reaches 63.2% of its final value."
      : "Hint: Overshoot depends only on ζ. Peak time is π/(ωn√(1−ζ²)) for an underdamped response.";

    drawMystery();
  }

  function drawMystery() {
    let pts = [];
    let fn = sensor.type === "first" ? first : second;

    for (let i = 0; i <= 240; i++) {
      let t = sensor.tmax * i / 240;
      let y = fn(t, sensor);

      pts.push([t, Math.max(0, y + noise())]);
    }

    sensor.observed = pts;

    let ymax = sensor.K * 1.35;

    draw(
      "m4plot",
      [{ points: pts, color: "#64748b", width: 2 }],
      sensor.tmax,
      ymax
    );
  }

  function compare() {
    let fn = sensor.type === "first" ? first : second;
    let actual = [], guess = [];

    let g = sensor.type === "first"
      ? {
          K: +$("m4kGuess").value,
          tau: +$("m4tauGuess").value
        }
      : {
          K: sensor.K,
          zeta: +$("m4zetaGuess").value,
          wn: +$("m4wnGuess").value
        };

    for (let i = 0; i <= 240; i++) {
      let t = sensor.tmax * i / 240;

      actual.push([t, fn(t, sensor)]);
      guess.push([t, fn(t, g)]);
    }

    draw(
      "m4compare",
      [
        { points: actual, color: "#16a34a", width: 2.8 },
        { points: guess, color: "#2563eb", width: 2.8 }
      ],
      sensor.tmax,
      sensor.K * 1.35
    );
  }

  function pctError(g, t) {
    return Math.abs(g - t) / Math.abs(t) * 100;
  }

  function submit() {
    if (revealed) return;

    let parts = [], errors = [];

    if (sensor.type === "first") {
      let tg = +$("m4tauGuess").value;
      let kg = +$("m4kGuess").value;

      if (!(tg > 0 && kg > 0)) {
        $("m4result").textContent =
          "Enter positive estimates for τ and K.";
        return;
      }

      errors = [
        pctError(tg, sensor.tau),
        pctError(kg, sensor.K)
      ];

      parts = [
        "τ: " + fmt(tg) + " s (true " + fmt(sensor.tau) + " s)",
        "K: " + fmt(kg) + " (true " + fmt(sensor.K) + ")"
      ];
    } else {
      let zg = +$("m4zetaGuess").value;
      let wg = +$("m4wnGuess").value;

      if (!(zg > 0 && wg > 0)) {
        $("m4result").textContent =
          "Enter positive estimates for ζ and ωn.";
        return;
      }

      errors = [
        pctError(zg, sensor.zeta),
        pctError(wg, sensor.wn)
      ];

      parts = [
        "ζ: " + fmt(zg) + " (true " + fmt(sensor.zeta) + ")",
        "ωn: " + fmt(wg) + " rad/s (true " + fmt(sensor.wn) + " rad/s)"
      ];
    }

    let points = errors.filter(e => e <= 10).length;

    score += points;
    rounds++;

    $("m4score").textContent = score + " / " + (rounds * 2);

    $("m4result").textContent =
      parts.join(" · ") + " | " + points +
      "/2 parameters within 10%.";

    $("m4result").className =
      "feedback " + (points === 2 ? "correct" : "incorrect");

    $("m4trueValues").textContent = parts.join(" · ");
    $("m4reveal").classList.remove("hidden");

    revealed = true;
    compare();
  }

  $("m4submit").addEventListener("click", submit);
  $("m4new").addEventListener("click", makeSensor);

  $("m4hintButton").addEventListener("click", () =>
    $("m4hint").classList.toggle("hidden")
  );

  window.addEventListener("resize", () => {
    if (sensor) {
      drawMystery();

      if (revealed) compare();
    }
  });

  makeSensor();
})();