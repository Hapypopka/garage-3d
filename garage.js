// Модель гаража: общая для 3D-конструктора (index.html) и AR (ar.html). Все размеры в метрах.
import * as THREE from "three";

export const COLORS = [
  ["Графит", "#383c42"], ["Шоколад", "#5b3b2b"], ["Сигнальный синий", "#2c5a8c"], ["Зелёный мох", "#2e5e41"],
  ["Вишня", "#7b2431"], ["Серый шёлк", "#a3a8ad"], ["Слоновая кость", "#e2d8bf"],
];

const WAVE = 0.225;  // шаг волны профлиста
const AMP = 0.022;   // половина высоты волны

// трапециевидный профиль: верх, скос, низ, скос
function waveZ(x, amp) {
  const t = (((x / WAVE) % 1) + 1) % 1;
  if (t < 0.35) return amp;
  if (t < 0.5) return amp * (1 - ((t - 0.35) / 0.15) * 2);
  if (t < 0.85) return -amp;
  return -amp + amp * 2 * ((t - 0.85) / 0.15);
}

// лист профнастила от x1 до x2, снизу bot(x), сверху top(x); волна по z
export function corrugated(x1, x2, bot, top, amp = AMP) {
  const xs = new Set([x1, x2]);
  if (x1 < 0 && x2 > 0) xs.add(0);
  for (let k = Math.floor(x1 / WAVE) - 1; k <= Math.ceil(x2 / WAVE) + 1; k++) {
    for (const f of [0, 0.35, 0.5, 0.85]) {
      const v = (k + f) * WAVE;
      if (v > x1 && v < x2) xs.add(v);
    }
  }
  const arr = [...xs].sort((a, b) => a - b);
  const pos = [];
  for (let i = 0; i < arr.length - 1; i++) {
    const a = arr[i], b = arr[i + 1];
    const za = waveZ(a, amp), zb = waveZ(b, amp);
    const a0 = bot(a), a1 = top(a), b0 = bot(b), b1 = top(b);
    pos.push(a, a0, za, b, b0, zb, b, b1, zb, a, a0, za, b, b1, zb, a, a1, za);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function makeMaterials() {
  const metal = (o) => new THREE.MeshPhysicalMaterial({ metalness: 0.55, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.35, ...o });
  return {
    wall: metal({ side: THREE.DoubleSide }),
    roof: metal({ side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: "#e8e8e6", metalness: 0.5, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: "#2a2c30", metalness: 0.6, roughness: 0.4 }),
    slab: new THREE.MeshStandardMaterial({ color: "#a5a29a", roughness: 0.95 }),
    paving: new THREE.MeshStandardMaterial({ color: "#8e8b86", roughness: 0.9 }),
    sect: new THREE.MeshStandardMaterial({ color: "#f3f3f0", metalness: 0.2, roughness: 0.45 }),
    roll: metal({ color: "#c7cacf", side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ color: "#fff4d6", emissive: "#ffd28a", emissiveIntensity: 0 }),
    floorIn: new THREE.MeshStandardMaterial({ color: "#6f6d69", roughness: 0.8 }),
  };
}

export function setColor(mats, hex) {
  const c = new THREE.Color(hex);
  mats.wall.color.copy(c);
  mats.roof.color.copy(c).multiplyScalar(0.82);
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function pipe(a, b, r, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 12), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export const SLAB_H = 0.15;

// s: {w, l, h, gate}. Возвращает группу и ручки для анимаций.
export function buildGarage(s, mats, roofK = 1.15) {
  const { w, l, h } = s;
  const g = new THREE.Group();
  const Y = SLAB_H;

  // плита и подъезд
  const slab = box(w + 0.6, Y, l + 0.6, mats.slab); slab.position.y = Y / 2; g.add(slab);
  const inner = box(w - 0.05, 0.01, l - 0.05, mats.floorIn); inner.position.y = Y + 0.005; g.add(inner);

  const gw = Math.min(w - 0.9, 3.5);
  const gh = Math.min(h - 0.55, 2.5);
  const drive = box(gw + 1.4, 0.06, 4, mats.paving); drive.position.set(0, 0.03, l / 2 + 0.3 + 2); g.add(drive);

  // крыша: двускатная вдоль длины
  const ang = Math.acos(Math.min(1 / roofK, 0.999));
  const tan = Math.tan(ang), over = 0.3;
  const rise = (w / 2) * tan;
  const gable = (x) => h + rise * Math.max(0, 1 - Math.abs(x) / (w / 2));
  const flat = () => h, zero = () => 0;

  const add = (geo, mat, fn) => { const m = new THREE.Mesh(geo, mat); fn(m); g.add(m); return m; };

  // боковые стены
  add(corrugated(-l / 2, l / 2, zero, flat), mats.wall, (m) => { m.rotation.y = Math.PI / 2; m.position.set(w / 2, Y, 0); });
  add(corrugated(-l / 2, l / 2, zero, flat), mats.wall, (m) => { m.rotation.y = -Math.PI / 2; m.position.set(-w / 2, Y, 0); });
  // задняя стена с фронтоном
  add(corrugated(-w / 2, w / 2, zero, gable), mats.wall, (m) => { m.rotation.y = Math.PI; m.position.set(0, Y, -l / 2); });
  // передняя стена: слева, справа и над воротами — с фронтоном
  add(corrugated(-w / 2, -gw / 2, zero, gable), mats.wall, (m) => m.position.set(0, Y, l / 2));
  add(corrugated(gw / 2, w / 2, zero, gable), mats.wall, (m) => m.position.set(0, Y, l / 2));
  add(corrugated(-gw / 2, gw / 2, () => gh, gable), mats.wall, (m) => m.position.set(0, Y, l / 2));

  // скаты
  const half = w / 2 + over, slope = half / Math.cos(ang), top = Y + h + rise;
  const eaveY = top - half * tan;
  for (const sgn of [-1, 1]) {
    add(corrugated(-l / 2 - over, l / 2 + over, zero, () => slope, 0.03), mats.roof, (m) => {
      m.rotation.order = "YXZ"; m.rotation.y = sgn * Math.PI / 2; m.rotation.x = -(Math.PI / 2 - ang);
      m.position.set(sgn * half, eaveY, 0);
    });
    // водосток: жёлоб + труба у задней стены
    const gut = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, l + over * 2, 14), mats.trim);
    gut.rotation.x = Math.PI / 2; gut.position.set(sgn * (half + 0.02), eaveY - 0.03, 0); g.add(gut);
    const px = sgn * (w / 2 + 0.07), pz = -l / 2 + 0.25;
    g.add(pipe(new THREE.Vector3(sgn * (half + 0.02), eaveY - 0.05, pz), new THREE.Vector3(px, eaveY - 0.45, pz), 0.04, mats.trim));
    g.add(pipe(new THREE.Vector3(px, eaveY - 0.45, pz), new THREE.Vector3(px, 0.22, pz), 0.04, mats.trim));
    g.add(pipe(new THREE.Vector3(px, 0.22, pz), new THREE.Vector3(px + sgn * 0.2, 0.08, pz), 0.04, mats.trim));
  }
  const ridge = box(0.16, 0.16, l + over * 2 + 0.02, mats.roof);
  ridge.rotation.z = Math.PI / 4; ridge.position.set(0, top - 0.04, 0); g.add(ridge);

  // уголки на рёбрах стен
  for (const [x, z] of [[-w / 2, l / 2], [w / 2, l / 2], [-w / 2, -l / 2], [w / 2, -l / 2]]) {
    const c = box(0.08, h, 0.08, mats.trim); c.position.set(x, Y + h / 2, z); g.add(c);
  }
  // обрамление проёма
  for (const [x, y, bw, bh] of [[-gw / 2 - 0.04, gh / 2, 0.08, gh], [gw / 2 + 0.04, gh / 2, 0.08, gh], [0, gh + 0.04, gw + 0.16, 0.08]]) {
    const t = box(bw, bh, 0.1, mats.trim); t.position.set(x, Y + y, l / 2 + 0.02); g.add(t);
  }

  // фонарь над воротами
  const fixture = box(0.34, 0.1, 0.16, mats.dark); fixture.position.set(0, Y + gh + 0.3, l / 2 + 0.1); g.add(fixture);
  const bulb = box(0.28, 0.02, 0.12, mats.lamp); bulb.position.set(0, Y + gh + 0.245, l / 2 + 0.1); g.add(bulb);
  const spot = new THREE.SpotLight("#ffd9a0", 0, 12, Math.PI / 3.2, 0.6, 1.6);
  spot.position.set(0, Y + gh + 0.22, l / 2 + 0.15);
  spot.target.position.set(0, 0, l / 2 + 2.5);
  spot.castShadow = true; spot.shadow.mapSize.set(512, 512);
  g.add(spot, spot.target);
  const innerLight = new THREE.PointLight("#fff1d6", 0, Math.max(w, l) * 1.6, 1.5);
  innerLight.position.set(0, Y + h - 0.3, 0); g.add(innerLight);

  // ворота
  const gate = buildGate(s.gate, gw, gh, l, mats);
  g.add(gate.group);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  drive.castShadow = false; inner.castShadow = false;

  return {
    group: g, gate, spot, bulb, innerLight,
    size: { gw, gh, rise, top, eaveY },
    anchors: {
      w: [new THREE.Vector3(-w / 2, 0.02, l / 2 + 0.55), new THREE.Vector3(w / 2, 0.02, l / 2 + 0.55)],
      l: [new THREE.Vector3(w / 2 + 0.55, 0.02, l / 2), new THREE.Vector3(w / 2 + 0.55, 0.02, -l / 2)],
      h: [new THREE.Vector3(-w / 2 - 0.45, Y, l / 2 + 0.45), new THREE.Vector3(-w / 2 - 0.45, Y + h, l / 2 + 0.45)],
    },
  };
}

function buildGate(type, gw, gh, l, mats) {
  const group = new THREE.Group();
  const Y = SLAB_H, z = l / 2;
  let setOpen = () => {};

  if (type === "swing") {
    const leaves = [];
    for (const sgn of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(sgn * gw / 2, Y, z + 0.04);
      const lw = gw / 2 - 0.015;
      // лист в локальных координатах петли: от 0 к центру проёма
      const x1 = sgn < 0 ? 0 : -lw, x2 = sgn < 0 ? lw : 0;
      const sheet = new THREE.Mesh(corrugated(x1, x2, () => 0.04, () => gh - 0.03), mats.wall);
      hinge.add(sheet);
      const frame = new THREE.MeshStandardMaterial({ color: "#2b2d31", metalness: 0.6, roughness: 0.45 });
      for (const [fx, fy, fw, fh] of [[(x1 + x2) / 2, 0.04, lw, 0.05], [(x1 + x2) / 2, gh - 0.03, lw, 0.05],
                                     [x1 + 0.025, gh / 2, 0.05, gh - 0.06], [x2 - 0.025, gh / 2, 0.05, gh - 0.06]]) {
        const b = box(fw, fh, 0.05, frame); b.position.set(fx, fy, 0.01); hinge.add(b);
      }
      const handle = box(0.03, 0.28, 0.05, mats.trim);
      handle.position.set(sgn < 0 ? lw - 0.1 : -lw + 0.1, gh / 2, 0.06); hinge.add(handle);
      group.add(hinge); leaves.push([hinge, sgn]);
    }
    // створки распахиваются наружу
    setOpen = (t) => { for (const [hg, sgn] of leaves) hg.rotation.y = sgn * t * 1.75; };
  }

  if (type === "sect") {
    const n = Math.max(3, Math.round(gh / 0.55)), sh = gh / n, R = 0.35, z0 = z - 0.06;
    const secs = [];
    for (let i = 0; i < n; i++) {
      const sg = new THREE.Group();
      const p = box(gw, sh - 0.012, 0.045, mats.sect); p.position.y = sh / 2; sg.add(p);
      for (const ry of [sh * 0.33, sh * 0.66]) {  // рифление
        const r = box(gw, 0.012, 0.05, mats.trim); r.position.y = ry; sg.add(r);
      }
      if (i === 0) { const hd = box(0.3, 0.04, 0.06, mats.dark); hd.position.set(0, 0.15, 0.04); sg.add(hd); }
      group.add(sg); secs.push(sg);
    }
    const along = (s) => {  // путь по направляющим: вверх, дуга, под потолок
      const a = gh - R, arc = (Math.PI * R) / 2;
      if (s < a) return [s, z0, 0];
      if (s < a + arc) { const f = (s - a) / R; return [a + R * Math.sin(f), z0 - R * (1 - Math.cos(f)), f]; }
      return [gh, z0 - R - (s - a - arc), Math.PI / 2];
    };
    setOpen = (t) => {
      secs.forEach((sg, i) => {
        const [y, zz, f] = along(i * sh + t * (gh + 0.1));
        sg.position.set(0, Y + y, zz); sg.rotation.x = -f;
      });
    };
  }

  if (type === "roll") {
    // лист повёрнут на 90°: волны идут по вертикали — получаются горизонтальные ламели, свисают вниз от короба
    const curtain = new THREE.Mesh(corrugated(-gh, 0, () => -gw / 2, () => gw / 2, 0.012), mats.roll);
    curtain.rotation.z = Math.PI / 2;
    const holder = new THREE.Group(); holder.position.set(0, Y + gh, z + 0.08); holder.add(curtain);
    group.add(holder);
    const cas = box(gw + 0.14, 0.3, 0.3, mats.trim); cas.position.set(0, Y + gh + 0.15, z + 0.15); group.add(cas);
    for (const sgn of [-1, 1]) { const r = box(0.06, gh, 0.1, mats.trim); r.position.set(sgn * (gw / 2 + 0.02), Y + gh / 2, z + 0.1); group.add(r); }
    setOpen = (t) => { const k = Math.max(0.02, 1 - t); holder.scale.set(1, k, 1); };
  }

  setOpen(0);
  return { group, setOpen };
}

// ---------- машина для масштаба ----------
export function buildCar(color = "#1d2733") {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.7, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#0b1016", metalness: 0.9, roughness: 0.05, clearcoat: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.9 });
  const rim = new THREE.MeshStandardMaterial({ color: "#c9ccd1", metalness: 1, roughness: 0.25 });
  const head = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#e8f0ff", emissiveIntensity: 1.5 });
  const tail = new THREE.MeshStandardMaterial({ color: "#5a0000", emissive: "#ff1a1a", emissiveIntensity: 1.2 });

  // профиль кузова сбоку (x — длина, y — высота)
  const body = new THREE.Shape();
  body.moveTo(-2.25, 0.32); body.lineTo(-2.3, 0.62); body.quadraticCurveTo(-2.28, 0.9, -2.0, 0.95);
  body.lineTo(1.2, 0.97); body.quadraticCurveTo(2.0, 0.9, 2.25, 0.78); body.quadraticCurveTo(2.35, 0.6, 2.28, 0.32);
  body.lineTo(1.72, 0.32); body.absarc(1.35, 0.34, 0.39, 0, Math.PI, false);
  body.lineTo(-0.95, 0.32); body.absarc(-1.35, 0.34, 0.39, 0, Math.PI, false);
  body.lineTo(-2.25, 0.32);
  const bodyGeo = new THREE.ExtrudeGeometry(body, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 4, curveSegments: 16 });
  bodyGeo.translate(0, 0, -0.81);
  car.add(new THREE.Mesh(bodyGeo, paint));

  const cabin = new THREE.Shape();
  cabin.moveTo(-1.75, 0.95); cabin.quadraticCurveTo(-1.2, 1.38, -0.8, 1.42);
  cabin.lineTo(0.35, 1.43); cabin.quadraticCurveTo(0.75, 1.4, 1.25, 0.96); cabin.lineTo(-1.75, 0.95);
  const cabGeo = new THREE.ExtrudeGeometry(cabin, { depth: 1.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3, curveSegments: 12 });
  cabGeo.translate(0, 0, -0.66);
  car.add(new THREE.Mesh(cabGeo, glass));
  const roof = box(1.05, 0.04, 1.38, paint); roof.position.set(-0.22, 1.47, 0); car.add(roof);

  for (const x of [-1.35, 1.35]) for (const zz of [-0.84, 0.84]) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 28), rubber);
    tire.rotation.x = Math.PI / 2; tire.position.set(x, 0.34, zz); car.add(tire);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.25, 20), rim);
    r.rotation.x = Math.PI / 2; r.position.set(x, 0.34, zz); car.add(r);
  }
  for (const zz of [-0.62, 0.62]) {
    const hl = box(0.06, 0.1, 0.34, head); hl.position.set(2.37, 0.72, zz); car.add(hl);
    const tl = box(0.06, 0.09, 0.4, tail); tl.position.set(-2.39, 0.78, zz); car.add(tl);
  }
  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  car.rotation.y = -Math.PI / 2;  // нос к воротам (+z)
  return car;
}

// ---------- расчёт цены (как в боте) ----------
export const DEFAULT_PRICES = { fund: 18000, walls: 8800, roof: 8000, roof_k: 1.15, gate: 180000, gate_sect: 280000,
  gate_roll: 240000, insul: 3200, mount: 25, spread: 10 };

export function calcPrice(s, P) {
  const floor = s.w * s.l, walls = 2 * (s.w + s.l) * s.h, roof = floor * P.roof_k;
  const gate = { swing: P.gate, sect: P.gate_sect, roll: P.gate_roll }[s.gate] ?? P.gate;
  let mat = floor * P.fund + walls * P.walls + roof * P.roof + gate;
  if (s.insul) mat += (walls + roof) * P.insul;
  const total = mat * (1 + P.mount / 100), sp = P.spread / 100;
  return { total, floor, lo: Math.round((total * (1 - sp)) / 1000) * 1000, hi: Math.round((total * (1 + sp)) / 1000) * 1000 };
}
