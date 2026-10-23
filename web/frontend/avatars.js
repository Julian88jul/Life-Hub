// Pixel-Avatare (24x24), aus Bausteinen zusammengesetzt. Jede Figur hat ein eigenes Merkmal.
var LH_AVATARS = (function () {
  var GOLD = "#f5c242", DARK = "#1b1b24", EYE = "#2a2140";
  var SK = {
    light: ["#f4d2b8", "#dba98c"], fair: ["#f1c9a5", "#d9a07a"], tan: ["#e0a979", "#c48a5c"],
    brown: ["#c68a5c", "#a06c46"], deep: ["#8a5a3c", "#6a4129"], ebony: ["#5a3a28", "#40281b"]
  };

  var DEFS = [
    { id: "mia", name: "Mia", touch: "Kopfhörer", bg: "#3f9d85", skin: "fair", hair: "long", hc: ["#4a2f22", "#35201a"], body: "tee", sc: ["#e0707a", "#e0707a"], mouth: "#a8434f", acc: [["phones", "#f26d9a"]] },
    { id: "lea", name: "Lea", touch: "Runde Brille", bg: "#7a5bd0", skin: "light", hair: "bun", hc: ["#c25a32", "#a44624"], body: "hoodie", sc: ["#e8b04a", "#f3cd7c"], mouth: "#b4505a", acc: [["round"], ["freckles", "#c98a6a"]] },
    { id: "zoe", name: "Zoe", touch: "Lippenpiercing", bg: "#dfa24f", skin: "deep", hair: "bob", hc: ["#3b7ddd", "#2b5fb0"], body: "tee", sc: ["#f1f1f6", "#f1f1f6"], mouth: "#4a1f2a", acc: [["lipring"]] },
    { id: "nora", name: "Nora", touch: "Stirnband", bg: "#8a8fa8", skin: "light", hair: "ponytail", hc: ["#e6c35a", "#c9a23e"], body: "hoodie", sc: ["#5fae5a", "#82c97c"], mouth: "#c2605f", acc: [["headband", "#e0463e"]] },
    { id: "ida", name: "Ida", touch: "Goldcreolen", bg: "#d6786f", skin: "ebony", hair: "afro", hc: ["#1f1612", "#35261f"], body: "tee", sc: ["#7a5bd0", "#7a5bd0"], mouth: "#c2384f", acc: [["earboth"]] },
    { id: "kim", name: "Kim", touch: "Nasenpiercing", bg: "#c06aa0", skin: "tan", hair: "buns2", hc: ["#1f1a24", "#34293f"], body: "hoodie", sc: ["#4f84dc", "#78a3ea"], mouth: "#b4505a", acc: [["nose"]] },

    { id: "max", name: "Max", touch: "Spiegelbrille", bg: "#6b8ba4", skin: "tan", hair: "mohawk", hc: ["#3fbf7f", "#2a8f5c"], body: "hoodie", sc: ["#3a3f58", "#50567a"], mouth: "#8a3b3b", acc: [["mirror"], ["earl"]] },
    { id: "ben", name: "Ben", touch: "Rote Kappe", bg: "#4f84dc", skin: "fair", hair: "crop", hc: ["#3a2a22", "#2a1d17"], body: "tee", sc: ["#2f8070", "#2f8070"], mouth: "#8a3b3b", acc: [["cap", "#d9453f", "#a83330"], ["stubble"]] },
    { id: "jonas", name: "Jonas", touch: "Vollbart", bg: "#6f63d9", skin: "fair", hair: "bald", hc: ["#b5502e", "#8e3d20"], body: "tee", sc: ["#8a8fa8", "#8a8fa8"], mouth: "#8a3b3b", acc: [["beard", "#b5502e"], ["earl"]] },
    { id: "leo", name: "Leo", touch: "Narbe", bg: "#5fae5a", skin: "brown", hair: "curly", hc: ["#2a1d17", "#3d2c24"], body: "hoodie", sc: ["#3f9d85", "#5fbfa5"], mouth: "#5a2a2a", acc: [["scar"]] },
    { id: "tim", name: "Tim", touch: "Augenbrauen-Piercing", bg: "#b08968", skin: "fair", hair: "quiff", hc: ["#e8c76a", "#c9a23e"], body: "hoodie", sc: ["#2f6bb0", "#4f8fd6"], mouth: "#8a3b3b", acc: [["brow"]] },
    { id: "sam", name: "Sam", touch: "Goldkette", bg: "#4a5568", skin: "deep", hair: "slick", hc: ["#1f1612", "#35261f"], body: "tee", sc: ["#e8e8f0", "#e8e8f0"], mouth: "#4a1f2a", acc: [["stache", "#1f1612"], ["chain"]] }
  ];

  function build(d) {
    var g = [], i;
    for (i = 0; i < 24; i++) g.push(new Array(24).fill(null));
    function px(x, y, c) { if (x >= 0 && x < 24 && y >= 0 && y < 24) g[y][x] = c; }
    function rect(x1, y1, x2, y2, c) { for (var y = y1; y <= y2; y++) for (var x = x1; x <= x2; x++) px(x, y, c); }
    var s = SK[d.skin][0], sh = SK[d.skin][1], h1 = d.hc[0], h2 = d.hc[1];
    var acc = {};
    d.acc.forEach(function (a) { acc[a[0]] = a; });

    // Hintergrundhaar (hinter dem Gesicht)
    if (d.hair === "long") { rect(5, 4, 18, 14, h1); rect(5, 15, 7, 18, h1); rect(16, 15, 18, 18, h1); }
    if (d.hair === "bob") { rect(5, 4, 18, 11, h1); px(5, 12, h2); px(18, 12, h2); }
    if (d.hair === "afro") { rect(7, 1, 16, 1, h1); rect(6, 2, 17, 2, h1); rect(5, 3, 18, 8, h1); }
    if (d.hair === "curly") { rect(7, 2, 16, 2, h1); rect(6, 3, 17, 5, h1); rect(5, 4, 5, 7, h1); rect(18, 4, 18, 7, h1); }

    // Körper
    rect(6, 16, 17, 16, d.sc[0]); rect(4, 17, 19, 17, d.sc[0]); rect(3, 18, 20, 18, d.sc[0]);
    for (i = 19; i <= 23; i++) rect(2, i, 21, i, d.sc[0]);
    if (d.body === "hoodie") {
      for (i = 16; i <= 18; i++) { px(10, i, "#e8e8f0"); px(13, i, "#e8e8f0"); px(9, i, d.sc[1]); px(14, i, d.sc[1]); }
      for (i = 19; i <= 23; i++) { px(10, i, d.sc[1]); px(13, i, d.sc[1]); }
    } else { rect(10, 16, 13, 16, s); rect(11, 17, 12, 17, s); px(10, 16, sh); px(13, 16, sh); }

    // Hals, Gesicht
    rect(8, 14, 15, 15, s); [[8, 14], [9, 14], [14, 14], [15, 14], [8, 15], [15, 15]].forEach(function (p) { px(p[0], p[1], sh); });
    rect(9, 5, 14, 5, s); rect(6, 6, 17, 12, s); rect(7, 13, 16, 13, s);
    px(11, 10, sh); px(12, 10, sh);
    if (d.hair === "bald") { rect(7, 4, 16, 4, s); rect(8, 3, 15, 3, s); px(10, 3, "#ffe3c9"); px(11, 3, "#ffe3c9"); px(10, 4, s); }
    rect(8, 7, 10, 7, h2); rect(13, 7, 15, 7, h2);
    px(9, 8, EYE); px(14, 8, EYE);
    rect(10, 12, 13, 12, d.mouth);

    // Vorderhaar
    var H = d.hair;
    if (H === "mohawk") { px(8, 2, h1); px(11, 2, h1); px(12, 2, h1); px(15, 2, h1); rect(7, 3, 16, 3, h1); rect(7, 4, 16, 4, h1); px(8, 4, h2); px(15, 4, h2); rect(7, 5, 8, 5, h1); rect(15, 5, 16, 5, h1); }
    if (H === "crop" || H === "bun" || H === "ponytail" || H === "buns2" || H === "bob" || H === "long") {
      rect(8, 3, 15, 3, h1); rect(7, 4, 16, 4, h1); px(8, 4, h2); px(15, 4, h2); rect(7, 5, 8, 5, h1); rect(15, 5, 16, 5, h1);
      if (H === "long" || H === "bob") { px(9, 5, h1); px(14, 5, h1); }
    }
    if (H === "bun") { rect(10, 1, 13, 2, h1); px(11, 1, h2); }
    if (H === "ponytail") { rect(18, 5, 19, 6, h1); rect(19, 7, 20, 12, h1); px(20, 13, h2); px(19, 13, h2); }
    if (H === "buns2") { rect(6, 2, 8, 3, h1); rect(15, 2, 17, 3, h1); px(7, 2, h2); px(16, 2, h2); }
    if (H === "afro") { rect(8, 4, 15, 4, h1); px(10, 3, h2); px(13, 2, h2); px(7, 5, h2); px(16, 4, h2); px(6, 3, h2); px(17, 6, h2); }
    if (H === "curly") { rect(8, 5, 9, 5, h1); rect(14, 5, 15, 5, h1); px(8, 3, h2); px(11, 3, h2); px(14, 2, h2); px(7, 5, h2); px(16, 4, h2); }
    if (H === "quiff") { rect(9, 1, 15, 1, h1); rect(8, 2, 16, 2, h1); rect(7, 3, 16, 3, h1); rect(7, 4, 16, 4, h1); px(10, 2, h2); px(13, 1, h2); px(8, 4, h2); rect(7, 5, 8, 5, h1); rect(15, 5, 16, 5, h1); }
    if (H === "slick") { rect(8, 3, 15, 3, h1); rect(7, 4, 16, 4, h1); px(7, 5, h1); px(16, 5, h1); px(9, 3, h2); px(11, 3, h2); px(13, 3, h2); px(10, 4, h2); px(12, 4, h2); }

    // Merkmale
    var a;
    if (acc.beard) { a = acc.beard[1]; rect(6, 9, 7, 12, a); rect(16, 9, 17, 12, a); rect(8, 11, 15, 11, a); rect(8, 12, 9, 12, a); rect(14, 12, 15, 12, a); rect(7, 13, 16, 13, a); rect(9, 14, 14, 14, a); px(11, 13, d.mouth); px(12, 13, d.mouth); rect(10, 12, 13, 12, d.mouth); }
    if (acc.stache) { a = acc.stache[1]; rect(9, 11, 14, 11, a); px(8, 12, a); px(15, 12, a); }
    if (acc.stubble) { [[8, 12], [15, 12], [9, 13], [12, 13], [14, 13], [7, 11], [16, 11], [10, 14], [13, 14]].forEach(function (p) { px(p[0], p[1], sh); }); }
    if (acc.freckles) { a = acc.freckles[1]; [[8, 9], [9, 10], [14, 10], [15, 9], [10, 9], [13, 9]].forEach(function (p) { px(p[0], p[1], a); }); }
    if (acc.scar) { px(15, 5, "#c97b6a"); px(15, 6, "#c97b6a"); px(16, 7, "#c97b6a"); px(16, 8, "#c97b6a"); }
    if (acc.mirror) { rect(7, 7, 16, 7, DARK); rect(7, 8, 16, 8, DARK); px(9, 8, "#7fd6ff"); px(14, 8, "#7fd6ff"); px(8, 7, "#3a3f58"); px(15, 7, "#3a3f58"); }
    if (acc.round) { var R = "#1f2230"; rect(7, 7, 10, 7, R); rect(7, 9, 10, 9, R); px(7, 8, R); px(10, 8, R); rect(13, 7, 16, 7, R); rect(13, 9, 16, 9, R); px(13, 8, R); px(16, 8, R); px(11, 8, R); px(12, 8, R); }
    if (acc.earl) { px(6, 9, GOLD); px(6, 10, GOLD); }
    if (acc.earboth) { [[6, 9], [6, 10], [6, 11], [17, 9], [17, 10], [17, 11]].forEach(function (p) { px(p[0], p[1], GOLD); }); px(7, 11, GOLD); px(16, 11, GOLD); }
    if (acc.nose) { px(13, 10, GOLD); }
    if (acc.lipring) { px(12, 13, GOLD); px(12, 14, GOLD); }
    if (acc.brow) { px(15, 6, GOLD); px(15, 7, GOLD); }
    if (acc.headband) { a = acc.headband[1]; rect(7, 4, 16, 4, a); px(6, 5, a); px(17, 5, a); px(8, 4, "#f27a74"); px(11, 4, "#f27a74"); px(14, 4, "#f27a74"); }
    if (acc.cap) { var c1 = acc.cap[1], c2 = acc.cap[2]; rect(8, 1, 15, 1, c1); rect(7, 2, 16, 4, c1); rect(6, 5, 17, 5, c2); px(11, 0, c2); px(12, 0, c2); px(9, 2, "#ec6b66"); px(10, 2, "#ec6b66"); }
    if (acc.phones) { a = acc.phones[1]; rect(6, 2, 17, 2, a); px(5, 3, a); px(18, 3, a); rect(5, 4, 5, 6, a); rect(18, 4, 18, 6, a); rect(4, 7, 5, 11, a); rect(18, 7, 19, 11, a); px(4, 8, "#fbb4cd"); px(19, 8, "#fbb4cd"); px(4, 10, "#c04876"); px(19, 10, "#c04876"); }
    if (acc.chain) { [[9, 16], [10, 17], [11, 18], [12, 18], [13, 17], [14, 16]].forEach(function (p) { px(p[0], p[1], GOLD); }); }
    return g;
  }

  function draw(canvas, id) {
    var d = DEFS.filter(function (x) { return x.id === id; })[0];
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = d.bg; ctx.fillRect(0, 0, 24, 24);
    var g = build(d);
    for (var y = 0; y < 24; y++) for (var x = 0; x < 24; x++) if (g[y][x]) { ctx.fillStyle = g[y][x]; ctx.fillRect(x, y, 1, 1); }
  }
  // Fertiges, rundes Bild (Canvas) für eine Figur; `size` in Pixeln
  function canvas(id, size) {
    var c = document.createElement("canvas");
    c.width = 24; c.height = 24;
    c.style.cssText = "width:" + size + "px;height:" + size + "px;image-rendering:pixelated;display:block";
    draw(c, id);
    return c;
  }
  function has(id) { return DEFS.some(function (x) { return x.id === id; }); }
  return { defs: DEFS, draw: draw, canvas: canvas, has: has };
})();
