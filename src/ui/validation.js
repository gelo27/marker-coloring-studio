import {IMP} from '../core/settings.js';
import {plan} from '../core/plan.js';
import {art,pageArea,seg,zones} from '../core/zones.js';
export function validateRender(){
  const errors=[],warnings=[],issue=(type,message,ids)=>({type,message,ids:ids||[]});
  if(!art||!seg){errors.push(issue('error','Не завантажено розмальовку або ще не побудовано карту зон.'));return{errors,warnings}}
  if(!zones.length){errors.push(issue('error','Не знайдено жодної зони для зафарбовування.'));return{errors,warnings}}
  const validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
  const missing=zones.filter(z=>!z.skip&&!validColor(z.color));
  if(missing.length)errors.push(issue('error',missing.length+' зон мають некоректний або відсутній колір.',missing.slice(0,12).map(z=>z.i)));
  const paintable=zones.filter(z=>!z.r.isBg&&!z.skip),skipped=zones.filter(z=>!z.r.isBg&&z.skip);
  if(!paintable.length)errors.push(issue('error','Усі зони пропущені — відео не матиме процесу зафарбовування.'));
  else if(skipped.length)warnings.push(issue('warning',skipped.length+' зон позначено «Не зафарбовувати». Вони залишаться білими.',skipped.slice(0,12).map(z=>z.i)));
  const area=pageArea(),suspicious=zones.filter(z=>!z.r.isBg&&z.r.area>area*.22);
  suspicious.forEach(z=>warnings.push(issue('warning','Зона #'+z.i+' займає '+Math.round(z.r.area/area*100)+'% сторінки. Можливо, контур має розрив і кілька ділянок злилися.',[z.i])));
  const minArea=(IMP.minArea||95)*4,tiny=seg.regs.filter(r=>r.area<minArea&&r.area>16&&!r.edge).length;
  if(tiny)warnings.push(issue('warning',tiny+' дрібних ділянок не стали окремими зонами й можуть залишитися білими.'));
  if(zones.length<4)warnings.push(issue('warning','Знайдено лише '+zones.length+' зон. Перевірте, чи не пропущені важливі ділянки малюнка.'));
  if(!plan||!Number.isFinite(plan.total)||plan.total<=0)errors.push(issue('error','Не вдалося побудувати план анімації. Перевірте зони та порядок замальовування.'));
  return{errors,warnings};
}
