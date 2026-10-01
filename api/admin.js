const crypto=require('crypto');
const REPO=process.env.GITHUB_REPO||'DocMoon69/physiology-department';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const TOKEN=process.env.GITHUB_TOKEN;
const PASSWORD=process.env.ADMIN_PASSWORD;
const SECRET=process.env.SESSION_SECRET||'change-this-secret';
const DATA_PATH='data/faculty.json';
function b64(s){return Buffer.from(s).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function sign(v){return crypto.createHmac('sha256',SECRET).update(v).digest('base64url')}
function makeSession(){const payload=b64(JSON.stringify({exp:Date.now()+8*60*60*1000}));return payload+'.'+sign(payload)}
function validSession(req){const c=req.headers.cookie||'';const m=c.match(/(?:^|; )physio_admin=([^;]+)/);if(!m)return false;const [p,s]=m[1].split('.');if(!p||!s)return false;const a=Buffer.from(s),b=Buffer.from(sign(p));if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return false;try{return JSON.parse(Buffer.from(p,'base64url').toString()).exp>Date.now()}catch{return false}}
function cookie(v,max=28800){return `physio_admin=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`}
async function gh(path,options={}){if(!TOKEN)throw new Error('GITHUB_TOKEN is not configured in Vercel.');const r=await fetch('https://api.github.com/repos/'+REPO+'/contents/'+path,{...options,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+TOKEN,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.message||'GitHub request failed');return d}
async function getData(){const raw='https://raw.githubusercontent.com/'+REPO+'/'+BRANCH+'/'+DATA_PATH+'?t='+Date.now();const r=await fetch(raw);if(!r.ok)throw new Error('Faculty data could not be loaded.');return r.json()}
async function putFile(path,content,message,sha){const body={message,content:Buffer.from(content).toString('base64'),branch:BRANCH};if(sha)body.sha=sha;return gh(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
function json(res,status,data,extra={}){res.statusCode=status;for(const [k,v] of Object.entries(extra))res.setHeader(k,v);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
module.exports=async(req,res)=>{
 try{
  const action=new URL(req.url,'http://localhost').searchParams.get('action')||'list';
  if(action==='login'){if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});let body='';for await(const c of req)body+=c;const {password}=JSON.parse(body||'{}');if(!PASSWORD||password!==PASSWORD)return json(res,401,{error:'Incorrect password.'});return json(res,200,{ok:true},{'Set-Cookie':cookie(makeSession())})}
  if(action==='logout')return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
  if(action==='session')return json(res,200,{authenticated:validSession(req)});
  if(action==='faculty')return json(res,200,await getData());
  if(!validSession(req))return json(res,401,{error:'Please log in again.'});
  if(action==='list')return json(res,200,await getData());
  let body='';for await(const c of req)body+=c;const input=JSON.parse(body||'{}');let data=await getData();
  if(action==='save'){
    if(!input.name)return json(res,400,{error:'Faculty name is required.'});
    const clean={id:String(input.id||'').trim(),name:String(input.name).trim(),role:String(input.role||'FACULTY').trim(),designation:String(input.designation||'').trim(),qualification:String(input.qualification||'').trim(),about:String(input.about||'').trim(),research:String(input.research||'').trim(),email:String(input.email||'').trim(),photo:String(input.photo||'').trim()};
    if(!clean.id)return json(res,400,{error:'Faculty ID is required.'});
    if(clean.photo.startsWith('data:')){
      const m=clean.photo.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);if(!m)return json(res,400,{error:'Unsupported image format.'});
      const ext=m[1].split('/')[1].replace('jpeg','jpg');const path='images/faculty/'+clean.id+'.'+ext;let sha=null;try{sha=(await gh(path)).sha}catch{}
      await gh(path,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Update faculty photo: '+clean.name,content:m[2],branch:BRANCH,...(sha?{sha}:{})})});
      clean.photo='/'+path;
    }
    const idx=data.faculty.findIndex(f=>f.id===clean.id);if(idx>=0)data.faculty[idx]=clean;else data.faculty.push(clean);
    const existing=await gh(DATA_PATH);await putFile(DATA_PATH,JSON.stringify(data,null,2)+'\n','Update faculty profile: '+clean.name,existing.sha);
    return json(res,200,data);
  }
  if(action==='delete'){
    const id=String(input.id||'');const found=data.faculty.find(f=>f.id===id);if(!found)return json(res,404,{error:'Faculty not found.'});
    data.faculty=data.faculty.filter(f=>f.id!==id);const existing=await gh(DATA_PATH);await putFile(DATA_PATH,JSON.stringify(data,null,2)+'\n','Delete faculty profile: '+found.name,existing.sha);return json(res,200,data);
  }
  return json(res,404,{error:'Unknown action.'});
 }catch(e){return json(res,500,{error:e.message||'Server error'})}
};
