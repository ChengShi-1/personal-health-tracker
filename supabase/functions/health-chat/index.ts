const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const nullable=(type:string)=>({anyOf:[{type},{type:'null'}]});
const common={id:{type:'string'},date:{type:'string'},isEstimated:{type:'boolean'},estimationReason:nullable('string'),sourceText:{type:'string'},notes:nullable('string')};
const bodyParts=['Chest','Back','Shoulders','Biceps','Triceps','Core','Glutes','Quadriceps','Hamstrings','Calves','Full Body','Other'];
const schema={type:'object',additionalProperties:false,required:['reply','nutritionEntries','cardioEntries','strengthEntries','bodyMetricEntries'],properties:{
  reply:{type:'string'},
  nutritionEntries:{type:'array',items:{type:'object',additionalProperties:false,required:['id','date','time','mealType','foodName','quantity','unit','caloriesKcal','proteinG','carbsG','fatG','fiberG','isEstimated','estimationReason','sourceText','notes'],properties:{...common,time:nullable('string'),mealType:{enum:['breakfast','lunch','dinner','snack']},foodName:{type:'string'},quantity:nullable('number'),unit:nullable('string'),caloriesKcal:nullable('number'),proteinG:nullable('number'),carbsG:nullable('number'),fatG:nullable('number'),fiberG:nullable('number')}}},
  cardioEntries:{type:'array',items:{type:'object',additionalProperties:false,required:['id','date','activityType','activityName','durationMinutes','distanceKm','steps','caloriesBurnedKcal','intensity','isEstimated','estimationReason','sourceText','notes'],properties:{...common,activityType:{enum:['dance','walking','running','cycling','other']},activityName:{type:'string'},durationMinutes:nullable('number'),distanceKm:nullable('number'),steps:nullable('number'),caloriesBurnedKcal:nullable('number'),intensity:{anyOf:[{enum:['low','moderate','high']},{type:'null'}]}}}},
  strengthEntries:{type:'array',items:{type:'object',additionalProperties:false,required:['id','date','exerciseName','primaryBodyParts','secondaryBodyParts','sets','totalReps','weightKg','durationMinutes','isEstimated','estimationReason','sourceText','notes'],properties:{...common,exerciseName:{type:'string'},primaryBodyParts:{type:'array',items:{enum:bodyParts}},secondaryBodyParts:{type:'array',items:{enum:bodyParts}},sets:nullable('number'),totalReps:nullable('number'),weightKg:nullable('number'),durationMinutes:nullable('number')}}},
  bodyMetricEntries:{type:'array',items:{type:'object',additionalProperties:false,required:['id','date','weightKg','bodyFatPercentage','waistCm','hipCm','isEstimated','estimationReason','sourceText','notes'],properties:{...common,weightKg:nullable('number'),bodyFatPercentage:nullable('number'),waistCm:nullable('number'),hipCm:nullable('number')}}}
}};
const instructions=`你是个人健康记录助手。把用户信息提取成结构化记录，并用简洁中文回复。今天日期由请求提供，时区 America/New_York。规则：1. 不编造用户未提及的事实；可合理估算营养或运动消耗，但必须 isEstimated=true 并写明原因。2. 不确定值用 null。3. 食物按独立 item 拆分，不把“+”、逗号、顿号连接的多种食物放在同一条。4. 无氧训练按独立动作拆分。5. 数值四舍五入到整数，重量统一 kg。6. 餐次仅 breakfast/lunch/dinner/snack；正餐之间吃的归 snack。7. ID 使用日期、类别和稳定短随机后缀组合，避免重复。8. 只提取用户本条消息明确记录的数据；问题或计划不写入记录。9. 回复中说明提取了哪些记录，并提醒用户确认后才保存。`;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
function outputText(payload:any){if(typeof payload.output_text==='string')return payload.output_text;for(const item of payload.output||[])for(const content of item.content||[])if(content.type==='output_text'&&content.text)return content.text;return null}

declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};

async function jobRequest(supabaseUrl:string,serviceKey:string,path:string,init:RequestInit={}){
  return fetch(`${supabaseUrl}/rest/v1/${path}`,{
    ...init,
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',...(init.headers||{})},
  });
}

async function processJob(jobId:string,request:{message:string;history:any[];today:string},supabaseUrl:string,serviceKey:string,apiKey:string){
  try{
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'running',started_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    const input=[...(request.history||[]).slice(-8).map((x:any)=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content).slice(0,2000)})),{role:'user',content:`今天是 ${request.today}。用户输入：${request.message}`}];
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_MODEL')||'gpt-5.6-sol',instructions,input,text:{format:{type:'json_schema',name:'health_record_update',strict:true,schema}}})});
    const raw=await response.text();if(!raw.trim())throw new Error(`OpenAI API 返回空响应（HTTP ${response.status}）`);let payload;try{payload=JSON.parse(raw)}catch{throw new Error(`OpenAI API 返回非 JSON 内容（HTTP ${response.status}）`)}if(!response.ok)throw new Error(payload.error?.message||`OpenAI API ${response.status}`);
    const text=outputText(payload);if(!text)throw new Error('模型没有返回可解析内容');const result=JSON.parse(text);
    const saved=await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'completed',result,error:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    if(!saved.ok)throw new Error(`任务结果保存失败（HTTP ${saved.status}）`);
  }catch(error){
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:error instanceof Error?error.message:'请求失败',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  }
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const authorization=req.headers.get('Authorization');
  const supabaseUrl=Deno.env.get('SUPABASE_URL');
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!authorization||!supabaseUrl||!anonKey||!serviceKey)return json({error:'请先登录 Supabase'},401);
  const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{Authorization:authorization,apikey:anonKey}});
  if(!userResponse.ok)return json({error:'登录已失效，请重新登录'},401);
  const user=await userResponse.json();
  const apiKey=Deno.env.get('OPENAI_API_KEY');if(!apiKey)return json({error:'Supabase 尚未配置 OPENAI_API_KEY secret'},503);
  try{
    const body=await req.json();
    if(body.action==='status'){
      if(typeof body.jobId!=='string')return json({error:'缺少任务 ID'},400);
      const response=await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${encodeURIComponent(body.jobId)}&user_id=eq.${user.id}&select=id,status,result,error,created_at,updated_at`,{headers:{Accept:'application/vnd.pgrst.object+json'}});
      if(!response.ok)return json({error:response.status===406?'找不到该任务':'任务查询失败'},response.status===406?404:500);
      return json(await response.json());
    }
    const {message,history=[],today}=body;if(typeof message!=='string'||!message.trim())return json({error:'请输入健康记录'},400);
    const jobId=crypto.randomUUID();
    const request={message:message.trim(),history,today};
    const created=await jobRequest(supabaseUrl,serviceKey,'health_chat_jobs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:jobId,user_id:user.id,status:'queued',request})});
    if(!created.ok)throw new Error(`无法创建后台任务（HTTP ${created.status}）`);
    EdgeRuntime.waitUntil(processJob(jobId,request,supabaseUrl,serviceKey,apiKey));
    return json({jobId,status:'queued'},202);
  }catch(error){return json({error:error instanceof Error?error.message:'请求失败'},500)}
});
