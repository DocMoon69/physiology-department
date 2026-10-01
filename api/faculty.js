const REPO=process.env.GITHUB_REPO||'DocMoon69/physiology-department';
const BRANCH=process.env.GITHUB_BRANCH||'main';
const DATA_PATH='data/faculty.json';

module.exports=async(req,res)=>{
  try{
    const raw='https://raw.githubusercontent.com/'+REPO+'/'+BRANCH+'/'+DATA_PATH+'?t='+Date.now();
    const r=await fetch(raw);
    if(!r.ok)throw new Error('Faculty data could not be loaded.');
    const data=await r.json();
    res.statusCode=200;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify(data));
  }catch(e){
    res.statusCode=500;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({error:e.message||'Server error'}));
  }
};
