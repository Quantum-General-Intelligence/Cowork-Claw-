import{j as r}from"./jsx-runtime.D_zvdyIk.js";import{r as i}from"./index.DiEladB3.js";/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),g=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,s,o)=>o?o.toUpperCase():s.toLowerCase()),c=e=>{const t=g(e);return t.charAt(0).toUpperCase()+t.slice(1)},l=(...e)=>e.filter((t,s,o)=>!!t&&t.trim()!==""&&o.indexOf(t)===s).join(" ").trim(),f=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var b={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=i.forwardRef(({color:e="currentColor",size:t=24,strokeWidth:s=2,absoluteStrokeWidth:o,className:n="",children:a,iconNode:m,...d},u)=>i.createElement("svg",{ref:u,...b,width:t,height:t,stroke:e,strokeWidth:o?Number(s)*24/Number(t):s,className:l("lucide",n),...!a&&!f(d)&&{"aria-hidden":"true"},...d},[...m.map(([h,x])=>i.createElement(h,x)),...Array.isArray(a)?a:[a]]));/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=(e,t)=>{const s=i.forwardRef(({className:o,...n},a)=>i.createElement(y,{ref:a,iconNode:t,className:l(`lucide-${p(c(e))}`,`lucide-${e}`,o),...n}));return s.displayName=c(e),s};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],v=w("check",j),k="https://app.cowork-claw.ai",N=[{id:"hobby",name:"Hobby",price:20,interval:"/month",description:"For individual developers and side projects",features:["20 tasks per day","200 sandbox minutes/month","All AI agents","Bring your own key or use ours","Hosted sandbox execution"],cta:"Get Started",highlighted:!1},{id:"pro",name:"Pro",price:75,interval:"/month",description:"For professional developers shipping daily",features:["100 tasks per day","1,500 sandbox minutes/month","All AI agents","Bring your own key or use ours","Hosted sandbox execution","Priority support","Orchestration mode"],cta:"Get Pro",highlighted:!0},{id:"business",name:"Business",price:40,interval:"/user/month",minSeats:3,description:"For teams that build together (min. 3 users)",features:["200 tasks per day per user","3,000 sandbox minutes/month","All AI agents","Bring your own key or use ours","Hosted sandbox execution","Team workspaces","Priority support","Usage analytics"],cta:"Get Business",highlighted:!1}];function P(){return r.jsx("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto",children:N.map(e=>r.jsxs("div",{className:`relative flex flex-col rounded-xl border bg-card text-card-foreground ${e.highlighted?"border-primary shadow-lg shadow-primary/10 scale-[1.02]":"border-border"}`,children:[e.highlighted&&r.jsx("div",{className:"absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full",children:"Most Popular"}),r.jsxs("div",{className:"p-6 pb-4",children:[r.jsx("h3",{className:"text-lg font-semibold",children:e.name}),r.jsx("p",{className:"text-sm text-muted-foreground mt-1",children:e.description}),r.jsxs("div",{className:"mt-4",children:[r.jsxs("span",{className:"text-3xl font-bold",children:["$",e.price]}),r.jsx("span",{className:"text-sm text-muted-foreground ml-1",children:e.interval})]}),"minSeats"in e&&typeof e.minSeats=="number"&&e.minSeats>1&&r.jsxs("p",{className:"text-xs text-muted-foreground mt-1",children:["Starts at $",e.price*e.minSeats,"/month for ",e.minSeats," users"]})]}),r.jsxs("div",{className:"px-6 pb-6 flex-1 flex flex-col",children:[r.jsx("ul",{className:"space-y-2.5 flex-1 mb-6",children:e.features.map(t=>r.jsxs("li",{className:"flex items-start gap-2 text-sm",children:[r.jsx(v,{className:"h-4 w-4 text-primary mt-0.5 shrink-0"}),r.jsx("span",{children:t})]},t))}),r.jsx("a",{href:`${k}/api/auth/signin/github?next=/subscribe?plan=${e.id}`,className:`w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${e.highlighted?"bg-primary text-primary-foreground shadow-sm":"border border-border bg-background text-foreground"}`,children:e.cta})]})]},e.id))})}export{P as default};
