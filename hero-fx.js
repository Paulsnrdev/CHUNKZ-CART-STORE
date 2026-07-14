(function () {
  var style = document.createElement('style');
  style.textContent =
    '.hero,.page-hero{position:relative;overflow:hidden}' +
    '.hp{position:absolute;border-radius:50%;pointer-events:none;' +
    'animation:hpFloat var(--d,9s) ease-in-out var(--dl,0s) infinite}' +
    '@keyframes hpFloat{' +
    '0%{transform:translateY(110%) translateX(0) scale(.85);opacity:0}' +
    '10%{opacity:1}' +
    '50%{transform:translateY(40%) translateX(var(--sx,12px)) scale(1)}' +
    '85%{opacity:.55}' +
    '100%{transform:translateY(-120%) translateX(0) scale(1.1);opacity:0}}';
  document.head.appendChild(style);

  function rand(min, max) { return Math.random() * (max - min) + min; }

  document.querySelectorAll('.hero,.page-hero').forEach(function (hero) {
    for (var i = 0; i < 18; i++) {
      var p   = document.createElement('span');
      p.className = 'hp';
      var size = rand(8, 90).toFixed(0);
      var sx   = (rand(-30, 30)).toFixed(0) + 'px';
      /* alternate between white particles and a subtle accent glow */
      var color = i % 7 === 0
        ? 'rgba(230,57,70,' + rand(.04, .1).toFixed(2) + ')'
        : 'rgba(255,255,255,' + rand(.03, .1).toFixed(2) + ')';
      p.style.cssText =
        'width:'  + size + 'px;' +
        'height:' + size + 'px;' +
        'left:'   + rand(0, 100).toFixed(1) + '%;' +
        'bottom:-' + size + 'px;' +
        'background:' + color + ';' +
        '--d:'  + rand(7, 17).toFixed(1) + 's;' +
        '--dl:' + rand(-16, 0).toFixed(1) + 's;' +
        '--sx:' + sx + ';' +
        'filter:blur(' + (size > 50 ? '2' : '0') + 'px)';
      hero.insertBefore(p, hero.firstChild);
    }
  });
})();
