/* Digital Vector — "Ask this site" assistant
   Two modes:
     • Search   : BM25 over a prebuilt corpus of every page. 100% offline, no setup.
     • Local AI : Llama 3.2 running IN THE BROWSER via WebLLM + WebGPU.
                  One switch. Downloads the model once (cached by the browser),
                  then answers stream on-device — nothing leaves the machine,
                  no Ollama, no install, no server.
   AU English. */
(function () {
  "use strict";
  if (window.top !== window.self) return;          // don't mount inside the hub iframe
  if (window.__dvChatMounted) return;
  window.__dvChatMounted = true;

  /* ---------------- WebLLM config ---------------- */
  // Pinned ESM build of @mlc-ai/web-llm (first load needs internet; then cached offline).
  var WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.84";
  var LLM_PRIMARY  = "Llama-3.2-3B-Instruct-q4f16_1-MLC";   // ~1.8 GB
  var LLM_FALLBACK = "Llama-3.2-1B-Instruct-q4f16_1-MLC";   // ~0.9 GB, for lower-spec machines
  var hasWebGPU = (typeof navigator !== "undefined" && !!navigator.gpu);

  /* ---------------- styles ---------------- */
  var css = `
  .dvc-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;
    background:#1f6feb;color:#fff;border:none;border-radius:999px;padding:12px 16px;font:600 14px/1 system-ui,Segoe UI,Roboto,sans-serif;
    box-shadow:0 6px 24px rgba(0,0,0,.28);cursor:pointer;transition:transform .12s ease,background .12s}
  .dvc-fab:hover{background:#2b7bf3;transform:translateY(-1px)}
  .dvc-fab svg{width:18px;height:18px}
  .dvc-panel{position:fixed;right:20px;bottom:20px;z-index:2147483001;width:min(420px,calc(100vw - 32px));
    height:min(640px,calc(100vh - 32px));background:#0f1420;color:#e6e9ef;border:1px solid #232a39;border-radius:16px;
    box-shadow:0 18px 60px rgba(0,0,0,.5);display:none;flex-direction:column;overflow:hidden;
    font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
  .dvc-panel.open{display:flex}
  .dvc-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px;border-bottom:1px solid #1c2230;background:#121826}
  .dvc-head h3{margin:0;font-size:15px;font-weight:700;flex:1;color:#fff}
  .dvc-dot{width:8px;height:8px;border-radius:50%;background:#6b7587;flex:none}
  .dvc-dot.on{background:#3fb950;box-shadow:0 0 0 3px rgba(63,185,80,.18)}
  .dvc-dot.load{background:#d8a72e;box-shadow:0 0 0 3px rgba(216,167,46,.18)}
  .dvc-x{background:none;border:none;color:#9aa4b2;font-size:20px;cursor:pointer;line-height:1;padding:2px 6px;border-radius:6px}
  .dvc-x:hover{background:#1c2230;color:#fff}
  .dvc-modes{display:flex;gap:6px;padding:10px 14px 6px;background:#121826}
  .dvc-mode{flex:1;text-align:center;padding:8px 6px;border-radius:9px;background:#1a2130;color:#aeb6c4;
    border:1px solid #232a39;cursor:pointer;font-weight:600;font-size:12.5px}
  .dvc-mode.sel{background:#1f6feb;color:#fff;border-color:#1f6feb}
  .dvc-mode.disabled{opacity:.55;cursor:not-allowed}
  .dvc-mode small{display:block;font-weight:500;font-size:10.5px;opacity:.85;margin-top:2px}
  /* AI status / progress strip */
  .dvc-aibar{display:none;padding:0 14px 10px;background:#121826}
  .dvc-aibar.show{display:block}
  .dvc-aibar .lbl{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#aab4c4;margin-bottom:6px}
  .dvc-aibar .lbl b{color:#e8edf6;font-weight:600}
  .dvc-prog{height:6px;border-radius:6px;background:#0c111b;border:1px solid #20283a;overflow:hidden}
  .dvc-progfill{height:100%;width:0%;background:linear-gradient(90deg,#1f6feb,#4fc1ff);transition:width .25s ease}
  .dvc-aibar.ready .dvc-prog{display:none}
  .dvc-body{flex:1;overflow-y:auto;padding:14px;scroll-behavior:smooth}
  .dvc-hint{color:#8b95a6;font-size:12.5px;margin:2px 0 12px}
  .dvc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
  .dvc-chip{background:#1a2130;border:1px solid #232a39;color:#b9c2d0;border-radius:999px;padding:5px 10px;
    font-size:12px;cursor:pointer}
  .dvc-chip:hover{border-color:#1f6feb;color:#fff}
  .dvc-msg{margin:10px 0;padding:11px 13px;border-radius:11px;font-size:13.4px}
  .dvc-msg.you{background:#1f6feb;color:#fff;margin-left:36px}
  .dvc-msg.bot{background:#161d2b;border:1px solid #1f2736}
  .dvc-msg.bot b{color:#fff}
  .dvc-card{display:block;width:100%;text-align:left;background:#141b28;border:1px solid #222b3b;border-left:3px solid #1f6feb;
    border-radius:10px;padding:10px 12px;margin:8px 0;cursor:pointer;color:#dfe4ee}
  .dvc-card:hover{background:#18212f;border-left-color:#3fb950}
  .dvc-card .t{font-weight:700;font-size:12.5px;color:#fff;margin-bottom:3px}
  .dvc-card .c{font-size:11px;color:#7f8aa0;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
  .dvc-card .s{font-size:12.6px;color:#c2cad8}
  .dvc-card mark{background:#3c2f00;color:#ffd66b;padding:0 2px;border-radius:3px}
  .dvc-foot{padding:10px;border-top:1px solid #1c2230;background:#121826}
  .dvc-inrow{display:flex;gap:8px}
  .dvc-in{flex:1;background:#0c111b;border:1px solid #2a3344;color:#fff;border-radius:10px;padding:11px 12px;
    font-size:13.5px;outline:none;resize:none;max-height:90px}
  .dvc-in:focus{border-color:#1f6feb}
  .dvc-send{background:#1f6feb;border:none;color:#fff;border-radius:10px;padding:0 15px;cursor:pointer;font-weight:700}
  .dvc-send:hover{background:#2b7bf3}
  .dvc-send:disabled{opacity:.5;cursor:default}
  .dvc-note{font-size:11px;color:#7f8aa0;margin-top:7px;text-align:center}
  .dvc-note a{color:#5aa7ff;cursor:pointer;text-decoration:underline}
  .dvc-spin{display:inline-block;width:13px;height:13px;border:2px solid #2a3850;border-top-color:#5aa7ff;border-radius:50%;
    animation:dvspin .7s linear infinite;vertical-align:-2px;margin-right:6px}
  @keyframes dvspin{to{transform:rotate(360deg)}}
  .dvc-cursor{display:inline-block;width:7px;height:14px;background:#5aa7ff;vertical-align:-2px;animation:dvblink 1s step-end infinite}
  @keyframes dvblink{50%{opacity:0}}
  @media(max-width:520px){.dvc-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100vh - 16px)}}
  `;
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------------- DOM ---------------- */
  var fab = document.createElement("button");
  fab.className = "dvc-fab";
  fab.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>' +
    "<span>Ask this site</span>";
  document.body.appendChild(fab);

  var panel = document.createElement("div");
  panel.className = "dvc-panel";
  panel.innerHTML =
    '<div class="dvc-head"><span class="dvc-dot" id="dvcDot"></span>' +
    '<h3>Ask this site</h3><button class="dvc-x" id="dvcClose">×</button></div>' +
    '<div class="dvc-modes">' +
    '<div class="dvc-mode sel" data-mode="search">Search<small>find on every page</small></div>' +
    '<div class="dvc-mode" data-mode="ai">Local AI<small id="dvcAiSub">' +
      (hasWebGPU ? "runs in your browser" : "needs WebGPU") + "</small></div>" +
    "</div>" +
    '<div class="dvc-aibar" id="dvcAiBar">' +
      '<div class="lbl" id="dvcAiLbl"></div>' +
      '<div class="dvc-prog"><div class="dvc-progfill" id="dvcProg"></div></div>' +
    "</div>" +
    '<div class="dvc-body" id="dvcBody"></div>' +
    '<div class="dvc-foot"><div class="dvc-inrow">' +
    '<textarea class="dvc-in" id="dvcIn" rows="1" placeholder="Ask about a topic, term or exam question…"></textarea>' +
    '<button class="dvc-send" id="dvcSend">Ask</button></div>' +
    '<div class="dvc-note" id="dvcNote">Searches all topics offline. No data leaves your device.</div></div>';
  document.body.appendChild(panel);

  var $ = function (id) { return document.getElementById(id); };
  var body = $("dvcBody"), input = $("dvcIn"), sendBtn = $("dvcSend"),
    dot = $("dvcDot"), note = $("dvcNote"), aiSub = $("dvcAiSub"),
    aiBar = $("dvcAiBar"), aiLbl = $("dvcAiLbl"), prog = $("dvcProg");

  var mode = "search", busy = false;
  // AI engine state
  var engine = null, enginePromise = null, aiState = "idle"; // idle|loading|ready|error
  var activeModel = LLM_PRIMARY;

  /* ---------------- open / close ---------------- */
  function openPanel() { panel.classList.add("open"); fab.style.display = "none"; input.focus(); }
  function closePanel() { panel.classList.remove("open"); fab.style.display = "flex"; }
  fab.addEventListener("click", openPanel);
  $("dvcClose").addEventListener("click", closePanel);

  /* ---------------- mode switch (the "flip a switch") ---------------- */
  Array.prototype.forEach.call(panel.querySelectorAll(".dvc-mode"), function (el) {
    el.addEventListener("click", function () {
      var target = el.dataset.mode;
      if (target === "ai" && !hasWebGPU) {           // unsupported browser → explain, stay on search
        setMode("search");
        note.innerHTML = "In-browser AI needs <b>WebGPU</b> (Chrome or Edge 113+). Search still works everywhere.";
        return;
      }
      setMode(target);
    });
  });

  function setMode(m) {
    mode = m;
    panel.querySelectorAll(".dvc-mode").forEach(function (x) {
      x.classList.toggle("sel", x.dataset.mode === m);
    });
    if (m === "ai") {
      aiBar.classList.add("show");                   // show AI status strip
      if (aiState === "idle" || aiState === "error") startLoad();  // first time / retry → auto-download + run
      else refreshAiNote();
    } else {
      aiBar.classList.remove("show");                // SEARCH: hide all AI UI (fixes stale-instructions bug)
      note.innerHTML = "Searches all topics offline. No data leaves your device.";
    }
  }

  function refreshAiNote() {
    if (aiState === "ready") {
      note.innerHTML = "Llama 3.2 is running on your device — answers are grounded in this site.";
    } else if (aiState === "loading") {
      note.innerHTML = "Setting up the on-device model…";
    } else if (aiState === "error") {
      note.innerHTML = "Couldn't start in-browser AI. Using Search instead is always available.";
    }
  }

  /* ---------------- WebLLM load (automatic, cached) ---------------- */
  function setProg(pct, text) {
    prog.style.width = Math.max(0, Math.min(100, pct)) + "%";
    aiLbl.innerHTML = text;
  }
  function startLoad() {
    if (aiState === "error") { engine = null; enginePromise = null; activeModel = LLM_PRIMARY; }
    aiState = "loading";
    dot.classList.add("load");
    aiSub.textContent = "starting…";
    aiBar.classList.remove("ready");
    setProg(2, '<span class="dvc-spin"></span><b>Preparing Llama 3.2</b> — first time only');
    refreshAiNote();
    loadEngine(activeModel).then(function () {
      aiState = "ready";
      dot.classList.remove("load"); dot.classList.add("on");
      aiSub.textContent = "ready · on-device";
      aiBar.classList.add("ready");
      setProg(100, "<b>Ready</b> — Llama 3.2 is running locally");
      refreshAiNote();
    }).catch(function (e) {
      // try the lighter model once before giving up
      if (activeModel === LLM_PRIMARY) {
        activeModel = LLM_FALLBACK; engine = null; enginePromise = null;
        setProg(2, '<span class="dvc-spin"></span>Loading a lighter model…');
        loadEngine(activeModel).then(function () {
          aiState = "ready"; dot.classList.remove("load"); dot.classList.add("on");
          aiSub.textContent = "ready · on-device (1B)";
          aiBar.classList.add("ready");
          setProg(100, "<b>Ready</b> — Llama 3.2 (1B) is running locally");
          refreshAiNote();
        }).catch(failLoad);
      } else { failLoad(e); }
    });
  }
  function failLoad() {
    aiState = "error"; dot.classList.remove("load"); dot.classList.remove("on");
    aiSub.textContent = "unavailable";
    aiBar.classList.remove("ready");
    setProg(0, "Couldn't load the model (low memory or no network on first run).");
    refreshAiNote();
  }

  function loadEngine(model) {
    if (engine) return Promise.resolve(engine);
    if (enginePromise) return enginePromise;
    enginePromise = import(/* @vite-ignore */ WEBLLM_URL).then(function (webllm) {
      return webllm.CreateMLCEngine(model, {
        initProgressCallback: function (r) {
          var pct = Math.round((r.progress || 0) * 100);
          var label;
          if (/cache|fetch|download/i.test(r.text || "")) label = "<b>Downloading model</b> · " + pct + "%";
          else if (/load|gpu|shader|compil/i.test(r.text || "")) label = "<b>Loading into GPU</b> · " + pct + "%";
          else label = pct >= 100 ? "<b>Finalising…</b>" : "<b>Preparing</b> · " + pct + "%";
          setProg(Math.max(3, pct), label);
          aiSub.textContent = pct + "%";
        }
      });
    }).then(function (e) { engine = e; return e; });
    return enginePromise;
  }

  /* ---------------- input behaviour ---------------- */
  input.addEventListener("input", function () {
    input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 90) + "px";
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });
  sendBtn.addEventListener("click", submit);

  function addMsg(cls, html) {
    var d = document.createElement("div");
    d.className = "dvc-msg " + cls; d.innerHTML = html;
    body.appendChild(d); body.scrollTop = body.scrollHeight;
    return d;
  }

  /* ---------------- welcome / suggestions ---------------- */
  function welcome() {
    body.innerHTML = "";
    var chips = ["Australian Privacy Principles", "functional vs non-functional requirements",
      "what is encapsulation?", "types of malware", "validation techniques",
      "primary and foreign keys"];
    var html = '<div class="dvc-hint">Ask a question or pick a topic. ' +
      "I search every chapter and sub-topic in this site." +
      (hasWebGPU ? " Flip on <b>Local AI</b> for full-sentence answers, on your device." : "") +
      "</div>" +
      '<div class="dvc-chips">' +
      chips.map(function (c) { return '<button class="dvc-chip">' + esc(c) + "</button>"; }).join("") +
      "</div>";
    var w = document.createElement("div"); w.innerHTML = html; body.appendChild(w);
    body.querySelectorAll(".dvc-chip").forEach(function (b) {
      b.addEventListener("click", function () { input.value = b.textContent; submit(); });
    });
  }

  /* ---------------- submit ---------------- */
  function submit() {
    var q = input.value.trim();
    if (!q || busy) return;
    if (!body.querySelector(".dvc-msg")) body.innerHTML = "";
    addMsg("you", esc(q));
    input.value = ""; input.style.height = "auto";
    var hits = search(q, 6);
    if (mode === "ai" && aiState === "ready") { aiAnswer(q, hits); }
    else if (mode === "ai" && aiState === "loading") {
      var b = addMsg("bot", "The on-device model is still downloading — here are the matching pages meanwhile:");
      hits.forEach(function (h) { b.appendChild(card(h, q)); });
    } else { showResults(q, hits); }
  }

  function showResults(q, hits) {
    if (!hits.length) {
      addMsg("bot", "No close matches found. Try a key term — e.g. <b>encryption</b>, " +
        "<b>data quality</b> or <b>iteration</b>.");
      return;
    }
    var bot = addMsg("bot", "Top matches across the site:");
    hits.forEach(function (h) { bot.appendChild(card(h, q)); });
    body.scrollTop = body.scrollHeight;
  }

  function card(h, q) {
    var d = h.doc;
    var b = document.createElement("button");
    b.className = "dvc-card";
    var loc = d.kind === "chapter" ? d.chapter + " · chapter" : d.code + " · " + d.title;
    b.innerHTML = '<div class="c">' + esc(loc) + "</div>" +
      '<div class="t">' + esc(d.head) + "</div>" +
      '<div class="s">' + highlight(snippet(d.text, q), q) + "</div>";
    b.addEventListener("click", function () { navigate(d); });
    return b;
  }

  /* ---------------- navigation ---------------- */
  function navigate(d) {
    try {
      if (d.kind === "chapter" && typeof window.openChapter === "function") {
        window.openChapter(d.nav); closePanel(); return;
      }
      if (typeof window.openModule === "function") {
        window.openModule(d.nav); closePanel(); return;
      }
    } catch (e) { }
    var target = d.kind === "chapter" ? "index.html#c=" + d.nav : "index.html#m=" + d.nav;
    window.location.href = target;
  }

  /* ---------------- Local AI answer (streamed, grounded) ---------------- */
  function aiAnswer(q, hits) {
    if (!hits.length) {
      addMsg("bot", "I couldn't find anything on that in the site content, so I won't guess. " +
        "Try rewording with a key term.");
      return;
    }
    busy = true; sendBtn.disabled = true;
    var ctx = hits.slice(0, 5).map(function (h, i) {
      var d = h.doc;
      var tag = d.kind === "chapter" ? d.chapter : d.code + " " + d.title;
      return "[" + (i + 1) + "] (" + tag + " — " + d.head + ")\n" + d.text;
    }).join("\n\n");
    var sys = "You are a study assistant for a VCE Applied Computing (Units 1 & 2) website. " +
      "Answer ONLY from the provided context. If it is not covered, say so plainly. " +
      "Use Australian English and British spelling. Be clear and concise, like a teacher. " +
      "Where useful, name the source tag in brackets, e.g. (KK05 Australian Privacy Principles). " +
      "Do not invent facts or marks.";
    var usr = "Context:\n" + ctx + "\n\nQuestion: " + q + "\n\nAnswer:";

    var bot = addMsg("bot", '<span class="dvc-spin"></span>Thinking…');
    var acc = "";

    (async function () {
      try {
        var stream = await engine.chat.completions.create({
          messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
          stream: true, temperature: 0.2, max_tokens: 800
        });
        for await (var chunk of stream) {
          var delta = (chunk.choices && chunk.choices[0] && chunk.choices[0].delta &&
            chunk.choices[0].delta.content) || "";
          if (delta) {
            acc += delta;
            bot.innerHTML = mdLite(acc) + '<span class="dvc-cursor"></span>';
            body.scrollTop = body.scrollHeight;
          }
        }
        bot.innerHTML = mdLite(acc || "(no answer)");
        var src = document.createElement("div"); src.style.marginTop = "8px";
        src.innerHTML = '<div class="dvc-note" style="text-align:left">Sources:</div>';
        bot.appendChild(src);
        hits.slice(0, 3).forEach(function (h) { bot.appendChild(card(h, q)); });
      } catch (e) {
        bot.innerHTML = "The on-device model hit a problem. Showing search matches instead:";
        hits.forEach(function (h) { bot.appendChild(card(h, q)); });
      } finally {
        busy = false; sendBtn.disabled = false; body.scrollTop = body.scrollHeight;
      }
    })();
  }

  /* ================= BM25 search engine ================= */
  var STOP = {};
  "a an the of to in on for and or is are was be as at by with from this that it its into your you".split(" ")
    .forEach(function (w) { STOP[w] = 1; });

  function tok(s) {
    var out = [], m = (s || "").toLowerCase().match(/[a-z0-9]+/g) || [];
    for (var i = 0; i < m.length; i++) {
      var w = m[i];
      if (w.length < 2 || STOP[w]) continue;
      if (w.length > 4 && w.charAt(w.length - 1) === "s") w = w.slice(0, -1);
      out.push(w);
    }
    return out;
  }

  var IDX = null;
  function buildIndex() {
    var docs = window.DV_CORPUS || [];
    var df = {}, N = docs.length, postings = [], lens = [], total = 0;
    for (var i = 0; i < N; i++) {
      var terms = tok(docs[i].head + " " + docs[i].text + " " + docs[i].title + " " + docs[i].code);
      var tf = {}; for (var j = 0; j < terms.length; j++) tf[terms[j]] = (tf[terms[j]] || 0) + 1;
      postings.push(tf); lens.push(terms.length); total += terms.length;
      for (var t in tf) df[t] = (df[t] || 0) + 1;
    }
    var idf = {};
    for (var t2 in df) idf[t2] = Math.log(1 + (N - df[t2] + 0.5) / (df[t2] + 0.5));
    IDX = { docs: docs, postings: postings, lens: lens, idf: idf, avg: total / (N || 1), N: N };
  }

  function search(q, k) {
    if (!IDX) buildIndex();
    if (!IDX.N) return [];
    var qt = tok(q), k1 = 1.5, b = 0.75, scores = [];
    for (var i = 0; i < IDX.N; i++) {
      var tf = IDX.postings[i], len = IDX.lens[i], s = 0;
      for (var j = 0; j < qt.length; j++) {
        var f = tf[qt[j]]; if (!f) continue;
        var idf = IDX.idf[qt[j]] || 0;
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * len / IDX.avg));
      }
      if (s > 0) scores.push({ i: i, s: s, doc: IDX.docs[i] });
    }
    scores.sort(function (a, c) { return c.s - a.s; });
    var seen = {}, out = [];
    for (var n = 0; n < scores.length && out.length < k; n++) {
      var key = scores[n].doc.file + "|" + scores[n].doc.head;
      if (seen[key]) continue; seen[key] = 1; out.push(scores[n]);
    }
    return out;
  }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function snippet(text, q) {
    var qt = tok(q), low = text.toLowerCase(), pos = -1;
    for (var i = 0; i < qt.length; i++) { var p = low.indexOf(qt[i]); if (p >= 0) { pos = p; break; } }
    if (pos < 0) return text.slice(0, 150) + (text.length > 150 ? "…" : "");
    var start = Math.max(0, pos - 50), end = Math.min(text.length, pos + 130);
    return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  }
  function highlight(text, q) {
    var out = esc(text);
    tok(q).forEach(function (w) {
      if (w.length < 3) return;
      out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "ig"),
        "<mark>$1</mark>");
    });
    return out;
  }
  function mdLite(s) {
    var h = esc(s);
    h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
    h = h.replace(/`([^`]+)`/g, '<code style="background:#0c1420;padding:1px 4px;border-radius:4px">$1</code>');
    h = h.replace(/\n\s*[-•]\s+/g, "<br>• ").replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
    return h;
  }

  welcome();
})();
