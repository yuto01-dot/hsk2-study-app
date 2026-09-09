/* ==========================================================================
   HSK2 問題演習モジュール（オリジナル問題180問／公式公開問題の解答記録）
   既存アプリ（index.html）とは別モジュールとして動作し、
   #exam-root に自身の画面を描画する。既存の #hsk-root とは排他表示。
   ========================================================================== */
(function () {
  "use strict";

  const DATA_BASE = "quiz-data/";
  const DATA_FILES = {
    qb: "question_bank.json",
    mm: "mock_manifest.json",
    am: "asset_manifest.json",
    op: "official_papers.json",
    pe: "part_examples.json",
    ti: "tag_index.json",
    sv: "support_vocab.json"
  };

  const LS_ATTEMPTS = "hsk-exam-attempts-v1";      // オリジナル180問の解答履歴
  const LS_OFFICIAL = "hsk-exam-official-v1";      // 公式公開問題の解答履歴
  const LS_SESSION = "hsk-exam-session-v1";        // 中断・再開用の進行中セッション
  const LS_TTS_OK = "hsk-exam-tts-ok-v1";          // 中国語音声の試し再生に成功したか

  const DISPLAY = {
    original: "オリジナル問題",
    official: "公式公開問題"
  };

  // --------------------------------------------------------------------
  // 文法・表現の復習メモ（RESEARCH.md「文法・表現の復習表」より要約）
  // 既存アプリの文法IDが未整備（tag_index.json は全項目 existing_app_grammar_id: null）
  // のため、タグごとの短い復習メモをここに保持し、該当がなければ
  // 「既存の単語学習に戻って確認する」という汎用の導線のみ出す。
  // --------------------------------------------------------------------
  const REVIEW_NOTES = {
    negation: "不／没（有）：習慣・意志の否定と、過去の未実行・存在の否定を文脈で区別する。",
    correction: "不是…、是…：最初の候補を否定したあとの訂正が答えになりやすい。",
    completion: "動詞＋了／已经：出来事の成立・完了を表す。単純な過去時制だけに固定しない。",
    not_yet: "还没：未完了。已经との対比で読む。",
    progressive: "在／正在…呢：進行中の動作を表す。場所を表す「在」と混同しない。",
    experience: "動詞＋过：経験の有無を表す。",
    result: "動詞＋完／到など：動作の結果を表す補語（看完・找到 など）。",
    comparison: "A比B＋形容詞：比較の方向と差を確認する。",
    reason: "因为／所以：理由と結果のどちらが問われているかを確認する。",
    contrast: "虽然…但是…：前半の事情と後半の結論のうち、結論側を答えにする。",
    plan: "想／要／准备：希望・意図・予定を表す。すでに実行済みとは限らない。",
    time: "几点／多少／几／多长时间：時刻・数量・期間を取り違えない。",
    location: "上／下／左／右／旁边／外：対象物と位置をセットで覚える。",
    distance: "从…到…／离：移動の起点・終点と距離を整理する。",
    duration: "多久／多长时间：所要時間・期間を尋ねる表現。",
    permission: "会／能／可以：技能・可能・許可を場面で区別する。",
    classifier: "数字＋量詞：两个人、几杯、几次など、名詞ごとの量詞に注意する。",
    number: "数字の聞き取り・計算は問われている単位（人数・金額・時刻など）を先に確認する。",
    prohibition: "别＋動詞：禁止・制止を表す。",
    recipient: "給＋人＋動詞：動作の相手を表す。",
    shi_de: "是…的：すでに起きた事の時・方法・行為者に焦点を当てる構文。",
    degree_complement: "動詞＋得＋評価：動作の上手さや程度を表す。",
    state: "動詞＋着：動作・状態の持続を表す。",
    scope: "每／都／也／最：頻度・範囲・追加・最上級を表す副詞。",
    again: "再：これから繰り返される動作に使う（過去の繰り返しは又）。",
    immediacy: "就：早さ・即時性を表す。",
    degree: "太…了／有点儿：程度・評価を表す表現。",
    distractor: "聞こえた情報の中に誤答を誘う別の情報が混じる。最後まで聞いてから判断する。",
    response: "感謝・謝罪・依頼・許可・提案などは、疑問詞がなくても返答の役割で対応を判断できる。",
    question: "谁／哪儿／几点／多久／为什么など、疑問詞と返答の対応を確認する。",
    unsupported: "本文に書かれていない内容は「根拠なし」として誤りと判断する。"
  };
  const REVIEW_NOTE_FALLBACK = "この問題に対応する文法メモは未整備です。関連する単語を既存の単語学習で復習してください。";

  // --------------------------------------------------------------------
  // モジュール内 state
  // --------------------------------------------------------------------
  let D = null;          // 読み込んだ全データ（loadData() 参照）
  let X = {
    screen: "menu",       // menu | session | official | result | resultOfficial
    ttsState: "unknown",  // unknown | checking | available | unavailable
    ttsVoice: null,
    ttsVoicesZh: [],
    session: null,
    resumeBanner: null,   // 再開可能な保存セッションがあれば入れる
    reviewFilter: "all",  // all | wrong | low_confidence
    accessibleMode: false
  };
  let audioPlaying = false;
  let audioStopRequested = false;

  // ======================================================================
  // スタイル注入（既存の CSS 変数・部品クラスを再利用しつつ、演習専用の見た目を追加）
  // ======================================================================
  function injectStyles() {
    if (document.getElementById("exam-style")) return;
    const style = document.createElement("style");
    style.id = "exam-style";
    style.textContent = `
      #exam-root .exam-menu-list { display:flex; flex-direction:column; gap:10px; margin-bottom:18px; }
      #exam-root .exam-menu-btn {
        background: var(--paper-raised); border: none; border-radius: 16px; padding: 16px;
        text-align:left; cursor:pointer; box-shadow: 0 1px 2px rgba(27,31,42,0.06);
      }
      #exam-root .exam-menu-btn.primary { background: var(--indigo); color:#fff; }
      #exam-root .exam-menu-btn .t { font-size:15px; font-weight:700; }
      #exam-root .exam-menu-btn .d { font-size:12px; margin-top:4px; opacity:0.85; }
      #exam-root .exam-menu-btn.primary .d { color: rgba(255,255,255,0.85); }
      #exam-root .exam-menu-btn:not(.primary) .d { color: var(--ink-soft); }
      #exam-root .exam-note {
        font-size:11px; color: var(--ink-soft); background: var(--indigo-soft);
        border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; line-height:1.6;
      }
      #exam-root .exam-tts-row {
        display:flex; align-items:center; justify-content:space-between; gap:8px;
        background: var(--paper-raised); border-radius: 12px; padding: 10px 12px; margin-bottom: 14px;
      }
      #exam-root .exam-tts-row .lbl { font-size:12px; color: var(--ink-soft); }
      #exam-root .exam-tts-btn {
        border:none; border-radius: 10px; padding: 8px 12px; font-size:12px; font-weight:700; cursor:pointer;
        background: var(--indigo-soft); color: var(--indigo);
      }
      #exam-root .exam-tts-btn.ok { background: var(--jade-soft); color: var(--jade); }
      #exam-root .exam-tts-btn.err { background: var(--stamp-soft); color: var(--stamp); }
      #exam-root .exam-format-grid { display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:14px; }
      #exam-root .exam-format-btn {
        border: 1px solid var(--indigo-soft); background: var(--paper-raised); border-radius: 12px;
        padding: 10px; text-align:left; cursor:pointer; font-size:12px; color: var(--ink);
      }
      #exam-root .exam-format-btn b { display:block; font-size:14px; margin-bottom:2px; }
      #exam-root .exam-format-btn:disabled { opacity:0.4; cursor:default; }
      #exam-root .exam-card {
        background: var(--paper-raised); border-radius: 18px; padding: 20px 16px; margin-bottom:16px;
        box-shadow: 0 2px 10px rgba(27,31,42,0.06);
      }
      #exam-root .exam-zh { font-size:20px; line-height:1.6; font-family: "Hiragino Mincho ProN","Noto Serif JP",serif; }
      #exam-root .exam-pinyin { font-size:12px; color: var(--ink-soft); margin-top:4px; }
      #exam-root .exam-play-btn {
        border:none; border-radius: 999px; padding: 10px 18px; font-weight:700; font-size:13px; cursor:pointer;
        background: var(--indigo); color:#fff; margin: 10px 0;
      }
      #exam-root .exam-play-btn:disabled { opacity:0.5; cursor:default; }
      #exam-root .exam-play-count { font-size:11px; color: var(--ink-soft); margin-left:8px; }
      #exam-root .exam-img-box { text-align:center; margin: 10px 0; }
      #exam-root .exam-img-box img { width: 120px; height: 120px; object-fit:contain; }
      #exam-root .exam-alt-text { font-size:14px; color: var(--ink); background: var(--paper); border-radius:10px; padding:14px; text-align:center; }
      #exam-root .exam-image-grid { display:grid; grid-template-columns: repeat(3,1fr); gap:8px; margin: 10px 0; }
      #exam-root .exam-image-opt {
        border: 2px solid var(--indigo-soft); border-radius: 12px; padding: 8px; background: var(--paper-raised);
        cursor:pointer; text-align:center; min-height: 44px;
      }
      #exam-root .exam-image-opt img { width: 56px; height:56px; object-fit:contain; }
      #exam-root .exam-image-opt .lab { font-size:11px; color: var(--ink-soft); margin-top:2px; }
      #exam-root .exam-image-opt.correct { border-color: var(--jade); background: var(--jade-soft); }
      #exam-root .exam-image-opt.wrong { border-color: var(--stamp); background: var(--stamp-soft); }
      #exam-root .exam-image-opt.selected:not(.correct):not(.wrong) { border-color: var(--indigo); }
      #exam-root .exam-group-note { font-size:11px; color: var(--ink-soft); margin: 4px 0 10px; }
      #exam-root .exam-timer {
        display:flex; align-items:center; justify-content:space-between; background: var(--paper-raised);
        border-radius: 12px; padding: 10px 14px; margin-bottom:14px; font-weight:700; font-size:13px; color: var(--indigo);
      }
      #exam-root .exam-timer.low { color: var(--stamp); }
      #exam-root .exam-explain {
        background: var(--indigo-soft); border-radius: 12px; padding: 12px 14px; margin-top: 8px; font-size:13px; line-height:1.6;
      }
      #exam-root .exam-explain .tags { margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
      #exam-root .exam-tag-chip {
        background: var(--paper-raised); border-radius: 999px; padding: 4px 10px; font-size:11px; color: var(--indigo);
        border: 1px solid var(--indigo-soft); cursor:pointer;
      }
      #exam-root .exam-review-note { font-size:12px; color: var(--ink-soft); margin-top:6px; background: var(--paper); border-radius:8px; padding:8px; }
      #exam-root .exam-confidence-row { display:flex; gap:8px; margin-top:10px; }
      #exam-root .exam-conf-btn {
        flex:1; border:1px solid var(--indigo-soft); background: var(--paper-raised); border-radius:10px;
        padding:8px; font-size:12px; cursor:pointer; color: var(--ink);
      }
      #exam-root .exam-conf-btn.active { background: var(--indigo); color:#fff; border-color: var(--indigo); }
      #exam-root .exam-resume-banner {
        background: var(--gold); color:#fff; border-radius: 12px; padding: 12px; margin-bottom:14px; font-size:12px;
      }
      #exam-root .exam-resume-banner .row { display:flex; gap:8px; margin-top:8px; }
      #exam-root .exam-resume-banner button {
        flex:1; border:none; border-radius:8px; padding:8px; font-weight:700; font-size:12px; cursor:pointer;
      }
      #exam-root .exam-wrong-list { display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
      #exam-root .exam-wrong-row {
        background: var(--paper-raised); border-radius:12px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center;
      }
      #exam-root .exam-wrong-row .zh { font-size:14px; }
      #exam-root .exam-wrong-row .meta { font-size:11px; color: var(--ink-soft); }
      #exam-root .exam-official-grid { display:grid; grid-template-columns: repeat(5, 1fr); gap:6px; margin-bottom:16px; }
      #exam-root .exam-official-cell {
        background: var(--paper-raised); border-radius:10px; padding:6px 2px; text-align:center; font-size:11px;
      }
      #exam-root .exam-official-cell .num { font-weight:700; margin-bottom:4px; }
      #exam-root .exam-official-cell select {
        width:100%; font-size:11px; border-radius:6px; border:1px solid var(--indigo-soft); padding:3px;
      }
      #exam-root .exam-score-box { text-align:center; padding: 18px 10px; }
      #exam-root .exam-score-num { font-size: 40px; font-weight:700; color: var(--indigo); }
      #exam-root .exam-score-label { font-size:12px; color: var(--ink-soft); margin-top:4px; }
      #exam-root .exam-score-sub { display:flex; justify-content:center; gap:24px; margin-top:16px; }
      #exam-root .exam-score-sub .n { font-size:20px; font-weight:700; color: var(--jade); }
      #exam-root .exam-score-sub .l { font-size:11px; color: var(--ink-soft); }
      #exam-root .exam-disclaimer { font-size:11px; color: var(--ink-soft); text-align:center; margin-top:10px; }
      #exam-root .exam-pdf-btn {
        display:inline-block; background: var(--indigo); color:#fff; border-radius:10px; padding:10px 16px;
        font-size:13px; font-weight:700; text-decoration:none; margin-bottom: 10px;
      }
      #exam-root .exam-accessible-toggle { font-size:11px; color: var(--indigo); background:none; border:none; cursor:pointer; text-decoration:underline; margin-top:4px; }
    `;
    document.head.appendChild(style);
  }

  // ======================================================================
  // データ読み込み
  // ======================================================================
  function loadData() {
    const entries = Object.entries(DATA_FILES);
    return Promise.all(entries.map(([, file]) => fetch(DATA_BASE + file).then((r) => {
      if (!r.ok) throw new Error("fetch failed: " + file);
      return r.json();
    }))).then((results) => {
      const raw = {};
      entries.forEach(([key], i) => { raw[key] = results[i]; });

      const questionsById = {};
      raw.qb.questions.forEach((q) => { questionsById[q.id] = q; });
      const groupsById = {};
      raw.qb.groups.forEach((g) => { groupsById[g.id] = g; });
      const assetsById = {};
      raw.am.assets.forEach((a) => { assetsById[a.id] = a; });
      const tagsById = {};
      raw.ti.tags.forEach((t) => { tagsById[t.id] = t; });

      D = {
        contentVersion: raw.qb.content_version,
        questions: raw.qb.questions,
        groups: raw.qb.groups,
        questionsById, groupsById, assetsById, tagsById,
        mocks: raw.mm.mocks,
        assets: raw.am.assets,
        papers: raw.op.papers,
        examples: raw.pe.examples,
        supportVocab: raw.sv.entries
      };
    });
  }

  // ======================================================================
  // TTS（中国語音声）
  // ======================================================================
  function pickZhVoices() {
    if (!("speechSynthesis" in window)) return [];
    const voices = window.speechSynthesis.getVoices() || [];
    return voices.filter((v) => /^zh/i.test(v.lang));
  }

  function ensureVoicesLoaded() {
    return new Promise((resolve) => {
      let voices = pickZhVoices();
      if (voices.length > 0) { resolve(voices); return; }
      if (!("speechSynthesis" in window)) { resolve([]); return; }
      let resolved = false;
      const handler = () => {
        if (resolved) return;
        voices = pickZhVoices();
        if (voices.length > 0) {
          resolved = true;
          window.speechSynthesis.removeEventListener("voiceschanged", handler);
          resolve(voices);
        }
      };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve(pickZhVoices());
      }, 1200);
    });
  }

  function testTts() {
    X.ttsState = "checking";
    render();
    return ensureVoicesLoaded().then((voices) => {
      X.ttsVoicesZh = voices;
      if (!("speechSynthesis" in window) || voices.length === 0) {
        X.ttsState = "unavailable";
        render();
        return;
      }
      X.ttsVoice = voices[0];
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance("你好");
        u.lang = voices[0].lang || "zh-CN";
        u.voice = voices[0];
        let done = false;
        u.onend = () => {
          if (done) return; done = true;
          X.ttsState = "available";
          try { localStorage.setItem(LS_TTS_OK, "1"); } catch (e) {}
          render();
          resolve();
        };
        u.onerror = () => {
          if (done) return; done = true;
          X.ttsState = "unavailable";
          render();
          resolve();
        };
        window.speechSynthesis.speak(u);
        setTimeout(() => {
          if (done) return; done = true;
          // onend が来ない実装向けの保険（発話は開始できているとみなす）
          X.ttsState = "available";
          try { localStorage.setItem(LS_TTS_OK, "1"); } catch (e) {}
          render();
          resolve();
        }, 3000);
      });
    });
  }

  function stopAudio() {
    audioStopRequested = true;
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    audioPlaying = false;
  }

  // turns: [{speaker, text:{zh,pinyin}}], repeatCount 回だけ全体を再生する
  function playTurns(turns, repeatCount, onDone, onError) {
    if (X.ttsState !== "available") { onError && onError("no-voice"); return; }
    if (audioPlaying) return; // 二重再生防止
    audioPlaying = true;
    audioStopRequested = false;
    const voices = X.ttsVoicesZh.length ? X.ttsVoicesZh : [X.ttsVoice].filter(Boolean);
    const voiceFor = (speaker) => {
      if (voices.length >= 2) {
        if (speaker === "male") return voices[1];
        return voices[0];
      }
      return voices[0];
    };
    let round = 0;
    function playRound() {
      if (audioStopRequested) { audioPlaying = false; return; }
      let i = 0;
      function playNext() {
        if (audioStopRequested) { audioPlaying = false; return; }
        if (i >= turns.length) {
          round++;
          if (round >= repeatCount) { audioPlaying = false; onDone && onDone(); return; }
          setTimeout(playRound, 650);
          return;
        }
        const turn = turns[i];
        const u = new SpeechSynthesisUtterance(turn.text.zh);
        const v = voiceFor(turn.speaker);
        u.lang = (v && v.lang) || "zh-CN";
        if (v) u.voice = v;
        u.rate = 0.95;
        let settled = false;
        u.onend = () => {
          if (settled) return; settled = true;
          i++;
          setTimeout(playNext, 300);
        };
        u.onerror = () => {
          if (settled) return; settled = true;
          audioPlaying = false;
          onError && onError("playback-error");
        };
        window.speechSynthesis.speak(u);
      }
      playNext();
    }
    playRound();
  }

  // ======================================================================
  // 保存（localStorage）
  // ======================================================================
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function getAttemptsStore() { return loadJson(LS_ATTEMPTS, {}); }
  function saveAttemptsStore(store) { saveJson(LS_ATTEMPTS, store); }
  function getOfficialStore() { return loadJson(LS_OFFICIAL, {}); }
  function saveOfficialStore(store) { saveJson(LS_OFFICIAL, store); }

  let attemptSeq = 0;
  function makeAttemptId() {
    attemptSeq++;
    return "att-" + Date.now() + "-" + attemptSeq;
  }

  // 1問分の解答を記録する。firstSeen は「その問題に対する史上初めての解答」の時だけ true。
  function recordAttempt(questionId, rec) {
    const store = getAttemptsStore();
    if (!store[questionId]) store[questionId] = { firstSeen: null, history: [] };
    const entry = store[questionId];
    const isFirstSeen = !entry.firstSeen;
    const attempt = Object.assign({
      attempt_id: makeAttemptId(),
      content_version: D.contentVersion,
      question_id: questionId,
      first_seen: isFirstSeen
    }, rec);
    entry.history.push(attempt);
    if (isFirstSeen) entry.firstSeen = attempt;
    saveAttemptsStore(store);
    return attempt;
  }

  function latestAttempt(questionId) {
    const store = getAttemptsStore();
    const entry = store[questionId];
    if (!entry || !entry.history.length) return null;
    return entry.history[entry.history.length - 1];
  }

  function isInReviewList(questionId) {
    const a = latestAttempt(questionId);
    if (!a) return false;
    if (a.mode === "accessible_practice") return false;
    return a.is_correct === false || a.low_confidence === true;
  }

  function getReviewQuestionIds() {
    return D.questions.map((q) => q.id).filter(isInReviewList);
  }

  // ======================================================================
  // ユーティリティ
  // ======================================================================
  function el(html) {
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstElementChild;
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function assetSrc(assetId) {
    const a = D.assetsById[assetId];
    return a ? (DATA_BASE + a.file) : "";
  }
  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ":" + String(r).padStart(2, "0");
  }

  // ======================================================================
  // セッション（出題）ロジック
  // ======================================================================
  let transcriptTimerHandle = null;
  let readingTimerHandle = null;

  function clearTranscriptTimer() { if (transcriptTimerHandle) { clearInterval(transcriptTimerHandle); transcriptTimerHandle = null; } }
  function clearReadingTimer() { if (readingTimerHandle) { clearInterval(readingTimerHandle); readingTimerHandle = null; } }
  function clearAllTimers() { clearTranscriptTimer(); clearReadingTimer(); }

  function persistSession() { saveJson(LS_SESSION, X.session); }
  function clearPersistedSession() { try { localStorage.removeItem(LS_SESSION); } catch (e) {} }

  function makeSession(kind, ids, revealMode, extra) {
    return Object.assign({
      kind, order: ids, index: 0, answers: {}, stage: "answering",
      revealMode, revealGroupId: null, startedAt: Date.now(),
      replayCounts: {}, transcriptDone: false, interrupted: false
    }, extra || {});
  }

  function buildOrderForPart(part) {
    return D.questions.filter((q) => q.part === part).slice().sort((a, b) => a.id.localeCompare(b.id)).map((q) => q.id);
  }

  function buildFiveQuestionSession() {
    const useGroup = Math.random() < 0.5 && D.groups.length > 0;
    let ids;
    if (useGroup) {
      const g = D.groups[Math.floor(Math.random() * D.groups.length)];
      ids = D.questions.filter((q) => q.group_id === g.id).map((q) => q.id).sort();
    } else {
      const ungroupedParts = ["L1", "L3", "L4", "R3"];
      const pool = D.questions.filter((q) => ungroupedParts.includes(q.part));
      ids = shuffle(pool).slice(0, 5).map((q) => q.id);
    }
    return makeSession("five", ids, "immediate");
  }

  function buildFormatSession(part) {
    const ids = buildOrderForPart(part);
    return makeSession("format", ids, "immediate", { format: part });
  }

  function buildReviewSession() {
    const ids = getReviewQuestionIds();
    if (!ids.length) return null;
    return makeSession("review", shuffle(ids), "immediate");
  }

  function buildMock60Session(mockId) {
    const manifest = D.mocks.find((m) => m.id === mockId);
    return makeSession("mock60", manifest.question_ids.slice(), "deferred", { mockId });
  }

  function startSession(session) {
    if (!session) return;
    X.session = session;
    X.resumeBanner = null;
    X.screen = "session";
    persistSession();
    render();
  }

  function currentQuestion() {
    const s = X.session;
    return D.questionsById[s.order[s.index]];
  }

  function optionsForQuestion(q) {
    if (q.group_id) return D.groupsById[q.group_id].options;
    return q.options || null;
  }

  function labelForAnswer(q, id, opts) {
    if (id === null || id === undefined || id === "") return "(未回答)";
    if (id === "T") return "○ 正しい";
    if (id === "F") return "× 誤り";
    if (!opts) return id;
    const o = opts.find((x) => x.id === id);
    if (!o) return id;
    if (o.asset_id) return id + "（画像）";
    return id + "：" + (o.text ? o.text.zh : "");
  }

  function finishSession() {
    const s = X.session;
    s.stage = "done";
    clearAllTimers();
    clearPersistedSession();
    render();
  }

  function proceedAfterReveal() {
    const s = X.session;
    s.stage = "answering";
    s.revealGroupId = null;
    s.index++;
    if (s.index >= s.order.length) { finishSession(); return; }
    persistSession();
    render();
  }

  function advanceIndex() {
    const s = X.session;
    s.index++;
    if (s.kind === "mock60" && s.index === 35 && !s.transcriptDone) {
      s.stage = "transcript";
      s.transcriptDeadline = Date.now() + 180000;
      persistSession();
      render();
      return;
    }
    if (s.index >= s.order.length) { finishSession(); return; }
    s.stage = "answering";
    persistSession();
    render();
  }

  function answerCurrent(selectedId, opts) {
    opts = opts || {};
    const s = X.session;
    const q = currentQuestion();
    const isCorrect = selectedId === q.answer;
    const mode = s.interrupted ? "interrupted_practice" : s.kind;
    recordAttempt(q.id, {
      selected_answer: selectedId,
      is_correct: isCorrect,
      started_at: s.startedAt,
      submitted_at: Date.now(),
      mode: mode,
      replay_count: s.replayCounts[q.id] || 0,
      revealed_transcript: false,
      hint_used: false,
      low_confidence: !!opts.lowConfidence,
      interrupted: !!s.interrupted,
      audio_source: q.part.startsWith("L") ? (X.ttsState === "available" ? "tts" : "none") : "not_applicable",
      elapsed_ms: Date.now() - s.startedAt
    });
    s.interrupted = false;
    s.answers[q.id] = { selected: selectedId, isCorrect, lowConfidence: !!opts.lowConfidence };
    persistSession();

    if (s.revealMode === "deferred") { advanceIndex(); return; }

    if (q.group_id) {
      const memberIds = D.questions.filter((qq) => qq.group_id === q.group_id).map((qq) => qq.id);
      const allAnswered = memberIds.every((id) => s.answers[id]);
      if (!allAnswered) { advanceIndex(); return; }
      s.stage = "reveal";
      s.revealGroupId = q.group_id;
      persistSession();
      render();
      return;
    }
    s.stage = "reveal";
    s.revealGroupId = null;
    persistSession();
    render();
  }

  function submitAnswer(wrap, selectedId) {
    const box = wrap.querySelector("#exam-lowconf");
    const lowConf = !!(box && box.checked);
    answerCurrent(selectedId, { lowConfidence: lowConf });
  }

  function showAudioUnavailableNotice() {
    X.ttsState = "unavailable";
    render();
  }

  function bindPlay(wrap, q) {
    const btn = wrap.querySelector("#exam-play");
    if (!btn) return;
    function doPlay() {
      if (X.ttsState !== "available") { showAudioUnavailableNotice(); return; }
      btn.disabled = true;
      const s = X.session;
      s.replayCounts[q.id] = (s.replayCounts[q.id] || 0) + 1;
      const countEl = wrap.querySelector("#exam-play-count");
      if (countEl) countEl.textContent = "再生回数: " + s.replayCounts[q.id];
      playTurns(q.audio.turns, q.audio.repeat_count, () => { btn.disabled = false; }, () => { btn.disabled = false; showAudioUnavailableNotice(); });
    }
    btn.addEventListener("click", () => {
      if (X.ttsState === "unknown") {
        btn.disabled = true;
        testTts().then(() => { btn.disabled = false; if (X.ttsState === "available") doPlay(); else render(); });
        return;
      }
      doPlay();
    });
  }

  // ======================================================================
  // 出題画面（answering ステージ）
  // ======================================================================
  function renderOptionsHtml(q, opts) {
    if (q.type === "image_true_false" || q.type === "text_true_false") {
      return `<div class="rate-row" id="exam-tf-row">
        <button class="rate-btn got-it" data-id="T">○ 正しい</button>
        <button class="rate-btn again" data-id="F">× 誤り</button>
      </div>`;
    }
    if (q.type === "image_match") {
      return `<div class="exam-image-grid" id="exam-opts">` + opts.map((o) => `
        <button class="exam-image-opt" data-id="${o.id}">
          <img src="${assetSrc(o.asset_id)}" alt="">
          <div class="lab">${o.id}</div>
        </button>`).join("") + `</div>`;
    }
    return `<div class="option-list" id="exam-opts">` + opts.map((o) => `
      <button class="option-btn" data-id="${o.id}">${o.text.zh}<div class="exam-pinyin">${o.text.pinyin}</div></button>`).join("") + `</div>`;
  }

  function renderQuestionCard(q) {
    const s = X.session;
    const group = q.group_id ? D.groupsById[q.group_id] : null;
    const opts = optionsForQuestion(q);
    const showAudio = q.part.startsWith("L");
    let bodyHtml = "";

    if (q.type === "image_true_false") {
      const asset = D.assetsById[q.asset_id];
      if (X.accessibleMode) {
        bodyHtml += `<div class="exam-alt-text">${asset ? asset.review_alt : ""}</div>`;
      } else {
        bodyHtml += `<div class="exam-img-box"><img src="${assetSrc(q.asset_id)}" alt="${asset ? asset.exam_alt : "問題の画像"}"></div>`;
      }
      bodyHtml += `<button class="exam-accessible-toggle" id="exam-acc-toggle">${X.accessibleMode ? "画像表示に戻す" : "画像の代わりに文章で練習する（視覚を使わない練習）"}</button>`;
    } else if (q.type === "text_true_false") {
      bodyHtml += `<div class="exam-zh">${q.prompt.zh}</div><div class="exam-pinyin">${q.prompt.pinyin}</div>
        <div class="exam-zh" style="margin-top:14px;">★ ${q.statement.zh}</div><div class="exam-pinyin">${q.statement.pinyin}</div>`;
    } else if (q.type === "word_bank" || q.type === "sentence_match") {
      bodyHtml += `<div class="exam-zh">${q.prompt.zh}</div><div class="exam-pinyin">${q.prompt.pinyin}</div>`;
    } else if (q.type === "image_match") {
      if (q.part === "R1") {
        bodyHtml += `<div class="exam-zh">${q.prompt.zh}</div><div class="exam-pinyin">${q.prompt.pinyin}</div>`;
      }
    }
    // audio_mc は対話・質問を音声のみで出題するため本文は表示しない

    const readingTimerHtml = (s.kind === "mock60" && s.index >= 35)
      ? `<div class="exam-timer" id="exam-reading-timer">読解の残り時間: ${fmtTime(s.readingDeadline - Date.now())}</div>` : "";

    const wrap = el(`<div>
      <div class="study-header">
        <button class="back-link" id="exam-back">← メニュー</button>
        <div class="deck-pos">${s.index + 1} / ${s.order.length}</div>
      </div>
      ${readingTimerHtml}
      ${group ? `<div class="exam-group-note">この5問はA〜${String.fromCharCode(65 + opts.length - 1)}の選択肢を共有しています（すべて表示中）。</div>` : ""}
      <div class="exam-card">
        ${bodyHtml}
        ${showAudio ? `<div><button class="exam-play-btn" id="exam-play">▶ 音声を再生（${q.audio.repeat_count}回連続再生）</button><span class="exam-play-count" id="exam-play-count"></span></div>` : ""}
        ${showAudio && X.ttsState !== "available" ? `<div class="exam-note">中国語音声が利用できません。メニューの「中国語音声を確認する」から状態を確認するか、読解形式（R1〜R4）をご利用ください。</div>` : ""}
      </div>
      ${renderOptionsHtml(q, opts)}
      ${s.revealMode === "immediate" ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-soft);margin-top:10px;">
        <input type="checkbox" id="exam-lowconf"> この問題に自信がない（復習リストに残す）
      </label>` : `<button class="bp-toggle" id="exam-skip" style="margin-top:10px;">この問題は未回答のまま次へ</button>`}
    </div>`);

    wrap.querySelector("#exam-back").addEventListener("click", () => { clearAllTimers(); goMenu(); });
    if (showAudio) bindPlay(wrap, q);
    if (s.kind === "mock60" && s.index >= 35) startReadingTimerIfNeeded();

    const skipBtn = wrap.querySelector("#exam-skip");
    if (skipBtn) skipBtn.addEventListener("click", advanceIndex);

    const accToggle = wrap.querySelector("#exam-acc-toggle");
    if (accToggle) accToggle.addEventListener("click", () => { X.accessibleMode = !X.accessibleMode; render(); });

    wrap.querySelectorAll("#exam-tf-row button, #exam-opts button").forEach((btn) => {
      btn.addEventListener("click", () => submitAnswer(wrap, btn.dataset.id));
    });
    return wrap;
  }

  function startReadingTimerIfNeeded() {
    if (readingTimerHandle) return;
    readingTimerHandle = setInterval(() => {
      const s = X.session;
      if (!s || s.kind !== "mock60" || s.index < 35 || s.stage === "done") { clearReadingTimer(); return; }
      if (Date.now() >= s.readingDeadline) {
        clearReadingTimer();
        finishSession();
        return;
      }
      if (X.screen === "session") {
        const t = document.getElementById("exam-reading-timer");
        if (t) t.textContent = "読解の残り時間: " + fmtTime(s.readingDeadline - Date.now());
      }
    }, 1000);
  }

  // ======================================================================
  // 答え合わせ（reveal ステージ）
  // ======================================================================
  function renderQuestionReadableSummary(q) {
    let html = "";
    if (q.asset_id) html += `<div class="exam-img-box"><img src="${assetSrc(q.asset_id)}" alt=""></div>`;
    if (q.prompt && q.prompt.zh) html += `<div class="exam-zh">${q.prompt.zh}</div><div class="exam-pinyin">${q.prompt.pinyin}</div>`;
    if (q.statement) html += `<div class="exam-zh" style="margin-top:8px;">★ ${q.statement.zh}</div><div class="exam-pinyin">${q.statement.pinyin}</div>`;
    if (q.audio && q.audio.turns) {
      html += '<div class="exam-note" style="margin-top:10px;text-align:left;">台本：<br>' +
        q.audio.turns.map((t) => t.text.zh + "（" + t.text.pinyin + "）").join("<br>") + "</div>";
    }
    const opts = optionsForQuestion(q);
    const a = X.session.answers[q.id];
    html += '<div style="margin-top:10px;font-size:13px;">あなたの解答: ' + labelForAnswer(q, a.selected, opts) +
      " ／ 正解: " + labelForAnswer(q, q.answer, opts) + "</div>";
    return html;
  }

  function renderTagChips(q) {
    return `<div class="tags">${q.tags.map((t) => `<button class="exam-tag-chip" data-tag="${t}">${(D.tagsById[t] && D.tagsById[t].label_ja) || t}</button>`).join("")}</div>
      <div class="exam-review-note" id="exam-tagnote" hidden></div>`;
  }

  function bindTagChips(wrap) {
    const note = wrap.querySelector("#exam-tagnote");
    wrap.querySelectorAll(".exam-tag-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const tag = chip.dataset.tag;
        const text = REVIEW_NOTES[tag] || REVIEW_NOTE_FALLBACK;
        if (note) {
          note.hidden = false;
          note.innerHTML = text + ' <button class="exam-accessible-toggle" id="exam-goto-vocab">単語学習アプリのホームへ戻る</button>';
          const gv = note.querySelector("#exam-goto-vocab");
          if (gv) gv.addEventListener("click", closeExam);
        }
      });
    });
  }

  function renderRevealSingle(q) {
    const s = X.session;
    const a = s.answers[q.id];
    const wrap = el(`<div>
      <div class="study-header"><button class="back-link" id="exam-back">← メニュー</button><div class="deck-pos">${s.index + 1} / ${s.order.length}</div></div>
      <div class="exam-card">
        <div style="font-size:15px;font-weight:700;color:${a.isCorrect ? "var(--jade)" : "var(--stamp)"};">${a.isCorrect ? "○ 正解" : "× 不正解"}</div>
        ${renderQuestionReadableSummary(q)}
        <div class="exam-explain">
          <div>${q.explanation_ja}</div>
          ${renderTagChips(q)}
        </div>
      </div>
      <button class="next-btn" id="exam-next">次へ</button>
    </div>`);
    wrap.querySelector("#exam-back").addEventListener("click", goMenu);
    wrap.querySelector("#exam-next").addEventListener("click", proceedAfterReveal);
    bindTagChips(wrap);
    return wrap;
  }

  function renderRevealGroup(groupId) {
    const s = X.session;
    const members = D.questions.filter((q) => q.group_id === groupId).sort((a, b) => a.id.localeCompare(b.id));
    const cardsHtml = members.map((q) => {
      const a = s.answers[q.id];
      return `<div class="exam-card">
        <div style="font-size:14px;font-weight:700;color:${a.isCorrect ? "var(--jade)" : "var(--stamp)"};">${a.isCorrect ? "○ 正解" : "× 不正解"}（${q.number}番）</div>
        ${renderQuestionReadableSummary(q)}
        <div class="exam-explain">
          <div>${q.explanation_ja}</div>
          ${renderTagChips(q)}
        </div>
      </div>`;
    }).join("");
    const wrap = el(`<div>
      <div class="study-header"><button class="back-link" id="exam-back">← メニュー</button><div class="deck-pos">グループの答え合わせ</div></div>
      ${cardsHtml}
      <button class="next-btn" id="exam-next">次へ</button>
    </div>`);
    wrap.querySelector("#exam-back").addEventListener("click", goMenu);
    wrap.querySelector("#exam-next").addEventListener("click", proceedAfterReveal);
    bindTagChips(wrap);
    return wrap;
  }

  // ======================================================================
  // 60問モード：転記ステージ
  // ======================================================================
  function startTranscriptTimerIfNeeded() {
    if (transcriptTimerHandle) return;
    transcriptTimerHandle = setInterval(() => {
      const s = X.session;
      if (!s || s.stage !== "transcript") { clearTranscriptTimer(); return; }
      if (Date.now() >= s.transcriptDeadline) {
        clearTranscriptTimer();
        s.transcriptDone = true;
        s.stage = "answering";
        s.readingDeadline = Date.now() + 1320000;
        persistSession();
        render();
      } else {
        render();
      }
    }, 1000);
  }

  function renderTranscriptStage() {
    const s = X.session;
    startTranscriptTimerIfNeeded();
    const remain = s.transcriptDeadline - Date.now();
    const listeningIds = s.order.slice(0, 35);
    const wrap = el(`<div>
      <div class="exam-timer ${remain < 30000 ? "low" : ""}">転記の残り時間: ${fmtTime(remain)}</div>
      <div class="exam-note">聞き取りの解答一覧です。必要があれば選び直せます。「読解へ進む」を押すと聞き取りは編集できなくなります。</div>
      <div class="exam-official-grid">
        ${listeningIds.map((id, i) => {
          const q = D.questionsById[id];
          const opts = optionsForQuestion(q) || [{ id: "T" }, { id: "F" }];
          const cur = s.answers[id] ? s.answers[id].selected : "";
          return `<div class="exam-official-cell"><div class="num">${i + 1}</div>
            <select data-id="${id}">
              <option value="">-</option>
              ${opts.map((o) => `<option value="${o.id}" ${o.id === cur ? "selected" : ""}>${o.id}</option>`).join("")}
            </select></div>`;
        }).join("")}
      </div>
      <button class="start-btn" id="exam-to-reading">読解へ進む</button>
    </div>`);
    wrap.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const id = sel.dataset.id;
        const val = sel.value;
        const q = D.questionsById[id];
        if (!val) { delete s.answers[id]; }
        else {
          const isCorrect = val === q.answer;
          const lowConfidence = s.answers[id] ? s.answers[id].lowConfidence : false;
          s.answers[id] = { selected: val, isCorrect, lowConfidence };
          recordAttempt(id, {
            selected_answer: val, is_correct: isCorrect, started_at: s.startedAt, submitted_at: Date.now(),
            mode: s.kind, replay_count: s.replayCounts[id] || 0, revealed_transcript: false, hint_used: false,
            low_confidence: lowConfidence, interrupted: false,
            audio_source: X.ttsState === "available" ? "tts" : "none", elapsed_ms: Date.now() - s.startedAt
          });
        }
        persistSession();
      });
    });
    wrap.querySelector("#exam-to-reading").addEventListener("click", () => {
      clearTranscriptTimer();
      s.transcriptDone = true;
      s.stage = "answering";
      s.readingDeadline = Date.now() + 1320000;
      persistSession();
      render();
    });
    return wrap;
  }

  // ======================================================================
  // セッション完了画面
  // ======================================================================
  function computeMock60Score(s) {
    let listeningCorrect = 0, readingCorrect = 0;
    s.order.forEach((id) => {
      const q = D.questionsById[id];
      const a = s.answers[id];
      if (!a) return;
      if (q.section === "listening") { if (a.isCorrect) listeningCorrect++; }
      else { if (a.isCorrect) readingCorrect++; }
    });
    const score = Math.round((100 * listeningCorrect / 35 + 100 * readingCorrect / 25) * 10) / 10;
    return { listeningCorrect, readingCorrect, score };
  }

  function renderMock60Done() {
    const s = X.session;
    const r = computeMock60Score(s);
    const wrap = el(`<div class="exam-score-box">
      <div class="exam-score-num">${r.score.toFixed(1)}</div>
      <div class="exam-score-label">自己採点の目安（本番の得点・合否を保証するものではありません）</div>
      <div class="exam-score-sub">
        <div><div class="n">${r.listeningCorrect}/35</div><div class="l">聞き取り</div></div>
        <div><div class="n">${r.readingCorrect}/25</div><div class="l">読解</div></div>
      </div>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">
        <button class="start-btn" id="exam-review-wrong">間違いを復習する</button>
        <button class="bp-toggle" id="exam-to-menu">メニューに戻る</button>
      </div>
    </div>`);
    wrap.querySelector("#exam-to-menu").addEventListener("click", goMenu);
    wrap.querySelector("#exam-review-wrong").addEventListener("click", () => {
      const rs = buildReviewSession();
      if (!rs) { goMenu(); return; }
      startSession(rs);
    });
    return wrap;
  }

  function renderPracticeDone() {
    const s = X.session;
    let correct = 0;
    s.order.forEach((id) => { if (s.answers[id] && s.answers[id].isCorrect) correct++; });
    const uniqueTotal = new Set(s.order).size;
    const wrap = el(`<div class="exam-score-box">
      <div class="exam-score-num">${correct} / ${uniqueTotal}</div>
      <div class="exam-score-label">正解数</div>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">
        <button class="start-btn" id="exam-again">もう一度</button>
        <button class="bp-toggle" id="exam-to-menu">メニューに戻る</button>
      </div>
    </div>`);
    wrap.querySelector("#exam-to-menu").addEventListener("click", goMenu);
    wrap.querySelector("#exam-again").addEventListener("click", () => {
      if (s.kind === "five") startSession(buildFiveQuestionSession());
      else if (s.kind === "format") startSession(buildFormatSession(s.format));
      else if (s.kind === "review") {
        const rs = buildReviewSession();
        if (!rs) { goMenu(); } else { startSession(rs); }
      } else { goMenu(); }
    });
    return wrap;
  }

  function renderSession() {
    const s = X.session;
    if (!s) { X.screen = "menu"; return renderMenu(); }
    if (s.stage === "transcript") return renderTranscriptStage();
    if (s.stage === "done") return s.kind === "mock60" ? renderMock60Done() : renderPracticeDone();
    if (s.stage === "reveal") {
      if (s.revealGroupId) return renderRevealGroup(s.revealGroupId);
      return renderRevealSingle(currentQuestion());
    }
    return renderQuestionCard(currentQuestion());
  }

  // ======================================================================
  // 公式公開問題
  // ======================================================================
  function renderPaperCard(p, store) {
    const saved = (store[p.id] && store[p.id].answers) || {};
    let cells = "";
    for (let i = 1; i <= 60; i++) {
      const opts = (i <= 10 || (i >= 46 && i <= 50)) ? ["T", "F"] : (i >= 21 && i <= 35) ? ["A", "B", "C"] : ["A", "B", "C", "D", "E", "F"];
      const cur = saved[i] || "";
      cells += `<div class="exam-official-cell"><div class="num">${i}</div>
        <select data-paper="${p.id}" data-num="${i}">
          <option value="">-</option>
          ${opts.map((o) => `<option value="${o}" ${o === cur ? "selected" : ""}>${o}</option>`).join("")}
        </select></div>`;
    }
    const audioNote = p.audio_status === "catalog_link_verified_archive_not_tested"
      ? `<div class="exam-note">音声：公式リソースセンターにRAR形式の音声アーカイブへのリンクがあります（本体は未検証のためこのアプリでは再生できません。ブラウザでRARを直接再生することはできません）。<br>
          <button class="exam-tts-btn" id="ar-${p.id}">音声アーカイブのリンクを開く</button>
          <button class="exam-tts-btn" id="rc-${p.id}">リソースセンターを開く</button></div>`
      : `<div class="exam-note">音声：この冊子の公式音声URLは未確認のため接続していません。読解のみ、または台本を使った練習をご利用ください。<br>
          <button class="exam-tts-btn" id="rc-${p.id}">リソースセンターを開く</button></div>`;
    return `<div class="exam-card">
      <div style="font-weight:700;font-size:15px;">${p.title}</div>
      <div style="font-size:11px;color:var(--ink-soft);margin:4px 0 10px;">${p.publisher}</div>
      <a class="exam-pdf-btn" href="${p.pdf_url}" target="_blank" rel="noopener">原本PDFを開く（問題ページから）</a>
      ${audioNote}
      <div class="exam-official-grid" style="margin-top:14px;">${cells}</div>
      <button class="start-btn" id="score-${p.id}">採点する</button>
    </div>`;
  }

  function renderOfficial() {
    const store = getOfficialStore();
    const wrap = el(`<div>
      <div class="study-header"><button class="back-link" id="exam-back">← メニュー</button><div class="deck-pos">${DISPLAY.official}</div></div>
      <div class="exam-note">${DISPLAY.official}は国家汉办／孔子学院总部が公開したPDFです。問題文・画像・音声はこのアプリに含まれていません。原本PDFを別タブで開いて解答し、この画面では記号だけを記録・採点します。巻末の解答ページは採点前に自分で開かないようご注意ください。</div>
      ${D.papers.map((p) => renderPaperCard(p, store)).join("")}
    </div>`);
    wrap.querySelector("#exam-back").addEventListener("click", goMenu);
    D.papers.forEach((p) => {
      const arBtn = wrap.querySelector("#ar-" + p.id);
      if (arBtn) arBtn.addEventListener("click", () => window.open(p.audio_archive_url, "_blank", "noopener"));
      const rcBtn = wrap.querySelector("#rc-" + p.id);
      if (rcBtn) rcBtn.addEventListener("click", () => window.open(p.source_catalog_url, "_blank", "noopener"));
      const scoreBtn = wrap.querySelector("#score-" + p.id);
      if (scoreBtn) scoreBtn.addEventListener("click", () => scoreOfficialPaper(p.id));
    });
    wrap.querySelectorAll("select[data-paper]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const store2 = getOfficialStore();
        const pid = sel.dataset.paper;
        if (!store2[pid]) store2[pid] = { answers: {} };
        store2[pid].answers[sel.dataset.num] = sel.value;
        saveOfficialStore(store2);
      });
    });
    return wrap;
  }

  function scoreOfficialPaper(paperId) {
    const p = D.papers.find((x) => x.id === paperId);
    const store = getOfficialStore();
    const saved = (store[paperId] && store[paperId].answers) || {};
    let listeningCorrect = 0, readingCorrect = 0, listeningAnswered = 0, readingAnswered = 0;
    for (let i = 1; i <= 60; i++) {
      const sel = saved[i] || null;
      const correct = p.answer_key[String(i)];
      if (i <= 35) { if (sel) { listeningAnswered++; if (sel === correct) listeningCorrect++; } }
      else { if (sel) { readingAnswered++; if (sel === correct) readingCorrect++; } }
    }
    const bothDone = listeningAnswered === 35 && readingAnswered === 25;
    const score = bothDone ? Math.round((100 * listeningCorrect / 35 + 100 * readingCorrect / 25) * 10) / 10 : null;
    if (!store[paperId]) store[paperId] = { answers: saved };
    const result = { listeningCorrect, readingCorrect, listeningAnswered, readingAnswered, score, at: Date.now() };
    if (!store[paperId].firstSeen) store[paperId].firstSeen = result;
    store[paperId].lastResult = result;
    saveOfficialStore(store);
    X.officialResult = Object.assign({ paperId, bothDone }, result);
    X.screen = "resultOfficial";
    render();
  }

  function renderOfficialResult() {
    const r = X.officialResult;
    const p = D.papers.find((x) => x.id === r.paperId);
    const wrap = el(`<div class="exam-score-box">
      <div style="font-weight:700;margin-bottom:6px;">${p.title}</div>
      ${r.bothDone ? `
        <div class="exam-score-num">${r.score.toFixed(1)}</div>
        <div class="exam-score-label">自己採点の目安（本番の得点・合否を保証するものではありません）</div>
      ` : `<div class="exam-score-label">聞き取り・読解の両方に解答すると総合点を表示します。</div>`}
      <div class="exam-score-sub">
        <div><div class="n">${r.listeningCorrect}/${r.listeningAnswered}</div><div class="l">聞き取り(解答${r.listeningAnswered}/35)</div></div>
        <div><div class="n">${r.readingCorrect}/${r.readingAnswered}</div><div class="l">読解(解答${r.readingAnswered}/25)</div></div>
      </div>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;">
        <button class="bp-toggle" id="exam-to-official">解答用紙に戻る</button>
        <button class="bp-toggle" id="exam-to-menu">メニューに戻る</button>
      </div>
    </div>`);
    wrap.querySelector("#exam-to-official").addEventListener("click", () => { X.screen = "official"; render(); });
    wrap.querySelector("#exam-to-menu").addEventListener("click", goMenu);
    return wrap;
  }

  // ======================================================================
  // メニュー画面
  // ======================================================================
  const PART_INFO = {
    L1: { label: "聞き取り1・画像正誤", count: 30, listening: true },
    L2: { label: "聞き取り2・画像選択", count: 30, listening: true },
    L3: { label: "聞き取り3・会話3択", count: 30, listening: true },
    L4: { label: "聞き取り4・長め会話3択", count: 15, listening: true },
    R1: { label: "読解1・画像選択", count: 15, listening: false },
    R2: { label: "読解2・語群選択", count: 15, listening: false },
    R3: { label: "読解3・正誤判断", count: 15, listening: false },
    R4: { label: "読解4・文の対応付け", count: 30, listening: false }
  };

  function renderMenu() {
    const reviewCount = getReviewQuestionIds().length;
    const ttsBtnClass = X.ttsState === "available" ? "ok" : X.ttsState === "unavailable" ? "err" : "";
    const ttsLabel = X.ttsState === "available" ? "✓ 利用可能" : X.ttsState === "unavailable" ? "✗ 利用不可" : X.ttsState === "checking" ? "確認中..." : "未確認";

    const wrap = el(`<div>
      <div class="top-bar">
        <div class="brand"><span class="mark" style="font-size:22px;">問題演習</span></div>
        <button class="back-link" id="exam-close">← 単語学習に戻る</button>
      </div>
      <div class="exam-note">
        ${DISPLAY.original}180問は独自作成です。「過去問」ではありません。自己採点は目安であり、本番の得点・合否を保証するものではありません。
      </div>
      <div class="exam-tts-row">
        <span class="lbl">中国語音声: ${ttsLabel}</span>
        <button class="exam-tts-btn ${ttsBtnClass}" id="exam-tts-test">試し再生する</button>
      </div>
      ${X.resumeBanner ? `<div class="exam-resume-banner">前回の演習が途中です（${X.resumeBanner.kind}）。<div class="row">
        <button id="exam-resume">続きから再開</button>
        <button id="exam-discard" style="background:rgba(255,255,255,0.3);color:#fff;">破棄する</button>
      </div></div>` : ""}
      <div class="exam-menu-list">
        <button class="exam-menu-btn primary" id="exam-five">
          <div class="t">5問だけ</div>
          <div class="d">ランダムに5問。すきま時間の練習に</div>
        </button>
        <button class="exam-menu-btn" id="exam-format-toggle">
          <div class="t">形式を選ぶ</div>
          <div class="d">L1〜L4・R1〜R4から形式を選んで練習</div>
        </button>
        <div id="exam-format-panel" hidden></div>
        <button class="exam-menu-btn" id="exam-mock-toggle">
          <div class="t">60問に挑戦</div>
          <div class="d">M1〜M3のオリジナル形式練習（各60問固定順）</div>
        </button>
        <div id="exam-mock-panel" hidden></div>
        <button class="exam-menu-btn" id="exam-review">
          <div class="t">間違いを復習（${reviewCount}問）</div>
          <div class="d">誤答・自信なしの問題だけを解き直す</div>
        </button>
        <button class="exam-menu-btn" id="exam-official-btn">
          <div class="t">${DISPLAY.official}</div>
          <div class="d">原本PDFを開いて解答を記録・採点</div>
        </button>
      </div>
      <div class="exam-disclaimer">画面上の「自己採点の目安」は公式の合否判定・確定点ではありません。</div>
    </div>`);

    wrap.querySelector("#exam-close").addEventListener("click", closeExam);
    wrap.querySelector("#exam-tts-test").addEventListener("click", testTts);

    if (X.resumeBanner) {
      wrap.querySelector("#exam-resume").addEventListener("click", () => {
        X.session = X.resumeBanner;
        X.resumeBanner = null;
        X.screen = "session";
        render();
      });
      wrap.querySelector("#exam-discard").addEventListener("click", () => {
        clearPersistedSession();
        X.resumeBanner = null;
        render();
      });
    }

    wrap.querySelector("#exam-five").addEventListener("click", () => startSession(buildFiveQuestionSession()));

    const formatPanel = wrap.querySelector("#exam-format-panel");
    wrap.querySelector("#exam-format-toggle").addEventListener("click", () => {
      formatPanel.hidden = !formatPanel.hidden;
      if (!formatPanel.hidden) {
        formatPanel.innerHTML = `<div class="exam-format-grid">${Object.keys(PART_INFO).map((part) => {
          const info = PART_INFO[part];
          const disabled = info.listening && X.ttsState !== "available";
          return `<button class="exam-format-btn" data-part="${part}" ${disabled ? "disabled" : ""}>
            <b>${part}</b>${info.label}（${info.count}問）${disabled ? "<br><span style=\"color:var(--stamp);\">音声未確認</span>" : ""}
          </button>`;
        }).join("")}</div>`;
        formatPanel.querySelectorAll(".exam-format-btn").forEach((btn) => {
          btn.addEventListener("click", () => startSession(buildFormatSession(btn.dataset.part)));
        });
      }
    });

    const mockPanel = wrap.querySelector("#exam-mock-panel");
    wrap.querySelector("#exam-mock-toggle").addEventListener("click", () => {
      mockPanel.hidden = !mockPanel.hidden;
      if (!mockPanel.hidden) {
        const disabled = X.ttsState !== "available";
        mockPanel.innerHTML = `
          ${disabled ? `<div class="exam-note">中国語音声が未確認・利用不可のため、60問モード（聞き取りを含む）は開始できません。上部の「試し再生する」を先にお試しください。</div>` : ""}
          <div class="exam-format-grid">${D.mocks.map((m) => `
            <button class="exam-format-btn" data-mock="${m.id}" ${disabled ? "disabled" : ""}>
              <b>${m.id}</b>${m.title}（60問の形式練習）
            </button>`).join("")}</div>`;
        mockPanel.querySelectorAll(".exam-format-btn").forEach((btn) => {
          btn.addEventListener("click", () => startSession(buildMock60Session(btn.dataset.mock)));
        });
      }
    });

    wrap.querySelector("#exam-review").addEventListener("click", () => {
      const rs = buildReviewSession();
      if (!rs) { alert("復習対象の問題はまだありません。"); return; }
      startSession(rs);
    });

    wrap.querySelector("#exam-official-btn").addEventListener("click", () => { X.screen = "official"; render(); });

    return wrap;
  }

  // ======================================================================
  // 中断検知（バックグラウンドで音声再生が止まった場合）
  // ======================================================================
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audioPlaying) {
      stopAudio();
      if (X.session) { X.session.interrupted = true; persistSession(); }
    }
  });

  window.HSKExam = {
    open: openExam,
    close: closeExam
  };

  function openExam() {
    document.getElementById("hsk-root").hidden = true;
    const root = document.getElementById("exam-root");
    root.hidden = false;
    injectStyles();
    if (!D) {
      root.innerHTML = '<div style="padding:60px 0;text-align:center;color:var(--ink-soft);">問題データを読み込み中...</div>';
      loadData().then(() => {
        X.ttsState = localStorage.getItem(LS_TTS_OK) === "1" ? "available" : "unknown";
        if (X.ttsState === "available") {
          // 音声OKの記録があっても voice 一覧は都度取得し直す
          ensureVoicesLoaded().then((voices) => { X.ttsVoicesZh = voices; X.ttsVoice = voices[0] || null; if(!voices.length){X.ttsState="unknown";} render(); });
        }
        const saved = loadJson(LS_SESSION, null);
        if (saved) X.resumeBanner = saved;
        render();
      }).catch((err) => {
        root.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--stamp);">問題データの読み込みに失敗しました。<br>' + String(err.message || err) + '</div>';
      });
    } else {
      render();
    }
  }

  function closeExam() {
    stopAudio();
    document.getElementById("exam-root").hidden = true;
    document.getElementById("hsk-root").hidden = false;
    if (window.HSKApp) window.HSKApp.goHome();
  }

  function goMenu() {
    stopAudio();
    X.screen = "menu";
    render();
  }

  // ======================================================================
  // render dispatcher
  // ======================================================================
  function render() {
    const root = document.getElementById("exam-root");
    if (!root || root.hidden) return;
    root.innerHTML = "";
    let content;
    if (X.screen === "menu") content = renderMenu();
    else if (X.screen === "session") content = renderSession();
    else if (X.screen === "official") content = renderOfficial();
    else if (X.screen === "resultOfficial") content = renderOfficialResult();
    else content = renderMenu();
    root.appendChild(content);
  }

  // 続きは build/render 各関数（別セクションに実装）
  window.__examInternal = {
    get D() { return D; }, get X() { return X; },
    el, shuffle, assetSrc, fmtTime, render,
    recordAttempt, latestAttempt, isInReviewList, getReviewQuestionIds,
    playTurns, stopAudio, testTts,
    saveJson, loadJson, LS_SESSION,
    getOfficialStore, saveOfficialStore,
    REVIEW_NOTES, REVIEW_NOTE_FALLBACK, DISPLAY,
    goMenu, closeExam
  };
})();
