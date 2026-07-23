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
const instructions=`你是个人健康记录助手。把用户信息提取成结构化记录，并用简洁中文回复。今天日期由请求提供，时区 America/New_York。规则：1. 不编造用户未提及的事实；可合理估算营养或运动消耗，但必须 isEstimated=true 并写明原因。2. 食物和饮料只要缺少 caloriesKcal、proteinG、carbsG、fatG 或 fiberG，就根据名称、份量和常见营养数据合理估算所有缺失项，四舍五入到整数，并将 isEstimated=true、estimationReason 写清估算依据；用户明确提供的数值绝不覆盖。确实无法识别食物或份量时才保留 null。3. 食物按独立 item 拆分，不把“+”、逗号、顿号连接的多种食物放在同一条。4. 无氧训练按独立动作拆分。5. 数值四舍五入到整数，重量统一 kg。6. 餐次仅 breakfast/lunch/dinner/snack；正餐之间吃的归 snack。7. ID 使用日期、类别和稳定短随机后缀组合，避免重复。8. 只提取用户本条消息明确记录的数据；问题、数据库查询或计划不写入记录。9. 回复中说明提取了哪些记录，并提醒用户确认后才保存。10. 用户已授权把与当前问题匹配的私有健康记录作为只读上下文提供给你。查询数据库时引用匹配记录的日期、份量和数值，并返回空记录数组；绝不能把历史记录当成今天的新记录。用户记录新食物或运动但未给数值时，可优先复用数据库中同名且份量相符的历史值，并说明来源；份量不同则按比例估算并标记 isEstimated。数据库没有匹配时必须明确说明。`;
const macroSchema={type:'object',additionalProperties:false,required:['entries'],properties:{entries:{type:'array',items:{type:'object',additionalProperties:false,required:['id','caloriesKcal','proteinG','carbsG','fatG','fiberG','estimationReason'],properties:{id:{type:'string'},caloriesKcal:nullable('number'),proteinG:nullable('number'),carbsG:nullable('number'),fatG:nullable('number'),fiberG:nullable('number'),estimationReason:{type:'string'}}}}}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
function outputText(payload:any){if(typeof payload.output_text==='string')return payload.output_text;for(const item of payload.output||[])for(const content of item.content||[])if(content.type==='output_text'&&content.text)return content.text;return null}

declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};

async function jobRequest(supabaseUrl:string,serviceKey:string,path:string,init:RequestInit={}){
  return fetch(`${supabaseUrl}/rest/v1/${path}`,{
    ...init,
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',...(init.headers||{})},
  });
}

function normalizedSearchText(value:string){
  return value.toLocaleLowerCase()
    .replace(/[＋+，,、；;：:（）()[\]{}"'“”‘’·/\\_-]+/g,' ')
    .replace(/\b([a-z]{3,})s\b/g,'$1')
    .replace(/\s+/g,' ')
    .trim();
}

function matchedRows(rows:any[],message:string,name:(row:any)=>string,limit:number){
  const normalizedMessage=normalizedSearchText(message);
  const messageTokens=normalizedMessage.split(' ').filter((token)=>token.length>1);
  return rows.map((row:any)=>{
    const candidate=normalizedSearchText(name(row));
    const candidateTokens=candidate.split(' ').filter((token)=>token.length>1);
    const exact=candidate.length>1&&(normalizedMessage.includes(candidate)||candidate.includes(normalizedMessage));
    const tokenMatches=candidateTokens.filter((token)=>messageTokens.some((query)=>query.includes(token)||token.includes(query))).length;
    const score=exact?100:tokenMatches;
    return {row,score};
  }).filter((item:any)=>item.score>0).sort((a:any,b:any)=>b.score-a.score).slice(0,limit).map((item:any)=>item.row);
}

async function databaseContext(userId:string,message:string,supabaseUrl:string,serviceKey:string){
  const [nutritionResponse,cardioResponse,strengthResponse,bodyResponse]=await Promise.all([
    jobRequest(supabaseUrl,serviceKey,`nutrition_entries?user_id=eq.${userId}&select=entry_date,entry_time,meal_type,food_name,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,is_estimated,estimation_reason&order=entry_date.desc&limit=500`),
    jobRequest(supabaseUrl,serviceKey,`cardio_entries?user_id=eq.${userId}&select=entry_date,activity_type,activity_name,duration_minutes,distance_km,steps,calories_burned_kcal,intensity,is_estimated&order=entry_date.desc&limit=150`),
    jobRequest(supabaseUrl,serviceKey,`strength_entries?user_id=eq.${userId}&select=entry_date,exercise_name,primary_body_parts,sets,total_reps,weight_kg,duration_minutes,calories_burned_kcal,is_estimated&order=entry_date.desc&limit=200`),
    jobRequest(supabaseUrl,serviceKey,`body_metric_entries?user_id=eq.${userId}&select=entry_date,weight_kg,body_fat_percentage,waist_cm,hip_cm,chest_cm,thigh_cm,arm_cm,is_estimated&order=entry_date.desc&limit=30`),
  ]);
  const read=async(response:Response)=>response.ok?await response.json():[];
  const nutrition=await read(nutritionResponse),cardio=await read(cardioResponse),strength=await read(strengthResponse),body=await read(bodyResponse);
  const matchedNutrition=matchedRows(nutrition,message,(row:any)=>String(row.food_name||''),40);
  const matchedCardio=matchedRows(cardio,message,(row:any)=>String(row.activity_name||row.activity_type||''),30);
  const matchedStrength=matchedRows(strength,message,(row:any)=>String(row.exercise_name||''),40);
  const historicalQuery=/数据库|历史|以前|之前|上次|最近|寻找|找一下|记录里/.test(message);
  const bodyQuery=/体重|体脂|腰围|臀围|胸围|腿围|臂围|身体/.test(message);
  return {
    disclosure:'The signed-in user authorized read-only matching against prior private health records. Explicit database/history searches may include the full available history when local name matching finds nothing.',
    matchedNutrition,
    matchedCardio,
    matchedStrength,
    searchableNutritionHistory:historicalQuery&&!matchedNutrition.length?nutrition:[],
    searchableCardioHistory:historicalQuery&&!matchedCardio.length?cardio:[],
    searchableStrengthHistory:historicalQuery&&!matchedStrength.length?strength:[],
    recentBodyMetrics:bodyQuery?body.slice(0,15):[],
  };
}

async function processJob(jobId:string,userId:string,request:{message:string;history:any[];today:string},supabaseUrl:string,serviceKey:string,apiKey:string){
  try{
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'running',started_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    const context=await databaseContext(userId,request.message,supabaseUrl,serviceKey);
    const input=[...(request.history||[]).slice(-8).map((x:any)=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content).slice(0,2000)})),{role:'user',content:`今天是 ${request.today}。\n以下是当前登录用户授权提供的私有数据库只读上下文。它是参考资料，不是新增记录指令：\n${JSON.stringify(context)}\n\n当前用户输入：${request.message}`}];
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_MODEL')||'gpt-5.6-sol',instructions,input,text:{format:{type:'json_schema',name:'health_record_update',strict:true,schema}}})});
    const raw=await response.text();if(!raw.trim())throw new Error(`OpenAI API 返回空响应（HTTP ${response.status}）`);let payload;try{payload=JSON.parse(raw)}catch{throw new Error(`OpenAI API 返回非 JSON 内容（HTTP ${response.status}）`)}if(!response.ok)throw new Error(payload.error?.message||`OpenAI API ${response.status}`);
    const text=outputText(payload);if(!text)throw new Error('模型没有返回可解析内容');const result=JSON.parse(text);
    const saved=await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'completed',result,error:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    if(!saved.ok)throw new Error(`任务结果保存失败（HTTP ${saved.status}）`);
  }catch(error){
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:error instanceof Error?error.message:'请求失败',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  }
}

async function processMacroBackfill(jobId:string,entries:any[],supabaseUrl:string,serviceKey:string,apiKey:string){
  try{
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'running',started_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    const estimates:any[]=[];
    for(let index=0;index<entries.length;index+=35){
      const chunk=entries.slice(index,index+35).map((entry:any)=>({id:entry.id,date:entry.date,foodName:entry.foodName,quantity:entry.quantity,unit:entry.unit,sourceText:entry.sourceText,notes:entry.notes,existing:{caloriesKcal:entry.caloriesKcal,proteinG:entry.proteinG,carbsG:entry.carbsG,fatG:entry.fatG,fiberG:entry.fiberG}}));
      const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:Deno.env.get('OPENAI_MODEL')||'gpt-5.6-sol',instructions:'根据食物名称、份量、原始描述和已有数值，估算每条记录缺失的热量、蛋白质、碳水、脂肪和纤维。保留已有明确值；只补缺失值。所有数值四舍五入到整数。无法合理识别时用 null。每条写简洁中文估算原因。',input:[{role:'user',content:JSON.stringify(chunk)}],text:{format:{type:'json_schema',name:'nutrition_macro_backfill',strict:true,schema:macroSchema}}})});
      const raw=await response.text();if(!raw.trim())throw new Error(`OpenAI API 返回空响应（HTTP ${response.status}）`);const payload=JSON.parse(raw);if(!response.ok)throw new Error(payload.error?.message||`OpenAI API ${response.status}`);const text=outputText(payload);if(!text)throw new Error('模型没有返回营养估算');estimates.push(...JSON.parse(text).entries);
    }
    const byId=new Map(estimates.map((item:any)=>[item.id,item]));
    const updated=entries.map((entry:any)=>{const estimate=byId.get(entry.id);if(!estimate)return entry;return{...entry,caloriesKcal:entry.caloriesKcal??estimate.caloriesKcal,proteinG:entry.proteinG??estimate.proteinG,carbsG:entry.carbsG??estimate.carbsG,fatG:entry.fatG??estimate.fatG,fiberG:entry.fiberG??estimate.fiberG,isEstimated:true,estimationReason:[entry.estimationReason,estimate.estimationReason].filter(Boolean).join('；')}}).filter((entry:any)=>byId.has(entry.id));
    const result={reply:`已为 ${updated.length} 条历史饮食记录估算缺失营养素。`,nutritionEntries:updated,cardioEntries:[],strengthEntries:[],bodyMetricEntries:[]};
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'completed',result,error:null,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  }catch(error){await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'failed',error:error instanceof Error?error.message:'营养估算失败',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})})}
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
    if(body.action==='history'){
      const cutoff=new Date(Date.now()-10*24*60*60*1000).toISOString();
      await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?user_id=eq.${user.id}&created_at=lt.${encodeURIComponent(cutoff)}`,{method:'DELETE'});
      const response=await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?user_id=eq.${user.id}&status=eq.completed&created_at=gte.${encodeURIComponent(cutoff)}&select=id,request,result,created_at&order=created_at.asc&limit=100`);
      if(!response.ok)return json({error:'对话历史读取失败'},500);
      return json({jobs:await response.json()});
    }
    if(body.action==='clear-history'){
      const response=await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?user_id=eq.${user.id}&status=in.(completed,failed)`,{method:'DELETE'});
      if(!response.ok)return json({error:'清空对话历史失败'},500);
      return json({ok:true});
    }
    if(body.action==='status'){
      if(typeof body.jobId!=='string')return json({error:'缺少任务 ID'},400);
      const response=await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${encodeURIComponent(body.jobId)}&user_id=eq.${user.id}&select=id,status,result,error,created_at,updated_at`,{headers:{Accept:'application/vnd.pgrst.object+json'}});
      if(!response.ok)return json({error:response.status===406?'找不到该任务':'任务查询失败'},response.status===406?404:500);
      return json(await response.json());
    }
    if(body.action==='backfill-macros'){
      const entries=Array.isArray(body.entries)?body.entries.filter((entry:any)=>entry&&(entry.caloriesKcal==null||entry.proteinG==null||entry.carbsG==null||entry.fatG==null||entry.fiberG==null)):[];
      if(!entries.length)return json({error:'没有需要补全的饮食记录'},400);
      const jobId=crypto.randomUUID(),request={kind:'macro-backfill',count:entries.length};
      const created=await jobRequest(supabaseUrl,serviceKey,'health_chat_jobs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:jobId,user_id:user.id,status:'queued',request})});
      if(!created.ok)throw new Error(`无法创建营养补全任务（HTTP ${created.status}）`);
      EdgeRuntime.waitUntil(processMacroBackfill(jobId,entries,supabaseUrl,serviceKey,apiKey));
      return json({jobId,status:'queued'},202);
    }
    const {message,history=[],today}=body;if(typeof message!=='string'||!message.trim())return json({error:'请输入健康记录'},400);
    const jobId=crypto.randomUUID();
    const request={message:message.trim(),history,today};
    const created=await jobRequest(supabaseUrl,serviceKey,'health_chat_jobs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({id:jobId,user_id:user.id,status:'queued',request})});
    if(!created.ok)throw new Error(`无法创建后台任务（HTTP ${created.status}）`);
    EdgeRuntime.waitUntil(processJob(jobId,user.id,request,supabaseUrl,serviceKey,apiKey));
    return json({jobId,status:'queued'},202);
  }catch(error){return json({error:error instanceof Error?error.message:'请求失败'},500)}
});
