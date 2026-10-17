/* ============================================================
   Sample Motion: Expanding Rings
   中央から同心円が広がりながらフェードアウトしていくモーション。
   ============================================================ */

(function () {
      const areaPercent = 0.5; //画面の半分の大きさまで広がる
      const SIZE_RATIO = 0.14; // 画面の短辺に対する円の直径の比率

      let sinT = 0;

      let particles = [];
      let maxParticles = 60;
      // 色リスト (white も含む)
      const palette = Object.values(mycol);
      let bgCol = null;   // 背景色
      let cols = [];      // 粒子に使う色 (背景色を除いた残り)
    window.MOTIONS.push({
        name: 'Expanding Rings',
        file: '03.js',

        setup(p, w, h, opts = {}) {
            // Restart 時に状態をリセット
            particles = [];
            // 1色を背景色にして (指定があればその色)、残りの色を粒子に使う
            bgCol = opts.bgCol || p.random(palette);
            cols = palette.filter(c => c !== bgCol);
        },

        draw(p, w, h) {
           const areaX = w * areaPercent; //画面の幅
           const areaY = h * areaPercent; //画面の高さ
           const areaPosX = (w - areaX) / 2; //画面の幅
           const areaPosY = (h - areaY) / 2; //画面の高さ

           sinT = p.millis() * 0.002;
           let sinValue = p.sin(sinT);
           let amount = Math.round(p.map(sinValue, -1, 1, 0, maxParticles)); // 0~maxParticlesの間で粒子数を変化させる
           // 実際の粒子数を目標数 amount に合わせる (増える時は追加、減る時は削除)
           while(particles.length < amount){
                // 位置は領域内の 0〜1 の比率で持つ (描画サイズが変わっても追従するため)
                let x = p.random();
                let y = p.random();
                let col = p.random(cols);
                particles.push({x: x, y: y, col: col});
           }
           while(particles.length > amount){
                particles.pop();
           }

           p.background(bgCol);
           p.noStroke();
           const size = Math.min(w, h) * SIZE_RATIO;
             for(let i=0; i<particles.length; i++){
                  p.fill(particles[i].col);
                  p.ellipse(areaPosX + particles[i].x * areaX, areaPosY + particles[i].y * areaY, size, size);
             }


        },
    });
})();
