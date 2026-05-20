type P={theme?:string;accent?:string;accentColor?:string;desktopTransparency?:string;accentTaskbar?:string;accentBorders?:string;taskbarSettings?:Record<string,unknown>;pinnedApps?:string[];recentAccents?:string[]};
type Session={user?:{uid?:string;displayName?:string|null;email?:string|null;username?:string|null}};
const GAS_URL=import.meta.env.VITE_GAS_WEB_APP_URL?.trim();
const SESSION_KEY="a3k64-login-session-v1";
const ACCENTS:Record<string,string>={blue:"#2563eb",violet:"#7c3aed",pink:"#db2777",green:"#059669",amber:"#d97706",red:"#dc2626"};
const THEME=new Set(["login-theme","login-theme-mode","desktop-theme","theme-mode","theme","app-theme","color-mode"]);
const ACCENT=new Set(["login-accent","login-accent-color","login-custom-accent","accent-color","accentColor","accent","desktop-accent","desktop-accent-color","theme-accent","custom-accent","customAccent","desktop-custom-accent"]);
let remote=false,loginTouched=false,lastAccount="",pending:P={},timer=0;
const nativeSet=Storage.prototype.setItem,nativeRemove=Storage.prototype.removeItem;
function text(v:unknown){return String(v??"").trim()}
function hex(v:string|null|undefined){return !!v&&/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())}
function theme(v:unknown){const x=text(v).toLowerCase();if(["light","sang","sáng"].includes(x))return"light";if(["dark","toi","tối"].includes(x))return"dark";if(["auto","system","he-thong","hệ thống","hethong"].includes(x))return"auto";return""}
function accent(v:unknown){const x=text(v).toLowerCase();if(x==="custom")return"custom";return ACCENTS[x]?x:""}
function accentFromColor(c:string){return Object.entries(ACCENTS).find(([,v])=>v.toLowerCase()===c.toLowerCase())?.[0]||"custom"}
function color(v:unknown,a?:string){const raw=text(v);if(hex(raw))return raw;return ACCENTS[accent(a)||"blue"]||ACCENTS.blue}
function json<T>(v:string|null,f:T):T{if(!v)return f;try{return JSON.parse(v)as T}catch{return f}}
function user(){return json<Session|null>(localStorage.getItem(SESSION_KEY),null)?.user||null}
function account(){const u=user();return text(u?.email||u?.username||u?.uid||u?.displayName)}
async function post(action:string,payload:unknown){if(!GAS_URL)return null;const r=await fetch(GAS_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action,payload}),redirect:"follow"});const t=await r.text(),j=t?JSON.parse(t):null;if(!r.ok||j?.ok===false||j?.data?.ok===false)throw new Error(j?.error||j?.data?.error||`GAS ${action} failed`);return j?.data||j}
async function fetchP(a:string){const d=await post("getPersonalization",{account:a});return(d?.settings||{})as P}
async function saveP(a:string,s:P){if(a&&Object.keys(s).length)await post("savePersonalization",{account:a,settings:s})}
function fire(){window.dispatchEvent(new Event("desktop-theme-change"));window.dispatchEvent(new Event("login-theme-change"));window.dispatchEvent(new Event("accent-change"));window.dispatchEvent(new Event("login-accent-change"));window.dispatchEvent(new Event("appearance-change"));window.dispatchEvent(new CustomEvent("taskbar-settings-change"))}
function applyTheme(v:unknown){const m=theme(v);if(!m)return;THEME.forEach(k=>nativeSet.call(localStorage,k,m))}
function applyAccent(a:unknown,c?:unknown){const ak=accent(a)||accentFromColor(text(c));const col=color(c,ak);nativeSet.call(localStorage,"desktop-accent",col);nativeSet.call(localStorage,"desktop-accent-color",col);nativeSet.call(localStorage,"login-accent",ak);nativeSet.call(localStorage,"login-accent-color",col);nativeSet.call(localStorage,"login-custom-accent",col);nativeSet.call(localStorage,"accent-color",col);nativeSet.call(localStorage,"accent",ak)}
function apply(s:P){remote=true;try{if(s.theme)applyTheme(s.theme);if(s.accent||s.accentColor)applyAccent(s.accent,s.accentColor);if(s.desktopTransparency)nativeSet.call(localStorage,"desktop-transparency",s.desktopTransparency);if(s.accentTaskbar)nativeSet.call(localStorage,"accent-taskbar",s.accentTaskbar);if(s.accentBorders)nativeSet.call(localStorage,"accent-borders",s.accentBorders);if(s.taskbarSettings)nativeSet.call(localStorage,"taskbar-settings",JSON.stringify(s.taskbarSettings));if(s.pinnedApps)nativeSet.call(localStorage,"pinned-apps",JSON.stringify(s.pinnedApps));if(s.recentAccents)nativeSet.call(localStorage,"recent-accents",JSON.stringify(s.recentAccents))}finally{remote=false}fire()}
function loginSnap():P{const t=theme(localStorage.getItem("login-theme")),a=accent(localStorage.getItem("login-accent"));return{...(t?{theme:t}:{}),...(a?{accent:a}:{})}}
function accentState():P{const a=accent(localStorage.getItem("login-accent"))||accent(localStorage.getItem("accent"));const c=color(localStorage.getItem("desktop-accent")||localStorage.getItem("desktop-accent-color")||localStorage.getItem("login-accent-color")||localStorage.getItem("login-custom-accent"),a);return{accent:a||accentFromColor(c),accentColor:c}}
function fromWrite(k:string,v:string):P|null{if(THEME.has(k)){const t=theme(v);return t?{theme:t}:null}if(ACCENT.has(k))return accentState();if(k==="desktop-transparency")return{desktopTransparency:v};if(k==="accent-taskbar")return{accentTaskbar:v};if(k==="accent-borders")return{accentBorders:v};if(k==="taskbar-settings")return{taskbarSettings:json<Record<string,unknown>>(v,{})};if(k==="pinned-apps")return{pinnedApps:json<string[]>(v,[])};if(k==="recent-accents")return{recentAccents:json<string[]>(v,[])};return null}
function queue(s:P|null){const a=account();if(!a||!s||remote)return;pending={...pending,...s};clearTimeout(timer);timer=window.setTimeout(()=>{const p=pending;pending={};void saveP(a,p).catch(e=>console.error("Không lưu được cá nhân hoá:",e))},450)}
async function sync(a:string){if(!a||a===lastAccount)return;lastAccount=a;try{if(loginTouched){await saveP(a,loginSnap());loginTouched=false}apply(await fetchP(a))}catch(e){console.error("Không đồng bộ được cá nhân hoá:",e)}}
Storage.prototype.setItem=function(k:string,v:string){nativeSet.call(this,k,v);if(this!==localStorage||remote)return;if(k===SESSION_KEY){const a=account();if(a)void sync(a);return}queue(fromWrite(k,v))};
Storage.prototype.removeItem=function(k:string){nativeRemove.call(this,k);if(this===localStorage&&k===SESSION_KEY)lastAccount=""};
window.addEventListener("click",e=>{const t=e.target as Element|null;if(t?.closest?.(".login-root .theme-toggle button,.login-root .accent-dot"))loginTouched=true},true);
const a=account();if(a)void sync(a);
