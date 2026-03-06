/**
 * verletPhysics — 2D Verlet integration physics system.
 * Pure JS, no GL dependency.
 */

export function createVerletSystem(options = {}) {
  const gravity = options.gravity ?? [0, 980];
  const damping = options.damping ?? 0.99;
  const iterations = options.iterations ?? 4;
  const bounds = options.bounds ?? null; // { x, y, w, h } or null

  let nextPointId = 0;
  let nextConstraintId = 0;
  const points = new Map();
  const constraints = new Map();

  return {
    addPoint(x, y, pinned = false) {
      const id = nextPointId++;
      points.set(id, { x, y, px: x, py: y, pinned });
      return id;
    },

    addConstraint(id1, id2, dist) {
      const p1 = points.get(id1);
      const p2 = points.get(id2);
      if (!p1 || !p2) return -1;
      if (dist == null) {
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        dist = Math.sqrt(dx * dx + dy * dy);
      }
      const id = nextConstraintId++;
      constraints.set(id, { p1: id1, p2: id2, dist });
      return id;
    },

    removePoint(id) {
      points.delete(id);
      // Remove constraints referencing this point
      for (const [cid, c] of constraints) {
        if (c.p1 === id || c.p2 === id) constraints.delete(cid);
      }
    },

    removeConstraint(id) {
      constraints.delete(id);
    },

    step(dt) {
      // Verlet integration
      for (const p of points.values()) {
        if (p.pinned) continue;
        const vx = (p.x - p.px) * damping;
        const vy = (p.y - p.py) * damping;
        p.px = p.x;
        p.py = p.y;
        p.x += vx + gravity[0] * dt * dt;
        p.y += vy + gravity[1] * dt * dt;
      }

      // Constraint relaxation
      for (let iter = 0; iter < iterations; iter++) {
        for (const c of constraints.values()) {
          const a = points.get(c.p1);
          const b = points.get(c.p2);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const currentDist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const diff = (c.dist - currentDist) / currentDist * 0.5;
          const ox = dx * diff;
          const oy = dy * diff;
          if (!a.pinned) { a.x -= ox; a.y -= oy; }
          if (!b.pinned) { b.x += ox; b.y += oy; }
        }

        // Bounds constraint
        if (bounds) {
          const { x: bx, y: by, w: bw, h: bh } = bounds;
          for (const p of points.values()) {
            if (p.pinned) continue;
            if (p.x < bx) p.x = bx;
            if (p.x > bx + bw) p.x = bx + bw;
            if (p.y < by) p.y = by;
            if (p.y > by + bh) p.y = by + bh;
          }
        }
      }
    },

    getPoints() {
      const result = [];
      for (const [id, p] of points) {
        result.push({ id, x: p.x, y: p.y, px: p.px, py: p.py, pinned: p.pinned });
      }
      return result;
    },

    getConstraints() {
      const result = [];
      for (const [id, c] of constraints) {
        result.push({ id, p1: c.p1, p2: c.p2, dist: c.dist });
      }
      return result;
    },

    clear() {
      points.clear();
      constraints.clear();
      nextPointId = 0;
      nextConstraintId = 0;
    },
  };
}
