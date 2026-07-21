import http from 'node:http';
import fs from 'node:fs';

function loadEnv(){if(!fs.existsSync('.env'))return;for(const line of fs.readFileSync('.env','utf8').split(/\r?\n/)){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'')}}
loadEnv();
const port=Number(process.env.HEALTH_API_PORT||8787);
const nullable=type=>({anyOf:[{type},{type:'null'}]});
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
function outputText(json){if(typeof json.output_text==='string')return json.output_text;for(const item of json.output||[])for(const content of item.content||[])if(content.type==='output_text'&&content.text)return content.text;return null}
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
const server=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/api/health')return send(res,200,{ok:true,configured:Boolean(process.env.OPENAI_API_KEY),model:process.env.OPENAI_MODEL||'gpt-5.6-sol'});
  if(req.method!=='POST'||req.url!=='/api/health-chat')return send(res,404,{error:'Not found'});
  if(!process.env.OPENAI_API_KEY)return send(res,503,{error:'请先在 .env 中设置 OPENAI_API_KEY'});
  try{
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw new Error('请求内容过长')}
    const {message,history=[],today}=JSON.parse(raw);if(typeof message!=='string'||!message.trim())return send(res,400,{error:'请输入健康记录'});
    const input=[...history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content).slice(0,2000)})),{role:'user',content:`今天是 ${today}。用户输入：${message}`}];
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-sol',instructions,input,text:{format:{type:'json_schema',name:'health_record_update',strict:true,schema}}})});
    const responseText=await response.text();if(!responseText.trim())throw new Error(`OpenAI API 返回空响应（HTTP ${response.status}）`);
    let json;try{json=JSON.parse(responseText)}catch{throw new Error(`OpenAI API 返回非 JSON 内容（HTTP ${response.status}）`)}if(!response.ok)throw new Error(json.error?.message||`OpenAI API ${response.status}`);
    const text=outputText(json);if(!text)throw new Error('模型没有返回可解析内容');
    send(res,200,JSON.parse(text));
  }catch(error){send(res,500,{error:error instanceof Error?error.message:'请求失败'})}
});
server.listen(port,'127.0.0.1',()=>console.log(`Health AI API: http://127.0.0.1:${port}`));
