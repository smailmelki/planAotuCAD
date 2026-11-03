// أدوات مساعدة مستقلة لا تعتمد على حالة التطبيق.
(function(global){
  'use strict';
  const formatNumber=n=>(Math.round(n*100)/100).toFixed(2).replace(/\\.?0+$/,'');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const parseNumber=v=>parseFloat(String(v).replace(/[٠-٩]/g,d=>d.charCodeAt(0)-1632).replace('٫','.').replace(',','.'));
  const segmentLength=s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]);
  global.PlanCADUtils=Object.freeze({formatNumber,clamp,parseNumber,segmentLength});
})(window);
