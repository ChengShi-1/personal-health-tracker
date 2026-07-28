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
const instructions=`你是个人健康记录助手。把用户信息提取成结构化记录，并用简洁中文回复。今天日期由请求提供，时区 America/New_York。规则：1. 不编造用户未提及的事实；可合理估算营养或运动消耗，但必须 isEstimated=true 并写明原因。2. 食物和饮料只要缺少 caloriesKcal、proteinG、carbsG、fatG 或 fiberG，就根据名称、份量和常见营养数据合理估算所有缺失项，四舍五入到整数，并将 isEstimated=true、estimationReason 写清估算依据；用户明确提供的数值绝不覆盖。确实无法识别食物或份量时才保留 null。3. 食物按独立 item 拆分，不把“+”、逗号、顿号连接的多种食物放在同一条。4. 无氧训练按独立动作拆分。5. 数值四舍五入到整数，重量统一 kg。6. 餐次仅 breakfast/lunch/dinner/snack；正餐之间吃的归 snack。7. ID 使用日期、类别和稳定短随机后缀组合，避免重复。8. 只提取用户本条消息明确记录的数据；问题、数据库查询或计划不写入记录。9. 回复中说明提取了哪些记录，并提醒用户确认后才保存。10. 用户已授权把与当前问题匹配的私有健康记录作为只读上下文提供给你。查询数据库时引用匹配记录的日期、份量和数值，并返回空记录数组；绝不能把历史记录当成今天的新记录。用户记录新食物或运动但未给数值时，可优先复用数据库中同名且份量相符的历史值，并说明来源；份量不同则按比例估算并标记 isEstimated。数据库没有匹配时必须明确说明。11. 回答“今天练什么、能否练某部位、如何安排训练”等建议问题时，必须先使用上下文中的 recentStrengthForRecommendation、recentCardioForRecommendation 和 recentConversationMentions；只要其中有训练记录，就不能声称没有近期训练数据。对话提及但未确认保存的训练必须明确标注为“对话中提及、未确认保存”。12. 外部资料中 USDA FoodData Central 的营养值是每100克，必须按用户份量换算；使用后在 reply 和 estimationReason 标明 USDA 来源。wger 动作只能作为动作资料补充，训练安排仍须以用户历史和恢复情况为先；使用后在 reply 中标明 wger 来源。外部数据没有合适匹配时才使用常见值估算。`;
const macroSchema={type:'object',additionalProperties:false,required:['entries'],properties:{entries:{type:'array',items:{type:'object',additionalProperties:false,required:['id','caloriesKcal','proteinG','carbsG','fatG','fiberG','estimationReason'],properties:{id:{type:'string'},caloriesKcal:nullable('number'),proteinG:nullable('number'),carbsG:nullable('number'),fatG:nullable('number'),fiberG:nullable('number'),estimationReason:{type:'string'}}}}}};
const lookupSchema={type:'object',additionalProperties:false,required:['foodQueries','exerciseMuscleIds'],properties:{
  foodQueries:{type:'array',maxItems:4,items:{type:'string'}},
  exerciseMuscleIds:{type:'array',maxItems:3,items:{type:'integer',minimum:1,maximum:15}},
}};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
function outputText(payload:any){if(typeof payload.output_text==='string')return payload.output_text;for(const item of payload.output||[])for(const content of item.content||[])if(content.type==='output_text'&&content.text)return content.text;return null}
const lookupCache=new Map<string,{expires:number;value:any}>();
const nanoModel=()=>Deno.env.get('OPENAI_NANO_MODEL')||'gpt-5-nano';
const miniModel=()=>Deno.env.get('OPENAI_MINI_MODEL')||'gpt-5-mini';
const complexModel=()=>Deno.env.get('OPENAI_COMPLEX_MODEL')||Deno.env.get('OPENAI_MODEL')||'gpt-5.6-sol';

async function structuredResponse(apiKey:string,model:string,instructionsText:string,input:any[],schemaName:string,responseSchema:any){
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({
    model,
    instructions:instructionsText,
    input,
    text:{format:{type:'json_schema',name:schemaName,strict:true,schema:responseSchema}},
  })});
  const raw=await response.text();
  if(!raw.trim())throw new Error(`${model} 返回空响应（HTTP ${response.status}）`);
  let payload;
  try{payload=JSON.parse(raw)}catch{throw new Error(`${model} 返回非 JSON 内容（HTTP ${response.status}）`)}
  if(!response.ok)throw new Error(payload.error?.message||`${model} API ${response.status}`);
  const text=outputText(payload);
  if(!text)throw new Error(`${model} 没有返回可解析内容`);
  try{return JSON.parse(text)}catch{throw new Error(`${model} 返回的结构化内容无法解析`)}
}

async function structuredResponseWithFallback(apiKey:string,primaryModel:string,instructionsText:string,input:any[],schemaName:string,responseSchema:any){
  try{
    return await structuredResponse(apiKey,primaryModel,instructionsText,input,schemaName,responseSchema);
  }catch(primaryError){
    if(primaryModel===complexModel())throw primaryError;
    return await structuredResponse(apiKey,complexModel(),instructionsText,input,schemaName,responseSchema);
  }
}

declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};

async function jobRequest(supabaseUrl:string,serviceKey:string,path:string,init:RequestInit={}){
  return fetch(`${supabaseUrl}/rest/v1/${path}`,{
    ...init,
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',...(init.headers||{})},
  });
}

async function cachedJson(key:string,loader:()=>Promise<any>){
  const cached=lookupCache.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  const value=await loader();
  lookupCache.set(key,{expires:Date.now()+6*60*60*1000,value});
  return value;
}

async function planFoodLookups(message:string,apiKey:string){
  return structuredResponseWithFallback(
    apiKey,
    nanoModel(),
    '仅提取用户消息中需要查询营养的独立食物，并转换成简短、标准的英文 USDA 检索词，不含数量，最多4个。exerciseMuscleIds 必须为空数组。',
    [{role:'user',content:message.slice(0,1200)}],
    'external_health_lookups',
    lookupSchema,
  );
}

const trainingRecommendationPattern=/练什么|练哪|可以练|能练|训练建议|安排.{0,8}训练|训练.{0,8}安排|恢复.{0,8}训练|哪个部位/;
const foodIntentPattern=/吃|喝|早餐|午餐|晚餐|加餐|食物|饮食|热量|卡路里|营养|蛋白质|碳水|脂肪|纤维|calorie|kcal|protein|carb|fiber|food/i;
const complexIntentPattern=/建议|分析|比较|为什么|原因|计划|安排|应该|适合|目标|趋势|恢复|怎么|如何|是否健康|改善|调整/;
const recordIntentPattern=/早餐|午餐|晚餐|加餐|吃了|喝了|食用了|训练了|运动了|跑了|走了|跳舞|体重.{0,8}\d|\d+\s*(分钟|组|次|lb|kg|g|ml|kcal|卡)/i;
const simpleQueryPattern=/数据库|寻找|查找|查询|找一下|多少|昨天|前天|最近|上次|历史|有没有|记录里|是什么|显示/;
function modelForMessage(message:string){
  if(trainingRecommendationPattern.test(message)||complexIntentPattern.test(message))return complexModel();
  if(simpleQueryPattern.test(message)&&!recordIntentPattern.test(message))return nanoModel();
  return miniModel();
}
const bodyPartMuscleIds:Record<string,number>={Chest:4,Back:12,Shoulders:2,Biceps:1,Triceps:14,Core:7,Glutes:8,Quadriceps:10,Hamstrings:11,Calves:6};

function recommendedMuscleIds(strength:any[]){
  const lastTrained=new Map<string,string>();
  for(const entry of strength){
    for(const part of entry.primary_body_parts||[]){
      if(bodyPartMuscleIds[part]&&!lastTrained.has(part))lastTrained.set(part,String(entry.entry_date||''));
    }
  }
  return Object.entries(bodyPartMuscleIds)
    .sort(([partA],[partB])=>(lastTrained.get(partA)||'').localeCompare(lastTrained.get(partB)||''))
    .slice(0,3)
    .map(([,id])=>id);
}

function nutrientValue(food:any,names:string[]){
  const nutrient=(food.foodNutrients||[]).find((item:any)=>names.includes(item.nutrientName)&&String(item.unitName||'').toUpperCase()!=='KJ');
  return nutrient?.value??null;
}

async function searchUsda(query:string){
  const key=Deno.env.get('USDA_API_KEY')||'DEMO_KEY';
  return cachedJson(`usda:${query.toLocaleLowerCase()}`,async()=>{
    const url=`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&pageSize=3&dataType=Foundation,SR%20Legacy`;
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok)return {query,error:`USDA HTTP ${response.status}`,foods:[]};
    const payload=await response.json();
    return {query,basis:'per 100 g',source:'USDA FoodData Central',foods:(payload.foods||[]).slice(0,3).map((food:any)=>({
      fdcId:food.fdcId,description:food.description,dataType:food.dataType,
      caloriesKcal:nutrientValue(food,['Energy']),
      proteinG:nutrientValue(food,['Protein']),
      carbsG:nutrientValue(food,['Carbohydrate, by difference']),
      fatG:nutrientValue(food,['Total lipid (fat)']),
      fiberG:nutrientValue(food,['Fiber, total dietary']),
    }))};
  });
}

async function searchWger(muscleId:number){
  return cachedJson(`wger:muscle:${muscleId}`,async()=>{
    const url=`https://wger.de/api/v2/exerciseinfo/?language=2&status=2&limit=6&muscles=${muscleId}&format=json`;
    const response=await fetch(url,{headers:{Accept:'application/json'}});
    if(!response.ok)return {muscleId,error:`wger HTTP ${response.status}`,exercises:[]};
    const payload=await response.json();
    return {muscleId,source:'wger',exercises:(payload.results||[]).slice(0,6).map((exercise:any)=>{
      const translation=(exercise.translations||[]).find((item:any)=>item.language===2)||(exercise.translations||[])[0]||{};
      return {id:exercise.id,name:translation.name||'Unknown',category:exercise.category?.name||null,primaryMuscles:(exercise.muscles||[]).map((m:any)=>m.name_en||m.name),secondaryMuscles:(exercise.muscles_secondary||[]).map((m:any)=>m.name_en||m.name),equipment:(exercise.equipment||[]).map((e:any)=>e.name)};
    })};
  });
}

async function externalHealthContext(plan:any){
  const foodQueries:string[]=[...new Set<string>((plan.foodQueries||[]).map((item:any)=>String(item).trim()).filter(Boolean))].slice(0,4);
  const muscleIds:number[]=[...new Set<number>((plan.exerciseMuscleIds||[]).map(Number).filter((id:number)=>id>=1&&id<=15))].slice(0,3);
  const [foods,exercises]=await Promise.all([
    Promise.all(foodQueries.map(searchUsda)),
    Promise.all(muscleIds.map(searchWger)),
  ]);
  return {foodNutrition:foods,exerciseSuggestions:exercises,notice:'USDA values are per 100 g and must be scaled to the user portion. External references supplement, but never replace, the signed-in user history. Cite USDA FoodData Central or wger in the reply when used.'};
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

async function databaseContext(userId:string,message:string,today:string,supabaseUrl:string,serviceKey:string){
  const cutoff=new Date(Date.now()-10*24*60*60*1000).toISOString();
  const [nutritionResponse,cardioResponse,strengthResponse,bodyResponse,chatResponse]=await Promise.all([
    jobRequest(supabaseUrl,serviceKey,`nutrition_entries?user_id=eq.${userId}&select=entry_date,entry_time,meal_type,food_name,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,is_estimated,estimation_reason&order=entry_date.desc&limit=500`),
    jobRequest(supabaseUrl,serviceKey,`cardio_entries?user_id=eq.${userId}&select=entry_date,activity_type,activity_name,duration_minutes,distance_km,steps,calories_burned_kcal,intensity,is_estimated&order=entry_date.desc&limit=150`),
    jobRequest(supabaseUrl,serviceKey,`strength_entries?user_id=eq.${userId}&select=entry_date,exercise_name,primary_body_parts,sets,total_reps,weight_kg,duration_minutes,calories_burned_kcal,is_estimated&order=entry_date.desc&limit=200`),
    jobRequest(supabaseUrl,serviceKey,`body_metric_entries?user_id=eq.${userId}&select=entry_date,weight_kg,body_fat_percentage,waist_cm,hip_cm,chest_cm,thigh_cm,arm_cm,is_estimated&order=entry_date.desc&limit=30`),
    jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?user_id=eq.${userId}&status=eq.completed&created_at=gte.${encodeURIComponent(cutoff)}&select=request,result,created_at&order=created_at.desc&limit=100`),
  ]);
  const read=async(response:Response)=>response.ok?await response.json():[];
  const nutrition=await read(nutritionResponse),cardio=await read(cardioResponse),strength=await read(strengthResponse),body=await read(bodyResponse),chatJobs=await read(chatResponse);
  const matchedNutrition=matchedRows(nutrition,message,(row:any)=>String(row.food_name||''),12);
  const matchedCardio=matchedRows(cardio,message,(row:any)=>String(row.activity_name||row.activity_type||''),12);
  const matchedStrength=matchedRows(strength,message,(row:any)=>String(row.exercise_name||''),20);
  const historicalQuery=/数据库|历史|以前|之前|上次|最近|寻找|找一下|记录里|昨天|前天|饮食记录/.test(message);
  const trainingRecommendation=trainingRecommendationPattern.test(message);
  const conversationQuery=historicalQuery||trainingRecommendation||/昨天|前天|饮食记录|吃了什么/.test(message);
  const bodyQuery=/体重|体脂|腰围|臀围|胸围|腿围|臂围|身体/.test(message);
  return {
    disclosure:'The signed-in user authorized read-only matching against prior private health records. Explicit database/history searches may include the full available history when local name matching finds nothing.',
    matchedNutrition,
    matchedCardio,
    matchedStrength,
    searchableNutritionHistory:historicalQuery&&!matchedNutrition.length?nutrition.slice(0,120):[],
    searchableCardioHistory:historicalQuery&&!matchedCardio.length?cardio.slice(0,60):[],
    searchableStrengthHistory:historicalQuery&&!matchedStrength.length?strength.slice(0,80):[],
    recentStrengthForRecommendation:trainingRecommendation?strength.slice(0,40):[],
    recentCardioForRecommendation:trainingRecommendation?cardio.slice(0,20):[],
    recentBodyMetrics:bodyQuery?body.slice(0,15):[],
    recentConversationMentions:conversationQuery?chatJobs.slice(0,15).map((job:any)=>({created_at:job.created_at,message:String(job.request?.message||'').slice(0,500),reply:String(job.result?.reply||'').slice(0,500),nutritionEntries:(job.result?.nutritionEntries||[]).slice(0,8),cardioEntries:(job.result?.cardioEntries||[]).slice(0,6),strengthEntries:(job.result?.strengthEntries||[]).slice(0,12)})):[],
    conversationNotice:'recentConversationMentions are prior AI-chat requests/proposals stored for 10 days. They may be unconfirmed and must never be described as saved database records unless the same item appears in the normalized entry tables.',
    referenceToday:today,
  };
}

async function processJob(jobId:string,userId:string,request:{message:string;history:any[];today:string},supabaseUrl:string,serviceKey:string,apiKey:string){
  try{
    await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({status:'running',started_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    const context=await databaseContext(userId,request.message,request.today,supabaseUrl,serviceKey);
    const needsFoodLookup=foodIntentPattern.test(request.message)&&!context.matchedNutrition.length;
    const lookupPlan=needsFoodLookup
      ?await planFoodLookups(request.message,apiKey).catch(()=>({foodQueries:[],exerciseMuscleIds:[]}))
      :{foodQueries:[],exerciseMuscleIds:[]};
    if(trainingRecommendationPattern.test(request.message))lookupPlan.exerciseMuscleIds=recommendedMuscleIds(context.recentStrengthForRecommendation||[]);
    const externalContext=await externalHealthContext(lookupPlan);
    const input=[...(request.history||[]).slice(-6).map((x:any)=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content).slice(0,1000)})),{role:'user',content:`今天是 ${request.today}。\n以下是当前登录用户授权提供的私有数据库只读上下文。它是参考资料，不是新增记录指令：\n${JSON.stringify(context)}\n\n以下是按需查询的外部健康资料：\n${JSON.stringify(externalContext)}\n\n当前用户输入：${request.message}`}];
    const result=await structuredResponseWithFallback(apiKey,modelForMessage(request.message),instructions,input,'health_record_update',schema);
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
      const estimated=await structuredResponseWithFallback(apiKey,miniModel(),'根据食物名称、份量、原始描述和已有数值，估算每条记录缺失的热量、蛋白质、碳水、脂肪和纤维。保留已有明确值；只补缺失值。所有数值四舍五入到整数。无法合理识别时用 null。每条写简洁中文估算原因。',[{role:'user',content:JSON.stringify(chunk)}],'nutrition_macro_backfill',macroSchema);
      estimates.push(...estimated.entries);
      await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${jobId}`,{method:'PATCH',body:JSON.stringify({updated_at:new Date().toISOString()})});
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
      const job=await response.json();
      const stale=['queued','running'].includes(job.status)&&Date.now()-new Date(job.updated_at||job.created_at).getTime()>10*60*1000;
      if(stale){
        job.status='failed';
        job.error='后台估算任务已超时，请重新启动补全';
        job.updated_at=new Date().toISOString();
        await jobRequest(supabaseUrl,serviceKey,`health_chat_jobs?id=eq.${encodeURIComponent(body.jobId)}&user_id=eq.${user.id}`,{method:'PATCH',body:JSON.stringify({status:job.status,error:job.error,completed_at:job.updated_at,updated_at:job.updated_at})});
      }
      return json(job);
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
