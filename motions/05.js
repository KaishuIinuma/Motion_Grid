/* ============================================================
   Motion: 05
   領域内で4つの point が easing でランダムに移動し、
   残りの色で convex hull と背景を描画するモーション。
   色の配置は最初に決めたまま変えない。
   ============================================================ */

(function () {
    const AREA_PERCENT = 0.89;       // 画面の短辺に対する正方形の領域の大きさ
    const POINT_COUNT = 4;          // point の数
    const POINT_SIZE_RATIO = 0.12;  // 画面の短辺に対する point の直径の比率
    const MOVE_DURATION_MS = 1500;  // 1回の移動にかける時間
    const CANDIDATES = 10;          // 1点あたりの候補数 (多いほど均等に、少ないほどランダムに近づく)

    // 色リスト (white も含む)
    const palette = Object.values(mycol);

    // point の位置は領域内の 0〜1 の比率で持つ (画面サイズが変わっても追従するため)
    // 配列の順番がそのままレイヤー順 (最後の要素が最上面)
    let points = [];
    let hullCol = null;
    let bgCol = null;
    let moveStart = 0;

    // cubic-bezier(0.86, 0, 0.14, 1) と同じイージング
    const BEZIER_X1 = 0.86;
    const BEZIER_Y1 = 0;
    const BEZIER_X2 = 0.14;
    const BEZIER_Y2 = 1;

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

    // 背景色を決め (指定があればその色)、残りの色を point に1色ずつと hull に割り当てる
    function assignColors(p, bg) {
        bgCol = bg || p.random(palette);
        const cols = p.shuffle(palette.filter(c => c !== bgCol));
        for(let i=0; i<points.length; i++){
            points[i].col = cols[i % cols.length];
        }
        hullCol = cols[points.length % cols.length];
    }

    // Mitchell's Best-Candidate で偏りの少ない位置を POINT_COUNT 個求める
    // 1点ごとに候補を CANDIDATES 個作り、すでに置いた点から一番遠い候補を採用する
    function spreadPositions(p) {
        const placed = [];
        for(let i=0; i<POINT_COUNT; i++){
            let best = null;
            let bestDist = -1;
            for(let k=0; k<CANDIDATES; k++){
                const c = {x: p.random(), y: p.random()};
                // すでに置いた点との最短距離
                let d = Infinity;
                for(const q of placed) d = Math.min(d, Math.hypot(c.x - q.x, c.y - q.y));
                if(d > bestDist){
                    bestDist = d;
                    best = c;
                }
            }
            placed.push(best);
        }
        return placed;
    }

    // 次の移動先を決める
    function setNextTargets(p) {
        const targets = spreadPositions(p);
        points.forEach((pt, i) => {
            pt.fromX = pt.toX;
            pt.fromY = pt.toY;
            pt.toX = targets[i].x;
            pt.toY = targets[i].y;
        });
    }

    // Andrew's monotone chain で convex hull を求める
    function convexHull(pts) {
        const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
        if(sorted.length < 3) return sorted;

        const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower = [];
        for(const pt of sorted){
            while(lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
            lower.push(pt);
        }
        const upper = [];
        for(let i=sorted.length - 1; i>=0; i--){
            const pt = sorted[i];
            while(upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
            upper.push(pt);
        }
        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    // convex hull を半径 r だけ外側に広げ、角を point の円と同じ半径で丸めて描く
    function roundedHull(ctx, hull, r) {
        // 重なっている頂点を取り除く
        const verts = hull.filter((v, i) => {
            const prev = hull[(i - 1 + hull.length) % hull.length];
            return i === 0 || Math.hypot(v.x - prev.x, v.y - prev.y) > 1e-6;
        });

        ctx.beginPath();
        if(verts.length < 2){
            // 全ての point が重なっている時はただの円
            ctx.arc(verts[0].x, verts[0].y, r, 0, Math.PI * 2);
        }
        else{
            for(let i=0; i<verts.length; i++){
                const prev = verts[(i - 1 + verts.length) % verts.length];
                const cur = verts[i];
                const next = verts[(i + 1) % verts.length];
                // 前後の辺の外向き法線の角度の間を円弧でつなぐ (辺の直線は arc が自動でつなぐ)
                const angIn = Math.atan2(cur.y - prev.y, cur.x - prev.x) - Math.PI / 2;
                let angOut = Math.atan2(next.y - cur.y, next.x - cur.x) - Math.PI / 2;
                if(angOut < angIn) angOut += Math.PI * 2;
                ctx.arc(cur.x, cur.y, r, angIn, angOut);
            }
        }
        ctx.closePath();
        ctx.fill();
    }

    window.MOTIONS.push({
        name: '05',
        file: '05.js',

        setup(p, w, h, opts = {}) {
            // 散らばった位置からスタート
            points = spreadPositions(p).map(pos => ({fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y, col: null}));
            assignColors(p, opts.bgCol);
            setNextTargets(p);
            moveStart = p.millis();
        },

        draw(p, w, h) {
            // 縦横の小さい方に合わせた正方形の領域
            const areaX = Math.min(w, h) * AREA_PERCENT;
            const areaY = areaX;
            const areaPosX = (w - areaX) / 2;
            const areaPosY = (h - areaY) / 2;

            // easing が終了したら次の移動へ
            let t = (p.millis() - moveStart) / MOVE_DURATION_MS;
            if(t >= 1){
                setNextTargets(p);
                moveStart = p.millis();
                t = 0;
            }
            const e = easing(t);

            // 現在位置をピクセル座標で求める
            const current = points.map(pt => ({
                x: areaPosX + p.lerp(pt.fromX, pt.toX, e) * areaX,
                y: areaPosY + p.lerp(pt.fromY, pt.toY, e) * areaY,
                col: pt.col,
            }));

            p.background(bgCol);
            p.noStroke();

            const size = Math.min(w, h) * POINT_SIZE_RATIO;

            // convex hull (point の円に沿った角丸)
            p.fill(hullCol);
            roundedHull(p.drawingContext, convexHull(current), size / 2);

            // point
            for(const pt of current){
                p.fill(pt.col);
                p.circle(pt.x, pt.y, size);
            }
        },
    });
})();
