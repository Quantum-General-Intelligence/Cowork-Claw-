import{r as l}from"./index.DiEladB3.js";var u={exports:{}},c={};/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var m;function y(){if(m)return c;m=1;var e=Symbol.for("react.transitional.element"),r=Symbol.for("react.fragment");function i(a,o,s){var d=null;if(s!==void 0&&(d=""+s),o.key!==void 0&&(d=""+o.key),"key"in o){s={};for(var n in o)n!=="key"&&(s[n]=o[n])}else s=o;return o=s.ref,{$$typeof:e,type:a,key:d,ref:o!==void 0?o:null,props:s}}return c.Fragment=r,c.jsx=i,c.jsxs=i,c}var x;function v(){return x||(x=1,u.exports=y()),u.exports}var t=v();/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),k=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(r,i,a)=>a?a.toUpperCase():i.toLowerCase()),h=e=>{const r=k(e);return r.charAt(0).toUpperCase()+r.slice(1)},p=(...e)=>e.filter((r,i,a)=>!!r&&r.trim()!==""&&a.indexOf(r)===i).join(" ").trim(),w=e=>{for(const r in e)if(r.startsWith("aria-")||r==="role"||r==="title")return!0};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var A={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=l.forwardRef(({color:e="currentColor",size:r=24,strokeWidth:i=2,absoluteStrokeWidth:a,className:o="",children:s,iconNode:d,...n},f)=>l.createElement("svg",{ref:f,...A,width:r,height:r,stroke:e,strokeWidth:a?Number(i)*24/Number(r):i,className:p("lucide",o),...!s&&!w(n)&&{"aria-hidden":"true"},...n},[...d.map(([g,b])=>l.createElement(g,b)),...Array.isArray(s)?s:[s]]));/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=(e,r)=>{const i=l.forwardRef(({className:a,...o},s)=>l.createElement(N,{ref:s,iconNode:r,className:p(`lucide-${j(h(e))}`,`lucide-${e}`,a),...o}));return i.displayName=h(e),i};/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],P=C("check",R),E="https://app.cowork-claw.ai",$=[{id:"hobby",name:"Hobby",price:20,interval:"/month",description:"For individual developers and side projects",features:["20 tasks per day","200 sandbox minutes/month","All AI agents","Bring your own key or use ours","Hosted sandbox execution"],cta:"Get Started",highlighted:!1},{id:"pro",name:"Pro",price:75,interval:"/month",description:"For professional developers shipping daily",features:["100 tasks per day","1,500 sandbox minutes/month","All AI agents","Bring your own key or use ours","Hosted sandbox execution","Priority support","Orchestration mode"],cta:"Get Pro",highlighted:!0},{id:"business",name:"Business",price:40,interval:"/user/month",minSeats:3,description:"For teams that build together (min. 3 users)",features:["200 tasks per day per user","3,000 sandbox minutes/month","All AI agents","Bring your own key or use ours","Hosted sandbox execution","Team workspaces","Priority support","Usage analytics"],cta:"Get Business",highlighted:!1}];function _(){return t.jsx("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto",children:$.map(e=>t.jsxs("div",{className:`relative flex flex-col rounded-xl border bg-card text-card-foreground ${e.highlighted?"border-primary shadow-lg shadow-primary/10 scale-[1.02]":"border-border"}`,children:[e.highlighted&&t.jsx("div",{className:"absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full",children:"Most Popular"}),t.jsxs("div",{className:"p-6 pb-4",children:[t.jsx("h3",{className:"text-lg font-semibold",children:e.name}),t.jsx("p",{className:"text-sm text-muted-foreground mt-1",children:e.description}),t.jsxs("div",{className:"mt-4",children:[t.jsxs("span",{className:"text-3xl font-bold",children:["$",e.price]}),t.jsx("span",{className:"text-sm text-muted-foreground ml-1",children:e.interval})]}),"minSeats"in e&&typeof e.minSeats=="number"&&e.minSeats>1&&t.jsxs("p",{className:"text-xs text-muted-foreground mt-1",children:["Starts at $",e.price*e.minSeats,"/month for ",e.minSeats," users"]})]}),t.jsxs("div",{className:"px-6 pb-6 flex-1 flex flex-col",children:[t.jsx("ul",{className:"space-y-2.5 flex-1 mb-6",children:e.features.map(r=>t.jsxs("li",{className:"flex items-start gap-2 text-sm",children:[t.jsx(P,{className:"h-4 w-4 text-primary mt-0.5 shrink-0"}),t.jsx("span",{children:r})]},r))}),t.jsx("a",{href:`${E}/api/auth/signin/github?next=/subscribe?plan=${e.id}`,className:`w-full inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 ${e.highlighted?"bg-primary text-primary-foreground shadow-sm":"border border-border bg-background text-foreground"}`,children:e.cta})]})]},e.id))})}export{_ as default};
