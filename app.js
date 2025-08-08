(function(){
  const STORAGE_KEY = "hydropulse.static.v2";
  const HIST_KEY = "hydropulse.history.v2";
  const todayKey = () => new Date().toISOString().slice(0,10);

  let state = loadState();
  renderAll();

  // Ripple bind
  document.addEventListener("click", function(e){
    const t = e.target.closest(".ripple");
    if(!t) return;
    const rect = t.getBoundingClientRect();
    const r = document.createElement("span");
    r.className = "r";
    const size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + "px";
    r.style.left = (e.clientX - rect.left - size/2) + "px";
    r.style.top  = (e.clientY - rect.top  - size/2) + "px";
    t.appendChild(r);
    setTimeout(()=>r.remove(), 500);
  }, {passive:true});

  // Buttons
  document.querySelectorAll("[data-add]").forEach(btn=>{
    btn.addEventListener("click", ()=>add(parseInt(btn.dataset.add,10)));
  });
  byId("quickBtn").addEventListener("click", ()=>{
    const v = parseInt(byId("quickInput").value||"0",10);
    add(v);
  });
  byId("undoBtn").addEventListener("click", undo);
  byId("resetBtn").addEventListener("click", resetToday);
  byId("goalInput").addEventListener("input", e=>{
    state.goal = clampInt(e.target.value, 0, 100000) || 0;
    save(); renderAll();
  });
  byId("unitSelect").addEventListener("change", e=>{
    state.unit = e.target.value;
    save(); renderAll();
  });
  byId("notifyBtn").addEventListener("click", toggleNotify);
  initMidnightTicker();
  initPWA();
  initParallax();
  drawTrend();

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { date: todayKey(), goal: 1500, unit: "ml", log: [], notifyOn:false };
      const s = JSON.parse(raw);
      if(s.date !== todayKey()) return { date: todayKey(), goal: s.goal||1500, unit: s.unit||"ml", log: [], notifyOn:s.notifyOn||false };
      return s;
    }catch(_){ return { date: todayKey(), goal: 1500, unit: "ml", log: [], notifyOn:false } }
  }

  function save(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saveTodayToHistory();
  }

  function total(){ return state.log.reduce((a,b)=>a+b.amount,0) }
  function progress(){ return Math.min(100, Math.round(total()/Math.max(1,state.goal)*100)) }

  function add(amount){
    if(!amount) return;
    state.log.push({ at: Date.now(), amount });
    save(); renderAll();
  }

  function undo(){
    state.log.pop();
    save(); renderAll();
  }

  function resetToday(){
    state.log = []; save(); renderAll();
  }

  function renderAll(){
    byId("todayDate").textContent = state.date;
    byId("goalText").textContent = state.goal;
    byId("goalInput").value = state.goal;
    byId("totalText").textContent = total();
    byId("pctText").textContent = progress() + "%";
    byId("barInner").style.width = progress() + "%";
    byId("unitSelect").value = state.unit;
    const r = 102, c = 2*Math.PI*r, dash = c*progress()/100;
    byId("ringProg").setAttribute("stroke-dasharray", dash + " " + (c-dash));
    renderLog();
    renderNotifyLabel();
    drawTrend();
  }

  function renderLog(){
    const ul = byId("logList");
    ul.innerHTML = "";
    if(state.log.length === 0){
      const li = document.createElement("li");
      li.className = "muted";
      li.textContent = "No entries yet. Add your first sip!";
      ul.appendChild(li);
      return;
    }
    state.log.slice().reverse().forEach(item=>{
      const li = document.createElement("li");
      li.innerHTML = `<div class="bold">+${item.amount}${state.unit}</div><div class="muted small">${new Date(item.at).toLocaleTimeString()}</div>`;
      ul.appendChild(li);
    });
  }

  function clampInt(v, min, max){
    v = parseInt(v||"0",10);
    if(isNaN(v)) return min;
    return Math.max(min, Math.min(max, v));
  }

  function saveTodayToHistory(){
    const entry = { date: state.date, total: total(), goal: state.goal, unit: state.unit };
    try{
      const raw = localStorage.getItem(HIST_KEY);
      const prev = raw ? JSON.parse(raw) : [];
      const filtered = prev.filter(d=>d.date !== entry.date);
      localStorage.setItem(HIST_KEY, JSON.stringify([...filtered, entry].sort((a,b)=>a.date.localeCompare(b.date))));
    }catch(_){}
  }

  function getHistory(){
    try{
      const raw = localStorage.getItem(HIST_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(_){ return [] }
  }

  function drawTrend(){
    const cvs = byId("trend");
    const ctx = cvs.getContext("2d");
    ctx.clearRect(0,0,cvs.width,cvs.height);
    const hist = getHistory().slice(-7);
    if(hist.length === 0){
      ctx.fillStyle = "#9a9a9a";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText("No history yet — come back tomorrow.", 16, 28);
      return;
    }
    const padding = 24;
    const w = cvs.width - padding*2;
    const h = cvs.height - padding*2;
    const max = Math.max(...hist.map(d=>d.total), 1);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.translate(padding, padding);
    ctx.strokeStyle = "rgba(255,255,255,.08)";
    for(let i=0;i<=4;i++){ 
      const y = h*i/4; 
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); 
    }
    ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((d,i)=>{
      const x = w * i / Math.max(1,hist.length-1);
      const y = h - (d.total/max)*h;
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.fillStyle = "#22d3ee";
    hist.forEach((d,i)=>{
      const x = w * i / Math.max(1,hist.length-1);
      const y = h - (d.total/max)*h;
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    });
    ctx.fillStyle = "#9a9a9a"; ctx.font = "12px system-ui, sans-serif";
    hist.forEach((d,i)=>{
      const x = w * i / Math.max(1,hist.length-1);
      const label = d.date.slice(5);
      ctx.fillText(label, x-14, h+16);
    });
  }

  function initMidnightTicker(){
    setInterval(()=>{
      if(todayKey() !== state.date){
        state = { date: todayKey(), goal: state.goal, unit: state.unit, log: [], notifyOn: state.notifyOn };
        save(); renderAll();
      }
    }, 60*1000);
  }

  async function toggleNotify(){
    if(!("Notification" in window)){ alert("Notifications not supported"); return; }
    if(Notification.permission === "granted"){
      state.notifyOn = !state.notifyOn;
      save(); renderNotifyLabel();
    }else{
      const perm = await Notification.requestPermission();
      if(perm === "granted"){
        state.notifyOn = true; save(); renderNotifyLabel();
      }
    }
  }

  function renderNotifyLabel(){
    const btn = byId("notifyBtn");
    btn.textContent = `Reminders: ${state.notifyOn ? "ON" : "OFF"}`;
    setupReminderInterval();
  }

  let reminderId = null;
  function setupReminderInterval(){
    if(reminderId) clearInterval(reminderId);
    if(state.notifyOn && "Notification" in window && Notification.permission==="granted"){
      reminderId = setInterval(()=>{
        new Notification("HydroPulse Reminder", { body: "Time to sip some water 💧" });
      }, 90*60*1000);
    }
  }

  function byId(id){ return document.getElementById(id) }

  function initPWA(){
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("service-worker.js");
    }
    let deferredPrompt;
    window.addEventListener("beforeinstallprompt", (e)=>{
      e.preventDefault(); deferredPrompt = e;
      const btn = document.getElementById("installBtn");
      btn.style.display = "inline-flex";
      btn.onclick = async ()=>{
        if(!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        btn.style.display = "none";
      };
    });
  }

  function initParallax(){
    const els = Array.from(document.querySelectorAll("[data-parallax]"));
    if(!els.length) return;
    let ticking = false;
    function onScroll(){
      if(ticking) return;
      ticking = true;
      requestAnimationFrame(()=>{
        const y = window.scrollY || 0;
        els.forEach(el=>{
          const speed = parseFloat(el.getAttribute("data-speed")||"0.2");
          el.style.transform = `translate3d(0, ${Math.round(y*speed)}px, 0)`;
        });
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, {passive:true});
    onScroll();
  }
})();