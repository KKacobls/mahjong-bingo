const TAU = Math.PI * 2;

export function createBodies({ count, width, height, tileWidth, tileHeight, random }) {
  return Array.from({ length: count }, (_, index) => ({
    x: tileWidth + random() * Math.max(0, width - tileWidth * 2),
    y: tileHeight + random() * Math.max(0, height - tileHeight * 2),
    angle: random() * TAU,
    vx: (random() - .5) * 100,
    vy: (random() - .5) * 80,
    spin: (random() - .5) * 3,
    halfWidth: tileWidth / 2,
    halfHeight: tileHeight / 2,
    phase: random() * TAU + index,
  }));
}

function collide(a, b) {
  const ax = { x: Math.cos(a.angle), y: Math.sin(a.angle) };
  const ay = { x: -ax.y, y: ax.x };
  const bx = { x: Math.cos(b.angle), y: Math.sin(b.angle) };
  const by = { x: -bx.y, y: bx.x };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let overlap = Infinity;
  let normal = null;
  for (const axis of [ax, ay, bx, by]) {
    const radiusA = a.halfWidth * Math.abs(ax.x * axis.x + ax.y * axis.y) + a.halfHeight * Math.abs(ay.x * axis.x + ay.y * axis.y);
    const radiusB = b.halfWidth * Math.abs(bx.x * axis.x + bx.y * axis.y) + b.halfHeight * Math.abs(by.x * axis.x + by.y * axis.y);
    const distance = dx * axis.x + dy * axis.y;
    const penetration = radiusA + radiusB + 1.5 - Math.abs(distance);
    if (penetration <= 0) return;
    if (penetration < overlap) { overlap = penetration; normal = { x: axis.x * Math.sign(distance || 1), y: axis.y * Math.sign(distance || 1) }; }
  }
  const correction = Math.max(0, overlap - .15) * .48;
  a.x -= normal.x * correction;
  a.y -= normal.y * correction;
  b.x += normal.x * correction;
  b.y += normal.y * correction;
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velocity = rvx * normal.x + rvy * normal.y;
  if (velocity >= 0) return;
  const impulse = -velocity * .64;
  a.vx -= impulse * normal.x;
  a.vy -= impulse * normal.y;
  b.vx += impulse * normal.x;
  b.vy += impulse * normal.y;
  const tangent = rvx * -normal.y + rvy * normal.x;
  a.spin += tangent * .0025;
  b.spin -= tangent * .0025;
}

function constrain(body, width, height) {
  const extentX = Math.abs(Math.cos(body.angle)) * body.halfWidth + Math.abs(Math.sin(body.angle)) * body.halfHeight + 2;
  const extentY = Math.abs(Math.sin(body.angle)) * body.halfWidth + Math.abs(Math.cos(body.angle)) * body.halfHeight + 2;
  if (body.x < extentX) { body.x = extentX; body.vx = Math.abs(body.vx) * .35; }
  if (body.x > width - extentX) { body.x = width - extentX; body.vx = -Math.abs(body.vx) * .35; }
  if (body.y < extentY) { body.y = extentY; body.vy = Math.abs(body.vy) * .35; }
  if (body.y > height - extentY) { body.y = height - extentY; body.vy = -Math.abs(body.vy) * .35; }
}

export function stepBodies(bodies, { width, height, dt, time = 0, driving = false }) {
  for (const body of bodies) {
    if (driving) {
      // Two opposing sweeps imitate hands pushing tiles through the middle.
      for (let hand = 0; hand < 2; hand += 1) {
        const phase = time * 4.1 + hand * Math.PI;
        const hx = width * (.5 + Math.cos(phase) * .28);
        const hy = height * (.5 + Math.sin(phase * 1.17) * .24);
        const distance = Math.hypot(body.x - hx, body.y - hy);
        const influence = Math.exp(-distance * distance / (width * height * .055));
        body.vx += (-Math.sin(phase) * width * 3.1 + (body.x - hx) * 3) * influence * dt;
        body.vy += (Math.cos(phase * 1.17) * height * 3.4 + (body.y - hy) * 3) * influence * dt;
        body.spin += Math.sin(body.phase + phase) * influence * dt * 13;
      }
    }
    const drag = Math.exp(-(driving ? 1.2 : 6.5) * dt);
    body.vx *= drag;
    body.vy *= drag;
    body.spin *= Math.exp(-(driving ? 2 : 9) * dt);
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.angle += Math.max(-5, Math.min(5, body.spin)) * dt;
  }
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) collide(bodies[i], bodies[j]);
    }
    for (const body of bodies) constrain(body, width, height);
  }
}
