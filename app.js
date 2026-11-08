(() => {
  const cfg = window.WEAR_CONDOM_CONFIG || {};
  const hasConfig = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !String(cfg.supabaseAnonKey).includes("PASTE_YOUR"));
  const sb = hasConfig && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let currentUser = null, authMode = "signup", toastTimer;

  $("#year").textContent = new Date().getFullYear();
  const toast = (msg) => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3200); };
  const msg = (id, text, error=false) => { const el=$(id); if(el){el.textContent=text;el.style.color=error?"#e6a18f":"var(--gold)";} };

  // Age gate is a front-door self-attestation, not legal identity verification.
  const ageGate = $("#ageGate"), ageConfirm = $("#ageConfirm"), enterSite = $("#enterSite");
  const dismissAgeGate = () => {
    ageGate.classList.add("dismissed");
    ageGate.style.display = "none";
    try { sessionStorage.setItem("wc_age_ok", "yes"); } catch (_) {}
  };
  try { if (sessionStorage.getItem("wc_age_ok") === "yes") dismissAgeGate(); } catch (_) {}
  ageConfirm.addEventListener("change", () => { enterSite.disabled = !ageConfirm.checked; });
  enterSite.addEventListener("click", (event) => {
    event.preventDefault();
    if (!ageConfirm.checked) return;
    dismissAgeGate();
  });
  $("#leaveSite").addEventListener("click",()=>{document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:30px;color:#ddd;font-family:Arial"><div><h1>Access unavailable</h1><p>This community is for adults aged 18 and over.</p></div></main>';});

  function showAuth(mode="signup"){ authMode=mode; $("#authModal").classList.remove("hidden"); $("#authTitle").innerHTML=mode==="signup"?'Create your <em>account.</em>':'Welcome <em>back.</em>'; $("#nameField").classList.toggle("hidden",mode==="signin"); $("#adultConsent").classList.toggle("hidden",mode==="signin"); $("#authSubmit").textContent=mode==="signup"?"Create account ↗":"Sign in ↗"; $$(".auth-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode)); msg("#authMessage",""); $("#authPassword").autocomplete=mode==="signup"?"new-password":"current-password"; }
  ["#openAuth","#joinTop","#heroJoin","#creatorJoin"].forEach(s=>$(s).addEventListener("click",()=>showAuth("signup")));
  $("#closeAuth").addEventListener("click",()=>$("#authModal").classList.add("hidden"));
  $$(".auth-tabs button").forEach(b=>b.addEventListener("click",()=>showAuth(b.dataset.mode)));
  $("#menuToggle").addEventListener("click",()=>$(".desktop-nav").classList.toggle("open"));
  $$(".desktop-nav a").forEach(a=>a.addEventListener("click",()=>$(".desktop-nav").classList.remove("open")));

  $("#authForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!sb){msg("#authMessage","Supabase is not connected yet. Add the project's public anon key in config.js.",true);return;}
    const email=$("#authEmail").value.trim(), password=$("#authPassword").value, name=$("#authName").value.trim();
    if(authMode==="signup"&&!$("#adultCheckbox").checked){msg("#authMessage","Please confirm that you are 18 or older.",true);return;}
    $("#authSubmit").disabled=true; msg("#authMessage",authMode==="signup"?"Creating your account…":"Signing you in…");
    try{
      let result;
      if(authMode==="signup"){
        result=await sb.auth.signUp({email,password,options:{data:{display_name:name}}});
        if(result.error) throw result.error;
        if(result.data.user && result.data.session){ await ensureProfile(result.data.user,name); }
        msg("#authMessage",result.data.session?"Account created. Welcome to the community.":"Check your email to confirm your account, then sign in.");
        if(result.data.session){$("#authModal").classList.add("hidden");toast("Your account is ready.");}
      }else{
        result=await sb.auth.signInWithPassword({email,password});
        if(result.error) throw result.error;
        $("#authModal").classList.add("hidden");toast("Welcome back.");
      }
    }catch(err){msg("#authMessage",err.message||"Something went wrong. Please try again.",true);}
    finally{$("#authSubmit").disabled=false;}
  });

  async function ensureProfile(user,displayName){
    const row={id:user.id,display_name:displayName||user.user_metadata?.display_name||"New creator"};
    const {error}=await sb.from("adult_creator_profiles").upsert(row,{onConflict:"id"});
    if(error) throw error;
  }
  async function loadSession(){
    if(!sb){$("#creatorGrid").innerHTML='<div class="empty-state">The site design is live. Add the Supabase anon key to enable registration, profiles and creator tools.</div>';return;}
    const {data}=await sb.auth.getSession(); currentUser=data.session?.user||null; updateAuthUI();
    sb.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;updateAuthUI();});
    await loadCreators(); await loadArticles();
  }
  function updateAuthUI(){
    $("#userChip").textContent=currentUser?(currentUser.email||"MEMBER"):"18+ COMMUNITY";
    $("#openAuth").textContent=currentUser?"Dashboard":"Sign in";
    $("#openAuth").onclick=()=>currentUser?openDashboard():showAuth("signin");
    $("#joinTop").classList.toggle("hidden",!!currentUser);
    $("#dashboard").classList.toggle("hidden",!currentUser);
    if(currentUser){$("#dashboardEmail").textContent=currentUser.email||"";$("#dashboard").scrollIntoView({behavior:"smooth",block:"start"});loadDashboard();}
  }
  async function loadCreators(){
    const grid=$("#creatorGrid");
    const {data,error}=await sb.from("adult_creator_profiles").select("id,display_name,bio,country,avatar_path,moderation_status,is_adult_verified,identity_verified,consent_reviewed").limit(12);
    if(error){grid.innerHTML='<div class="empty-state">Creator profiles will appear here once approved and the public profile policy is enabled.</div>';return;}
    const rows=(data||[]).filter(x=>x.moderation_status==="approved"&&x.is_adult_verified===true&&x.identity_verified===true&&x.consent_reviewed===true);
    grid.innerHTML=rows.length?rows.map(p=>'<article class="creator-card"><div class="creator-avatar">'+escapeHtml((p.display_name||"C").slice(0,1).toUpperCase())+'</div><h3>'+escapeHtml(p.display_name||"Creator")+'</h3><p>'+escapeHtml(p.bio||"Independent creator")+'</p><div class="creator-meta"><span>✓ APPROVED</span><span>'+escapeHtml(p.country||"COMMUNITY")+'</span></div></article>').join(""):'<div class="empty-state">No approved creator profiles to show yet. Be the first to create a profile.</div>';
  }
  async function loadArticles(){
    const {data,error}=await sb.from("adult_wellness_articles").select("*").limit(6);
    if(error||!data?.length)return;
    const cards=data.map((a,i)=>{const title=a.title||a.headline||"Wellness resource";const body=a.summary||a.excerpt||a.content||"Read this community wellness resource.";return '<article class="article-card"><span class="article-number">RESOURCE '+String(i+1).padStart(2,"0")+'</span><h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(String(body).slice(0,190))+'</p></article>';}).join("");
    $("#articleGrid").innerHTML=cards;
  }
  function openDashboard(){if(!currentUser){showAuth("signin");return;}$("#dashboard").classList.remove("hidden");$("#dashboard").scrollIntoView({behavior:"smooth"});loadDashboard();}
  async function loadDashboard(){
    if(!sb||!currentUser)return;
    const {data,error}=await sb.from("adult_creator_profiles").select("*").eq("id",currentUser.id).maybeSingle();
    if(data){$("#displayName").value=data.display_name||currentUser.user_metadata?.display_name||"";$("#bio").value=data.bio||"";$("#country").value=data.country||"";}
    else if(error)msg("#profileMessage",error.message,true);
    const tiers=await sb.from("adult_subscription_tiers").select("*").eq("creator_id",currentUser.id).order("created_at",{ascending:false});
    $("#tierList").innerHTML=tiers.data?.length?tiers.data.map(t=>'<div class="compact-item"><span>'+escapeHtml(t.tier_name||"Membership")+'</span><b>'+escapeHtml(t.currency||"USD")+' '+((Number(t.price_minor||0)/100).toFixed(2))+'</b></div>').join(""):'<p class="tiny">Your membership tiers will appear here.</p>';
    const media=await sb.from("adult_creator_media").select("id,media_type,moderation_status,created_at").eq("creator_id",currentUser.id).order("created_at",{ascending:false});
    $("#mediaList").innerHTML=media.data?.length?media.data.map(m=>'<div class="compact-item"><span>'+escapeHtml(m.media_type||"Media")+'</span><b>'+escapeHtml(m.moderation_status||"pending")+'</b></div>').join(""):'<p class="tiny">No media submissions yet.</p>';
  }
  $("#profileForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!sb||!currentUser)return;
    const row={id:currentUser.id,display_name:$("#displayName").value.trim(),bio:$("#bio").value.trim(),country:$("#country").value.trim()};
    const {error}=await sb.from("adult_creator_profiles").upsert(row,{onConflict:"id"});
    msg("#profileMessage",error?error.message:"Profile saved. It will be publicly visible only after approval.",!!error);
    if(!error)await loadCreators();
  });
  $("#tierForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!sb||!currentUser)return;
    const f=new FormData(e.currentTarget), price=Math.round(Number(f.get("price"))*100);
    const {error}=await sb.from("adult_subscription_tiers").insert({creator_id:currentUser.id,tier_name:String(f.get("tier_name")).trim(),description:String(f.get("description")||"").trim(),price_minor:price,currency:"USD",is_active:false});
    msg("#tierMessage",error?error.message:"Tier saved as an inactive pricing idea. Payment processing is not enabled.",!!error);
    if(!error){e.currentTarget.reset();loadDashboard();}
  });
  $("#mediaForm").addEventListener("submit",async e=>{
    e.preventDefault();if(!sb||!currentUser)return;
    const f=new FormData(e.currentTarget);
    const {error}=await sb.from("adult_creator_media").insert({creator_id:currentUser.id,storage_path:String(f.get("media_url")).trim(),media_type:String(f.get("media_type")),consent_confirmed:true});
    msg("#mediaMessage",error?error.message:"Submission received and awaiting moderation.",!!error);
    if(!error){e.currentTarget.reset();loadDashboard();}
  });
  $("#signOut").addEventListener("click",async()=>{if(sb)await sb.auth.signOut();currentUser=null;updateAuthUI();toast("You have signed out.");});
  function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  loadSession();
})();