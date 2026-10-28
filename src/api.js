const API_BASE = import.meta.env.VITE_API_URL || '';
// Authentication is held in an HttpOnly server cookie, never in browser storage.
export const session = { get token(){return ''}, set token(_value){} };
export async function api(path, options={}) {
  const headers={'Content-Type':'application/json',...(options.headers||{})};
  const res=await fetch(`${API_BASE}${path}`,{...options,headers,credentials:'include'});
  if(res.status===204)return null;
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
