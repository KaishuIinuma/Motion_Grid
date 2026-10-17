/* ============================================================
   Motion: 04
   中央に同心円状の円弧を配置し、それぞれ noise で回転させるモーション。
   最大半径を5分割し、分割した幅を太さとした角丸の円弧を描画する。
   ============================================================ */

(function () {
    const RADIUS_RATIO = 0.45;   // 画面の短辺に対する最大半径の比率
    const DIVISIONS = 4;        // 半径の分割数
    const GAP_RATIO = 0.3;      // 分割幅のうち隙間にする割合 (0 = 隙間なし, 0.5 = 線と隙間が同じ太さ)
    const CORNER_RATIO = 0.15;  // 太さに対する角丸の半径の比率 (0 = 角ばった形, 0.5 = 半円)
    const NOISE_SPEED = 0.003;  // noise の時間方向の進み
    const ROTATE_RANGE = Math.PI * 4; // noise による回転の振れ幅

    let arcs = [];
    let bgCol = null;   // 背景色

    // 四隅を角丸にした円弧 (ドーナツの一部) を塗りで描く
    // rIn / rOut: 内側・外側の半径, corner: 角丸の半径
    function roundedArc(ctx, cx, cy, rIn, rOut, start, end, corner) {
        const c = Math.min(corner, (rOut - rIn) / 2);
        // 角丸の円の中心が、辺から何度ずれるか
        const dOut = Math.asin(c / (rOut - c));
        const dIn = Math.asin(c / (rIn + c));
        // 角丸の円の中心の、中心からの距離
        const cOut = rOut - c;
        const cIn = rIn + c;

        const px = (ang, dist) => cx + Math.cos(ang) * dist;
        const py = (ang, dist) => cy + Math.sin(ang) * dist;

        ctx.beginPath();
        // 開始側の辺
        ctx.moveTo(px(start, cIn * Math.cos(dIn)), py(start, cIn * Math.cos(dIn)));
        ctx.lineTo(px(start, cOut * Math.cos(dOut)), py(start, cOut * Math.cos(dOut)));
        // 外側・開始の角
        ctx.arc(px(start + dOut, cOut), py(start + dOut, cOut), c, start - Math.PI / 2, start + dOut);
        // 外側の弧
        ctx.arc(cx, cy, rOut, start + dOut, end - dOut);
        // 外側・終了の角
        ctx.arc(px(end - dOut, cOut), py(end - dOut, cOut), c, end - dOut, end + Math.PI / 2);
        // 終了側の辺
        ctx.lineTo(px(end, cIn * Math.cos(dIn)), py(end, cIn * Math.cos(dIn)));
        // 内側・終了の角
        ctx.arc(px(end - dIn, cIn), py(end - dIn, cIn), c, end + Math.PI / 2, end - dIn + Math.PI);
        // 内側の弧 (逆回り)
        ctx.arc(cx, cy, rIn, end - dIn, start + dIn, true);
        // 内側・開始の角
        ctx.arc(px(start + dIn, cIn), py(start + dIn, cIn), c, start + dIn + Math.PI, start + Math.PI * 1.5);
        ctx.closePath();
        ctx.fill();
    }

    // 色リスト (white も含む)
    const palette = Object.values(mycol);

    window.MOTIONS.push({
        name: '04',
        file: '04.js',

        setup(p, w, h, opts = {}) {
            // 1色を背景色にして (指定があればその色)、残りの色を円弧に使う
            bgCol = opts.bgCol || p.random(palette);
            const cols = palette.filter(c => c !== bgCol);

            // 円弧ごとにランダムな開始角・長さ・色を決める
            arcs = [];
            for(let i=0; i<DIVISIONS; i++){
                arcs.push({
                    start: p.random(p.TWO_PI),
                    length: p.random(p.HALF_PI, p.TWO_PI * 0.85),
                    col: p.random(cols),
                    seed: p.random(1000), // 円弧ごとに異なる noise を使う
                });
            }
        },

        draw(p, w, h) {
            const maxRadius = Math.min(w, h) * RADIUS_RATIO;
            const step = maxRadius / DIVISIONS; // 分割した長さ
            const weight = step * (1 - GAP_RATIO); // 隙間を除いた分が円弧の太さ
            const corner = weight * CORNER_RATIO;

            p.background(bgCol);
            p.noStroke();

            const t = p.frameCount * NOISE_SPEED;

            // i = 0 (最小の円弧) は描画しない
            for(let i=1; i<DIVISIONS; i++){
                const a = arcs[i];
                // 円弧の中心線の半径 (各分割帯の中央)
                const r = step * (i + 0.5);
                const rotation = (p.noise(a.seed, t) - 0.5) * ROTATE_RANGE;
                const start = a.start + rotation;

                p.fill(a.col);
                roundedArc(p.drawingContext, w / 2, h / 2, r - weight / 2, r + weight / 2, start, start + a.length, corner);
            }
        },
    });
})();
