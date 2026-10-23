/* ================= ADDONS =================
   An addon is a manifest plus hooks into the engine:
     { id, name, desc,
       settings: [{k, label, type:'range'|'choice'|'bool', def, min, max, step, options:[[value,label,swatch?]]}],
       thumb(size) → data URL for its tile,
       hooks: { render(cfg, frame), hide(cfg) } }
   Rule for every hook: what it shows must be a pure function of time (seeded randomness only, or tables rebuilt from
   the plan), because seeking, the zone timeline and frame-by-frame export jump to any moment. */
export const ADDONS=[];
export const ADD={on:{},cfg:{}};
const defaults=a=>Object.fromEntries((a.settings||[]).map(s=>[s.k,s.def]));
export function registerAddon(a){ADDONS.push(a);ADD.cfg[a.id]=Object.assign(defaults(a),ADD.cfg[a.id])}
export function addonById(id){return ADDONS.find(a=>a.id===id)}
export function addonOn(id){return !!ADD.on[id]}
export function setAddonOn(id,on){ADD.on[id]=!!on}
export function setAddonCfg(id,k,v){ADD.cfg[id]=Object.assign({},ADD.cfg[id],{[k]:v})}
/* runs a hook of every enabled addon (disabled ones get 'hide' so they can take their sprites off the stage) */
export function runHook(name,...args){for(const a of ADDONS){const h=a.hooks&&a.hooks[ADD.on[a.id]?name:'hide'];if(h)h(ADD.cfg[a.id],...args)}}
export function addonsState(){return JSON.parse(JSON.stringify(ADD))}
export function applyAddonsState(d){ADD.on=Object.assign({},d&&d.on);ADDONS.forEach(a=>{ADD.cfg[a.id]=Object.assign(defaults(a),d&&d.cfg&&d.cfg[a.id])})}
/* how many painters work and how: an enabled addon may say (e.g. several cats); otherwise one */
export function painters(){for(const a of ADDONS)if(ADD.on[a.id]&&a.painters){const p=a.painters(ADD.cfg[a.id]);if(p)return p}return{n:1,mode:'solo'}}
/* camera framing an addon asks for at plan time c ([x,y,zoom] in page space), e.g. the cat close-up */
export function addonFocus(c){for(const a of ADDONS)if(ADD.on[a.id]&&a.focus){const f=a.focus(ADD.cfg[a.id],c);if(f)return f}return null}
export function addonHasFocus(){return ADDONS.some(a=>ADD.on[a.id]&&a.focus)}
/* lets enabled addons load what they need before the soundtrack is built (samples and the like) */
export async function prepareAddons(){for(const a of ADDONS)if(ADD.on[a.id]&&a.prepare){try{await a.prepare(ADD.cfg[a.id])}catch(e){/* the addon falls back to its own synthesis */}}}
/* spatial audio an enabled addon offers: (x,y,c) -> {pan, gain, lp} for a sound at page point (x,y) at plan time c */
export function addonSpatial(){for(const a of ADDONS)if(ADD.on[a.id]&&a.spatial){const f=a.spatial(ADD.cfg[a.id]);if(f)return f}return null}
