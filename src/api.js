const API_BASE = import.meta.env.VITE_API_URL || '';
let token = localStorage.getItem('zyvorax-token') || '';
export const session = { get token(){return token}, set token(v){token=v||''; if(token)localStorage.setItem('zyvorax-token',token); else localStorage.removeItem('zyvorax-token')} };
export async function api(path, options={}) {
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  const res=await fetch(`${API_BASE}${path}`,{...options,headers});
  if(res.status===204)return null;
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
