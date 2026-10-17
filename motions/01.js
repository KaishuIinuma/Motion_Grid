/* ============================================================
   Motion: 01
   画面内に偏りなく配置した短い長方形が、尺取り虫のように進むモーション。
   向き・進む距離は毎回ランダムで、長方形同士が横断することもある。
   1ステップ目: 向いている方向に前の辺を伸ばす
   2ステップ目: 置いていった後ろの辺を同じ距離だけ動かす
   3ステップ目: その場でランダムに回転する
   全ての動きは easing させる。
   ============================================================ */

(function () {
    const RECT_COUNT = 8;            // 長方形の数
    const RECT_LENGTH_RATIO = 0.15;  // 画面の短辺に対する長方形の長さの比率
    const RECT_WIDTH_RATIO = 0.04;   // 画面の短辺に対する長方形の太さの比率
    const MOVE_DISTANCE_MIN_RATIO = 0.06; // 画面の短辺に対する1回で伸ばす距離の最小値
    const MOVE_DISTANCE_MAX_RATIO = 0.3;  // 画面の短辺に対する1回で伸ばす距離の最大値
    const MARGIN_RATIO = 0.2;        // 画面の短辺に対する、画面端からの余白の比率
    const STEP_DURATION_MS = 500;    // 1ステップの時間
    const CANDIDATES = 10;           // 最初の配置を決める時の候補数 (多いほど均等に、少ないほどランダムに近づく)
    const MOVE_TRIES = 30;           // 画面内に収まる向き・距離を探す回数

    // cubic-bezier(0.86, 0, 0.14, 1) と同じイージング
    const BEZIER_X1 = 0.86;
    const BEZIER_Y1 = 0;
    const BEZIER_X2 = 0.14;
    const BEZIER_Y2 = 1;

    // 色リスト (white も含む)
    const palette = Object.values(mycol);

    // 長方形の位置・長さは「画面の短辺 = 1」の単位で、画面中央を原点として持つ
    // (アスペクト比が変わっても大きさが崩れないようにするため)
    // cx, cy: 静止時の中心, angle: 向き, nextAngle: 回転ステップでの回転先, dist: 次に進む距離
    let rects = [];
    let step = 0;       // 0 = 前の辺を伸ばす, 1 = 後ろの辺を動かす, 2 = 回転
    let stepStart = 0;
    let bounds = {x: 0.5, y: 0.5}; // 移動できる範囲 (原点からの半分の幅・高さ)
    let bgCol = null;   // 背景色
    let cols = [];      // 長方形に使う色 (背景色を除いた残り)

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

    function inBounds(x, y) {
        return Math.abs(x) <= bounds.x && Math.abs(y) <= bounds.y;
    }

    // 他の長方形の中心との最短距離
    function nearestDist(x, y, self) {
        let d = Infinity;
        for(const r of rects){
            if(r === self) continue;
            d = Math.min(d, Math.hypot(x - r.cx, y - r.cy));
        }
        return d;
    }

    // 次の向きと進む距離をランダムに決める (伸びた時の前の辺が画面内に収まるものだけ)
    // 他の長方形の位置は気にしないので、線同士が横断することもある
    function chooseMove(p, r) {
        for(let k=0; k<MOVE_TRIES; k++){
            const a = p.random(p.TWO_PI);
            const dist = p.random(MOVE_DISTANCE_MIN_RATIO, MOVE_DISTANCE_MAX_RATIO);
            const frontX = r.cx + Math.cos(a) * (RECT_LENGTH_RATIO / 2 + dist);
            const frontY = r.cy + Math.sin(a) * (RECT_LENGTH_RATIO / 2 + dist);
            if(inBounds(frontX, frontY)){
                r.nextAngle = a;
                r.dist = dist;
                return;
            }
        }
        // 収まる向きが見つからなければ画面中央に向かって最小距離だけ進む
        r.nextAngle = Math.atan2(-r.cy, -r.cx);
        r.dist = MOVE_DISTANCE_MIN_RATIO;
    }

    // 角度の差を -PI〜PI に収める (遠回りしないように)
    function angleDiff(from, to) {
        let d = (to - from) % (Math.PI * 2);
        if(d > Math.PI) d -= Math.PI * 2;
        if(d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    function updateBounds(w, h) {
        const s = Math.min(w, h);
        bounds.x = w / s / 2 - MARGIN_RATIO;
        bounds.y = h / s / 2 - MARGIN_RATIO;
    }

    window.MOTIONS.push({
        name: '01',
        file: '01.js',

        setup(p, w, h, opts = {}) {
            updateBounds(w, h);

            // 1色を背景色にして (指定があればその色)、残りの色を長方形に使う
            bgCol = opts.bgCol || p.random(palette);
            cols = palette.filter(c => c !== bgCol);

            // Mitchell's Best-Candidate で偏りの少ない位置に配置する
            rects = [];
            for(let i=0; i<RECT_COUNT; i++){
                let best = null;
                let bestDist = -1;
                for(let k=0; k<CANDIDATES; k++){
                    const x = p.random(-bounds.x, bounds.x);
                    const y = p.random(-bounds.y, bounds.y);
                    const d = nearestDist(x, y, null);
                    if(d > bestDist){
                        bestDist = d;
                        best = {x, y};
                    }
                }
                rects.push({cx: best.x, cy: best.y, angle: 0, nextAngle: 0, dist: 0, col: p.random(cols)});
            }
            for(const r of rects){
                chooseMove(p, r);
                r.angle = r.nextAngle;
            }

            step = 0;
            stepStart = p.millis();
        },

        draw(p, w, h) {
            updateBounds(w, h);

            // ステップが終わったら状態を確定して次のステップへ
            let t = (p.millis() - stepStart) / STEP_DURATION_MS;
            if(t >= 1){
                for(const r of rects){
                    if(step === 1){
                        // 後ろの辺が追いついたので、中心が進んだ位置で確定
                        r.cx += Math.cos(r.angle) * r.dist;
                        r.cy += Math.sin(r.angle) * r.dist;
                    }
                    if(step === 2){
                        r.angle = r.nextAngle;
                    }
                }
                step = (step + 1) % 3;
                // 回転ステップに入る時に回転先と次に進む距離を決める
                if(step === 2){
                    for(const r of rects) chooseMove(p, r);
                }
                stepStart = p.millis();
                t = 0;
            }
            const e = easing(t);

            const s = Math.min(w, h);
            const half = RECT_LENGTH_RATIO / 2;

            p.background(bgCol);
            p.noStroke();
            p.rectMode(p.CENTER);

            for(const r of rects){
                let angle = r.angle;
                // 中心から見た後ろの辺・前の辺の位置 (向いている方向がプラス)
                let back = -half;
                let front = half;

                if(step === 0){
                    // 前の辺を伸ばす
                    front = half + r.dist * e;
                }
                else if(step === 1){
                    // 後ろの辺を同じ距離だけ動かす
                    back = -half + r.dist * e;
                    front = half + r.dist;
                }
                else{
                    // その場で回転
                    angle = r.angle + angleDiff(r.angle, r.nextAngle) * e;
                }

                const dx = Math.cos(r.angle);
                const dy = Math.sin(r.angle);
                const mid = (back + front) / 2;

                p.push();
                p.translate(w / 2 + (r.cx + dx * mid) * s, h / 2 + (r.cy + dy * mid) * s);
                p.rotate(angle);
                p.fill(r.col);
                p.rect(0, 0, (front - back) * s, RECT_WIDTH_RATIO * s);
                p.pop();
            }
        },
    });
})();
