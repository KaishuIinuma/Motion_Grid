/* ============================================================
   Motion: 06
   正三角形の頂点に3つの円を配置し、
   easing をかけて隣の頂点へ移動していくモーション。
   ============================================================ */

(function () {
    const MOVE_DURATION_MS = 1000;   // 隣の頂点へ移動する時間
    const TRIANGLE_RATIO = 0.3;      // 画面の短辺に対する、三角形の中心から頂点までの距離の比率
    const CIRCLE_RATIO = 0.22;       // 画面の短辺に対する円の直径の比率
    const CIRCLE_COUNT = 3;          // 円の数 (= 頂点の数)

    // cubic-bezier(0.86, 0, 0.14, 1) と同じイージング
    const BEZIER_X1 = 0.86;
    const BEZIER_Y1 = 0;
    const BEZIER_X2 = 0.14;
    const BEZIER_Y2 = 1;

    // 色リスト (white も含む)
    const palette = Object.values(mycol);

    let bgCol = null;   // 背景色
    let circleCols = []; // 円ごとの色
    let startTime = 0;

    function bezierCoord(a, b, s) {
        const u = 1 - s;
        return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
    }

    // x (時間) から対応する曲線パラメータ s を二分探索し、その y (進行度) を返す
    function easing(t) {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) / 2;
            if (bezierCoord(BEZIER_X1, BEZIER_X2, mid) < t) lo = mid;
            else hi = mid;
        }
        return bezierCoord(BEZIER_Y1, BEZIER_Y2, (lo + hi) / 2);
    }

    // i 番目の頂点の座標 (画面中央を中心に、上向きの正三角形)
    function vertex(i, cx, cy, r) {
        const a = -Math.PI / 2 + (Math.PI * 2 / CIRCLE_COUNT) * i;
        return {x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r};
    }

    window.MOTIONS.push({
        name: '06',
        file: '06.js',

        setup(p, w, h, opts = {}) {
            // 1色を背景色にして (指定があればその色)、残りの色から円の色を重ならないように選ぶ
            bgCol = opts.bgCol || p.random(palette);
            circleCols = p.shuffle(palette.filter(c => c !== bgCol)).slice(0, CIRCLE_COUNT);
            startTime = p.millis();
        },

        draw(p, w, h) {
            const s = Math.min(w, h);
            const r = s * TRIANGLE_RATIO;
            const d = s * CIRCLE_RATIO;

            // 何回目の移動か, その移動の進み具合 (0〜1)
            const elapsed = (p.millis() - startTime) / MOVE_DURATION_MS;
            const step = Math.floor(elapsed);
            const e = easing(elapsed % 1);

            p.background(bgCol);
            p.noStroke();

            // 各円は step 回分だけ時計回りに進んだ頂点から、その次の頂点へ移動する
            for(let i=0; i<CIRCLE_COUNT; i++){
                const from = vertex((i + step) % CIRCLE_COUNT, w / 2, h / 2, r);
                const to = vertex((i + step + 1) % CIRCLE_COUNT, w / 2, h / 2, r);
                p.fill(circleCols[i]);
                p.circle(p.lerp(from.x, to.x, e), p.lerp(from.y, to.y, e), d);
            }
        },
    });
})();
