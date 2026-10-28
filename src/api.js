const API_BASE = import.meta.env.VITE_API_URL || '';
// Authentication is intentionally tab-scoped: each browser tab gets its own
// Team ZyvoraX account session, so opening another tab can use another account.
// Do not persist the bearer token in localStorage because that would be shared
// by every tab of this origin.
const storage = typeof window !== 'undefined' ? window.sessionStorage : null;
let token = storage?.getItem('zyvorax-session-token') || '';
if (typeof window !== 'undefined') window.localStorage.removeItem('zyvorax-token');
export const session = { get token(){return token}, set token(v){token=v||''; if(token)storage?.setItem('zyvorax-session-token',token); else storage?.removeItem('zyvorax-session-token')} };
export async function api(path, options={}) {
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`${API_BASE}${path}`,{...options,headers});
  if(res.status===204)return null;
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
