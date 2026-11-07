(()=>{
const {formatNumber:f,clamp,parseNumber:num,segmentLength:len}=window.PlanCADUtils;
const {arcPoints:arcPtsShape,ellipsePoints:ellipsePts,rectanglePoints:rc,rotatePoint:rp}=window.PlanCADGeometry;

const $=s=>document.querySelector(s),$$=s=>document.querySelectorAll(s),cv=$('#cv');let ctx=cv.getContext('2d');
const FONT='"IBM Plex Sans Arabic",system-ui,sans-serif',COLS=['','#dc2626','#ea580c','#16a34a','#2563eb','#9333ea','#0d9488','#6b7280'];
const NM={end:'نهاية',mid:'منتصف',int:'تقاطع',cen:'مركز',qua:'ربع'};
// الأشكال بالمتر: line{a,b} rect{x,y,w,h} circle{x,y,r} tri{p} free{p} + اختياري name,col,lw
let shapes=[],redo=[],hist=nh(),sel=[],clip=[],tool='rect',cur=null,polyDraft=null,g=null,box=null,mk=null,V={x:24,y:24,s:40},dpr=1,W=0,H=0;
let polygonSides=6;let S={end:1,mid:1,int:1,cen:1,grid:1,ortho:0,polar:0,dyn:1},D={col:'',lw:2},ST={unit:'m',gs:0,axes:1,coord:1,grid:1,cloud:0,bk:0,showDims:0,showAreas:0},cpos=null,furnKind='bed2',cloudT=0,cloudAt=0,fileHintT=0,touchMode='move',touchInputActive=matchMedia('(any-pointer: coarse)').matches;
const toast=m=>{const t=$('#tt');if(!t)return;t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),2600)};
const P=new Map();
let drawFlow=null;
const w2s=(x,y)=>[V.x+x*V.s,V.y+y*V.s],s2w=(x,y)=>[(x-V.x)/V.s,(y-V.y)/V.s];
const pos=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
const pts=s=>s.t==='ellipse'?ellipsePts(s):s.t==='arc'?arcPtsShape(s):s.t==='line'||s.t==='wall'||s.t==='dim'?[s.a,s.b]:s.p?s.p:s.t==='door'||s.t==='win'?[[s.x-Math.cos(s.a)*s.w/2,s.y-Math.sin(s.a)*s.w/2],[s.x+Math.cos(s.a)*s.w/2,s.y+Math.sin(s.a)*s.w/2]]:s.t==='text'||s.t==='north'?rc(nb(s)):rc(s);
// مستطيل تقريبي حول نص أو سهم شمال (للتحديد والتدوير)
const mcx=document.createElement('canvas').getContext('2d');
function nb(s){let w=s.h;if(s.t==='text'){mcx.font=`600 100px ${FONT}`;w=Math.max(s.h*.6,mcx.measureText(s.txt||' ').width/100*s.h)}return{x:s.x-w/2,y:s.y-s.h/2,w,h:s.h,rot:s.a||0}}
// المستطيل: x,y,w,h + rot (زاوية بالراديان حول المركز)
function rotS(s,o,c,a){
  if(s.t==='line'||s.t==='wall'||s.t==='dim'){s.a=rp(o.a,c,a);s.b=rp(o.b,c,a)}
  else if(s.p)s.p=o.p.map(q=>rp(q,c,a));
  else if(s.t==='rect'||s.t==='furn'){const m=rp([o.x+o.w/2,o.y+o.h/2],c,a);s.x=m[0]-o.w/2;s.y=m[1]-o.h/2;s.rot=(o.rot||0)+a}
  else if(s.t==='ellipse'){const m=rp([o.x,o.y],c,a);s.x=m[0];s.y=m[1];s.rot=(o.rot||0)+a}
  else{const m=rp([o.x,o.y],c,a);s.x=m[0];s.y=m[1];if(o.a!=null)s.a=o.a+a;if(o.t==='arc'){s.a0=o.a0+a;s.a1=o.a1+a}}
}
function selC(){const b=sel.map(i=>bx(shapes[i]));return[(Math.min(...b.map(q=>q.x))+Math.max(...b.map(q=>q.X)))/2,(Math.min(...b.map(q=>q.y))+Math.max(...b.map(q=>q.Y)))/2]}
// المقابض: نقاط التعديل + مقبض التدوير فوق التحديد
function grips(){
  if(tool!=='select'||!sel.length||(g&&g.k==='box')||(touchInputActive&&touchMode==='move'))return[];
  const r=[],s=sel.length===1?shapes[sel[0]]:null,b=sel.map(i=>bx(shapes[i])),x0=Math.min(...b.map(q=>q.x)),x1=Math.max(...b.map(q=>q.X)),y0=Math.min(...b.map(q=>q.y)),top=w2s((x0+x1)/2,y0);
  if(!sel.every(i=>shapes[i].t==='door'||shapes[i].t==='win'))r.push({id:'rot',sp:[top[0],top[1]-34],top});
  const add=(id,p)=>r.push({id,sp:w2s(...p)});
  if(s){if(s.t==='dim'){add('a',s.a);add('b',s.b);const d=dimPts(s);add('o',[(d[0][0]+d[1][0])/2,(d[0][1]+d[1][1])/2])}else if(s.t==='line'||s.t==='wall'){add('a',s.a);add('b',s.b)}else if(s.t==='tri')s.p.forEach((q,i)=>add(i,q));else if(s.t==='rect'||s.t==='furn')rc(s).forEach((q,i)=>add(i,q));else if(s.t==='circle')add('r',[s.x+s.r,s.y])}
  return r;
}
// تحديد بإطار: من اليسار لليمين = داخلي (الأشكال داخل الإطار بالكامل)، من اليمين لليسار = بالتقاطع (كل ما يلمسه الإطار)
function boxSel(){
  if(!box)return[];
  const a=s2w(box.x0,box.y0),b=s2w(box.x1,box.y1),x=Math.min(a[0],b[0]),X=Math.max(a[0],b[0]),y=Math.min(a[1],b[1]),Y=Math.max(a[1],b[1]),cross=box.x1<box.x0;
  return shapes.map((_,i)=>i).filter(i=>{if(!ed(shapes[i]))return false;const r=bx(shapes[i]);return cross?r.x<=X&&r.X>=x&&r.y<=Y&&r.Y>=y:r.x>=x&&r.X<=X&&r.y>=y&&r.Y<=Y});
}
const gripAt=p=>grips().find(q=>Math.hypot(q.sp[0]-p[0],q.sp[1]-p[1])<=22);
// أقرب نقطة على جدار (خط أو ضلع غرفة/مثلث) ضمن نصف قطر r بالمتر
function wallAt(p,r){let best=null,bd=r;for(const s of shapes)if(shown(s))for(const e of segs(s)){const a=e[0],b=e[1],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;if(!l)continue;const t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l,0,1),q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<bd){bd=d;best={q,a:Math.atan2(dy,dx),th:s.t==='wall'?s.th:0}}}return best}
const plen=p=>p.reduce((a,q,i)=>i?a+Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1]):0,0);
const area=s=>s.t==='rect'?s.w*s.h:s.t==='circle'?Math.PI*s.r*s.r:s.t==='ellipse'?Math.PI*s.rx*s.ry:['tri','polygon'].includes(s.t)?Math.abs(s.p.reduce((a,q,i)=>a+q[0]*s.p[(i+1)%s.p.length][1]-s.p[(i+1)%s.p.length][0]*q[1],0))/2:0;
const bx=s=>{const q=s.t==='circle'?[[s.x-s.r,s.y-s.r],[s.x+s.r,s.y+s.r]]:pts(s),x=q.map(r=>r[0]),y=q.map(r=>r[1]);return{x:Math.min(...x),y:Math.min(...y),X:Math.max(...x),Y:Math.max(...y)}};
const valid=s=>s.t==='line'||s.t==='wall'||s.t==='dim'?len(s)>=.1:s.t==='circle'?s.r>=.05:s.t==='arc'?s.r>=.05&&s.a1>s.a0&&s.a1-s.a0<=Math.PI*2:s.t==='ellipse'?s.rx>=.05&&s.ry>=.05:['free','polyline','polygon','tri'].includes(s.t)?Array.isArray(s.p)&&s.p.length>=(s.t==='tri'?3:2)&&plen(s.p)>=.2:s.w>=.1&&s.h>=.1;
const segs=s=>s.t==='line'||s.t==='wall'?[[s.a,s.b]]:s.t==='arc'||s.t==='ellipse'?(()=>{const p=pts(s);return p.slice(1).map((q,i)=>[p[i],q])})():s.t==='tri'||s.t==='polygon'?s.p.map((q,i)=>[q,s.p[(i+1)%s.p.length]]):s.t==='polyline'||s.t==='free'?s.p.slice(1).map((q,i)=>[s.p[i],q]):s.t==='rect'?pts(s).map((q,i,a)=>[q,a[(i+1)%4]]):[];
const mv=(s,o,dx,dy)=>{if(s.t==='line'||s.t==='wall'||s.t==='dim'){s.a=[o.a[0]+dx,o.a[1]+dy];s.b=[o.b[0]+dx,o.b[1]+dy]}else if(s.p)s.p=o.p.map(q=>[q[0]+dx,q[1]+dy]);else{s.x=o.x+dx;s.y=o.y+dy}};
const copy=o=>{const t=JSON.parse(JSON.stringify(o));if(t&&!Array.isArray(t))delete t.id;return t};
const step=()=>ST.gs||(V.s>=60?.1:V.s>=25?.5:1);
// الوحدات: الداخل دائمًا بالمتر، والعرض والإدخال حسب الإعداد (م أو سم)
const uk=()=>ST.unit==='cm'?100:1,ul=()=>ST.unit==='cm'?'cm':'m',uA=()=>ST.unit==='cm'?'سم':'م',fu=n=>f(n*uk()),fl=n=>`${fu(n)} ${ul()}`,nu=v=>num(v)/uk();
const grid=v=>S.grid?Math.round(v/step())*step():v;
// المشاريع: idx = قائمة المشاريع والحالي، p:<id> = رسم كل مشروع، set = إعدادات الالتقاط واللون
let PJ=[],pid='',LY=[],cl='';const K='plan3:',uid=()=>Math.random().toString(36).slice(2,9);
const lsGet=k=>{try{return JSON.parse(localStorage.getItem(K+k))}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(K+k,JSON.stringify(v))}catch(e){}};
const save=()=>{lsSet('p:'+pid,{shapes,V,LY,cl});lsSet('set',{S,D,ST});lsSet('idx',{PJ,pid});cloudSoon()};
const load=()=>{
  const st=lsGet('set');if(st){S=Object.assign(S,st.S||{});D=st.D||D;ST=Object.assign(ST,st.ST||{})}
  const ix=lsGet('idx');
  if(ix&&ix.PJ&&ix.PJ.length){PJ=ix.PJ;pid=PJ.some(p=>p.id===ix.pid)?ix.pid:PJ[0].id}
  else{
    let old=null;try{old=JSON.parse(localStorage.getItem('plan2')||localStorage.getItem('plan1'))}catch(e){}
    pid=uid();PJ=[{id:pid,name:'مشروعي'}];
    if(old){lsSet('p:'+pid,{shapes:old.shapes||[],V:old.V||V});if(old.S)S=old.S;if(old.D)D=old.D}
  }
  const d=lsGet('p:'+pid);setLY(d);if(d){shapes=d.shapes||[];V=d.V||V}
};
const snapStr=()=>JSON.stringify({s:shapes,LY,cl});const snap=()=>{hist.push(snapStr());if(hist.length>100)hist.shift()};
// الطبقات: LY=[{id,name,vis,lock}]، cl=الطبقة الحالية، كل شكل له ly (بدونه = الطبقة الأولى)
function setLY(d){LY=d&&d.LY&&d.LY.length?d.LY:[{id:'l1',name:'طبقة 1',vis:1,lock:0}];cl=d&&d.cl&&LY.some(l=>l.id===d.cl)?d.cl:LY[0].id;const c0=LY.find(l=>l.id===cl);if(c0)c0.vis=1}
const layerOf=s=>LY.find(l=>l.id===s.ly)||LY[0]||{vis:1,lock:0},shown=s=>layerOf(s).vis!==0,ed=s=>{const l=layerOf(s);return l.vis!==0&&!l.lock};

// ---- الالتقاط (OSNAP) ----
function xSS(a,b){const[p,q]=a,[r,t]=b,d=(q[0]-p[0])*(t[1]-r[1])-(q[1]-p[1])*(t[0]-r[0]);if(Math.abs(d)<1e-9)return[];
  const u=((r[0]-p[0])*(t[1]-r[1])-(r[1]-p[1])*(t[0]-r[0]))/d,v=((r[0]-p[0])*(q[1]-p[1])-(r[1]-p[1])*(q[0]-p[0]))/d;
  return u>=0&&u<=1&&v>=0&&v<=1?[[p[0]+u*(q[0]-p[0]),p[1]+u*(q[1]-p[1])]]:[]}
function xSC(a,c){const[p,q]=a,dx=q[0]-p[0],dy=q[1]-p[1],fx=p[0]-c.x,fy=p[1]-c.y,A=dx*dx+dy*dy,B=2*(fx*dx+fy*dy),C=fx*fx+fy*fy-c.r*c.r,D2=B*B-4*A*C;
  if(A<1e-12||D2<0)return[];const r=Math.sqrt(D2);return[(-B-r)/(2*A),(-B+r)/(2*A)].filter(t=>t>=0&&t<=1).map(t=>[p[0]+t*dx,p[1]+t*dy])}
function xCC(a,b){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<1e-9||d>a.r+b.r||d<Math.abs(a.r-b.r))return[];
  const l=(a.r*a.r-b.r*b.r+d*d)/(2*d),h=Math.sqrt(Math.max(0,a.r*a.r-l*l)),mx=a.x+l*dx/d,my=a.y+l*dy/d;return[[mx-h*dy/d,my+h*dx/d],[mx+h*dy/d,my-h*dx/d]]}
function osnap(p){
  const L=[],add=(q,k,r,ref)=>{if(S[k==='qua'?'cen':k])L.push({p:q,k,r,ref})};
  // نتحقق فقط من الأشكال القريبة من الإصبع: التقاطع قرب النقطة يستلزم أن يمر الشكلان بجوارها
  const tol=22/V.s+1e-9,near=shapes.filter(s=>{if(!shown(s))return false;const b=bx(s);return p[0]>=b.x-tol&&p[0]<=b.X+tol&&p[1]>=b.y-tol&&p[1]<=b.Y+tol});
  for(const s of near){if(s.t==='text'||s.t==='north'){add([s.x,s.y],'cen',3);continue}
    if(s.t==='circle'){add([s.x,s.y],'cen',3);[[1,0],[-1,0],[0,1],[0,-1]].forEach(d=>add([s.x+d[0]*s.r,s.y+d[1]*s.r],'qua',3))}
    else if(s.t==='free'){add(s.p[0],'end',1);add(s.p[s.p.length-1],'end',1)}
    else{pts(s).forEach((q,i)=>add(q,'end',1,s.t==='dim'?undefined:{s,i}));segs(s).forEach((e,j)=>add([(e[0][0]+e[1][0])/2,(e[0][1]+e[1][1])/2],'mid',2,{s,i:j,m:1}));if(s.t==='rect')add([s.x+s.w/2,s.y+s.h/2],'cen',3)}
  }
  for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++){
    const A=near[i],B=near[j];
    for(const a of segs(A)){for(const b of segs(B))xSS(a,b).forEach(q=>add(q,'int',0));if(B.t==='circle')xSC(a,B).forEach(q=>add(q,'int',0))}
    if(A.t==='circle'){for(const b of segs(B))xSC(b,A).forEach(q=>add(q,'int',0));if(B.t==='circle')xCC(A,B).forEach(q=>add(q,'int',0))}
  }
  let best=null,bs=1e9;
  for(const c of L){const d=Math.hypot((c.p[0]-p[0])*V.s,(c.p[1]-p[1])*V.s);if(d<=22&&d+c.r*3<bs){bs=d+c.r*3;best=c}}
  return best;
}

function snapPt(p){const o=osnap(p);mk=o;return o?o.p.slice():S.grid?[grid(p[0]),grid(p[1])]:p}

function build(a,b){
  const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(b[0]-a[0]),h=Math.abs(b[1]-a[1]);
  let s;
  if(tool==='line')s={t:'line',a,b};
  else if(tool==='wall')s={t:'wall',a,b,th:D.th||.2};
  else if(tool==='dim')s={t:'dim',a,b,off:.6};
  else if(tool==='circle')s={t:'circle',x:a[0],y:a[1],r:Math.hypot(b[0]-a[0],b[1]-a[1])};
  else if(tool==='arc'){let a1=Math.atan2(b[1]-a[1],b[0]-a[0]);if(a1<=0)a1+=Math.PI*2;s={t:'arc',x:a[0],y:a[1],r:Math.hypot(b[0]-a[0],b[1]-a[1]),a0:0,a1};}
  else if(tool==='ellipse')s={t:'ellipse',x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,rx:Math.max(.025,w/2),ry:Math.max(.025,h/2),rot:0};
  else if(tool==='polygon'){const r=Math.hypot(b[0]-a[0],b[1]-a[1]),ang=Math.atan2(b[1]-a[1],b[0]-a[0]);s={t:'polygon',p:Array.from({length:polygonSides},(_,i)=>[a[0]+r*Math.cos(ang+i*2*Math.PI/polygonSides),a[1]+r*Math.sin(ang+i*2*Math.PI/polygonSides)])};}
  else if(tool==='tri')s={t:'tri',p:b[1]>=a[1]?[[x+w/2,y],[x+w,y+h],[x,y+h]]:[[x,y],[x+w,y],[x+w/2,y+h]]};
  else s={t:'rect',x,y,w,h};
  return Object.assign(s,{ly:cl,col:D.col||undefined,lw:D.lw});
}
function dseg(px,py,ax,ay,bx_,by){const dx=bx_-ax,dy=by-ay,l=dx*dx+dy*dy;let t=l?((px-ax)*dx+(py-ay)*dy)/l:0;t=clamp(t,0,1);return Math.hypot(px-ax-t*dx,py-ay-t*dy)}
function hit(px,py){
  for(let i=shapes.length-1;i>=0;i--){const s=shapes[i];if(!ed(s))continue;
    if(s.t==='circle'){const q=w2s(s.x,s.y);if(Math.hypot(px-q[0],py-q[1])<=s.r*V.s+8)return i}
    else if(s.t==='rect'||s.t==='furn'){const q=s2w(px,py),cx=s.x+s.w/2,cy=s.y+s.h/2,c=Math.cos(-(s.rot||0)),n=Math.sin(-(s.rot||0)),dx=q[0]-cx,dy=q[1]-cy,m=8/V.s;if(Math.abs(dx*c-dy*n)<=s.w/2+m&&Math.abs(dx*n+dy*c)<=s.h/2+m)return i}
    else if(s.t==='tri'){const q=s.p.map(r=>w2s(...r)),sg=(a,b)=>(px-b[0])*(a[1]-b[1])-(a[0]-b[0])*(py-b[1]),d=[sg(q[0],q[1]),sg(q[1],q[2]),sg(q[2],q[0])];if(!(d.some(v=>v<0)&&d.some(v=>v>0)))return i}
    else if(s.t==='text'||s.t==='north'){const n=nb(s),q=s2w(px,py),dx=q[0]-s.x,dy=q[1]-s.y,c=Math.cos(-n.rot),sn=Math.sin(-n.rot),m=8/V.s;if(Math.abs(dx*c-dy*sn)<=n.w/2+m&&Math.abs(dx*sn+dy*c)<=n.h/2+m)return i}
    else if(s.t==='dim'){const q=dimPts(s).map(r=>w2s(...r));if(dseg(px,py,q[0][0],q[0][1],q[1][0],q[1][1])<16)return i}
    else{const q=pts(s).map(r=>w2s(...r));for(let j=1;j<q.length;j++)if(dseg(px,py,q[j-1][0],q[j-1][1],q[j][0],q[j][1])<Math.max(16,(s.th||0)*V.s/2+8))return i}}
  return -1;
}

// ---- الرسم ----
const colors=()=>{const s=getComputedStyle(document.documentElement),v=n=>s.getPropertyValue(n).trim();return{bg:v('--cv'),grid:v('--grid'),major:v('--major'),ln:v('--ln'),ac:v('--ac'),dim:v('--dim')}};
function tag(t,x,y,c,big){
  ctx.font=`${big?600:400} ${big?15:12}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
  const w=ctx.measureText(t).width+10;ctx.globalAlpha=.8;ctx.fillStyle=c.bg;ctx.fillRect(x-w/2,y-9,w,18);ctx.globalAlpha=1;
  ctx.fillStyle=big?c.ln:c.dim;ctx.fillText(t,x,y);
}
// باب (t:'door': x,y,a زاوية الجدار,w العرض,f جهة الفتح,h المفصلة) ونافذة (t:'win')
function drawOpen(s,on,c){
  const q=w2s(s.x,s.y),w=s.w*V.s,co=Math.cos(s.a),si=Math.sin(s.a),col=s.col||layerOf(s).col||c.ln,lw=s.lw||2;
  const T=(u,v)=>[q[0]+co*u-si*v,q[1]+si*u+co*v],L=(a,b)=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1])};
  ctx.lineCap='butt';ctx.setLineDash([]);
  ctx.beginPath();L(T(-w/2,0),T(w/2,0));ctx.strokeStyle=c.bg;ctx.lineWidth=Math.max(12,(s.th||0)*V.s+3);ctx.stroke();
  if(on){ctx.beginPath();L(T(-w/2,0),T(w/2,0));ctx.strokeStyle=c.ac;ctx.globalAlpha=.3;ctx.lineWidth=lw+14;ctx.stroke();ctx.globalAlpha=1}
  ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.beginPath();
  if(s.t==='win'){ctx.lineWidth=Math.max(1.2,lw*.75);const hf=Math.max(4,(s.th||0)*V.s/2);[-hf,0,hf].forEach(v=>L(T(-w/2,v),T(w/2,v)));L(T(-w/2,-hf),T(-w/2,hf));L(T(w/2,-hf),T(w/2,hf));ctx.stroke()}
  else{
    const hu=-s.h*w/2,of=(s.th||0)*V.s/2*s.f,H=T(hu,of),E=T(hu,of+s.f*w),C=T(-hu,of);L(H,E);ctx.stroke();
    const aE=Math.atan2(E[1]-H[1],E[0]-H[0]),aC=Math.atan2(C[1]-H[1],C[0]-H[0]);let d=aC-aE;d=Math.atan2(Math.sin(d),Math.cos(d));
    ctx.beginPath();ctx.lineWidth=Math.max(1,lw*.6);ctx.globalAlpha=.7;ctx.arc(H[0],H[1],w,aE,aE+d,d<0);ctx.stroke();ctx.globalAlpha=1;
  }
  if(on&&ST.showDims){const m=T(0,-22);tag(fl(s.w),m[0],m[1],c)}
}
// خط الأبعاد: a,b نقطتا القياس، off إزاحة الخط بالمتر (الإشارة تحدد الجهة)
function dimPts(s){const L=len(s)||1,nx=-(s.b[1]-s.a[1])/L*s.off,ny=(s.b[0]-s.a[0])/L*s.off;return[[s.a[0]+nx,s.a[1]+ny],[s.b[0]+nx,s.b[1]+ny]]}
function drawDim(s,on,prev,c){
  const L=len(s);if(L<1e-6)return;
  const d=dimPts(s),A=w2s(...s.a),B=w2s(...s.b),p=w2s(...d[0]),q=w2s(...d[1]),col=s.col||layerOf(s).col||'#0d9488',lw=s.lw?Math.max(1,s.lw*.75):1.5;
  const el=Math.hypot(q[0]-p[0],q[1]-p[1])||1,e=[(q[0]-p[0])/el,(q[1]-p[1])/el];
  let n=[p[0]-A[0],p[1]-A[1]];const nl=Math.hypot(n[0],n[1]);n=nl>1?[n[0]/nl,n[1]/nl]:[-e[1],e[0]];
  const T=(o,u,k)=>[o[0]+u[0]*k,o[1]+u[1]*k],M=(a,b)=>{ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1])},tt=(()=>{const x=e[0]+n[0],y=e[1]+n[1],l=Math.hypot(x,y)||1;return[x/l,y/l]})();
  ctx.lineCap='butt';ctx.setLineDash(prev?[6,4]:[]);
  if(on){ctx.beginPath();M(p,q);ctx.strokeStyle=c.ac;ctx.globalAlpha=.3;ctx.lineWidth=lw+10;ctx.stroke();ctx.globalAlpha=1}
  ctx.beginPath();M(T(A,n,Math.min(4,nl)),T(p,n,8));M(T(B,n,Math.min(4,nl)),T(q,n,8));M(T(p,e,-6),T(q,e,6));M(T(p,tt,-5),T(p,tt,5));M(T(q,tt,-5),T(q,tt,5));
  ctx.strokeStyle=col;ctx.lineWidth=lw;ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle=col;if(s.la){ctx.beginPath();ctx.arc(A[0],A[1],3,0,7);ctx.fill()}if(s.lb){ctx.beginPath();ctx.arc(B[0],B[1],3,0,7);ctx.fill()}
  let ang=Math.atan2(e[1],e[0]);if(ang>Math.PI/2||ang<-Math.PI/2)ang+=Math.PI;
  ctx.save();ctx.translate((p[0]+q[0])/2,(p[1]+q[1])/2);ctx.rotate(ang);ctx.font=`600 12px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
  const txt=fl(L),tw=ctx.measureText(txt).width+10;ctx.globalAlpha=.9;ctx.fillStyle=c.bg;ctx.fillRect(-tw/2,-9,tw,18);ctx.globalAlpha=1;ctx.fillStyle=col;ctx.fillText(txt,0,0);ctx.restore();
  if(prev){const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];let an=Math.atan2(-dy,dx)*180/Math.PI;if(an<0)an+=360;tag(`${Math.round(an)}° · Δx ${fu(Math.abs(dx))} · Δy ${fu(Math.abs(dy))}`,B[0],B[1]+26,c)}
}
// مكتبة الأثاث: كل رمز يُرسم بأشكال بسيطة بإحداثيات نسبية (-0.5..0.5) داخل مستطيله w×h بالمتر، وهو شكل {t:'furn',k,x,y,w,h,rot} مثل المستطيل
const SYM={
  bed1:{n:'سرير فردي',w:.9,h:2,p:[['r',-.5,-.5,1,1],['r',-.42,-.46,.84,.2],['l',-.5,-.1,.5,-.1]]},
  bed2:{n:'سرير مزدوج',w:1.6,h:2,p:[['r',-.5,-.5,1,1],['r',-.46,-.46,.42,.2],['r',.04,-.46,.42,.2],['l',-.5,-.12,.5,-.12]]},
  sofa3:{n:'أريكة',w:2,h:.9,p:[['r',-.5,-.5,1,1],['r',-.5,-.5,1,.28],['r',-.5,-.5,.1,1],['r',.4,-.5,.1,1],['l',-.17,-.22,-.17,.5],['l',.17,-.22,.17,.5]]},
  armchair:{n:'كرسي مريح',w:.9,h:.9,p:[['r',-.5,-.5,1,1],['r',-.5,-.5,1,.28],['r',-.5,-.5,.14,1],['r',.36,-.5,.14,1]]},
  table:{n:'طاولة',w:1.6,h:.9,p:[['r',-.5,-.5,1,1],['r',-.44,-.4,.88,.8]]},
  tablerd:{n:'طاولة مدورة',w:1,h:1,p:[['e',0,0,.5,.5],['e',0,0,.4,.4]]},
  chair:{n:'كرسي',w:.45,h:.45,p:[['r',-.5,-.5,1,1],['r',-.5,-.5,1,.25]]},
  desk:{n:'مكتب',w:1.4,h:.7,p:[['r',-.5,-.5,1,1],['r',-.5,-.5,.26,1],['l',-.5,-.17,-.24,-.17],['l',-.5,.17,-.24,.17]]},
  wardrobe:{n:'خزانة',w:1.8,h:.6,p:[['r',-.5,-.5,1,1],['l',0,-.5,0,.5],['l',-.5,-.5,0,.5],['l',.5,-.5,0,.5]]},
  tv:{n:'طاولة تلفاز',w:1.5,h:.4,p:[['r',-.5,-.5,1,1],['r',-.36,-.28,.72,.12]]},
  sink:{n:'مغسلة',w:.6,h:.5,p:[['r',-.5,-.5,1,1],['e',0,.08,.36,.3],['e',0,-.36,.05,.07]]},
  toilet:{n:'مرحاض',w:.4,h:.7,p:[['r',-.5,-.5,1,.3],['e',0,.14,.42,.34]]},
  bath:{n:'حوض استحمام',w:1.7,h:.75,p:[['r',-.5,-.5,1,1],['r',-.44,-.4,.88,.8],['e',.36,0,.05,.09]]},
  shower:{n:'دش',w:.9,h:.9,p:[['r',-.5,-.5,1,1],['l',-.5,-.5,.5,.5],['e',0,0,.07,.07]]},
  stove:{n:'طباخ',w:.6,h:.6,p:[['r',-.5,-.5,1,1],['e',-.24,-.24,.15,.15],['e',.24,-.24,.15,.15],['e',-.24,.24,.15,.15],['e',.24,.24,.15,.15]]},
  fridge:{n:'ثلاجة',w:.7,h:.7,p:[['r',-.5,-.5,1,1],['l',-.5,-.2,.5,-.2],['l',-.36,-.1,-.36,.2]]},
  washer:{n:'غسالة',w:.6,h:.6,p:[['r',-.5,-.5,1,1],['e',0,.06,.32,.32],['r',-.4,-.44,.3,.1]]},
  stairs:{n:'سلّم',w:1,h:3,p:[['r',-.5,-.5,1,1],...Array.from({length:9},(_,i)=>['l',-.5,-.5+(i+1)*.1,.5,-.5+(i+1)*.1]),['l',0,.45,0,-.45],['l',-.1,-.33,0,-.45],['l',.1,-.33,0,-.45]]},
  car:{n:'سيارة',w:1.8,h:4.5,p:[['r',-.5,-.5,1,1],['r',-.4,-.3,.8,.16],['r',-.4,.2,.8,.12],['r',-.56,-.36,.06,.2],['r',.5,-.36,.06,.2],['r',-.56,.2,.06,.2],['r',.5,.2,.06,.2]]}
};
function furnIcon(k){
  const d=SYM[k],m=Math.max(d.w,d.h),sx=d.w/m,sy=d.h/m;
  return '<svg viewBox="-.58 -.58 1.16 1.16">'+d.p.map(p=>p[0]==='r'?`<rect x="${p[1]*sx}" y="${p[2]*sy}" width="${p[3]*sx}" height="${p[4]*sy}"/>`:p[0]==='e'?`<ellipse cx="${p[1]*sx}" cy="${p[2]*sy}" rx="${Math.abs(p[3]*sx)}" ry="${Math.abs(p[4]*sy)}"/>`:`<line x1="${p[1]*sx}" y1="${p[2]*sy}" x2="${p[3]*sx}" y2="${p[4]*sy}"/>`).join('')+'</svg>';
}
// تعبئة الغرف: s.fk = solid/tile/wood/hatch/dots و s.fc = لون التعبئة (افتراضيًا لون الخط)
function fillShape(s,Q,col){
  const fc=s.fc||col,k=s.fk;
  ctx.globalAlpha=k==='solid'?.4:.08;ctx.fillStyle=k==='solid'?fc:col;ctx.fill(Q);ctx.globalAlpha=1;
  if(!k||k==='solid')return;
  const b=bx(s),sp={tile:.4,wood:.14,hatch:.2,dots:.3}[k];
  if(!sp||sp*V.s<4)return;
  const x0=b.x,x1=b.X,y0=b.y,y1=b.Y;
  if((x1-x0+y1-y0)/sp>700||(k==='dots'&&(x1-x0)*(y1-y0)/(sp*sp)>2500))return;
  const X=x=>V.x+x*V.s,Y=y=>V.y+y*V.s;
  ctx.save();ctx.clip(Q);ctx.strokeStyle=fc;ctx.globalAlpha=.55;ctx.lineWidth=1;ctx.setLineDash([]);ctx.beginPath();
  if(k==='tile'){for(let x=Math.floor(x0/sp)*sp;x<=x1;x+=sp){ctx.moveTo(X(x),Y(y0));ctx.lineTo(X(x),Y(y1))}for(let y=Math.floor(y0/sp)*sp;y<=y1;y+=sp){ctx.moveTo(X(x0),Y(y));ctx.lineTo(X(x1),Y(y))}}
  else if(k==='wood'){const L=sp*7;let r=0;for(let y=Math.floor(y0/sp)*sp;y<=y1;y+=sp,r++){ctx.moveTo(X(x0),Y(y));ctx.lineTo(X(x1),Y(y));for(let x=Math.floor(x0/L)*L+(r%3)*L/3;x<=x1;x+=L){ctx.moveTo(X(x),Y(y));ctx.lineTo(X(x),Y(y+sp))}}}
  else if(k==='hatch'){const h=y1-y0;for(let d=x0-h;d<=x1;d+=sp){ctx.moveTo(X(d),Y(y1));ctx.lineTo(X(d+h),Y(y0))}}
  else{for(let x=Math.floor(x0/sp)*sp;x<=x1;x+=sp)for(let y=Math.floor(y0/sp)*sp;y<=y1;y+=sp){ctx.moveTo(X(x)+1.3,Y(y));ctx.arc(X(x),Y(y),1.3,0,7)}}
  ctx.stroke();ctx.restore();
}
// أبعاد مرتبطة: البُعد يحمل la/lb = {id,i,m} (شكل معرّف بـ id، رقم الرأس أو الضلع، m=1 لمنتصف الضلع) ويتحدّث مع كل رسم
function sid(s){return s.id||(s.id=uid())}
function linkDim(d){for(const k of['la','lb']){const r=d[k];if(r&&r.s)d[k]={id:sid(r.s),i:r.i,m:r.m||0};else delete d[k]}}
function syncDims(){
  const ds=shapes.filter(s=>s.t==='dim'&&(s.la||s.lb));if(!ds.length)return;
  const by=new Map();shapes.forEach(s=>{if(s.id)by.set(s.id,s)});
  const pt=L=>{const s=by.get(L.id);if(!s)return null;const P=pts(s);if(L.m){const A=P[L.i],B=P[(L.i+1)%P.length];return A&&B?[(A[0]+B[0])/2,(A[1]+B[1])/2]:null}return P[L.i]||null};
  ds.forEach(d=>{if(d.la){const p=pt(d.la);if(p)d.a=p.slice()}if(d.lb){const p=pt(d.lb);if(p)d.b=p.slice()}});
}
function fixLinks(src,out){
  const map=new Map();
  src.forEach((s,i)=>{if(s.id){out[i].id=uid();map.set(s.id,out[i].id)}});
  out.forEach(d=>{if(d.t==='dim')for(const k of['la','lb']){if(d[k]){if(map.has(d[k].id))d[k]={...d[k],id:map.get(d[k].id)};else delete d[k]}}});
}
function drawFurn(s,on,c){
  const d=SYM[s.k]||SYM.table,q=w2s(s.x+s.w/2,s.y+s.h/2),W2=s.w*V.s,H2=s.h*V.s,col=s.col||layerOf(s).col||c.ln,lw=s.lw||1.5;
  ctx.save();ctx.translate(q[0],q[1]);ctx.rotate(s.rot||0);ctx.setLineDash([]);ctx.lineJoin='round';ctx.lineCap='round';
  if(on){ctx.globalAlpha=.3;ctx.strokeStyle=c.ac;ctx.lineWidth=lw+8;ctx.strokeRect(-W2/2,-H2/2,W2,H2);ctx.globalAlpha=1}
  ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=lw;
  d.p.forEach((p,i)=>{
    ctx.beginPath();
    if(p[0]==='r')ctx.rect(p[1]*W2,p[2]*H2,p[3]*W2,p[4]*H2);
    else if(p[0]==='e')ctx.ellipse(p[1]*W2,p[2]*H2,Math.abs(p[3]*W2),Math.abs(p[4]*H2),0,0,7);
    else{ctx.moveTo(p[1]*W2,p[2]*H2);ctx.lineTo(p[3]*W2,p[4]*H2)}
    if(i===0){ctx.globalAlpha=.08;ctx.fill();ctx.globalAlpha=1}
    ctx.stroke();
  });
  ctx.restore();
}
function drawNote(s,on,c){
  const q=w2s(s.x,s.y),col=s.col||layerOf(s).col||c.ln,n=nb(s),px=Math.max(6,s.h*V.s);
  ctx.save();ctx.translate(q[0],q[1]);ctx.rotate(s.a||0);ctx.setLineDash([]);
  if(s.t==='text'){
    const txt=s.txt||'';ctx.direction=/[\u0600-\u06FF]/.test(txt)?'rtl':'ltr';
    ctx.font=`600 ${px}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineJoin='round';ctx.lineWidth=px*.3;ctx.strokeStyle=c.bg;ctx.strokeText(txt,0,0);ctx.fillStyle=col;ctx.fillText(txt,0,0);
  }else{
    const r=Math.max(14,s.h*V.s/2);
    ctx.strokeStyle=col;ctx.fillStyle=col;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-r*.9);ctx.lineTo(r*.35,r*.6);ctx.lineTo(0,r*.25);ctx.lineTo(-r*.35,r*.6);ctx.closePath();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-r*.9);ctx.lineTo(0,r*.25);ctx.lineTo(-r*.35,r*.6);ctx.closePath();ctx.fill();
    ctx.font=`700 ${Math.max(11,r*.6)}px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.direction='ltr';ctx.fillText('N',0,-r-Math.max(8,r*.4));
  }
  if(on){const bw=n.w*V.s,bh=n.h*V.s;ctx.strokeStyle=c.ac;ctx.lineWidth=1.5;ctx.setLineDash([5,3]);ctx.strokeRect(-bw/2-4,-bh/2-4,bw+8,bh+8)}
  ctx.restore();
}
function drawShape(s,on,prev,c){
  if(s.t==='dim')return drawDim(s,on,prev,c);
  if(s.t==='furn')return drawFurn(s,on,c);
  if(s.t==='text'||s.t==='north')return drawNote(s,on,c);
  if(s.t==='door'||s.t==='win')return drawOpen(s,on,c);
  const Q=new Path2D(),col=s.col||layerOf(s).col||c.ln,lw=s.t==='wall'?Math.max(2,s.th*V.s):s.lw||2,closed=['rect','tri','polygon','circle','ellipse'].includes(s.t);
  if(s.t==='circle'){const r=w2s(s.x,s.y);Q.arc(r[0],r[1],s.r*V.s,0,7)}
  else if(s.t==='ellipse'){pts(s).forEach((q,i)=>{const r=w2s(...q);i?Q.lineTo(r[0],r[1]):Q.moveTo(r[0],r[1])});Q.closePath()}
  else{pts(s).forEach((q,i)=>{const r=w2s(...q);i?Q.lineTo(r[0],r[1]):Q.moveTo(r[0],r[1])});if(closed)Q.closePath()}
  ctx.lineJoin='round';ctx.lineCap=s.t==='wall'?'square':'round';
  if(on){ctx.lineWidth=lw+8;ctx.strokeStyle=c.ac;ctx.globalAlpha=.3;ctx.stroke(Q);ctx.globalAlpha=1}
  if(closed)fillShape(s,Q,col);
  ctx.lineWidth=lw;ctx.strokeStyle=prev?c.ac:col;ctx.setLineDash(prev?[8,6]:[]);ctx.stroke(Q);ctx.setLineDash([]);
  const b=bx(s),a0=w2s(b.x,b.y),a1=w2s(b.X,b.Y),cx=(a0[0]+a1[0])/2,cy=(a0[1]+a1[1])/2;
  if((s.t==='line'||s.t==='wall')&&ST.showDims){const a=w2s(...s.a),e=w2s(...s.b);tag(`${fl(len(s))}${(on||prev)&&s.t==='wall'?` · ${f(s.th*100)} cm`:''}`,(a[0]+e[0])/2,(a[1]+e[1])/2-14-(s.th||0)*V.s/2,c)}
  else if(['free','polyline','arc'].includes(s.t)){if(ST.showDims&&(on||prev)){const q=w2s(...pts(s).at(-1));tag(s.t==='arc'?fl(s.r*(s.a1-s.a0)):fl(plen(s.p)),q[0],q[1]-16,c)}}
  else{
    const A=area(s),L=[];if(s.name)L.push([s.name,1]);
    if(ST.showDims){if(s.t==='circle')L.push([`R ${fl(s.r)}`,0]);else if(s.t==='rect')L.push([`${fu(s.w)} × ${fl(s.h)}`,0]);}
    if(ST.showAreas)L.push([`${f(A)} m²`,1]);
    const pw=a1[0]-a0[0],ph=a1[1]-a0[1];
    if(L.length&&pw>96&&ph>L.length*22+10)L.forEach((l,i)=>tag(l[0],cx,cy+(i-(L.length-1)/2)*20,c,l[1]));else if(ST.showAreas&&pw>44&&ph>26)tag(`${f(A)} m²`,cx,cy,c,1);
    if(ST.showDims&&(on||prev)){
      if(s.t==='rect'){const k=rc(s).map(q=>w2s(...q));tag(fu(s.w),(k[0][0]+k[1][0])/2,(k[0][1]+k[1][1])/2-14,c);tag(fu(s.h),(k[1][0]+k[2][0])/2+22,(k[1][1]+k[2][1])/2,c)}
      else if(s.t==='tri')s.p.forEach((q,i)=>{const n=s.p[(i+1)%3],u=w2s(...q),e=w2s(...n);tag(fu(Math.hypot(q[0]-n[0],q[1]-n[1])),(u[0]+e[0])/2,(u[1]+e[1])/2,c)});
      else if(s.t==='circle'){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(a1[0],cy);ctx.strokeStyle=c.ac;ctx.lineWidth=1.5;ctx.stroke();tag(fu(s.r),(cx+a1[0])/2,cy-14,c)}
      else if(s.t==='ellipse'){tag(`RX ${fu(s.rx)}`,cx,cy-14,c);tag(`RY ${fu(s.ry)}`,cx,cy+14,c)}
    }
  }
}
function marker(c){
  const q=w2s(...mk.p),x=q[0],y=q[1];ctx.strokeStyle=c.ac;ctx.lineWidth=2.5;ctx.beginPath();
  if(mk.k==='end')ctx.rect(x-7,y-7,14,14);
  else if(mk.k==='mid'){ctx.moveTo(x,y-8);ctx.lineTo(x+8,y+6);ctx.lineTo(x-8,y+6);ctx.closePath()}
  else if(mk.k==='int'){ctx.moveTo(x-7,y-7);ctx.lineTo(x+7,y+7);ctx.moveTo(x+7,y-7);ctx.lineTo(x-7,y+7)}
  else if(mk.k==='cen')ctx.arc(x,y,7,0,7);
  else{ctx.moveTo(x,y-8);ctx.lineTo(x+8,y);ctx.lineTo(x,y+8);ctx.lineTo(x-8,y);ctx.closePath()}
  ctx.stroke();tag(NM[mk.k],x,y-22,c);
}
function draw(){
  const c=colors();syncDims();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.direction='ltr';
  ctx.fillStyle=c.bg;ctx.fillRect(0,0,W,H);
  let gs=ST.gs||(V.s>=18?1:5);while(gs*V.s<7)gs*=2;const x0=Math.floor(-V.x/V.s/gs)*gs,x1=(W-V.x)/V.s,y0=Math.floor(-V.y/V.s/gs)*gs,y1=(H-V.y)/V.s;
  if(ST.grid)for(const major of[false,true]){
    ctx.beginPath();
    for(let x=x0;x<=x1;x+=gs){if((Math.round(x/gs)%5===0)!==major)continue;const p=Math.round(V.x+x*V.s)+.5;ctx.moveTo(p,0);ctx.lineTo(p,H)}
    for(let y=y0;y<=y1;y+=gs){if((Math.round(y/gs)%5===0)!==major)continue;const p=Math.round(V.y+y*V.s)+.5;ctx.moveTo(0,p);ctx.lineTo(W,p)}
    ctx.strokeStyle=major?c.major:c.grid;ctx.lineWidth=1;ctx.stroke();
  }
  for(const pass of[0,1])shapes.forEach((s,i)=>{if(shown(s)&&(s.t==='door'||s.t==='win')===!!pass)drawShape(s,sel.includes(i),false,c)});
  if(cur)drawShape(cur,false,true,c);
  if(polyDraft)drawShape(polyDraft,false,true,c);
  if(box){
    const cr=box.x1<box.x0,k=cr?'#16a34a':'#2563eb',bw=box.x1-box.x0,bh=box.y1-box.y0;
    ctx.setLineDash(cr?[7,4]:[]);ctx.lineWidth=1.5;ctx.strokeStyle=k;ctx.fillStyle=k;ctx.globalAlpha=.12;ctx.fillRect(box.x0,box.y0,bw,bh);ctx.globalAlpha=1;ctx.strokeRect(box.x0,box.y0,bw,bh);ctx.setLineDash([]);
    tag(`${cr?'تحديد بالتقاطع':'تحديد داخلي'} (${sel.length})`,(box.x0+box.x1)/2,Math.min(box.y0,box.y1)-14,c);
  }else if(tool==='select'&&!sel.length&&shapes.length){ctx.font=`400 12px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.dim;ctx.fillText('إطار من اليسار: داخلي · من اليمين: بالتقاطع',W/2,16)}
  if(g&&g.k==='rot'&&g.moved){const q=w2s(...g.c);tag(`${Math.round(g.deg)}°`,q[0],q[1],c,1)}
  else grips().forEach(q=>{
    if(q.id==='rot'){ctx.strokeStyle=c.ac;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(q.top[0],q.top[1]);ctx.lineTo(q.sp[0],q.sp[1]);ctx.stroke();ctx.fillStyle=c.ac;ctx.beginPath();ctx.arc(q.sp[0],q.sp[1],11,0,7);ctx.fill();ctx.fillStyle=c.bg;ctx.font=`600 15px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('↻',q.sp[0],q.sp[1]+1)}
    else{ctx.fillStyle=c.bg;ctx.strokeStyle=c.ac;ctx.lineWidth=2;ctx.fillRect(q.sp[0]-6,q.sp[1]-6,12,12);ctx.strokeRect(q.sp[0]-6,q.sp[1]-6,12,12)}
  });
  if(ST.axes){
    const o=w2s(0,0),at=o[0]>12&&o[0]<W-40&&o[1]>44&&o[1]<H-12,b0=at?o:[34,H-58],n2=34;
    ctx.lineWidth=2;ctx.lineCap='round';ctx.font=`600 11px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.strokeStyle=ctx.fillStyle='#dc2626';ctx.beginPath();ctx.moveTo(b0[0],b0[1]);ctx.lineTo(b0[0]+n2,b0[1]);ctx.moveTo(b0[0]+n2-6,b0[1]-4);ctx.lineTo(b0[0]+n2,b0[1]);ctx.lineTo(b0[0]+n2-6,b0[1]+4);ctx.stroke();ctx.fillText('X',b0[0]+n2+9,b0[1]);
    ctx.strokeStyle=ctx.fillStyle='#16a34a';ctx.beginPath();ctx.moveTo(b0[0],b0[1]);ctx.lineTo(b0[0],b0[1]-n2);ctx.moveTo(b0[0]-4,b0[1]-n2+6);ctx.lineTo(b0[0],b0[1]-n2);ctx.lineTo(b0[0]+4,b0[1]-n2+6);ctx.stroke();ctx.fillText('Y',b0[0],b0[1]-n2-9);
    if(at){ctx.strokeStyle=c.dim;ctx.lineWidth=1.5;ctx.strokeRect(b0[0]-4,b0[1]-4,8,8);ctx.fillStyle=c.dim;ctx.textAlign='left';ctx.font=`400 10px ${FONT}`;ctx.fillText('0,0',b0[0]+7,b0[1]+13)}
  }
  if(ST.coord&&(mk||cpos)){const q=mk?mk.p:cpos;ctx.font=`400 11px ${FONT}`;ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle=c.dim;ctx.fillText(`X ${fu(q[0])}   Y ${fu(-q[1])}  ${ul()}`,W-10,H-14)}
  if(mk)marker(c);
  if(tool==='polyline'){ctx.font=`400 13px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.dim;ctx.fillText('انقر لإضافة الرؤوس ثم اضغط إنهاء POLYLINE',W/2,20)}
  if(tool==='door'||tool==='win'){ctx.font=`400 13px ${FONT}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.dim;ctx.fillText(`المس جدارًا لوضع ${tool==='door'?'الباب':'النافذة'} ثم اسحب لتحريكه`,W/2,20)}
  if(!shapes.length&&!cur&&!polyDraft){ctx.font=`400 15px ${FONT}`;ctx.textAlign='center';ctx.fillStyle=c.dim;ctx.fillText('اختر شكلًا من الأسفل ثم اسحب على اللوحة',W/2,H/2)}
  const L=gs*V.s;ctx.strokeStyle=c.dim;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(12,H-14);ctx.lineTo(12+L,H-14);ctx.stroke();
  ctx.font=`400 11px ${FONT}`;ctx.textAlign='left';ctx.fillStyle=c.dim;ctx.fillText(fl(gs),12,H-26);
}
function upd(){
  const n=sel.length;$('#pn').textContent=pname();$('#moveMode').hidden=!n;$('#editMode').hidden=!n;$('#moveMode').classList.toggle('on',touchMode==='move');$('#editMode').classList.toggle('on',touchMode==='edit');
  $('#tot').textContent=`المساحة الكلية ${f(shapes.reduce((a,s)=>a+(shown(s)&&!s.ex?area(s):0),0))} م² ▾`;
  $('#undo').disabled=!hist.length;$('#redo').disabled=!redo.length;$('#ctx').style.display=tool==='select'||n?'flex':'none';
  $('#op').disabled=$('#cp').disabled=$('#del').disabled=$('#rt').disabled=$('#scale').disabled=!n;$('#ps').disabled=!clip.length;
  $$('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===tool));
  $$('[data-fk]').forEach(b=>b.classList.toggle('on',tool==='furn'&&b.dataset.fk===furnKind));
  $$('[data-g]').forEach(b=>{const m=$('#'+b.dataset.g),it=m.querySelector(tool==='furn'?`[data-fk="${furnKind}"]`:`[data-t="${tool}"]`);b.dataset.h=b.dataset.h||b.innerHTML;b.innerHTML=it?it.innerHTML:b.dataset.h;b.classList.toggle('on',!!it)});
  $$('[data-s]').forEach(b=>b.classList.toggle('on',!!S[b.dataset.s]));
  $('#stg').classList.toggle('warn',!ST.cloud&&shapes.length>=3&&Date.now()-(ST.bk||0)>6048e5);
  $('#snap').classList.toggle('on',Object.values(S).some(Boolean));
}
function resize(){dpr=devicePixelRatio||1;const r=$('main').getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;draw()}

// ---- الإدخال الرقمي المستقل للرسم (يمكن مزجه مع اللمس أو الفأرة) ----
const drawNames={line:'خط',wall:'جدار',dim:'بُعد',rect:'مستطيل',circle:'دائرة',arc:'قوس',ellipse:'شكل بيضاوي',tri:'مثلث',polygon:'مضلع',polyline:'متعدد الخطوط',free:'رسم حر',furn:'أثاث',text:'نص',north:'سهم الشمال',door:'باب',win:'نافذة'};
function drawPointFromInputs(){const x=num($('#diX').value),y=num($('#diY').value);if(!Number.isFinite(x)||!Number.isFinite(y)){toast('أدخل إحداثيي X وY بشكل صحيح');return null}return [nu(x),nu(y)]}
function drawInputOpen(){return !!drawFlow}
function drawInputStage(stage){if(!drawFlow)return;drawFlow.stage=stage;const t=drawFlow.tool,multi=['polyline','free'].includes(t),params=stage==='params';$('#diTitle').textContent=`${drawNames[t]||'رسم'} — ${stage==='first'?'النقطة الأولى':stage==='second'?'النقطة الثانية':params?'خصائص العنصر':'النقطة التالية'}`;$('#diHint').textContent=stage==='first'?'أدخل إحداثيات النقطة الأولى، أو المس/انقر موضعها على اللوحة.':stage==='second'?'أدخل إحداثيات النقطة الثانية، أو المس/انقر موضعها على اللوحة.':params?'أدخل الأبعاد المطلوبة، أو المس/انقر نقطة على اللوحة لتحديدها بصرياً.':'أدخل إحداثيات النقطة التالية أو اخترها على اللوحة. يمكنك إنهاء الرسم متى شئت.';$('#diFinish').style.display=multi&&drawFlow.points.length>=2?'':'none';$('#diSubmit').textContent=stage==='first'?'إدخال النقطة الأولى':stage==='second'&&!multi?'إدخال ورسم':params?'إدخال ورسم':'إضافة نقطة';$('#diCoords').style.display=params?'none':'grid';const specs={circle:[['r','نصف القطر',fu(1)]],arc:[['r','نصف القطر',fu(1)],['a0','زاوية البداية °',0],['a1','زاوية النهاية °',90]],ellipse:[['rx','نصف المحور X',fu(2)],['ry','نصف المحور Y',fu(1)],['rot','زاوية الدوران °',0]],polygon:[['r','نصف القطر',fu(1)],['sides','عدد الأضلاع',polygonSides],['ang','زاوية البداية °',0]]};$('#diExtra').innerHTML=params?(specs[t]||[]).map(([k,label,v])=>`<label>${label}<input data-param="${k}" type="number" step="any" inputmode="decimal" value="${v}"></label>`).join(''):'';$('#diExtra').style.display=params?'grid':'none';$('#diUnit').textContent=`الوحدة: ${ul()} — الإحداثيات بالنسبة إلى أصل المخطط`;$('#drawInput').classList.add('on');$('#diX').value='';$('#diY').value='';setTimeout(()=>{const f=params?$('#diExtra input'):$('#diX');if(f)f.focus({preventScroll:true})},30)}
function sidesSheet(done){
  const sh=$('#sheet');
  sh.innerHTML='<b>عدد أضلاع المضلع</b><div class="chips" id="sdc">'+[3,4,5,6,8,10,12].map(n=>`<button class="chip${n===polygonSides?' on':''}" data-v="${n}">${n}</button>`).join('')+'</div><label>عدد آخر (3 إلى 32)<input id="sdn" dir="ltr" inputmode="numeric"></label><div class="row"><button class="fl" id="sdx">إلغاء</button><button class="fl" id="opk">متابعة</button></div>';
  $('#sdn').value=polygonSides;
  const fin=n=>{polygonSides=clamp(Math.round(n)||6,3,32);sh.classList.remove('on');upd();done()};
  sh.querySelectorAll('#sdc .chip').forEach(b=>{b.onclick=()=>fin(+b.dataset.v)});
  $('#sdx').onclick=()=>{drawFlow=null;sh.classList.remove('on');upd()};
  $('#opk').onclick=()=>fin(num($('#sdn').value));
  sh.classList.add('on');$('#ctx').style.display='none';
}
function startDrawFlow(t){if(['furn','dim','door','win'].includes(t))return;if(!['line','wall','rect','circle','arc','ellipse','tri','polygon','polyline','free','text','north'].includes(t))return;drawFlow={tool:t,stage:'first',points:[]};if(t==='polygon'){sidesSheet(()=>{if(drawFlow&&drawFlow.tool==='polygon')drawInputStage('first')});return}drawInputStage('first')}
function closeDrawFlow(){drawFlow=null;$('#drawInput').classList.remove('on')}
function addDrawPoint(q,fromInput=false){if(!drawFlow)return false;const t=drawFlow.tool;const p=fromInput?q:snapPt(q);if(drawFlow.stage==='first'){drawFlow.points=[p];if(['furn','text','north','door','win'].includes(t)){commitSinglePoint(p);return true}drawInputStage(['circle','arc','ellipse','polygon'].includes(t)?'params':'second');return true}
 if(drawFlow.stage==='params'){drawFlow.points.push(p);commitPointShape();return true}
 if(t==='polyline'||t==='free'){const last=drawFlow.points[drawFlow.points.length-1];if(!last||Math.hypot(p[0]-last[0],p[1]-last[1])>.001)drawFlow.points.push(p);drawInputStage('next');return true}
 drawFlow.points.push(p);commitPointShape();return true}
function commitSinglePoint(p){const t=drawFlow.tool;let s;if(t==='door'||t==='win'){const w=wallAt(p,28/V.s);if(!w){toast('لا يوجد جدار قريب من النقطة المحددة');return}s={t,x:w.q[0],y:w.q[1],a:w.a,th:w.th,w:t==='door'?.9:1.2,f:1,h:1,ly:cl,col:D.col||undefined,lw:D.lw}}else if(t==='furn'){const d=SYM[furnKind];s={t:'furn',k:furnKind,x:p[0]-d.w/2,y:p[1]-d.h/2,w:d.w,h:d.h,rot:0,ly:cl,col:D.col||undefined}}else{s={t,x:p[0],y:p[1],h:t==='text'?.35:1,a:0,ly:cl,col:D.col||undefined};if(t==='text')s.txt='نص'}snap();shapes.push(s);sel=[shapes.length-1];closeDrawFlow();save();upd();draw();showDyn(s);if(t==='text'){opts();setTimeout(()=>{const x=$('#sheet [data-k="txt"]');if(x){x.focus();x.select()}},60)}}
function commitParamShape(){if(!drawFlow||drawFlow.stage!=='params')return;const t=drawFlow.tool,p=drawFlow.points[0],get=k=>num($(`#diExtra [data-param="${k}"]`)?.value),u=uk();let s;
 if(t==='circle'){const r=get('r')/u;if(!(r>0)){toast('أدخل نصف قطر أكبر من صفر');return}s={t,x:p[0],y:p[1],r}}
 else if(t==='arc'){const r=get('r')/u,a0=rad(get('a0')),a1=rad(get('a1'));if(!(r>0)||!Number.isFinite(a0)||!Number.isFinite(a1)||a0===a1){toast('تحقق من نصف القطر وزاويتي البداية والنهاية');return}s={t,x:p[0],y:p[1],r,a0,a1};while(s.a1<=s.a0)s.a1+=Math.PI*2;if(s.a1-s.a0>Math.PI*2){toast('زاوية القوس يجب ألا تتجاوز دورة كاملة');return}}
 else if(t==='ellipse'){const rx=get('rx')/u,ry=get('ry')/u,rot=rad(get('rot'));if(!(rx>0&&ry>0)||!Number.isFinite(rot)){toast('أدخل نصفي محور صحيحين وزاوية صالحة');return}s={t,x:p[0],y:p[1],rx,ry,rot}}
 else if(t==='polygon'){const r=get('r')/u,sides=Math.round(get('sides')),a=rad(get('ang'));if(!(r>0)||!Number.isFinite(sides)||sides<3||sides>32||!Number.isFinite(a)){toast('تحقق من نصف القطر وعدد الأضلاع والزاوية');return}s={t,p:Array.from({length:sides},(_,i)=>[p[0]+r*Math.cos(a+i*2*Math.PI/sides),p[1]+r*Math.sin(a+i*2*Math.PI/sides)])}}
 if(!s||!valid(s)){toast('الأبعاد المدخلة غير صالحة');return}s.ly=cl;s.col=D.col||undefined;s.lw=D.lw;snap();shapes.push(s);sel=[shapes.length-1];closeDrawFlow();save();upd();draw();showDyn(s)}
function commitPointShape(){if(!drawFlow||drawFlow.points.length<2)return;const t=drawFlow.tool,[a,b]=drawFlow.points;let s;if(t==='door'||t==='win'){const w=wallAt(a,28/V.s);if(!w){toast('لا يوجد جدار قريب من الإحداثيات المحددة');drawFlow.points.pop();drawInputStage('first');return}s={t,x:w.q[0],y:w.q[1],a:w.a,th:w.th,w:t==='door'?.9:1.2,f:1,h:1,ly:cl,col:D.col||undefined,lw:D.lw}}
 else{s=build(a,b);if(t==='ellipse'){s.x=a[0];s.y=a[1];s.rx=Math.max(.025,Math.abs(b[0]-a[0]));s.ry=Math.max(.025,Math.abs(b[1]-a[1]));s.rot=0}}
 if(!valid(s)){toast('النقطتان متقاربتان جداً أو أن الأبعاد غير صالحة');return}snap();if(s.t==='dim')linkDim(s);shapes.push(s);sel=[shapes.length-1];closeDrawFlow();save();upd();draw();showDyn(s)}
function finishDrawFlow(){if(!drawFlow)return;const t=drawFlow.tool;if(t==='polyline'||t==='free'){const p=drawFlow.points;if(p.length>=2){const s={t,p:copy(p),ly:cl,col:D.col||undefined,lw:D.lw};if(valid(s)){snap();shapes.push(s);sel=[shapes.length-1];closeDrawFlow();save();upd();draw();showDyn(s);return}}toast('أضف نقطتين على الأقل قبل الإنهاء');return}closeDrawFlow()}
$('#diSubmit').onclick=()=>{if(!drawFlow)return;if(drawFlow.stage==='params'){commitParamShape();return}const p=drawPointFromInputs();if(p)addDrawPoint(p,true)};
$('#diFinish').onclick=finishDrawFlow;$('#diCancel').onclick=$('#diClose').onclick=()=>{closeDrawFlow();cur=null;polyDraft=null;$('#polybar').style.display='none';draw()};
$('#diX').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#diY').focus()}});$('#diY').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#diSubmit').click()}});$('#diExtra').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#diSubmit').click()}});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drawFlow)closeDrawFlow()});

// ---- اللمس ----
function finishPolyline(){if(polyDraft&&polyDraft.p.length>=2&&valid(polyDraft)){snap();shapes.push(polyDraft);sel=[shapes.length-1];polyDraft=null;$('#polybar').style.display='none';save();upd();draw();showDyn(shapes[sel[0]])}else{polyDraft=null;$('#polybar').style.display='none';draw()}}
$('#polyfinish').onclick=finishPolyline;$('#polycancel').onclick=()=>{polyDraft=null;$('#polybar').style.display='none';draw()};
cv.addEventListener('dblclick',e=>{if(tool==='polyline'&&polyDraft){e.preventDefault();finishPolyline()}});
cv.addEventListener('pointerdown',e=>{
  touchInputActive=e.pointerType==='touch';
  cv.setPointerCapture(e.pointerId);P.set(e.pointerId,pos(e));
  if(P.size===2){
    const[a,b]=[...P.values()],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    g={k:'pinch',d:Math.hypot(a[0]-b[0],a[1]-b[1])||1,s:V.s,w:s2w(...m)};cur=null;box=null;mk=null;draw();return;
  }
  if(P.size>2)return;
  const p=pos(e);cpos=s2w(...p);if(drawFlow){addDrawPoint(cpos,false);draw();return}$('#sheet').classList.remove('on');$('#smenu').classList.remove('on');hideDyn();$$('.gm').forEach(m=>m.classList.remove('on'));
  if(tool==='polyline'){const q=snapPt(s2w(...p));if(!polyDraft){polyDraft={t:'polyline',p:[q],ly:cl,col:D.col||undefined,lw:D.lw};toast('أضف الرؤوس، ثم اضغط إنهاء POLYLINE')}else{const first=polyDraft.p[0];if(polyDraft.p.length>=3&&Math.hypot((q[0]-first[0])*V.s,(q[1]-first[1])*V.s)<14){polyDraft.t='polygon';finishPolyline();return}const last=polyDraft.p[polyDraft.p.length-1];if(Math.hypot(q[0]-last[0],q[1]-last[1])>.01)polyDraft.p.push(q)}$('#polybar').style.display='flex';mk=null;draw();return}
  if(tool==='pan')g={k:'pan',px:p[0],py:p[1],vx:V.x,vy:V.y};
  else if(tool==='select'){
    const gr=gripAt(p);
    if(gr){
      const before=snapStr();
      if(gr.id==='rot'){const c=selC(),w=s2w(...p);g={k:'rot',c,a0:Math.atan2(w[1]-c[1],w[0]-c[0]),o:sel.map(j=>copy(shapes[j])),before}}
      else g={k:'grip',gr,i:sel[0],o:copy(shapes[sel[0]]),before};
      upd();draw();return;
    }
    const i=hit(...p);
    if(i>=0){
      if(e.pointerType==='touch'&&!sel.includes(i)){sel=[i];g=null;upd();draw();return}
      if(e.pointerType==='touch'&&touchMode==='edit'){g=null;showDyn(shapes[i]);upd();draw();return}
      if(!sel.includes(i))sel=[i];
      g={k:'move',w0:s2w(...p),o:sel.map(j=>copy(shapes[j])),before:snapStr()}
    }else{sel=[];g={k:'box',a:p}}
  }else if(tool==='furn'){
    const a=snapPt(s2w(...p)),d=SYM[furnKind],s={t:'furn',k:furnKind,x:a[0]-d.w/2,y:a[1]-d.h/2,w:d.w,h:d.h,rot:0,ly:cl,col:D.col||undefined};
    snap();shapes.push(s);sel=[shapes.length-1];g={k:'move',w0:s2w(...p),o:[copy(s)],moved:1,numericPlace:1};mk=null;
  }else if(tool==='trim'||tool==='extend'){
    (tool==='trim'?trimAt:extendAt)(p);g=null;mk=null;upd();draw();return;
  }else if(tool==='text'||tool==='north'){
    const a=snapPt(s2w(...p)),s={t:tool,x:a[0],y:a[1],h:tool==='text'?.35:1,a:0,ly:cl,col:D.col||undefined};
    if(tool==='text')s.txt='نص';
    snap();shapes.push(s);sel=[shapes.length-1];g=null;mk=null;upd();draw();
    showDyn(s);if(tool==='text'){opts();setTimeout(()=>{const t=$('#sheet [data-k="txt"]');if(t){t.focus();t.select()}},60)}
    return;
  }else if(tool==='door'||tool==='win'){
    const w=wallAt(s2w(...p),28/V.s);sel=[];
    if(w){const s={t:tool,x:w.q[0],y:w.q[1],a:w.a,th:w.th,w:tool==='door'?.9:1.2,f:1,h:1,ly:cl,col:D.col||undefined,lw:D.lw};
      snap();shapes.push(s);sel=[shapes.length-1];g={k:'move',w0:s2w(...p),o:[copy(s)],moved:1,numericPlace:1}}
  }else{
    sel=[];const a=tool==='free'?s2w(...p):snapPt(s2w(...p));if(tool==='free')mk=null;
    g={k:'draw',a,la:mk&&mk.ref,before:snapStr()};if(tool==='free')cur={t:'free',p:[a],ly:cl,col:D.col||undefined,lw:D.lw};
  }
  upd();draw();
});
cv.addEventListener('pointermove',e=>{
  if(!P.has(e.pointerId))return;P.set(e.pointerId,pos(e));if(!g)return;const p=P.get(e.pointerId);cpos=s2w(...p);
  if(g.k==='pinch'){
    const[a,b]=[...P.values()];if(!b)return;
    const d=Math.hypot(a[0]-b[0],a[1]-b[1]),m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    V.s=clamp(g.s*d/g.d,6,400);V.x=m[0]-g.w[0]*V.s;V.y=m[1]-g.w[1]*V.s;
  }else if(g.k==='pan'){V.x=g.vx+p[0]-g.px;V.y=g.vy+p[1]-g.py}
  else if(g.k==='move'){
    const w=s2w(...p),dx=w[0]-g.w0[0],dy=w[1]-g.w0[1];
    const candidate=osnap(w);mk=candidate|| (S.grid?{p:[grid(w[0]),grid(w[1])],k:'grid'}:null);
    if(!g.moved&&(Math.abs(dx)>1e-9||Math.abs(dy)>1e-9)){g.moved=1;hist.push(g.before)}
    sel.forEach((j,n)=>mv(shapes[j],g.o[n],dx,dy));
    sel.forEach((j,n)=>{const s=shapes[j],o=g.o[n];if(s.t==='dim'&&(s.la||s.lb)){s.a=o.a;s.b=o.b;const L=len(o)||1;s.off=o.off+(dx*(-(o.b[1]-o.a[1]))+dy*(o.b[0]-o.a[0]))/L}});
    sel.forEach(j=>{const s=shapes[j];if(s.t==='door'||s.t==='win'){const q=wallAt([s.x,s.y],28/V.s);if(q){s.x=q.q[0];s.y=q.q[1];s.a=q.a;s.th=q.th}}});
  }else if(g.k==='rot'){
    const w=s2w(...p);let d=Math.atan2(w[1]-g.c[1],w[0]-g.c[0])-g.a0;if(S.grid)d=Math.round(d/(Math.PI/12))*Math.PI/12;
    if(!g.moved&&d){g.moved=1;hist.push(g.before)}
    g.deg=d*180/Math.PI;sel.forEach((j,n)=>rotS(shapes[j],g.o[n],g.c,d));
  }else if(g.k==='grip'){
    const s=shapes[g.i],o=g.o,id=g.gr.id,keep=shapes.splice(g.i,1)[0],q=snapPt(s2w(...p));shapes.splice(g.i,0,keep);
    if(!g.moved){g.moved=1;hist.push(g.before)}
    if(s.t==='dim'){if(id==='o'){const L=len(s)||1,nx=-(s.b[1]-s.a[1])/L,ny=(s.b[0]-s.a[0])/L;s.off=(q[0]-s.a[0])*nx+(q[1]-s.a[1])*ny}else{s[id]=q;const L2=mk&&mk.ref&&mk.ref.s!==s?{id:sid(mk.ref.s),i:mk.ref.i,m:mk.ref.m||0}:undefined;if(id==='a')s.la=L2;else s.lb=L2}}else if(s.t==='line'||s.t==='wall'){const oth=s[id==='a'?'b':'a'];s[id]=mk?q:constrain(oth,q)}
    else if(s.t==='tri')s.p=o.p.map((r,i)=>i===id?q:r);
    else if(s.t==='circle')s.r=Math.max(.05,Math.hypot(q[0]-s.x,q[1]-s.y));
    else if(s.t==='rect'||s.t==='furn'){const opp=rc(o)[(id+2)%4],rt=-(o.rot||0),c=Math.cos(rt),n=Math.sin(rt),dx=q[0]-opp[0],dy=q[1]-opp[1],w=Math.max(.05,Math.abs(dx*c-dy*n)),h=Math.max(.05,Math.abs(dx*n+dy*c));s.w=w;s.h=h;s.x=(q[0]+opp[0])/2-w/2;s.y=(q[1]+opp[1])/2-h/2}
  }else if(g.k==='box'){if(Math.hypot(p[0]-g.a[0],p[1]-g.a[1])>6){box={x0:g.a[0],y0:g.a[1],x1:p[0],y1:p[1]};sel=boxSel()}}
  else if(g.k==='draw'){
    let b=tool==='free'?s2w(...p):snapPt(s2w(...p));if(!mk&&(tool==='line'||tool==='wall'||tool==='dim'))b=constrain(g.a,b);
    if(tool==='free'){if(cur){const l=cur.p[cur.p.length-1];if(Math.hypot(b[0]-l[0],b[1]-l[1])*V.s>=4)cur.p.push(b)}}
    else{cur=build(g.a,b);if(tool==='dim'){cur.la=g.la||undefined;cur.lb=(mk&&mk.ref)||undefined}}
  }
  draw();
});
function endPtr(e){
  if(!P.has(e.pointerId))return;const endPoint=pos(e);P.delete(e.pointerId);
  if(g&&e.type==='pointerup'){
    if(g.k==='move'&&g.moved&&!g.numericPlace){
      const w=s2w(...endPoint),dx=S.grid?grid(w[0]-g.w0[0]):w[0]-g.w0[0],dy=S.grid?grid(w[1]-g.w0[1]):w[1]-g.w0[1];
      sel.forEach((j,n)=>mv(shapes[j],g.o[n],dx,dy));
      sel.forEach((j,n)=>{const s=shapes[j],o=g.o[n];if(s.t==='dim'&&(s.la||s.lb)){s.a=o.a;s.b=o.b;const L=len(o)||1;s.off=o.off+(dx*(-(o.b[1]-o.a[1]))+dy*(o.b[0]-o.a[0]))/L}});
      sel.forEach(j=>{const s=shapes[j];if(s.t==='door'||s.t==='win'){const q=wallAt([s.x,s.y],28/V.s);if(q){s.x=q.q[0];s.y=q.q[1];s.a=q.a;s.th=q.th}}});
    }
    if(g.k==='draw'&&cur&&valid(cur)){hist.push(g.before);if(cur.t==='dim')linkDim(cur);shapes.push(cur);sel=[shapes.length-1];showDyn(cur)}
    else if(g.k==='move'&&g.numericPlace&&sel.length){showDyn(shapes[sel[0]])}
    else if(g.k==='box'&&box){
      sel=boxSel();
    }
  }
  cur=null;g=null;box=null;mk=null;save();upd();draw();
}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{
  e.preventDefault();const p=pos(e),w=s2w(...p);
  V.s=clamp(V.s*(e.deltaY<0?1.1:.9),6,400);V.x=p[0]-w[0]*V.s;V.y=p[1]-w[1]*V.s;draw();
},{passive:false});

// ---- خيارات: اللون والسمك والأبعاد ----
function opts(){
  if(!sel.length)return;
  const sh=$('#sheet'),s1=sel.length===1?shapes[sel[0]]:null,first=shapes[sel[0]],F=[];let done=0;
  const once=()=>{if(!done){snap();done=1}};
  if(s1){
    if(!['line','wall','dim','free','polyline','door','win','text','north','furn'].includes(s1.t))F.push(['name','الاسم',s1.name||'']);
    const b=bx(s1);
    if(s1.t==='ellipse')F.push(['rx','نصف المحور الأفقي ('+uA()+')',fu(s1.rx)],['ry','نصف المحور الرأسي ('+uA()+')',fu(s1.ry)],['ang','الزاوية (°)',f(((s1.rot||0)*180/Math.PI)%360)]);
    if(s1.t==='rect'||s1.t==='furn')F.push(['w','العرض ('+uA()+')',fu(s1.w)],['h','الطول ('+uA()+')',fu(s1.h)],['ang','الزاوية (°)',f(((s1.rot||0)*180/Math.PI)%360)]);else if(s1.t==='tri')F.push(['w','العرض ('+uA()+')',fu(b.X-b.x)],['h','الطول ('+uA()+')',fu(b.Y-b.y)]);
    else if(s1.t==='circle')F.push(['r','نصف القطر ('+uA()+')',fu(s1.r)]);
    else if(s1.t==='text')F.push(['txt','النص',s1.txt],['h','الحجم ('+uA()+')',fu(s1.h)],['ang','الزاوية (°)',f(((s1.a||0)*180/Math.PI)%360)]);else if(s1.t==='north')F.push(['h','الحجم ('+uA()+')',fu(s1.h)],['ang','الزاوية (°)',f(((s1.a||0)*180/Math.PI)%360)]);
    else if(s1.t==='dim')F.push(['off','الإزاحة ('+uA()+')',fu(s1.off)]);else if(s1.t==='door'||s1.t==='win')F.push(['w','العرض ('+uA()+')',fu(s1.w)]);else if(s1.t==='line'||s1.t==='wall'){F.push(['L','الطول ('+uA()+')',fu(len(s1))]);if(s1.t==='wall')F.push(['th','سمك الجدار (سم)',f(s1.th*100)])}
  }
  sh.innerHTML=`<b>اللون</b><div class="sws">${COLS.map(c=>`<button class="sw${c?'':' auto'}${c===(first.col||'')?' on':''}" data-c="${c}" style="${c?'background:'+c:''}" aria-label="لون"></button>`).join('')}</div>`
    +`<label>الطبقة<select id="elementLayer">${LY.map(l=>`<option value="${l.id}" ${l.id===(first.ly||LY[0]?.id)?'selected':''}>${l.name}</option>`).join('')}</select></label>`
    +`<label>السُّمك<input type="range" id="lw" min="1" max="10" step=".5"><b id="lwv"></b></label>`
    +(sel.some(i=>['rect','circle','ellipse','tri','polygon'].includes(shapes[i].t))?`<b>التعبئة</b><div class="chips" id="fk">${[['','بدون'],['solid','لون'],['tile','بلاط'],['wood','خشب'],['hatch','تهشير'],['dots','نقاط']].map(([v,l])=>`<button class="chip${(first.fk||'')===v?' on':''}" data-v="${v}">${l}</button>`).join('')}</div><div class="sws" id="fc">${COLS.map(c=>`<button class="sw${c?'':' auto'}${c===(first.fc||'')?' on':''}" data-c="${c}" style="${c?'background:'+c:''}" aria-label="لون التعبئة"></button>`).join('')}</div>`:'')
    +F.map(x=>`<label>${x[1]}<input data-k="${x[0]}" ${x[0]==='name'||x[0]==='txt'?'type="text"':'dir="ltr" inputmode="decimal"'}></label>`).join('')
    +(s1&&s1.t==='door'?'<div class="row"><button class="fl" data-f="f">قلب الفتح</button><button class="fl" data-f="h">عكس المفصلة</button></div>':'')
    +(s1&&s1.t==='rect'?'<button class="fl" id="tw">إضافة جدران حولها</button>':'')+'<button id="ok">تم</button>';
  F.forEach(x=>sh.querySelector(`[data-k="${x[0]}"]`).value=x[2]);
  $('#elementLayer').onchange=e=>{once();const id=e.target.value;sel.forEach(i=>{shapes[i].ly=id});save();draw()};
  $('#lw').value=first.lw||2;$('#lwv').textContent=first.lw||2;
  sh.querySelectorAll('.sws:not(#fc) .sw').forEach(b=>b.onclick=()=>{
    once();const c=b.dataset.c;sel.forEach(i=>{shapes[i].col=c||undefined});D.col=c;
    sh.querySelectorAll('.sws:not(#fc) .sw').forEach(x=>x.classList.toggle('on',x===b));save();draw();
  });
  $('#lw').oninput=e=>{once();const v=+e.target.value;sel.forEach(i=>{shapes[i].lw=v});D.lw=v;$('#lwv').textContent=v;save();draw()};
  sh.querySelectorAll('.fl').forEach(b=>b.onclick=()=>{once();s1[b.dataset.f]*=-1;save();draw()});
  const isC=s=>['rect','circle','ellipse','tri','polygon'].includes(s.t);
  sh.querySelectorAll('#fk .chip').forEach(b=>{b.onclick=()=>{once();const v=b.dataset.v||undefined;sel.forEach(i=>{if(isC(shapes[i]))shapes[i].fk=v});sh.querySelectorAll('#fk .chip').forEach(x=>x.classList.toggle('on',x===b));save();draw()}});
  sh.querySelectorAll('#fc .sw').forEach(b=>{b.onclick=()=>{once();const c=b.dataset.c||undefined;sel.forEach(i=>{if(isC(shapes[i]))shapes[i].fc=c});sh.querySelectorAll('#fc .sw').forEach(x=>x.classList.toggle('on',x===b));save();draw()}});
  const tw=$('#tw');if(tw)tw.onclick=()=>{once();const k=rc(s1);k.forEach((q,j)=>shapes.push({t:'wall',a:q,b:k[(j+1)%4],th:D.th||.2,ly:s1.ly,col:s1.col}));sel=[];sh.classList.remove('on');save();upd();draw()};
  $('#ok').onclick=()=>{
    if(s1&&F.length){
      once();const v=k=>{const el=sh.querySelector(`[data-k="${k}"]`);return el?Math.abs(k==='th'?num(el.value):nu(el.value)):0},nm=sh.querySelector('[data-k="name"]');
      if(nm)s1.name=nm.value.trim()||undefined;
      if(s1.t==='ellipse'){s1.rx=v('rx')||s1.rx;s1.ry=v('ry')||s1.ry;const an=sh.querySelector('[data-k="ang"]'),t=an?num(an.value):NaN;if(!isNaN(t))s1.rot=t*Math.PI/180}
      else if(s1.t==='rect'||s1.t==='furn'){const cx=s1.x+s1.w/2,cy=s1.y+s1.h/2;s1.w=v('w')||s1.w;s1.h=v('h')||s1.h;s1.x=cx-s1.w/2;s1.y=cy-s1.h/2;const an=sh.querySelector('[data-k="ang"]'),t=an?num(an.value):NaN;if(!isNaN(t))s1.rot=t*Math.PI/180}
      else if(s1.t==='tri'){const b=bx(s1),W0=b.X-b.x,H0=b.Y-b.y,w=v('w')||W0,h=v('h')||H0;s1.p=s1.p.map(q=>[b.x+(q[0]-b.x)/W0*w,b.y+(q[1]-b.y)/H0*h])}
      else if(s1.t==='circle')s1.r=v('r')||s1.r;
      else if(s1.t==='text'||s1.t==='north'){const tx=sh.querySelector('[data-k="txt"]'),an=sh.querySelector('[data-k="ang"]'),t=an?num(an.value):NaN;if(tx)s1.txt=tx.value.trim()||s1.txt;s1.h=v('h')||s1.h;if(!isNaN(t))s1.a=t*Math.PI/180}
      else if(s1.t==='dim'){const el=sh.querySelector('[data-k="off"]'),t=el?nu(el.value):NaN;if(!isNaN(t))s1.off=t}
      else if(s1.t==='door'||s1.t==='win')s1.w=v('w')||s1.w;
      else if(s1.t==='line'||s1.t==='wall'){const L=v('L'),d=len(s1);if(s1.t==='wall'){s1.th=(v('th')||s1.th*100)/100;D.th=s1.th}if(L>0){const u=d?[(s1.b[0]-s1.a[0])/d,(s1.b[1]-s1.a[1])/d]:[1,0];s1.b=[s1.a[0]+u[0]*L,s1.a[1]+u[1]*L]}}
    }
    sh.classList.remove('on');save();upd();draw();
  };
  sh.classList.add('on');$('#ctx').style.display='none';
}

// ---- الأزرار ----
$('#moveMode').onclick=()=>{touchMode='move';upd();draw()};
$('#editMode').onclick=()=>{touchMode='edit';upd();draw()};
$$('[data-t]').forEach(b=>b.onclick=()=>{if(polyDraft)finishPolyline();closeDrawFlow();tool=b.dataset.t;if(tool==='select')touchMode='move';sel=[];hideDyn();if(tool==='trim')toast('المس الجزء المراد قصه من خط أو جدار');if(tool==='extend')toast('المس قرب طرف الخط أو الجدار لتمديده');$('#sheet').classList.remove('on');$$('.gm').forEach(m=>m.classList.remove('on'));upd();draw();startDrawFlow(tool)});
$('#snap').onclick=()=>{$$('.gm').forEach(m=>m.classList.remove('on'));$('#smenu').classList.toggle('on')};
$$('[data-s]').forEach(b=>b.onclick=()=>{S[b.dataset.s]=S[b.dataset.s]?0:1;upd();save()});
// تراجع/إعادة: كل حالة تحفظ الأشكال والطبقات معًا، وأي إجراء جديد يمسح قائمة الإعادة
function nh(){redo=[];const h=[];h.push=function(x){redo=[];return Array.prototype.push.call(this,x)};return h}
function restore(str){
  const d=JSON.parse(str);
  if(Array.isArray(d))shapes=d;else{shapes=d.s;LY=d.LY;cl=d.cl}
  if(!LY||!LY.length)setLY(null);else{if(!LY.some(l=>l.id===cl))cl=LY[0].id;const c0=LY.find(l=>l.id===cl);if(c0)c0.vis=1}
  sel=[];hideDyn();$('#sheet').classList.remove('on');
}
$('#undo').onclick=()=>{if(!hist.length)return;redo.push(snapStr());restore(hist.pop());save();upd();draw()};
$('#redo').onclick=()=>{if(!redo.length)return;Array.prototype.push.call(hist,snapStr());restore(redo.pop());save();upd();draw()};
$('#op').onclick=opts;
$('#cp').onclick=()=>{clip=sel.map(i=>JSON.parse(JSON.stringify(shapes[i])));upd()};
$('#ps').onclick=()=>{
  if(!clip.length)return;snap();
  const r=clip.map(bx),x0=Math.min(...r.map(q=>q.x)),y0=Math.min(...r.map(q=>q.y)),x1=Math.max(...r.map(q=>q.X)),y1=Math.max(...r.map(q=>q.Y)),c=s2w(W/2,H/2);
  const dx=grid(c[0]-(x0+x1)/2),dy=grid(c[1]-(y0+y1)/2),n=clip.map(s=>{const t=copy(s);mv(t,s,dx,dy);return t});fixLinks(clip,n);
  sel=n.map((_,i)=>shapes.length+i);shapes.push(...n);save();upd();draw();
};
$('#del').onclick=()=>{if(sel.length){snap();shapes=shapes.filter((_,i)=>!sel.includes(i));sel=[];save();upd();draw()}};
$('#all').onclick=()=>{sel=shapes.map((_,i)=>i).filter(i=>ed(shapes[i]));upd();draw()};
function transformShapeScale(s,o,c,k){
  const sc=q=>[c[0]+(q[0]-c[0])*k,c[1]+(q[1]-c[1])*k];
  if(['line','wall','dim'].includes(s.t)){s.a=sc(o.a);s.b=sc(o.b);if(s.t==='dim')s.off=o.off*k;if(s.t==='wall'&&o.th)s.th=o.th*k}
  else if(Array.isArray(o.p))s.p=o.p.map(sc);
  else if(s.t==='circle'||s.t==='arc'){s.x=c[0]+(o.x-c[0])*k;s.y=c[1]+(o.y-c[1])*k;s.r=o.r*k}
  else if(s.t==='ellipse'){s.x=c[0]+(o.x-c[0])*k;s.y=c[1]+(o.y-c[1])*k;s.rx=o.rx*k;s.ry=o.ry*k}
  else if(s.t==='rect'||s.t==='furn'){const m=sc([o.x+o.w/2,o.y+o.h/2]);s.w=o.w*k;s.h=o.h*k;s.x=m[0]-s.w/2;s.y=m[1]-s.h/2}
  else if(['text','north','door','win'].includes(s.t)){s.x=c[0]+(o.x-c[0])*k;s.y=c[1]+(o.y-c[1])*k;s.h=o.h*k;if(o.w!==undefined)s.w=o.w*k;if(o.th!==undefined)s.th=o.th*k}
}
function transformSheet(kind){if(!sel.length)return;const sh=$('#sheet'),single=sel.length===1?shapes[sel[0]]:null;sh.innerHTML=kind==='rotate'?'<b>تدوير العناصر</b><label>زاوية الدوران (درجة)<input id="trval" type="number" step="0.1" value="90" dir="ltr"></label><p>موجب عكس عقارب الساعة، حول مركز التحديد.</p><button id="applytr">تطبيق</button><button id="ok">إلغاء</button>':'<b>تحجيم العناصر</b><label>عامل التحجيم<input id="trval" type="number" min="0.01" step="0.1" value="2" dir="ltr"></label><p>مثال: 2 تكبير للضعف، و0.5 تصغير إلى النصف. يتم التحجيم حول مركز التحديد.</p><button id="applytr">تطبيق</button><button id="ok">إلغاء</button>';$('#applytr').onclick=()=>{const v=num($('#trval').value);if(!Number.isFinite(v)||(kind==='scale'?v<=0:!Number.isFinite(v))){toast('أدخل قيمة صحيحة');return}snap();const c=selC();if(kind==='rotate'){const a=v*Math.PI/180;sel.forEach(i=>rotS(shapes[i],copy(shapes[i]),c,a))}else sel.forEach(i=>{const o=copy(shapes[i]);transformShapeScale(shapes[i],o,c,v)});save();sh.classList.remove('on');upd();draw()};$('#ok').onclick=()=>{sh.classList.remove('on');upd()};sh.classList.add('on');$('#ctx').style.display='none'}
$('#rt').onclick=()=>transformSheet('rotate');$('#scale').onclick=()=>transformSheet('scale');
$('#fit').onclick=()=>{
  if(!shapes.length){V={x:24,y:24,s:40}}
  else{
    const r=shapes.map(bx),x0=Math.min(...r.map(q=>q.x)),y0=Math.min(...r.map(q=>q.y)),x1=Math.max(...r.map(q=>q.X)),y1=Math.max(...r.map(q=>q.Y));
    V.s=clamp(Math.min((W-80)/Math.max(x1-x0,.5),(H-80)/Math.max(y1-y0,.5)),6,120);
    V.x=(W-(x1-x0)*V.s)/2-x0*V.s;V.y=(H-(y1-y0)*V.s)/2-y0*V.s;
  }
  save();draw();
};
$('#shot').onclick=()=>{$$('.gm').forEach(x=>x.classList.remove('on'));$('#smenu').classList.remove('on');exportSheet()};
const quickShot=()=>{
  const s0=sel;sel=[];draw();const u=cv.toDataURL('image/png');sel=s0;draw();
  $('#ov img').src=u;$('#ov').hidden=false;
};
$('#ovx').onclick=()=>{$('#ov').hidden=true};

// ---- المشاريع ----
const pname=()=>(PJ.find(p=>p.id===pid)||{}).name||'بدون اسم';
function openP(id,nosave){
  if(!nosave)save();
  pid=id;polyDraft=null;$('#polybar').style.display='none';const d=lsGet('p:'+id)||{};setLY(d);shapes=d.shapes||[];V=d.V||{x:24,y:24,s:40};sel=[];hist=nh();cur=null;save();upd();draw();
}
function newP(name,sh,ly){
  save();polyDraft=null;$('#polybar').style.display='none';pid=uid();PJ.push({id:pid,name:name||`مشروع ${PJ.length+1}`});shapes=sh||[];setLY(ly||null);V={x:24,y:24,s:40};sel=[];hist=nh();save();upd();draw();
}
function delP(){
  try{localStorage.removeItem(K+'p:'+pid)}catch(e){}
  if(PJ.length<2){shapes=[];setLY(null);V={x:24,y:24,s:40};sel=[];hist=nh();save();upd();draw();return}
  PJ=PJ.filter(p=>p.id!==pid);openP(PJ[0].id,1);
}
function io(mode){
  const o=$('#io'),t=$('#iot'),a=$('#ioa'),m=$('#iop');o.hidden=false;
  if(mode==='export'){
    t.value=JSON.stringify({app:'plan',schemaVersion:2,v:2,name:pname(),unit:ST.unit||'m',LY,cl,shapes});
    a.textContent='نسخ';
    m.textContent='هذه نسخة مشروع كاملة تشمل العناصر والطبقات. انسخ النص واحفظه لاستعادته لاحقًا.';
    a.onclick=()=>{t.focus();t.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){};try{navigator.clipboard?.writeText(t.value).then(()=>{m.textContent='تم نسخ المشروع'}).catch(()=>{})}catch(e){}if(!ok)m.textContent='تم تحديد النص؛ اضغط مطولًا واختر نسخ.'};
  }else{
    t.value='';a.textContent='استيراد';m.textContent='الصق محتوى ملف JSON أو DXF ASCII هنا ثم اضغط استيراد.';
    try{navigator.clipboard?.readText().then(v=>{if(v&&v.trim()&&!t.value){t.value=v;m.textContent='تم لصق محتوى الحافظة — اضغط استيراد'}}).catch(()=>{})}catch(e){}
    a.onclick=()=>{
      try{impText(t.value);o.hidden=true;toast('تم استيراد المشروع')}
      catch(e){m.textContent=e?.message||'النص غير صالح أو غير مكتمل؛ تحقق من الملف ثم أعد المحاولة'}
    };
  }
}
async function saveFile(name,text){
  if(window.claude){
    let d=null;try{d=await claude.use('downloads')}catch(e){}
    if(d){try{await d.save({filename:name,data:text});return 'ok'}catch(e){return e&&e.code==='declined'?'no':'text'}}
    return 'text';
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;document.body.append(a);a.click();a.remove();return 'ok';
}
async function exportFile(){
  const nm=(pname().replace(/[^\p{L}\p{N} _.()-]+/gu,'').trim()||'مشروع')+'.json';
  const data={app:'plan',schemaVersion:2,v:2,name:pname(),unit:ST.unit||'m',createdAt:new Date().toISOString(),LY,cl,shapes};
  const r=await saveFile(nm,JSON.stringify(data));
  if(r==='ok')toast('تم حفظ ملف المشروع الكامل');else if(r==='text')io('export');
}
function validateProjectData(d){
  const types=new Set(['line','wall','rect','circle','arc','ellipse','tri','free','polyline','polygon','door','win','dim','text','north','furn']);
  if(!d||!Array.isArray(d.shapes)||d.shapes.length>30000)throw new Error('عدد العناصر غير صالح');
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const point=p=>Array.isArray(p)&&p.length>=2&&finite(p[0])&&finite(p[1]);
  let total=0;
  const shapes=[];
  for(const raw of d.shapes){
    if(!raw||typeof raw!=='object'||!types.has(raw.t))continue;
    const s=JSON.parse(JSON.stringify(raw));
    const xy=['x','y','w','h','r','a','a0','a1','rot','th','off','f','lw'];
    for(const key of xy){if(key==='a'&&['line','wall','dim'].includes(s.t))continue;if(s[key]!==undefined&&!finite(s[key]))throw new Error('قيمة هندسية غير صالحة')}
    if(['line','wall','dim'].includes(s.t)){if(!point(s.a)||!point(s.b))continue}
    else if(['rect','furn'].includes(s.t)){if(!finite(s.x)||!finite(s.y)||!finite(s.w)||!finite(s.h)||s.w<=0||s.h<=0)continue}
    else if(s.t==='circle'){if(!finite(s.x)||!finite(s.y)||!finite(s.r)||s.r<=0)continue}
    else if(s.t==='ellipse'){if(!finite(s.x)||!finite(s.y)||!finite(s.rx)||!finite(s.ry)||s.rx<=0||s.ry<=0)continue;s.rot=finite(s.rot)?s.rot:0}
    else if(s.t==='arc'){if(!finite(s.x)||!finite(s.y)||!finite(s.r)||s.r<=0||!finite(s.a0)||!finite(s.a1)||s.a1<=s.a0||s.a1-s.a0>Math.PI*2)continue}
    else if(['tri','free','polyline','polygon'].includes(s.t)){if(!Array.isArray(s.p)||s.p.length<(s.t==='tri'?3:2)||s.p.length>10000||!s.p.every(point))continue;total+=s.p.length}
    else if(['door','win','text','north'].includes(s.t)){if(!finite(s.x)||!finite(s.y)||!finite(s.h)||s.h<=0)continue;if(['door','win'].includes(s.t)&&(!finite(s.w)||s.w<=0))continue}
    if(s.t==='text')s.txt=String(s.txt||'').slice(0,10000);
    if(s.t==='furn')s.k=String(s.k||'table').slice(0,40);
    if(s.ly!==undefined)s.ly=String(s.ly).slice(0,128);
    shapes.push(s);if(total>250000)throw new Error('المسارات في الملف كبيرة جدًا');
  }
  if(!shapes.length)throw new Error('لا توجد عناصر صالحة في المشروع');
  let LY=Array.isArray(d.LY)?d.LY.filter(l=>l&&typeof l==='object'&&typeof l.id==='string'&&typeof l.name==='string').slice(0,200):[];
  const ids=new Set();LY=LY.filter(l=>!ids.has(l.id)&&ids.add(l.id)).map(l=>({id:l.id.slice(0,128),name:l.name.slice(0,64),vis:l.vis===0?0:1,lock:l.lock?1:0,col:typeof l.col==='string'?l.col:undefined}));
  if(!LY.length)LY=[{id:'l1',name:'طبقة 1',vis:1,lock:0}];
  const validIds=new Set(LY.map(l=>l.id));shapes.forEach(s=>{if(!validIds.has(s.ly))s.ly=LY[0].id});
  const cl=validIds.has(d.cl)?d.cl:LY[0].id;
  return{shapes,LY,cl};
}
function impText(txt){
  txt=String(txt).replace(/^\ufeff/,'');
  if(!/^\s*[\[{]/.test(txt)){dxfImport(txt);return}
  const d=JSON.parse(txt);
  if(d&&Array.isArray(d.projects)){
    let n=0;
    d.projects.forEach(p=>{
      const q=p&&p.d;if(!q||!Array.isArray(q.shapes))return;
      try{const v=validateProjectData(q);newP(`${p.name||'مشروع'} (مستعاد)`,v.shapes,{LY:v.LY,cl:v.cl});n++}catch(e){}
    });
    if(!n)throw new Error('لا توجد مشاريع صالحة في النسخة الاحتياطية');
    $('#sheet').classList.remove('on');return;
  }
  const v=validateProjectData(d);
  newP(`${d.name||'مشروع'} (مستورد)`,v.shapes,{LY:v.LY,cl:v.cl});
  $('#sheet').classList.remove('on');
}
function importFile(){try{$('#fin').click()}catch(e){io('import')}}
async function handleImportFile(f,input){if(!f)return;let t;try{t=await(f.text?f.text():new Promise((rs,rj)=>{const r=new FileReader();r.onload=()=>rs(r.result);r.onerror=rj;r.readAsText(f)}))}catch(x){toast('تعذّرت قراءة الملف');return}if(input)input.value='';if(!t.trim()){toast('الملف فارغ');return}try{const isDxf=!/^\s*[\[{]/.test(t);impText(t);if(isDxf){toast('تمت قراءة ملف DXF؛ اختر وحدة القياس ثم اضغط «استيراد»')}else{$('#sheet').classList.remove('on');toast('تم استيراد الملف')}}catch(x){console.error('Import error:',x);toast(`لم أتعرف على «${f.name}»: تحقق من أن الملف JSON أو DXF ASCII`)}}
$('#fin').onchange=e=>handleImportFile(e.target.files&&e.target.files[0],e.target);
function exportChoice(){const sh=$('#sheet');sh.innerHTML='<b>تصدير المشروع</b><p>اختر صيغة الملف التي تريدها</p><div class="row"><button class="fl" id="exjson">JSON — ملف المشروع</button><button class="fl" id="exdxf">DXF — AutoCAD</button></div><button id="ok">رجوع</button>';$('#exjson').onclick=exportFile;$('#exdxf').onclick=exportDXF;$('#ok').onclick=settingsSheet;sh.classList.add('on')}
function importChoice(){const sh=$('#sheet');sh.innerHTML='<b>استيراد</b><p>استيراد مشروع JSON أو ملف DXF، أو لصق محتوى الملف نصيًا.</p><div class="row"><label class="fl lb">اختيار ملف<input type="file" id="fin2" accept=".json,.dxf,.txt,application/json,application/dxf,text/plain"></label><button class="fl" id="pasteimp">لصق محتوى نصي</button></div><button id="ok">رجوع</button>';$('#fin2').onchange=e=>handleImportFile(e.target.files&&e.target.files[0],e.target);$('#pasteimp').onclick=()=>io('import');$('#ok').onclick=settingsSheet;sh.classList.add('on')}
function projSheet(){
  const sh=$('#sheet');
  sh.innerHTML='<label>اسم المشروع<input id="pnm"></label><div class="pl"></div><div class="row"><button class="fl" id="pnew">جديد</button><button class="fl" id="pdup">تكرار</button><button class="fl" id="pdel">حذف</button></div><button id="ok">تم</button>';
  const nm=$('#pnm'),pl=sh.querySelector('.pl');
  const fill=()=>{pl.textContent='';PJ.forEach(p=>{const b=document.createElement('button');b.className='pi'+(p.id===pid?' on':'');b.textContent=p.name||'بدون اسم';b.onclick=()=>{if(p.id!==pid){openP(p.id);nm.value=pname();fill()}};pl.append(b)})};
  nm.value=pname();fill();
  nm.oninput=()=>{const p=PJ.find(x=>x.id===pid);p.name=nm.value;save();$('#pn').textContent=pname();fill()};
  $('#pnew').onclick=()=>{newP();nm.value=pname();fill()};
  $('#pdup').onclick=()=>{newP(`${pname()} (نسخة)`,copy(shapes),{LY:copy(LY),cl});nm.value=pname();fill()};
  let armed=0;
  $('#pdel').onclick=e=>{
    const b=e.currentTarget;
    if(!armed){armed=1;b.textContent='تأكيد الحذف';setTimeout(()=>{armed=0;b.textContent='حذف'},3000);return}
    armed=0;b.textContent='حذف';delP();nm.value=pname();fill();
  };
  $('#ok').onclick=()=>{sh.classList.remove('on');upd()};
  sh.classList.add('on');$('#ctx').style.display='none';
}
$('#pj').onclick=projSheet;
function layerSheet(){
  const sh=$('#sheet');
  sh.innerHTML='<div class="pl"></div><div class="row"><button class="fl" id="lnew">طبقة جديدة</button><button class="fl" id="lmv">نقل المحدد هنا</button><button class="fl" id="ldel">حذف الحالية</button></div><div class="row"><button class="fl" id="lmg">دمج الطبقات</button><button class="fl" id="lmc" hidden>إلغاء</button></div><button id="ok">تم</button>';
  let mm=0;const mg=new Set();
  const pl=sh.querySelector('.pl'),ch=()=>{const c0=LY.find(l=>l.id===cl);if(c0)c0.vis=1;sel=sel.filter(i=>ed(shapes[i]));save();upd();draw();fill()},
    mk=(t,fn)=>{const b=document.createElement('button');b.textContent=t;b.onclick=fn;return b};
  const fill=()=>{pl.textContent='';LY.forEach(l=>{
    const r=document.createElement('div'),nm=document.createElement('input'),lc=document.createElement('input');r.className='lr'+(l.id===cl?' on':'');nm.value=l.name;nm.oninput=()=>{l.name=nm.value;save()};lc.type='color';lc.className='layer-color';lc.title='لون الطبقة';lc.value=l.col||'#15324b';lc.onchange=()=>{snap();l.col=lc.value;save();draw()};
    if(mm&&l.id!==cl)r.append(mk(mg.has(l.id)?'☑':'☐',()=>{mg.has(l.id)?mg.delete(l.id):mg.add(l.id);mgUi()}));
    r.append(mk(l.id===cl?'●':'○',()=>{cl=l.id;l.vis=1;mg.delete(cl);save();draw();mgUi()}),nm,lc,mk(l.vis!==0?'ظاهرة':'مخفية',()=>{if(l.id===cl&&l.vis!==0){toast('لا يمكن إخفاء الطبقة الحالية');return}snap();l.vis=l.vis!==0?0:1;ch()}),mk(l.lock?'مقفلة':'مفتوحة',()=>{snap();l.lock=l.lock?0:1;ch()}));
    pl.append(r)})};
  fill();
  $('#lnew').onclick=()=>{snap();LY.push({id:uid(),name:`طبقة ${LY.length+1}`,vis:1,lock:0,col:'#15324b'});cl=LY[LY.length-1].id;save();fill()};
  $('#lmv').onclick=()=>{if(!sel.length){toast('حدّد أشكالًا أولًا');return}snap();sel.forEach(i=>{shapes[i].ly=cl});toast('تم النقل إلى الطبقة الحالية');ch()};
  let armed=0;
  // دمج: اختر طبقات لتنتقل أشكالها إلى الطبقة الحالية ثم تُحذف هي
  const mgUi=()=>{$('#lmg').textContent=mm?`دمج (${mg.size}) في الطبقة الحالية`:'دمج الطبقات';$('#lmc').hidden=!mm;fill()};
  $('#lmc').onclick=()=>{mm=0;mg.clear();mgUi()};
  $('#lmg').onclick=()=>{
    if(!mm){mm=1;mg.clear();toast('اختر الطبقات المراد دمجها');mgUi();return}
    if(!mg.size){toast('اختر طبقة واحدة على الأقل');return}
    snap();const first=LY[0].id;
    shapes.forEach(s=>{const id=s.ly&&LY.some(l=>l.id===s.ly)?s.ly:first;if(mg.has(id))s.ly=cl});
    LY=LY.filter(l=>!mg.has(l.id));mm=0;mg.clear();toast('تم دمج الطبقات');ch();mgUi();
  };
  $('#ldel').onclick=e=>{
    const b=e.currentTarget;
    if(LY.length<2){toast('لا يمكن حذف الطبقة الوحيدة');return}
    if(!armed){armed=1;b.textContent='تأكيد الحذف';setTimeout(()=>{armed=0;b.textContent='حذف الحالية'},3000);return}
    armed=0;b.textContent='حذف الحالية';
    const to=LY.find(l=>l.id!==cl).id,first=LY[0].id;snap();
    shapes.forEach(s=>{if((s.ly||first)===cl)s.ly=to});LY=LY.filter(l=>l.id!==cl);cl=to;ch();
  };
  $('#ok').onclick=()=>{sh.classList.remove('on');upd()};
  sh.classList.add('on');$('#ctx').style.display='none';
}
$('#tot').onclick=()=>{$$('.gm').forEach(x=>x.classList.remove('on'));$('#smenu').classList.remove('on');areaSheet()};
$('#stg').onclick=()=>{$$('.gm').forEach(x=>x.classList.remove('on'));$('#smenu').classList.remove('on');settingsSheet()};
$('#lyb').onclick=()=>{$$('.gm').forEach(x=>x.classList.remove('on'));$('#smenu').classList.remove('on');layerSheet()};
// ---- مجموعات الأدوات: رسم / إضافة (تنقل أزرار الأدوات إلى قائمة منبثقة) ----
// ---- أدوات التعديل المتقدمة: إزاحة، انعكاس، نسخ متكرر، قص، تمديد ----
// ---- التصدير: PNG أو PDF بمقياس رسم على ورقة A4/A3 مع إطار وجدول عنوان ----
let EX={paper:'A4',N:0,grid:0};
function sheetLayout(o){
  const vis=shapes.filter(s=>shown(s));if(!vis.length)return null;
  const R=vis.map(bx),x0=Math.min(...R.map(q=>q.x)),y0=Math.min(...R.map(q=>q.y)),x1=Math.max(...R.map(q=>q.X)),y1=Math.max(...R.map(q=>q.Y)),bw=Math.max(x1-x0,.1),bh=Math.max(y1-y0,.1);
  const dim={A4:[297,210],A3:[420,297]}[o.paper],land=bw>=bh,pw=land?dim[0]:dim[1],ph=land?dim[1]:dim[0];
  const dpi=150,m=10,fr=5,tb=26,aw=pw-2*(m+fr),ah=ph-2*(m+fr)-tb;
  const need=N=>bw*1000/N<=aw&&bh*1000/N<=ah;
  const N=o.N||[10,20,25,50,75,100,125,150,200,250,300,400,500,750,1000,2000,5000].find(need)||5000;
  return{x0,y0,bw,bh,pw,ph,dpi,m,fr,tb,aw,ah,N,fits:need(N),mm:v=>v/25.4*dpi};
}
function renderSheet(o){syncDims();
  const L=sheetLayout(o);if(!L)return null;
  const mm=L.mm,Wp=Math.round(mm(L.pw)),Hp=Math.round(mm(L.ph)),oc=document.createElement('canvas');oc.width=Wp;oc.height=Hp;
  const g2=oc.getContext('2d'),k=1.6,ppm=L.dpi*1000/(25.4*L.N),ap=L.m+L.fr,axp=mm(ap),ayp=mm(ap),awp=mm(L.aw),ahp=mm(L.ah);
  const ox=axp+(awp-L.bw*ppm)/2-L.x0*ppm,oy=ayp+(ahp-L.bh*ppm)/2-L.y0*ppm,sv={ctx,V,W,H,dpr};
  ctx=g2;V={x:ox/k,y:oy/k,s:ppm/k};W=Wp/k;H=Hp/k;dpr=1;
  try{
    g2.fillStyle='#ffffff';g2.fillRect(0,0,Wp,Hp);
    g2.save();g2.beginPath();g2.rect(axp,ayp,awp,ahp);g2.clip();g2.setTransform(k,0,0,k,0,0);g2.direction='ltr';
    const c={bg:'#ffffff',grid:'#e5e7eb',major:'#cbd5e1',ln:'#111827',ac:'#b45309',dim:'#475569'};
    if(o.grid){g2.beginPath();for(let x=Math.floor(L.x0);x<=L.x0+L.bw+1;x++){const p=w2s(x,0)[0];g2.moveTo(p,0);g2.lineTo(p,Hp/k)}for(let y=Math.floor(L.y0);y<=L.y0+L.bh+1;y++){const p=w2s(0,y)[1];g2.moveTo(0,p);g2.lineTo(Wp/k,p)}g2.strokeStyle=c.major;g2.lineWidth=.6;g2.stroke()}
    for(const pass of[0,1])shapes.forEach(s=>{if(shown(s)&&(s.t==='door'||s.t==='win')===!!pass)drawShape(s,false,false,c)});
    g2.restore();
    g2.setTransform(1,0,0,1,0,0);g2.strokeStyle='#111827';g2.lineWidth=mm(.5);
    g2.strokeRect(mm(L.m),mm(L.m),mm(L.pw-2*L.m),mm(L.ph-2*L.m));
    const tx=mm(L.m),ty=mm(L.ph-L.m-L.tb),tw=mm(L.pw-2*L.m),th=mm(L.tb);
    g2.strokeRect(tx,ty,tw,th);
    let x=tx+tw;
    [[.5,'المشروع',o.title],[.2,'المقياس',`1 : ${L.N}`],[.3,'التاريخ',new Date().toISOString().slice(0,10)]].forEach(([fq,lab,val])=>{
      const cw=tw*fq;x-=cw;
      if(x>tx+1){g2.beginPath();g2.moveTo(x,ty);g2.lineTo(x,ty+th);g2.lineWidth=mm(.3);g2.stroke()}
      g2.textAlign='right';g2.textBaseline='top';g2.direction='rtl';g2.font=`400 ${mm(3)}px ${FONT}`;g2.fillStyle='#475569';g2.fillText(lab,x+cw-mm(2),ty+mm(2));
      g2.direction=/[\u0600-\u06FF]/.test(val)?'rtl':'ltr';g2.font=`600 ${mm(7)}px ${FONT}`;g2.fillStyle='#111827';g2.fillText(val,x+cw-mm(2),ty+mm(9),cw-mm(4));
    });
    const bl=L.N<=50?2:L.N<=200?5:L.N<=1000?20:100,bpx=bl*ppm,bx0=axp+mm(2),by0=ayp+ahp-mm(5);
    g2.strokeStyle='#111827';g2.lineWidth=mm(.5);g2.beginPath();g2.moveTo(bx0,by0);g2.lineTo(bx0+bpx,by0);g2.moveTo(bx0,by0-mm(1.5));g2.lineTo(bx0,by0+mm(1.5));g2.moveTo(bx0+bpx,by0-mm(1.5));g2.lineTo(bx0+bpx,by0+mm(1.5));g2.stroke();
    g2.direction='ltr';g2.textAlign='left';g2.textBaseline='bottom';g2.font=`400 ${mm(3)}px ${FONT}`;g2.fillStyle='#111827';g2.fillText(`${bl} m`,bx0,by0-mm(2));
    return{oc,L};
  }finally{ctx=sv.ctx;V=sv.V;W=sv.W;H=sv.H;dpr=sv.dpr}
}
// PDF بسيط: صفحة واحدة بصورة JPEG مضمّنة بحجم الورقة الحقيقي
function makePDF(jpg,wpx,hpx,wmm,hmm){
  const pt=v=>(v/25.4*72).toFixed(2),W2=pt(wmm),H2=pt(hmm),enc=new TextEncoder(),parts=[],offs=[];let n0=0;
  const add=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);n0+=b.length};
  const obj=(n,body,stream)=>{offs[n]=n0;add(`${n} 0 obj\n${body}\n`);if(stream){add('stream\n');add(stream);add('\nendstream\n')}add('endobj\n')};
  add('%PDF-1.4\n');
  obj(1,'<</Type/Catalog/Pages 2 0 R>>');
  obj(2,'<</Type/Pages/Kids[3 0 R]/Count 1>>');
  obj(3,`<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${W2} ${H2}]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>`);
  obj(4,`<</Type/XObject/Subtype/Image/Width ${wpx}/Height ${hpx}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpg.length}>>`,jpg);
  const cs=`q ${W2} 0 0 ${H2} 0 0 cm /Im0 Do Q`;
  obj(5,`<</Length ${cs.length}>>`,cs);
  const xr=n0;
  add('xref\n0 6\n0000000000 65535 f \n'+[1,2,3,4,5].map(n=>String(offs[n]).padStart(10,'0')+' 00000 n \n').join(''));
  add(`trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xr}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
}
async function saveBlob(name,blob){
  if(window.claude){
    let d=null;try{d=await claude.use('downloads')}catch(e){}
    if(d){try{await d.save({filename:name,data:blob});return 'ok'}catch(e){return e&&e.code==='declined'?'no':(e&&e.code==='rejected_extension'?'ext':'err')}}
    return 'err';
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();a.remove();return 'ok';
}
async function doExport(kind,title){
  const o={...EX,title:(title||'').trim()||pname()},r=renderSheet(o);
  if(!r){toast('لا يوجد رسم للطباعة');return}
  if(!r.L.fits){toast(`لا يتسع الرسم بالمقياس 1:${r.L.N}، اختر مقياسًا أصغر أو ورقة أكبر`);return}
  const nm=pname().replace(/[^\p{L}\p{N} _.()-]+/gu,'').trim()||'مخطط';let res;
  if(kind==='png'){
    const b=await new Promise(rs=>r.oc.toBlob(rs,'image/png'));res=await saveBlob(nm+'.png',b);
    if(res==='err'){$('#ov img').src=URL.createObjectURL(b);$('#ov').hidden=false;return}
  }else{
    const jb=await new Promise(rs=>r.oc.toBlob(rs,'image/jpeg',.92)),jpg=new Uint8Array(await jb.arrayBuffer());
    res=await saveBlob(nm+'.pdf',makePDF(jpg,r.oc.width,r.oc.height,r.L.pw,r.L.ph));
  }
  if(res==='ok')toast(`تم الحفظ · 1:${r.L.N}`);else if(res==='err')toast('الحفظ غير متاح هنا');
}
function exportSheet(){
  const sh=$('#sheet');
  const chips=(id,items,cur)=>`<div class="chips" id="${id}">${items.map(([v,l])=>`<button class="chip${String(v)===String(cur)?' on':''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  sh.innerHTML='<b>طباعة</b><label>عنوان اللوحة<input data-k="ttl" type="text"></label><b>الورقة</b>'+chips('xp',[['A4','A4'],['A3','A3']],EX.paper)
    +'<b>المقياس</b>'+chips('xn',[[0,'تلقائي'],[20,'1:20'],[50,'1:50'],[100,'1:100'],[200,'1:200'],[500,'1:500']],EX.N)
    +'<div class="chips"><button class="chip'+(EX.grid?' on':'')+'" id="xg">إظهار الشبكة</button></div><div id="xi" style="color:var(--dim);font-size:12px"></div>'
    +'<div class="row"><button class="fl" id="xpng">حفظ PNG</button><button class="fl" id="xpdf">حفظ PDF</button></div><button id="ok">تم</button>';
  const ttl=sh.querySelector('[data-k="ttl"]');ttl.value=pname();
  const info=()=>{const L=sheetLayout(EX);$('#xi').textContent=L?`الرسم ${f(L.bw)} × ${f(L.bh)} م · ${EX.paper} · 1:${L.N}${L.fits?'':' (لا يتسع)'}`:'لا يوجد رسم للطباعة'};
  const pick=(id,fn)=>sh.querySelectorAll(`#${id} .chip`).forEach(b=>{b.onclick=()=>{fn(b.dataset.v);sh.querySelectorAll(`#${id} .chip`).forEach(x=>x.classList.toggle('on',x===b));info()}});
  pick('xp',v=>{EX.paper=v});pick('xn',v=>{EX.N=+v});
  $('#xg').onclick=e=>{EX.grid=EX.grid?0:1;e.currentTarget.classList.toggle('on',!!EX.grid)};
  $('#xpng').onclick=()=>doExport('png',ttl.value);$('#xpdf').onclick=()=>doExport('pdf',ttl.value);
  $('#ok').onclick=()=>{sh.classList.remove('on');upd()};
  info();sh.classList.add('on');$('#ctx').style.display='none';
}
// ---- جدول المساحات: اضغط على رقم المساحة الكلية في أعلى الشاشة ----
function inside(s,p){
  if(s.t==='circle')return Math.hypot(p[0]-s.x,p[1]-s.y)<=s.r;
  if(s.t==='ellipse'){const c=Math.cos(-(s.rot||0)),n=Math.sin(-(s.rot||0)),dx=p[0]-s.x,dy=p[1]-s.y,x=dx*c-dy*n,y=dx*n+dy*c;return x*x/(s.rx*s.rx)+y*y/(s.ry*s.ry)<=1}
  if(s.t==='rect'){const c=Math.cos(-(s.rot||0)),n=Math.sin(-(s.rot||0)),dx=p[0]-(s.x+s.w/2),dy=p[1]-(s.y+s.h/2);return Math.abs(dx*c-dy*n)<=s.w/2&&Math.abs(dx*n+dy*c)<=s.h/2}
  const q=s.p;if(!q||q.length<3)return false;let hit=false;for(let i=0,j=q.length-1;i<q.length;j=i++){const a=q[i],b=q[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&(p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]))hit=!hit}return hit;
}
function roomList(){
  const R=shapes.map((s,i)=>({s,i})).filter(o=>shown(o.s)&&['rect','circle','ellipse','tri','polygon'].includes(o.s.t)&&area(o.s)>.05);
  const claim=new Map();
  shapes.filter(t=>shown(t)&&t.t==='text'&&t.txt).forEach(t=>{
    let best=null;R.forEach(o=>{if(inside(o.s,[t.x,t.y])&&(!best||area(o.s)<area(best.s)))best=o});
    if(best&&!claim.has(best.i))claim.set(best.i,t.txt);
  });
  return R.map((o,k)=>{
    const s=o.s;
    const per=s.t==='rect'?2*(s.w+s.h):s.t==='circle'?2*Math.PI*s.r:s.t==='ellipse'?Math.PI*(3*(s.rx+s.ry)-Math.sqrt((3*s.rx+s.ry)*(s.rx+3*s.ry))):s.p.reduce((a,q,j)=>a+Math.hypot(q[0]-s.p[(j+1)%s.p.length][0],q[1]-s.p[(j+1)%s.p.length][1]),0);
    const dims=s.t==='rect'?`${fu(s.w)} × ${fu(s.h)}`:s.t==='circle'?`R ${fu(s.r)}`:s.t==='ellipse'?`${fu(s.rx)} × ${fu(s.ry)}`:'';
    return{i:o.i,name:s.name||claim.get(o.i)||`غرفة ${k+1}`,dims,area:area(s),per};
  });
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true}catch(e){}
  const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();return ok;
}
function areaSheet(){
  const sh=$('#sheet'),rows=roomList();
  sh.innerHTML='<b>جدول المساحات</b><div class="at" id="atb"></div><div id="att" style="font-weight:600"></div><div class="row"><button class="fl" id="acp">نسخ</button><button class="fl" id="acs">حفظ CSV</button></div><button id="ok">تم</button>';
  const box=$('#atb'),inc=()=>rows.filter(r=>!shapes[r.i].ex),tot=()=>inc().reduce((a,r)=>a+r.area,0);
  const cell=(t,cls)=>{const d=document.createElement('div');d.textContent=t;if(cls)d.className=cls;return d};
  const goto=i=>{sel=[i];tool='select';sh.classList.remove('on');const b=bx(shapes[i]);V.x=W/2-(b.x+b.X)/2*V.s;V.y=H/2-(b.y+b.Y)/2*V.s;upd();draw()};
  const fill=()=>{
    box.textContent='';
    if(!rows.length){box.textContent='لا توجد غرف بعد: ارسم مستطيلًا أو دائرة أو مثلثًا';return}
    ['','الاسم','الأبعاد','م²'].forEach(h=>box.append(cell(h,'ah')));
    rows.forEach(r=>{
      const s=shapes[r.i],cb=document.createElement('button');cb.textContent=s.ex?'☐':'☑';cb.className='ack';cb.setAttribute('aria-label','تضمين في المجموع');
      cb.onclick=()=>{s.ex=s.ex?undefined:1;save();upd();fill()};
      const nm=cell(r.name,'anm');nm.onclick=()=>goto(r.i);
      box.append(cb,nm,cell(r.dims),cell(f(r.area)));
    });
    $('#att').textContent=`المجموع (${inc().length} من ${rows.length}): ${f(tot())} م²`;
  };
  fill();
  const txt=()=>['الاسم\tالأبعاد\tالمساحة م²\tالمحيط '+ul()].concat(rows.map(r=>`${r.name}\t${r.dims}\t${f(r.area)}\t${fu(r.per)}`)).concat([`المجموع\t\t${f(tot())}\t`]).join('\n');
  const csv=()=>'\ufeff'+[['#','الاسم','الأبعاد','المساحة م²','المحيط '+ul(),'ضمن المجموع']].concat(rows.map((r,n)=>[n+1,r.name,r.dims,f(r.area),fu(r.per),shapes[r.i].ex?'لا':'نعم'])).concat([['','المجموع','',f(tot()),'','']]).map(a=>a.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  $('#acp').onclick=async()=>{toast((await copyText(txt()))?'تم النسخ':'تعذّر النسخ، جرّب حفظ CSV')};
  $('#acs').onclick=async()=>{
    const nm=pname().replace(/[^\p{L}\p{N} _.()-]+/gu,'').trim()||'plan',res=await saveBlob(nm+'-areas.csv',new Blob([csv()],{type:'text/csv'}));
    if(res==='ok')toast('تم الحفظ');else if(res==='err')toast('الحفظ غير متاح هنا');
  };
  $('#ok').onclick=()=>{sh.classList.remove('on');upd()};
  sh.classList.add('on');$('#ctx').style.display='none';
}
// ---- نسخ احتياطي: سحابي (مساحة حسابك الخاصة في claude.ai) وملف لكل المشاريع ----
// ---- DXF: تصدير واستيراد بصيغة ASCII متوافقة مع AutoCAD 2000 (AC1015)، مع دعم وحدات القياس والطبقات والكيانات الشائعة ----
function dxfBuild(){
  const D=[],w=(c,v)=>{D.push(String(c),String(v))},n=v=>Number.isFinite(+v)?+Number(v).toFixed(6):0,Yf=y=>n(-y),BS=String.fromCharCode(92);
  const esc=s=>Array.from(String(s??'')).map(ch=>{
    const cp=ch.codePointAt(0);
    if(cp>=32&&cp<=126)return ch;
    if(cp<=0xffff)return BS+'U+'+cp.toString(16).toUpperCase().padStart(4,'0');
    const z=cp-0x10000,hi=0xD800+(z>>10),lo=0xDC00+(z&1023);
    return BS+'U+'+hi.toString(16).toUpperCase()+BS+'U+'+lo.toString(16).toUpperCase();
  }).join('');
  const aci=c=>({'#dc2626':1,'#ca8a04':2,'#16a34a':3,'#0d9488':4,'#2563eb':5,'#9333ea':6,'#6b7280':8,'#ea580c':30})[String(c||'').toLowerCase()]||7;
  const used=new Set(['0']);
  const clean=(v,i)=>{
    let q=String(v||'Layer').normalize('NFKC').replace(/[<>\/\\":;?*|,=]/g,'_').replace(/\s+/g,'_').replace(/[^A-Za-z0-9_$-]/g,'_').slice(0,28)||'Layer';
    if(/^_+$/.test(q)||q.toLowerCase()==='0')q='Layer_'+(i+1);
    let b=q,j=1;while(used.has(q.toLowerCase()))q=(b.slice(0,24)+'_'+(++j));
    used.add(q.toLowerCase());return q;
  };
  const lnames=LY.map((l,i)=>clean(l.name,i));
  if(!lnames.length)lnames.push('0');
  const lay=s=>{const i=LY.findIndex(l=>l.id===s.ly);return i<0?'0':lnames[i]};
  const ent=(t,s)=>{w(0,t);w(8,lay(s));w(62,256)};
  const P3=(c,q)=>{w(c,n(q[0]));w(c+10,Yf(q[1]));w(c+20,0)};
  const line=(s,a,b)=>{ent('LINE',s);P3(10,a);P3(11,b)};
  const poly=(s,P,closed)=>{if(!P||P.length<2)return;ent('POLYLINE',s);w(66,1);w(10,0);w(20,0);w(30,0);w(70,closed?1:0);P.forEach(q=>{w(0,'VERTEX');w(8,lay(s));P3(10,q)});w(0,'SEQEND');w(8,lay(s))};
  const circ=(s,c,r)=>{ent('CIRCLE',s);P3(10,c);w(40,n(r))};
  const txt=(s,q,h,ang,str)=>{ent('TEXT',s);P3(10,q);w(40,n(h));w(1,esc(str));w(50,n(-ang*180/Math.PI));w(7,'STANDARD')};
  const rot=(c,a,u,v)=>[c[0]+u*Math.cos(a)-v*Math.sin(a),c[1]+u*Math.sin(a)+v*Math.cos(a)];
  w(0,'SECTION');w(2,'HEADER');
  w(9,'$ACADVER');w(1,'AC1015');
  w(9,'$INSUNITS');w(70,6);
  w(9,'$MEASUREMENT');w(70,1);
  w(9,'$LUNITS');w(70,2);
  w(9,'$LUPREC');w(70,4);
  w(0,'ENDSEC');
  w(0,'SECTION');w(2,'TABLES');
  w(0,'TABLE');w(2,'LTYPE');w(70,1);w(0,'LTYPE');w(2,'CONTINUOUS');w(70,0);w(3,'Solid line');w(72,65);w(73,0);w(40,0);w(0,'ENDTAB');
  w(0,'TABLE');w(2,'STYLE');w(70,1);w(0,'STYLE');w(2,'STANDARD');w(70,0);w(40,0);w(41,1);w(50,0);w(71,0);w(42,.2);w(3,'txt');w(4,'');w(0,'ENDTAB');
  w(0,'TABLE');w(2,'LAYER');w(70,Math.max(1,LY.length));
  if(!LY.length){w(0,'LAYER');w(2,'0');w(70,0);w(62,7);w(6,'CONTINUOUS')}
  LY.forEach((l,i)=>{w(0,'LAYER');w(2,lnames[i]);w(70,l.lock?4:0);w(62,l.vis===0?-aci(l.col):aci(l.col));w(6,'CONTINUOUS')});
  w(0,'ENDTAB');w(0,'ENDSEC');
  w(0,'SECTION');w(2,'ENTITIES');
  shapes.forEach(s=>{
    if(!s||typeof s!=='object')return;
    if(s.t==='line')line(s,s.a,s.b);
    else if(s.t==='wall'){
      const L=len(s);if(L>1e-9){const ux=(s.b[0]-s.a[0])/L,uy=(s.b[1]-s.a[1])/L,h=(s.th||.2)/2,nx=-uy*h,ny=ux*h;
      poly(s,[[s.a[0]+nx,s.a[1]+ny],[s.b[0]+nx,s.b[1]+ny],[s.b[0]-nx,s.b[1]-ny],[s.a[0]-nx,s.a[1]-ny]],true)}
    }
    else if(s.t==='rect')poly(s,rc(s),true);
    else if(s.t==='circle')circ(s,[s.x,s.y],s.r);
    else if(s.t==='ellipse'){ent('ELLIPSE',s);const major=Math.max(s.rx,s.ry),minor=Math.min(s.rx,s.ry),ang=(s.rot||0)+(s.ry>s.rx?Math.PI/2:0);P3(10,[s.x,s.y]);w(11,n(major*Math.cos(ang)));w(21,n(-major*Math.sin(ang)));w(31,0);w(40,n(minor/major));w(41,0);w(42,Math.PI*2)}
    else if(s.t==='polyline')poly(s,s.p,false);
    else if(s.t==='polygon')poly(s,s.p,true);
    else if(s.t==='arc'){ent('ARC',s);P3(10,[s.x,s.y]);w(40,n(s.r));let a0=-s.a1*180/Math.PI,a1=-s.a0*180/Math.PI;while(a0<0)a0+=360;while(a0>=360)a0-=360;while(a1<0)a1+=360;while(a1>=360)a1-=360;if(a1<=a0)a1+=360;w(50,n(a0));w(51,n(a1))}
    else if(s.t==='tri')poly(s,s.p,true);
    else if(s.t==='free'&&s.p&&s.p.length>1)poly(s,s.p,false);
    else if(s.t==='dim'&&len(s)>1e-6){
      const d=dimPts(s),p=d[0],q=d[1];line(s,s.a,p);line(s,s.b,q);line(s,p,q);
      let ang=Math.atan2(q[1]-p[1],q[0]-p[0]);if(ang>Math.PI/2||ang<-Math.PI/2)ang+=Math.PI;
      const str=f(len(s)),h=.15,ux=Math.cos(ang),uy=Math.sin(ang),tw=str.length*h*.55,m=[(p[0]+q[0])/2,(p[1]+q[1])/2];
      txt(s,[m[0]-ux*tw/2+uy*h*.35,m[1]-uy*tw/2-ux*h*.35],h,ang,str);
    }
    else if(s.t==='text'){const b=nb(s),a=s.a||0,u=[Math.cos(a),Math.sin(a)],dn=[-Math.sin(a),Math.cos(a)];txt(s,[s.x-u[0]*b.w/2+dn[0]*s.h*.35,s.y-u[1]*b.w/2+dn[1]*s.h*.35],s.h,a,s.txt||'')}
    else if(s.t==='north'){const r=s.h/2,a=s.a||0,c=[s.x,s.y],T=(u,v)=>rot(c,a,u,v);circ(s,c,r);poly(s,[T(0,-.9*r),T(.35*r,.6*r),T(0,.25*r),T(-.35*r,.6*r)],true);txt(s,T(-.15*r,-1.55*r),r*.5,a,'N')}
    else if(s.t==='door'||s.t==='win'){
      const co=Math.cos(s.a||0),si=Math.sin(s.a||0),w2=s.w,th=s.th||0,T=(u,v)=>[s.x+co*u-si*v,s.y+si*u+co*v];
      if(s.t==='win'){const hf=Math.max(.05,th/2);[-hf,0,hf].forEach(v=>line(s,T(-w2/2,v),T(w2/2,v)));line(s,T(-w2/2,-hf),T(-w2/2,hf));line(s,T(w2/2,-hf),T(w2/2,hf))}
      else{const hu=-s.h*w2/2,of=th/2*(s.f||1),H=T(hu,of),E=T(hu,of+(s.f||1)*w2),C=T(-hu,of);line(s,H,E);
        const arc=[];const a0=Math.atan2(E[1]-H[1],E[0]-H[0]),a1=Math.atan2(C[1]-H[1],C[0]-H[0]);let d=Math.atan2(Math.sin(a1-a0),Math.cos(a1-a0));for(let j=0;j<=24;j++){const a=a0+d*j/24;arc.push([H[0]+w2*Math.cos(a),H[1]+w2*Math.sin(a)])}poly(s,arc,false)}
    }
    else if(s.t==='furn'){
      const d=SYM[s.k]||SYM.table,a=s.rot||0,c=[s.x+s.w/2,s.y+s.h/2],T=(u,v)=>rot(c,a,u*s.w,v*s.h);
      d.p.forEach(p=>{if(p[0]==='r')poly(s,[T(p[1],p[2]),T(p[1]+p[3],p[2]),T(p[1]+p[3],p[2]+p[4]),T(p[1],p[2]+p[4])],true);else if(p[0]==='e'){const o=[];for(let i=0;i<32;i++){const t=i/32*2*Math.PI;o.push(T(p[1]+Math.abs(p[3])*Math.cos(t),p[2]+Math.abs(p[4])*Math.sin(t)))}poly(s,o,true)}else line(s,T(p[1],p[2]),T(p[3],p[4]))});
    }
  });
  w(0,'ENDSEC');w(0,'EOF');
  return D.join('\r\n')+'\r\n';
}
async function exportDXF(){
  let txt;try{txt=dxfBuild()}catch(e){toast('تعذّر إنشاء ملف DXF');return}
  const nm=pname().replace(/[^\p{L}\p{N} _.()-]+/gu,'').trim()||'plan';
  let r=await saveBlob(nm+'.dxf',new Blob([txt],{type:'application/dxf'}));
  if(r==='ext'){r=await saveBlob(nm+'.dxf.txt',new Blob([txt],{type:'text/plain'}));if(r==='ok')toast('حُفظ باسم ‎.dxf.txt — غيّر الامتداد إلى dxf قبل فتحه في أوتوكاد');return}
  if(r==='ok')toast('تم حفظ ملف DXF');else if(r==='err')toast('الحفظ غير متاح هنا');
}
function dxfEntities(txt){
  txt=String(txt??'').replace(/^\uFEFF/,'');
  if(txt.length>50000000)throw new Error('ملف DXF أكبر من الحد المسموح (50 MB)');
  if(txt.startsWith('AutoCAD Binary DXF'))throw new Error('DXF الثنائي غير مدعوم؛ استخدم DXF ASCII');
  const a=txt.replace(/\r\n?/g,'\n').split('\n'),P=[];
  for(let i=0;i+1<a.length;){
    if(!a[i].trim()){i++;continue}
    const code=Number.parseInt(a[i].trim(),10);
    if(!Number.isInteger(code)||code<0||code>1071)throw new Error('بنية DXF غير صالحة عند السطر '+(i+1));
    P.push([code,a[i+1].trim()]);i+=2;
  }
  if(!P.length)throw new Error('ملف DXF فارغ');
  const E=[];E.layers=new Map();E.blocks=new Map();E.meta={insunits:null,acadver:null};
  let section='',table='',cur=null,block=null,blockHeader=false;
  for(let i=0;i<P.length;i++){
    const [c,v]=P[i];
    if(c===0&&v==='SECTION'){section=P[i+1]?.[1]||'';table='';cur=null;block=null;blockHeader=false;i++;continue}
    if(c===0&&v==='ENDSEC'){section='';table='';cur=null;block=null;blockHeader=false;continue}
    if(section==='BLOCKS'){
      if(c===0&&v==='BLOCK'){block={name:'',baseX:0,baseY:0,entities:[]};blockHeader=true;cur=null;E.blocks.set('',block)}
      else if(c===0&&v==='ENDBLK'){block=null;cur=null;blockHeader=false}
      else if(block&&blockHeader){if(c===2){block.name=v;E.blocks.set(v,block)}else if(c===10)block.baseX=Number(v)||0;else if(c===20)block.baseY=Number(v)||0}
      else if(block&&c===0){cur={t:v,p:[]};block.entities.push(cur)}
      else if(block&&cur)cur.p.push([c,v]);
    }else if(section==='HEADER'){
      if(c===9){
        const key=v;let q=null;
        for(let j=i+1;j<P.length&&P[j][0]!==9;j++){if((key==='$INSUNITS'&&P[j][0]===70)||(key==='$ACADVER'&&P[j][0]===1)){q=P[j];break}}
        if(q){if(key==='$INSUNITS')E.meta.insunits=Number(q[1]);if(key==='$ACADVER')E.meta.acadver=q[1]}
      }
    }else if(section==='TABLES'){
      if(c===0&&v==='TABLE'){table=P[i+1]?.[1]||'';i++}
      else if(c===0&&v==='ENDTAB'){table='';cur=null}
      else if(c===0&&v==='LAYER'&&table==='LAYER'){cur={name:'0',color:7}}
      else if(cur&&table==='LAYER'){
        if(c===2){if(E.layers.get('0')===cur&&cur.name==='0')E.layers.delete('0');cur.name=v;if(!E.layers.has(v))E.layers.set(v,cur)}
        else if(c===62)cur.color=Number(v);
        else if(c===70)cur.flags=Number(v);
      }
    }else if(section==='ENTITIES'){
      if(c===0){if(v==='EOF')break;cur={t:v,p:[]};E.push(cur)}
      else if(cur)cur.p.push([c,v]);
    }
  }
  if(!E.length)throw new Error('لم يتم العثور على عناصر في قسم ENTITIES');
  return E;
}
function dxfShapes(E,k){
  const out=[],lm=new Map(),skip={},BS=String.fromCharCode(92),COL={1:'#dc2626',2:'#ca8a04',3:'#16a34a',4:'#0d9488',5:'#2563eb',6:'#9333ea',8:'#6b7280',30:'#ea580c'};
  const compose=(A,B)=>({a:A.a*B.a+A.c*B.b,b:A.b*B.a+A.d*B.b,c:A.a*B.c+A.c*B.d,d:A.b*B.c+A.d*B.d,tx:A.a*B.tx+A.c*B.ty+A.tx,ty:A.b*B.tx+A.d*B.ty+A.ty});
  const identity={a:1,b:0,c:0,d:1,tx:0,ty:0};
  const expand=(list,matrix=identity,depth=0)=>{
    if(depth>8)return[];const result=[];
    for(const ent of list||[]){
      const get=(code,def=0)=>{const q=ent.p.find(z=>z[0]===code);return q?Number(q[1]):def};
      if(ent.t==='INSERT'){
        const name=String(ent.p.find(z=>z[0]===2)?.[1]||''),blk=E.blocks?.get(name);if(!blk){skip.INSERT=(skip.INSERT||0)+1;continue}
        const sx=get(41,1)||1,sy=get(42,sx)||sx,ang=get(50,0)*Math.PI/180,co=Math.cos(ang),si=Math.sin(ang),ix=get(10),iy=get(20);
        const local={a:sx*co,b:sx*si,c:-sy*si,d:sy*co,tx:ix-sx*co*blk.baseX+sy*si*blk.baseY,ty:iy-sx*si*blk.baseX-sy*co*blk.baseY};
        const rows=Math.max(1,Math.min(50,Math.round(get(71,1)))),cols=Math.max(1,Math.min(50,Math.round(get(70,1))));
        for(let rr=0;rr<rows;rr++)for(let cc=0;cc<cols;cc++){
          const offset={a:1,b:0,c:0,d:1,tx:cc*get(44,0),ty:rr*get(45,0)},nested=compose(matrix,compose(local,offset));
          result.push(...expand(blk.entities,nested,depth+1));
        }
      }else{
        const clone={t:ent.t,p:ent.p.map(q=>[q[0],q[1]])},vectors=ent.t==='ELLIPSE'?new Set([11]):new Set();
        for(let j=0;j<clone.p.length;j++){
          const [code,value]=clone.p[j];if(code<10||code>18)continue;const yc=code+10,yi=clone.p.findIndex(q=>q[0]===yc);if(yi<0)continue;
          const x=Number(value)||0,y=Number(clone.p[yi][1])||0,isVector=vectors.has(code),nx=matrix.a*x+matrix.c*y+(isVector?0:matrix.tx),ny=matrix.b*x+matrix.d*y+(isVector?0:matrix.ty);
          clone.p[j][1]=String(nx);clone.p[yi][1]=String(ny);
        }
        const scale=Math.sqrt(Math.abs(matrix.a*matrix.d-matrix.b*matrix.c));
        if(scale>0&&Number.isFinite(scale))clone.p=clone.p.map(([c,v])=>[c,(c===40||c===41||c===42)?String(Number(v)*scale):v]);
        const rot=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
        if(rot)clone.p=clone.p.map(([c,v])=>[c,(c===50||c===51)?String(Number(v)+rot):v]);
        result.push(clone);
      }
    }
    return result;
  };
  const source=expand(E);
  const layerColor=nm=>E.layers?.get(nm)?.color||7;
  const lay=nm=>{
    nm=String(nm||'0').slice(0,64);
    if(!lm.has(nm)){const ac=layerColor(nm);lm.set(nm,{id:uid(),name:nm,vis:ac<0?0:1,lock:0,col:COL[Math.abs(ac)]})}
    return lm.get(nm).id;
  };
  (E.layers||new Map()).forEach((v,nm)=>lay(nm));
  const g=(e,c,d)=>{const q=e.p.find(z=>z[0]===c);return q?q[1]:d};
  const all=(e,c)=>e.p.filter(z=>z[0]===c).map(z=>z[1]);
  const N=(e,c)=>{const v=Number.parseFloat(g(e,c,0));return Number.isFinite(v)?v:0};
  const X=v=>v*k,Y=v=>-v*k;
  const dec=s=>String(s??'').replace(/\\U\+([0-9A-Fa-f]{4})/g,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\P/g,' ').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/%%d/gi,'°').replace(/%%p/gi,'±').replace(/%%c/gi,'⌀');
  const mk=(o,e)=>{
    if(out.length>=30000)return;
    o.ly=lay(g(e,8,'0'));
    const raw=g(e,62,null);
    // لون الطبقة يبقى موروثًا من الطبقة؛ لا نحوله إلى لون مستقل للعنصر.
    if(raw!==null&&Number(raw)!==256){const c=COL[Math.abs(Number(raw))];if(c)o.col=c}
    o.lw=1.5;out.push(o);
  };
  const eq=(a,b)=>Math.abs(a-b)<1e-5;
  const sampleBulge=(a,b,bulge)=>{
    if(!bulge||Math.abs(bulge)<1e-9)return[[X(b[0]),Y(b[1])]];
    const dx=b[0]-a[0],dy=b[1]-a[1],ch=Math.hypot(dx,dy),theta=4*Math.atan(bulge);
    if(ch<1e-9)return[];
    const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],off=ch*(1-bulge*bulge)/(4*bulge),cx=mid[0]-dy/ch*off,cy=mid[1]+dx/ch*off;
    const aa=Math.atan2(a[1]-cy,a[0]-cx),r=Math.hypot(a[0]-cx,a[1]-cy),n=Math.max(2,Math.min(48,Math.ceil(Math.abs(theta)/(Math.PI/18)))),pts=[];
    for(let j=1;j<=n;j++){const t=aa+theta*j/n;pts.push([X(cx+r*Math.cos(t)),Y(cy+r*Math.sin(t))])}
    return pts;
  };
  const polyShape=(pts,closed,e)=>{
    if(pts.length<2)return;
    if(closed&&pts.length===4){
      const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
      if((eq(pts[0][0],pts[1][0])&&eq(pts[1][1],pts[2][1])&&eq(pts[2][0],pts[3][0])&&eq(pts[3][1],pts[0][1]))||(eq(pts[0][1],pts[1][1])&&eq(pts[1][0],pts[2][0])&&eq(pts[2][1],pts[3][1])&&eq(pts[3][0],pts[0][0]))){
        const x=Math.min(...xs),y=Math.min(...ys);mk({t:'rect',x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y},e);return;
      }
    }
    if(closed&&pts.length===3){mk({t:'tri',p:pts},e);return}
    if(!closed&&pts.length===2){mk({t:'line',a:pts[0],b:pts[1]},e);return}
    mk({t:closed?'polygon':'polyline',p:pts},e);
  };
  const arc=(cx,cy,r,a0,a1,e)=>{
    const start=-a1*Math.PI/180,end=-a0*Math.PI/180;
    let aEnd=end;while(aEnd<=start)aEnd+=Math.PI*2;
    mk({t:'arc',x:X(cx),y:Y(cy),r:Math.abs(X(r)),a0:start,a1:aEnd},e);
  };
  for(let i=0;i<source.length&&out.length<30000;i++){
    const e=source[i];
    if(e.t==='LINE')mk({t:'line',a:[X(N(e,10)),Y(N(e,20))],b:[X(N(e,11)),Y(N(e,21))]},e);
    else if(e.t==='CIRCLE')mk({t:'circle',x:X(N(e,10)),y:Y(N(e,20)),r:Math.abs(X(N(e,40)))},e);
    else if(e.t==='ARC')arc(N(e,10),N(e,20),Math.abs(N(e,40)),N(e,50),N(e,51),e);
    else if(e.t==='LWPOLYLINE'){
      const verts=[];let cur=null;
      e.p.forEach(([c,v])=>{
        if(c===10){if(cur)verts.push(cur);cur={x:Number(v)||0,y:0,b:0,hasY:false}}
        else if(c===20&&cur){cur.y=Number(v)||0;cur.hasY=true}
        else if(c===42&&cur)cur.b=Number(v)||0;
      });
      if(cur)verts.push(cur);
      const closed=(Number(g(e,70,0))&1)!==0,pts=[];
      for(let j=0;j<verts.length;j++){
        const a=verts[j],b=verts[(j+1)%verts.length];pts.push([X(a.x),Y(a.y)]);
        if((j<verts.length-1||closed)&&a.b)pts.push(...sampleBulge([a.x,a.y],[b.x,b.y],a.b));
      }
      polyShape(pts,closed,e);
    }
    else if(e.t==='POLYLINE'){
      const verts=[];let j=i+1;
      while(j<source.length&&source[j].t==='VERTEX'){verts.push({x:Number(g(source[j],10,0))||0,y:Number(g(source[j],20,0))||0,b:Number(g(source[j],42,0))||0});j++}
      if(j<source.length&&source[j].t==='SEQEND')j++;
      i=j-1;
      const closed=(Number(g(e,70,0))&1)!==0,pts=[];
      for(let q=0;q<verts.length;q++){const a=verts[q],b=verts[(q+1)%verts.length];pts.push([X(a.x),Y(a.y)]);if((q<verts.length-1||closed)&&a.b)pts.push(...sampleBulge([a.x,a.y],[b.x,b.y],a.b))}
      polyShape(pts,closed,e);
    }
    else if(e.t==='DIMENSION'){
      const kind=Number(g(e,70,0))&7;
      const has=[13,23,14,24,10,20].every(c=>g(e,c,null)!==null);
      if((kind===0||kind===1)&&has){
        const a=[X(N(e,13)),Y(N(e,23))],b=[X(N(e,14)),Y(N(e,24))],d=[X(N(e,10)),Y(N(e,20))],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
        if(L>1e-9){const off=((d[0]-a[0])*(-dy)+(d[1]-a[1])*dx)/L;mk({t:'dim',a,b,off},e)}
        else skip.DIMENSION=(skip.DIMENSION||0)+1;
      }else skip.DIMENSION=(skip.DIMENSION||0)+1;
    }
    else if(e.t==='TEXT'||e.t==='MTEXT'){
      const raw=e.t==='MTEXT'?[...all(e,3),...all(e,1)].join(''):g(e,1,'');
      const str=dec(raw).trim();if(!str)continue;
      const h=Math.abs(X(N(e,40)))||.3,a=-N(e,50)*Math.PI/180,w2=str.length*h*.55,u=[Math.cos(a),Math.sin(a)],dn=[-Math.sin(a),Math.cos(a)],ix=X(N(e,10)),iy=Y(N(e,20));
      mk({t:'text',x:ix+u[0]*w2/2-dn[0]*h*.35,y:iy+u[1]*w2/2-dn[1]*h*.35,h,a,txt:str},e);
    }
    else if(e.t==='SOLID'||e.t==='TRACE'||e.t==='3DFACE'){
      const p=[[X(N(e,10)),Y(N(e,20))],[X(N(e,11)),Y(N(e,21))],[X(N(e,12)),Y(N(e,22))],[X(N(e,13)),Y(N(e,23))]];
      if(eq(p[2][0],p[3][0])&&eq(p[2][1],p[3][1]))p.pop();
      polyShape(p,true,e);
    }
    else if(e.t==='HATCH'){
      let loops=[],loop=null,vertex=null,edgeStart=null;
      for(const [code,value] of e.p){
        if(code===92){loop={flags:Number(value)||0,closed:false,verts:[],edges:[]};loops.push(loop);vertex=null;edgeStart=null}
        else if(!loop)continue;
        else if(code===73)loop.closed=Number(value)!==0;
        else if(code===10){vertex={x:Number(value)||0,y:0,b:0};loop.verts.push(vertex)}
        else if(code===20&&vertex)vertex.y=Number(value)||0;
        else if(code===42&&vertex)vertex.b=Number(value)||0;
        else if(code===11)edgeStart={x:Number(value)||0,y:0};
        else if(code===21&&edgeStart)edgeStart.y=Number(value)||0;
        else if(code===12&&edgeStart){const end={x:Number(value)||0,y:0};loop.edges.push([edgeStart,end]);edgeStart=null}
        else if(code===22&&loop.edges.length){loop.edges[loop.edges.length-1][1].y=Number(value)||0}
      }
      for(const path of loops){
        if(path.verts.length>=2){const pts=[];for(let j=0;j<path.verts.length;j++){const a=path.verts[j],b=path.verts[(j+1)%path.verts.length];pts.push([X(a.x),Y(a.y)]);if((j<path.verts.length-1||path.closed)&&a.b)pts.push(...sampleBulge([a.x,a.y],[b.x,b.y],a.b))}polyShape(pts,path.closed,e)}
        else if(path.edges.length){const pts=[];path.edges.forEach((edge,j)=>{if(!j)pts.push([X(edge[0].x),Y(edge[0].y)]);pts.push([X(edge[1].x),Y(edge[1].y)])});polyShape(pts,path.closed,e)}
      }
    }
    else if(e.t==='ELLIPSE'){
      const cx=N(e,10),cy=N(e,20),mx=N(e,11),my=N(e,21),ratio=Math.abs(N(e,40)),a0=N(e,41),a1=N(e,42)||Math.PI*2,major=Math.hypot(mx,my);
      if(major>0&&ratio>0){let end=a1;if(end<=a0)end+=Math.PI*2;if(Math.abs((end-a0)-Math.PI*2)<1e-4){mk({t:'ellipse',x:X(cx),y:Y(cy),rx:Math.abs(X(major)),ry:Math.abs(X(major*ratio)),rot:Math.atan2(-my,mx)},e)}else{const count=Math.max(12,Math.min(144,Math.ceil((end-a0)*24))),p=[];for(let j=0;j<=count;j++){const t=a0+(end-a0)*j/count,xx=major*Math.cos(t),yy=major*ratio*Math.sin(t);const x=cx+xx*mx/major-yy*my/major,y=cy+xx*my/major+yy*mx/major;p.push([X(x),Y(y)])}polyShape(p,false,e)}}
    }
    else if(e.t==='SPLINE'){
      const xs=all(e,10).map(Number),ys=all(e,20).map(Number),p=[];for(let j=0;j<Math.min(xs.length,ys.length);j++)p.push([X(xs[j]),Y(ys[j])]);polyShape(p,(Number(g(e,70,0))&1)!==0,e);
    }
    else if(e.t!=='VERTEX'&&e.t!=='SEQEND'&&e.t!=='ENDSEC')skip[e.t]=(skip[e.t]||0)+1;
  }
  const LYs=[...lm.values()];if(!LYs.length)LYs.push({id:uid(),name:'طبقة 1',vis:1,lock:0});
  return{shapes:out,LY:LYs,skip,meta:E.meta||{}};
}
// ضبط مجال العرض بعد استيراد DXF: نعتمد حدود الهندسة ونستبعد النصوص
// من حساب التكبير حتى لا يبعد نص شارد المخطط عن الشاشة.
function fitImportedView(items){
  const geom=items.filter(s=>s.t!=='text'&&s.t!=='north');
  const use=geom.length?geom:items;
  if(!use.length)return;
  const B=use.map(bx),x0=Math.min(...B.map(b=>b.x)),x1=Math.max(...B.map(b=>b.X)),
    y0=Math.min(...B.map(b=>b.y)),y1=Math.max(...B.map(b=>b.Y));
  const cx=(x0+x1)/2,cy=(y0+y1)/2;
  const sw=Math.max(x1-x0,.5),sh=Math.max(y1-y0,.5);
  const aw=Math.max(120,W-100),ah=Math.max(120,H-100);
  V.s=clamp(Math.min(aw/sw,ah/sh),4,160);
  V.x=W/2-cx*V.s;
  V.y=H/2-cy*V.s;
}
function dxfImport(txt){
  const E=dxfEntities(txt),meta=E.meta||{},probe=dxfShapes(E,1);
  if(!probe.shapes.length){toast('لا توجد أشكال مدعومة في الملف');return}
  const R=probe.shapes.map(bx),ext=Math.max(Math.max(...R.map(q=>q.X))-Math.min(...R.map(q=>q.x)),Math.max(...R.map(q=>q.Y))-Math.min(...R.map(q=>q.y)));
  const units={1:.0254,2:.3048,4:.001,5:.01,6:1,7:1000,10:.9144,14:.1};
  const labels={1:'بوصة',2:'قدم',4:'مليمتر',5:'سنتيمتر',6:'متر',7:'كيلومتر',10:'ياردة',14:'ديسيمتر'};
  const hasUnit=Object.prototype.hasOwnProperty.call(units,meta.insunits);
  let u=hasUnit?units[meta.insunits]:(ext>3000?.001:ext>300?.01:1);
  const choices=[[1,'متر'],[.01,'سنتيمتر'],[.001,'مليمتر'],[.0254,'بوصة'],[.3048,'قدم'],[.9144,'ياردة'],[.1,'ديسيمتر'],[1000,'كيلومتر']];
  const sh=$('#sheet'),sk=Object.entries(probe.skip).map(([t,c])=>`${t}×${c}`).join(' ');
  sh.innerHTML='<b>استيراد DXF</b><div id="dxi" style="color:var(--dim);font-size:12px"></div><b>وحدة القياس في الملف</b><div class="chips" id="dxu">'+choices.map(([v,l])=>`<button class="chip${Math.abs(v-u)<1e-9?' on':''}" data-v="${v}">${l}</button>`).join('')+'</div><div class="row"><button class="fl" id="dxx">إلغاء</button><button class="fl" id="opk">استيراد</button></div>';
  const info=()=>{$('#dxi').textContent=`${probe.shapes.length} عنصر مدعوم · ${hasUnit?'الوحدة المعلنة في DXF: '+(labels[meta.insunits]||'غير شائعة'):'لم يحدد الملف وحدة القياس؛ تم تقديرها مبدئيًا'} · الحجم بعد التحويل ≈ ${f(ext*u)} م${sk?' · عناصر متجاهلة: '+sk:''}`};
  info();
  sh.querySelectorAll('#dxu .chip').forEach(b=>{b.onclick=()=>{u=+b.dataset.v;sh.querySelectorAll('#dxu .chip').forEach(x=>x.classList.toggle('on',x===b));info()}});
  $('#dxx').onclick=()=>{sh.classList.remove('on');upd()};
  $('#opk').onclick=()=>{const r=dxfShapes(E,u);sh.classList.remove('on');newP('DXF',r.shapes,{LY:r.LY,cl:r.LY[0].id});fitImportedView(r.shapes);save();draw();toast(`تم استيراد ${r.shapes.length} عنصرًا من DXF`)};
  sh.classList.add('on');$('#ctx').style.display='none';
}
async function cloudDb(){
  try{if(!window.claude)return null;const db=await claude.use('db'),us=await claude.use('user');if(!db||!us)return null;const id=await us.id();return id?{db,id}:null}catch(e){return null}
}
function cloudSoon(){if(!ST.cloud)return;clearTimeout(cloudT);cloudT=setTimeout(()=>cloudPush(false),5000)}
async function cloudPush(all){
  const c=await cloudDb();if(!c){toast('النسخ السحابي غير متاح هنا');return false}
  try{
    const col=c.db.collection('data/users/'+c.id),t=Date.now();
    for(const p of(all?PJ:PJ.filter(p=>p.id===pid))){
      const js=JSON.stringify(p.id===pid?{shapes,V,LY,cl}:(lsGet('p:'+p.id)||{shapes:[]}));
      if(js.length>240000){toast(`المشروع «${p.name}» كبير جدًا للنسخ السحابي`);continue}
      await col.doc('p_'+p.id).set({name:p.name,t,d:js});
    }
    await col.doc('meta').set({t,PJ,pid});
    cloudAt=t;ST.bk=t;lsSet('set',{S,D,ST});return true;
  }catch(e){toast('تعذّر النسخ السحابي');return false}
}
async function cloudList(){
  const c=await cloudDb();if(!c)return null;
  try{const s=await c.db.collection('data/users/'+c.id).get();return s.docs.filter(d=>d.id.startsWith('p_')).map(d=>({id:d.id,...d.data()}))}catch(e){return null}
}
async function cloudSheet(){
  const sh=$('#sheet');
  sh.innerHTML='<b>الاستعادة من السحابة</b><div class="pl" id="cld">جارٍ التحميل…</div><button id="ok">تم</button>';
  $('#ok').onclick=()=>{sh.classList.remove('on');upd()};sh.classList.add('on');$('#ctx').style.display='none';
  const rows=await cloudList(),box=$('#cld');box.textContent='';
  if(!rows){box.textContent='تعذّر الوصول إلى السحابة: سجّل الدخول وافتح الصفحة من claude.ai';return}
  if(!rows.length){box.textContent='لا توجد نسخ سحابية بعد';return}
  rows.sort((a,b)=>b.t-a.t).forEach(r=>{
    const b=document.createElement('button');b.className='pi';b.textContent=`${r.name} · ${new Date(r.t).toISOString().slice(0,16).replace('T',' ')}`;
    b.onclick=()=>{try{const d=JSON.parse(r.d);newP(`${r.name} (مستعاد)`,d.shapes||[],d.LY?{LY:d.LY,cl:d.cl}:null);sh.classList.remove('on');toast('تمت الاستعادة كمشروع جديد')}catch(e){toast('النسخة تالفة')}};
    box.append(b);
  });
}
async function allFile(){
  save();
  const projects=PJ.map(p=>({name:p.name,d:p.id===pid?{shapes,V,LY,cl}:(lsGet('p:'+p.id)||{shapes:[]})}));
  const r=await saveBlob('plan-backup-'+new Date().toISOString().slice(0,10)+'.json',new Blob([JSON.stringify({app:'plan-backup',v:1,projects})],{type:'application/json'}));
  if(r==='ok'){ST.bk=Date.now();save();toast('تم حفظ كل المشاريع');upd()}else if(r==='err')toast('الحفظ غير متاح هنا');
}
function settingsSheet(){
  const sh=$('#sheet');
  const chips=(id,items,cur)=>`<div class="chips" id="${id}">${items.map(([v,l])=>`<button class="chip${String(v)===String(cur)?' on':''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  sh.innerHTML='<b>الوحدات</b>'+chips('cu',[['m','متر'],['cm','سنتيمتر']],ST.unit)
    +'<b>حجم الشبكة والالتقاط</b>'+chips('cg',[[0,'تلقائي'],[.05,'5 سم'],[.1,'10 سم'],[.25,'25 سم'],[.5,'50 سم'],[1,'1 م']],ST.gs)
    +'<b>الإظهار</b><div class="chips" id="ct">'+[['grid','الشبكة'],['axes','المعلم والأصل'],['coord','الإحداثيات']].map(([k,l])=>`<button class="chip${ST[k]?' on':''}" data-k2="${k}">${l}</button>`).join('')+'</div>'
    +'<b>خصائص العرض</b><div class="chips"><button class="chip" id="showDims">إظهار الأبعاد</button><button class="chip" id="showAreas">إظهار المساحات</button></div>'
    +'<b>استيراد وتصدير</b><div class="chips"><button class="chip" id="pimport">استيراد مشروع / DXF</button><button class="chip" id="pexport">تصدير مشروع / DXF</button></div>'
    +'<b>النسخ الاحتياطي</b><div class="chips"><button class="chip'+(ST.cloud?' on':'')+'" id="ccl">نسخ سحابي تلقائي</button><button class="chip" id="cnow">احفظ الآن في السحابة</button><button class="chip" id="cres">استعادة من السحابة</button><button class="chip" id="call">كل المشاريع كملف</button></div><div id="cst" style="color:var(--dim);font-size:12px"></div><button id="ok">تم</button>';
  const pick=(id,fn)=>sh.querySelectorAll(`#${id} .chip`).forEach(b=>{b.onclick=()=>{fn(b.dataset.v);sh.querySelectorAll(`#${id} .chip`).forEach(x=>x.classList.toggle('on',x===b));save();upd();draw()}});
  pick('cu',v=>{ST.unit=v});pick('cg',v=>{ST.gs=+v});
  const syncView=()=>{$('#showDims').classList.toggle('on',!!ST.showDims);$('#showAreas').classList.toggle('on',!!ST.showAreas)};
  $('#showDims').onclick=()=>{ST.showDims=ST.showDims?0:1;save();syncView();draw()};
  $('#showAreas').onclick=()=>{ST.showAreas=ST.showAreas?0:1;save();syncView();draw()};
  syncView();
  $('#pimport').onclick=importChoice;$('#pexport').onclick=exportChoice;
  const cst=()=>{$('#cst').textContent=ST.cloud?`النسخ السحابي مفعّل${cloudAt?' · آخر نسخة '+new Date(cloudAt).toISOString().slice(11,16)+' UTC':''}`:ST.bk?`آخر نسخة احتياطية: ${new Date(ST.bk).toISOString().slice(0,10)}`:'لا توجد نسخة احتياطية بعد (نقطة على ⚙ تعني مضى أسبوع بلا نسخ)'};
  cst();
  $('#ccl').onclick=async e=>{
    const b=e.currentTarget;ST.cloud=ST.cloud?0:1;b.classList.toggle('on',!!ST.cloud);save();
    if(ST.cloud&&!(await cloudPush(true))){ST.cloud=0;b.classList.remove('on');save()}
    cst();upd();
  };
  $('#cnow').onclick=async()=>{toast((await cloudPush(true))?'تم الحفظ في السحابة':'تعذّر الحفظ');cst();upd()};
  $('#cres').onclick=()=>cloudSheet();
  $('#call').onclick=async()=>{await allFile();cst()};
  sh.querySelectorAll('#ct .chip').forEach(b=>{b.onclick=()=>{const k=b.dataset.k2;ST[k]=ST[k]?0:1;b.classList.toggle('on',!!ST[k]);save();draw()}});
  $('#ok').onclick=()=>{sh.classList.remove('on');upd()};
  sh.classList.add('on');$('#ctx').style.display='none';
}
function opSheet(title,fields,apply,extra){
  const sh=$('#sheet');
  sh.innerHTML=`<b>${title}</b>`+fields.map(x=>`<label>${x[1]}<input data-k="${x[0]}" dir="ltr" inputmode="decimal"></label>`).join('')+(extra||'')+'<div class="row"><button class="fl" id="opx">إلغاء</button><button class="fl" id="opk">تطبيق</button></div>';
  fields.forEach(x=>{sh.querySelector(`[data-k="${x[0]}"]`).value=x[2]});
  const val=k=>(k==='c'||k==='r'?num:nu)(sh.querySelector(`[data-k="${k}"]`).value);
  $('#opx').onclick=()=>{sh.classList.remove('on');upd()};
  $('#opk').onclick=()=>{apply(val,sh);sh.classList.remove('on');save();upd();draw()};
  sh.classList.add('on');$('#ctx').style.display='none';return sh;
}
function offS(s,d){
  const t=copy(s);
  if(s.t==='line'||s.t==='wall'){const L=len(s)||1,nx=-(s.b[1]-s.a[1])/L*d,ny=(s.b[0]-s.a[0])/L*d;t.a=[s.a[0]+nx,s.a[1]+ny];t.b=[s.b[0]+nx,s.b[1]+ny];return t}
  if(s.t==='rect'){const cx=s.x+s.w/2,cy=s.y+s.h/2,w=s.w+2*d,h=s.h+2*d;if(w<.05||h<.05)return null;t.w=w;t.h=h;t.x=cx-w/2;t.y=cy-h/2;return t}
  if(s.t==='circle'){const r=s.r+d;if(r<.05)return null;t.r=r;return t}
  if(s.t==='tri'){
    const[p0,p1,p2]=s.p,a=Math.hypot(p1[0]-p2[0],p1[1]-p2[1]),b=Math.hypot(p0[0]-p2[0],p0[1]-p2[1]),c=Math.hypot(p0[0]-p1[0],p0[1]-p1[1]),per=a+b+c;
    if(!per)return null;const I=[(a*p0[0]+b*p1[0]+c*p2[0])/per,(a*p0[1]+b*p1[1]+c*p2[1])/per],r=area(s)/(per/2),k=(r+d)/r;
    if(!(k>.05))return null;t.p=s.p.map(q=>[I[0]+(q[0]-I[0])*k,I[1]+(q[1]-I[1])*k]);return t;
  }
  return null;
}
function mirS(s,ax,c){
  const t=copy(s),mp=q=>ax==='v'?[2*c-q[0],q[1]]:[q[0],2*c-q[1]];
  if(s.t==='line'||s.t==='wall'||s.t==='dim'){t.a=mp(s.a);t.b=mp(s.b);if(s.t==='dim')t.off=-s.off}
  else if(s.p)t.p=s.p.map(mp);
  else if(s.t==='rect'||s.t==='furn'){const m=mp([s.x+s.w/2,s.y+s.h/2]);t.x=m[0]-s.w/2;t.y=m[1]-s.h/2;t.rot=-(s.rot||0)}
  else if(s.t==='door'||s.t==='win'){const m=mp([s.x,s.y]);t.x=m[0];t.y=m[1];t.a=ax==='v'?Math.PI-s.a:-s.a;if(s.t==='door')t.f=-s.f}
  else if(s.t==='arc'){const m=mp([s.x,s.y]);t.x=m[0];t.y=m[1];const fn=a=>ax==='v'?Math.PI-a:-a;t.a0=fn(s.a1);t.a1=fn(s.a0);while(t.a1<=t.a0)t.a1+=Math.PI*2}
  else{const m=mp([s.x,s.y]);t.x=m[0];t.y=m[1]}
  return t;
}
function mirrorSel(m){
  const R=sel.map(i=>bx(shapes[i])),x0=Math.min(...R.map(q=>q.x)),x1=Math.max(...R.map(q=>q.X)),y0=Math.min(...R.map(q=>q.y)),y1=Math.max(...R.map(q=>q.Y));
  const ax=m==='r'?['v',x1]:m==='l'?['v',x0]:m==='b'?['h',y1]:m==='t'?['h',y0]:m==='fv'?['v',(x0+x1)/2]:['h',(y0+y1)/2];
  snap();const out=sel.map(i=>mirS(shapes[i],ax[0],ax[1]));out.forEach(d=>{if(d.t==='dim'){delete d.la;delete d.lb}});
  if(m==='fv'||m==='fh')sel.forEach((i,k)=>{shapes[i]=out[k]});
  else{shapes.push(...out);sel=out.map((_,k)=>shapes.length-out.length+k)}
}
function opAction(a){
  $$('.gm').forEach(m=>m.classList.remove('on'));
  if(!sel.length){tool='select';upd();toast('حدّد أشكالًا أولًا ثم اختر الأداة');return}
  if(a==='offset'){
    const ts=sel.map(i=>shapes[i]).filter(s=>['line','wall','rect','circle','tri'].includes(s.t));
    if(!ts.length){toast('الإزاحة للخطوط والجدران والغرف والدوائر والمثلثات');return}
    opSheet('إزاحة',[['d','المسافة ('+uA()+')',fu(.5)]],val=>{
      const d=val('d');if(!d)return;const out=ts.map(s=>offS(s,d)).filter(Boolean);
      if(!out.length){toast('المسافة كبيرة جدًا');return}
      snap();shapes.push(...out);sel=out.map((_,k)=>shapes.length-out.length+k);
    },'<div style="color:var(--dim);font-size:12px">موجبة: للخارج (أو لليمين في الخط)، وسالبة: العكس</div>');
  }else if(a==='mirror'){
    const sh=opSheet('انعكاس',[],()=>{},'<div class="row"><button class="fl" data-m="r">نسخة لليمين</button><button class="fl" data-m="l">نسخة لليسار</button></div><div class="row"><button class="fl" data-m="b">نسخة للأسفل</button><button class="fl" data-m="t">نسخة للأعلى</button></div><div class="row"><button class="fl" data-m="fv">قلب أفقي</button><button class="fl" data-m="fh">قلب رأسي</button></div>');
    $('#opk').hidden=true;
    sh.querySelectorAll('[data-m]').forEach(b=>{b.onclick=()=>{mirrorSel(b.dataset.m);sh.classList.remove('on');save();upd();draw()}});
  }else if(a==='array'){
    const R=sel.map(i=>bx(shapes[i])),w=Math.max(...R.map(q=>q.X))-Math.min(...R.map(q=>q.x)),h=Math.max(...R.map(q=>q.Y))-Math.min(...R.map(q=>q.y));
    opSheet('نسخ متكرر',[['c','عدد الأعمدة (مع الأصل)',3],['r','عدد الصفوف (مع الأصل)',1],['dx','المسافة بين الأعمدة ('+uA()+')',fu(w)],['dy','المسافة بين الصفوف ('+uA()+')',fu(h)]],val=>{
      const c=Math.max(1,Math.round(val('c'))||1),r=Math.max(1,Math.round(val('r'))||1),dx=val('dx')||0,dy=val('dy')||0;
      if(c*r>200){toast('الحد الأقصى 200 نسخة');return}
      snap();const out=[];
      for(let i=0;i<r;i++)for(let j=0;j<c;j++){if(!i&&!j)continue;{const grp=sel.map(k=>{const s=shapes[k],t=copy(s);mv(t,s,j*dx,i*dy);return t});fixLinks(sel.map(k=>shapes[k]),grp);out.push(...grp)}}
      shapes.push(...out);sel=out.map((_,k)=>shapes.length-out.length+k);
    },'<div style="color:var(--dim);font-size:12px">الصفوف تنزل للأسفل، والمسافة تُقاس من بداية كل نسخة</div>');
  }
}
function trimAt(p){
  const i=hit(p[0],p[1]),s=shapes[i];
  if(!s||(s.t!=='line'&&s.t!=='wall')){toast('القص يعمل على الخطوط والجدران فقط');return}
  const A=s.a,B=s.b,dx=B[0]-A[0],dy=B[1]-A[1],L2=dx*dx+dy*dy,w=s2w(p[0],p[1]);if(!L2)return;
  const par=q=>((q[0]-A[0])*dx+(q[1]-A[1])*dy)/L2,t0=clamp(par(w),0,1),ts=[];
  shapes.forEach((o,k)=>{if(k===i||!shown(o))return;segs(o).forEach(e=>xSS([A,B],e).forEach(q=>ts.push(par(q))));if(o.t==='circle')xSC([A,B],o).forEach(q=>ts.push(par(q)))});
  const ok=ts.filter(t=>t>1e-6&&t<1-1e-6),prev=ok.filter(t=>t<t0).sort((x,y)=>y-x)[0],next=ok.filter(t=>t>t0).sort((x,y)=>x-y)[0];
  if(prev===undefined&&next===undefined){toast('لا يوجد ما يقطع هذا الخط');return}
  const P=t=>[A[0]+dx*t,A[1]+dy*t];snap();
  if(prev!==undefined&&next!==undefined){const t=copy(s);t.a=P(next);t.b=B.slice();s.b=P(prev);shapes.push(t)}
  else if(next!==undefined)s.a=P(next);
  else s.b=P(prev);
  sel=[];save();
}
function extendAt(p){
  const i=hit(p[0],p[1]),s=shapes[i];
  if(!s||(s.t!=='line'&&s.t!=='wall')){toast('التمديد يعمل على الخطوط والجدران فقط');return}
  const w=s2w(p[0],p[1]),da=Math.hypot(w[0]-s.a[0],w[1]-s.a[1]),db=Math.hypot(w[0]-s.b[0],w[1]-s.b[1]),end=da<db?'a':'b',P0=s[end==='a'?'b':'a'],P1=s[end];
  const dx=P1[0]-P0[0],dy=P1[1]-P0[1],L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,ray=[P1,[P1[0]+ux*1e4,P1[1]+uy*1e4]];
  let best=null,bt=1e9;
  shapes.forEach((o,k)=>{
    if(k===i||!shown(o))return;const ps=[];
    segs(o).forEach(e=>xSS(ray,e).forEach(q=>ps.push(q)));if(o.t==='circle')xSC(ray,o).forEach(q=>ps.push(q));
    ps.forEach(q=>{const t=(q[0]-P1[0])*ux+(q[1]-P1[1])*uy;if(t>1e-6&&t<bt){bt=t;best=q}});
  });
  if(!best){toast('لا يوجد ما يمدّ إليه');return}
  snap();s[end]=best;save();
}
const GROUPS=[['gdraw','رسم','<path d="M4 20l4-1 11-11-3-3L5 16z"/>',['line','wall','rect','circle','arc','ellipse','polygon','polyline','tri','free']],['gadd','إضافة','<circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/>',['door','win','text','north']],['gedit','تعديل','<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 7.5L20 18M8.5 16.5L20 6"/>',['trim','extend']]];
GROUPS.forEach(([id,label,icon,tools])=>{
  const gb=document.createElement('button'),menu=document.createElement('div');
  gb.dataset.g=id;gb.innerHTML=`<svg viewBox="0 0 24 24">${icon}</svg>${label}`;menu.className='gm';menu.id=id;
  $(`nav [data-t="${tools[0]}"]`).before(gb);
  tools.forEach(t=>menu.append($(`nav [data-t="${t}"]`)));
  $('main').append(menu);
});
[['offset','إزاحة','<path d="M4 8h16M4 16h16"/><path d="M12 8v8M9 13l3 3 3-3"/>'],['mirror','انعكاس','<path d="M12 3v18M7 7l-4 5 4 5zM17 7l4 5-4 5z"/>'],['array','تكرار','<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>']].forEach(([a,l,ic])=>{const b=document.createElement('button');b.dataset.a=a;b.innerHTML=`<svg viewBox="0 0 24 24">${ic}</svg>${l}`;b.onclick=()=>opAction(a);$('#gedit').append(b)});
const fm=document.createElement('div');fm.className='gm';fm.id='gfurn';
Object.keys(SYM).forEach(k=>{const b=document.createElement('button');b.dataset.fk=k;b.innerHTML=furnIcon(k)+SYM[k].n;b.onclick=()=>{furnKind=k;tool='furn';sel=[];hideDyn();closeDrawFlow();$$('.gm').forEach(m=>m.classList.remove('on'));upd();draw();startDrawFlow('furn')};fm.append(b)});
$('main').append(fm);
const fbtn=document.createElement('button');fbtn.dataset.g='gfurn';fbtn.innerHTML='<svg viewBox="0 0 24 24"><path d="M3 12V8a2 2 0 012-2h14a2 2 0 012 2v4M3 12h18v5H3zM5 17v2M19 17v2"/></svg>أثاث';$('#lyb').before(fbtn);
$$('[data-g]').forEach(b=>b.onclick=()=>{
  const m=$('#'+b.dataset.g),was=m.classList.contains('on');
  $$('.gm').forEach(x=>x.classList.remove('on'));$('#smenu').classList.remove('on');$('#sheet').classList.remove('on');
  if(!was)m.classList.add('on');upd();
});
// القيود: أفقي/رأسي (Ortho) أو زاوية كل 15° (Polar)، والالتقاط بالنقاط يتقدم عليهما
function constrain(a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1];
  if(S.ortho)return Math.abs(dx)>=Math.abs(dy)?[b[0],a[1]]:[a[0],b[1]];
  if(S.polar){const L=Math.hypot(dx,dy),st=Math.PI/4,t=Math.round(Math.atan2(dy,dx)/st)*st,l=S.grid?Math.round(L/step())*step():L;return[a[0]+l*Math.cos(t),a[1]+l*Math.sin(t)]}
  return b;
}
// الإدخال الرقمي الشامل: قيم هندسية مناسبة لكل نوع من عناصر الرسم
let dynS=null,dynFields=[];
function hideDyn(){dynS=null;dynFields=[];$('#dyn').classList.remove('on');$('#dynfields').innerHTML=''}
const deg=a=>a*180/Math.PI;
const rad=a=>a*Math.PI/180;
function dynAngle(dx,dy){let a=deg(Math.atan2(-dy,dx));return (a+360)%360}
function dynSpec(s){
  const b=bx(s),cx=(b.x+b.X)/2,cy=(b.y+b.Y)/2;
  if(s.t==='rect')return [['w','العرض',fu(s.w)],['h','الارتفاع',fu(s.h)],['ang','الزاوية °',f(deg(s.rot||0))]];
  if(s.t==='circle')return [['r','نصف القطر',fu(s.r)]];
  if(s.t==='line'||s.t==='wall'||s.t==='dim')return [['L','الطول',fu(len(s))],['ang','الزاوية °',f(dynAngle(s.b[0]-s.a[0],s.b[1]-s.a[1]))],...(s.t==='wall'?[['th','السماكة',fu(s.th)]]:[])];
  if(s.t==='arc')return [['r','نصف القطر',fu(s.r)],['a0','زاوية البداية °',f(deg(s.a0||0))],['a1','زاوية النهاية °',f(deg(s.a1||0))]];
  if(s.t==='ellipse')return [['rx','نصف المحور X',fu(s.rx)],['ry','نصف المحور Y',fu(s.ry)],['ang','زاوية الدوران °',f(deg(s.rot||0))]];
  if(s.t==='tri')return [['w','العرض',fu(b.X-b.x)],['h','الارتفاع',fu(b.Y-b.y)]];
  if(s.t==='polygon'){
    const p=s.p||[],n=p.length,c=p.reduce((a,q)=>[a[0]+q[0]/n,a[1]+q[1]/n],[0,0]),r=n?Math.hypot(p[0][0]-c[0],p[0][1]-c[1]):1;
    return [['r','نصف قطر المضلع',fu(r)],['sides','عدد الأضلاع',String(n)],['ang','زاوية البداية °',f(dynAngle(p[0][0]-c[0],p[0][1]-c[1]))]];
  }
  if(s.t==='polyline'||s.t==='free'){
    const p=s.p||[],n=p.length;if(n<2)return [];
    const a=p[n-2],z=p[n-1];return [['L','طول آخر مقطع',fu(Math.hypot(z[0]-a[0],z[1]-a[1]))],['ang','زاوية آخر مقطع °',f(dynAngle(z[0]-a[0],z[1]-a[1]))]];
  }
  if(s.t==='furn')return [['w','العرض',fu(s.w)],['h','الطول',fu(s.h)],['ang','زاوية الدوران °',f(deg(s.rot||0))]];
  if(s.t==='door'||s.t==='win')return [['w','العرض',fu(s.w)],['ang','زاوية العنصر °',f(deg(s.a||0))]];
  if(s.t==='text'||s.t==='north')return [['h','الحجم',fu(s.h)],['ang','زاوية الدوران °',f(deg(s.a||0))]];
  return [];
}
function showDyn(s){
  if(['furn','dim','door','win'].includes(s?.t)||!S.dyn||!s||!shapes.includes(s)){hideDyn();return}
  dynS=s;dynFields=dynSpec(s);const host=$('#dynfields');host.innerHTML='';
  dynFields.forEach(([k,label,value])=>{
    const wrap=document.createElement('label');wrap.className='df';
    const name=document.createElement('span');name.textContent=label;
    const input=document.createElement('input');input.dataset.dk=k;input.inputMode='decimal';input.dir='ltr';input.value=value;input.autocomplete='off';
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyDyn()}});
    wrap.append(name,input);host.append(wrap);
  });
  $('#dyn').classList.toggle('on',dynFields.length>0);
  if(!dynFields.length)hideDyn();
}
function applyDyn(){
  const s=dynS;if(!s||!shapes.includes(s)){hideDyn();return}
  const get=k=>{const el=$(`#dynfields [data-dk="${k}"]`);return el?num(el.value):NaN};
  const v=k=>{const n=get(k);return Number.isFinite(n)?n:NaN};
  const old=copy(s);snap();
  const angle=k=>{const n=v(k);return Number.isFinite(n)?rad(n):null};
  if(s.t==='rect'){
    const w=nu($('#dynfields [data-dk="w"]').value),h=nu($('#dynfields [data-dk="h"]').value),a=angle('ang');
    if(w>0)s.w=w;if(h>0)s.h=h;if(a!==null)s.rot=a;
  }else if(s.t==='circle'){const r=nu($('#dynfields [data-dk="r"]').value);if(r>0)s.r=r}
  else if(s.t==='line'||s.t==='wall'||s.t==='dim'){
    const L=nu($('#dynfields [data-dk="L"]').value),a=angle('ang'),d=len(s)||1;
    if(L>0||a!==null){const q=a===null?Math.atan2(-(s.b[1]-s.a[1]),s.b[0]-s.a[0]):a,l=L>0?L:d;s.b=[s.a[0]+l*Math.cos(q),s.a[1]-l*Math.sin(q)];if(s.t==='dim'){s.lb=undefined}}
    if(s.t==='wall'){const th=nu($('#dynfields [data-dk="th"]').value);if(th>0)s.th=th}
  }else if(s.t==='arc'){
    const r=nu($('#dynfields [data-dk="r"]').value),a0=angle('a0'),a1=angle('a1');if(r>0)s.r=r;if(a0!==null)s.a0=a0;if(a1!==null)s.a1=a1;while(s.a1<=s.a0)s.a1+=Math.PI*2;
  }else if(s.t==='ellipse'){
    const rx=nu($('#dynfields [data-dk="rx"]').value),ry=nu($('#dynfields [data-dk="ry"]').value),a=angle('ang');if(rx>0)s.rx=rx;if(ry>0)s.ry=ry;if(a!==null)s.rot=a;
  }else if(s.t==='tri'){
    const b=bx(old),w0=Math.max(.0001,b.X-b.x),h0=Math.max(.0001,b.Y-b.y),w=nu($('#dynfields [data-dk="w"]').value),h=nu($('#dynfields [data-dk="h"]').value);
    s.p=old.p.map(q=>[b.x+(q[0]-b.x)*(w>0?w/w0:1),b.y+(q[1]-b.y)*(h>0?h/h0:1)]);
  }else if(s.t==='polygon'){
    const p=old.p||[],n0=p.length,c=p.reduce((z,q)=>[z[0]+q[0]/n0,z[1]+q[1]/n0],[0,0]),r=nu($('#dynfields [data-dk="r"]').value),sides=Math.round(v('sides')),a=angle('ang');
    const radius=r>0?r:(n0?Math.hypot(p[0][0]-c[0],p[0][1]-c[1]):1),count=Number.isFinite(sides)?clamp(sides,3,32):n0,ang=a===null?(n0?Math.atan2(p[0][1]-c[1],p[0][0]-c[0]):0):-a;
    s.p=Array.from({length:count},(_,i)=>[c[0]+radius*Math.cos(ang+i*2*Math.PI/count),c[1]+radius*Math.sin(ang+i*2*Math.PI/count)]);
  }else if(s.t==='polyline'||s.t==='free'){
    const p=s.p||[],n=p.length;if(n>=2){const a=p[n-2],z=p[n-1],oldL=Math.hypot(z[0]-a[0],z[1]-a[1])||1,L=nu($('#dynfields [data-dk="L"]').value),ang=angle('ang'),q=ang===null?Math.atan2(-(z[1]-a[1]),z[0]-a[0]):ang,l=L>0?L:oldL;p[n-1]=[a[0]+l*Math.cos(q),a[1]-l*Math.sin(q)]}
  }else if(s.t==='furn'){
    const cx=s.x+s.w/2,cy=s.y+s.h/2,w=nu($('#dynfields [data-dk="w"]').value),h=nu($('#dynfields [data-dk="h"]').value),a=angle('ang');if(w>0){s.w=w;s.x=cx-w/2}if(h>0){s.h=h;s.y=cy-h/2}if(a!==null)s.rot=a;
  }else if(s.t==='door'||s.t==='win'){
    const w=nu($('#dynfields [data-dk="w"]').value),a=angle('ang');if(w>0)s.w=w;if(a!==null)s.a=a;
  }else if(s.t==='text'||s.t==='north'){
    const h=nu($('#dynfields [data-dk="h"]').value),a=angle('ang');if(h>0)s.h=h;if(a!==null)s.a=a;
  }
  save();upd();draw();showDyn(s);
}
$('#dok').onclick=applyDyn;$('#dx').onclick=hideDyn;
load();new ResizeObserver(resize).observe($('main'));resize();upd();

// تسجيل عامل الخدمة: يحفظ التطبيق للعمل بلا إنترنت بعد أول فتح
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
