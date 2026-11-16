// HUD: every DOM element the game shows, built here and styled here, so
// index.html stays a shell. The match loop calls update() once a frame with
// plain state; text is only rewritten when it changes.
import { CFG } from './config.js';

const CSS = `
#hud{position:fixed;inset:0;pointer-events:none;font-family:'Segoe UI',system-ui,sans-serif;color:#eef1f6;user-select:none}
#cross{position:absolute;left:50%;top:50%;width:0;height:0}
#cross i{position:absolute;background:#eef1f6;box-shadow:0 0 2px #000}
#cross .h{width:9px;height:2px;top:-1px}
#cross .v{width:2px;height:9px;left:-1px}
#cross .dot{width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%}
#hitm{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;opacity:0}
#hitm:before,#hitm:after{content:'';position:absolute;left:10px;top:0;width:2px;height:22px;background:#ff5d5d;transform:rotate(45deg)}
#hitm:after{transform:rotate(-45deg)}
.panel{position:absolute;background:rgba(12,14,20,.72);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:8px 12px}
#hpbox{left:22px;bottom:20px;min-width:210px}
#hpbar{height:10px;background:#22262e;border-radius:5px;overflow:hidden;margin-top:4px}
#hpfill{height:100%;background:#43d17c;width:100%}
#armorline{font-size:12px;color:#9fb4d8;margin-top:3px}
#ammobox{right:22px;bottom:20px;text-align:right;min-width:150px}
#ammobox .big{font-size:30px;font-weight:700;line-height:1}
#ammobox .small{font-size:13px;color:#aab}
#moneybox{right:22px;top:20px;text-align:right}
#moneybox .m{font-size:22px;font-weight:700;color:#ffd27a}
#timerbox{left:50%;top:16px;transform:translateX(-50%);text-align:center}
#timerbox .t{font-size:28px;font-weight:700}
#timerbox .s{font-size:14px;letter-spacing:1px}
#timerbox .bomb{font-size:13px;color:#ff8a7a}
#teams{left:22px;top:20px;font-size:13px;line-height:1.5}
#teams b{letter-spacing:1px}
#feed{right:22px;top:110px;text-align:right;font-size:13px;line-height:1.7}
#feed .hs{color:#ff5d5d}
#banner{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity .25s}
#banner.show{opacity:1}
#banner.still{transition:none;opacity:1}
#banner h1{font-size:44px;margin:0;letter-spacing:2px;white-space:nowrap;text-shadow:0 2px 18px rgba(0,0,0,.7)}
#banner p{font-size:18px;margin:6px 0 0;color:#dfe6f2}
#channel{position:absolute;left:50%;top:58%;transform:translateX(-50%);width:280px;text-align:center;display:none}
#channel .bar{height:8px;background:#22262e;border-radius:4px;overflow:hidden}
#channel .fill{height:100%;background:#ffb347;width:0%}
#hint{position:absolute;left:50%;bottom:110px;transform:translateX(-50%);font-size:15px;background:rgba(12,14,20,.7);padding:6px 14px;border-radius:6px;display:none}
#vig{position:absolute;inset:0;box-shadow:inset 0 0 120px rgba(255,30,30,0);pointer-events:none}
#flashov{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
#scopeov{position:absolute;inset:0;opacity:0;pointer-events:none;background:radial-gradient(circle at center,transparent 31%,rgba(0,0,0,.97) 33%)}
#scopeov:before,#scopeov:after{content:'';position:absolute;background:rgba(0,0,0,.9)}
#scopeov:before{left:50%;top:0;width:1px;height:100%}
#scopeov:after{left:0;top:50%;height:1px;width:100%}
#buy{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;background:rgba(10,12,18,.92);border:1px solid rgba(255,179,71,.45);border-radius:10px;padding:16px 18px;pointer-events:auto;display:none}
#buy h2{margin:0 0 4px;font-size:18px;letter-spacing:2px;color:#ffb347}
#buy .sub{font-size:13px;color:#aab;margin-bottom:10px}
#buy .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#buy button{display:block;width:100%;text-align:left;background:#1a1e28;border:1px solid #333a48;color:#eef1f6;border-radius:6px;padding:8px 10px;font-size:14px;cursor:pointer}
#buy button:hover:not(:disabled){border-color:#ffb347}
#buy button:disabled{opacity:.38;cursor:default}
#buy button b{float:right;color:#ffd27a}
#buy .close{margin-top:10px;font-size:12px;color:#aab;text-align:center}
#menu{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;background:radial-gradient(ellipse at 50% 40%,rgba(43,47,74,.92),rgba(8,9,14,.96));color:#eef1f6;font-family:'Segoe UI',system-ui,sans-serif;text-align:center;z-index:10}
#menu h1{font-size:64px;letter-spacing:8px;margin:0;color:#ffb347;text-shadow:0 4px 30px rgba(255,179,71,.35)}
#menu h2{font-size:16px;letter-spacing:4px;color:#35c4b5;margin:6px 0 18px}
#menu p{max-width:520px;line-height:1.6;color:#c6cede}
#menu button{pointer-events:auto;margin-top:22px;font-size:20px;padding:14px 44px;border-radius:8px;border:1px solid #ffb347;background:#ffb347;color:#1a1408;font-weight:700;cursor:pointer}
#menu button:hover{background:#ffc46b}
#menu .keys{margin-top:18px;font-size:13px;color:#8a93a8}
`;

export function createHud(onBuy) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div id="cross"><i class="h" style="left:-16px"></i><i class="h" style="left:7px"></i>
      <i class="v" style="top:-16px"></i><i class="v" style="top:7px"></i><i class="dot"></i></div>
    <div id="hitm"></div>
    <div class="panel" id="hpbox"><div>HEALTH <span id="hpnum">100</span></div>
      <div id="hpbar"><div id="hpfill"></div></div><div id="armorline"></div></div>
    <div class="panel" id="ammobox"><div class="big"><span id="mag">15</span> <span class="small">/ <span id="res">45</span></span></div>
      <div class="small" id="wname">P9 Sidearm</div></div>
    <div class="panel" id="moneybox"><div class="m" id="money">$800</div><div class="small">BUY [B]</div></div>
    <div class="panel" id="timerbox"><div class="t" id="timer">1:40</div>
      <div class="s" id="scoreline">KESTRELS 0 — 0 BASTION</div><div class="bomb" id="bombline"></div></div>
    <div class="panel" id="teams"></div>
    <div id="feed"></div>
    <div id="banner"><h1 id="btitle"></h1><p id="bsub"></p></div>
    <div id="channel"><div id="chlabel">PLANTING…</div><div class="bar"><div class="fill" id="chfill"></div></div></div>
    <div id="hint"></div>
    <div id="vig"></div><div id="flashov"></div><div id="scopeov"></div>
    <div id="buy"><h2>BUY MENU</h2><div class="sub">Spend the round's money before the buy phase ends. Keys 1–7 work too.</div>
      <div class="grid" id="buygrid"></div><div class="close">Press B or Esc to close</div></div>`;
  document.body.appendChild(root);

  const menu = document.createElement('div');
  menu.id = 'menu';
  menu.innerHTML = `
    <h1>CROSSYARD</h1><h2>KESTRELS vs BASTION — DUSK FREIGHT YARD</h2>
    <p>A round-based tactical shooter. Plant the charge at <b>the Yard</b> or wipe out
    Bastion — first to 7 rounds takes the match. Earn money, buy guns between
    rounds, and stop moving before you shoot: accuracy beats speed here.</p>
    <button id="play">PLAY</button>
    <div class="keys">WASD move · Mouse aim · Click fire · R reload · 1–4 weapons · 5–7 grenades · B buy · E plant / defuse · C crouch · Right-click scope (Longbow)</div>`;
  document.body.appendChild(menu);

  const $ = (id) => document.getElementById(id);
  const els = {
    hpnum: $('hpnum'), hpfill: $('hpfill'), armorline: $('armorline'),
    mag: $('mag'), res: $('res'), wname: $('wname'), money: $('money'),
    timer: $('timer'), scoreline: $('scoreline'), bombline: $('bombline'),
    teams: $('teams'), feed: $('feed'), banner: $('banner'),
    btitle: $('btitle'), bsub: $('bsub'), channel: $('channel'),
    chlabel: $('chlabel'), chfill: $('chfill'), hint: $('hint'),
    vig: $('vig'), flashov: $('flashov'), scopeov: $('scopeov'),
    cross: $('cross'), hitm: $('hitm'), buy: $('buy'), buygrid: $('buygrid'),
    menu, play: $('play'),
  };

  // Buy grid, built once from the config tables.
  const items = [
    ...Object.entries(CFG.weapons).map(([k, w]) => ({ key: k, label: w.name, price: w.price, slot: w.slot })),
    ...Object.entries(CFG.grenades).map(([k, g]) => ({ key: 'n:' + k, label: g.name, price: g.price })),
    { key: 'armor', label: 'Vest + Helmet', price: CFG.armorPrice },
  ];
  for (const it of items) {
    const b = document.createElement('button');
    b.dataset.key = it.key;
    b.innerHTML = `${it.label}<b>$${it.price}</b>`;
    b.addEventListener('click', () => onBuy(it.key));
    els.buygrid.appendChild(b);
  }

  let last = {};
  let hintUntil = 0;
  const feedLines = [];

  function setText(el, key, value) {
    if (last[key] !== value) { last[key] = value; el.textContent = value; }
  }

  return {
    els,
    showMenu(show) { els.menu.style.display = show ? 'flex' : 'none'; },
    onPlay(cb) { els.play.addEventListener('click', cb); },
    banner(title, sub, color, still = false) {
      els.btitle.textContent = title;
      els.btitle.style.color = color || '#fff';
      els.bsub.textContent = sub || '';
      els.banner.classList.add('show');
      els.banner.classList.toggle('still', still);
    },
    hideBanner() { els.banner.classList.remove('show', 'still'); },
    killfeed(killer, victim, headshot, weapon) {
      feedLines.push(`<div>${killer} <span class="hs">${headshot ? '◉ ' : ''}${weapon}</span> ${victim}</div>`);
      if (feedLines.length > 5) feedLines.shift();
      els.feed.innerHTML = feedLines.join('');
    },
    hitmarker() {
      els.hitm.style.opacity = '1';
      setTimeout(() => { els.hitm.style.opacity = '0'; }, 90);
    },
    hint(text, ms = 2500) {
      els.hint.textContent = text;
      els.hint.style.display = 'block';
      hintUntil = performance.now() + ms;
    },
    setBuyVisible(show) { els.buy.style.display = show ? 'block' : 'none'; },
    update(match, player, now) {
      const p = player;
      setText(els.hpnum, 'hp', String(Math.max(0, Math.ceil(p.hp))));
      els.hpfill.style.width = Math.max(0, p.hp) + '%';
      els.hpfill.style.background = p.hp > 50 ? '#43d17c' : p.hp > 25 ? '#ffb347' : '#ff5d5d';
      setText(els.armorline, 'ar', p.armor > 0 ? `ARMOR ${Math.ceil(p.armor)}` : 'NO ARMOR');
      setText(els.mag, 'mag', String(p.mag));
      setText(els.res, 'res', String(p.reserve));
      const wdef = CFG.weapons[p.weapon];
      setText(els.wname, 'wn', p.reloading > 0 ? `${wdef.name} — RELOADING` : wdef.name);
      setText(els.money, 'money', '$' + Math.floor(p.money));
      const t = Math.max(0, Math.ceil(match.timer));
      setText(els.timer, 'timer', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      setText(els.scoreline, 'score',
        `${CFG.teams.attack.label.toUpperCase()} ${match.score.attack} — ${match.score.defend} ${CFG.teams.defend.label.toUpperCase()} · ROUND ${match.round}`);
      setText(els.bombline, 'bomb', match.bomb.state === 'planted'
        ? `CHARGE PLANTED — ${Math.max(0, match.bomb.endsAt - match.now).toFixed(0)}s`
        : match.bomb.state === 'carried' ? 'CHARGE CARRIED — GET IT TO THE YARD' : '');
      // Rosters.
      const roster = (team) => match.agents.filter((a) => a.team === team)
        .map((a) => `<div style="color:${a.alive ? '#eef1f6' : '#5a6274'}">${a.alive ? '●' : '○'} ${a.name}${a.hasBomb ? ' ◆' : ''}</div>`).join('');
      const html = `<b style="color:${CFG.teams.attack.css}">KESTRELS</b>${roster('attack')}<b style="color:${CFG.teams.defend.css}">BASTION</b>${roster('defend')}`;
      if (last.teams !== html) { last.teams = html; els.teams.innerHTML = html; }
      // Buy buttons enable/disable with the player's money.
      if (match.phase === 'buy') {
        for (const b of els.buygrid.children) {
          const key = b.dataset.key;
          const price = key === 'armor' ? CFG.armorPrice
            : key.startsWith('n:') ? CFG.grenades[key.slice(2)].price
            : CFG.weapons[key].price;
          b.disabled = p.money < price || !p.alive;
        }
      }
      // Crosshair gap grows with spread; hidden while scoped or in menus.
      const spread = match.spreadPx || 8;
      els.cross.style.display = (p.scoped || match.phase === 'menu') ? 'none' : 'block';
      const arms = els.cross.children;
      for (const arm of arms) {
        if (arm.classList.contains('h')) {
          arm.style.left = arm.style.left.startsWith('-') ? `${-7 - spread}px` : `${7 + spread}px`;
        } else if (arm.classList.contains('v')) {
          arm.style.top = arm.style.top.startsWith('-') ? `${-7 - spread}px` : `${7 + spread}px`;
        }
      }
      // Damage vignette, flash blindness, scope overlay.
      els.vig.style.boxShadow = `inset 0 0 120px rgba(255,30,30,${p.hurtFlash || 0})`;
      els.flashov.style.opacity = String(Math.min(1, p.flashBlind / 2.5));
      els.scopeov.style.opacity = p.scoped ? '1' : '0';
      if (performance.now() > hintUntil) els.hint.style.display = 'none';
      // Plant / defuse channel bar.
      if (match.channel.active) {
        els.channel.style.display = 'block';
        els.chlabel.textContent = match.channel.label;
        els.chfill.style.width = `${Math.min(100, match.channel.progress * 100)}%`;
      } else {
        els.channel.style.display = 'none';
      }
    },
  };
}
