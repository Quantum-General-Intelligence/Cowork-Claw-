import{j as r}from"./jsx-runtime.D_zvdyIk.js";import{r as i}from"./index.DiEladB3.js";/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),f=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,s,a)=>a?a.toUpperCase():s.toLowerCase()),d=e=>{const t=f(e);return t.charAt(0).toUpperCase()+t.slice(1)},l=(...e)=>e.filter((t,s,a)=>!!t&&t.trim()!==""&&a.indexOf(t)===s).join(" ").trim(),g=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var b={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=i.forwardRef(({color:e="currentColor",size:t=24,strokeWidth:s=2,absoluteStrokeWidth:a,className:n="",children:o,iconNode:m,...c},h)=>i.createElement("svg",{ref:h,...b,width:t,height:t,stroke:e,strokeWidth:a?Number(s)*24/Number(t):s,className:l("lucide",n),...!o&&!g(c)&&{"aria-hidden":"true"},...c},[...m.map(([u,p])=>i.createElement(u,p)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=(e,t)=>{const s=i.forwardRef(({className:a,...n},o)=>i.createElement(y,{ref:o,iconNode:t,className:l(`lucide-${x(d(e))}`,`lucide-${e}`,a),...n}));return s.displayName=d(e),s};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],j=k("check",w),A="https://app.cowork-claw.ai",C=[{id:"hobby",name:"Hobby",price:19,interval:"/month",description:"For founders getting started with AI cowork",features:["5 tasks per day","BYO Anthropic key","30 min max per task","1 concurrent task","All 10 cowork templates"],cta:"Get Started",highlighted:!1},{id:"pro",name:"Pro",price:49,interval:"/month",description:"For founders shipping daily with their AI team",features:["50 tasks per day","BYO Anthropic key","2 hour max per task","2 concurrent tasks","All 10 cowork templates","Priority queue"],cta:"Get Pro",highlighted:!0},{id:"studio",name:"Studio",price:129,interval:"/month",description:"For teams that cowork together",features:["100 tasks per day","BYO Anthropic key","3 hour max per task","3 concurrent tasks","3 team seats","Shared task feed","Team templates"],cta:"Get Studio",highlighted:!1},{id:"whitelabel",name:"White-Label",price:399,interval:"/month",description:"Your brand, your AI team platform",features:["Unlimited seats","Custom branding & domain","5 concurrent tasks","All templates","Priority support"],cta:"Contact Us",highlighted:!1}];function P(){return r.jsx("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto",children:C.map(e=>r.jsxs("div",{className:`relative flex flex-col rounded-xl border bg-card text-card-foreground ${e.highlighted?"border-primary shadow-lg shadow-primary/10 scale-[1.02]":"border-border"}`,children:[e.highlighted&&r.jsx("div",{className:"absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full",children:"Most Popular"}),r.jsxs("div",{className:"p-6 pb-4",children:[r.jsx("h3",{className:"text-lg font-semibold",children:e.name}),r.jsx("p",{className:"text-sm text-muted-foreground mt-1",children:e.description}),r.jsxs("div",{className:"mt-4",children:[r.jsxs("span",{className:"text-3xl font-bold",children:["$",e.price]}),r.jsx("span",{className:"text-sm text-muted-foreground ml-1",children:e.interval})]}),"minSeats"in e&&typeof e.minSeats=="number"&&e.minSeats>1&&r.jsxs("p",{className:"text-xs text-muted-foreground mt-1",children:["Starts at $",e.price*e.minSeats,"/month for ",e.minSeats," users"]})]}),r.jsxs("div",{className:"px-6 pb-6 flex-1 flex flex-col",children:[r.jsx("ul",{className:"space-y-2.5 flex-1 mb-6",children:e.features.map(t=>r.jsxs("li",{className:"flex items-start gap-2 text-sm",children:[r.jsx(j,{className:"h-4 w-4 text-primary mt-0.5 shrink-0"}),r.jsx("span",{children:t})]},t))}),r.jsx("a",{href:`${A}/auth?next=${encodeURIComponent(`/subscribe?plan=${e.id}`)}`,className:`w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${e.highlighted?"bg-primary text-primary-foreground shadow-sm":"border border-border bg-background text-foreground"}`,children:e.cta})]})]},e.id))})}export{P as default};
