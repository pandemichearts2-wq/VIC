const VIC_FANART_API_URL = window.VIC_CONFIG?.API_URL || "";
const vicFanArtState = { items: [] };
function vicFanEsc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function vicSafeUrl(value){try{const u=new URL(String(value||""));return u.protocol==="https:"?u.href:"";}catch(_){return "";}}
async function loadHomeFanArt(){
  const viewer=document.getElementById("homeFanArtViewer"); if(!viewer||!VIC_FANART_API_URL)return;
  viewer.innerHTML='<div class="fanart-empty"><p>ファンアートを読み込んでいます。</p></div>';
  try{
    const url=new URL(VIC_FANART_API_URL);url.searchParams.set("action","fanArtData");url.searchParams.set("category","general");url.searchParams.set("limit","1");url.searchParams.set("nonce",String(Date.now()));
    const response=await fetch(url.toString(),{cache:"no-store"});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.message||"読み込めませんでした。");
    vicFanArtState.items=Array.isArray(data.fanArts)?data.fanArts:[];renderHomeFanArt();
  }catch(error){viewer.innerHTML=`<div class="fanart-empty"><p>${vicFanEsc(error.message)}</p></div>`;}
}
function renderHomeFanArt(){
  const viewer=document.getElementById("homeFanArtViewer");const art=vicFanArtState.items[0];if(!viewer)return;
  if(!art){viewer.innerHTML='<div class="fanart-empty"><p>承認されたFA画像はまだありません。</p></div>';return;}
  const image=vicSafeUrl(art.imageUrl||art.thumbnailUrl);if(!image){viewer.innerHTML='<div class="fanart-empty"><p>画像を表示できませんでした。</p></div>';return;}
  viewer.innerHTML=`<figure class="home-fanart-card"><button type="button" data-home-fanart-open><span class="home-fanart-image protected-media" data-protected-media><img src="${vicFanEsc(image)}" alt="${vicFanEsc(art.title||art.activityName||"ファンアート")}" draggable="false"><span class="fanart-save-shield" aria-hidden="true"></span><span class="fanart-watermark" aria-hidden="true"><b>VIC</b><em>${vicFanEsc(art.authorName||"匿名")}</em></span></span></button><figcaption><p>${vicFanEsc(art.activityName||"")}</p><h3>${vicFanEsc(art.title||"無題のファンアート")}</h3><span>作者：${vicFanEsc(art.authorName||"匿名")}</span></figcaption></figure>`;
}
function openHomeFanArt(){
  const art=vicFanArtState.items[0];if(!art)return;const image=vicSafeUrl(art.imageUrl||art.thumbnailUrl);if(!image)return;
  const dialog=document.createElement("div");dialog.className="fanart-lightbox";dialog.innerHTML=`<div class="fanart-lightbox-backdrop" data-home-close></div><div class="fanart-lightbox-panel"><button class="fanart-lightbox-close" type="button" data-home-close>×</button><figure class="fanart-lightbox-figure"><div class="fanart-lightbox-image protected-media" data-protected-media><img src="${vicFanEsc(image)}" alt="${vicFanEsc(art.title||"ファンアート")}" draggable="false"><span class="fanart-save-shield"></span><span class="fanart-watermark"><b>VIC</b><em>${vicFanEsc(art.authorName||"匿名")}</em></span></div><figcaption><p class="fanart-activity">${vicFanEsc(art.activityName||"")}</p><h3>${vicFanEsc(art.title||"無題のファンアート")}</h3><p>作者：${vicFanEsc(art.authorName||"匿名")}</p>${art.note?`<p>${vicFanEsc(art.note)}</p>`:""}</figcaption></figure></div>`;
  const close=()=>{dialog.remove();document.body.classList.remove("fanart-lightbox-open");};dialog.addEventListener("click",e=>{if(e.target.closest("[data-home-close]"))close();});document.body.appendChild(dialog);document.body.classList.add("fanart-lightbox-open");
}
document.getElementById("homeFanArtViewer")?.addEventListener("click",e=>{if(e.target.closest("[data-home-fanart-open]"))openHomeFanArt();});
document.getElementById("homeFanArtNext")?.addEventListener("click",loadHomeFanArt);
document.addEventListener("contextmenu",e=>{if(e.target instanceof Element&&e.target.closest("[data-protected-media]"))e.preventDefault();});
document.addEventListener("dragstart",e=>{if(e.target instanceof Element&&e.target.closest("[data-protected-media]"))e.preventDefault();});
loadHomeFanArt();