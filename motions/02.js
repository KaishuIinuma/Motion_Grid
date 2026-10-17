/* ============================================================
   Motion: 02
   画面いっぱいの四角の内側の辺に沿って、円が内周するモーション。
   1辺ごとに easing をかけて移動する。
   ============================================================ */

(function () {
      const SIDE_DURATION_MS = 1000; // 1辺を移動する時間
      const CIRCLE_RATIO = 0.45;     // 画面の短辺に対する円の直径の比率

      // cubic-bezier(0.86, 0, 0.14, 1) と同じイージング
      const BEZIER_X1 = 0.86;
      const BEZIER_Y1 = 0;
      const BEZIER_X2 = 0.14;
      const BEZIER_Y2 = 1;

      let col;
      let circle_col;

      let pos = {x: 0, y: 0};

      // 色リスト (white も含む)
      const palette = Object.values(mycol);

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

    window.MOTIONS.push({
        name: '02',
        file: '02.js',

        setup(p, w, h, opts = {}) {
            // 画面いっぱいの四角が背景になるので、背景色の指定があればそれを四角の色にする
            // 円は四角と同じ色にならないように残りの色から選ぶ
            col = opts.bgCol || p.random(palette);
            circle_col = p.random(palette.filter(c => c !== col));
            p.rectMode(p.CENTER);
        },

        draw(p, w, h) {
            // 円の直径 (リサイズに追従するため毎フレーム計算)
            const circle_d = Math.min(w, h) * CIRCLE_RATIO;
            // 円の中心が通る長方形 (画面の辺に円が内側から接する位置) の半分の幅・高さ
            const halfW = (w - circle_d) / 2;
            const halfH = (h - circle_d) / 2;

            // 何本目の辺か, その辺の上での進み具合 (0〜1)
            const elapsed = p.millis() / SIDE_DURATION_MS;
            const side = Math.floor(elapsed) % 4;
            const e = easing(elapsed % 1);

            // 左上 → 右上 → 右下 → 左下 → 左上 の順に辺をたどる
            const corners = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]];
            const [x0, y0] = corners[side];
            const [x1, y1] = corners[(side + 1) % 4];
            pos.x = w/2 + p.lerp(x0, x1, e);
            pos.y = h/2 + p.lerp(y0, y1, e);

            p.background(mycol.white);
            p.noStroke();
            p.fill(col);
            p.rect(w/2, h/2, w, h);
            p.fill(circle_col);
            p.ellipse(pos.x, pos.y, circle_d, circle_d);

        },
    });
})();
