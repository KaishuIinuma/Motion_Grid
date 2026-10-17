/* ============================================================
   Motion Grid — sketch.js
   描画ファイルの登録・切替・アスペクト比管理を行うメインコントローラ
   ============================================================ */

// ─── 描画モジュール登録レジストリ ─────────────────────────────
// 各描画 JS ファイルはこの配列に自分を push する。
// 形式: { name, file, setup(p,w,h,opts), draw(p,w,h), [windowResized(w,h)] }
// opts.bgCol: 背景色の指定 (Grid モードで隣のセルと被らないように渡す。無ければモーション側でランダムに選ぶ)
window.MOTIONS = window.MOTIONS || [];

// ─── 状態 ────────────────────────────────────────────────────
let currentMotion = null;   // 現在アクティブな描画モジュール
let canvasW = 1280;
let canvasH = 720;
let isPaused = false;
let p5Instance = null;      // 現在の p5 インスタンス (Single モード)

// ─── Grid モードの状態 ───────────────────────────────────────
// Grid モードでは画面を k-d tree 風に再帰分割し、各セルに1つずつモーションを表示する。
// 各モーションは自分専用の p5 インスタンス (canvas) で動く。
// モーションの状態はファイル内の変数に持っているため、セルごとにスクリプトを評価し直して
// 独立したインスタンスを作る (同じモーションを複数セルに置いても干渉しない)。
const GRID_SPLIT_JITTER = 0.15;  // 分割位置のランダムな揺らぎ (0 = 枚数比どおりに分割)
const GRID_MIN_RATIO = 0.25;     // 分割した片側の最小比率

let viewMode = 'single';    // 'single' | 'grid'
let gridLayout = null;      // [{ x, y, w, h, motionIndex }] (x, y, w, h は 0〜1 の比率)
let gridInstances = [];     // [{ p5, cell, leaf, motion, w, h }]
let gridCount = 8;          // グリッドの分割数
let showLabels = false;     // D キーで各セルのファイル名を表示

// ─── DOM 参照 ─────────────────────────────────────────────────
const aspectSelect    = document.getElementById('aspect-select');
const customAspect    = document.getElementById('custom-aspect');
const aspectWInput    = document.getElementById('aspect-w');
const aspectHInput    = document.getElementById('aspect-h');
const resLabel        = document.getElementById('res-label');
const sketchList      = document.getElementById('sketch-list');
const sketchCount     = document.getElementById('sketch-count');
const canvasWrapper   = document.getElementById('canvas-wrapper');
const canvasArea      = document.getElementById('canvas-area');
const emptyState      = document.getElementById('empty-state');
const btnRestart      = document.getElementById('btn-restart');
const btnPause        = document.getElementById('btn-pause');
const btnModeSingle   = document.getElementById('mode-single');
const btnModeGrid     = document.getElementById('mode-grid');
const gridOptions     = document.getElementById('grid-options');
const btnShuffle      = document.getElementById('btn-shuffle-layout');
const gridCountInput  = document.getElementById('grid-count');

// ─── アスペクト比 → 実キャンバスサイズ計算 ─────────────────────
function computeCanvasSize(ratioW, ratioH) {
  const areaRect = canvasArea.getBoundingClientRect();
  const maxW = areaRect.width  - 48;   // padding
  const maxH = areaRect.height - 48;

  const aspect = ratioW / ratioH;

  let w, h;
  if (maxW / maxH > aspect) {
    h = maxH;
    w = Math.round(h * aspect);
  } else {
    w = maxW;
    h = Math.round(w / aspect);
  }

  return { w, h };
}

function parseAspect() {
  const val = aspectSelect.value;
  if (val === 'custom') {
    return {
      w: parseInt(aspectWInput.value) || 16,
      h: parseInt(aspectHInput.value) || 9,
    };
  }
  const [w, h] = val.split(':').map(Number);
  return { w, h };
}

function updateCanvasSize() {
  const { w: rw, h: rh } = parseAspect();
  const { w, h } = computeCanvasSize(rw, rh);
  canvasW = w;
  canvasH = h;
  resLabel.textContent = `${w} × ${h}`;

  if (p5Instance) {
    p5Instance.resizeCanvas(canvasW, canvasH);
    if (currentMotion && currentMotion.windowResized) {
      currentMotion.windowResized(canvasW, canvasH);
    }
  }

  if (viewMode === 'grid') {
    layoutGridCells();
  }
}

// アスペクト比が変わった時: Grid モードでは分割の向きが変わるのでレイアウトを作り直す
function onAspectChange() {
  updateCanvasSize();
  if (viewMode === 'grid') {
    gridLayout = null;
    activateGrid();
  }
}

// ─── アスペクト比 UI ──────────────────────────────────────────
aspectSelect.addEventListener('change', () => {
  customAspect.classList.toggle('hidden', aspectSelect.value !== 'custom');
  onAspectChange();
});

aspectWInput.addEventListener('input', onAspectChange);
aspectHInput.addEventListener('input', onAspectChange);

// ─── スケッチ一覧の構築 ──────────────────────────────────────
function buildSketchList() {
  sketchList.innerHTML = '';
  sketchCount.textContent = MOTIONS.length;

  MOTIONS.forEach((motion, idx) => {
    const li = document.createElement('li');
    li.dataset.index = idx;

    const icon = document.createElement('div');
    icon.className = 'sketch-icon';
    icon.textContent = (idx + 1).toString().padStart(2, '0');

    const info = document.createElement('div');
    info.className = 'sketch-info';

    const name = document.createElement('div');
    name.className = 'sketch-name';
    name.textContent = motion.name || `Sketch ${idx + 1}`;

    const file = document.createElement('div');
    file.className = 'sketch-file';
    file.textContent = motion.file || '';

    info.appendChild(name);
    info.appendChild(file);
    li.appendChild(icon);
    li.appendChild(info);

    // Grid モード中にクリックした場合は Single モードに切り替えて表示
    li.addEventListener('click', () => {
      setViewMode('single');
      activateMotion(idx);
    });
    sketchList.appendChild(li);
  });
}

// ─── p5 インスタンスの生成 ───────────────────────────────────
// getSize() は現在の { w, h } を返す関数 (リサイズに追従するため)
function createMotionInstance(motion, parent, getSize, opts = {}) {
  return new p5((p) => {
    p.setup = () => {
      const { w, h } = getSize();
      const cnv = p.createCanvas(w, h);
      cnv.parent(parent);
      if (motion.setup) {
        motion.setup(p, w, h, opts);
      }
    };

    p.draw = () => {
      if (isPaused) return;
      if (motion.draw) {
        const { w, h } = getSize();
        motion.draw(p, w, h);
      }
    };
  });
}

// ─── 全インスタンスの破棄 ─────────────────────────────────────
function destroyAllInstances() {
  if (p5Instance) {
    p5Instance.remove();
    p5Instance = null;
  }
  gridInstances.forEach(g => g.p5.remove());
  gridInstances = [];
  canvasWrapper.innerHTML = '';
}

// ─── スケッチの切替 ───────────────────────────────────────────
function activateMotion(idx) {
  // リスト UI の更新
  document.querySelectorAll('#sketch-list li').forEach(li => li.classList.remove('active'));
  const target = sketchList.querySelector(`li[data-index="${idx}"]`);
  if (target) target.classList.add('active');

  emptyState.classList.add('hidden');

  // 既存 p5 インスタンスを破棄
  destroyAllInstances();

  currentMotion = MOTIONS[idx];
  isPaused = false;
  btnPause.textContent = '❚❚';

  // サイズ再計算
  updateCanvasSize();

  // 新しい p5 インスタンスを生成 (instance mode)
  p5Instance = createMotionInstance(currentMotion, canvasWrapper, () => ({ w: canvasW, h: canvasH }));
}

// ─── Grid モード: k-d tree 風の再帰分割 ───────────────────────
// 0〜1 の正方形を count 枚のセルに分割する。
// 長い方の辺を枚数比で分割し、両側をさらに再帰的に分割する。
// aspect は画面の 幅 / 高さ (長い辺を判定するため)
function buildKdLayout(count, aspect) {
  const leaves = [];

  function split(x, y, w, h, n) {
    if (n === 1) {
      leaves.push({ x, y, w, h });
      return;
    }
    // 枚数を2つに分ける (奇数の時はどちらが多くなるかランダム)
    let nA = Math.floor(n / 2);
    if (n % 2 === 1 && Math.random() < 0.5) nA = n - nA;
    const nB = n - nA;

    // 枚数比を基準に、少し揺らした位置で分割する
    let ratio = nA / n + (Math.random() * 2 - 1) * GRID_SPLIT_JITTER;
    ratio = Math.min(Math.max(ratio, GRID_MIN_RATIO), 1 - GRID_MIN_RATIO);

    // 実際のピクセル比で長い方の辺を分割する
    if (w * aspect >= h) {
      split(x, y, w * ratio, h, nA);
      split(x + w * ratio, y, w * (1 - ratio), h, nB);
    } else {
      split(x, y, w, h * ratio, nA);
      split(x, y + h * ratio, w, h * (1 - ratio), nB);
    }
  }

  split(0, 0, 1, 1, count);

  // モーションを割り当てる: シャッフルした順に一巡ずつ配り、なるべく偏りなく使う
  let order = [];
  leaves.forEach(leaf => {
    if (order.length === 0) order = shuffled(MOTIONS.map((_, i) => i));
    leaf.motionIndex = order.pop();
  });

  assignBackgrounds(leaves);
  return leaves;
}

// 2つのセルが辺を共有しているか (角だけで接している場合は隣とみなさない)
function isAdjacent(a, b) {
  const EPS = 1e-9;
  const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
  const touch = (v0, v1) => Math.abs(v0 - v1) < EPS;
  if (touch(a.x + a.w, b.x) || touch(b.x + b.w, a.x)) return overlap(a.y, a.y + a.h, b.y, b.y + b.h);
  if (touch(a.y + a.h, b.y) || touch(b.y + b.h, a.y)) return overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  return false;
}

// 隣り合うセルの背景色が被らないように色を割り当てる (バックトラッキングによる彩色)
// 隣の多いセルから順に、候補の色をランダムな順で試す
function assignBackgrounds(leaves) {
  const colors = Object.values(mycol);
  const neighbors = leaves.map(a => leaves.filter(b => b !== a && isAdjacent(a, b)));
  const order = leaves.map((_, i) => i).sort((i, j) => neighbors[j].length - neighbors[i].length);

  function solve(k) {
    if (k === order.length) return true;
    const leaf = leaves[order[k]];
    const used = neighbors[order[k]].map(n => n.bgCol);
    for (const c of shuffled(colors.slice())) {
      if (used.includes(c)) continue;
      leaf.bgCol = c;
      if (solve(k + 1)) return true;
    }
    leaf.bgCol = undefined;
    return false;
  }

  leaves.forEach(leaf => { leaf.bgCol = undefined; });
  solve(0);
}

function shuffled(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// モーションの独立したインスタンスを作る
// ソースを保持していればスクリプトを評価し直し、新しいクロージャ (状態) を持つオブジェクトを得る
function spawnMotion(idx) {
  const base = MOTIONS[idx];
  if (!base.__source) return base;
  const registry = window.MOTIONS;
  window.MOTIONS = [];
  try {
    (0, eval)(base.__source);
    return window.MOTIONS[0] || base;
  } catch (err) {
    console.warn(`Failed to spawn: ${base.file}`, err);
    return base;
  } finally {
    window.MOTIONS = registry;
  }
}

// セルのピクセル位置・サイズを求める (隣のセルと隙間なく並ぶよう端を丸める)
function cellRect(leaf) {
  const x0 = Math.round(leaf.x * canvasW);
  const y0 = Math.round(leaf.y * canvasH);
  const x1 = Math.round((leaf.x + leaf.w) * canvasW);
  const y1 = Math.round((leaf.y + leaf.h) * canvasH);
  return {
    x: x0,
    y: y0,
    w: Math.max(1, x1 - x0),
    h: Math.max(1, y1 - y0),
  };
}

// 現在の canvasW / canvasH に合わせてセルを配置し直す
function layoutGridCells() {
  const container = document.getElementById('grid-container');
  if (!container) return;
  container.style.width  = `${canvasW}px`;
  container.style.height = `${canvasH}px`;

  gridInstances.forEach(g => {
    const r = cellRect(g.leaf);
    g.cell.style.left   = `${r.x}px`;
    g.cell.style.top    = `${r.y}px`;
    g.cell.style.width  = `${r.w}px`;
    g.cell.style.height = `${r.h}px`;
    if (r.w !== g.w || r.h !== g.h) {
      g.w = r.w;
      g.h = r.h;
      g.p5.resizeCanvas(r.w, r.h);
      if (g.motion.windowResized) {
        g.motion.windowResized(r.w, r.h);
      }
    }
  });
}

function activateGrid() {
  destroyAllInstances();
  currentMotion = null;
  isPaused = false;
  btnPause.textContent = '❚❚';
  document.querySelectorAll('#sketch-list li').forEach(li => li.classList.remove('active'));

  if (MOTIONS.length === 0) return;
  emptyState.classList.add('hidden');

  updateCanvasSize();
  if (!gridLayout || gridLayout.length !== gridCount) {
    gridLayout = buildKdLayout(gridCount, canvasW / canvasH);
  }

  const container = document.createElement('div');
  container.id = 'grid-container';
  container.style.width  = `${canvasW}px`;
  container.style.height = `${canvasH}px`;
  canvasWrapper.appendChild(container);

  gridLayout.forEach(leaf => {
    const r = cellRect(leaf);
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.style.left   = `${r.x}px`;
    cell.style.top    = `${r.y}px`;
    cell.style.width  = `${r.w}px`;
    cell.style.height = `${r.h}px`;
    container.appendChild(cell);

    const motion = spawnMotion(leaf.motionIndex);
    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = MOTIONS[leaf.motionIndex].file || MOTIONS[leaf.motionIndex].name;
    cell.appendChild(label);

    const g = { cell, leaf, motion, w: r.w, h: r.h, p5: null };
    g.p5 = createMotionInstance(motion, cell, () => ({ w: g.w, h: g.h }), { bgCol: leaf.bgCol });
    gridInstances.push(g);
  });
}

// ─── 表示モードの切替 ─────────────────────────────────────────
function setViewMode(mode) {
  if (viewMode === mode) return;
  viewMode = mode;
  btnModeSingle.classList.toggle('active', mode === 'single');
  btnModeGrid.classList.toggle('active', mode === 'grid');
  gridOptions.classList.toggle('hidden', mode !== 'grid');
}

btnModeSingle.addEventListener('click', () => {
  if (viewMode === 'single') return;
  setViewMode('single');
  if (MOTIONS.length > 0) activateMotion(0);
});

btnModeGrid.addEventListener('click', () => {
  if (viewMode === 'grid') return;
  setViewMode('grid');
  activateGrid();
});

btnShuffle.addEventListener('click', () => {
  gridLayout = null;
  activateGrid();
});

gridCountInput.addEventListener('change', () => {
  const n = Math.min(Math.max(parseInt(gridCountInput.value) || 1, 1), 64);
  gridCountInput.value = n;
  if (n === gridCount) return;
  gridCount = n;
  gridLayout = null;
  activateGrid();
});

// ─── D キー: 各セルのファイル名表示の切替 ─────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key !== 'd' && e.key !== 'D') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches('input, select, textarea')) return;
  showLabels = !showLabels;
  document.body.classList.toggle('show-labels', showLabels);
});

// ─── 再生コントロール ─────────────────────────────────────────
btnRestart.addEventListener('click', () => {
  if (viewMode === 'grid') {
    activateGrid();   // 同じレイアウトのまま全モーションを最初から
    return;
  }
  if (currentMotion) {
    const idx = MOTIONS.indexOf(currentMotion);
    activateMotion(idx);
  }
});

btnPause.addEventListener('click', () => {
  isPaused = !isPaused;
  btnPause.textContent = isPaused ? '▶' : '❚❚';
});

// ─── ウィンドウリサイズ ───────────────────────────────────────
window.addEventListener('resize', () => {
  updateCanvasSize();
});

// ─── 初期化 ───────────────────────────────────────────────────
// motions フォルダの JS を動的にロードする仕組み
// motions/manifest.json に描画ファイル一覧を定義する
function loadMotions() {
  fetch('motions/manifest.json')
    .then(res => {
      if (!res.ok) throw new Error('manifest.json not found');
      return res.json();
    })
    .then(files => {
      // 各 JS のソースを取得して順番に評価する
      // ソースは Grid モードでセルごとに独立したインスタンスを作るために保持しておく
      return Promise.all(files.map(file =>
        fetch(`motions/${file}`)
          .then(res => {
            if (!res.ok) throw new Error(res.status);
            return res.text();
          })
          .catch(() => {
            console.warn(`Failed to load: motions/${file}`);
            return null; // エラーでも続行
          })
      )).then(sources => {
        sources.forEach((src, i) => {
          if (src === null) return;
          const source = `${src}\n//# sourceURL=motions/${files[i]}`;
          const before = MOTIONS.length;
          try {
            (0, eval)(source);
          } catch (err) {
            console.warn(`Failed to run: motions/${files[i]}`, err);
            return;
          }
          if (MOTIONS.length === before + 1) MOTIONS[before].__source = source;
        });
      });
    })
    .then(() => {
      buildSketchList();
      // 1つ以上あれば最初のスケッチを自動選択
      if (MOTIONS.length > 0) {
        activateMotion(0);
      }
    })
    .catch(err => {
      console.warn('manifest.json の読み込みに失敗:', err.message);
      // manifest が無くても直接読み込んだスケッチがあれば表示
      buildSketchList();
      if (MOTIONS.length > 0) {
        activateMotion(0);
      }
    });
}

// DOMContentLoaded 後に初期化
document.addEventListener('DOMContentLoaded', () => {
  updateCanvasSize();
  loadMotions();
});
