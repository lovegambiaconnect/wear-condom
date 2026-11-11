(() => {
  const cfg = window.WEAR_CONDOM_CONFIG || {};
  const hasConfig = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && !String(cfg.supabaseAnonKey).includes("PASTE_YOUR"));
  const sb = hasConfig && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage } }) : null;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  let currentUser = null, authMode = "signup", toastTimer;
  let resolveAuthReady;
  const authReadyPromise = new Promise(resolve => { resolveAuthReady = resolve; });

  $("#year").textContent = new Date().getFullYear();
  const toast = (msg) => { const el=$("#toast"); el.textContent=msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),3200); };
  const msg = (id, text, error=false) => { const el=$(id); if(el){el.textContent=text;el.style.color=error?"#e6a18f":"var(--gold)";} };

  // Age gate is a front-door self-attestation, not legal identity verification.
  const ageGate = $("#ageGate"), ageConfirm = $("#ageConfirm"), enterSite = $("#enterSite");
  const dismissAgeGate = () => {
    ageGate.classList.add("dismissed");
    ageGate.style.display = "none";
    try { sessionStorage.setItem("wc_age_ok", "yes"); } catch (_) {}
    // Load the Adsterra placement only after the visitor passes the 18+ entry screen.
    if (!document.getElementById("adsterra-unit-script")) {
      const adScript = document.createElement("script");
      adScript.id = "adsterra-unit-script";
      adScript.async = true;
      adScript.setAttribute("data-cfasync", "false");
      adScript.src = "https://bicea.org/21/3b75889ba2efffde3170f74c6ed3e4e6";
      document.body.appendChild(adScript);
    }
  };
  try { if (sessionStorage.getItem("wc_age_ok") === "yes") dismissAgeGate(); } catch (_) {}
  ageConfirm.addEventListener("change", () => { enterSite.disabled = !ageConfirm.checked; });
  enterSite.addEventListener("click", (event) => {
    event.preventDefault();
    if (!ageConfirm.checked) return;
    dismissAgeGate();
  });
  $("#leaveSite").addEventListener("click",()=>{document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:30px;color:#ddd;font-family:Arial"><div><h1>Access unavailable</h1><p>This community is for adults aged 18 and over.</p></div></main>';});

  function showAuth(mode="signup"){ authMode=mode; $("#authModal").classList.remove("hidden"); $("#authTitle").innerHTML=mode==="signup"?'Create your <em>account.</em>':'Welcome <em>back.</em>'; $("#nameField").classList.toggle("hidden",mode==="signin"); $("#adultConsent").classList.toggle("hidden",mode==="signin"); $("#authSubmit").textContent=mode==="signup"?"Create account":"Sign in"; $$(".auth-tabs button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode)); msg("#authMessage",""); $("#authPassword").autocomplete=mode==="signup"?"new-password":"current-password"; }
  ["#openAuth","#joinTop"].forEach(s=>$(s).addEventListener("click",()=>showAuth("signup")));
  ["#creatorJoin","#videoJoin","#trendingUpload","#trendingUploadBottom"].forEach(selector=>{
    const button=$(selector);
    if(button) button.addEventListener("click",event=>{event.preventDefault();openDashboard();});
  });
  $("#closeAuth").addEventListener("click",()=>$("#authModal").classList.add("hidden"));
  $$(".auth-tabs button").forEach(b=>b.addEventListener("click",()=>showAuth(b.dataset.mode)));
  $("#menuToggle").addEventListener("click",()=>$(".stream-app").classList.toggle("menu-open"));

  $("#authForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!sb){msg("#authMessage","Supabase is not connected yet. Add the project's public anon key in config.js.",true);return;}
    const email=$("#authEmail").value.trim(), password=$("#authPassword").value, name=$("#authName").value.trim();
    if(authMode==="signup"&&!$("#adultCheckbox").checked){msg("#authMessage","Please confirm that you are 18 or older.",true);return;}
    $("#authSubmit").disabled=true; msg("#authMessage",authMode==="signup"?"Creating your account...":"Signing you inâ¦");
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
        // Ensure members who confirmed email after registration receive their creator profile row.
        if(result.data.user) await ensureProfile(result.data.user, result.data.user.user_metadata?.display_name || result.data.user.email?.split("@")[0] || "New creator");
        $("#authModal").classList.add("hidden");toast("Welcome back.");
      }
    }catch(err){msg("#authMessage",err.message||"Something went wrong. Please try again.",true);}
    finally{$("#authSubmit").disabled=false;}
  });

  async function ensureProfile(user,displayName){
    const isOwner=(user.email||"").toLowerCase()==="joebeneth9@gmail.com";
    const row={id:user.id,display_name:isOwner?"Wildcat":(displayName||user.user_metadata?.display_name||"New creator")};
    const {error}=await sb.from("adult_creator_profiles").upsert(row,{onConflict:"id"});
    if(error) throw error;
  }
  async function loadAdminPanel(){
    const panel=$("#adminPanel"); if(!panel||!currentUser||!sb)return;
    const {data:isAdmin,error:adminError}=await sb.rpc("is_wear_condom_admin");
    if(adminError||isAdmin!==true){panel.classList.add("hidden");return;}
    panel.classList.remove("hidden");
    msg("#adminMessage","Administrator access confirmed. Review evidence securely before marking checks complete.");
    await loadAdminQueue();
  }
  async function loadAdminQueue(){
    const host=$("#adminQueue"); if(!host)return;
    const {data,error}=await sb.from("adult_creator_profiles").select("id,display_name,country,created_at,is_adult_verified,identity_verified,consent_reviewed,is_approved,moderation_status").order("created_at",{ascending:false});
    if(error){host.innerHTML='<p class="tiny">Could not load applications: '+escapeHtml(error.message)+'</p>';return;}
    if(!data?.length){host.innerHTML='<div class="empty-state">No creator applications have been submitted yet.</div>';return;}
    host.innerHTML=data.map(p=>{
      const id=escapeHtml(p.id); const ready=p.is_adult_verified&&p.identity_verified&&p.consent_reviewed;
      return '<article class="admin-creator" data-creator="'+id+'"><div class="admin-creator-head"><div><h3>'+escapeHtml(p.display_name||'Creator')+'</h3><p class="tiny">'+escapeHtml(p.country||'Country not provided')+' Â· Joined '+(p.created_at?new Date(p.created_at).toLocaleDateString():'date unavailable')+'</p><p class="tiny">Account ID: '+id.slice(0,8)+'â¦</p></div><span class="admin-status">'+escapeHtml(p.moderation_status||'pending')+'</span></div><div class="admin-checks"><label><input type="checkbox" data-field="is_adult_verified" '+(p.is_adult_verified?'checked':'')+'> Age evidence reviewed</label><label><input type="checkbox" data-field="identity_verified" '+(p.identity_verified?'checked':'')+'> Identity evidence reviewed</label><label><input type="checkbox" data-field="consent_reviewed" '+(p.consent_reviewed?'checked':'')+'> Consent evidence reviewed</label></div><p class="tiny">Approval requires all three checks. Only mark a check after completing the relevant evidence review.</p><div class="admin-actions"><button class="btn btn-outline btn-small" data-action="save-checks">Save verification checks</button><button class="btn btn-gold btn-small" data-action="approve" '+(ready?'':'disabled')+'>Approve creator</button><button class="btn btn-outline btn-small" data-action="reject">Reject application</button></div></article>';
    }).join('');
    async function loadAdminMediaQueue(){
    const host=$("#adminMediaQueue");
    if(!host||!sb)return;

    const {data,error}=await sb
      .from("adult_creator_media")
      .select("id,creator_id,title,media_url,media_type,created_at,moderation_status,storage_bucket")
      .eq("media_type","video")
      .eq("moderation_status","pending")
      .eq("storage_bucket","creator-videos")
      .order("created_at",{ascending:true});

    if(error){
      host.innerHTML='<p class="tiny">Could not load video submissions: '+escapeHtml(error.message)+'</p>';
      return;
    }

    if(!data?.length){
      host.innerHTML='<div class="empty-state">No videos are waiting for review.</div>';
      return;
    }

    const cards=await Promise.all(data.map(async video=>{
      const preview=await sb.storage
        .from("creator-videos")
        .createSignedUrl(video.media_url,3600);

      const previewHtml=preview.error
        ? '<p class="tiny">Private preview could not be loaded: '+escapeHtml(preview.error.message)+'</p>'
        : '<video controls playsinline preload="metadata" style="width:100%;max-height:360px;border-radius:12px;background:#000" src="'+escapeHtml(preview.data.signedUrl)+'"></video>';

      return '<article class="admin-creator" data-media-id="'+escapeHtml(video.id)+'">'
        +'<div class="admin-creator-head"><div>'
        +'<h3>'+escapeHtml(video.title||"Video submission")+'</h3>'
        +'<p class="tiny">Creator ID: '+escapeHtml(video.creator_id).slice(0,8)+'…</p>'
        +'<p class="tiny">Submitted: '+(video.created_at?new Date(video.created_at).toLocaleString():"Date unavailable")+'</p>'
        +'</div><span class="admin-status">Pending</span></div>'
        +previewHtml
        +'<div class="admin-actions">'
        +'<button class="btn btn-gold btn-small" data-media-action="approve">Approve video</button>'
        +'<button class="btn btn-outline btn-small" data-media-action="reject">Reject video</button>'
        +'</div></article>';
    }));

    host.innerHTML=cards.join("");
  }

  $("#adminMediaQueue")?.addEventListener("click",async e=>{
    const button=e.target.closest("button[data-media-action]");
    if(!button)return;

    const card=button.closest("[data-media-id]");
    if(!card||!currentUser)return;

    const id=card.dataset.mediaId;
    const action=button.dataset.mediaAction;
    button.disabled=true;

    try{
      if(action==="approve"){
        const {data:video,error:fetchError}=await sb
          .from("adult_creator_media")
          .select("id,media_url,storage_bucket,moderation_status")
          .eq("id",id)
          .eq("moderation_status","pending")
          .eq("storage_bucket","creator-videos")
          .single();

        if(fetchError)throw fetchError;
        if(!video)throw new Error("This video is no longer pending review.");

        const {data:file,error:downloadError}=await sb.storage
          .from("creator-videos")
          .download(video.media_url);

        if(downloadError)throw downloadError;

        const {error:uploadError}=await sb.storage
          .from("published-videos")
          .upload(video.media_url,file,{
            contentType:file.type||"video/mp4",
            upsert:false
          });

        if(uploadError)throw uploadError;

        const {data:reviewed,error:reviewError}=await sb.rpc("admin_review_media",{
          p_media_id:id,
          p_action:"approve",
          p_storage_bucket:"published-videos"
        });

        if(reviewError){
          await sb.storage.from("published-videos").remove([video.media_url]);
          throw reviewError;
        }

        if(!reviewed){
          await sb.storage.from("published-videos").remove([video.media_url]);
          throw new Error("The approval was not confirmed. The public copy was removed.");
        }

        msg("#adminMessage","Video approved and published.");
      }

      if(action==="reject"){
        const {data:reviewed,error}=await sb.rpc("admin_review_media",{
          p_media_id:id,
          p_action:"reject"
        });

        if(error)throw error;
        if(!reviewed)throw new Error("The rejection was not confirmed.");

        msg("#adminMessage","Video rejected. It will not appear in the public library.");
      }
await loadAdminQueue();
      await loadAdminMediaQueue();
      await loadDashboard();
      await loadPublicVideos();

    }catch(error){
      msg("#adminMessage",error.message||"Could not review this video.",true);
      button.disabled=false;
    }
  });

  async function loadPublicVideos(){
    const host=$("#clips");
    if(!host||!sb)return;

    const {data,error}=await sb
      .from("adult_creator_media")
      .select("id,title,media_url,created_at")
      .eq("moderation_status","approved")
      .eq("storage_bucket","published-videos")
      .eq("media_type","video")
      .order("created_at",{ascending:false});

    if(error){
      console.warn("Could not load approved videos:",error.message);
      return;
    }

    if(!data?.length)return;

    const cards=await Promise.all(data.map(async video=>{
      const result=await sb.storage
        .from("published-videos")
        .createSignedUrl(video.media_url,3600);

      if(result.error)return "";

      return '<article class="video-empty-card">'
        +'<div class="video-empty-art">'
        +'<video controls playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover" src="'+escapeHtml(result.data.signedUrl)+'"></video>'
        +'</div>'
        +'<h3>'+escapeHtml(video.title||"Community video")+'</h3>'
        +'</article>';
    }));

    const visibleCards=cards.filter(Boolean);
    if(visibleCards.length)host.innerHTML=visibleCards.join("");
  }
  $("#adminQueue")?.addEventListener("click",async e=>{
    const button=e.target.closest("button[data-action]"); if(!button)return;
    const card=button.closest("[data-creator]"); if(!card||!currentUser)return;
    const id=card.dataset.creator, action=button.dataset.action;
    const checks={}; card.querySelectorAll("input[data-field]").forEach(input=>checks[input.dataset.field]=input.checked);
    if(action==="approve"&&!(checks.is_adult_verified&&checks.identity_verified&&checks.consent_reviewed)){msg("#adminMessage","Approval blocked: all age, identity and consent checks must be complete.",true);return;}
    button.disabled=true;
    const {data,error}=await sb.rpc("admin_review_creator",{
      p_creator_id:id,p_action:action,
      p_age:checks.is_adult_verified,p_identity:checks.identity_verified,p_consent:checks.consent_reviewed
    });
    if(error){msg("#adminMessage",error.message,true);button.disabled=false;return;}
    if(!data){msg("#adminMessage","No creator row was returned. Nothing was changed.",true);button.disabled=false;return;}
    msg("#adminMessage",action==="approve"?"Creator approved and saved in Supabase.":action==="reject"?"Application rejection saved.":"Verification checks saved in Supabase.");
await loadCreators(); await loadArticles(); await loadPublicVideos();
  });

  async function loadSession(){
    if(!sb){$('#creatorGrid').innerHTML='<div class="empty-state">The site design is live. Add the Supabase anon key to enable registration, profiles and creator tools.</div>';resolveAuthReady();return;}
    // Subscribe before reading the persisted session so INITIAL_SESSION/auth events cannot be missed.

sb.auth.onAuthStateChange((event, session) => {
  // Run dashboard/database work outside the Supabase auth callback.
  setTimeout(() => {
    if (session?.user) {
      currentUser = session.user;
      updateAuthUI();
    } else if (event === "SIGNED_OUT") {
      currentUser = null;
      updateAuthUI();
    }
  }, 0);
});

    const {data,error}=await sb.auth.getSession();
    if(error) console.warn('Session restore check:',error.message);
    // Do not overwrite a valid user delivered by the auth listener with a transient null restore result.
    if(data?.session?.user) currentUser=data.session.user;
    updateAuthUI();
    resolveAuthReady();
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
    const {data,error}=await sb.from("adult_creator_profiles").select("id,display_name,bio,country,avatar_url,moderation_status,is_adult_verified,identity_verified,consent_reviewed").limit(12);
    if(error){console.warn("Could not load approved creator profiles:",error);return;}
    const rows=(data||[]).filter(x=>x.moderation_status==="approved"&&x.is_adult_verified===true&&x.identity_verified===true&&x.consent_reviewed===true);
    if(rows.length){
      grid.innerHTML=rows.map(p=>'<article class="creator-card"><div class="creator-avatar">'+escapeHtml((p.display_name||"C").slice(0,1).toUpperCase())+'</div><h3>'+escapeHtml(p.display_name||"Creator")+'</h3><p>'+escapeHtml(p.bio||"Independent creator")+'</p><div class="creator-meta"><span>â APPROVED</span><span>'+escapeHtml(p.country||"COMMUNITY")+'</span></div></article>').join("");
    }else{
      grid.innerHTML='<div class="empty-state">No approved creator channels yet. Verified creators will appear here after review.</div>';
    }
  }
  async function loadArticles(){
    const {data,error}=await sb.from("adult_wellness_articles").select("*").limit(6);
    if(error||!data?.length)return;
    const cards=data.map((a,i)=>{const title=a.title||a.headline||"Wellness resource";const body=a.summary||a.excerpt||a.content||"Read this community wellness resource.";return '<article class="article-card"><span class="article-number">RESOURCE '+String(i+1).padStart(2,"0")+'</span><h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(String(body).slice(0,190))+'</p></article>';}).join("");
    $("#articleGrid").innerHTML=cards;
  }
  async function openDashboard(){
    if(!sb){showAuth("signin");return;}
    // Wait until the initial Supabase session restore has completed before deciding whether sign-in is required.
    await authReadyPromise;
    if(!currentUser){
      const {data,error}=await sb.auth.getSession();
      if(error){toast("Could not restore your session. Please try again.");return;}
      if(data?.session?.user) currentUser=data.session.user;
    }
    if(!currentUser){showAuth("signin");return;}
    $("#authModal").classList.add("hidden");
    $("#dashboard").classList.remove("hidden");
    $("#dashboard").scrollIntoView({behavior:"smooth",block:"start"});
    await loadDashboard();
  }
  async function loadDashboard(){
    if(!sb||!currentUser)return;
    await loadAdminPanel();
    const {data,error}=await sb.from("adult_creator_profiles").select("*").eq("id",currentUser.id).maybeSingle();
    if(data){$("#displayName").value=data.display_name||currentUser.user_metadata?.display_name||"";$("#bio").value=data.bio||"";$("#country").value=data.country||"";}
    else if(error)msg("#profileMessage",error.message,true);
    const tiers=await sb.from("adult_subscription_tiers").select("*").eq("creator_id",currentUser.id).order("created_at",{ascending:false});
    $("#tierList").innerHTML=tiers.data?.length?tiers.data.map(t=>'<div class="compact-item"><span>'+escapeHtml(t.tier_name||"Membership")+'</span><b>'+escapeHtml(t.currency||"USD")+' '+((Number(t.price_minor||0)/100).toFixed(2))+'</b></div>').join(""):'<p class="tiny">Your membership tiers will appear here.</p>';
    const media=await sb.from("adult_creator_media").select("id,media_type,created_at,moderation_status").eq("creator_id",currentUser.id).order("created_at",{ascending:false});
$("#mediaList").innerHTML=media.data?.length?media.data.map(m=>{
  const status=m.moderation_status||"pending";
  const label=status==="approved"?"Approved":status==="rejected"?"Rejected":"Pending review";
  return '<div class="compact-item"><span>'+escapeHtml(m.media_type||"Media")+'</span><b>'+label+'</b></div>';
}).join(""):'<p class="tiny">No media submissions yet.</p>';
    $("#mediaList").innerHTML=media.data?.length?media.data.map(m=>'<div class="compact-item"><span>'+escapeHtml(m.media_type||"Media")+'</span><b>'+"Pending review"+'</b></div>').join(""):'<p class="tiny">No media submissions yet.</p>';
    const ready=data?.is_adult_verified===true&&data?.identity_verified===true&&data?.consent_reviewed===true&&data?.moderation_status==="approved";
    const review=$("#creatorReviewStatus"); if(review){review.textContent=ready?"Creator checks approved â private video submissions are enabled.":"Account review pending â video uploads unlock after age, identity and consent verification and creator approval.";}
  }
  $("#profileForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const button=e.currentTarget.querySelector('button[type="submit"]');
    if(!sb||!currentUser){msg("#profileMessage","Please sign in again before saving your profile.",true);return;}
    const row={id:currentUser.id,display_name:$("#displayName").value.trim(),bio:$("#bio").value.trim(),country:$("#country").value.trim()};
    if(!row.display_name){msg("#profileMessage","Please enter a display name.",true);return;}
    button.disabled=true;button.textContent="Savingâ¦";msg("#profileMessage","Saving your profileâ¦");
    try{
      const {error}=await sb.from("adult_creator_profiles").upsert(row,{onConflict:"id"});
      if(error) throw error;
      msg("#profileMessage","Profile saved successfully. It will appear publicly after review.");
      await loadCreators();
    }catch(error){
      console.error("Profile save failed:",error);
      msg("#profileMessage",error.message||"Could not save profile. Please try again.",true);
    }finally{button.disabled=false;button.textContent="Save profile";}
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
    const form=e.currentTarget, f=new FormData(form), file=f.get("media_file");
    if(!(file instanceof File)||!file.size){msg("#mediaMessage","Choose a video file first.",true);return;}
    const allowed=["video/mp4","video/webm","video/quicktime"];
    if(!allowed.includes(file.type)){msg("#mediaMessage","Please choose an MP4, WebM or MOV video.",true);return;}
    if(file.size>50*1024*1024){msg("#mediaMessage","This file is larger than 50 MB. Please choose a smaller video.",true);return;}
    if(f.get("consent")!=="on"){msg("#mediaMessage","Confirm ownership and documented consent before uploading.",true);return;}
    const {data:profile,error:profileError}=await sb.from("adult_creator_profiles").select("is_adult_verified,identity_verified,consent_reviewed,moderation_status").eq("id",currentUser.id).maybeSingle();
    if(profileError){msg("#mediaMessage",profileError.message,true);return;}
    if(!profile||profile.is_adult_verified!==true||profile.identity_verified!==true||profile.consent_reviewed!==true||profile.moderation_status!=="approved"){
      msg("#mediaMessage","Video uploads unlock after an administrator verifies your age, identity and consent documentation and approves your creator account.",true);return;
    }
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
    const path=currentUser.id+"/"+Date.now()+"-"+safeName;
    const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent="Uploadingâ¦";
    try{
      const upload=await sb.storage.from("creator-videos").upload(path,file,{contentType:file.type,upsert:false});
      if(upload.error)throw upload.error;
      const saved=await sb.from("adult_creator_media").insert({creator_id:currentUser.id,media_url:path,media_type:"video",consent_confirmed:true});
      if(saved.error){await sb.storage.from("creator-videos").remove([path]);throw saved.error;}
      msg("#mediaMessage","Video uploaded privately. It is pending moderation and is not public.");form.reset();await loadDashboard();
    }catch(error){msg("#mediaMessage",error.message||"Upload failed. Please try again.",true);}
    finally{button.disabled=false;button.textContent="Upload privately for review";}
  });
  $("#signOut").addEventListener("click",async()=>{if(sb)await sb.auth.signOut();currentUser=null;updateAuthUI();toast("You have signed out.");});
  function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  loadSession();
  const requestedAuth = new URLSearchParams(window.location.search).get("auth");
  if (requestedAuth === "signup" || requestedAuth === "signin") showAuth(requestedAuth);
})();
