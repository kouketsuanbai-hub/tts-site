// テキスト読み上げロジック（Web Speech API / ブラウザ完結・外部送信なし）
(function () {
  const synth = window.speechSynthesis;
  const input = document.getElementById('input');
  const highlight = document.getElementById('highlight');
  const voiceSel = document.getElementById('voice');
  const rate = document.getElementById('rate');
  const pitch = document.getElementById('pitch');
  const rateVal = document.getElementById('rateVal');
  const pitchVal = document.getElementById('pitchVal');
  const playBtn = document.getElementById('play');
  const pauseBtn = document.getElementById('pause');
  const stopBtn = document.getElementById('stop');
  const saveBtn = document.getElementById('save');
  const clearBtn = document.getElementById('clear');
  const count = document.getElementById('count');
  const STORAGE_KEY = 'tts-draft';
  const status = document.getElementById('status');
  const warn = document.getElementById('warn');

  let voices = [];
  let session = 0;       // 読み上げセッションID（停止・再開で無効化）
  let keepAlive = null;  // 途中停止を防ぐタイマー
  let lastPos = 0;       // 直近に読み上げた位置（停止時にカーソルを戻す）
  let savedSel = { s: 0, e: 0 }; // blur時に保存した選択・カーソル位置

  if (!synth) {
    warn.style.display = 'block';
    warn.textContent = 'このブラウザは音声合成に対応していません。Chrome / Edge / Safari の最新版をお試しください。';
    [playBtn, pauseBtn, stopBtn].forEach(b => b.disabled = true);
    return;
  }

  function loadVoices() {
    voices = synth.getVoices();
    voices.sort((a, b) => {
      const aj = a.lang.startsWith('ja') ? 0 : 1;
      const bj = b.lang.startsWith('ja') ? 0 : 1;
      return aj - bj || a.name.localeCompare(b.name);
    });
    voiceSel.innerHTML = '';
    voices.forEach((v, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = v.name + ' (' + v.lang + ')';
      voiceSel.appendChild(o);
    });
    if (voices.length === 0) {
      const o = document.createElement('option');
      o.textContent = '利用可能な音声がありません';
      voiceSel.appendChild(o);
    }
  }
  loadVoices();
  if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = loadVoices;

  // 前回の入力を復元
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) input.value = saved;

  function updateCount() { count.textContent = input.value.length + ' 文字'; }
  input.addEventListener('input', () => {
    updateCount();
    clearHighlight();
    localStorage.setItem(STORAGE_KEY, input.value);
  });
  input.addEventListener('scroll', () => { highlight.scrollTop = input.scrollTop; });
  updateCount();

  rate.addEventListener('input', () => rateVal.textContent = parseFloat(rate.value).toFixed(1) + 'x');
  pitch.addEventListener('input', () => pitchVal.textContent = parseFloat(pitch.value).toFixed(1));

  // 文・改行単位で分割。from〜to の範囲だけを対象にし、各チャンクは元テキスト内の絶対開始位置を保持する。
  function buildChunks(text, maxLen, from, to) {
    maxLen = maxLen || 140;
    from = from || 0;
    to = (to == null) ? text.length : to;
    const delims = '。．.！!？?\n';
    const chunks = [];
    let start = from, buf = '';
    for (let i = from; i < to; i++) {
      buf += text[i];
      const isDelim = delims.indexOf(text[i]) !== -1;
      if ((isDelim && buf.trim()) || buf.length >= maxLen) {
        chunks.push({ text: buf, start: start });
        start = i + 1;
        buf = '';
      }
    }
    if (buf.trim()) chunks.push({ text: buf, start: start });
    return chunks;
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function setHighlight(s, e) {
    const t = input.value;
    highlight.innerHTML = esc(t.slice(0, s)) + '<mark>' + esc(t.slice(s, e)) + '</mark>' + esc(t.slice(e));
    const m = highlight.querySelector('mark');
    if (m) { highlight.scrollTop = m.offsetTop - highlight.clientHeight / 2; input.scrollTop = highlight.scrollTop; }
  }
  function clearHighlight() { highlight.innerHTML = ''; }

  function setPlaying(on) { playBtn.disabled = on; pauseBtn.disabled = !on; stopBtn.disabled = !on; }

  function startKeepAlive() {
    stopKeepAlive();
    keepAlive = setInterval(() => {
      // 発話中（一時停止中でない）に限り pause→resume でタイマーをリセット
      if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
    }, 8000);
  }
  function stopKeepAlive() { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } }

  function finish() { setPlaying(false); status.textContent = ''; clearHighlight(); stopKeepAlive(); }

  // 英略語・記号を読みやすい表記に置換する辞書（speak() 前に適用）
  // 「読みが一意に決まる」語のみ。文脈依存の同音異義語は対象外。
  const DICT = [
    [/\bAI\b/g, 'エーアイ'],
    [/\bURL\b/g, 'ユーアールエル'],
    [/\bHTML\b/g, 'エイチティーエムエル'],
    [/\bCSS\b/g, 'シーエスエス'],
    [/\bJS\b/g, 'ジェーエス'],
    [/\bAPI\b/g, 'エーピーアイ'],
    [/\bPDF\b/g, 'ピーディーエフ'],
    [/\bSNS\b/g, 'エスエヌエス'],
    [/\bIT\b/g, 'アイティー'],
    [/\bPC\b/g, 'ピーシー'],
    [/\bSEO\b/g, 'エスイーオー'],
    [/\bID\b/g, 'アイディー'],
    [/\bOK\b/g, 'オーケー'],
    [/\bNG\b/g, 'エヌジー'],
    [/\bUI\b/g, 'ユーアイ'],
    [/\bUX\b/g, 'ユーエックス'],
    [/\bDX\b/g, 'ディーエックス'],
    [/\bSaaS\b/g, 'サース'],
    [/\bPR\b/g, 'ピーアール'],
    [/\bQR\b/g, 'キューアール'],
    [/\bEC\b/g, 'イーシー'],
    [/\bKPI\b/g, 'ケーピーアイ'],
    [/\bCTR\b/g, 'シーティーアール'],
    [/\bCVR\b/g, 'シーブイアール'],
    [/\bFAQ\b/g, 'エフエーキュー'],
    [/\bOS\b/g, 'オーエス'],
    [/\bGPT\b/g, 'ジーピーティー'],
    [/\bLLM\b/g, 'エルエルエム'],
    [/%/g, 'パーセント'],
  ];

  function applyDict(text) {
    let out = text;
    for (const [re, rep] of DICT) out = out.replace(re, rep);
    return out;
  }

  // blur時に選択・カーソル位置を保存（ボタンクリック時にフォーカスが外れる前に取得するため）
  input.addEventListener('blur', () => {
    savedSel = { s: input.selectionStart || 0, e: input.selectionEnd || 0 };
  });

  // 読み上げ範囲を決める：
  //  範囲選択あり → その範囲だけ／カーソルのみ → その位置から末尾まで／未選択 → 全文
  function resolveRange(text) {
    const s = savedSel.s;
    const e = savedSel.e;
    if (e > s) return { from: s, to: e };           // 選択範囲だけ読む
    if (s > 0) return { from: s, to: text.length }; // カーソル位置から末尾まで
    return { from: 0, to: text.length };             // 全文
  }

  function speak() {
    const text = input.value;
    if (!text.trim()) { input.focus(); return; }
    synth.cancel();
    const my = ++session;                 // このセッションを最新に
    const range = resolveRange(text);
    const chunks = buildChunks(text, 140, range.from, range.to);
    if (chunks.length === 0) { input.focus(); return; }
    let idx = 0;
    lastPos = range.from;
    setPlaying(true);
    status.textContent = range.from > 0 ? '選択位置から読み上げ中' : '読み上げ中';
    startKeepAlive();

    function next() {
      if (my !== session) return;  // 停止/再開されたら中断
      if (idx >= chunks.length) { lastPos = range.to; finish(); return; }
      const c = chunks[idx];
      const u = new SpeechSynthesisUtterance(applyDict(c.text)); // 誤読辞書を適用して発話
      const vi = parseInt(voiceSel.value, 10);
      if (voices[vi]) { u.voice = voices[vi]; u.lang = voices[vi].lang; }
      u.rate = parseFloat(rate.value);
      u.pitch = parseFloat(pitch.value);
      u.onboundary = (e) => {
        if (e.charIndex == null || my !== session) return;
        const len = e.charLength || (c.text.slice(e.charIndex).match(/^\S+/) || [''])[0].length || 1;
        lastPos = c.start + e.charIndex;
        setHighlight(c.start + e.charIndex, c.start + e.charIndex + len);
      };
      u.onend = () => { if (my !== session) return; lastPos = c.start + c.text.length; idx++; next(); };
      u.onerror = () => { if (my !== session) return; idx++; next(); };
      synth.speak(u);
    }
    next();
  }

  playBtn.addEventListener('click', speak);
  pauseBtn.addEventListener('click', () => {
    if (synth.paused) { synth.resume(); pauseBtn.textContent = '一時停止'; status.textContent = '読み上げ中'; }
    else if (synth.speaking) { synth.pause(); pauseBtn.textContent = '再開'; status.textContent = '一時停止中'; }
  });
  stopBtn.addEventListener('click', () => {
    session++;                     // 進行中セッションを無効化
    synth.cancel();
    finish();
    pauseBtn.textContent = '一時停止';
    // 停止位置にカーソルを移し、続きから読み上げやすくする（位置を取得できたブラウザのみ）
    if (lastPos > 0 && lastPos <= input.value.length) {
      input.focus();
      input.setSelectionRange(lastPos, lastPos);
      savedSel = { s: lastPos, e: lastPos }; // 続きから読み上げに備えて更新
    }
  });
  saveBtn.addEventListener('click', () => {
    const text = input.value;
    if (!text.trim()) return;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tts-text.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  clearBtn.addEventListener('click', () => {
    session++;
    synth.cancel();
    input.value = '';
    lastPos = 0;
    savedSel = { s: 0, e: 0 };
    localStorage.removeItem(STORAGE_KEY);
    updateCount();
    finish();
    pauseBtn.textContent = '一時停止';
    input.focus();
  });

  window.addEventListener('beforeunload', () => { session++; synth.cancel(); stopKeepAlive(); });
})();
