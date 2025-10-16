const searchInput=document.getElementById('searchInput');
const sizeSelect=document.getElementById('sizeSelect');
const formatSelect=document.getElementById('formatSelect');
const buildBtn=document.getElementById('buildBtn');
const clearBtn=document.getElementById('clearBtn');
const copyAllUrlsBtn=document.getElementById('copyAllUrlsBtn');
const copyAllImgsBtn=document.getElementById('copyAllImgsBtn');
const themeBtn=document.getElementById('themeBtn');
const grid=document.getElementById('grid');
const sentinel=document.getElementById('sentinel');
const cardTpl=document.getElementById('cardTpl');

const VERSION='latest';
let animatedMap=new Map();
let emojiNames=new Map();
let allItems=[];
let filtered=[];
let cursor=0;
let observer=null;

// helpers
function normalizeText(s){return (s||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');}
function toTitleCase(s){return s.replace(/\b\w/g,c=>c.toUpperCase());}
function tokenize(s){return normalizeText(s).split(/[^a-z0-9]+/).filter(Boolean);}
function stem(w){
  if(w.endsWith('ies')) return w.slice(0,-3)+'y';
  if(w.endsWith('ing')) return w.slice(0,-3);
  if(w.endsWith('ed')) return w.slice(0,-2);
  if(w.endsWith('es')) return w.slice(0,-2);
  if(w.endsWith('s') && w.length>3) return w.slice(0,-1);
  return w;
}
function url(code,size,ext){return`https://fonts.gstatic.com/s/e/notoemoji/${VERSION}/${code}/${size}.${ext}`;}
function flash(btn,msg){const old=btn.textContent;btn.textContent=msg;setTimeout(()=>btn.textContent=old,1000);}

function getUrl(item){
  const fmt=formatSelect.value;
  if((fmt==='webp'||fmt==='gif')&&item.hasAnim) return url(item.code,512,fmt);
  if(fmt==='picture'&&item.hasAnim) return url(item.code,512,'webp');
  return url(item.code,sizeSelect.value,'png');
}

// fuzzy matching
function fuzzyMatch(nameNorm, query){
  const nameTokens=tokenize(nameNorm).map(stem);
  const qTokens=tokenize(query).map(stem);
  if(!qTokens.length) return true;
  return qTokens.every(qt=>nameTokens.some(nt=>nt.includes(qt)));
}

// build each card
function buildCard(item){
  const node=cardTpl.content.firstElementChild.cloneNode(true);
  const img=node.querySelector('.thumb');
  const link=node.querySelector('.thumbLink');
  const nameEl=node.querySelector('.name');
  const shortEl=node.querySelector('.shortcode');
  const internalEl=node.querySelector('.internal');
  const urlInput=node.querySelector('.urlInput');
  const btnUrl=node.querySelector('.copyUrl');
  const btnImg=node.querySelector('.copyImg');
  const btnOpen=node.querySelector('.open');
  const badge=node.querySelector('.badge');

  const u=getUrl(item);
  img.src=u;
  img.alt=item.name;
  link.href=u;

  nameEl.textContent=item.name;
  shortEl.textContent=item.code;
  internalEl.textContent=`emoji_u${item.code}`;
  urlInput.value=u;
  badge.textContent=item.hasAnim?'Animated':'Static';
  badge.classList.toggle('static',!item.hasAnim);

  img.onerror=()=>{
    const fallback=url(item.code,512,'png');
    if(img.src!==fallback){
      img.src=fallback;
      link.href=fallback;
      urlInput.value=fallback;
      badge.textContent='Static';
      badge.classList.add('static');
    }
  };

  btnUrl.onclick=()=>navigator.clipboard.writeText(urlInput.value).then(()=>flash(btnUrl,'Copied'));
  btnImg.onclick=()=>navigator.clipboard.writeText(`<img src="${urlInput.value}" alt="${item.name}" width="${sizeSelect.value}">`).then(()=>flash(btnImg,'Copied'));
  btnOpen.onclick=()=>window.open(urlInput.value,'_blank','noopener');

  return node;
}

// lazy load
function loadNext(){
  const from=cursor, to=Math.min(filtered.length,cursor+60);
  if(from>=to) return;
  const frag=document.createDocumentFragment();
  for(let i=from;i<to;i++) frag.appendChild(buildCard(filtered[i]));
  grid.appendChild(frag);
  cursor=to;
}

function observe(){
  if(observer) observer.disconnect();
  observer=new IntersectionObserver(es=>{for(const e of es) if(e.isIntersecting) loadNext();},{rootMargin:'800px'});
  observer.observe(sentinel);
}

// rebuild grid with fuzzy filtering
function rebuild(){
  const q=normalizeText(searchInput.value.trim());
  filtered=allItems.filter(it=>{
    if(!q) return true;
    return fuzzyMatch(it.nameNorm,q) ||
           it.code.includes(q) ||
           `emoji_u${it.code}`.includes(q);
  });
  cursor=0;
  grid.innerHTML='';
  loadNext();
}

const debouncedRebuild=((fn,ms)=>{let t;return()=>{clearTimeout(t);t=setTimeout(fn,ms);}})(rebuild,200);

// load Google Fonts animated index
async function loadAnimatedIndex(){
  const res=await fetch('https://googlefonts.github.io/noto-emoji-animation/data/api.json');
  const data=await res.json();
  const m=new Map();
  for(const e of data.icons||[]){
    if(!e.codepoint) continue;
    const code=e.codepoint.toLowerCase();
    m.set(code,{hasAnim:true});
  }
  animatedMap=m;
}

// load emoji names from external JSON CDN
async function loadEmojiNames(){
  const res=await fetch('https://cdn.jsdelivr.net/gh/iamcal/emoji-data@master/emoji.json');
  const data=await res.json();
  const m=new Map();
  for(const e of data){
    if(!e.unified) continue;
    const code=e.unified.toLowerCase();
    const name=e.name?toTitleCase(e.name):e.short_name?toTitleCase(e.short_name):`Emoji_u${code}`;
    m.set(code,{name});
  }
  emojiNames=m;
}

// combine both data sources
function buildUniverse(){
  const codes=new Set([...animatedMap.keys()]);
  allItems=[...codes].map(code=>{
    const hasAnim=animatedMap.has(code);
    const name=(emojiNames.get(code)?.name)||`Emoji_u${code}`;
    return {
      code,
      hasAnim,
      name,
      nameNorm:normalizeText(name)
    };
  });
}

// init
async function init(){
  await Promise.all([loadAnimatedIndex(),loadEmojiNames()]);
  buildUniverse();
  observe();
  rebuild();
}

// ui
buildBtn.onclick=rebuild;
clearBtn.onclick=()=>{searchInput.value='';rebuild();}
copyAllUrlsBtn.onclick=()=>navigator.clipboard.writeText(filtered.map(getUrl).join('\n')).then(()=>flash(copyAllUrlsBtn,'Copied'));
copyAllImgsBtn.onclick=()=>navigator.clipboard.writeText(filtered.map(it=>`<img src="${getUrl(it)}" alt="${it.name}" width="${sizeSelect.value}">`).join('\n')).then(()=>flash(copyAllImgsBtn,'Copied'));
searchInput.oninput=debouncedRebuild;
sizeSelect.onchange=rebuild;
formatSelect.onchange=rebuild;
themeBtn.onclick=()=>{
  const html=document.documentElement;
  const cur=html.getAttribute('data-theme')||'light';
  const next=cur==='light'?'dark':'light';
  html.setAttribute('data-theme',next);
  themeBtn.textContent=next==='light'?'Light':'Dark';
};

init();
