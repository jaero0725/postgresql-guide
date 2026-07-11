/* ============================================================
   DB Study — 공통 스크립트
   · 애니메이션 스텝 플레이어(.anim)
   · 퀴즈(.quiz) · 테마 토글 · 사이드바 · 학습 진도(localStorage)
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 테마 ---------- */
  const savedTheme = localStorage.getItem("dbstudy-theme");
  if (savedTheme) document.documentElement.setAttribute("data-theme", savedTheme);
  else if (window.matchMedia("(prefers-color-scheme: light)").matches)
    document.documentElement.setAttribute("data-theme", "light");

  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", cur);
    localStorage.setItem("dbstudy-theme", cur);
  }

  /* ---------- 애니메이션 스텝 플레이어 ----------
     사용법:
     <div class="anim" data-steps="5" data-title="제목" data-interval="2200">
       <div class="anim-stage"> <svg> ... <g data-show="2">…</g> </svg> </div>
       <div class="anim-caption-src" hidden>
         <p>step 1 설명</p> <p>step 2 설명</p> ...
       </div>
     </div>
     data-show="3"    → step 3부터 표시
     data-show="2-4"  → step 2~4 동안만 표시
     data-active="3"  → step 3에서 클래스 .is-active 부여
  ------------------------------------------------ */
  function parseRange(v) {
    const m = String(v).split("-");
    const from = parseInt(m[0], 10);
    const to = m.length > 1 ? parseInt(m[1], 10) : Infinity;
    return [from, to];
  }

  function setupAnim(root) {
    const total = parseInt(root.dataset.steps, 10) || 1;
    const interval = parseInt(root.dataset.interval, 10) || 2400;
    const captions = Array.from(root.querySelectorAll(".anim-caption-src p")).map(p => p.innerHTML);
    let step = 1;
    let timer = null;

    // 헤더
    const head = document.createElement("div");
    head.className = "anim-head";
    head.innerHTML = '<span class="dot"></span><span class="anim-title"></span>';
    head.querySelector(".anim-title").textContent = root.dataset.title || "애니메이션";
    root.prepend(head);

    // 캡션 영역
    const cap = document.createElement("div");
    cap.className = "anim-caption";
    cap.innerHTML = '<span class="step-badge"></span><span class="cap-text"></span>';
    root.append(cap);

    // 컨트롤
    const ctrl = document.createElement("div");
    ctrl.className = "anim-controls";
    ctrl.innerHTML =
      '<button class="play-btn" type="button">▶ 재생</button>' +
      '<button class="prev-btn" type="button">⏮ 이전</button>' +
      '<button class="next-btn" type="button">다음 ⏭</button>' +
      '<div class="anim-progress"><i></i></div>' +
      '<button class="reset-btn" type="button">↺ 처음</button>';
    root.append(ctrl);

    const playBtn = ctrl.querySelector(".play-btn");
    const bar = ctrl.querySelector(".anim-progress i");

    function render() {
      root.dataset.step = step;
      root.querySelectorAll("[data-show]").forEach(el => {
        const [f, t] = parseRange(el.dataset.show);
        el.classList.toggle("shown", step >= f && step <= t);
      });
      root.querySelectorAll("[data-active]").forEach(el => {
        const [f, t] = parseRange(el.dataset.active);
        el.classList.toggle("is-active", step >= f && step <= t);
      });
      cap.querySelector(".step-badge").textContent = "STEP " + step + "/" + total;
      cap.querySelector(".cap-text").innerHTML = captions[step - 1] || "";
      bar.style.width = (step / total * 100) + "%";
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.textContent = "▶ 재생";
      playBtn.classList.remove("playing");
    }
    function play() {
      if (step >= total) step = 0;
      playBtn.textContent = "⏸ 정지";
      playBtn.classList.add("playing");
      const tick = () => {
        if (step >= total) { stop(); return; }
        step++;
        render();
      };
      tick();
      timer = setInterval(tick, interval);
    }

    playBtn.addEventListener("click", () => (timer ? stop() : play()));
    ctrl.querySelector(".next-btn").addEventListener("click", () => { stop(); if (step < total) { step++; render(); } });
    ctrl.querySelector(".prev-btn").addEventListener("click", () => { stop(); if (step > 1) { step--; render(); } });
    ctrl.querySelector(".reset-btn").addEventListener("click", () => { stop(); step = 1; render(); });

    render();

    // 화면에 처음 들어오면 자동 1회 재생
    if (!("noautoplay" in root.dataset) && "IntersectionObserver" in window) {
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) { io.disconnect(); setTimeout(play, 500); }
        });
      }, { threshold: 0.45 });
      io.observe(root);
    }
  }

  /* ---------- 퀴즈 ---------- */
  function setupQuiz(q) {
    const btns = q.querySelectorAll(".quiz-opts button");
    btns.forEach(b => {
      b.addEventListener("click", () => {
        if (q.classList.contains("answered")) return;
        q.classList.add("answered");
        btns.forEach(x => {
          if ("correct" in x.dataset) x.classList.add("correct");
        });
        if (!("correct" in b.dataset)) b.classList.add("wrong");
      });
    });
  }

  /* ---------- 코드 복사 ---------- */
  function setupCopy(pre) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "복사";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(pre.querySelector("code")?.innerText || pre.innerText).then(() => {
        btn.textContent = "복사됨 ✓";
        setTimeout(() => (btn.textContent = "복사"), 1500);
      });
    });
    pre.appendChild(btn);
  }

  /* ---------- 학습 진도 ---------- */
  const PROG_KEY = "dbstudy-progress";
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(PROG_KEY)) || {}; } catch { return {}; }
  }
  function setProgress(p) { localStorage.setItem(PROG_KEY, JSON.stringify(p)); }

  function pageId() {
    return (document.body.dataset.page || location.pathname).replace(/\/index\.html$/, "/");
  }

  function setupProgress() {
    const prog = getProgress();
    // 사이드바 완료 표시
    document.querySelectorAll(".sidebar a.chap[data-page]").forEach(a => {
      if (prog[a.dataset.page]) a.classList.add("done");
    });
    // 완료 버튼
    const btn = document.querySelector(".done-btn");
    if (btn) {
      const id = pageId();
      const sync = () => {
        const done = !!getProgress()[id];
        btn.classList.toggle("done", done);
        btn.textContent = done ? "✓ 학습 완료!" : "이 장 완료로 표시";
      };
      btn.addEventListener("click", () => {
        const p = getProgress();
        if (p[id]) delete p[id]; else p[id] = Date.now();
        setProgress(p);
        sync();
        document.querySelectorAll('.sidebar a.chap[data-page="' + id + '"]')
          .forEach(a => a.classList.toggle("done", !!getProgress()[id]));
      });
      sync();
    }
    // 홈 화면 진도 카운터
    document.querySelectorAll("[data-progress-of]").forEach(el => {
      const prefix = el.dataset.progressOf;
      const n = Object.keys(prog).filter(k => k.startsWith(prefix)).length;
      el.textContent = n;
    });
  }

  /* ---------- 초기화 ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".anim").forEach(setupAnim);
    document.querySelectorAll(".quiz").forEach(setupQuiz);
    document.querySelectorAll("main pre").forEach(setupCopy);
    setupProgress();

    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) themeBtn.addEventListener("click", toggleTheme);

    const navBtn = document.getElementById("nav-toggle");
    if (navBtn) navBtn.addEventListener("click", () => document.body.classList.toggle("nav-open"));

    // 현재 챕터 사이드바 강조
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".sidebar a.chap").forEach(a => {
      const href = a.getAttribute("href").split("/").pop();
      if (href === here) {
        a.classList.add("active");
        a.scrollIntoView({ block: "center" });
      }
    });
  });
})();
