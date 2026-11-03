// دوال هندسية نقية: لا تقرأ أو تعدّل حالة التطبيق.
(function(global){
  'use strict';
  const arcPoints=s=>{const n=Math.max(2,Math.min(144,Math.ceil(Math.abs(s.a1-s.a0)/(Math.PI/36))));return Array.from({length:n+1},(_,i)=>{const a=s.a0+(s.a1-s.a0)*i/n;return[s.x+s.r*Math.cos(a),s.y+s.r*Math.sin(a)]})};
  const ellipsePoints=s=>Array.from({length:72},(_,i)=>{const a=i*Math.PI/36,c=Math.cos(s.rot||0),n=Math.sin(s.rot||0),x=s.rx*Math.cos(a),y=s.ry*Math.sin(a);return[s.x+x*c-y*n,s.y+x*n+y*c]});
  const rectanglePoints=s=>{const cx=s.x+s.w/2,cy=s.y+s.h/2,c=Math.cos(s.rot||0),n=Math.sin(s.rot||0);return[[-s.w/2,-s.h/2],[s.w/2,-s.h/2],[s.w/2,s.h/2],[-s.w/2,s.h/2]].map(q=>[cx+q[0]*c-q[1]*n,cy+q[0]*n+q[1]*c])};
  const rotatePoint=(q,c,a)=>{const co=Math.cos(a),si=Math.sin(a),dx=q[0]-c[0],dy=q[1]-c[1];return[c[0]+dx*co-dy*si,c[1]+dx*si+dy*co]};
  global.PlanCADGeometry=Object.freeze({arcPoints,ellipsePoints,rectanglePoints,rotatePoint});
})(window);
