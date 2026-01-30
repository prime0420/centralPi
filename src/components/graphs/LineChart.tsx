import React from "react";

type Props = {
  counts: number[];
  startMinute?: number; // minutes from 12AM (midnight) base (0..1440)
  width?: number;
  height?: number;
  threshold?: number;
  yTickFontSize?: number | string;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

// base is 12:00 AM (midnight)
function formatTimeFromMidnight(minFromMidnight: number) {
  const total = minFromMidnight; // minutes from midnight
  let h24 = Math.floor(total / 60);
  const m = total % 60;

  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;

  return `${h12}:${pad2(m)} ${ampm}`;
}

// windowMinutes: 180 => step 30, 60 => step 10
function pickTickStep(windowMinutes: number) {
  const minW = 60;
  const maxW = 180;

  const t = clamp((windowMinutes - minW) / (maxW - minW), 0, 1);
  const raw = 10 + t * (30 - 10); // 10..30

  // snap to "nice" steps used in your spec
  const nice = [10, 15, 20, 30];
  let best = nice[0];
  let bestDist = Infinity;
  for (const s of nice) {
    const d = Math.abs(s - raw);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export default function LineChart({
  counts,
  startMinute = 0,
  width = 880,
  height = 160,
  threshold = 17,
  yTickFontSize = 11,
}: Props) {
  if (!counts || counts.length === 0) return <svg width={width} height={height} />;

  const leftMargin = 56;
  const rightMargin = 8;
  const topMargin = 18;

  // give room for timebar exactly
  const timebarHeight = 28;
  const bottomMargin = timebarHeight;

  const plotWidth = Math.max(20, width - leftMargin - rightMargin);
  const plotHeight = Math.max(20, height - topMargin - bottomMargin);

  const maxCount = Math.max(...counts.map(c => (typeof c === 'number' ? c : 0)));
  const niceMax = Math.max(30, Math.ceil(maxCount / 10) * 10);
  const maxTick = niceMax;

  const n = counts.length;
  const denom = Math.max(1, n - 1);
  const stepX = plotWidth / denom;

  const points = counts.map((v, i) => {
    const vClamped = Math.min(v, maxTick);
    return {
      x: leftMargin + i * stepX,
      y: topMargin + ((maxTick - vClamped) / maxTick) * plotHeight,
      v,
    };
  });

  // line segments colored by threshold
  const segments: JSX.Element[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i],
      p2 = points[i + 1];
    const v1 = counts[i],
      v2 = counts[i + 1];

    const sameSide =
      (v1 > threshold && v2 > threshold) || (v1 <= threshold && v2 <= threshold);

    if (sameSide) {
      const color = (v1 + v2) / 2 > threshold ? "#fff" : "#f2c94c";
      segments.push(
        <line
          key={i}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      );
    } else {
      const t = (threshold - v1) / (v2 - v1);
      const xCross = p1.x + t * (p2.x - p1.x);
      const yCross = topMargin + ((maxTick - threshold) / maxTick) * plotHeight;

      const color1 = v1 > threshold ? "#fff" : "#e7f154";
      const color2 = v2 > threshold ? "#fff" : "#e7f154";

      segments.push(
        <line
          key={`${i}-a`}
          x1={p1.x}
          y1={p1.y}
          x2={xCross}
          y2={yCross}
          stroke={color1}
          strokeWidth={2}
          strokeLinecap="round"
        />
      );
      segments.push(
        <line
          key={`${i}-b`}
          x1={xCross}
          y1={yCross}
          x2={p2.x}
          y2={p2.y}
          stroke={color2}
          strokeWidth={2}
          strokeLinecap="round"
        />
      );
    }
  }

  // y-axis ticks: choose 4 horizontal ticks (including 0 and maxTick)
  const yTicks: JSX.Element[] = [];
  const yTickCount = 4;
  for (let i = 0; i <= yTickCount; i++) {
    const t = Math.round((maxTick * i) / yTickCount);
    const y = topMargin + ((maxTick - t) / maxTick) * plotHeight;
    yTicks.push(
      <text
        key={`yt-${t}`}
        x={leftMargin - 8}
        y={y + 4}
        fill="#9aa6b2"
        fontSize={yTickFontSize}
        textAnchor="end"
      >
        {t}
      </text>
    );
    yTicks.push(
      <line
        key={`ytl-${t}`}
        x1={leftMargin - 4}
        y1={y}
        x2={leftMargin + plotWidth}
        y2={y}
        stroke="#1f2326"
        strokeWidth={1}
      />
    );
  }

  const thresholdY = topMargin + ((maxTick - threshold) / maxTick) * plotHeight;

  // --------- TIMEBAR ----------
  const windowMinutes = counts.length; // since you slice by minutes
  const tickStep = pickTickStep(windowMinutes);

  // absolute window bounds within full 24-hour day (0..1440 minutes)
  const windowStartAbs = clamp(startMinute, 0, 1440);
  const windowEndAbs = clamp(startMinute + (counts.length - 1), 0, 1440);

  const ticks: JSX.Element[] = [];

  // first tick aligned to global step
  const firstTick =
    Math.ceil(windowStartAbs / tickStep) * tickStep;

  for (let tm = firstTick; tm <= windowEndAbs; tm += tickStep) {
    const frac = denom === 0 ? 0 : (tm - windowStartAbs) / denom;
    const x = leftMargin + frac * plotWidth;

    // vertical guide (like your design)
    ticks.push(
      <line
        key={`xg-${tm}`}
        x1={x}
        y1={topMargin}
        x2={x}
        y2={topMargin + plotHeight}
        stroke="#14181b"
        strokeWidth={1}
      />
    );

    // tick mark (bottom)
    ticks.push(
      <line
        key={`xt-${tm}`}
        x1={x}
        y1={topMargin + plotHeight + 2}
        x2={x}
        y2={topMargin + plotHeight + 8}
        stroke="#3a4248"
        strokeWidth={1}
      />
    );

    // label
    ticks.push(
      <text
        key={`xl-${tm}`}
        x={x}
        y={topMargin + plotHeight + 22}
        fill="#c9d1d9"
        fontSize={11}
        textAnchor="middle"
      >
        {formatTimeFromMidnight(tm)}
      </text>
    );
  }

  return (
    <div>
      <div style={{marginLeft:'8px', paddingLeft:'18px', borderBottom:'1.5px solid #22C55E', width:'120px', paddingBottom:'4px', marginBottom:'4px'}}>
        <text x={8} y={14} fill="#cfe6df"  fontSize={12}>
          Pcs/min
        </text>
      </div>
      <svg width={width} height={height} style={{ background: "#000000" }}>

      

      {/* y axis ticks + horizontal grid */}
      {yTicks}

      {/* threshold dotted line */}
      <line
        x1={leftMargin}
        y1={thresholdY}
        x2={leftMargin + plotWidth}
        y2={thresholdY}
        stroke="#fff"
        strokeWidth={1}
        strokeDasharray="2,6"
        opacity={0.9}
      />

      {/* x ticks vertical guides (behind data) */}
      {ticks}

      {/* line segments */}
      {segments}

      {/* points */}
      {points.map((p, idx) => (
        <circle
          key={`pt-${idx}`}
          cx={p.x}
          cy={p.y}
          r={1.2}
          fill={counts[idx] > threshold ? "#fff" : "#f1e60e"}
        />
      ))}

      {/* bottom baseline (red like the design) */}
      {/* <line
        x1={leftMargin}
        y1={topMargin + plotHeight + 10}
        x2={leftMargin + plotWidth}
        y2={topMargin + plotHeight + 10}
        stroke="#ff2d2d"
        strokeWidth={2}
        opacity={0.9}
      /> */}
    </svg>
    </div>
    
  );
}
