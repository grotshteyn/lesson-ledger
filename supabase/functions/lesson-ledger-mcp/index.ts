// E8 phase 1: deliberately anonymous and synthetic only.
const tools=[{name:"connection_test",description:"Check Lesson Ledger MCP connectivity. Returns synthetic status only.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},_meta:{securitySchemes:[{type:"noauth"}]},securitySchemes:[{type:"noauth"}]}];
const reply=(id:unknown,result:unknown)=>Response.json({jsonrpc:"2.0",id,result});
const error=(id:unknown,code:number,message:string)=>Response.json({jsonrpc:"2.0",id,error:{code,message}});
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin");
 if(origin && origin!=="https://chatgpt.com" && origin!=="https://claude.ai") return new Response("Forbidden origin",{status:403});
 if(req.method!=="POST") return new Response(null,{status:405,headers:{Allow:"POST"}});
 let m;try {const body=await req.text();if(body.length>65536)return new Response(null,{status:413});m=JSON.parse(body);}catch{return error(null,-32700,"Parse error");}
 if(!m||m.jsonrpc!=="2.0"||typeof m.method!=="string")return error(null,-32600,"Invalid request");
 if(m.id===undefined)return new Response(null,{status:202});
 switch(m.method){
 case "initialize":return reply(m.id,{protocolVersion:["2025-03-26","2025-06-18","2025-11-25"].includes(m.params?.protocolVersion)?m.params.protocolVersion:"2025-03-26",capabilities:{tools:{listChanged:false}},serverInfo:{name:"lesson-ledger-prototype",version:"0.1.0"}});
 case "ping":return reply(m.id,{});
 case "tools/list":return reply(m.id,{tools});
 case "tools/call":if(m.params?.name==="connection_test")return reply(m.id,{content:[{type:"text",text:JSON.stringify({status:"ok",service:"Lesson Ledger",mode:"synthetic",personal_data:false})}]});return error(m.id,-32602,"Unknown tool");
 default:return error(m.id,-32601,"Method not found");
 }
});